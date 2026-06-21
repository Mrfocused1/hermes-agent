import { describe, it, expect } from "vitest";
import { ProjectStore, type Version } from "./state.js";

const v = (url: string): Version => ({ files: { "index.html": url }, assets: {}, previewUrl: url, deployId: url });

describe("ProjectStore", () => {
  it("starts with no active project", () => {
    expect(new ProjectStore().getActive(1)).toBeUndefined();
  });

  it("setActive then getActive returns the project", () => {
    const s = new ProjectStore();
    s.setActive(1, { repo: "site-1", previewUrl: "u1", history: [] });
    expect(s.getActive(1)?.repo).toBe("site-1");
  });

  it("undo reverts to the previous version", () => {
    const s = new ProjectStore();
    s.setActive(1, { repo: "r", previewUrl: "v2", deployId: "d2", history: [] });
    s.pushHistory(1, v("v1"));
    const prev = s.undo(1);
    expect(prev?.previewUrl).toBe("v1");
    expect(s.getActive(1)?.previewUrl).toBe("v1");
  });

  it("undo returns undefined with no history", () => {
    const s = new ProjectStore();
    s.setActive(1, { repo: "r", previewUrl: "u", history: [] });
    expect(s.undo(1)).toBeUndefined();
  });

  it("caps history length", () => {
    const s = new ProjectStore();
    s.setActive(1, { repo: "r", previewUrl: "u", history: [] });
    for (let i = 0; i < 10; i++) s.pushHistory(1, v(`v${i}`));
    expect(s.getActive(1)!.history.length).toBe(5);
  });
});
