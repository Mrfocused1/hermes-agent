import { Octokit } from "@octokit/rest";
import type { GithubService } from "./types.js";

export function makeGithubService(token: string, owner: string): GithubService {
  const gh = new Octokit({ auth: token });

  async function createRepo(name: string): Promise<void> {
    await gh.repos.createForAuthenticatedUser({ name, private: false, auto_init: true });
  }

  /** Commit a set of files (path -> contents) to main. Returns the new SHA. */
  async function commitFiles(
    repo: string,
    files: Record<string, string>,
    message: string,
  ): Promise<string> {
    const ref = await gh.git.getRef({ owner, repo, ref: "heads/main" });
    const baseSha = ref.data.object.sha;
    const baseCommit = await gh.git.getCommit({ owner, repo, commit_sha: baseSha });

    const tree = await gh.git.createTree({
      owner,
      repo,
      base_tree: baseCommit.data.tree.sha,
      tree: Object.entries(files).map(([path, content]) => ({
        path,
        mode: "100644",
        type: "blob",
        content,
      })),
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
