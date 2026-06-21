export interface Project {
  repo: string;
  previewUrl: string;
  history: string[]; // commit SHAs, oldest first
}

export class ProjectStore {
  private byChat = new Map<number, Project>();

  getActive(chatId: number): Project | undefined {
    return this.byChat.get(chatId);
  }

  setActive(chatId: number, project: Project): void {
    this.byChat.set(chatId, project);
  }

  pushCommit(chatId: number, sha: string): void {
    this.byChat.get(chatId)?.history.push(sha);
  }

  /** Removes the latest commit and returns the previous SHA (for rollback). */
  popCommit(chatId: number): string | undefined {
    const p = this.byChat.get(chatId);
    if (!p || p.history.length < 2) return undefined;
    p.history.pop();
    return p.history[p.history.length - 1];
  }
}
