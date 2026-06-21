import { Bot, type Context } from "grammy";
import { ProjectStore } from "./state.js";
import { ConversationStore } from "./conversation.js";
import { consult } from "./consult.js";
import { runBuild } from "./pipeline/build.js";
import { runAmend } from "./pipeline/amend.js";
import type { Services } from "./services/types.js";

const WELCOME = [
  "👋 Hi! I'm Hermes — I design, build, and deploy websites for you.",
  "",
  "Tell me what you have in mind — you can send text, links, images, voice notes,",
  "or videos. I'll ask a few quick questions, then build you a live preview. You can",
  "refine it in plain English, and say “publish” when you're happy.",
  "",
  "Commands: /new (start over) · /undo (revert last change) · publish (go live)",
].join("\n");

export function makeBot(token: string, svc: Services): Bot {
  const bot = new Bot(token);
  const store = new ProjectStore();
  const convo = new ConversationStore();

  async function doPublish(ctx: Context): Promise<unknown> {
    const active = store.getActive(ctx.chat!.id);
    if (!active?.repo || !active.deployId) {
      return ctx.reply("No active preview to publish yet — let's design one first.");
    }
    await svc.vercel.promoteToProduction(active.deployId);
    return ctx.reply("Published to production ✅");
  }

  async function doUndo(ctx: Context): Promise<unknown> {
    const prev = store.popCommit(ctx.chat!.id);
    return ctx.reply(prev ? "Reverted to the previous version." : "Nothing to undo yet.");
  }

  /** Download any Telegram file by id as a Buffer (works up to ~20MB). */
  async function fetchFile(ctx: Context, fileId: string): Promise<Buffer> {
    const file = await ctx.api.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const res = await fetch(url);
    return Buffer.from(await res.arrayBuffer());
  }

  /** Shared path for any user utterance (from text, caption, or transcription). */
  async function handleUtterance(ctx: Context, text: string): Promise<unknown> {
    const chatId = ctx.chat!.id;
    const lower = text.toLowerCase();
    const active = store.getActive(chatId);

    if (lower === "publish") return doPublish(ctx);
    if (lower === "undo" || lower === "go back") return doUndo(ctx);

    // A built project is active → treat the message as an amendment
    if (active?.repo) {
      await ctx.reply("Applying your change… ⏳");
      try {
        const r = await runAmend(svc, active.repo, active.files ?? {}, text);
        store.setActive(chatId, {
          ...active,
          files: r.files,
          previewUrl: r.previewUrl,
          deployId: r.deployId,
        });
        store.pushCommit(chatId, r.sha);
        return ctx.reply(`Updated preview: ${r.previewUrl}`);
      } catch (e) {
        return ctx.reply(`Couldn't apply that change: ${(e as Error).message}`);
      }
    }

    // Consultation phase — talk it through, then build
    const imgCount = convo.getImages(chatId).length;
    const note = imgCount ? ` [User has attached ${imgCount} reference image(s).]` : "";
    convo.append(chatId, { role: "user", content: text + note });
    let result;
    try {
      result = await consult(svc.glm, convo.get(chatId));
    } catch (e) {
      return ctx.reply(`Sorry, I had trouble thinking that through: ${(e as Error).message}`);
    }

    if (result.kind === "question") {
      convo.append(chatId, { role: "assistant", content: result.text });
      return ctx.reply(result.text);
    }

    // Brief ready → build, using any reference images gathered
    const repo = `site-${chatId}-${ctx.message?.message_id ?? Date.now()}`;
    const images = convo.getImages(chatId);
    await ctx.reply(
      `Perfect — I've got what I need${images.length ? ` (and ${images.length} reference image(s))` : ""}. ` +
        `Building your site now… this takes a minute. ⏳`,
    );
    try {
      const r = await runBuild(svc, repo, result.brief, images);
      store.setActive(chatId, {
        repo,
        previewUrl: r.previewUrl,
        deployId: r.deployId,
        files: r.files,
        history: [],
      });
      convo.reset(chatId);
      if (r.outcome.status === "ok") {
        return ctx.reply(
          `Preview ready: ${r.previewUrl}\n\n` +
            `Want changes? Just tell me. Say "publish" when you're happy.`,
        );
      }
      return ctx.reply(
        `The build keeps failing, so I stopped instead of shipping something broken.\n\n` +
          `Last error:\n${r.outcome.lastLog.slice(0, 500)}\n\nWant me to keep trying?`,
      );
    } catch (e) {
      return ctx.reply(`Something went wrong while building: ${(e as Error).message}`);
    }
  }

  /** Store an image as a reference and act on its caption (if any). */
  async function handleImage(ctx: Context, fileId: string): Promise<unknown> {
    const chatId = ctx.chat!.id;
    try {
      const buf = await fetchFile(ctx, fileId);
      convo.addImage(chatId, buf.toString("base64"));
    } catch {
      return ctx.reply("I couldn't read that image — mind resending it?");
    }
    const caption = ctx.message?.caption?.trim() ?? "";
    if (!caption) {
      return ctx.reply("📎 Got your image. Send more, or tell me what you'd like me to build.");
    }
    return handleUtterance(ctx, caption);
  }

  /** Transcribe audio/video and route the words (plus any caption). */
  async function handleMedia(
    ctx: Context,
    fileId: string,
    filename: string,
    listening: string,
  ): Promise<unknown> {
    await ctx.reply(listening);
    let transcript = "";
    try {
      const buf = await fetchFile(ctx, fileId);
      transcript = (await svc.openai.transcribe(buf, filename)).trim();
    } catch (e) {
      return ctx.reply(`Couldn't process that: ${(e as Error).message}`);
    }
    const caption = ctx.message?.caption?.trim() ?? "";
    const combined = [caption, transcript].filter(Boolean).join(". ");
    if (!combined) {
      return ctx.reply("Got it 👍 — but I couldn't make out any words. Mind adding a note?");
    }
    return handleUtterance(ctx, combined);
  }

  bot.command(["start", "help"], (ctx) => ctx.reply(WELCOME));

  bot.command("new", (ctx) => {
    store.setActive(ctx.chat.id, { repo: "", previewUrl: "", history: [] });
    convo.reset(ctx.chat.id);
    return ctx.reply("Fresh start! What kind of website are you looking to build?");
  });

  bot.command("publish", (ctx) => doPublish(ctx));
  bot.command("undo", (ctx) => doUndo(ctx));

  // Text & links (links arrive as text)
  bot.on("message:text", (ctx) => handleUtterance(ctx, ctx.message.text.trim()));

  // Photos
  bot.on("message:photo", (ctx) => {
    const photos = ctx.message.photo;
    return handleImage(ctx, photos[photos.length - 1].file_id);
  });

  // Voice notes & audio files → transcribe
  bot.on("message:voice", (ctx) =>
    handleMedia(ctx, ctx.message.voice.file_id, "audio.ogg", "🎧 Listening…"),
  );
  bot.on("message:audio", (ctx) =>
    handleMedia(ctx, ctx.message.audio.file_id, "audio.mp3", "🎧 Listening…"),
  );

  // Videos & round video notes → transcribe the audio
  bot.on("message:video", (ctx) =>
    handleMedia(ctx, ctx.message.video.file_id, "video.mp4", "🎬 Watching & listening…"),
  );
  bot.on("message:video_note", (ctx) =>
    handleMedia(ctx, ctx.message.video_note.file_id, "video.mp4", "🎬 Watching & listening…"),
  );

  // Documents: treat image files as references; otherwise say what's supported
  bot.on("message:document", (ctx) => {
    const doc = ctx.message.document;
    if ((doc.mime_type ?? "").startsWith("image/")) {
      return handleImage(ctx, doc.file_id);
    }
    return ctx.reply(
      "I can work with text, links, images, voice notes, and videos — that file type isn't supported yet.",
    );
  });

  // Catch-all so the bot never stays silent (stickers, locations, etc.)
  bot.on("message", (ctx) =>
    ctx.reply("I can take text, links, images, voice notes, and videos — try one of those 🙂"),
  );

  return bot;
}
