# PRD — ExamBro Instagram Automation

_Product Requirements Document · v1 · 2026-06-11 · Derived from `ExamBro_Final_Spec_and_Plan.md` (source of truth for locked decisions)_

---

## 1. Problem

ExamBro (@exambro.app — 52 posts, 1029 followers) needs consistent, on-brand Instagram content for JEE Mains, JEE Advanced, NEET, CUET and GUJCET aspirants and their teachers. Producing daily Hindi content manually doesn't happen consistently; off-the-shelf tools fail at Hindi quality and brand fit.

## 2. Product in one line

A web platform that researches, plans, and writes Instagram content automatically; the owner spends ~5 minutes/day on exactly **two approvals** (pick 1 of 3 topics → approve the finished post). Approved posts are saved to the database — **no auto-publishing yet**.

## 3. Users

- **Owner (single user)** — picks topics, approves posts, drops ideas, manages settings. Native Hindi speaker; acts as the human judge in Phase 0.
- (No other roles in Phase 1. Single login.)

## 4. Goals & success metrics

| Goal | Metric |
|---|---|
| Post quality | ~90% of posts approved without edits (edit rate tracked) |
| Owner habit | Daily two-tap routine sticks; missed days cause no breakage |
| Critic trustworthy | ≥80% blind agreement with owner (40/50) before automation |
| Consistency | Cadence respected: 1/day (default) or 1 per 2 days |

## 5. Scope

### In scope (Phase 1)
- 3 topic suggestions daily at 09:00 IST, each from a **different content pillar**.
- Two-tap approval flow (Tap 1: topic, Tap 2: post) with Tweak (free text) and Reject.
- Writer ⇄ Critic loop (≤3 iterations, strict rubric).
- AI image generation (`gpt-image-2`), single or carousel (AI decides). **Image text always English.**
- Reel scripts (1-min, presenter voice, Hindi) — shot manually by a real person.
- Idea box (text / image / link) — pending idea fills suggestion slot 1.
- Content Pillars — owner-editable topic buckets; rotation keeps the mix balanced.
- Settings: cadence toggle, pillars editor, **Business Foundation**, **Target Audience**, competitor handles.
- Email notifications (topics ready / post ready).
- Queue/History with pillar balance.

### Out of scope (deferred)
- Auto-publishing (Phase 3, needs Meta App Review + client greenlight).
- Competitor feeds + own-account performance loop (Phase 2).
- Adaptive strategy engine (Phase 2 — builds on pillars).
- Stories, budget ceiling, final hosting, maintenance/handoff.

## 6. Language requirements (hard)

- **Hindi only** (Devanagari). Gujarati dropped entirely — not now, not later.
- English may be added in the future → language is a **parameter** everywhere (`posts.language`, prompt templates); never hard-coded deep. No English content work now.
- Keep-in-English allow-list: exam names (JEE/NEET/CUET/GUJCET), technical terms, hashtags, "ExamBro", app links.
- One pure language per post; critic enforces the rule.

## 7. Feature requirements

### F1 — Topic suggestions
- 09:00 IST (per cadence setting): 3 topics, **3 different pillars**, excluding yesterday's picked pillar.
- Pending owner idea → AI shapes it into slot 1 (wins regardless of rotation; owner still approves).
- Urgent exam news may break rotation (flagged as exception).
- Reject all → regenerate 3 new.

### F2 — Two-tap approval
- Tap 1: pick 1 of 3 (or reject all). Tap 2: Approve / Tweak (free-text → back to writer) / Reject.
- Strictly **one post in flight** — no buffer. Missed day: topics wait; nothing breaks; no streaks.

### F3 — Content generation
- Writer (bake-off winner model) drafts caption + hashtags (+ reel script) in pure Hindi.
- Critic (different model family) scores strict rubric; **Business-Foundation never-post list = hard reject rules**; loop ≤3×.
- Post → image(s) via `gpt-image-2` (English text only). Reel → 1-min Hindi script for manual shoot.

### F4 — Settings (one-time / occasional)
- **Business Foundation** (short separate fields): who we serve · core values · liked topics · **never-post list**. No vision/mission (too abstract). Feeds topics lightly, critic strongly.
- **Target Audience** (all optional; works empty): country · state/region · city · who they are. Guides writer tone/examples; not IG targeting.
- **Pillars editor**: add / rename / remove / disable. Never hard-coded. Starter: exam news & updates · study tips & strategy · PYQ/concept · motivation · product/app.
- Cadence toggle: 1/day (default) | 1 per 2 days.

### F5 — Critic Accuracy Test (Phase 0 gate)
- 50 sample posts (good + weak mix). Owner labels blind (saved before AI verdict shown) on a throwaway review screen.
- Pass ≥80% (40/50) → critic trusted from Phase 1. Fail → improve rubric, retest.
- Post-launch: critic score stored on every post to detect drift.

## 8. CTA assets

- Android: https://play.google.com/store/apps/details?id=com.exambro.app
- iOS: https://apps.apple.com/in/app/exambro-jee-neet-paper-maker/id6747061207
- Default CTA: "Download ExamBro app — link in bio."

## 9. Pending from client

Budget ceiling · final hosting (AWS confirm) · Meta/Facebook setup · maintenance/handoff.
