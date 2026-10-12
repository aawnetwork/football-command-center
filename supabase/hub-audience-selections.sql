-- Stage 29 additive migration. No ratings history, aggregates, or public access.
-- A random per-consent receipt binds delayed submissions to their opt-in, not just
-- a potentially identical timestamp. This is not the participant ID or credential.
alter table public.hub_audience_consent add column consent_receipt uuid not null default gen_random_uuid();
create or replace function public.hub_audience_state(p_hash text) returns jsonb
language sql security invoker set search_path='' as $$
  select coalesce((select jsonb_build_object('active',true,'consentVersion',c.version,'grantedAt',c.granted_at,'consentReceipt',c.consent_receipt)
    from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id where p.token_hash=p_hash),
    jsonb_build_object('active',false,'prepared',exists(select 1 from public.hub_audience_participants p where p.token_hash=p_hash and p.credential_expires_at>now())));
$$;
alter table public.hub_audience_participants
  add column contribution_window_start timestamptz,
  add column contribution_requests integer not null default 0 check (contribution_requests >= 0);

create table public.hub_audience_game_tiers (
  participant_id uuid not null references public.hub_audience_participants(id) on delete cascade,
  league text not null check (league in ('NFL','CFB')),
  season integer not null check (season between 2000 and 2100),
  event_id text not null check (event_id ~ '^[1-9][0-9]{0,11}$'),
  canonical_game_id text not null,
  season_type text not null check (season_type in ('regular','postseason')),
  tier text not null check (tier in ('S','A','B','C','D')),
  contributed_at timestamptz not null default clock_timestamp(),
  delete_after_at timestamptz,
  primary key (participant_id,canonical_game_id),
  check (canonical_game_id = league || ':' || season::text || ':' || event_id)
);
create table public.hub_audience_favourites (
  participant_id uuid not null references public.hub_audience_participants(id) on delete cascade,
  league text not null check (league in ('NFL','CFB')),
  team_id text not null check (team_id ~ '^[1-9][0-9]{0,11}$'),
  season integer not null check (season between 2000 and 2100),
  contributed_at timestamptz not null default clock_timestamp(),
  delete_after_at timestamptz,
  primary key (participant_id,league)
);
-- Only the latest revision per selection key, including deletion tombstones.
-- Needed so a delayed earlier request cannot resurrect a removed selection.
-- This is ordering metadata, not opinion/phase history.
create table public.hub_audience_selection_versions (
  participant_id uuid not null references public.hub_audience_participants(id) on delete cascade,
  selection_key text not null check (selection_key ~ '^(tier:(NFL|CFB):([0-9]{4}:[1-9][0-9]{0,11}|\*)|favourite:(NFL|CFB))$'),
  revision bigint not null check (revision > 0),
  value_fingerprint text not null,
  season integer check (season between 2000 and 2100),
  delete_after_at timestamptz,
  primary key (participant_id,selection_key)
);
alter table public.hub_audience_game_tiers enable row level security;
alter table public.hub_audience_favourites enable row level security;
alter table public.hub_audience_selection_versions enable row level security;
revoke all on public.hub_audience_game_tiers,public.hub_audience_favourites,public.hub_audience_selection_versions from public,anon,authenticated;
grant select,insert,update,delete on public.hub_audience_game_tiers,public.hub_audience_favourites,public.hub_audience_selection_versions to service_role;
create index hub_audience_tiers_expiry on public.hub_audience_game_tiers(delete_after_at) where delete_after_at is not null;
create index hub_audience_favourites_expiry on public.hub_audience_favourites(delete_after_at) where delete_after_at is not null;
create index hub_audience_versions_expiry on public.hub_audience_selection_versions(delete_after_at) where delete_after_at is not null;

create function public.hub_audience_contribution_gate(p_hash text,p_granted_at timestamptz,p_receipt uuid) returns text
language plpgsql security invoker set search_path='' as $$
declare participant uuid; amount integer;
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_granted_at is null then return 'inactive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
  select p.id into participant from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id
    where p.token_hash=p_hash and c.granted_at=p_granted_at and c.consent_receipt=p_receipt and c.version='stage28-v1';
  if participant is null then return 'inactive'; end if;
  update public.hub_audience_participants set
    contribution_requests=case when contribution_window_start is null or contribution_window_start<clock_timestamp()-interval '1 minute' then 1 else contribution_requests+1 end,
    contribution_window_start=case when contribution_window_start is null or contribution_window_start<clock_timestamp()-interval '1 minute' then clock_timestamp() else contribution_window_start end
    where id=participant returning contribution_requests into amount;
  return case when amount<=120 then 'ready' else 'limited' end;
end $$;

