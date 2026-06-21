export interface Config {
  telegramBotToken: string;
  openaiApiKey: string;
  glmApiKey: string;
  glmBaseUrl: string;
  githubToken: string;
  githubOwner: string;
  vercelToken: string;
  /** Optional: enables the web_search skill (Tavily). */
  searchApiKey?: string;
}

const REQUIRED = [
  "TELEGRAM_BOT_TOKEN",
  "OPENAI_API_KEY",
  "GLM_API_KEY",
  "GLM_BASE_URL",
  "GITHUB_TOKEN",
  "GITHUB_OWNER",
  "VERCEL_TOKEN",
] as const;

export function loadConfig(env: Record<string, string | undefined>): Config {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN!,
    openaiApiKey: env.OPENAI_API_KEY!,
    glmApiKey: env.GLM_API_KEY!,
    glmBaseUrl: env.GLM_BASE_URL!,
    githubToken: env.GITHUB_TOKEN!,
    githubOwner: env.GITHUB_OWNER!,
    vercelToken: env.VERCEL_TOKEN!,
    searchApiKey: env.TAVILY_API_KEY,
  };
}
