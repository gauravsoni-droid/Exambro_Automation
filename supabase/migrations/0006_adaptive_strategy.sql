alter table settings
  add column if not exists adaptive_strategy_enabled boolean not null default true;
