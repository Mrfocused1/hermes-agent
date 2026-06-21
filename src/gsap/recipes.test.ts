import { describe, it, expect } from "vitest";
import { selectRecipes, RECIPES } from "./recipes.js";

describe("selectRecipes", () => {
  it("always includes hero-entrance when a hero is present", () => {
    expect(
      selectRecipes({ hasHero: true, sectionCount: 0, hasMarquee: false }),
    ).toContain("hero-entrance");
  });

  it("adds scroll-reveal when there are multiple sections", () => {
    expect(
      selectRecipes({ hasHero: false, sectionCount: 3, hasMarquee: false }),
    ).toContain("scroll-reveal");
  });

  it("every selected recipe exists in RECIPES", () => {
    const picked = selectRecipes({ hasHero: true, sectionCount: 4, hasMarquee: true });
    for (const r of picked) expect(RECIPES[r]).toBeDefined();
  });
});
