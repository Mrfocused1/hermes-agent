import OpenAI, { toFile } from "openai";
import type { OpenAIService } from "./types.js";

/** OpenAI is used only for transcription now (voice notes / videos). Design and
 *  code generation runs on GLM-5.2 (see glm.ts). */
export function makeOpenAIService(apiKey: string): OpenAIService {
  const client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 1 });

  /** Transcribe audio/video to text (voice notes, videos, audio files). */
  async function transcribe(media: Uint8Array, filename: string): Promise<string> {
    const file = await toFile(media, filename);
    const res = await client.audio.transcriptions.create({ model: "whisper-1", file });
    return res.text ?? "";
  }

  return { transcribe };
}
