/** Shared service interfaces so the pipeline and bot stay decoupled from
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
  assembleProject(pageHtml: string, recipes: string[]): Promise<string>;
  fixBuildError(currentFiles: string, errorLog: string): Promise<string>;
  applyEdit(currentFiles: string, instruction: string): Promise<string>;
  /** Generic multi-turn chat used for the consultation phase. */
  converse(
    systemPrompt: string,
    messages: { role: "user" | "assistant"; content: string }[],
  ): Promise<string>;
}

export interface GithubService {
  createRepo(name: string): Promise<void>;
  commitFiles(
    repo: string,
    files: Record<string, string>,
    message: string,
  ): Promise<string>;
}

export interface VercelService {
  deployPreview(repo: string, owner: string): Promise<{ id: string; url: string }>;
  getBuildLogs(deploymentId: string): Promise<string>;
  promoteToProduction(deploymentId: string): Promise<void>;
}

export interface Services {
  openai: OpenAIService;
  glm: GlmService;
  github: GithubService;
  vercel: VercelService;
  owner: string;
}
