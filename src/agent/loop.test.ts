import { describe, it, expect, vi } from "vitest";
import { runAgent, type AgentBrain } from "./loop.js";

function assistant(content: string) {
  return { role: "assistant", content, tool_calls: undefined } as never;
}

function toolCall(name: string, args: string) {
  return {
    role: "assistant",
    content: null,
    tool_calls: [{ id: "1", type: "function", function: { name, arguments: args } }],
  } as never;
}

describe("runAgent", () => {
  it("returns the final text when no tools are requested", async () => {
    const brain: AgentBrain = { converseWithTools: vi.fn().mockResolvedValue(assistant("Hi there!")) };
    const out = await runAgent(brain, [], {}, []);
    expect(out).toBe("Hi there!");
  });

  it("executes a requested tool, then returns the follow-up text", async () => {
    const brain: AgentBrain = {
      converseWithTools: vi
        .fn()
        .mockResolvedValueOnce(toolCall("research_url", '{"url":"https://x.com"}'))
        .mockResolvedValueOnce(assistant("Here's what I found.")),
    };
    const research = vi.fn().mockResolvedValue("page content");
    const out = await runAgent(brain, [], { research_url: research }, []);
    expect(research).toHaveBeenCalledWith({ url: "https://x.com" });
    expect(out).toBe("Here's what I found.");
  });

  it("stops at maxSteps instead of looping forever", async () => {
    const brain: AgentBrain = {
      converseWithTools: vi.fn().mockResolvedValue(toolCall("noop", "{}")),
    };
    const out = await runAgent(brain, [], { noop: async () => "ok" }, [], { maxSteps: 2 });
    expect(brain.converseWithTools).toHaveBeenCalledTimes(2);
    expect(out).toMatch(/continue/i);
  });
});
