export interface PageFeatures {
  hasHero: boolean;
  sectionCount: number;
  hasMarquee: boolean;
}

/**
 * Known-good GSAP snippets injected into the generated site's main.js (which
 * imports `gsap` and `ScrollTrigger`). Each block:
 *  - is a self-contained IIFE so blocks compose without variable collisions,
 *  - registers ScrollTrigger defensively where it needs it,
 *  - gates motion behind gsap.matchMedia() so users with
 *    prefers-reduced-motion get a still, accessible page,
 *  - targets the data-* hooks the design markup carries.
 * Verified against the official gsap-core and gsap-scrolltrigger skills.
 */
export const RECIPES: Record<string, string> = {
  "hero-entrance": `
// hero-entrance: staggered fade-up of [data-hero] children on load
(() => {
  gsap.matchMedia().add({ reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
    const reduce = ctx.conditions.reduce;
    const targets = gsap.utils.toArray("[data-hero] > *");
    if (!targets.length) return;
    gsap.from(targets, {
      autoAlpha: 0,
      y: reduce ? 0 : 30,
      duration: reduce ? 0 : 0.8,
      ease: "power3.out",
      stagger: reduce ? 0 : 0.12,
    });
  });
})();`.trim(),

  "scroll-reveal": `
// scroll-reveal: fade/slide [data-reveal] elements in as they enter the viewport
(() => {
  gsap.registerPlugin(ScrollTrigger);
  gsap.matchMedia().add({ reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
    const reduce = ctx.conditions.reduce;
    const items = gsap.utils.toArray("[data-reveal]");
    if (!items.length) return;
    gsap.set(items, { autoAlpha: 0, y: reduce ? 0 : 40 });
    ScrollTrigger.batch(items, {
      start: "top 85%",
      onEnter: (batch) =>
        gsap.to(batch, {
          autoAlpha: 1,
          y: 0,
          duration: reduce ? 0 : 0.7,
          ease: "power2.out",
          stagger: reduce ? 0 : 0.1,
          overwrite: true,
        }),
    });
  });
})();`.trim(),

  "pinned-section": `
// pinned-section: pin [data-pin] and reveal its children while pinned (desktop only)
(() => {
  gsap.registerPlugin(ScrollTrigger);
  gsap.matchMedia().add(
    {
      isDesktop: "(min-width: 768px)",
      reduce: "(prefers-reduced-motion: reduce)",
    },
    (ctx) => {
      const { isDesktop, reduce } = ctx.conditions;
      const section = document.querySelector("[data-pin]");
      if (!section || !isDesktop || reduce) return; // skip pin on mobile / reduced motion
      const items = section.querySelectorAll(":scope > *");
      gsap
        .timeline({
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "+=80%",
            pin: true,
            scrub: 1,
          },
        })
        .from(items, { autoAlpha: 0, y: 50, stagger: 0.2, ease: "none" });
    }
  );
})();`.trim(),

  "parallax": `
// parallax: drift [data-parallax] layers slower than the page as it scrolls
(() => {
  gsap.registerPlugin(ScrollTrigger);
  gsap.matchMedia().add({ reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
    if (ctx.conditions.reduce) return; // no parallax for reduced motion
    gsap.utils.toArray("[data-parallax]").forEach((layer) => {
      const depth = parseFloat(layer.getAttribute("data-parallax")) || 0.3;
      gsap.to(layer, {
        yPercent: -depth * 100,
        ease: "none",
        scrollTrigger: {
          trigger: layer,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    });
  });
})();`.trim(),

  "marquee": `
// marquee: continuous horizontal scroll of [data-marquee] content
(() => {
  gsap.matchMedia().add({ reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
    if (ctx.conditions.reduce) return; // hold still for reduced motion
    gsap.utils.toArray("[data-marquee]").forEach((track) => {
      const distance = track.scrollWidth / 2; // content is duplicated for a seamless loop
      if (!distance) return;
      gsap.to(track, {
        x: -distance,
        ease: "none",
        duration: Math.max(8, distance / 80),
        repeat: -1,
        modifiers: { x: (x) => (parseFloat(x) % distance) + "px" },
      });
    });
  });
})();`.trim(),
};

export function selectRecipes(f: PageFeatures): string[] {
  const picked: string[] = [];
  if (f.hasHero) picked.push("hero-entrance");
  if (f.sectionCount >= 2) picked.push("scroll-reveal");
  if (f.sectionCount >= 4) picked.push("pinned-section", "parallax");
  if (f.hasMarquee) picked.push("marquee");
  return picked;
}
