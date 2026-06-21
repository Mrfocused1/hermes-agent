import OpenAI, { toFile } from "openai";
import type { OpenAIService } from "./types.js";

export function makeOpenAIService(apiKey: string): OpenAIService {
  const client = new OpenAI({ apiKey });

  /** Generate a website design mockup as a base64 PNG. When the user supplied
   *  reference images, they are fed in (via the image-edit endpoint) so the
   *  mockup is built around their brand/people/content — mirroring the
   *  "give the images + description, get a site example" workflow. */
  async function generateDesignImage(
    brief: string,
    references: string[] = [],
  ): Promise<string> {
    const basePrompt = `Modern, polished website landing-page design mockup. ${brief}`;

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
  ): Promise<string> {
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      {
        type: "text",
        text:
          `Convert this website design into a single responsive index.html ` +
          `with inline CSS. Brief: ${brief}. Add data-hero on the hero ` +
          `container, data-reveal on scroll-in sections, data-pin on a ` +
          `standout section worth pinning, data-parallax on parallax ` +
          `layers, and data-marquee on any logo/text marquee.`,
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
      model: "gpt-4o",
      messages: [{ role: "user", content }],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  /** Transcribe audio/video to text (voice notes, videos, audio files). */
  async function transcribe(media: Uint8Array, filename: string): Promise<string> {
    const file = await toFile(media, filename);
    const res = await client.audio.transcriptions.create({ model: "whisper-1", file });
    return res.text ?? "";
  }

  return { generateDesignImage, imageToCode, transcribe };
}
