import { parseModelJson } from "../services/json.js";
import type { Services } from "../services/types.js";

export interface AmendOutput {
  files: Record<string, string>;
  assets: Record<string, string>;
  sha: string;
  previewUrl: string;
  deployId: string;
}

/** Apply a plain-English edit to the current site and redeploy it (static). */
export async function runAmend(
  svc: Services,
  repo: string,
  files: Record<string, string>,
  assets: Record<string, string>,
  instruction: string,
): Promise<AmendOutput> {
  const patch: Record<string, string> = parseModelJson(
    await svc.glm.applyEdit(JSON.stringify(files), instruction),
  );
  const merged = { ...files, ...patch };

  const deploy = await svc.vercel.deployStatic(repo, merged, assets);

  let sha = "";
  try {
    sha = await svc.github.commitFiles(repo, patch, `edit: ${instruction}`);
  } catch {
    // best-effort; deploy already succeeded
  }

  return { files: merged, assets, sha, previewUrl: deploy.url, deployId: deploy.id };
}
