-- Stage 30 additive schema, bounded phase snapshots and verified retention.
create table public.hub_audience_game_phases (
  participant_id uuid not null references public.hub_audience_participants(id) on delete cascade,
  league text not null check (league in ('NFL','CFB')),
  season integer not null check (season between 2000 and 2100),
  event_id text not null check (event_id ~ '^[1-9][0-9]{0,11}$'),
  canonical_game_id text not null,
  phase text not null check (phase in ('pregame','live','postgame')),
  tier text not null check (tier in ('S','A','B','C','D')),
  revision bigint not null check (revision>0),
  contributed_at timestamptz not null default clock_timestamp(),
  source_checked_at timestamptz not null,
  delete_after_at timestamptz,
  primary key(participant_id,canonical_game_id,phase),
  check(canonical_game_id=league||':'||season::text||':'||event_id)
);
create table public.hub_audience_season_ends (
  league text not null check (league in ('NFL','CFB')),
  season integer not null check (season between 2000 and 2100),
  ended_at timestamptz not null,
  confirmed_at timestamptz not null default clock_timestamp(),
  reference text not null check(length(reference)<=1024),
  source text not null default 'administrator' check(source='administrator'),
  postseason_complete boolean not null check(postseason_complete),
  expires_at timestamptz not null,
  primary key(league,season),
  check(ended_at>=make_timestamptz(season+1,1,1,0,0,0,'UTC') and ended_at<make_timestamptz(season+2,1,1,0,0,0,'UTC')),
  check(confirmed_at>=ended_at),
  check(expires_at=ended_at+interval '2160 hours')
);
create table public.hub_audience_retention_operation (
  id text primary key check(id='retention'),
  last_attempt_at timestamptz not null,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  status text not null check(status in ('success','partial_failure','failed')),
  deleted_counts jsonb not null default '{}',
  failed_participants integer not null default 0,
  skipped_busy integer not null default 0
);
alter table public.hub_audience_game_phases enable row level security;
alter table public.hub_audience_season_ends enable row level security;
alter table public.hub_audience_retention_operation enable row level security;
revoke all on public.hub_audience_game_phases,public.hub_audience_season_ends,public.hub_audience_retention_operation from public,anon,authenticated;
grant select,insert,update,delete on public.hub_audience_game_phases to service_role;
grant select,insert on public.hub_audience_season_ends to service_role;
grant select,insert,update on public.hub_audience_retention_operation to service_role;
create index hub_audience_phases_expiry on public.hub_audience_game_phases(delete_after_at) where delete_after_at is not null;
create index hub_audience_tiers_season on public.hub_audience_game_tiers(league,season,participant_id);
create index hub_audience_phases_season on public.hub_audience_game_phases(league,season,participant_id);
create index hub_audience_favourites_season on public.hub_audience_favourites(league,season,participant_id);
create index hub_audience_versions_season on public.hub_audience_selection_versions(season,participant_id);

create function public.hub_audience_confirm_season_end(p_league text,p_season integer,p_ended_at timestamptz,p_reference text,p_postseason_complete boolean) returns text
language plpgsql security invoker set search_path='' as $$
declare existing public.hub_audience_season_ends%rowtype; expiry timestamptz;
begin
  if p_league is null or p_league not in ('NFL','CFB') or p_season is null or p_season not between 2000 and 2100 or p_ended_at is null or p_ended_at>clock_timestamp()
    or p_postseason_complete is distinct from true or p_reference is null or length(p_reference)>1024
    or p_reference !~ '^https://([A-Za-z0-9-]+\.)*(nfl\.com|espn\.com|ncaa\.com|collegefootballplayoff\.com)/' then raise exception 'Invalid season confirmation'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hub-audience-retention',0));
  select * into existing from public.hub_audience_season_ends where league=p_league and season=p_season;
  if existing.league is not null then return case when existing.ended_at=p_ended_at and existing.reference=p_reference then 'confirmed' else 'conflict' end; end if;
  expiry:=p_ended_at+interval '2160 hours';
  insert into public.hub_audience_season_ends(league,season,ended_at,reference,postseason_complete,expires_at) values(p_league,p_season,p_ended_at,p_reference,true,expiry);
  -- No inferred/backfilled opinions. Only stamp expiry from this explicit authority.
  update public.hub_audience_game_tiers set delete_after_at=expiry where league=p_league and season=p_season;
  update public.hub_audience_game_phases set delete_after_at=expiry where league=p_league and season=p_season;
  update public.hub_audience_favourites set delete_after_at=expiry where league=p_league and season=p_season;
  update public.hub_audience_selection_versions set delete_after_at=expiry where season=p_season and (selection_key like 'tier:'||p_league||':%' or selection_key='favourite:'||p_league);
  return 'confirmed';
