create table if not exists public.all_time_monitor_state (
  id text primary key check (id = 'global'),
  state jsonb not null default '{"version":1,"snapshots":[],"signals":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.all_time_monitor_state enable row level security;

create or replace function public.set_all_time_monitor_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists all_time_monitor_state_updated_at on public.all_time_monitor_state;
create trigger all_time_monitor_state_updated_at
before update on public.all_time_monitor_state
for each row execute procedure public.set_all_time_monitor_updated_at();
