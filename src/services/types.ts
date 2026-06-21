import type OpenAI from "openai";

/** Shared service interfaces so the agent and pipeline stay decoupled from
 *  concrete implementations (and from the SDKs). */

export interface OpenAIService {
  generateDesignImage(brief: string, references?: string[]): Promise<string>;
  imageToCode(
    imageB64: string,
    brief: string,
    references?: string[],
    assetPaths?: string[],
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
  /** Deploy files directly as a static site (no GitHub/build needed).
   *  target "production" makes it the live site; "preview" (default) is private-ish. */
  deployStatic(
    name: string,
    files: Record<string, string>,
    assets?: Record<string, string>,
    target?: "preview" | "production",
  ): Promise<{ id: string; url: string }>;
}

export interface ShellService {
  /** Run a bash command in the chat's workspace (keys scrubbed from env). */
  runBash(chatId: number, command: string): Promise<string>;
  /** Write a file (relative to the workspace). */
  writeFile(chatId: number, relPath: string, content: string): Promise<string>;
  /** Read a file (relative to the workspace). */
  readFile(chatId: number, relPath: string): Promise<string>;
  /** List a directory (relative to the workspace). */
  listFiles(chatId: number, relPath: string): Promise<string>;
}

export interface Services {
  openai: OpenAIService;
  glm: GlmService;
  github: GithubService;
  vercel: VercelService;
  shell: ShellService;
  owner: string;
}
