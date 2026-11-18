create extension if not exists pgcrypto;

create table if not exists public.airaware_documents (
  id text primary key,
  collection text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists airaware_documents_collection_idx
  on public.airaware_documents (collection);

create index if not exists airaware_documents_user_id_idx
  on public.airaware_documents (collection, (data ->> 'user_id'));

create index if not exists airaware_documents_created_at_idx
  on public.airaware_documents (collection, (data ->> 'created_at'));

create unique index if not exists airaware_users_email_uidx
  on public.airaware_documents ((data ->> 'email'))
  where collection = 'users';

create unique index if not exists airaware_conversations_user_uidx
  on public.airaware_documents ((data ->> 'user_id'))
  where collection = 'conversations';

create unique index if not exists airaware_lifestyle_user_uidx
  on public.airaware_documents ((data ->> 'user_id'))
  where collection = 'lifestyle_profiles';

create unique index if not exists airaware_daily_plans_user_date_uidx
  on public.airaware_documents ((data ->> 'user_id'), (data ->> 'date'))
  where collection = 'daily_plans';

create unique index if not exists airaware_challenge_members_uidx
  on public.airaware_documents ((data ->> 'challenge_id'), (data ->> 'user_id'))
  where collection = 'challenge_members';

create unique index if not exists airaware_challenges_slug_uidx
  on public.airaware_documents ((data ->> 'id'))
  where collection = 'challenges';

alter table public.airaware_documents enable row level security;
