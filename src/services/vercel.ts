import type { VercelService } from "./types.js";

const API = "https://api.vercel.com";

/**
 * Vercel REST API. We deploy files inline as a static site (no GitHub link, no
 * build step), which is the most reliable path for the single-page sites we
 * generate. promoteToProduction makes a preview the production deployment.
 */
export function makeVercelService(token: string): VercelService {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function deployStatic(
    name: string,
    files: Record<string, string>,
    assets: Record<string, string> = {},
  ): Promise<{ id: string; url: string }> {
    const fileList = [
      ...Object.entries(files).map(([file, data]) => ({ file, data })),
      ...Object.entries(assets).map(([file, data]) => ({ file, data, encoding: "base64" })),
    ];
    const res = await fetch(`${API}/v13/deployments`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        name: name.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90),
        files: fileList,
        projectSettings: { framework: null },
        target: "preview",
      }),
    });
    const data = (await res.json()) as { id?: string; url?: string; error?: { message: string } };
    if (!res.ok || !data.id) {
      console.error(`[vercel] deploy failed (${res.status}):`, JSON.stringify(data).slice(0, 800));
      throw new Error(`Vercel deploy failed (${res.status}): ${data.error?.message ?? "see logs"}`);
    }
    return { id: data.id, url: `https://${data.url}` };
  }

  async function promoteToProduction(deploymentId: string): Promise<void> {
    await fetch(`${API}/v13/deployments/${deploymentId}/promote`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(30_000),
    });
  }

  return { deployStatic, promoteToProduction };
}
