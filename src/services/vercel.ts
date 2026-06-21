import type { VercelService } from "./types.js";

const API = "https://api.vercel.com";

/**
 * Vercel REST API. Preview is the default target; promotion makes the chosen
 * deployment the production one. Confirm exact endpoints/fields against current
 * Vercel API docs during the live smoke test.
 */
export function makeVercelService(token: string): VercelService {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function deployPreview(
    repo: string,
    owner: string,
  ): Promise<{ id: string; url: string }> {
    const res = await fetch(`${API}/v13/deployments`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        name: repo,
        target: "preview",
        gitSource: { type: "github", repo: `${owner}/${repo}`, ref: "main" },
      }),
    });
    const data = (await res.json()) as { id?: string; url?: string; error?: { message: string } };
    if (!res.ok || !data.id) {
      console.error(`[vercel] deploy failed (${res.status}):`, JSON.stringify(data).slice(0, 500));
      throw new Error(`Vercel deploy failed (${res.status}): ${data.error?.message ?? "see logs"}`);
    }
    return { id: data.id, url: `https://${data.url}` };
  }

  async function getBuildLogs(deploymentId: string): Promise<string> {
    const res = await fetch(`${API}/v2/deployments/${deploymentId}/events`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    const events = (await res.json()) as Array<{ text?: string }>;
    return Array.isArray(events) ? events.map((e) => e.text ?? "").join("\n") : "";
  }

  async function promoteToProduction(deploymentId: string): Promise<void> {
    await fetch(`${API}/v13/deployments/${deploymentId}/promote`, {
      method: "POST",
      headers,
    });
  }

  return { deployPreview, getBuildLogs, promoteToProduction };
}
