import { selectRecipes, RECIPES, type PageFeatures } from "../gsap/recipes.js";
import { verifyAndRetry, type VerifyOutcome } from "./verify.js";
import { parseModelJson } from "../services/json.js";
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

export interface BuildOutput {
  outcome: VerifyOutcome;
  previewUrl: string;
  deployId: string;
  files: Record<string, string>;
}

/** Full build flow: design image → code → recipes → assemble → commit →
 *  deploy → verify-and-retry. */
export async function runBuild(
  svc: Services,
  repo: string,
  brief: string,
  embeds: string[] = [],
  styleRefs: string[] = [],
): Promise<BuildOutput> {
  const log = (m: string) => console.log(`[build ${repo}] ${m}`);

  // Both kinds of image shape the design; only embeds become site assets.
  const designRefs = [...embeds, ...styleRefs];
  log(`generating design image (${designRefs.length} refs)`);
  const img = await svc.openai.generateDesignImage(brief, designRefs);
  log("image → code");
  const page = await svc.openai.imageToCode(img, brief, designRefs);
  const recipes = selectRecipes(detectFeatures(page)).map((k) => RECIPES[k]);

  // Embed only the user's own images as actual site assets.
  const assets: Record<string, string> = {};
  const assetPaths: string[] = [];
  embeds.forEach((b64, i) => {
    const path = `public/assets/ref-${i}.png`;
    assets[path] = b64;
    assetPaths.push(`/assets/ref-${i}.png`);
  });

  log("assembling project (GLM)");
  let files: Record<string, string> = parseModelJson(
    await svc.glm.assembleProject(page, recipes, assetPaths),
  );
  log(`creating repo + committing ${Object.keys(files).length} files`);
  await svc.github.createRepo(repo);
  await svc.github.commitFiles(repo, files, "feat: initial site", assets);

  let deploy = { id: "", url: "" };
  const outcome = await verifyAndRetry({
    maxRetries: 2,
    build: async () => {
      log("deploying to Vercel");
      deploy = await svc.vercel.deployPreview(repo, svc.owner);
      log(`deploy id=${deploy.id} url=${deploy.url}`);
      const buildLog = await svc.vercel.getBuildLogs(deploy.id);
      return { ok: !/\berror\b/i.test(buildLog), log: buildLog };
    },
    fix: async (errLog) => {
      log("fixing build error (GLM)");
      const patch: Record<string, string> = parseModelJson(
        await svc.glm.fixBuildError(JSON.stringify(files), errLog),
      );
      files = { ...files, ...patch };
      await svc.github.commitFiles(repo, patch, "fix: build error");
    },
  });

  log(`done: ${outcome.status}`);
  return { outcome, previewUrl: deploy.url, deployId: deploy.id, files };
}