end $$;
-- Phases are passed only by the server after canonical verification, not browsers.
create function public.hub_audience_write_phase_selection(p_hash text,p_granted_at timestamptz,p_receipt uuid,p_kind text,p_league text,p_season integer,p_event_id text,p_value text,p_season_type text,p_revision bigint,p_phase text,p_checked_at timestamptz,p_kickoff_at timestamptz) returns text
language plpgsql security invoker set search_path='' as $$
declare participant uuid; previous_revision bigint; result text; expiry timestamptz; target text;
begin
  if p_kind is distinct from 'tier' then
    return public.hub_audience_write_selection(p_hash,p_granted_at,p_receipt,p_kind,p_league,p_season,p_event_id,p_value,p_season_type,p_revision);
  end if;
  if p_value is null then
    if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then return 'inactive'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
    select p.id into participant from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id
      where p.token_hash=p_hash and c.granted_at=p_granted_at and c.consent_receipt=p_receipt and c.version='stage28-v1';
    if participant is null then return 'inactive'; end if;
    target:=p_league||':'||p_season::text||':'||p_event_id;
    if not exists(select 1 from public.hub_audience_selection_versions where participant_id=participant and selection_key='tier:'||target)
      and not exists(select 1 from public.hub_audience_game_tiers where participant_id=participant and canonical_game_id=target)
      and not exists(select 1 from public.hub_audience_game_phases where participant_id=participant and canonical_game_id=target) then return 'saved'; end if;
    -- No snapshot or phase inference for removals. Stable deletion fingerprint on retry.
    return public.hub_audience_write_selection(p_hash,p_granted_at,p_receipt,p_kind,p_league,p_season,p_event_id,null,'regular',p_revision);
  end if;
  if p_phase is null or p_phase not in ('pregame','live','postgame') or p_checked_at is null or p_kickoff_at is null or p_checked_at<clock_timestamp()-interval '60 seconds' or p_checked_at>clock_timestamp()+interval '1 second'
    or (p_phase='pregame' and p_kickoff_at<=clock_timestamp()) or (p_phase in ('live','postgame') and p_kickoff_at>p_checked_at) then return 'unverified'; end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then return 'inactive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
  select p.id into participant from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id
    where p.token_hash=p_hash and c.granted_at=p_granted_at and c.consent_receipt=p_receipt and c.version='stage28-v1';
  if participant is null then return 'inactive'; end if;
  target:=p_league||':'||p_season::text||':'||p_event_id;
  select revision into previous_revision from public.hub_audience_selection_versions where participant_id=participant and selection_key='tier:'||target;
  -- A lock wait must not turn an initially fresh observation into a stale write.
  if p_checked_at<clock_timestamp()-interval '60 seconds' or (p_phase='pregame' and p_kickoff_at<=clock_timestamp()) then return 'unverified'; end if;
  -- A replay of a saved request must not create a snapshot in a later phase.
  if previous_revision is not null and previous_revision>=p_revision then
    return public.hub_audience_write_selection(p_hash,p_granted_at,p_receipt,p_kind,p_league,p_season,p_event_id,p_value,p_season_type,p_revision);
  end if;
  if p_value is not null and exists(select 1 from public.hub_audience_game_phases where participant_id=participant and canonical_game_id=target
    and ((p_phase='pregame' and phase in ('live','postgame')) or (p_phase='live' and phase='postgame'))) then return 'unverified'; end if;
  result:=public.hub_audience_write_selection(p_hash,p_granted_at,p_receipt,p_kind,p_league,p_season,p_event_id,p_value,p_season_type,p_revision);
  if result<>'saved' or p_value is null then return result; end if;
  select expires_at into expiry from public.hub_audience_season_ends where league=p_league and season=p_season;
  insert into public.hub_audience_game_phases(participant_id,league,season,event_id,canonical_game_id,phase,tier,revision,source_checked_at,delete_after_at)
    values(participant,p_league,p_season,p_event_id,target,p_phase,p_value,p_revision,p_checked_at,expiry)
    on conflict(participant_id,canonical_game_id,phase) do update set tier=excluded.tier,revision=excluded.revision,source_checked_at=excluded.source_checked_at,contributed_at=clock_timestamp(),delete_after_at=excluded.delete_after_at;
  return 'saved';
