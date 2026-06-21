import { loadConfig } from "./config.js";
import { makeOpenAIService } from "./services/openai.js";
import { makeGlmService } from "./services/glm.js";
import { makeGithubService } from "./services/github.js";
import { makeVercelService } from "./services/vercel.js";
import { makeResearchService } from "./services/research.js";
import { makeBrowserService } from "./services/browser.js";
import { makeBot } from "./bot.js";
import type { Services } from "./services/types.js";

const cfg = loadConfig(process.env);

const svc: Services = {
  openai: makeOpenAIService(cfg.openaiApiKey),
  glm: makeGlmService(cfg.glmApiKey, cfg.glmBaseUrl),
  github: makeGithubService(cfg.githubToken, cfg.githubOwner),
  vercel: makeVercelService(cfg.vercelToken),
  research: makeResearchService(cfg.searchApiKey),
  browser: makeBrowserService(),
  owner: cfg.githubOwner,
};

const bot = makeBot(cfg.telegramBotToken, svc);
bot.start();
console.log("Hermes is running.");
