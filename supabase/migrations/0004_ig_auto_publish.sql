alter table settings
  add column if not exists ig_auto_publish boolean not null default false;
