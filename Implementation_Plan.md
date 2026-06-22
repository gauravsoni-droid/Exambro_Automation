# Implementation Plan — ExamBro Instagram Automation

_v2 · 2026-06-22 · Top-level build plan for the 2-dev team. Full per-phase task detail lives in `ExamBro_Implementation_Plan_By_Phase.md` — this doc adds the working agreement and sequence, and does not duplicate it._

> **v2 update (2026-06-22).** Frontend is rebuilt (Next.js app router; all pages incl. Insights shell). Backend Phase 0/1 loop works; Phase 2/3 absent. A backend-planning interview locked 19 product decisions (D1–D19) + the full Calibration-v2 spec (CD1–CD13), with 5 items parked on the owner (O1–O5). **Full decision log + open questions: `ExamBro_Open_Questions.md` (source of truth for this update).** The phase headings below are now **build-order groupings, not a staged release** — confirmed one-shot intent: Meta-gated features are built now behind a feature flag and light up when the IG token lands (D1).

---

## 1. Team & workflow

- **Repo:** single private GitHub monorepo — `backend/` (FastAPI) · `frontend/` (React/TS) · `supabase/migrations/` · `docs/` · `.github/workflows/`.
- **Git:** GitHub Flow. `main` protected (1 PR review, no direct pushes). Feature branches `feat/...`, `fix/...`. Conventional commits.
- **Secrets:** `.gitignore` includes `.env` in the **first commit**; `.env.example` lists key names only; keys shared privately, never via repo/issues.
- **CI:** PR checks — `ruff` + `pytest` (backend), `tsc --noEmit` + build (frontend).
- **Contract between devs:** Pydantic models + DB schema (`Backend_Schema.md`). Agree early, then work in parallel.

### Task ownership — shared queue, no fixed split
Tasks are **not pre-assigned to a developer**. All tasks live as GitHub Issues in build-order; whoever is available picks the next unblocked issue and self-assigns it. Either developer must be able to continue the other's in-progress work at any time, which requires:
- Every task is an Issue with enough context to pick up cold.
- Work-in-progress pushed to its feature branch daily — never only local.
- PRs small and self-explanatory; the other dev reviews.
- No knowledge silos: decisions land in the Issue/PR or `docs/`, not in chat.

## 2. Sequence

### Step 0 — Repo bootstrap
Scaffold monorepo → `.gitignore` + `.env.example` → push private → branch protection → add collaborator → Supabase project → first migration (schema from `Backend_Schema.md`) → GitHub Issues from Phase-0 tasks.

### Phase 0 — Foundations & research _(parallel)_
Gate everything risky before building the loop:
1. **Hindi writer — Gemini for now (D17).** Bake-off **parked**: writer stays Gemini, no writer tuning until the owner is in the loop (O5). Resolve the variant drift (`config.py` = `gemini-3.0-pro` vs `.env` = `gemini-3.1-flash-lite`).
2. **Calibration v2 — the "Tests" page (CD1–CD13).** Upgrades the feature formerly called Calibration. Real pipeline generates 50 (research→writer→critic, **caption+hashtags only**), critic scores stored blind. Owner judges by **editing** each post; an **LLM judge sizes each edit** (trivial/light/heavy) → implied score buckets (none→9–10, light→~7, heavy→~4). Critic retunes via **few-shot anchors (owner-edited text) + rubric edits** (no fine-tune) and **auto-iterates to ≥80% within ±1.5**. **Build now:** the "Generate 50" + display half. **Defer to owner:** judging → retune + writer golden-example seeding.
3. **Image sign-off** — `gpt-image-2`, English-only text; client signs off.
4. **News search spike** — Claude web search pulls JEE/NEET/CUET/GUJCET news reliably.
5. Assets: few-shot pack from best past posts · brand guide · English allow-list · competitor shortlist.

**Exit:** writer pinned (Gemini) · critic-test scaffold built (retune awaits owner) · image approved · news proven.

