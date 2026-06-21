import type OpenAI from "openai";

/** Shared service interfaces so the agent and pipeline stay decoupled from
 *  concrete implementations (and from the SDKs). */

export interface OpenAIService {
  generateDesignImage(brief: string, references?: string[]): Promise<string>;
  imageToCode(
    imageB64: string,
    brief: string,
    references?: string[],
  ): Promise<string>;
  /** Transcribe an audio or video file to text (voice notes, videos). */
  transcribe(media: Uint8Array, filename: string): Promise<string>;
}

export interface GlmService {
  assembleProject(
    pageHtml: string,
    recipes: string[],
    assetPaths?: string[],
  ): Promise<string>;
  fixBuildError(currentFiles: string, errorLog: string): Promise<string>;
  applyEdit(currentFiles: string, instruction: string): Promise<string>;
  /** Generic multi-turn chat used for plain conversation. */
  converse(
    systemPrompt: string,
    messages: { role: "user" | "assistant"; content: string }[],
  ): Promise<string>;
  /** Tool-calling chat: returns the assistant message, which may request tools. */
  converseWithTools(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage>;
}

export interface GithubService {
  createRepo(name: string): Promise<void>;
  /** Commit text files, plus optional binary `assets` (path -> base64). */
  commitFiles(
    repo: string,
    files: Record<string, string>,
    message: string,
    assets?: Record<string, string>,
  ): Promise<string>;
}

export interface VercelService {
  deployPreview(repo: string, owner: string): Promise<{ id: string; url: string }>;
  getBuildLogs(deploymentId: string): Promise<string>;
  promoteToProduction(deploymentId: string): Promise<void>;
}

export interface ResearchService {
  /** Fetch and read a web page's text content. */
  fetchUrl(url: string): Promise<string>;
  /** Search the web (requires a search API key). */
  search(query: string): Promise<string>;
}

export interface BrowserService {
  /** Full-page screenshot of a URL as base64 PNG. */
  screenshot(url: string): Promise<string>;
  /** Visible text of a JS-rendered page. */
  renderText(url: string): Promise<string>;
}

export interface Services {
  openai: OpenAIService;
  glm: GlmService;
  github: GithubService;
  vercel: VercelService;
  research: ResearchService;
  browser: BrowserService;
  owner: string;
}
