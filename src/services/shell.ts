import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { ShellService } from "./types.js";

const execAsync = promisify(exec);

/**
 * A confined shell + filesystem for the agent. Each chat gets its own workspace
 * directory. Commands run with a SCRUBBED environment — the bot's API keys are
 * never placed in the shell's env, so code/packages run there cannot read them.
 * (Note: this is not full OS isolation; see the project notes on sandboxing.)
 */
export function makeShellService(baseDir: string): ShellService {
  async function workspace(chatId: number): Promise<string> {
    const dir = path.join(baseDir, String(chatId));
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /** Resolve a relative path and refuse anything that escapes the workspace. */
  function safeResolve(ws: string, rel: string): string {
    const resolved = path.resolve(ws, rel);
    if (resolved !== ws && !resolved.startsWith(ws + path.sep)) {
      throw new Error("Path escapes the workspace");
    }
    return resolved;
  }

  /** Minimal environment — deliberately excludes every API key. */
  function scrubbedEnv(ws: string): NodeJS.ProcessEnv {
    return {
      PATH: process.env.PATH,
      HOME: ws,
      LANG: process.env.LANG ?? "C.UTF-8",
      NODE_ENV: "development",
    };
  }

  async function runBash(chatId: number, command: string): Promise<string> {
    if (!command.trim()) return "No command provided.";
    const ws = await workspace(chatId);
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: ws,
        env: scrubbedEnv(ws),
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
        shell: "/bin/bash",
      });
      const out = stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
      return out.trim().slice(0, 8000) || "(command produced no output)";
    } catch (e) {
      const err = e as { message: string; stdout?: string; stderr?: string };
      return `Command failed: ${err.message}\n${err.stdout ?? ""}\n${err.stderr ?? ""}`.slice(0, 8000);
    }
  }

  async function write(chatId: number, relPath: string, content: string): Promise<string> {
    const ws = await workspace(chatId);
    const target = safeResolve(ws, relPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    return `Wrote ${relPath}`;
  }

  async function read(chatId: number, relPath: string): Promise<string> {
    const ws = await workspace(chatId);
    return (await readFile(safeResolve(ws, relPath), "utf8")).slice(0, 8000);
  }

  async function list(chatId: number, relPath: string): Promise<string> {
    const ws = await workspace(chatId);
    const entries = await readdir(safeResolve(ws, relPath || "."), { withFileTypes: true });
    return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).join("\n") || "(empty)";
  }

  return { runBash, writeFile: write, readFile: read, listFiles: list };
}
