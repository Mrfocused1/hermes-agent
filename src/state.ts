import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/** A snapshot of a site at a point in time (for real undo). */
export interface Version {
  files: Record<string, string>;
  assets: Record<string, string>;
  previewUrl: string;
  deployId: string;
}

export interface Project {
  repo: string;
  files?: Record<string, string>;
  assets?: Record<string, string>;
  previewUrl: string;
  deployId?: string;
  history: Version[]; // previous versions, newest last (for undo)
}

const MAX_HISTORY = 5;

/**
 * Active project per Telegram chat, with optional JSON-file persistence so a
 * Railway redeploy doesn't lose in-flight sites. Pass a path on a mounted
 * volume (e.g. /data/state.json) for it to survive across deploys.
 */
export class ProjectStore {
  private byChat = new Map<number, Project>();
  private statePath?: string;

  constructor(statePath?: string) {
    this.statePath = statePath;
    this.load();
  }

  private load(): void {
    if (!this.statePath) return;
    try {
      const obj = JSON.parse(readFileSync(this.statePath, "utf8")) as Record<string, Project>;
      this.byChat = new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));
    } catch {
      // no state file yet — start empty
    }
  }

  private save(): void {
    if (!this.statePath) return;
    try {
      mkdirSync(path.dirname(this.statePath), { recursive: true });
      writeFileSync(this.statePath, JSON.stringify(Object.fromEntries(this.byChat)));
    } catch (e) {
      console.error("[state] save failed:", (e as Error).message);
    }
  }

  getActive(chatId: number): Project | undefined {
    return this.byChat.get(chatId);
  }

  setActive(chatId: number, project: Project): void {
    this.byChat.set(chatId, project);
    this.save();
  }

  /** Record the current version before changing it, so undo can return to it. */
  pushHistory(chatId: number, version: Version): void {
    const p = this.byChat.get(chatId);
    if (!p) return;
    p.history.push(version);
    if (p.history.length > MAX_HISTORY) p.history.shift();
    this.save();
  }

  /** Revert to the previous version (its Vercel deployment is still live). */
  undo(chatId: number): Version | undefined {
    const p = this.byChat.get(chatId);
    if (!p || p.history.length === 0) return undefined;
    const prev = p.history.pop()!;
    p.files = prev.files;
    p.assets = prev.assets;
    p.previewUrl = prev.previewUrl;
    p.deployId = prev.deployId;
    this.save();
    return prev;
  }
}
