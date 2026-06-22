# ExamBro — Open Questions & Decisions Log

_Started 22 June 2026. Tracks decisions locked during the backend-planning interview and the questions still waiting on the owner. Pairs with [ExamBro_Work_Plan.md](ExamBro_Work_Plan.md), [Gap_Analysis.md](Gap_Analysis.md), [ExamBro_How_Topics_Are_Decided.md](ExamBro_How_Topics_Are_Decided.md)._

State of code at start: frontend rebuilt (Next.js, all pages incl. Insights UI). Backend = Phase 0/1 working; Phase 2 (publish, metrics, competitor) absent.

---

## Decisions locked (this session)

| # | Decision | Detail |
|---|----------|--------|
| D1 | Meta-gated features built now, behind a flag | Auto-publish + engagement metrics + competitor Business Discovery all coded against Graph API, dark until the IG token lands. |
| D2 | Competitor data source = IG Business Discovery | Official Meta Graph path for tracked handles. Ties competitor signal to the same Meta approval. |
| D3 | Never-post applied at TOPIC stage | Inject `never_post_block` into `topic_decider` prompt so banned subjects never become a suggestion. Critic stays as backstop. |
| D4 | Review screen: direct inline edit | caption / hashtags / reel become editable + new `PATCH /posts/{id}` save endpoint. |
| D5 | AI rewrite = per-section | Target caption / hashtags / hook / CTA individually, not whole-draft. Needs section selector (UI) + scoped tweak prompt (backend). |
| D6 | Publish timing = immediately on approve | Approve → Graph publish → done. Frequency controlled by existing cadence setting. No scheduled-publish queue. |
| D7 | Carousel publishing supported | Build multi-image children-container path so carousels image_maker already emits actually post. |
| D8 | IG connection = direct, server-side | Owner does NOT log in / OAuth anywhere. The account is connected directly (dev-configured token). No owner-facing connect flow. |
| D9 | Competitor fetch = daily in the 9AM job | Pull tracked handles via Business Discovery into `feed_items`, summarize, feed topic_decider same run. |
| D10 | Metrics ingestion = daily job, ~30-day window | Store `ig_media_id` on publish; daily job pulls saves/shares/reach into `metrics` for recent posts. |
| D11 | Competitor use = both gaps + trends, gap-weighted | Surface what competitors missed (differentiation) and hot themes worth matching, biased toward gaps. |
| D12 | Smart signals influence slots 2–3 only | Slot 1 stays reserved for owner idea / urgent news. Competitor + performance shape the other two. |
| D13 | Exam calendar = hybrid | news_search auto-seeds exam dates into a small editable calendar table; owner can correct/confirm. Stable anchor + low upkeep. |
| D14 | Adaptive strategy = rule-based on the calendar | Deterministic seasonal rules keyed to D13 proximity: exam-near → up-weight news/revision for slots 2–3; off-season → concepts/motivation. No ML. |
| D15 | Recent-titles no-repeat block | Pass last N picked/published titles into topic_decider so it avoids re-suggesting the same subject (beyond the not-yesterday's-pillar rule). |
| D16 | "Approved without edits" = zero tweaks AND zero inline edits | The ~90% trial bar counts a post clean only if owner changed nothing — no AI tweak, no manual edit. |
| D17 | Writer = Gemini for now | Stays Gemini; exact variant + whether to bake-off pending owner update (see O5). No writer tuning until owner is in the loop. |
| D18 | Notifications = email now, swappable | Resend email routed through a notifier interface so WhatsApp/Telegram can drop in later. |
| D19 | Performance metric = saves + shares | "What's working" = saved + shared (not reach/vanity). Metric locked; weight still parked under O1. |

---

## Calibration v2 — "Tests" page (critic retune)

_Upgrades the feature formerly called **Calibration** in place (route relabeled "Tests"). One-time critic-accuracy + retune run, pre-trial. Owner judges once; blind protocol kept (critic scores hidden until owner has judged)._

| # | Decision | Detail |
|---|----------|--------|
| CD1 | Upgrade existing Calibration in place | Not a second feature. Relabel page "Tests"; reuse blind protocol + 80% gate machinery. |
| CD2 | Test runs the real pipeline for 50 | research → 50 topics → writer → 50 captions/hashtags → critic scores all 50 (stored, hidden). **Caption + hashtags only, no images.** |
| CD3 | Owner signal = edits only | No explicit score button; implied score inferred from how the owner edits each post. |
| CD4 | Edit → implied score buckets | no edit → 9–10 · light edit → ~7 · heavy edit → ~4. |
| CD5 | Only substantive edits count | Ignore whitespace / punctuation / single-word tweaks so trivial fixes don't punish the critic. |
| CD6 | Store original + edited pairs | Edited text becomes few-shot anchors for the critic AND can seed `golden_examples` for the writer. |
| CD7 | Retune = few-shot anchors + rubric edits | Bake owner-aligned examples into the critic prompt + edit rubric where disagreement is systematic. No fine-tuning. |
| CD8 | Pass gate = ±1.5 on ≥80% | Critic within ±1.5 of the implied owner score on at least 80% of the 50. |
| CD9 | Edit sizing = LLM judge on the diff | A model compares original vs edited and classifies trivial/light/heavy by meaning (one call per edited post). |
| CD10 | Retune = auto-iterate to ≥80% | Owner judges once. Then apply anchors+rubric → re-score same 50 → check gate → adjust and repeat automatically (capped). |
| CD11 | 50 topics spread across pillars, deduped | Research picks varied real exam topics balanced across active pillars, no near-duplicates. |
| CD12 | Tests page = batch view of all 50 | All 50 posts on the dedicated page; edit inline; built for throughput. Reuses inline-edit components (D4/D5). |
| CD13 | **Phased build (owner not yet available)** | **NOW:** "Generate 50" button → pipeline → critic scores → store + display all 50. **LATER (owner present):** owner judging → edit-sizing → critic retune + writer golden-example seeding. No critic/writer tuning until owner is in the loop. |

---

## Open questions (awaiting owner)

| # | Question | Status / notes |
|---|----------|----------------|
| O1 | Performance-signal weighting at launch | Owner to advise. Options: near-zero auto-ramp as data builds (recommended, per How-Topics doc line 76) · fixed moderate · excluded until N posts. Blocks topic_decider weighting (Branch C). |
| O2 | 2-week trial timing | Critic-test plan now specified (see Calibration v2 above). STILL OPEN: does the separate 2-week ~90%-approved-without-edits trial (Work_Plan step 12) run during the Meta wait (manual posting) or wait for auto-publish? Not yet answered. |
| O3 | Instagram token strategy | Needs research. System User token (non-expiring, no refresh logic) vs long-lived user token + auto-refresh job. Affects refresh code and the direct-connect implementation (D8). |
| O4 | Backend hosting platform | Parked. Always-on host (Railway/Render/Fly, runs APScheduler as coded) vs serverless + external cron → POST /trigger. Keep both paths working until decided. |
| O5 | Writer variant + bake-off | Writer stays Gemini (D17); owner sending an update. Open: exact Gemini variant (resolve drift — code = gemini-3.0-pro, .env = gemini-3.1-flash-lite) and whether any bake-off happens. |

---

_More open questions get appended as the interview walks down the remaining branches (smart-signals plumbing, topic-decider fidelity, writer bake-off, hosting/notifications)._
