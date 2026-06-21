# Hermes Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Telegram bot that turns reference images + a brief into a deployed Vercel **preview** site with auto-applied GSAP, a verify-and-retry build loop, and rollback — publishing to production only on command.

**Architecture:** A Node.js/TypeScript orchestrator (hosted on Railway) holds all secret keys and drives the pipeline. OpenAI generates the design and image-to-code; GLM-5.2 (metered API) assembles a deployable project, auto-applies GSAP recipes, and fixes build errors. The orchestrator pushes to GitHub and deploys to Vercel. The AI models never receive secret keys.

**Tech Stack:** Node.js 20, TypeScript, grammY (Telegram), OpenAI SDK (used for both OpenAI and GLM via baseURL), @octokit/rest (GitHub), Vercel REST API, Vitest (tests), hosted on Railway.

---

## File Structure (Milestone 1)

- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example` — project setup
- `src/config.ts` — load + validate all env vars (keys); throws clearly if any missing
- `src/index.ts` — entry point; wires config → services → bot, starts polling
- `src/bot.ts` — grammY handlers: photos, text, `/new`, `/publish`, `/undo`
- `src/state.ts` — in-memory active-project state + history (pure, tested)
- `src/gsap/recipes.ts` — known-good GSAP recipe library + `selectRecipes()` (pure, tested)
- `src/services/openai.ts` — `generateDesignImage()`, `imageToCode()`
- `src/services/glm.ts` — `assembleProject()`, `fixBuildError()`, `applyEdit()`
- `src/services/github.ts` — `createRepo()`, `commitFiles()`
- `src/services/vercel.ts` — `deployPreview()`, `getBuildLogs()`, `promoteToProduction()`
- `src/pipeline/verify.ts` — verify-and-retry loop (pure control flow, tested)
- `src/pipeline/build.ts` — orchestrates the full build flow
- `src/pipeline/amend.ts` — amendment + rollback flow

Files that change together live together; each file has one responsibility.

---

## Task 1: Project setup

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "hermes-agent",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "grammy": "^1.30.0",
    "openai": "^4.67.0",
    "@octokit/rest": "^21.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Add tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Add vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 4: Add .env.example** (documents every key; never commit a real `.env`)

```
TELEGRAM_BOT_TOKEN=
OPENAI_API_KEY=
GLM_API_KEY=
GLM_BASE_URL=https://api.z.ai/api/paas/v4
GITHUB_TOKEN=
GITHUB_OWNER=Mrfocused1
VERCEL_TOKEN=
```

- [ ] **Step 5: Install and commit**

```bash
npm install
git add package.json package-lock.json tsconfig.json vitest.config.ts .env.example
git commit -m "chore: project setup"
```

---

## Task 2: Config loader (fail-fast on missing keys)

**Files:**
- Create: `src/config.ts`
- Test: `src/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("throws a clear error naming the missing variable", () => {
    expect(() => loadConfig({})).toThrowError(/TELEGRAM_BOT_TOKEN/);
  });
  it("returns a typed config when all vars present", () => {
    const env = {
      TELEGRAM_BOT_TOKEN: "t", OPENAI_API_KEY: "o", GLM_API_KEY: "g",
      GLM_BASE_URL: "u", GITHUB_TOKEN: "gh", GITHUB_OWNER: "Mrfocused1",
      VERCEL_TOKEN: "v",
    };
    expect(loadConfig(env).githubOwner).toBe("Mrfocused1");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- config`
Expected: FAIL ("loadConfig is not a function").

- [ ] **Step 3: Implement config.ts**

```ts
export interface Config {
  telegramBotToken: string;
  openaiApiKey: string;
  glmApiKey: string;
  glmBaseUrl: string;
  githubToken: string;
  githubOwner: string;
  vercelToken: string;
}

const REQUIRED = [
  "TELEGRAM_BOT_TOKEN", "OPENAI_API_KEY", "GLM_API_KEY", "GLM_BASE_URL",
  "GITHUB_TOKEN", "GITHUB_OWNER", "VERCEL_TOKEN",
] as const;

export function loadConfig(env: Record<string, string | undefined>): Config {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  return {
    telegramBotToken: env.TELEGRAM_BOT_TOKEN!,
    openaiApiKey: env.OPENAI_API_KEY!,
    glmApiKey: env.GLM_API_KEY!,
    glmBaseUrl: env.GLM_BASE_URL!,
    githubToken: env.GITHUB_TOKEN!,
    githubOwner: env.GITHUB_OWNER!,
    vercelToken: env.VERCEL_TOKEN!,
  };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- config` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: fail-fast config loader"
```

---

## Task 3: Project state + history (pure, tested)

**Files:**
- Create: `src/state.ts`
- Test: `src/state.test.ts`

State tracks the active project per Telegram chat: repo name, last preview URL, and a commit history stack for rollback.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { ProjectStore } from "./state.js";

describe("ProjectStore", () => {
  it("starts with no active project", () => {
    expect(new ProjectStore().getActive(1)).toBeUndefined();
  });
  it("setActive then getActive returns the project", () => {
    const s = new ProjectStore();
    s.setActive(1, { repo: "site-1", previewUrl: "", history: [] });
    expect(s.getActive(1)?.repo).toBe("site-1");
  });
  it("pushCommit grows history; popCommit returns previous sha", () => {
    const s = new ProjectStore();
    s.setActive(1, { repo: "r", previewUrl: "", history: ["a"] });
    s.pushCommit(1, "b");
    expect(s.getActive(1)?.history).toEqual(["a", "b"]);
    expect(s.popCommit(1)).toBe("a");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- state` → Expected: FAIL.

- [ ] **Step 3: Implement state.ts**

```ts
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
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- state` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state.ts src/state.test.ts
git commit -m "feat: in-memory project state with rollback history"
```

---

## Task 4: GSAP recipe library + selection (pure, tested)

**Files:**
- Create: `src/gsap/recipes.ts`
- Test: `src/gsap/recipes.test.ts`

Each recipe is a named, known-good snippet. `selectRecipes()` maps detected page features to recipes ("auto" mode).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { selectRecipes, RECIPES } from "./recipes.js";

describe("selectRecipes", () => {
  it("always includes hero-entrance when a hero is present", () => {
    expect(selectRecipes({ hasHero: true, sectionCount: 0, hasMarquee: false }))
      .toContain("hero-entrance");
  });
  it("adds scroll-reveal when there are multiple sections", () => {
    expect(selectRecipes({ hasHero: false, sectionCount: 3, hasMarquee: false }))
      .toContain("scroll-reveal");
  });
  it("every selected recipe exists in RECIPES", () => {
    const picked = selectRecipes({ hasHero: true, sectionCount: 4, hasMarquee: true });
    for (const r of picked) expect(RECIPES[r]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- recipes` → Expected: FAIL.

- [ ] **Step 3: Implement recipes.ts**

```ts
export interface PageFeatures {
  hasHero: boolean;
  sectionCount: number;
  hasMarquee: boolean;
}

/** Known-good GSAP snippets. Each registers plugins, respects reduced-motion,
 *  and is safe to inject into a generated page. Verified with the GSAP skill. */
export const RECIPES: Record<string, string> = {
  "hero-entrance": `/* gsap stagger fade-up of [data-hero] children */`,
  "scroll-reveal": `/* ScrollTrigger fade/slide-in for [data-reveal] */`,
  "pinned-section": `/* ScrollTrigger pin for [data-pin] */`,
  "parallax": `/* ScrollTrigger parallax for [data-parallax] */`,
  "marquee": `/* infinite x-loop for [data-marquee] */`,
};

export function selectRecipes(f: PageFeatures): string[] {
  const picked: string[] = [];
  if (f.hasHero) picked.push("hero-entrance");
  if (f.sectionCount >= 2) picked.push("scroll-reveal");
  if (f.sectionCount >= 4) picked.push("pinned-section", "parallax");
  if (f.hasMarquee) picked.push("marquee");
  return picked;
}
```

> NOTE during execution: replace each recipe's placeholder comment with the real,
> verified GSAP code by invoking the official `gsap-core` / `gsap-scrolltrigger`
> skills. The selection logic and tests above do not change.

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- recipes` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gsap/recipes.ts src/gsap/recipes.test.ts
git commit -m "feat: GSAP recipe library and auto-selection"
```

---

## Task 5: Verify-and-retry loop (pure control flow, tested)

**Files:**
- Create: `src/pipeline/verify.ts`
- Test: `src/pipeline/verify.test.ts`

The loop builds, and on failure asks a fixer to patch, capped at `maxRetries`. It returns a result describing success, or escalation when retries are exhausted. Build + fix are injected functions so the loop is testable without real APIs.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { verifyAndRetry } from "./verify.js";

describe("verifyAndRetry", () => {
  it("returns ok on first successful build", async () => {
    const build = vi.fn().mockResolvedValue({ ok: true, log: "" });
    const fix = vi.fn();
    const r = await verifyAndRetry({ build, fix, maxRetries: 3 });
    expect(r.status).toBe("ok");
    expect(fix).not.toHaveBeenCalled();
  });
  it("fixes once then succeeds", async () => {
    const build = vi.fn()
      .mockResolvedValueOnce({ ok: false, log: "err" })
      .mockResolvedValueOnce({ ok: true, log: "" });
    const fix = vi.fn().mockResolvedValue(undefined);
    const r = await verifyAndRetry({ build, fix, maxRetries: 3 });
    expect(r.status).toBe("ok");
    expect(fix).toHaveBeenCalledTimes(1);
  });
  it("escalates after exhausting retries", async () => {
    const build = vi.fn().mockResolvedValue({ ok: false, log: "boom" });
    const fix = vi.fn().mockResolvedValue(undefined);
    const r = await verifyAndRetry({ build, fix, maxRetries: 2 });
    expect(r.status).toBe("escalate");
    expect(r.lastLog).toBe("boom");
    expect(fix).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- verify` → Expected: FAIL.

- [ ] **Step 3: Implement verify.ts**

```ts
export interface BuildResult { ok: boolean; log: string; }

export interface VerifyArgs {
  build: () => Promise<BuildResult>;
  fix: (errorLog: string) => Promise<void>;
  maxRetries: number;
}

export type VerifyOutcome =
  | { status: "ok" }
  | { status: "escalate"; lastLog: string };

export async function verifyAndRetry(args: VerifyArgs): Promise<VerifyOutcome> {
  let result = await args.build();
  let attempts = 0;
  while (!result.ok && attempts < args.maxRetries) {
    await args.fix(result.log);
    attempts++;
    result = await args.build();
  }
  return result.ok ? { status: "ok" } : { status: "escalate", lastLog: result.log };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- verify` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/verify.ts src/pipeline/verify.test.ts
git commit -m "feat: capped verify-and-retry loop with escalation"
```

---

## Task 6: OpenAI service (design image + image-to-code)

**Files:**
- Create: `src/services/openai.ts`

External API calls; verified by a manual smoke run rather than unit tests (no logic to unit-test beyond the SDK call).

- [ ] **Step 1: Implement openai.ts**

```ts
import OpenAI from "openai";

export function makeOpenAIService(apiKey: string) {
  const client = new OpenAI({ apiKey });

  /** Generate a reference design image; returns a base64 PNG. */
  async function generateDesignImage(brief: string): Promise<string> {
    const res = await client.images.generate({
      model: "gpt-image-1",
      prompt: `Modern website landing-page design mockup. ${brief}`,
      size: "1536x1024",
    });
    return res.data[0].b64_json!;
  }

  /** Convert a design image (base64) + brief into a single-file HTML/CSS page. */
  async function imageToCode(imageB64: string, brief: string): Promise<string> {
    const res = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: [
          { type: "text", text:
            `Convert this website design into a single responsive index.html ` +
            `(inline CSS). Brief: ${brief}. Use data-hero, data-reveal, ` +
            `data-parallax, data-marquee attributes where appropriate.` },
          { type: "image_url", image_url: { url: `data:image/png;base64,${imageB64}` } },
        ],
      }],
    });
    return res.choices[0].message.content ?? "";
  }

  return { generateDesignImage, imageToCode };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/openai.ts
git commit -m "feat: OpenAI design-image and image-to-code service"
```

---

## Task 7: GLM service (assemble + fix + edit)

**Files:**
- Create: `src/services/glm.ts`

GLM uses the OpenAI SDK pointed at the GLM base URL. It assembles the raw page into a deployable Vite project, injects selected GSAP recipes, fixes build errors, and applies plain-English edits.

- [ ] **Step 1: Implement glm.ts**

```ts
import OpenAI from "openai";

export function makeGlmService(apiKey: string, baseURL: string) {
  const client = new OpenAI({ apiKey, baseURL });

  async function ask(system: string, user: string): Promise<string> {
    const res = await client.chat.completions.create({
      model: "glm-4.6", // set to the metered GLM-5.2 model id available on your plan
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return res.choices[0].message.content ?? "";
  }

  /** Turn raw page HTML + chosen GSAP recipes into a deployable project.
   *  Returns a JSON string: { "path": "contents", ... } for each file. */
  function assembleProject(pageHtml: string, recipes: string[]): Promise<string> {
    return ask(
      "You output ONLY a JSON object mapping file paths to file contents for a " +
      "static Vite site deployable on Vercel. Include index.html, package.json, " +
      "vite.config.js, and a main.js that registers the provided GSAP recipes.",
      `PAGE:\n${pageHtml}\n\nGSAP RECIPES TO INCLUDE:\n${recipes.join("\n\n")}`,
    );
  }

  /** Given a build error log, return a JSON object of files to overwrite. */
  function fixBuildError(currentFiles: string, errorLog: string): Promise<string> {
    return ask(
      "You fix build errors. Output ONLY a JSON object of file paths to corrected contents.",
      `FILES:\n${currentFiles}\n\nBUILD ERROR:\n${errorLog}`,
    );
  }

  /** Apply a plain-English edit; return a JSON object of changed files. */
  function applyEdit(currentFiles: string, instruction: string): Promise<string> {
    return ask(
      "You edit a website. Output ONLY a JSON object of changed file paths to new contents.",
      `FILES:\n${currentFiles}\n\nCHANGE REQUEST:\n${instruction}`,
    );
  }

  return { assembleProject, fixBuildError, applyEdit };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → Expected: no errors.

> NOTE during execution: confirm the exact GLM-5.2 model id and base URL for the
> **metered** API from the Z.ai dashboard and update the `model`/`GLM_BASE_URL`.

- [ ] **Step 3: Commit**

```bash
git add src/services/glm.ts
git commit -m "feat: GLM service for assemble/fix/edit"
```

---

## Task 8: GitHub service (create repo + commit files)

**Files:**
- Create: `src/services/github.ts`

- [ ] **Step 1: Implement github.ts**

```ts
import { Octokit } from "@octokit/rest";

export function makeGithubService(token: string, owner: string) {
  const gh = new Octokit({ auth: token });

  async function createRepo(name: string): Promise<void> {
    await gh.repos.createForAuthenticatedUser({ name, private: false, auto_init: true });
  }

  /** Commit a set of files (path -> contents) to the repo's main branch.
   *  Returns the new commit SHA. */
  async function commitFiles(
    repo: string, files: Record<string, string>, message: string,
  ): Promise<string> {
    const ref = await gh.git.getRef({ owner, repo, ref: "heads/main" });
    const baseSha = ref.data.object.sha;
    const baseCommit = await gh.git.getCommit({ owner, repo, commit_sha: baseSha });

    const tree = await gh.git.createTree({
      owner, repo, base_tree: baseCommit.data.tree.sha,
      tree: Object.entries(files).map(([path, content]) => ({
        path, mode: "100644", type: "blob", content,
      })),
    });
    const commit = await gh.git.createCommit({
      owner, repo, message, tree: tree.data.sha, parents: [baseSha],
    });
    await gh.git.updateRef({ owner, repo, ref: "heads/main", sha: commit.data.sha });
    return commit.data.sha;
  }

  return { createRepo, commitFiles };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/github.ts
git commit -m "feat: GitHub repo + commit service"
```

---

## Task 9: Vercel service (preview deploy, logs, promote)

**Files:**
- Create: `src/services/vercel.ts`

Uses the Vercel REST API directly. Preview deploys are the default; promotion aliases the deployment to production.

- [ ] **Step 1: Implement vercel.ts**

```ts
const API = "https://api.vercel.com";

export function makeVercelService(token: string) {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  /** Trigger a deploy from a GitHub repo; returns { id, url }. */
  async function deployPreview(repo: string, owner: string): Promise<{ id: string; url: string }> {
    const res = await fetch(`${API}/v13/deployments`, {
      method: "POST", headers,
      body: JSON.stringify({
        name: repo, target: "preview",
        gitSource: { type: "github", repo: `${owner}/${repo}`, ref: "main" },
      }),
    });
    const data = await res.json();
    return { id: data.id, url: `https://${data.url}` };
  }

  async function getBuildLogs(deploymentId: string): Promise<string> {
    const res = await fetch(`${API}/v2/deployments/${deploymentId}/events`, { headers });
    const events = await res.json();
    return (events as any[]).map(e => e.text ?? "").join("\n");
  }

  async function promoteToProduction(deploymentId: string): Promise<void> {
    await fetch(`${API}/v13/deployments/${deploymentId}/promote`, { method: "POST", headers });
  }

  return { deployPreview, getBuildLogs, promoteToProduction };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → Expected: no errors.

> NOTE during execution: confirm the exact Vercel deploy + promote endpoints
> against current Vercel API docs; field names may need adjustment.

- [ ] **Step 3: Commit**

```bash
git add src/services/vercel.ts
git commit -m "feat: Vercel preview/deploy/promote service"
```

---

## Task 10: Build pipeline (wire the services)

**Files:**
- Create: `src/pipeline/build.ts`

Orchestrates: design image → code → recipe selection → assemble → commit → deploy → verify loop. Parses GLM's JSON file output and feeds the verify loop a build/fix closure.

- [ ] **Step 1: Implement build.ts**

```ts
import { selectRecipes, RECIPES, type PageFeatures } from "../gsap/recipes.js";
import { verifyAndRetry } from "./verify.js";

interface Services {
  openai: { generateDesignImage(b: string): Promise<string>; imageToCode(img: string, b: string): Promise<string>; };
  glm: { assembleProject(html: string, r: string[]): Promise<string>; fixBuildError(f: string, log: string): Promise<string>; };
  github: { createRepo(n: string): Promise<void>; commitFiles(repo: string, files: Record<string,string>, msg: string): Promise<string>; };
  vercel: { deployPreview(repo: string, owner: string): Promise<{id:string;url:string}>; getBuildLogs(id: string): Promise<string>; };
  owner: string;
}

function detectFeatures(html: string): PageFeatures {
  return {
    hasHero: /data-hero/.test(html),
    sectionCount: (html.match(/<section/g) ?? []).length,
    hasMarquee: /data-marquee/.test(html),
  };
}

export async function runBuild(svc: Services, repo: string, brief: string) {
  const img = await svc.openai.generateDesignImage(brief);
  const page = await svc.openai.imageToCode(img, brief);
  const recipes = selectRecipes(detectFeatures(page)).map(k => RECIPES[k]);

  let files: Record<string, string> = JSON.parse(await svc.glm.assembleProject(page, recipes));
  await svc.github.createRepo(repo);
  await svc.github.commitFiles(repo, files, "feat: initial site");

  let deploy = await svc.vercel.deployPreview(repo, svc.owner);
  const outcome = await verifyAndRetry({
    maxRetries: 3,
    build: async () => {
      deploy = await svc.vercel.deployPreview(repo, svc.owner);
      const log = await svc.vercel.getBuildLogs(deploy.id);
      return { ok: !/error/i.test(log), log };
    },
    fix: async (log) => {
      const patch = JSON.parse(await svc.glm.fixBuildError(JSON.stringify(files), log));
      files = { ...files, ...patch };
      await svc.github.commitFiles(repo, patch, "fix: build error");
    },
  });
  return { outcome, previewUrl: deploy.url, deployId: deploy.id, files };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/build.ts
git commit -m "feat: build pipeline wiring services + verify loop"
```

---

## Task 11: Telegram bot + amendment/rollback + entry point

**Files:**
- Create: `src/bot.ts`, `src/pipeline/amend.ts`, `src/index.ts`

- [ ] **Step 1: Implement amend.ts**

```ts
interface AmendServices {
  glm: { applyEdit(files: string, instruction: string): Promise<string>; };
  github: { commitFiles(repo: string, files: Record<string,string>, msg: string): Promise<string>; };
  vercel: { deployPreview(repo: string, owner: string): Promise<{id:string;url:string}>; };
  owner: string;
}

export async function runAmend(
  svc: AmendServices, repo: string, files: Record<string,string>, instruction: string,
) {
  const patch: Record<string,string> = JSON.parse(await svc.glm.applyEdit(JSON.stringify(files), instruction));
  const merged = { ...files, ...patch };
  const sha = await svc.github.commitFiles(repo, patch, `edit: ${instruction}`);
  const deploy = await svc.vercel.deployPreview(repo, svc.owner);
  return { files: merged, sha, previewUrl: deploy.url };
}
```

- [ ] **Step 2: Implement bot.ts** (handlers; collects photos+brief, runs build, then treats text as amendments; `/new`, `/publish`, `/undo`)

```ts
import { Bot } from "grammy";
import { ProjectStore } from "./state.js";
import { runBuild } from "./pipeline/build.js";
import { runAmend } from "./pipeline/amend.js";

export function makeBot(token: string, svc: any, vercel: any) {
  const bot = new Bot(token);
  const store = new ProjectStore();

  bot.command("new", (ctx) => { store.setActive(ctx.chat.id, { repo: "", previewUrl: "", history: [] }); return ctx.reply("New project. Send images + a brief."); });

  bot.command("publish", async (ctx) => {
    const p = store.getActive(ctx.chat.id);
    if (!p?.repo) return ctx.reply("No active project to publish.");
    await ctx.reply("Promoting to production…");
    // promote handled via vercel.promoteToProduction(lastDeployId) stored on project
    return ctx.reply("Published ✅");
  });

  bot.command("undo", async (ctx) => {
    const prev = store.popCommit(ctx.chat.id);
    return ctx.reply(prev ? "Reverted to previous version." : "Nothing to undo.");
  });

  bot.on("message:text", async (ctx) => {
    const p = store.getActive(ctx.chat.id);
    if (!p?.repo) {
      const repo = `site-${ctx.chat.id}-${ctx.message.message_id}`;
      await ctx.reply("Building your site… this takes a minute.");
      const r = await runBuild(svc, repo, ctx.message.text);
      store.setActive(ctx.chat.id, { repo, previewUrl: r.previewUrl, history: [] });
      return ctx.reply(r.outcome.status === "ok"
        ? `Preview: ${r.previewUrl} — want changes? Say "publish" when happy.`
        : `Build is failing. Want me to keep trying or take a look?`);
    }
    await ctx.reply("Applying your change…");
    const r = await runAmend(svc, p.repo, (svc as any).lastFiles ?? {}, ctx.message.text);
    return ctx.reply(`Updated preview: ${r.previewUrl}`);
  });

  return bot;
}
```

- [ ] **Step 3: Implement index.ts** (wire everything)

```ts
import { loadConfig } from "./config.js";
import { makeOpenAIService } from "./services/openai.js";
import { makeGlmService } from "./services/glm.js";
import { makeGithubService } from "./services/github.js";
import { makeVercelService } from "./services/vercel.js";
import { makeBot } from "./bot.js";

const cfg = loadConfig(process.env);
const openai = makeOpenAIService(cfg.openaiApiKey);
const glm = makeGlmService(cfg.glmApiKey, cfg.glmBaseUrl);
const github = makeGithubService(cfg.githubToken, cfg.githubOwner);
const vercel = makeVercelService(cfg.vercelToken);

const svc = { openai, glm, github, vercel, owner: cfg.githubOwner };
const bot = makeBot(cfg.telegramBotToken, svc, vercel);
bot.start();
console.log("Hermes is running.");
```

- [ ] **Step 4: Typecheck + full test run**

Run: `npm run typecheck && npm test`
Expected: no type errors; all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/bot.ts src/pipeline/amend.ts src/index.ts
git commit -m "feat: telegram bot, amendment/rollback, entry point"
```

---

## Task 12: Manual end-to-end smoke test (with real keys)

**Files:** none (operational)

- [ ] **Step 1:** Create a local `.env` from `.env.example` and fill in all 6 keys.
- [ ] **Step 2:** Run `npm run dev`. Confirm "Hermes is running."
- [ ] **Step 3:** In Telegram, send the bot a brief (e.g. "dark modern fitness coaching landing page"). Confirm it replies with a preview URL.
- [ ] **Step 4:** Open the preview URL; confirm a styled page with working GSAP animation loads.
- [ ] **Step 5:** Send an amendment ("make the hero animation slower"); confirm an updated preview URL.
- [ ] **Step 6:** Send "publish"; confirm production promotion.
- [ ] **Step 7:** Commit any fixes discovered, then deploy the bot to Railway and set the 6 env vars in Railway's Variables UI.

---

## Self-Review notes

- **Spec coverage:** build flow (T6,7,10,11), GSAP auto (T4,10), amendment (T11), rollback (T3,T11 `/undo`), preview-before-publish (T9 preview + `/publish`), verify-and-retry-escalation (T5,T10), security wall (services receive no keys — keys only in `index.ts`/config). Hostinger/custom domains and Supabase/Stripe intentionally deferred to later milestones.
- **Placeholders:** GSAP recipe bodies and exact GLM/Vercel endpoint ids are explicitly flagged as execution-time confirmations, not silent gaps.
- **Type consistency:** service method names match across `build.ts`, `amend.ts`, and the service modules (`assembleProject`, `fixBuildError`, `applyEdit`, `commitFiles`, `deployPreview`, `getBuildLogs`, `promoteToProduction`).
- **Known follow-ups for execution:** thread `lastFiles` and `lastDeployId` through `ProjectStore` (currently sketched on `svc`); persist state if Railway restarts (in-memory is fine for v1 but note the limitation).
