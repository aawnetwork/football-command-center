-- Stage 28 additive migration draft. Existing tables are untouched.
create table public.hub_audience_participants (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  credential_expires_at timestamptz not null default now() + interval '15 minutes',
  delete_after_at timestamptz,
  check (credential_expires_at > created_at)
);
create table public.hub_audience_consent (
  participant_id uuid primary key references public.hub_audience_participants(id) on delete cascade,
  version text not null check (version = 'stage28-v1'),
  text_hash text not null check (text_hash ~ '^[a-f0-9]{64}$'),
  granted_at timestamptz not null default now()
);
create table public.hub_audience_rate_limits (
  scope text primary key check (scope in ('prepare','confirm','withdraw')),
  window_start timestamptz not null,
  requests integer not null check (requests > 0)
);
alter table public.hub_audience_participants enable row level security;
alter table public.hub_audience_consent enable row level security;
alter table public.hub_audience_rate_limits enable row level security;
revoke all on public.hub_audience_participants,public.hub_audience_consent,public.hub_audience_rate_limits from public,anon,authenticated;
grant select,insert,delete on public.hub_audience_participants,public.hub_audience_consent to service_role;
grant update on public.hub_audience_participants to service_role;
grant select,insert,update on public.hub_audience_rate_limits to service_role;
create index hub_audience_participants_expiry on public.hub_audience_participants(delete_after_at) where delete_after_at is not null;
create function public.hub_audience_limit(p_scope text,p_maximum integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare amount integer;
begin
  if p_maximum < 1 or p_maximum > 120 or p_scope not in ('prepare','confirm','withdraw') then raise exception 'Invalid rate limit'; end if;
  insert into public.hub_audience_rate_limits(scope,window_start,requests) values(p_scope,clock_timestamp(),1)
  on conflict(scope) do update set requests=case when hub_audience_rate_limits.window_start < clock_timestamp()-interval '1 minute' then 1 else hub_audience_rate_limits.requests+1 end,
    window_start=case when hub_audience_rate_limits.window_start < clock_timestamp()-interval '1 minute' then clock_timestamp() else hub_audience_rate_limits.window_start end
  returning requests into amount;
  return amount <= p_maximum;
end $$;
create function public.hub_audience_state(p_hash text) returns jsonb
language sql security invoker set search_path='' as $$
  select coalesce((select jsonb_build_object('active',true,'consentVersion',c.version,'grantedAt',c.granted_at)
    from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id
    where p.token_hash=p_hash),
    jsonb_build_object('active',false,'prepared',exists(select 1 from public.hub_audience_participants p where p.token_hash=p_hash and p.credential_expires_at>now())));
$$;
create function public.hub_audience_prepare(p_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid credential hash'; end if;
  -- Bounded removal of abandoned, unconsented preparations only.
  delete from public.hub_audience_participants where id in (select p.id from public.hub_audience_participants p
    where p.credential_expires_at<now() and not exists(select 1 from public.hub_audience_consent c where c.participant_id=p.id) limit 100);
  insert into public.hub_audience_participants(token_hash) values(p_hash);
  return true;
end $$;
create function public.hub_audience_grant(p_hash text,p_version text,p_text_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare participant uuid;
begin
  if p_hash is null or p_text_hash is null or p_version is null or p_hash !~ '^[a-f0-9]{64}$' or p_text_hash !~ '^[a-f0-9]{64}$' or p_version <> 'stage28-v1' then raise exception 'Invalid consent'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
  select p.id into participant from public.hub_audience_participants p where p.token_hash=p_hash
    and (p.credential_expires_at>now() or exists(select 1 from public.hub_audience_consent c where c.participant_id=p.id));
  if participant is null then return '{"active":false}'::jsonb; end if;
  if not exists(select 1 from public.hub_audience_consent where participant_id=participant) then
    update public.hub_audience_participants set credential_expires_at=now()+interval '365 days' where id=participant;
  end if;
  insert into public.hub_audience_consent(participant_id,version,text_hash) values(participant,p_version,p_text_hash) on conflict(participant_id) do nothing;
  return public.hub_audience_state(p_hash);
end $$;
create function public.hub_audience_withdraw(p_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid credential hash'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
  if not exists(select 1 from public.hub_audience_participants where token_hash=p_hash) then return public.hub_audience_limit('withdraw',120); end if;
  delete from public.hub_audience_participants where token_hash=p_hash;
  -- Future individual-contribution tables MUST reference this parent ON DELETE CASCADE.
  return true;
end $$;
revoke all on function public.hub_audience_limit(text,integer),public.hub_audience_state(text),public.hub_audience_prepare(text),public.hub_audience_grant(text,text,text),public.hub_audience_withdraw(text) from public,anon,authenticated;
grant execute on function public.hub_audience_limit(text,integer),public.hub_audience_state(text),public.hub_audience_prepare(text),public.hub_audience_grant(text,text,text),public.hub_audience_withdraw(text) to service_role;
