import { describe, it, expect } from "vitest";
import { consult } from "./consult.js";

describe("consult", () => {
  it("returns the model's question when not yet ready", async () => {
    const glm = { converse: async () => "What's the site for?" };
    const r = await consult(glm, [{ role: "user", content: "hi" }]);
    expect(r).toEqual({ kind: "question", text: "What's the site for?" });
  });

  it("returns a brief when the model signals readiness", async () => {
    const glm = { converse: async () => "BRIEF: A dark fitness coaching landing page." };
    const r = await consult(glm, [{ role: "user", content: "fitness site" }]);
    expect(r.kind).toBe("brief");
    if (r.kind === "brief") expect(r.brief).toBe("A dark fitness coaching landing page.");
  });
});
