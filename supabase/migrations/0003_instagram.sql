-- 0003: Instagram publishing columns + pending 0002 columns (bf_brand_name, content_language).
-- Apply via Supabase Dashboard → SQL Editor.

-- Pending from 0002 (never reached the live DB)
alter table settings
  add column if not exists bf_brand_name    text,
  add column if not exists content_language text not null default 'hi';

-- Instagram publish result on each post (credentials stay in .env, not DB)
alter table posts
  add column if not exists instagram_post_id text,
  add column if not exists published_at      timestamptz,
  add column if not exists publish_status    text,
  add column if not exists publish_error     text;
