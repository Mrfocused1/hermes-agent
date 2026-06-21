import { describe, it, expect } from "vitest";
import { ProjectStore } from "./state.js";

describe("ProjectStore", () => {
  it("starts with no active project", () => {
    expect(new ProjectStore().getActive(1)).toBeUndefined();
  });

  it("setActive then getActive returns the project", () => {
    const s = new ProjectStore();
    s.setActive(1, { repo: "site-1", previewUrl: "", history: [] });
    expect(s.getActive(1)?.repo).toBe("site-1");
  });

  it("pushCommit grows history; popCommit returns previous sha", () => {
    const s = new ProjectStore();
    s.setActive(1, { repo: "r", previewUrl: "", history: ["a"] });
    s.pushCommit(1, "b");
    expect(s.getActive(1)?.history).toEqual(["a", "b"]);
    expect(s.popCommit(1)).toBe("a");
  });

  it("popCommit returns undefined when there is no earlier version", () => {
    const s = new ProjectStore();
    s.setActive(1, { repo: "r", previewUrl: "", history: ["only"] });
    expect(s.popCommit(1)).toBeUndefined();
  });
});