end $$;

create function public.hub_audience_run_retention(p_batch integer default 200) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare asof timestamptz:=clock_timestamp(); person record; n bigint; phases bigint:=0; tiers bigint:=0; favourites bigint:=0; versions bigint:=0; abandoned bigint:=0;
  dt bigint; dp bigint; df bigint; dv bigint; failed integer:=0; busy integer:=0; counts jsonb;
begin
  if p_batch<1 or p_batch>1000 or p_batch is null then raise exception 'Invalid batch'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('hub-audience-retention',0)) then return '{"status":"busy"}'::jsonb; end if;
  begin
    for person in
      select p.id,p.token_hash from public.hub_audience_participants p join (
        select t.participant_id from public.hub_audience_game_tiers t join public.hub_audience_season_ends s using(league,season) where s.expires_at<=asof
        union select t.participant_id from public.hub_audience_game_phases t join public.hub_audience_season_ends s using(league,season) where s.expires_at<=asof
        union select t.participant_id from public.hub_audience_favourites t join public.hub_audience_season_ends s using(league,season) where s.expires_at<=asof
        union select v.participant_id from public.hub_audience_selection_versions v join public.hub_audience_season_ends s
          on s.league=split_part(v.selection_key,':',2) and (s.season=v.season or (v.season is null and v.revision<=floor(extract(epoch from s.expires_at)*1000000)::bigint)) where s.expires_at<=asof
      ) eligible on eligible.participant_id=p.id order by p.id limit p_batch
    loop
      if not pg_try_advisory_xact_lock(hashtextextended(person.token_hash,0)) then busy:=busy+1; continue; end if;
      begin
        delete from public.hub_audience_game_phases t using public.hub_audience_season_ends s where t.participant_id=person.id and s.league=t.league and s.season=t.season and s.expires_at<=asof;
        get diagnostics dp=row_count;
        delete from public.hub_audience_game_tiers t using public.hub_audience_season_ends s where t.participant_id=person.id and s.league=t.league and s.season=t.season and s.expires_at<=asof;
        get diagnostics dt=row_count;
        delete from public.hub_audience_favourites t using public.hub_audience_season_ends s where t.participant_id=person.id and s.league=t.league and s.season=t.season and s.expires_at<=asof;
        get diagnostics df=row_count;
        delete from public.hub_audience_selection_versions v using public.hub_audience_season_ends s where v.participant_id=person.id and s.league=split_part(v.selection_key,':',2)
          and (s.season=v.season or (v.season is null and v.revision<=floor(extract(epoch from s.expires_at)*1000000)::bigint)) and s.expires_at<=asof;
        get diagnostics dv=row_count;
        phases:=phases+dp; tiers:=tiers+dt; favourites:=favourites+df; versions:=versions+dv;
      exception when others then failed:=failed+1; -- Only this participant rolls back; no identifiers/errors logged.
      end;
    end loop;
    -- Unconsented preparations have a separate established 15-minute lifetime.
    delete from public.hub_audience_participants where id in (select p.id from public.hub_audience_participants p where p.credential_expires_at<asof
      and not exists(select 1 from public.hub_audience_consent c where c.participant_id=p.id) limit p_batch);
    get diagnostics abandoned=row_count;
    update public.hub_audience_participants set contribution_requests=0,contribution_window_start=null where contribution_window_start<asof-interval '1 minute';
    counts:=jsonb_build_object('phases',phases,'tiers',tiers,'favourites',favourites,'ordering',versions,'abandonedPreparations',abandoned);
    insert into public.hub_audience_retention_operation(id,last_attempt_at,last_success_at,last_failure_at,status,deleted_counts,failed_participants,skipped_busy)
      values('retention',asof,case when failed=0 then asof end,case when failed>0 then asof end,case when failed=0 then 'success' else 'partial_failure' end,counts,failed,busy)
      on conflict(id) do update set last_attempt_at=excluded.last_attempt_at,last_success_at=coalesce(excluded.last_success_at,hub_audience_retention_operation.last_success_at),
        last_failure_at=coalesce(excluded.last_failure_at,hub_audience_retention_operation.last_failure_at),status=excluded.status,deleted_counts=excluded.deleted_counts,failed_participants=failed,skipped_busy=busy;
    return jsonb_build_object('status',case when failed=0 then 'success' else 'partial_failure' end,'deleted',counts,'failedParticipants',failed,'skippedBusy',busy);
  exception when others then
    insert into public.hub_audience_retention_operation(id,last_attempt_at,last_failure_at,status) values('retention',asof,asof,'failed')
      on conflict(id) do update set last_attempt_at=asof,last_failure_at=asof,status='failed',deleted_counts='{}'::jsonb,failed_participants=0,skipped_busy=0;
    return '{"status":"failed"}'::jsonb;
  end;
