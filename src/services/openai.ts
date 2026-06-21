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
      `You are an award-winning web designer (Awwwards / top-agency calibre). Design ` +
      `AND build a complete, single, production index.html for the brief. This is the ` +
      `FINAL website, not a wireframe — make it genuinely beautiful.\n\n` +
      `DESIGN DIRECTION (non-negotiable):\n` +
      `- Editorial, premium aesthetic: strong visual hierarchy, generous whitespace, big confident hero.\n` +
      `- Pair an ELEGANT DISPLAY FONT for large headings (a serif such as Playfair Display, ` +
      `Cormorant, or Fraunces) with a clean sans-serif (e.g. Inter) for body — load both from Google Fonts.\n` +
      `- A refined, cohesive colour palette via CSS custom properties.\n` +
      `- Depth and craft: subtle gradients, soft shadows, fine 1px borders, rounded corners, ` +
      `smooth hover/focus transitions.\n` +
      `- Place the user's photos cleanly and prominently; frame them tastefully.\n` +
      `- Fully responsive (mobile-first). Real, specific, compelling copy — NO lorem ipsum.\n\n` +
      `Brief: ${brief}.${refNote}${assetNote}\n\n` +
      `Animation hooks — add these attributes so motion can attach: data-hero on the hero ` +
      `container, data-reveal on scroll-in sections, data-pin on a standout section, ` +
      `data-parallax on parallax layers, data-marquee on a logo/text marquee, data-draw on a ` +
      `decorative SVG path, data-count on any statistic number (data-count = target value).\n\n` +
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
