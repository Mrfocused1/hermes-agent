import { loadConfig } from "./config.js";
import { makeOpenAIService } from "./services/openai.js";
import { makeGlmService } from "./services/glm.js";
import { makeGithubService } from "./services/github.js";
import { makeVercelService } from "./services/vercel.js";
import { makeShellService } from "./services/shell.js";
import { makeBot } from "./bot.js";
import type { Services } from "./services/types.js";

const cfg = loadConfig(process.env);

const svc: Services = {
  openai: makeOpenAIService(cfg.openaiApiKey),
  glm: makeGlmService(cfg.glmApiKey, cfg.glmBaseUrl, process.env.GLM_MODEL ?? "glm-5.2"),
  github: makeGithubService(cfg.githubToken, cfg.githubOwner),
  vercel: makeVercelService(cfg.vercelToken),
  shell: makeShellService(process.env.WORKSPACE_DIR ?? "/tmp/hermes-workspaces"),
  owner: cfg.githubOwner,
};

const bot = makeBot(cfg.telegramBotToken, svc);

// Polling can fail with a 409 ("two instances") during a redeploy overlap.
// Instead of crashing the process (which then cold-restarts), wait and retry
// until the old instance is gone — self-healing, no downtime loop.
async function startBot(): Promise<void> {
  try {
    await bot.start({ drop_pending_updates: true, onStart: () => console.log("Hermes is running.") });
  } catch (e) {
    console.error("[bot] polling stopped, retrying in 6s:", (e as Error).message);
    setTimeout(startBot, 6000);
  }
}
startBot();
