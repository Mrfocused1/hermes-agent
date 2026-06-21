import { Bot } from "grammy";
import { ProjectStore } from "./state.js";
import { runBuild } from "./pipeline/build.js";
import { runAmend } from "./pipeline/amend.js";
import type { Services } from "./services/types.js";

export function makeBot(token: string, svc: Services): Bot {
  const bot = new Bot(token);
  const store = new ProjectStore();

  bot.command("new", (ctx) => {
    store.setActive(ctx.chat.id, { repo: "", previewUrl: "", history: [] });
    return ctx.reply("New project started. Send me a brief (and reference images).");
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();
    const lower = text.toLowerCase();
    const active = store.getActive(chatId);

    // Publish current preview to production
    if (lower === "publish" || lower === "/publish") {
      if (!active?.repo || !active.deployId) {
        return ctx.reply("No active preview to publish yet.");
      }
      await svc.vercel.promoteToProduction(active.deployId);
      return ctx.reply("Published to production ✅");
    }

    // Roll back the last change
    if (lower === "undo" || lower === "go back" || lower === "/undo") {
      const prev = store.popCommit(chatId);
      return ctx.reply(prev ? "Reverted to the previous version." : "Nothing to undo yet.");
    }

    // First brief for a fresh project → run the full build
    if (!active?.repo) {
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
            `Last error:\n${r.outcome.lastLog.slice(0, 500)}\n\n` +
            `Want me to keep trying?`,
        );
      } catch (e) {
        return ctx.reply(`Something went wrong while building: ${(e as Error).message}`);
      }
    }

    // Otherwise treat the message as an amendment
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
