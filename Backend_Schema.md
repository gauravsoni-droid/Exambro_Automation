# Backend Schema — ExamBro Instagram Automation

_Database schema (Supabase Postgres) · v1 draft · 2026-06-11 · Implement via versioned migrations in `supabase/migrations/` — never hand-edit. RLS on every table (single-owner policies)._

---

## Conventions

- `id uuid primary key default gen_random_uuid()` and `created_at timestamptz default now()` on all tables (not repeated below).
- Auth uses Supabase `auth.users` (email + password, single owner) — no custom users table needed; a `profiles` row can be added later if metadata is required.
- Language is always a column, never assumed — constant `'hi'` for now (future English).

## Enums

```sql
create type cadence as enum ('daily', 'every_2_days');
create type post_format as enum ('post', 'reel');
create type post_status as enum ('topic_chosen','generating','content_ready','awaiting_approval','approved','rejected','saved');
create type topic_status as enum ('suggested','picked','rejected');
create type idea_type as enum ('text','image','link');
create type idea_status as enum ('pending','used','discarded');
create type approval_action as enum ('tap1_pick','tap1_reject_all','tap2_approve','tap2_tweak','tap2_reject');
create type example_label as enum ('good','bad');
create type feed_source as enum ('competitor','news');
create type verdict as enum ('good','needs_work');
```

## Tables

### settings  _(single row)_
| Column | Type | Notes |
|---|---|---|
| cadence | cadence | default 'daily' |
| bf_who_we_serve | text | Business Foundation — short field |
| bf_core_values | text | plain words, e.g. "affordable, student-first, honest" |
| bf_liked_topics | text | themes that fit the brand |
| bf_never_post | text[] | **hard critic reject rules** |
| ta_country | text nullable | Target Audience — all optional |
| ta_state | text nullable | |
| ta_city | text nullable | |
| ta_who | text nullable | e.g. "Class 11–12 + droppers, JEE/NEET/GUJCET, + teachers" |
| english_allowlist | text[] | keep-in-English terms (grows over time) |
| updated_at | timestamptz | |

### pillars
| Column | Type | Notes |
|---|---|---|
| name | text not null | owner-editable, never hard-coded |
| description | text | |
| active | boolean default true | "disable" without deleting |
| sort_order | int | |

Seed (owner can change): exam news & updates · study tips & strategy · PYQ/concept · motivation · product/app.

### brand_guidelines
| Column | Type | Notes |
|---|---|---|
| rule_type | text | 'voice' / 'do' / 'dont' |
| content | text not null | from brand guide (previous developer) |

### golden_examples
| Column | Type | Notes |
|---|---|---|
| caption | text not null | real past post |
| label | example_label | good and bad both kept |
| notes | text | why it's good/bad |
| source_url | text | permalink |

Powers writer few-shot + critic calibration.

### ideas
| Column | Type | Notes |
|---|---|---|
| type | idea_type | text / image / link |
| payload | text | text content or URL |
| image_path | text nullable | Supabase Storage ref |
| status | idea_status | default 'pending' |
| used_at | timestamptz nullable | set when consumed by a round |

### feed_items  _(Phase 2)_
| Column | Type | Notes |
|---|---|---|
| source | feed_source | competitor / news |
| source_ref | text | IG handle or URL |
| payload | jsonb | caption, hashtags, media_type, permalink… |
| metrics | jsonb | like_count, comments_count, view_count (public only) |
| captured_at | timestamptz | |

### topics
| Column | Type | Notes |
|---|---|---|
| round_date | date not null | one round per cadence tick |
| slot | int (1–3) | slot 1 = owner idea when present |
| title | text not null | |
| description | text | one-liner |
| pillar_id | uuid → pillars | **3 different pillars per round; ≠ yesterday's picked pillar** |
| is_rotation_exception | boolean default false | urgent exam news flag |
| from_idea_id | uuid → ideas, nullable | |
| source_refs | jsonb | news/feed citations |
| status | topic_status | default 'suggested' |

### posts
| Column | Type | Notes |
|---|---|---|
| topic_id | uuid → topics | |
| language | text default 'hi' | **kept as a real column for future English** |
| format | post_format | post / reel (agent decides) |
| caption | text | final |
| hashtags | text[] | final |
| script | text nullable | reel only, Hindi |
| image_paths | text[] | Storage refs; >1 = carousel |
| is_carousel | boolean default false | AI decides |
| critic_score | numeric nullable | final passing score — kept for drift monitoring |
| status | post_status | state machine in `Appflow.md` |
| updated_at | timestamptz | |

### post_versions
| Column | Type | Notes |
|---|---|---|
| post_id | uuid → posts | |
| version_no | int | |
| caption / hashtags / script | text / text[] / text | the draft |
| critic_score | numeric | per-axis detail in `critique` |
| critic_verdict | verdict | |
| critique | jsonb | axis scores + comments (audit of refine loop) |

### approvals
| Column | Type | Notes |
|---|---|---|
| topic_id | uuid → topics, nullable | Tap-1 actions |
| post_id | uuid → posts, nullable | Tap-2 actions |
| action | approval_action | |
| tweak_text | text nullable | free-text instruction |

Powers the edit-rate metric (tweaks ÷ total → 90% bar).

### metrics  _(Phase 2)_
| Column | Type | Notes |
|---|---|---|
| post_id | uuid → posts, nullable | |
| ig_media_id | text | |
| likes / comments / saves / shares | int | |
| reach / views | int | `views`, not deprecated `impressions` |
| captured_at | timestamptz | |

### calibration_items  _(Phase 0 only — Critic Accuracy Test)_
| Column | Type | Notes |
|---|---|---|
| content | text not null | one of the 50 sample posts |
| owner_verdict | verdict nullable | saved FIRST (blind) |
| owner_labeled_at | timestamptz | |
| critic_verdict | verdict nullable | revealed only after owner saves |
| critic_score | numeric | |
| agreed | boolean generated | owner_verdict = critic_verdict |

Pass gate: `count(agreed) >= 40` of 50 (≥80%).

## Relationships (summary)

```
pillars 1─N topics 1─1 posts 1─N post_versions
ideas  1─N topics            posts 1─N approvals · 1─N metrics
topics 1─N approvals
```
