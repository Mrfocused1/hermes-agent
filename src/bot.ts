import { Bot, type Context } from "grammy";
import { ProjectStore } from "./state.js";
import { runBuild } from "./pipeline/build.js";
import { runAmend } from "./pipeline/amend.js";
import type { Services } from "./services/types.js";

const WELCOME = [
  "👋 Hi! I'm Hermes — I build and deploy websites for you.",
  "",
  "To start, just describe the site you want. For example:",
  "",
  "  “dark modern landing page for my fitness coaching, bold headline”",
  "",
  "I'll design it, build it with animations, and send you a preview link.",
  "Then you can ask for changes in plain English, and say “publish” when you're happy.",
  "",
  "Commands: /new (start over) · /undo (revert last change) · publish (go live)",
].join("\n");

// Short / conversational messages that should NOT trigger a full build.
const GREETINGS = new Set([
  "hi", "hello", "hey", "yo", "hiya", "sup", "hello!", "hi!",
  "start", "help", "test", "testing", "ok", "okay", "thanks", "thank you",
]);

/** A first message is only treated as a build brief if it actually looks like one. */
function looksLikeBrief(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false; // too short to be a real description
  if (GREETINGS.has(t.toLowerCase())) return false;
  return true;
}

export function makeBot(token: string, svc: Services): Bot {
  const bot = new Bot(token);
  const store = new ProjectStore();

  async function doPublish(ctx: Context): Promise<unknown> {
    const active = store.getActive(ctx.chat!.id);
    if (!active?.repo || !active.deployId) {
      return ctx.reply("No active preview to publish yet. Describe a site first.");
    }
    await svc.vercel.promoteToProduction(active.deployId);
    return ctx.reply("Published to production ✅");
  }

  async function doUndo(ctx: Context): Promise<unknown> {
    const prev = store.popCommit(ctx.chat!.id);
    return ctx.reply(prev ? "Reverted to the previous version." : "Nothing to undo yet.");
  }

  bot.command(["start", "help"], (ctx) => ctx.reply(WELCOME));

  bot.command("new", (ctx) => {
    store.setActive(ctx.chat.id, { repo: "", previewUrl: "", history: [] });
    return ctx.reply("New project started. Describe the site you'd like.");
  });

  bot.command("publish", (ctx) => doPublish(ctx));
  bot.command("undo", (ctx) => doUndo(ctx));

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    const lower = text.toLowerCase();
    const active = store.getActive(chatId);

    // Plain-word shortcuts (no slash needed)
    if (lower === "publish") return doPublish(ctx);
    if (lower === "undo" || lower === "go back") return doUndo(ctx);

    // No active project yet
    if (!active?.repo) {
      // Greetings / short messages → guide instead of building
      if (!looksLikeBrief(text)) return ctx.reply(WELCOME);

      const repo = `site-${chatId}-${ctx.message.message_id}`;
      await ctx.reply("Building your site… this takes a minute. ⏳");
      try {
        const r = await runBuild(svc, repo, text);
        store.setActive(chatId, {
          repo,
          previewUrl: r.previewUrl,
          deployId: r.deployId,
          files: r.files,
          history: [],
        });
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

    // Active project → treat the message as an amendment
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
  });

  return bot;
}
