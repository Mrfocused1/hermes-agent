import type OpenAI from "openai";
import type { ToolExecutor } from "./tools.js";

/** The minimal brain the loop needs: a tool-calling chat call. */
export interface AgentBrain {
  converseWithTools(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage>;
}

export interface RunAgentOptions {
  maxSteps?: number;
  onTool?: (name: string) => void;
}

/**
 * Run the agent until it produces a final text reply. Each step: ask the brain;
 * if it requests tools, execute them, feed results back, and continue. Capped
 * by maxSteps so it can never loop forever.
 */
export async function runAgent(
  brain: AgentBrain,
  tools: OpenAI.Chat.Completions.ChatCompletionTool[],
  executors: Record<string, ToolExecutor>,
  initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options: RunAgentOptions = {},
): Promise<string> {
  const messages = [...initialMessages];
  const maxSteps = options.maxSteps ?? 6;

  for (let step = 0; step < maxSteps; step++) {
    const msg = await brain.converseWithTools(messages, tools);
    messages.push(msg as OpenAI.Chat.Completions.ChatCompletionMessageParam);

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      return msg.content ?? "";
    }

    for (const call of calls) {
      if (call.type !== "function") continue;
      options.onTool?.(call.function.name);
      const executor = executors[call.function.name];
      let result: string;
      try {
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        result = executor
          ? await executor(args)
          : `Unknown tool: ${call.function.name}`;
      } catch (e) {
        result = `Tool error: ${(e as Error).message}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  return "I've done as much as I can in one go — tell me how you'd like to continue.";
}
