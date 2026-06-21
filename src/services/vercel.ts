import type { VercelService } from "./types.js";

const API = "https://api.vercel.com";

/**
 * Vercel REST API. We deploy files inline as a static site (no GitHub link, no
 * build step), which is the most reliable path for the single-page sites we
 * generate. Publishing redeploys the same files with target "production".
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
    target: "preview" | "production" = "preview",
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
        target,
      }),
    });
    const data = (await res.json()) as {
      id?: string;
      url?: string;
      projectId?: string;
      error?: { message: string };
    };
    if (!res.ok || !data.id) {
      console.error(`[vercel] deploy failed (${res.status}):`, JSON.stringify(data).slice(0, 800));
      throw new Error(`Vercel deploy failed (${res.status}): ${data.error?.message ?? "see logs"}`);
    }
    // Make preview URLs publicly viewable (turn off Vercel Authentication).
    if (data.projectId) await disableProtection(data.projectId);
    return { id: data.id, url: `https://${data.url}` };
  }

  /** Disable Vercel Authentication + password protection so links don't 401. */
  async function disableProtection(projectId: string): Promise<void> {
    try {
      await fetch(`${API}/v9/projects/${projectId}`, {
        method: "PATCH",
        headers,
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ ssoProtection: null, passwordProtection: null }),
      });
    } catch (e) {
      console.error("[vercel] could not disable protection:", (e as Error).message);
    }
  }

  return { deployStatic };
}
