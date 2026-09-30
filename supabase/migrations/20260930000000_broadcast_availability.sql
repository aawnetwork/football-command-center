create table if not exists public.broadcast_availability (
  league text not null check (league in ('CFB', 'NFL')),
  event_id bigint not null,
  event_date timestamptz not null,
  away_team text not null,
  home_team text not null,
  source_date text not null,
  source_time text not null,
  source_matchup text not null,
  dazn boolean not null default false,
  disney_plus boolean not null default false,
  imported_at timestamptz not null default now(),
  primary key (league, event_id)
);

alter table public.broadcast_availability enable row level security;
