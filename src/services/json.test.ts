import { describe, it, expect } from "vitest";
import { parseModelJson } from "./json.js";

describe("parseModelJson", () => {
  it("parses plain JSON", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json code fences", () => {
    const raw = '```json\n{"index.html":"<h1>hi</h1>"}\n```';
    expect(parseModelJson(raw)).toEqual({ "index.html": "<h1>hi</h1>" });
  });

  it("strips bare ``` fences", () => {
    expect(parseModelJson('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it("ignores prose around the object", () => {
    expect(parseModelJson('Sure! Here you go:\n{"a":3}\nHope that helps.')).toEqual({ a: 3 });
  });
});
