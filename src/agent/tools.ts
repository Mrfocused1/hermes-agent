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
      name: "run_bash",
      description:
        "Run a bash command in your private workspace (Node, npm, git, build tools available). Your API keys are NOT in this environment.",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "The bash command to run." } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write a file in your workspace (path relative to the workspace root).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path." },
          content: { type: "string", description: "File contents." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file from your workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative file path." } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List a directory in your workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relative directory path (default '.')." } },
      },
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
}

/** Bind the tool executors to a specific chat's services and state. */
export function makeExecutors(ctx: ToolContext): Record<string, ToolExecutor> {
  const { svc, store, convo, chatId, messageId } = ctx;
  return {
    run_bash: async (args) => svc.shell.runBash(chatId, String(args.command ?? "")),

    write_file: async (args) =>
      svc.shell.writeFile(chatId, String(args.path ?? ""), String(args.content ?? "")),

    read_file: async (args) => svc.shell.readFile(chatId, String(args.path ?? "")),

    list_files: async (args) => svc.shell.listFiles(chatId, String(args.path ?? ".")),

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
        assets: r.assets,
        history: [],
      });
      convo.clearImages(chatId);
      return `Built and deployed. Preview URL: ${r.previewUrl}`;
    },

    edit_website: async (args) => {
      const instruction = String(args.instruction ?? "");
      const active = store.getActive(chatId);
      if (!active?.repo) return "There's no active site to edit yet.";
      const r = await runAmend(svc, active.repo, active.files ?? {}, active.assets ?? {}, instruction);
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
