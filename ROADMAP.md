# Freedom Calculator — Project Roadmap

## What this is

A "vitaminized" financial independence (FIRE) calculator, built as a learning project to:

- Learn a modern frontend framework (coming from vanilla JS).
- Practice working with an AI coding assistant (Claude Code) in a deliberate way — not just generating code, but understanding it.
- Explore a small set of adjacent skills (MCP integration, lightweight monetization, multi-user backend, LLM integration, and eventually model fine-tuning) without forcing them all into the same release.

This is not a commercial product. The goal is learning, portfolio value, and having fun. If the result is also useful to other people, great — and if someone wants to fork it and build their own version with AI assistance, that's perfectly fine too.

## Guiding principles

- **Each phase should end in something complete and presentable**, not a half-finished mega-project. A small, polished tool is better than a large, incomplete one.
- **No recurring costs.** Everything should run on free tiers and self-hosted infrastructure (existing home server). If a feature would introduce a real cost risk, it gets scoped down or made optional.
- **Learning over automation.** Where a phase's main goal is learning a new skill (e.g. a frontend framework), AI assistance is used deliberately — to accelerate repetition of patterns already understood, not to replace understanding them in the first place.
- **Decoupled phases.** Later phases (multi-user backend, LLM assistant, fine-tuning) are optional add-ons that can be skipped, delayed, or dropped without invalidating earlier phases.

---

## Phase A — The core calculator (frontend framework)

**Goal:** A fully functional, interactive FIRE calculator built with a modern frontend framework (React).

**Why this phase exists:** This is the actual learning target — moving from vanilla JS/DOM manipulation to a component-based framework with managed state, derived values, and reusable UI pieces.

**Scope:**
- User inputs: current savings, monthly contributions, expected return rate, target annual expenses, etc.
- Derived/calculated outputs: projected net worth over time, estimated years to FIRE, safe withdrawal rate scenarios.
- Basic visualization of projections (charts).
- No backend, no LLM, no ads, no persistence beyond local browser storage.

**Definition of done:** A self-contained frontend app, deployable as static files, that works fully offline and is useful on its own.

---

## Phase B — Data export for external LLM use

**Goal:** Let users export their inputs and calculated results in a clean, structured format (Markdown, CSV, all bundled in a single archive) that they can paste/upload into any LLM of their choice for unlimited, free-form analysis.

**Why this phase exists:** This is the highest-value, lowest-cost feature in the whole project. It gives users access to "unlimited" AI analysis without the project owner paying for it, and without depending on any specific provider.

**Scope:**
- "Export" feature producing a clean summary of all inputs and computed results.
- Formats: Markdown (for pasting into chat-based LLMs), CSV/tables (for spreadsheet use), bundled together (e.g. a zip archive).
- No AI calls involved — purely a formatting/export feature.

**Definition of done:** A user can fill in the calculator and export a self-contained bundle that an LLM (any provider) can meaningfully analyze without further context.

---

## Phase C — Lightweight monetization (AdSense)

**Goal:** Add a small, unobtrusive ad placement, purely to learn how ad monetization integration works in practice — and to capture whatever minimal traffic the project gets from this point onward.

**Why this phase exists:** Educational — understanding the AdSense integration process, consent requirements, and basic compliance considerations (cookie consent, privacy policy) relevant to EU users. Placed early (right after the app becomes genuinely useful via export) so that any incidental traffic from here on is "captured", before the project moves into backend-heavy phases that take longer to ship.

**Important constraints:**
- Minimal, small ad placement(s) — not a primary feature of the project, and not expected to generate meaningful revenue.
- Must include whatever consent/privacy notices are legally appropriate for the target audience.

**Definition of done:** A working, minimal ad integration with appropriate consent handling, documented as "explored for learning purposes."

---

## Phase D — MCP support (single-session)

**Goal:** Expose the user's calculator data through a Model Context Protocol (MCP) server, so any MCP-compatible LLM client (Claude Desktop, etc.) can connect directly to that data — without requiring persistent user accounts.

