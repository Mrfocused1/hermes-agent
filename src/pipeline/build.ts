import type { Services } from "../services/types.js";

export interface BuildOutput {
  previewUrl: string;
  deployId: string;
  files: Record<string, string>;
  assets: Record<string, string>;
}

/** Build flow: GLM-5.2 designs a complete award-winning GSAP index.html (Paul's
 *  house style) → deploy directly to Vercel. GitHub push is best-effort. */
export async function runBuild(
  svc: Services,
  repo: string,
  brief: string,
  embeds: string[] = [],
): Promise<BuildOutput> {
  const log = (m: string) => console.log(`[build ${repo}] ${m}`);

  // The user's own images become real site assets served at /assets/ref-N.png.
  const assets: Record<string, string> = {};
  const assetPaths: string[] = [];
  embeds.forEach((b64, i) => {
    assets[`assets/ref-${i}.png`] = b64;
    assetPaths.push(`/assets/ref-${i}.png`);
  });

  log(`designing site with GLM (${assetPaths.length} photos)`);
  const html = await svc.glm.designSite(brief, assetPaths);
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
