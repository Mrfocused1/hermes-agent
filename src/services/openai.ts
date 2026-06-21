import OpenAI, { toFile } from "openai";
import type { OpenAIService } from "./types.js";

export function makeOpenAIService(apiKey: string): OpenAIService {
  const client = new OpenAI({ apiKey, timeout: 180_000, maxRetries: 1 });
  // Upgradable without a code change — set OPENAI_CODE_MODEL in Railway to a
  // stronger model (the one you get great results from in ChatGPT).
  const codeModel = process.env.OPENAI_CODE_MODEL ?? "gpt-4o";

  /** Generate a website design mockup as a base64 PNG. When the user supplied
   *  reference images, they are fed in (via the image-edit endpoint) so the
   *  mockup is built around their brand/people/content — mirroring the
   *  "give the images + description, get a site example" workflow. */
  async function generateDesignImage(
    brief: string,
    references: string[] = [],
  ): Promise<string> {
    const basePrompt =
      `A stunning, award-winning website landing-page design mockup — the quality ` +
      `of a top design agency. Polished modern UI, refined typography, a cohesive ` +
      `and sophisticated colour palette, generous whitespace, depth and visual ` +
      `hierarchy. Brief: ${brief}`;

    if (references.length) {
      const files = await Promise.all(
        references.map((b64, i) =>
          toFile(Buffer.from(b64, "base64"), `ref-${i}.png`, { type: "image/png" }),
        ),
      );
      const res = await client.images.edit({
        model: "gpt-image-1",
        image: files,
        prompt:
          `${basePrompt} Use the provided reference images as the brand, people, ` +
          `and content to feature prominently in the design.`,
        size: "1536x1024",
      });
      return res.data?.[0]?.b64_json ?? "";
    }

    const res = await client.images.generate({
      model: "gpt-image-1",
      prompt: basePrompt,
      size: "1536x1024",
    });
    return res.data?.[0]?.b64_json ?? "";
  }

  /** Convert a design image (base64) + brief into a single responsive page.
   *  Any `references` are user-supplied brand/content images to reflect. */
  async function imageToCode(
    imageB64: string,
    brief: string,
    references: string[] = [],
    assetPaths: string[] = [],
  ): Promise<string> {
    const assetNote = assetPaths.length
      ? ` Use these uploaded images as real <img> sources where they fit: ${assetPaths.join(", ")}.`
      : "";
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: "text",
        text:
          `You are an award-winning web designer and front-end engineer. Build ONE ` +
          `complete, production-quality index.html for the brief, using the attached ` +
          `mockup for layout/style but executing it to a far higher polish than a ` +
          `typical template.\n\n` +
          `QUALITY BAR (non-negotiable):\n` +
          `- Premium, modern aesthetic — like a top design-agency landing page.\n` +
          `- Load a tasteful Google Font via <link> and use a real type scale.\n` +
          `- Define a refined colour palette with CSS custom properties; cohesive, not flat.\n` +
          `- Add depth: subtle gradients, soft shadows, rounded corners, 1px borders, ` +
          `smooth hover/focus transitions.\n` +
          `- Generous, consistent spacing; strong visual hierarchy; fully responsive (mobile-first).\n` +
          `- Write real, specific, compelling copy from the brief — NO lorem ipsum, no placeholders.\n` +
          `- All CSS in one <style> tag. Output ONLY the HTML (no markdown fences).\n\n` +
          `Brief: ${brief}.${assetNote}\n\n` +
          `Animation hooks — add these attributes so motion can attach: data-hero on the ` +
          `hero container, data-reveal on scroll-in sections, data-pin on a standout ` +
          `section worth pinning, data-parallax on parallax layers, data-marquee on a ` +
          `logo/text marquee, data-draw on a decorative SVG path, and data-count on any ` +
          `statistic number (set data-count to the target value).`,
      },
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${imageB64}` },
      },
    ];

    if (references.length) {
      content.push({
        type: "text",
        text:
          `The following ${references.length} image(s) are brand/content ` +
          `references from the user — reflect their subject, people, style, ` +
          `and branding in the page's content and feel.`,
      });
      for (const ref of references) {
        content.push({
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${ref}` },
        });
      }
    }

    const res = await client.chat.completions.create({
      model: codeModel,
      messages: [{ role: "user", content }],
      max_completion_tokens: 16_000, // GPT-5 models require this (not max_tokens)
    });
    const raw = res.choices[0]?.message?.content ?? "";
    // Strip ```html ... ``` fences if the model added them.
    const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
    return (fenced ? fenced[1] : raw).trim();
  }

  /** Transcribe audio/video to text (voice notes, videos, audio files). */
  async function transcribe(media: Uint8Array, filename: string): Promise<string> {
    const file = await toFile(media, filename);
    const res = await client.audio.transcriptions.create({ model: "whisper-1", file });
    return res.text ?? "";
  }

  return { generateDesignImage, imageToCode, transcribe };
}
