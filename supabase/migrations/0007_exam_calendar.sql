-- Exam Calendar — seeded by exam_calendar_fetcher via Claude web search; owner can edit.
-- Supports adaptive topic weighting based on exam proximity (D13, D14).

create table if not exists exam_calendar (
  id           uuid        primary key default gen_random_uuid(),
  exam_name    text        not null,
  exam_date    date        not null,
  is_confirmed boolean     not null default false,
  created_at   timestamptz not null default now(),

  constraint exam_calendar_name_date_unique unique (exam_name, exam_date)
);
