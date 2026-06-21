import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

const full = {
  TELEGRAM_BOT_TOKEN: "t",
  OPENAI_API_KEY: "o",
  GLM_API_KEY: "g",
  GLM_BASE_URL: "u",
  GITHUB_TOKEN: "gh",
  GITHUB_OWNER: "Mrfocused1",
  VERCEL_TOKEN: "v",
};

describe("loadConfig", () => {
  it("throws a clear error naming the missing variable", () => {
    expect(() => loadConfig({})).toThrowError(/TELEGRAM_BOT_TOKEN/);
  });

  it("returns a typed config when all vars present", () => {
    expect(loadConfig(full).githubOwner).toBe("Mrfocused1");
  });
});
