create table if not exists public.airaware_revoked_tokens (
  jti text primary key,
  expires_at timestamptz not null
);

create index if not exists airaware_revoked_tokens_expires_at_idx
  on public.airaware_revoked_tokens (expires_at);

create table if not exists public.airaware_rate_limits (
  bucket text not null,
  identity text not null,
  window_start bigint not null,
  hits integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket, identity)
);

alter table public.airaware_revoked_tokens enable row level security;
alter table public.airaware_rate_limits enable row level security;

create index if not exists airaware_impact_date_idx
  on public.airaware_documents ((data ->> 'date'))
  where collection = 'impact_records';

create index if not exists airaware_impact_activity_type_idx
  on public.airaware_documents ((data ->> 'activity_type'))
  where collection = 'impact_records';

create index if not exists airaware_impact_date_activity_type_idx
  on public.airaware_documents ((data ->> 'date'), (data ->> 'activity_type'))
  where collection = 'impact_records';