### Phase 1 — Core loop on web dashboard
Build order (each PR-able):
1. Migrations + RLS → 2. Auth + dashboard shell → 3. Settings (cadence, pillars, Business Foundation, Target Audience) → 4. Topic Decider + pillar rotation + idea box → 5. Writer⇄Critic loop (versions persisted) → 6. Image/Reel step → 7. Two approval screens + email notifications → 8. Scheduler endpoint + state machine + missed-day behavior → 9. Edit-rate metric + pillar balance view.

**Fidelity gaps to close (decided this round):**
- **Never-post at topic stage (D3)** — inject `never_post_block` into `topic_decider` so banned subjects never become a suggestion; critic stays as backstop.
- **Recent-titles no-repeat block (D15)** — feed last N picked/published titles into `topic_decider` to avoid repeating subjects.
- **Inline edit + save (D4)** — caption/hashtags/reel become editable; add `PATCH /posts/{id}`.
- **Per-section AI rewrite (D5)** — tweak targets caption / hashtags / hook / CTA individually, not whole-draft.
- **Edit-rate definition (D16)** — "approved without edits" counts a post clean only if **zero AI tweaks AND zero inline edits**.
- **Notifications (D18)** — email/Resend, routed through a swappable notifier interface (WhatsApp/Telegram later).

**Exit:** ~90% approved without edits (per D16) · habit sticks · survives a missed day.

### Phase 2 — Feeds & intelligence _(built now behind a flag — Meta-gated, D1)_
Graph API (own insights) + **Business Discovery for competitors (D2)** → `feed_items` → smarter Topic Decider → **strategy engine on top of pillars**. Decisions:
- **Competitor fetch (D9)** — daily, inside the 9AM job: pull tracked handles → `feed_items` → summarize → feed `topic_decider` the same run.
- **Competitor use (D11)** — both **gaps and trends, gap-weighted** (surface what competitors missed; lean into hot themes, biased to gaps).
- **Engagement metrics (D10)** — store `ig_media_id` on publish; **daily job, ~30-day window** pulls into `metrics`. **Performance signal = saves + shares (D19)**; weight at launch **parked (O1)**.
- **Smart signals shape slots 2–3 only (D12)** — slot 1 stays reserved for owner idea / urgent news.
- **Adaptive strategy (D14)** — rule-based seasonal re-weighting keyed to an **exam calendar (D13: news_search seeds an editable table, owner corrects)**; exam-near → up-weight news/revision, off-season → concepts/motivation. Replaces the locked-"Auto" toggle.
- **Insights tab** — fills the existing placeholders (saves/shares, follower growth, competitor trends) once the above land.

### Phase 3 — Publishing & polish _(built now behind a flag; go-live gated by Meta App Review, D1)_
Meta app + App Review (submit early — longest pole) → auto-publish. Decisions:
- **Publish on approve, immediately (D6)** — frequency controlled by the cadence setting; no scheduled-publish queue.
- **Carousels publish (D7)** — multi-image children-container path (matches what `image_maker` emits). Reels stay manual.
- **IG connection is direct/server-side (D8)** — owner does NOT log in / OAuth anywhere; account connected via dev-configured token. No owner-facing connect flow.
- **Token strategy parked (O3)** — System User token (non-expiring, no refresh) vs long-lived + auto-refresh; needs research.
- Analytics dashboard → **handoff docs** (still to write, #15).
- **Hosting parked (O4)** — always-on host (APScheduler) vs serverless + external cron → `POST /trigger`; keep both paths working.

## 3. Definition of done (per feature)

Code reviewed in PR · migration applied cleanly · happy-path test · state machine unaffected by failure (idempotent, resumable) · no secrets in diff.

## 4. References

- Requirements: `PRD.md` · Tech: `TRD.md` · Flows: `Appflow.md` · Schema: `Backend_Schema.md`
- Detailed tasks: `ExamBro_Implementation_Plan_By_Phase.md` · Locked decisions: `ExamBro_Final_Spec_and_Plan.md`
- **Decision log + open questions (v2, 2026-06-22): `ExamBro_Open_Questions.md`** — D1–D19, CD1–CD13, O1–O5. Owner still owes: O1 perf weighting · O2 2-week-trial timing · O3 IG token strategy · O4 hosting · O5 writer variant.
- Meta/data checklists: `ExamBro_Instagram_Data_Access_Requirements.md`
