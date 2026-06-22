# ExamBro — Work Plan vs Implementation Gap Analysis

_Compares [ExamBro_Work_Plan.md](ExamBro_Work_Plan.md) (13 June 2026) against the code on `main` as of 15 June 2026._

**Intent confirmed with owner:** the plan's *"build the full app in one go, no phased release"* still stands. The code is currently built in phases (Phase 0 + 1 done; Phase 2 + 3 deferred), so against the one-shot goal it is **behind on three fronts** — except Instagram auto-publish, which is a **deliberate deferral** waiting on Meta approval (still required before launch, just not "late").

Legend: ✅ done · 🟡 partial · ❌ missing · ⏸️ deferred-on-purpose (Meta-blocked)

---

## Plan step → status

| # | Plan step | Status | Where / what's missing |
|---|---|---|---|
| 1 | Apply for Meta App Review + business verification | ⏸️ | External owner task. No IG/Graph code or token slot in [config.py](backend/app/config.py). |
| 2 | Get all accounts + keys (AI providers, IG Business/FB Page) | 🟡 | AI provider keys wired (anthropic/openai/google/supabase). **No Instagram access-token / IG-user-id config.** |
| 3 | Project foundation (repo, DB, hosting, key storage) | ✅ | Repo ✓, DB migration ✓ ([0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql)), `.env` config ✓. Hosting TBD. |
| 4 | Prototype → app shell, nav, owner login | ✅ | [App.tsx](frontend/src/App.tsx) — Supabase auth, routes. (No Insights route — see #10.) |
| 5a | Hindi **writer** bake-off (owner judges, pick best) | ❌ | No comparison harness. Writer is just config default `gemini-3.0-pro` ([config.py:31](backend/app/config.py#L31)). |
| 5b | **Critic** accuracy test (≥80% of 50, blind) | ✅ | Fully coded: blind protocol, 40/50 gate ([calibration.py](backend/app/api/calibration.py), [Calibration.tsx](frontend/src/pages/Calibration.tsx)). |
| 5c | Image test (clean English text) | ✅ | English-only rule enforced in prompt ([image_maker.py:19](backend/app/agents/image_maker.py#L19)). Sign-off = manual process. |
| 5d | News test (JEE/NEET/CUET/GUJCET) | ✅ | Claude web-search agent, failure-tolerant ([news_search.py](backend/app/agents/news_search.py)). |
| 5e | Brand assets (voice, golden examples, never-post) | ✅ | Tables + prompt blocks ([context.py](backend/app/agents/context.py)); never-post in settings. |
| 6 | Settings + data behind them | 🟡 | Pillars editable, Business Foundation+never-post, Target Audience, cadence ✅. **Publishing connection ❌** (no IG connect UI/flow). |
| 7a | Gather inputs (news, competitor trends, past-post performance) | 🟡 | News ✅. **Competitor trends ❌** (handles stored, `feed_items` table exists, but no fetcher and topic_decider never reads them). **Past performance ❌** (no metrics ingestion). |
| 7b | Topic Decider — 3 topics, priority order | 🟡 | 3 topics from 3 pillars, idea→slot 1, urgent-news rotation exception, ≠ yesterday's pillar ✅ ([topic_decider.py](backend/app/agents/topic_decider.py)). **Never-post not applied at topic stage** (only at critic). Performance/competitor signals not fed in. |
| 7c | Writer ⇄ Critic loop (≤3, never-post hard reject, diff model) | ✅ | [orchestrator.py:304](backend/app/pipeline/orchestrator.py#L304); critic≠writer enforced at boot ([config.py:51](backend/app/config.py#L51)); hard-fail in code ([critic.py:67](backend/app/agents/critic.py#L67)). |
| 7d | Image maker (English, single/carousel) + reel-script gen | ✅ | [image_maker.py](backend/app/agents/image_maker.py), [reel_scripter.py](backend/app/agents/reel_scripter.py); format_decider picks post vs reel. |
| 7e | Publishing — auto-publish image posts; reels manual | ⏸️ | **Not built.** Approve only sets status `saved` ([orchestrator.py:445](backend/app/pipeline/orchestrator.py#L445)); UI says "Publishing stays manual in Phase 1" ([PostReview.tsx:196](frontend/src/pages/PostReview.tsx#L196)). Reels-manual ✅ by design. |
| 8a | Two-tap flow end-to-end (9AM → email → Tap1 → build → email → Tap2) | ✅ | Scheduler 09:00 IST ([scheduler.py](backend/app/services/scheduler.py)), email notifies, both taps wired. |
| 8b | Missed-day queue | ✅ | One-in-flight + unpicked-waiting + idempotency guards ([orchestrator.py:127](backend/app/pipeline/orchestrator.py#L127)). |
| 8c | Review screen: edit caption/hashtags/reel **directly** | ❌ | Caption is read-only text; no manual inline edit ([PostReview.tsx:161](frontend/src/pages/PostReview.tsx#L161)). |
| 8d | Review screen: regenerate image on its own | ✅ | [PostReview.tsx:60](frontend/src/pages/PostReview.tsx#L60), [orchestrator.py:356](backend/app/pipeline/orchestrator.py#L356). |
| 8e | Review screen: AI-rewrite **one part at a time** | 🟡 | Tweak is free-text **whole-draft** rewrite, not per-section ([PostReview.tsx:74](frontend/src/pages/PostReview.tsx#L74)). |
| 9 | Connect frontend to backend (real data) | ✅ | [api.ts](frontend/src/lib/api.ts) + pages. |
| 10a | Save every draft + critic score | ✅ | `post_versions` on every loop ([orchestrator.py:249](backend/app/pipeline/orchestrator.py#L249)). |
| 10b | Link each published post → topic + pillar | ✅ | `topics.pillar_id`, `posts.topic_id`. |
| 10c | Record engagement (saves, shares, reach) + Insights tab | ❌ | `metrics` table exists but **no ingestion**, **no Insights page/route**. "What's working" has no data. Plan flagged this as "expensive later" (line 96). |
| 11 | Confirm critic accuracy test passes | ✅(tool) | Tooling done; running it = process. |
| 12 | 2-week trial, ~90% approved without edits | 🟡 | `approvals` table captures the edit-rate signal, but **no dashboard/metric surfaces it**. |
| 13 | Fix quality issues from trial | — | Process. |
| 14 | Launch: Meta through + quality bar → turn on auto-publish | ⏸️ | Blocked by #7e (no publish path) + #1 (Meta). |
| 15 | Maintenance + handoff notes | ❌ | Not written. |

---

## Gaps to close (one-shot goal)

**Must-build before launch**
1. **Instagram auto-publish + Meta integration** (#7e, #14) — Graph API publish for image posts, IG token storage/refresh, publish-on-approve path, `metrics.ig_media_id` capture. *Deliberately deferred to Meta approval — but required for one-shot launch.*
2. **Engagement + Insights** (#10c, #12) — IG insights ingestion into `metrics`, Insights tab/route, edit-rate (tweaks ÷ total) for the 90% bar.
3. **Competitor trends** (#7a, #7b) — fetcher populating `feed_items`, fed into topic_decider.

**Quality / fidelity gaps (cheap)**
4. **Never-post at topic stage** (#7b) — add `never_post_block` to the topic_decider prompt so banned subjects never reach a suggestion.
5. **Inline caption/hashtag/reel edit** (#8c) — make the review fields editable + a save endpoint.
6. **Per-part AI rewrite** (#8e) — target rewrite of caption / hashtags / hook / CTA individually, not whole-draft only.

**Process / setup**
7. **Writer bake-off harness** (#5a) — side-by-side Hindi outputs for owner judging.
8. **Publishing-connection UI** (#6) — connect IG account in Settings.
9. **Handoff/maintenance notes** (#15).
