create table if not exists ninety_core.soren_daily_selection_locks_v1 (
  pool_date date not null,
  match_no text not null,
  lock_type text not null,
  source text not null,
  source_payload jsonb not null default '{}'::jsonb,
  locked_at timestamptz not null default now(),
  primary key (pool_date, match_no, lock_type)
);

create index if not exists soren_daily_selection_locks_date_idx
  on ninety_core.soren_daily_selection_locks_v1(pool_date, match_no);

create table if not exists ninety_core.soren_daily_selection_v2_decisions (
  pool_date date not null,
  match_no text not null,
  decision text not null check (decision in ('ADD','BLOCK','KEEP','PASS')),
  model_top1 text,
  model_confidence numeric,
  model_frozen_at timestamptz,
  institution_top1 text,
  funds_top1 text,
  funds_top1_share numeric,
  market_captured_at timestamptz,
  selector_version text not null default 'DAILY-VALUE-v2.0-20261013',
  reason text,
  updated_at timestamptz not null default now(),
  primary key (pool_date, match_no)
);

alter table ninety_core.soren_daily_selection_locks_v1 enable row level security;
alter table ninety_core.soren_daily_selection_v2_decisions enable row level security;