create function public.hub_audience_write_selection(p_hash text,p_granted_at timestamptz,p_receipt uuid,p_kind text,p_league text,p_season integer,p_event_id text,p_value text,p_season_type text,p_revision bigint) returns text
language plpgsql security invoker set search_path='' as $$
declare participant uuid; target text; fingerprint text; previous public.hub_audience_selection_versions%rowtype; barrier bigint;
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_granted_at is null then return 'inactive'; end if;
  if p_league is null or p_league not in ('NFL','CFB') or p_kind is null or p_kind not in ('tier','favourite','clearTiers') or p_revision is null or p_revision<1
    or p_revision>floor(extract(epoch from clock_timestamp())*1000000)::bigint+60000000 then raise exception 'Invalid selection'; end if;
  if p_kind='tier' and (p_season is null or p_season not between 2000 and 2100 or p_event_id is null or p_event_id !~ '^[1-9][0-9]{0,11}$'
    or p_season_type is null or p_season_type not in ('regular','postseason') or (p_value is not null and p_value not in ('S','A','B','C','D'))) then raise exception 'Invalid game tier'; end if;
  if p_kind='favourite' and p_value is not null and (p_value !~ '^[1-9][0-9]{0,11}$' or p_season is null or p_season not between 2000 and 2100) then raise exception 'Invalid favourite'; end if;
  if p_kind='clearTiers' and (p_value is not null or p_event_id is not null or p_season is not null) then raise exception 'Invalid clear'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
  select p.id into participant from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id
    where p.token_hash=p_hash and c.granted_at=p_granted_at and c.consent_receipt=p_receipt and c.version='stage28-v1';
  if participant is null then return 'inactive'; end if;
  if p_revision<floor(extract(epoch from p_granted_at)*1000)::bigint*1000 then return 'conflict'; end if;
  target:=case p_kind when 'tier' then 'tier:'||p_league||':'||p_season::text||':'||p_event_id when 'clearTiers' then 'tier:'||p_league||':*' else 'favourite:'||p_league end;
  fingerprint:=md5(jsonb_build_array(p_kind,p_league,p_season,p_event_id,p_value,p_season_type)::text);
  if p_kind='tier' then
    select revision into barrier from public.hub_audience_selection_versions where participant_id=participant and selection_key='tier:'||p_league||':*';
    if barrier is not null and p_revision<=barrier then return 'conflict'; end if;
  end if;
  select * into previous from public.hub_audience_selection_versions where participant_id=participant and selection_key=target;
  if previous.revision is not null and p_revision<=previous.revision then
    return case when p_revision=previous.revision and previous.value_fingerprint=fingerprint then 'saved' else 'conflict' end;
  end if;
  insert into public.hub_audience_selection_versions(participant_id,selection_key,revision,value_fingerprint,season)
    values(participant,target,p_revision,fingerprint,p_season)
    on conflict(participant_id,selection_key) do update set revision=excluded.revision,value_fingerprint=excluded.value_fingerprint,season=coalesce(excluded.season,hub_audience_selection_versions.season);
  if p_kind='clearTiers' then
    delete from public.hub_audience_game_tiers t using public.hub_audience_selection_versions v
      where t.participant_id=participant and t.league=p_league and v.participant_id=t.participant_id and v.selection_key='tier:'||t.canonical_game_id and v.revision<=p_revision;
  elsif p_kind='tier' then
    if p_value is null then delete from public.hub_audience_game_tiers where participant_id=participant and canonical_game_id=p_league||':'||p_season::text||':'||p_event_id;
    else
      insert into public.hub_audience_game_tiers(participant_id,league,season,event_id,canonical_game_id,season_type,tier)
        values(participant,p_league,p_season,p_event_id,p_league||':'||p_season::text||':'||p_event_id,p_season_type,p_value)
        on conflict(participant_id,canonical_game_id) do update set tier=excluded.tier,season_type=excluded.season_type,contributed_at=clock_timestamp();
    end if;
  else
    if p_value is null then delete from public.hub_audience_favourites where participant_id=participant and league=p_league;
    else
      insert into public.hub_audience_favourites(participant_id,league,team_id,season) values(participant,p_league,p_value,p_season)
        on conflict(participant_id,league) do update set team_id=excluded.team_id,season=excluded.season,contributed_at=clock_timestamp(),delete_after_at=null;
    end if;
  end if;
  return 'saved';
end $$;
revoke all on function public.hub_audience_contribution_gate(text,timestamptz,uuid),public.hub_audience_write_selection(text,timestamptz,uuid,text,text,integer,text,text,text,bigint),public.hub_audience_state(text) from public,anon,authenticated;
grant execute on function public.hub_audience_contribution_gate(text,timestamptz,uuid),public.hub_audience_write_selection(text,timestamptz,uuid,text,text,integer,text,text,text,bigint),public.hub_audience_state(text) to service_role;