end $$;
create function public.hub_audience_retention_status() returns jsonb
language sql security invoker set search_path='' as $$
  select jsonb_build_object('seasons',coalesce((select jsonb_agg(to_jsonb(s) order by league,season) from public.hub_audience_season_ends s),'[]'::jsonb),
    'operation',(select to_jsonb(o) from public.hub_audience_retention_operation o where id='retention'));
$$;

-- Stage 29 writer upgraded below; its signature remains compatible with production.
create or replace function public.hub_audience_write_selection(p_hash text,p_granted_at timestamptz,p_receipt uuid,p_kind text,p_league text,p_season integer,p_event_id text,p_value text,p_season_type text,p_revision bigint) returns text
language plpgsql security invoker set search_path='' as $$
declare participant uuid; target text; fingerprint text; previous public.hub_audience_selection_versions%rowtype; barrier bigint; expiry timestamptz; cutoff bigint;
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_granted_at is null then return 'inactive'; end if;
  if p_league is null or p_league not in ('NFL','CFB') or p_kind is null or p_kind not in ('tier','favourite','clearTiers') or p_revision is null or p_revision<1
    or p_revision>floor(extract(epoch from clock_timestamp())*1000000)::bigint+60000000 then raise exception 'Invalid selection'; end if;
  if p_kind='tier' and (p_season is null or p_season not between 2000 and 2100 or p_event_id is null or p_event_id !~ '^[1-9][0-9]{0,11}$'
    or p_season_type is null or p_season_type not in ('regular','postseason') or (p_value is not null and p_value not in ('S','A','B','C','D'))) then raise exception 'Invalid game tier'; end if;
  if p_kind='favourite' and p_value is not null and (p_value !~ '^[1-9][0-9]{0,11}$' or p_season is null or p_season not between 2000 and 2100) then raise exception 'Invalid favourite'; end if;
  if p_kind='clearTiers' and (p_value is not null or p_event_id is not null or (p_season is not null and p_season not between 2000 and 2100)) then raise exception 'Invalid clear'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
  select p.id into participant from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id
    where p.token_hash=p_hash and c.granted_at=p_granted_at and c.consent_receipt=p_receipt and c.version='stage28-v1';
  if participant is null then return 'inactive'; end if;
  if p_revision<floor(extract(epoch from p_granted_at)*1000)::bigint*1000 then return 'conflict'; end if;
  if p_kind='clearTiers' and p_season is null then
    select max(season) into p_season from public.hub_audience_selection_versions where participant_id=participant and selection_key like 'tier:'||p_league||':%';
    if p_season is null then return 'unverified'; end if;
  end if;
  select floor(extract(epoch from max(expires_at))*1000000)::bigint into cutoff from public.hub_audience_season_ends where league=p_league and expires_at<=clock_timestamp();
  if cutoff is not null and p_revision<=cutoff then return 'conflict'; end if;
  select expires_at into expiry from public.hub_audience_season_ends where league=p_league and season=p_season;
  if expiry is not null and expiry<=clock_timestamp() and p_value is not null then return 'expired'; end if;
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
  if p_kind='favourite' and p_value is null and previous.revision is null then return 'saved'; end if;
  if p_kind='favourite' and p_value is null and p_season is null then
    p_season:=previous.season;
    select expires_at into expiry from public.hub_audience_season_ends where league=p_league and season=p_season;
  end if;
  insert into public.hub_audience_selection_versions(participant_id,selection_key,revision,value_fingerprint,season)
    values(participant,target,p_revision,fingerprint,p_season)
    on conflict(participant_id,selection_key) do update set revision=excluded.revision,value_fingerprint=excluded.value_fingerprint,season=coalesce(excluded.season,hub_audience_selection_versions.season);
  update public.hub_audience_selection_versions set delete_after_at=expiry where participant_id=participant and selection_key=target;
  if p_kind='clearTiers' then
    delete from public.hub_audience_game_phases t using public.hub_audience_selection_versions v
      where t.participant_id=participant and t.league=p_league and v.participant_id=t.participant_id and v.selection_key='tier:'||t.canonical_game_id and v.revision<=p_revision;
    delete from public.hub_audience_game_tiers t using public.hub_audience_selection_versions v
      where t.participant_id=participant and t.league=p_league and v.participant_id=t.participant_id and v.selection_key='tier:'||t.canonical_game_id and v.revision<=p_revision;
  elsif p_kind='tier' then
    if p_value is null then
      delete from public.hub_audience_game_phases where participant_id=participant and canonical_game_id=p_league||':'||p_season::text||':'||p_event_id;
      delete from public.hub_audience_game_tiers where participant_id=participant and canonical_game_id=p_league||':'||p_season::text||':'||p_event_id;
    else
      insert into public.hub_audience_game_tiers(participant_id,league,season,event_id,canonical_game_id,season_type,tier)
        values(participant,p_league,p_season,p_event_id,p_league||':'||p_season::text||':'||p_event_id,p_season_type,p_value)
        on conflict(participant_id,canonical_game_id) do update set tier=excluded.tier,season_type=excluded.season_type,contributed_at=clock_timestamp();
      update public.hub_audience_game_tiers set delete_after_at=expiry where participant_id=participant and canonical_game_id=p_league||':'||p_season::text||':'||p_event_id;
    end if;
  else
    if p_value is null then delete from public.hub_audience_favourites where participant_id=participant and league=p_league;
    else
      insert into public.hub_audience_favourites(participant_id,league,team_id,season) values(participant,p_league,p_value,p_season)
        on conflict(participant_id,league) do update set team_id=excluded.team_id,season=excluded.season,contributed_at=clock_timestamp(),delete_after_at=null;
      update public.hub_audience_favourites set delete_after_at=expiry where participant_id=participant and league=p_league;
    end if;
  end if;
  return 'saved';
end $$;
revoke all on function public.hub_audience_confirm_season_end(text,integer,timestamptz,text,boolean),public.hub_audience_retention_status(),public.hub_audience_run_retention(integer),
  public.hub_audience_write_phase_selection(text,timestamptz,uuid,text,text,integer,text,text,text,bigint,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.hub_audience_confirm_season_end(text,integer,timestamptz,text,boolean),public.hub_audience_retention_status(),public.hub_audience_run_retention(integer),
  public.hub_audience_write_phase_selection(text,timestamptz,uuid,text,text,integer,text,text,text,bigint,text,timestamptz,timestamptz) to service_role;
