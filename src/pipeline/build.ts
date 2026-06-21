import { selectRecipes, RECIPES, type PageFeatures } from "../gsap/recipes.js";
import type { Services } from "../services/types.js";

function detectFeatures(html: string): PageFeatures {
  return {
    hasHero: /data-hero/.test(html),
    sectionCount: (html.match(/<section/g) ?? []).length,
    hasMarquee: /data-marquee/.test(html),
    hasLine: /data-draw/.test(html),
    hasCounter: /data-count/.test(html),
  };
}

/** Inline GSAP (from CDN) + the chosen recipes into the page before </body>. */
function injectGsap(html: string, recipes: string[]): string {
  if (!recipes.length) return html;
  const block = [
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>',
    "<script>",
    recipes.join("\n\n"),
    "</script>",
  ].join("\n");
  return html.includes("</body>")
    ? html.replace("</body>", `${block}\n</body>`)
    : `${html}\n${block}`;
}

export interface BuildOutput {
  previewUrl: string;
  deployId: string;
  files: Record<string, string>;
  assets: Record<string, string>;
}

/** Build flow: design image → single static index.html → inject GSAP →
 *  deploy directly to Vercel. GitHub push is best-effort (never blocks). */
export async function runBuild(
  svc: Services,
  repo: string,
  brief: string,
  embeds: string[] = [],
  styleRefs: string[] = [],
): Promise<BuildOutput> {
  const log = (m: string) => console.log(`[build ${repo}] ${m}`);
  const designRefs = [...embeds, ...styleRefs];

  // The user's own images become real site assets served at /assets/ref-N.png.
  const assets: Record<string, string> = {};
  const assetPaths: string[] = [];
  embeds.forEach((b64, i) => {
    assets[`assets/ref-${i}.png`] = b64;
    assetPaths.push(`/assets/ref-${i}.png`);
  });

  log(`designing site directly (${designRefs.length} ref photos)`);
  let html = await svc.openai.designSite(brief, designRefs, assetPaths);
  const recipes = selectRecipes(detectFeatures(html)).map((k) => RECIPES[k]);
  html = injectGsap(html, recipes);
  const files = { "index.html": html };

  log("deploying static site to Vercel");
  const deploy = await svc.vercel.deployStatic(repo, files, assets);
  log(`deployed: ${deploy.url}`);

  // Best-effort GitHub copy for the user's ownership/history — never blocks.
  try {
    await svc.github.createRepo(repo);
    await svc.github.commitFiles(repo, files, "feat: initial site", assets);
    log("pushed to GitHub");
  } catch (e) {
    log(`GitHub push skipped: ${(e as Error).message}`);
  }

  return { previewUrl: deploy.url, deployId: deploy.id, files, assets };
}
