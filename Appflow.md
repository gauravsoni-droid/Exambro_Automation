# Appflow — ExamBro Instagram Automation

_App flow & state machine · v1 · 2026-06-11 · Pairs with `PRD.md` (features) and `Backend_Schema.md` (statuses)_

---

## 1. Post lifecycle (state machine)

```
              09:00 IST scheduler (per cadence setting)
                            │
                            ▼
                    ┌───────────────┐    reject all 3
                    │ topics_ready  │◄──── regenerate 3 ─┐
                    └───────┬───────┘                    │
              email: "Topics ready"                      │
                            │  Tap 1: owner picks 1 ─────┘
                            ▼
                    ┌───────────────┐
                    │ topic_chosen  │
                    └───────┬───────┘
                            │  agent decides format (post | reel, Hindi)
                            ▼
                    ┌───────────────┐
                    │  generating   │  writer ⇄ critic loop (≤3×)
                    └───────┬───────┘  every draft saved to post_versions
                            │  critic pass
                            ▼
                    ┌───────────────┐
                    │ content_ready │  post → image(s) gpt-image-2 (English text)
                    └───────┬───────┘  reel → 1-min Hindi script
                            ▼
                    ┌──────────────────┐
                    │ awaiting_approval│  email: "Post ready"
                    └───────┬──────────┘
            Tap 2 ──┬───────┼─────────┬─────────┐
                    ▼       ▼         ▼         │
               approved  tweak     rejected     │
                    │   (free text)             │
                    │       └──► back to writer with instruction ──► generating
                    ▼
                ┌───────┐
                │ saved │   approved package stored in DB — NO publish
                └───────┘
```

**Missed day:** topics simply wait in `topics_ready`. Nothing breaks. No streaks. Cadence toggle (1/day default | 1 per 2 days) controls whether the scheduler fires.

**One post in flight** — a new round does not start while a post is between `topic_chosen` and `saved`/`rejected`.

## 2. Topic Decider flow (daily, 09:00 IST)

1. Gather inputs: own-post history · AI web-search exam news (JEE/NEET/CUET/GUJCET) · pending owner ideas · pillars + Business Foundation + Target Audience (Settings).
2. **Owner idea present?** → AI shapes it into a proper topic → **slot 1** (wins regardless of pillar rotation; owner still approves).
3. Fill remaining slots: **3 different pillars total**, excluding yesterday's picked pillar. Active pillars only.
4. Exception: urgent exam news may break rotation — topic flagged as exception.
5. Each topic = title + one-line description + pillar tag → state `topics_ready` → email owner.

## 3. Owner flows

### Tap 1 — pick a topic
Login → Today screen → 3 topic cards (title, description, pillar tag) → pick one (→ `topic_chosen`) **or** Reject all (→ regenerate 3 fresh, stay `topics_ready`).

### Tap 2 — review the post
Email → login → Post review screen → image(s)/script + caption + hashtags →
- **Approve** → `saved`.
- **Tweak** → free-text instruction → writer regenerates (critic re-checks) → back to `awaiting_approval`.
- **Reject** → `rejected` (round over; next scheduled round runs normally).

### Idea box (any time)
Drop text / image / link → stored `pending` → next round consumes it for slot 1 → marked `used`.

### Settings (occasional)
Cadence toggle · pillars editor (add/rename/remove/disable) · Business Foundation · Target Audience · competitor handles. All owner-managed; changes apply from the next round.

## 4. Writer ⇄ Critic loop (inner flow)

```
writer drafts (Hindi, language param, few-shot, Target Audience context)
   │
   ▼
critic scores rubric: hook · brand voice · Hindi grammar/spelling ·
language-rule compliance · factual accuracy · CTA · hashtag relevance
   + Business-Foundation never-post list = HARD FAIL
   │
   ├── pass ──► content_ready
   ├── fail & iterations < 3 ──► critique → writer redrafts
   └── fail & iterations = 3 ──► flagged for owner anyway (owner is final gate)
every draft + score + critique → post_versions
```

## 5. Phase-0 only: Critic Accuracy Test flow

1. Owner opens throwaway review screen → sees post #N (of 50) → marks "good / needs work" → **saves**.
2. Only after save: AI verdict revealed side-by-side (blind protocol — prevents anchoring).
3. After all 50: agreement computed. **≥80% (40/50) = pass** → critic trusted from Phase 1. Fail → rubric improved → retest.
4. Post-launch: screen retired; critic scores still saved per post for drift checks.

## 6. Notifications

| Event | Channel | Content |
|---|---|---|
| Topics ready (09:00 IST) | Email | Link to Today screen |
| Post ready | Email | Link to Post review screen |
| (Login emails) | Supabase Auth | Built-in |
