import { describe, it, expect } from "vitest";
import { extractText } from "./research.js";

describe("extractText", () => {
  it("strips tags and collapses whitespace", () => {
    expect(extractText("<h1>Hi</h1>  <p>there</p>")).toBe("Hi there");
  });

  it("removes script and style blocks", () => {
    const html = "<style>.x{}</style><p>keep</p><script>evil()</script>";
    expect(extractText(html)).toBe("keep");
  });
});
