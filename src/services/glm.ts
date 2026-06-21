import OpenAI from "openai";
import type { GlmService } from "./types.js";

/** Paul's house-style brief: turns GLM into an Awwwards-calibre GSAP designer.
 *  Defaults (stack, palette, motion vocabulary) are his; the CONCEPT adapts to
 *  each brief — never a fixed template. */
const DESIGN_SYSTEM = [
  "You are an award-winning (Awwwards-calibre) web designer and GSAP developer.",
  "Design AND build a COMPLETE, single, self-contained index.html for the brief below.",
  "This is the final production site — make it genuinely stunning, immersive and bespoke;",
  "craft a creative concept that fits THIS brief. Do NOT use a fixed/generic template.",
  "",
  "OUTPUT: ONLY the raw HTML. No markdown fences, no commentary.",
  "",
  "TECH (mandatory — all CDN, one file):",
  "- Tailwind via https://cdn.tailwindcss.com with an inline tailwind.config (extend colours/fonts).",
  "- GSAP 3.12.5 from cdnjs: gsap + ScrollTrigger (+ MotionPathPlugin where useful). Register plugins.",
  "- Google Fonts via <link>.",
  "",
  "DESIGN LANGUAGE (house style — adapt to the brief, don't copy verbatim):",
  "- A refined, cohesive palette. Lean toward either (a) near-black #080808 with a metallic-gold",
  "  gradient #D4AF37→#8a6531, or (b) warm cream #F5EFE6 with forest/sage + champagne — or whatever",
  "  genuinely suits the brand (loud/streetwear briefs can break this).",
  "- Pair an elegant SERIF display (Cormorant Garamond, Cinzel, Playfair) with a clean SANS",
  "  (Manrope, Inter, Jost). Use a heavy display (Anton/Bebas) for loud briefs.",
  "- A fixed full-screen inline-SVG feTurbulence FILM-GRAIN overlay (opacity ~0.05, mix-blend-mode: overlay).",
  "- Generous whitespace, strong hierarchy, depth (gradients, soft shadows, fine borders).",
  "",
  "MOTION (mandatory — GSAP, immersive but CONTROLLED):",
  "- A scripted HERO entrance timeline on load (clip-path/curtain/door reveal + staggered text lift) —",
  "  never a static hero.",
  "- ScrollTrigger choreography: staggered reveals, yPercent parallax on backgrounds, expanding hairline",
  "  dividers. At least ONE special pinned section (pinned horizontal-scroll strip or pinned scrubbed scene).",
  "- Signature flourishes where they fit: mix-blend-difference fixed nav, -webkit-text-stroke outline",
  "  headings, a marquee strip, count-up stat numbers, magnetic buttons, a MotionPath dot on an SVG route.",
  "- Easing vocabulary: power2/power3/power4.out and expo.inOut. Tight staggers (0.02–0.08s). Scrub ≈ 1.",
  "  Motion must feel FAST and intentional — restraint over flash; every animation has a reason.",
  "- Respect prefers-reduced-motion (reduce/disable heavy motion; keep all content visible).",
  "  Mobile-first responsive; simplify heavy effects on small screens.",
  "",
  "CONTENT: real, specific, compelling copy in the brand's voice — NO lorem ipsum.",
  "Build a rich, multi-section site (aim 7+ unique sections, no repetition).",
].join("\n");

/**
 * GLM-5.2 via its OpenAI-compatible endpoint. Confirm the exact model id and
 * base URL for the *metered* API in the Z.ai dashboard, then set GLM_MODEL /
 * GLM_BASE_URL accordingly.
 */
export function makeGlmService(
  apiKey: string,
  baseURL: string,
  model = "glm-4.6",
): GlmService {
  const client = new OpenAI({ apiKey, baseURL, timeout: 120_000, maxRetries: 1 });

  async function ask(system: string, user: string): Promise<string> {
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  /** Design AND build a complete award-winning GSAP index.html from a brief,
   *  in Paul's house style. Uses a raw fetch so we can disable GLM-5.2's
   *  reasoning (10x faster for big generations) and allow a large output. */
  async function designSite(brief: string, assetPaths: string[] = []): Promise<string> {
    const assetNote = assetPaths.length
      ? `\n- The user's real photos are hosted at these exact paths — use them as ` +
        `actual <img> sources, prominently (hero / about): ${assetPaths.join(", ")}.`
      : "";
    const prompt = DESIGN_SYSTEM + assetNote + `\n\nBRIEF: ${brief}`;

    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(260_000),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 28000,
        thinking: { type: "disabled" },
      }),
    });
    if (!res.ok) {
      throw new Error(`GLM design failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const fenced = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
    return (fenced ? fenced[1] : raw).trim();
  }

  /** Apply a plain-English edit; return a JSON object of changed files. */
  function applyEdit(currentFiles: string, instruction: string): Promise<string> {
    return ask(
      "You edit a website. Output ONLY a JSON object of changed file paths to new " +
        "contents. No prose, JSON only.",
      `FILES:\n${currentFiles}\n\nCHANGE REQUEST:\n${instruction}`,
    );
  }

  /** Generic multi-turn chat, used for plain conversation. */
  async function converse(
    systemPrompt: string,
    messages: { role: "user" | "assistant"; content: string }[],
  ): Promise<string> {
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  /** Tool-calling chat: returns the assistant message (may include tool_calls). */
  async function converseWithTools(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    const res = await client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: "auto",
    });
    return res.choices[0].message;
  }

  return { designSite, applyEdit, converse, converseWithTools };
}
