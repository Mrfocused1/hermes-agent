import OpenAI from "openai";
import type { OpenAIService } from "./types.js";

export function makeOpenAIService(apiKey: string): OpenAIService {
  const client = new OpenAI({ apiKey });

  /** Generate a reference design image; returns a base64 PNG. */
  async function generateDesignImage(brief: string): Promise<string> {
    const res = await client.images.generate({
      model: "gpt-image-1",
      prompt: `Modern, polished website landing-page design mockup. ${brief}`,
      size: "1536x1024",
    });
    return res.data?.[0]?.b64_json ?? "";
  }

  /** Convert a design image (base64) + brief into a single responsive page. */
  async function imageToCode(imageB64: string, brief: string): Promise<string> {
    const res = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
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
          ],
        },
      ],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  return { generateDesignImage, imageToCode };
}
