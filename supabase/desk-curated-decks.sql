-- Applied to the existing project on 10 October 2026. Dedicated Desk storage.
create table public.desk_curated_decks (
  id uuid primary key default gen_random_uuid(),
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  published jsonb check (published is null or jsonb_typeof(published) = 'object'),
  published_season integer,
  published_week integer,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check ((published is null and published_season is null and published_week is null and published_at is null)
    or (published is not null and published_season between 2000 and 2100
      and published_week between 0 and 16 and published_at is not null))
);
alter table public.desk_curated_decks enable row level security;
revoke all on public.desk_curated_decks from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.desk_curated_decks to service_role;
-- No client policies: all access passes through authorized server endpoints.
create index desk_curated_decks_published_slate
  on public.desk_curated_decks (published_season, published_week) where published is not null;
