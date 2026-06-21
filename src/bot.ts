import { Bot, type Context } from "grammy";
import { ProjectStore } from "./state.js";
import { ConversationStore } from "./conversation.js";
import { runAgent } from "./agent/loop.js";
import { TOOLS, makeExecutors } from "./agent/tools.js";
import { AGENT_SYSTEM, stateNote } from "./agent/system.js";
import type { Services } from "./services/types.js";

const WELCOME = [
  "👋 Hi! I'm Hermes — I design, build, and deploy websites for you.",
  "",
  "Tell me what you have in mind — you can send text, links, images, voice notes,",
  "or videos. I can also research links you share. I'll ask a few quick questions,",
  "then build you a live preview. Refine it in plain English, and say “publish” to go live.",
  "",
  "Commands: /new (start over) · /undo (revert last change) · publish (go live)",
].join("\n");

const TOOL_STATUS: Record<string, string> = {
  run_bash: "⚙️ Running a command…",
  write_file: "📝 Writing a file…",
  read_file: "📖 Reading a file…",
  list_files: "📂 Looking at the files…",
  build_website: "🛠️ Designing & building your site… (~a minute)",
  edit_website: "✏️ Applying your change…",
  publish_website: "🚀 Publishing…",
};

export function makeBot(token: string, svc: Services): Bot {
  const bot = new Bot(token);
  const store = new ProjectStore();
  const convo = new ConversationStore();

  async function doUndo(ctx: Context): Promise<unknown> {
    const prev = store.popCommit(ctx.chat!.id);
    return ctx.reply(prev ? "Reverted to the previous version." : "Nothing to undo yet.");
  }

  /** Download the largest size of any Telegram file by id as a Buffer. */
  async function fetchFile(ctx: Context, fileId: string): Promise<Buffer> {
    const file = await ctx.api.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const res = await fetch(url);
    return Buffer.from(await res.arrayBuffer());
  }

  /** Run the agent over the conversation and reply with its answer. */
  async function handleUtterance(ctx: Context, text: string): Promise<unknown> {
    const chatId = ctx.chat!.id;
    if (text.toLowerCase() === "undo" || text.toLowerCase() === "go back") return doUndo(ctx);

    const imgCount = convo.imageCount(chatId);
    const note = imgCount ? ` [User has attached ${imgCount} image(s).]` : "";
    convo.append(chatId, { role: "user", content: text + note });

    const active = store.getActive(chatId);
    const messages = [
      { role: "system" as const, content: `${AGENT_SYSTEM}\n\n${stateNote(active)}` },
      ...convo.get(chatId).map((t) => ({ role: t.role, content: t.content })),
    ];
    const executors = makeExecutors({
      svc,
      store,
      convo,
      chatId,
      messageId: ctx.message?.message_id ?? 0,
    });

    let reply: string;
    try {
      reply = await runAgent(svc.glm, TOOLS, executors, messages, {
        onTool: (name) => {
          const status = TOOL_STATUS[name];
          if (status) ctx.reply(status).catch(() => {});
        },
      });
    } catch (e) {
      return ctx.reply(`Sorry, I hit a snag: ${(e as Error).message}`);
    }

    convo.append(chatId, { role: "assistant", content: reply });
    return ctx.reply(reply || "…");
  }

  /** Store an image reference, then let the agent ask what it's for. */
  async function handleImage(ctx: Context, fileId: string): Promise<unknown> {
    const chatId = ctx.chat!.id;
    try {
      const buf = await fetchFile(ctx, fileId);
      convo.addEmbed(chatId, buf.toString("base64"));
    } catch {
      return ctx.reply("I couldn't read that image — mind resending it?");
    }
    const caption = ctx.message?.caption?.trim();
    return handleUtterance(ctx, caption || "(I've sent you an image.)");
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
    if (!combined) return ctx.reply("Got it 👍 — but I couldn't make out any words. Mind adding a note?");
    return handleUtterance(ctx, combined);
  }

  bot.command(["start", "help"], (ctx) => ctx.reply(WELCOME));
  bot.command("new", (ctx) => {
    store.setActive(ctx.chat.id, { repo: "", previewUrl: "", history: [] });
    convo.reset(ctx.chat.id);
    return ctx.reply("Fresh start! What kind of website are you looking to build?");
  });
  bot.command("undo", (ctx) => doUndo(ctx));

  bot.on("message:text", (ctx) => handleUtterance(ctx, ctx.message.text.trim()));

  bot.on("message:photo", (ctx) => {
    const photos = ctx.message.photo;
    return handleImage(ctx, photos[photos.length - 1].file_id);
  });

  bot.on("message:voice", (ctx) =>
    handleMedia(ctx, ctx.message.voice.file_id, "audio.ogg", "🎧 Listening…"),
  );
  bot.on("message:audio", (ctx) =>
    handleMedia(ctx, ctx.message.audio.file_id, "audio.mp3", "🎧 Listening…"),
  );
  bot.on("message:video", (ctx) =>
    handleMedia(ctx, ctx.message.video.file_id, "video.mp4", "🎬 Watching & listening…"),
  );
  bot.on("message:video_note", (ctx) =>
    handleMedia(ctx, ctx.message.video_note.file_id, "video.mp4", "🎬 Watching & listening…"),
  );

  bot.on("message:document", (ctx) => {
    const doc = ctx.message.document;
    if ((doc.mime_type ?? "").startsWith("image/")) return handleImage(ctx, doc.file_id);
    return ctx.reply(
      "I can work with text, links, images, voice notes, and videos — that file type isn't supported yet.",
    );
  });

  bot.on("message", (ctx) =>
    ctx.reply("I can take text, links, images, voice notes, and videos — try one of those 🙂"),
  );

  // Never crash the process on a per-update error; log and keep polling.
  bot.catch((err) => console.error("[bot] update error:", err.error));

  return bot;
}
