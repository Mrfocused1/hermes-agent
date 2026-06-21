import type OpenAI from "openai";
import { runBuild } from "../pipeline/build.js";
import { runAmend } from "../pipeline/amend.js";
import type { Services } from "../services/types.js";
import type { ProjectStore } from "../state.js";
import type { ConversationStore } from "../conversation.js";

export type ToolExecutor = (args: Record<string, unknown>) => Promise<string>;

/** The agent's skill set, as OpenAI-format tool definitions. */
export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "research_url",
      description: "Fetch and read the text content of a web page URL (simple/fast).",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "The URL to read." } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for information on a topic.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The search query." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deep_research",
      description: "Search the web and synthesize concise notes/content on a topic for the site.",
      parameters: {
        type: "object",
        properties: { topic: { type: "string", description: "The topic to research." } },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_data",
      description: "Extract structured data (named fields) from a web page as JSON.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The page to extract from." },
          fields: { type: "string", description: "What to extract, e.g. 'name, role, photo for each team member'." },
        },
        required: ["url", "fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screenshot_url",
      description:
        "Take a screenshot of a web page to copy its look. Saved as a style reference (not embedded).",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "The page to screenshot." } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screenshot_site",
      description: "Screenshot the current built site and send it to the user to review.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "build_website",
      description:
        "Design, build, and deploy a NEW website preview. Call once you have gathered enough from the user.",
      parameters: {
        type: "object",
        properties: {
          brief: {
            type: "string",
            description:
              "A detailed paragraph: purpose, style, colours, sections, tone, and key copy.",
          },
        },
        required: ["brief"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_website",
      description: "Apply a change to the current website and redeploy.",
      parameters: {
        type: "object",
        properties: {
          instruction: { type: "string", description: "The change to make, in plain English." },
        },
        required: ["instruction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "publish_website",
      description: "Promote the current preview to production (take it live).",
      parameters: { type: "object", properties: {} },
    },
  },
];

export interface ToolContext {
  svc: Services;
  store: ProjectStore;
  convo: ConversationStore;
  chatId: number;
  messageId: number;
  /** Send an image (base64 PNG) to the user. */
  sendPhoto: (base64: string, caption?: string) => Promise<void>;
}

/** Bind the tool executors to a specific chat's services and state. */
export function makeExecutors(ctx: ToolContext): Record<string, ToolExecutor> {
  const { svc, store, convo, chatId, messageId, sendPhoto } = ctx;
  return {
    research_url: async (args) => {
      const url = String(args.url ?? "");
      return url ? svc.research.fetchUrl(url) : "No URL provided.";
    },

    web_search: async (args) => svc.research.search(String(args.query ?? "")),

    deep_research: async (args) => {
      const topic = String(args.topic ?? "");
      const results = await svc.research.search(topic);
      if (results.startsWith("Web search isn't set up")) return results;
      return svc.glm.converse(
        "Synthesize concise, accurate notes for a website from these search results. Plain text.",
        [{ role: "user", content: `TOPIC: ${topic}\n\nRESULTS:\n${results}` }],
      );
    },

    extract_data: async (args) => {
      const url = String(args.url ?? "");
      const fields = String(args.fields ?? "");
      if (!url) return "No URL provided.";
      const text = await svc.research.fetchUrl(url);
      return svc.glm.converse(
        "Extract the requested fields from the page text. Output ONLY JSON, no prose.",
        [{ role: "user", content: `FIELDS: ${fields}\n\nPAGE:\n${text}` }],
      );
    },

    screenshot_url: async (args) => {
      const url = String(args.url ?? "");
      if (!url) return "No URL provided.";
      const b64 = await svc.browser.screenshot(url);
      convo.addReference(chatId, b64); // style reference, NOT embedded
      await sendPhoto(b64, `Screenshot of ${url}`);
      return `Captured a screenshot of ${url} and saved it as a style reference for the design.`;
    },

    screenshot_site: async () => {
      const active = store.getActive(chatId);
      if (!active?.previewUrl) return "There's no built site to screenshot yet.";
      const b64 = await svc.browser.screenshot(active.previewUrl);
      await sendPhoto(b64, "Here's how your site looks right now.");
      return "Sent the user a screenshot of the current site.";
    },

    build_website: async (args) => {
      const brief = String(args.brief ?? "");
      if (!brief) return "I need a brief before I can build.";
      const repo = `site-${chatId}-${messageId}`;
      const r = await runBuild(svc, repo, brief, convo.getEmbeds(chatId), convo.getReferences(chatId));
      store.setActive(chatId, {
        repo,
        previewUrl: r.previewUrl,
        deployId: r.deployId,
        files: r.files,
        history: [],
      });
      convo.clearImages(chatId);
      return r.outcome.status === "ok"
        ? `Built and deployed. Preview URL: ${r.previewUrl}`
        : `Build failed after retries. Last error: ${r.outcome.lastLog.slice(0, 400)}`;
    },

    edit_website: async (args) => {
      const instruction = String(args.instruction ?? "");
      const active = store.getActive(chatId);
      if (!active?.repo) return "There's no active site to edit yet.";
      const r = await runAmend(svc, active.repo, active.files ?? {}, instruction);
      store.setActive(chatId, {
        ...active,
        files: r.files,
        previewUrl: r.previewUrl,
        deployId: r.deployId,
      });
      store.pushCommit(chatId, r.sha);
      return `Edited and redeployed. Preview URL: ${r.previewUrl}`;
    },

    publish_website: async () => {
      const active = store.getActive(chatId);
      if (!active?.deployId) return "There's no preview to publish yet.";
      await svc.vercel.promoteToProduction(active.deployId);
      return "Published to production.";
    },
  };
}
