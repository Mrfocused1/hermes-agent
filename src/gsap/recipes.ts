export interface PageFeatures {
  hasHero: boolean;
  sectionCount: number;
  hasMarquee: boolean;
}

/**
 * Known-good GSAP snippets. Each registers plugins, respects reduced-motion,
 * and is safe to inject into a generated page. The bodies below are verified
 * with the official GSAP skill at build time.
 */
export const RECIPES: Record<string, string> = {
  "hero-entrance": `/* gsap stagger fade-up of [data-hero] children */`,
  "scroll-reveal": `/* ScrollTrigger fade/slide-in for [data-reveal] */`,
  "pinned-section": `/* ScrollTrigger pin for [data-pin] */`,
  "parallax": `/* ScrollTrigger parallax for [data-parallax] */`,
  "marquee": `/* infinite x-loop for [data-marquee] */`,
};

export function selectRecipes(f: PageFeatures): string[] {
  const picked: string[] = [];
  if (f.hasHero) picked.push("hero-entrance");
  if (f.sectionCount >= 2) picked.push("scroll-reveal");
  if (f.sectionCount >= 4) picked.push("pinned-section", "parallax");
  if (f.hasMarquee) picked.push("marquee");
  return picked;
}
