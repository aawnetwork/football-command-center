alter table public.broadcast_availability
  add column if not exists sky_sports boolean not null default false,
  add column if not exists channel_5 boolean not null default false;
