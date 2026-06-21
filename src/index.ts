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
  glm: makeGlmService(cfg.glmApiKey, cfg.glmBaseUrl),
  github: makeGithubService(cfg.githubToken, cfg.githubOwner),
  vercel: makeVercelService(cfg.vercelToken),
  shell: makeShellService(process.env.WORKSPACE_DIR ?? "/tmp/hermes-workspaces"),
  owner: cfg.githubOwner,
};

const bot = makeBot(cfg.telegramBotToken, svc);
// drop_pending_updates clears any backlog so a redeploy doesn't reprocess old messages.
bot.start({ drop_pending_updates: true, onStart: () => console.log("Hermes is running.") });
