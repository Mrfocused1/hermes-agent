import { Octokit } from "@octokit/rest";
import type { GithubService } from "./types.js";

export function makeGithubService(token: string, owner: string): GithubService {
  const gh = new Octokit({ auth: token });

  async function createRepo(name: string): Promise<void> {
    try {
      await gh.repos.createForAuthenticatedUser({ name, private: false, auto_init: true });
    } catch (e) {
      if ((e as { status?: number }).status === 422) return; // already exists — fine
      throw e;
    }
  }

  /** Commit text files (and optional binary `assets` as base64) to main.
   *  Returns the new commit SHA. */
  async function commitFiles(
    repo: string,
    files: Record<string, string>,
    message: string,
    assets: Record<string, string> = {},
  ): Promise<string> {
    const ref = await gh.git.getRef({ owner, repo, ref: "heads/main" });
    const baseSha = ref.data.object.sha;
    const baseCommit = await gh.git.getCommit({ owner, repo, commit_sha: baseSha });

    const textEntries = Object.entries(files).map(([path, content]) => ({
      path,
      mode: "100644" as const,
      type: "blob" as const,
      content,
    }));

    // Binary assets must be uploaded as base64 blobs and referenced by sha.
    const assetEntries = await Promise.all(
      Object.entries(assets).map(async ([path, base64]) => {
        const blob = await gh.git.createBlob({ owner, repo, content: base64, encoding: "base64" });
        return { path, mode: "100644" as const, type: "blob" as const, sha: blob.data.sha };
      }),
    );

    const tree = await gh.git.createTree({
      owner,
      repo,
      base_tree: baseCommit.data.tree.sha,
      tree: [...textEntries, ...assetEntries],
    });
    const commit = await gh.git.createCommit({
      owner,
      repo,
      message,
      tree: tree.data.sha,
      parents: [baseSha],
    });
    await gh.git.updateRef({ owner, repo, ref: "heads/main", sha: commit.data.sha });
    return commit.data.sha;
  }

  return { createRepo, commitFiles };
}