**Why this phase exists:** MCP is a current, actively evolving protocol, and building a real MCP server is a more specific and differentiating skill than a basic "call an LLM API" integration. This phase focuses on learning the protocol itself — defining tools/resources, handling connections — in the simplest viable shape.

**Scope:**
- A session-scoped MCP server: the user fills in the calculator, opts in to "activate MCP for this session", and receives a temporary endpoint/token (e.g. valid for the session or a few hours) to paste into their MCP client configuration.
- Tools/resources exposing the user's inputs and computed results to the connected LLM.
- No persistent accounts, no long-lived credentials.

**Definition of done:** A user can connect an MCP-compatible LLM client to a temporary endpoint and have it read their calculator data for that session.

---

## Phase E — Multi-user backend (optional, decoupled)

**Goal:** Turn the session-scoped MCP support from Phase D into a persistent, per-user setup: accounts, authentication, a real database, and long-lived per-user MCP credentials.

**Why this phase exists:** This is structurally a full backend application — authentication, session management, a multi-user database, and access control for an exposed MCP server. It has standalone portfolio value ("implemented authentication, multi-user session management, and access control for an MCP server") independent of whether the calculator strictly needs it.

**Important notes:**
- **Explicitly optional and decoupled.** Phases A–D should be fully usable and presentable without this phase.
- Only pursued if there's genuine interest in going deeper into backend/auth work.

**Definition of done:** Users can create an account, and their MCP endpoint/credentials persist across sessions, with proper access control (each user only sees their own data).

---

## Phase F — Optional in-app LLM assistant

**Goal:** An optional, lightweight in-app assistant that comments on the user's inputs and helps sketch a plan, using a free-tier LLM (e.g. Gemini Flash).

**Why this phase exists:** Adds a "wow factor" and demonstrates a basic LLM API integration end-to-end (frontend + backend), while staying within free-tier limits. By this point, MCP support (Phase D) already covers the more advanced/differentiating LLM integration story — this phase is a smaller, complementary addition.

**Important constraints:**
- Must use a free-tier model to avoid recurring costs.
- Free-tier rate limits are shared across all users of a deployed instance — acceptable for a personal/portfolio-scale project, but explicitly **not** designed to scale to high traffic. If usage ever approached the limit, the feature would degrade gracefully (e.g. disabled with a friendly message) rather than incur cost.
- Requires a small backend component (to avoid exposing API keys client-side) — fits naturally into the existing self-hosted home server setup.
- Users are never required to use this feature — Phase B (export) and Phase D (MCP) remain the primary paths for AI-assisted analysis.

**Definition of done:** The assistant works end-to-end for normal personal usage, with rate limiting in place, and degrades gracefully if limits are hit.

---

## Phase G — Fine-tuned local model (decoupled, future project)

**Goal:** Fine-tune a small open-source language model (using QLoRA) for the kind of financial-planning commentary used in Phase F, and serve it locally (e.g. on existing home server hardware) as a free, self-hosted alternative to the external LLM API.

**Why this phase exists:** This is a substantial project in its own right — dataset preparation, fine-tuning, evaluation, and serving a quantized model efficiently. It has standalone portfolio value independent of the calculator.

**Important notes:**
- **Explicitly decoupled in time** from all previous phases. This is a "next season" project, not a blocker for considering the calculator complete.
- If completed, it can optionally replace or complement the Phase F assistant — but earlier phases should be fully usable without it.

**Definition of done:** A fine-tuned model, evaluated and documented as its own project, optionally integrated back into the calculator as an alternative backend for Phase F.

---

## Status

| Phase | Status |
|-------|--------|
| A — Core calculator | Not started |
| B — Data export | Not started |
| C — Lightweight monetization | Not started |
| D — MCP support (single-session) | Not started |
| E — Multi-user backend | Not started |
| F — In-app LLM assistant | Not started |
| G — Fine-tuned local model | Not started |

This roadmap is a living document and will be updated as decisions are made or priorities change.
