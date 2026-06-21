import OpenAI, { toFile } from "openai";
import type { OpenAIService } from "./types.js";

export function makeOpenAIService(apiKey: string): OpenAIService {
  const client = new OpenAI({ apiKey, timeout: 180_000, maxRetries: 1 });
  // Upgradable without a code change — set OPENAI_CODE_MODEL in Railway.
  const codeModel = process.env.OPENAI_CODE_MODEL ?? "gpt-4o";

  /** Design AND build a complete index.html in one pass — the strong model
   *  designs directly from the brief + the user's reference photos (which it
   *  sees), the way ChatGPT does. No weak intermediate mockup. */
  async function designSite(
    brief: string,
    references: string[] = [],
    assetPaths: string[] = [],
  ): Promise<string> {
    const assetNote = assetPaths.length
      ? ` The user's REAL photos are hosted at these exact paths — use them as the ` +
        `actual <img> sources, prominently (hero + about): ${assetPaths.join(", ")}.`
      : "";
    const refNote = references.length
      ? ` ${references.length} reference photo(s) of the subject are attached — reflect ` +
        `the person, their style and brand faithfully.`
      : "";

    const prompt =
      `Design and build a complete, single, production-quality index.html for the brief ` +
      `below. This is the FINAL website, not a wireframe — make it genuinely beautiful, and ` +
      `use your own judgement to choose the typography, colour palette, and layout that best ` +
      `suit THIS brief (like a top designer would — don't follow a fixed template).\n\n` +
      `Requirements:\n` +
      `- One self-contained index.html; all CSS in a <style> tag; load any web fonts from Google Fonts.\n` +
      `- Fully responsive (mobile-first). Write real, specific, compelling copy from the brief — no lorem ipsum.\n` +
      `-${refNote}${assetNote}\n` +
      `- Add these animation hooks where they fit: data-hero (hero container), data-reveal ` +
      `(scroll-in sections), data-pin (a standout section), data-parallax, data-marquee, ` +
      `data-draw (a decorative SVG path), data-count (a statistic number = its target value).\n\n` +
      `Brief: ${brief}\n\n` +
      `Output ONLY the HTML (no markdown fences).`;

    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: prompt },
    ];
    for (const ref of references) {
      content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${ref}` } });
    }

    const res = await client.chat.completions.create({
      model: codeModel,
      messages: [{ role: "user", content }],
      max_completion_tokens: 20_000,
    });
    const raw = res.choices[0]?.message?.content ?? "";
    const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
    return (fenced ? fenced[1] : raw).trim();
  }

  /** Transcribe audio/video to text (voice notes, videos, audio files). */
  async function transcribe(media: Uint8Array, filename: string): Promise<string> {
    const file = await toFile(media, filename);
    const res = await client.audio.transcriptions.create({ model: "whisper-1", file });
    return res.text ?? "";
  }

  return { designSite, transcribe };
}
