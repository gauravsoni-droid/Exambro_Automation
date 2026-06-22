# TRD — ExamBro Instagram Automation

_Technical Requirements Document · v1 · 2026-06-11 · Pairs with `PRD.md`; tech decisions locked in `ExamBro_Final_Spec_and_Plan.md` §8_

---

## 1. Architecture

Deterministic pipeline (Anthropic "Building Effective Agents") + writer⇄critic evaluator-optimizer loop (Self-Refine). Not autonomous — two human gates by design.

```
React/TS dashboard ── Supabase Auth (email+pw) ── Supabase (Postgres/Storage/Realtime/RLS)
        │                                                   ▲
        ▼                                                   │
FastAPI backend (orchestrator, async) ── agents: Topic Decider · Writer · Critic ·
        ▲                                Image Maker · Reel Scripter · Data In
        │
External cron (09:00 IST) ──► authenticated POST /trigger → 202 → pipeline runs async
```

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | **Python + FastAPI** (async) | Pydantic v2 for typed LLM/critic schemas. Hand-rolled orchestration — **no LangChain** (4-step pipeline + one loop; revisit LangGraph only if Phase-2 strategy engine becomes graph-like). |
| Frontend | **React + TypeScript** (Vite) | `supabase-js` for auth. |
| DB / auth / storage | **Supabase** | Postgres + Auth (email+password, single owner) + Storage + Realtime + RLS. Schema only via versioned migrations. |
| SDKs | `anthropic` · `openai` · `google-genai` · `supabase` (Python) | `google-generativeai` is deprecated — do not use. |
| Email | Resend or SES | "Topics ready" / "post ready" notifications. |
| Hosting | Local-first → Render (hosted test only if needed) → likely AWS later | |

## 3. AI models

| Role | Model | Rule |
|---|---|---|
| Writer (Hindi captions/scripts) | **Phase-0 Hindi bake-off winner** — candidates Gemini 3.x Pro / Claude (Opus 4.8, Fable 5) / GPT-5.x | No presumed winner. Pin exact model ID once picked. |
| Critic | Claude (latest) by default | **Must differ in family from writer.** If Claude wins writer → critic moves to Gemini or GPT. Gate: ≥80% blind agreement test. |
| News/search | Claude server-side web search tool (`web_search_20260209`) | $10 / 1,000 searches + tokens. |
| Image | OpenAI `gpt-image-2` | English text-in-image only. `gpt-image-1` deprecates Oct 2026 — don't use. |

**Language parameterization (hard requirement):** every prompt template and the `posts.language` column take a language argument (constant `"hi"` now) so English can be added later without rebuild.

## 4. Scheduling

- **Dev:** APScheduler in-process (single uvicorn worker) + manual `POST /trigger` test endpoint.
- **Deployed (Render):** Render Cron Job ($1/mo min, UTC `30 3 * * *` = 09:00 IST) or cron-job.org (free, native `Asia/Kolkata`, custom auth headers).
- **AWS later:** EventBridge Scheduler `cron(0 9 * * ? *)` tz `Asia/Kolkata` → Lambda → endpoint.
- Endpoint contract: bearer-auth check → return `202` immediately → run pipeline async (external pingers time out ~30s). Idempotent per round-date.
- pg_cron→HTTP was rejected (pg_net beta, 2s default timeout). Supabase Edge Functions rejected for the pipeline (150s free / 400s paid wall-clock caps).

## 5. Instagram / Meta integration (Phase 2–3)

- **Path locked: "Instagram API with Facebook Login"** (FB Page link required) — the newer Instagram-Login path has **no Business Discovery**.
- Own insights scopes: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `business_management` (verified Jun 2026).
- Metrics: use `views` (not deprecated `impressions`); `profile_links_taps`/`profile_activity` (not `profile_views`).
- Business Discovery (competitors, public data only) via **burner Business accounts — never @exambro.app**. Competitor must be Business/Creator.
- Publishing (Phase 3): two-step container → publish; 50 posts/24h limit; App Review = external multi-week lead, submit early.
- Dev mode works without App Review for accounts with app roles (own + burners) — Phase 2 can start immediately.
- Apify scraper only if official data insufficient (client budget approval required).

## 6. Security & safety

- Secrets in `.env` (gitignored from first commit) + `.env.example` template. Client-provided keys never committed or pasted into issues.
- Supabase RLS on all tables; single-owner policies.
- Private GitHub repo (docs contain client data).
- Competitor pulls only on burner accounts/tokens — hard rule.
- Critic factual-accuracy axis + owner as final gate (exam-date hallucination risk).

## 7. Non-functional

- Latency: minutes-long pipeline acceptable (owner notified by email when ready).
- Volume: ≤1 post/day — no scale concerns; optimize for debuggability over throughput.
- Auditability: every writer draft + critic score persisted (`post_versions`); approvals logged.
- Resilience: missed day = state waits in `topics_ready`; no data loss; reruns idempotent.

## 8. Technical risks

| Risk | Mitigation |
|---|---|
| Hindi generation quality | Bake-off + few-shot from real posts + strict critic + owner judging early. |
| Critic rubber-stamps | Different model family + rubric + 80% blind test + per-post scores for drift. |
| English text-in-image imperfect | Manual prompt-test gate; fallbacks: caption-only, text overlay, HTML-template→PNG. |
| Account ban (data pulls) | Official APIs first; burners only; never main handle. |
| Scheduler misfire | Idempotent trigger endpoint; manual /trigger fallback; missed-day-safe state machine. |
