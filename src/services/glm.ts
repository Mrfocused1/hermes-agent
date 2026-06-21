import OpenAI from "openai";
import type { GlmService } from "./types.js";

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
  const client = new OpenAI({ apiKey, baseURL });

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

  /** Turn raw page HTML + chosen GSAP recipes into a deployable project.
   *  Returns a JSON string mapping file paths to file contents. */
  function assembleProject(pageHtml: string, recipes: string[]): Promise<string> {
    return ask(
      "You output ONLY a JSON object mapping file paths to file contents for a " +
        "static Vite site deployable on Vercel. Include index.html, package.json, " +
        "vite.config.js, and a main.js that imports gsap and registers the " +
        "provided GSAP recipes. No prose, JSON only.",
      `PAGE:\n${pageHtml}\n\nGSAP RECIPES TO INCLUDE:\n${recipes.join("\n\n")}`,
    );
  }

  /** Given a build error log, return a JSON object of files to overwrite. */
  function fixBuildError(currentFiles: string, errorLog: string): Promise<string> {
    return ask(
      "You fix build errors. Output ONLY a JSON object of file paths to corrected " +
        "contents for the files that need changing. No prose, JSON only.",
      `FILES:\n${currentFiles}\n\nBUILD ERROR:\n${errorLog}`,
    );
  }

  /** Apply a plain-English edit; return a JSON object of changed files. */
  function applyEdit(currentFiles: string, instruction: string): Promise<string> {
    return ask(
      "You edit a website. Output ONLY a JSON object of changed file paths to new " +
        "contents. No prose, JSON only.",
      `FILES:\n${currentFiles}\n\nCHANGE REQUEST:\n${instruction}`,
    );
  }

  /** Generic multi-turn chat, used for the consultation phase. */
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

  return { assembleProject, fixBuildError, applyEdit, converse };
}
