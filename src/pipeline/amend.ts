import { parseModelJson } from "../services/json.js";
import type { Services } from "../services/types.js";

export interface AmendOutput {
  files: Record<string, string>;
  sha: string;
  previewUrl: string;
  deployId: string;
}

/** Apply a plain-English edit to an existing project and redeploy a preview. */
export async function runAmend(
  svc: Services,
  repo: string,
  files: Record<string, string>,
  instruction: string,
): Promise<AmendOutput> {
  const patch: Record<string, string> = parseModelJson(
    await svc.glm.applyEdit(JSON.stringify(files), instruction),
  );
  const merged = { ...files, ...patch };
  const sha = await svc.github.commitFiles(repo, patch, `edit: ${instruction}`);
  const deploy = await svc.vercel.deployPreview(repo, svc.owner);
  return { files: merged, sha, previewUrl: deploy.url, deployId: deploy.id };
}
