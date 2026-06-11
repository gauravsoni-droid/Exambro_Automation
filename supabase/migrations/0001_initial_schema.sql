-- ExamBro IG Automation — initial schema.
-- Source: Backend_Schema.md (v1, 2026-06-11). Apply via Supabase SQL editor or CLI.
-- RLS on every table, single-owner policies (any authenticated user = the owner).

-- ── Enums ──────────────────────────────────────────────────────────────────
create type cadence as enum ('daily', 'every_2_days');
create type post_format as enum ('post', 'reel');
create type post_status as enum (
  'topic_chosen', 'generating', 'content_ready',
  'awaiting_approval', 'approved', 'rejected', 'saved'
);
create type topic_status as enum ('suggested', 'picked', 'rejected');
create type idea_type as enum ('text', 'image', 'link');
create type idea_status as enum ('pending', 'used', 'discarded');
create type approval_action as enum (
  'tap1_pick', 'tap1_reject_all', 'tap2_approve', 'tap2_tweak', 'tap2_reject'
);
create type example_label as enum ('good', 'bad');
create type feed_source as enum ('competitor', 'news');
create type verdict as enum ('good', 'needs_work');

-- ── settings (single row) ──────────────────────────────────────────────────
create table settings (
  id uuid primary key default gen_random_uuid(),
  cadence cadence not null default 'daily',
  -- Business Foundation: short separate fields, not one blob
  bf_who_we_serve text,
  bf_core_values text,
  bf_liked_topics text,
  bf_never_post text[] not null default '{}',  -- hard critic reject rules
  -- Target Audience: all optional, system works if empty
  ta_country text,
  ta_state text,
  ta_city text,
  ta_who text,
  english_allowlist text[] not null default
    '{JEE,NEET,CUET,GUJCET,ExamBro,PYQ,NTA,mock test}',
  competitor_handles text[] not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── pillars (owner-editable, never hard-coded) ─────────────────────────────
create table pillars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ── brand_guidelines ───────────────────────────────────────────────────────
create table brand_guidelines (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null check (rule_type in ('voice', 'do', 'dont')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ── golden_examples (writer few-shot + critic calibration) ─────────────────
create table golden_examples (
  id uuid primary key default gen_random_uuid(),
  caption text not null,
  label example_label not null,
  notes text,
  source_url text,
  created_at timestamptz not null default now()
);

-- ── ideas (owner inbox) ────────────────────────────────────────────────────
create table ideas (
  id uuid primary key default gen_random_uuid(),
  type idea_type not null,
  payload text not null,
  image_path text,                 -- Supabase Storage ref
  status idea_status not null default 'pending',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── feed_items (Phase 2) ───────────────────────────────────────────────────
create table feed_items (
  id uuid primary key default gen_random_uuid(),
  source feed_source not null,
  source_ref text not null,        -- IG handle or URL
  payload jsonb not null default '{}',
  metrics jsonb not null default '{}',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── topics ─────────────────────────────────────────────────────────────────
create table topics (
  id uuid primary key default gen_random_uuid(),
  round_date date not null,
  slot int not null check (slot between 1 and 3),
  title text not null,
  description text,
  pillar_id uuid references pillars (id),
  is_rotation_exception boolean not null default false,  -- urgent exam news
  from_idea_id uuid references ideas (id),
  source_refs jsonb not null default '[]',
  status topic_status not null default 'suggested',
  created_at timestamptz not null default now()
);
create index topics_round_date_idx on topics (round_date);

-- ── posts ──────────────────────────────────────────────────────────────────
create table posts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics (id),
  language text not null default 'hi',   -- real column for future English
  format post_format,
  caption text,
  hashtags text[] not null default '{}',
  script text,                            -- reel only, Hindi
  image_paths text[] not null default '{}',
  is_carousel boolean not null default false,
  critic_score numeric,                   -- final passing score, drift monitoring
  status post_status not null default 'topic_chosen',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index posts_status_idx on posts (status);

-- ── post_versions (refine-loop audit) ──────────────────────────────────────
create table post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  version_no int not null,
  caption text,
  hashtags text[] not null default '{}',
  script text,
  critic_score numeric,
  critic_verdict verdict,
  critique jsonb not null default '{}',   -- axis scores + comments
  created_at timestamptz not null default now(),
  unique (post_id, version_no)
);

-- ── approvals (Tap-1 / Tap-2 audit; powers edit-rate metric) ───────────────
create table approvals (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics (id),
  post_id uuid references posts (id),
  action approval_action not null,
  tweak_text text,
  created_at timestamptz not null default now()
);

-- ── metrics (Phase 2) ──────────────────────────────────────────────────────
create table metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts (id),
  ig_media_id text,
  likes int,
  comments int,
  saves int,
  shares int,
  reach int,
  views int,                              -- views, not deprecated impressions
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── calibration_items (Phase 0 only — Critic Accuracy Test) ────────────────
create table calibration_items (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  owner_verdict verdict,                  -- saved FIRST (blind)
  owner_labeled_at timestamptz,
  critic_verdict verdict,                 -- revealed only after owner saves
  critic_score numeric,
  agreed boolean generated always as (
    case
      when owner_verdict is null or critic_verdict is null then null
      else owner_verdict = critic_verdict
    end
  ) stored,
  created_at timestamptz not null default now()
);

-- ── Seed data ──────────────────────────────────────────────────────────────
insert into settings (cadence) values ('daily');

insert into pillars (name, description, sort_order) values
  ('Exam news & updates', 'Dates, notifications, results, official announcements for JEE/NEET/CUET/GUJCET', 1),
  ('Study tips & strategy', 'How to prepare, time management, revision tactics', 2),
  ('PYQ / concept', 'Previous-year questions, concept explainers', 3),
  ('Motivation', 'Encouragement, exam mindset, success stories', 4),
  ('Product / app', 'ExamBro app features, paper maker, CTA posts', 5);

-- ── RLS: single owner — any authenticated user has full access ────────────
-- Backend uses the service-role key (bypasses RLS); frontend reads as the
-- authenticated owner. Single-user product → authenticated = owner.
do $$
declare t text;
begin
  foreach t in array array[
    'settings', 'pillars', 'brand_guidelines', 'golden_examples', 'ideas',
    'feed_items', 'topics', 'posts', 'post_versions', 'approvals', 'metrics',
    'calibration_items'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy owner_all on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- ── Storage bucket for generated images / idea uploads ─────────────────────
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy media_owner_all on storage.objects
  for all to authenticated
  using (bucket_id = 'media') with check (bucket_id = 'media');
