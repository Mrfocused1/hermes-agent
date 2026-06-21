# Hermes — Telegram Site-Building Agent

**Date:** 2026-06-21
**Status:** Design approved, pending spec review

## 1. Summary

A Telegram bot ("Hermes") that turns a short brief plus reference images into a
live, animated website with almost no manual steps. You message it images and a
description; it generates a design, builds a deployable site with GSAP
animations, deploys a private preview, and lets you refine the result in plain
English before publishing. The bot orchestrates the whole pipeline; the AI
design models never see your secret keys.

## 2. Goals / Non-Goals

**Goals (v1):**
- Send images + a brief in Telegram → get a live preview site back.
- Beautiful design quality (OpenAI image + image-to-code).
- GSAP animations auto-applied, chosen by the agent.
- Refine the result conversationally ("slower hero", "swap image").
- Nothing goes public until you say "publish".
- The bot never silently ships a broken site.

**Non-Goals (v1):**
- No databases, auth, payments, or file storage (those are v2/v3).
- No custom domains in the first milestone (Milestone 3).
- No multi-project memory beyond "the most recent project is active".

## 3. Architecture — two walls, three brains, one orchestrator

- **Orchestrator** (the bot, hosted on Railway): holds ALL secret keys, runs the
  loop, talks to GitHub / Vercel / Hostinger itself.
- **OpenAI API**: generates the reference design image, then converts it to site
  code (the design quality the user values).
- **GLM-5.2 API** (metered standalone API, NOT the Coding Plan): assembles the
  code into a deployable project, auto-applies GSAP, fixes build errors, and
  applies later edits.

**Security wall:** OpenAI and GLM only ever receive the creative task and the
current code. They never receive GitHub / Vercel / Hostinger secrets. All keys
live in the orchestrator's environment on Railway.

## 4. Build flow (starting a project)

1. Telegram: user sends reference images (landscape + vertical) + a short brief.
2. OpenAI generates the reference design image(s).
3. OpenAI converts the image → site code.
4. GLM assembles a deployable project and auto-applies GSAP recipes it judges
   to suit the design, drawn from a known-good recipe library.
5. Orchestrator creates a GitHub repo, commits, pushes.
6. **Verify-and-retry loop** runs (see §7).
7. Vercel builds a **preview deployment** (not production).
8. Bot replies with the **preview URL**: "Here's the preview — want changes?"

## 5. Amendment flow (review & refine)

- User replies in plain English ("slower hero animation", "swap the hero
  image", "remove the parallax").
- Orchestrator sends the current code + the instruction to GLM, gets the edit,
  commits, re-runs the verify loop, redeploys the preview, replies with the
  updated preview URL.
- **Rollback:** user can say "go back" / "undo" to revert to the previous commit
  and redeploy.
- **State:** the most recent project is the "active" one. "New project" starts
  fresh. No database needed in v1.

## 6. Publish flow

- When happy, user says "publish".
- Orchestrator promotes the preview to the Vercel **production** deployment.
- (Milestone 3) User says "use mydomain.com" → orchestrator uses the Hostinger
  API to point that domain's DNS at the Vercel production deployment.

## 7. Verify-and-retry loop (reliability backbone)

- After every code change, the orchestrator runs the **actual build** (or reads
  Vercel's real build logs) — ground truth, never GLM's self-report.
- On failure, it feeds the real error back to GLM to fix.
- Capped at **N retries** with a **token budget**.
- If still failing, it **escalates to the user in Telegram** instead of looping
  forever or shipping a broken site.

## 8. GSAP handling

- A small library of **proven, known-good GSAP recipes** ships with the
  orchestrator: hero entrance, scroll reveal, pinned section, parallax, marquee.
- Each recipe is correct by construction: plugin registration,
  `prefers-reduced-motion` support, and cleanup on unmount.
- The agent's job is to **map recipes to elements**, not improvise animation
  engineering. "Auto" mode = the agent picks recipes that suit the design.
- The official GSAP skill is used at build time to verify recipe correctness.
- Output framework chosen with GSAP/SSR in mind (static/Vite build or Next.js
  with the `useGSAP` hook + `'use client'`).

## 9. Accounts & secrets (one-time setup)

- Telegram bot token (BotFather)
- GLM-5.2 **standalone metered API key** (not the Coding Plan)
- OpenAI **API credits** (separate from ChatGPT Plus)
- GitHub token
- Vercel token
- Hostinger API token (Milestone 3)
- Railway account (hosts the bot)

## 10. Milestones

- **Milestone 1:** brief + images → preview site with auto-GSAP, verify-and-retry
  loop, and rollback. ("Publish" promotes to production.)
- **Milestone 2:** the amendment loop fully fleshed out (conversational edits).
- **Milestone 3:** Hostinger custom-domain wiring.

## 11. Future versions (out of scope now)

- **v2 — Supabase:** storage, auth, a database (forms, leads, content). Turns
  static sites into dynamic web apps.
- **v3 — Stripe:** payments. Depends on a backend (Supabase/serverless) existing
  first; highest risk (money, webhooks, security), so it comes after the verify
  loop and preview gate are rock-solid.
- A lightweight **security scan** becomes mandatory once a real backend exists.
- Nice-to-have polish: mobile screenshot check, SEO/meta auto-fill, visual
  self-comparison of the deployed screenshot vs. the reference image.

## 12. Honest risks

- **OpenAI image→code** usually yields a single page/snippet, not a full app —
  GLM's assembly step is what makes it deployable. Verify this handoff early.
- **GSAP + framework SSR** quirks — mitigated by verified recipes + the GSAP skill.
- **Auto-animation taste** — "auto" guesses; the amendment loop is the cheap
  safety net.
- **Cost** — metered APIs, realistically well under a dollar or two per site, but
  the verify loop's token budget caps runaway spend.
