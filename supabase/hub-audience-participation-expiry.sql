-- Stage 35: fixed 365-day participation; collection remains disabled until release approval.
-- Keep historical consent rows withdrawable; never upgrade their consent implicitly.
alter table public.hub_audience_consent drop constraint hub_audience_consent_version_check;
alter table public.hub_audience_consent add constraint hub_audience_consent_version_check check(version in ('stage28-v1','stage35-v1'));
update public.hub_audience_participants p set credential_expires_at=c.granted_at+interval '8760 hours',delete_after_at=c.granted_at+interval '8760 hours'
  from public.hub_audience_consent c where c.participant_id=p.id;
create index if not exists hub_audience_credential_expiry on public.hub_audience_participants(credential_expires_at);

create or replace function public.hub_audience_state(p_hash text) returns jsonb
language sql security invoker set search_path='' as $$
  select coalesce((select jsonb_build_object('active',true,'consentVersion',c.version,'grantedAt',c.granted_at,'consentReceipt',c.consent_receipt)
    from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id where p.token_hash=p_hash and p.credential_expires_at>clock_timestamp() and c.version='stage35-v1'),
    jsonb_build_object('active',false,'prepared',exists(select 1 from public.hub_audience_participants p where p.token_hash=p_hash and p.credential_expires_at>clock_timestamp() and not exists(select 1 from public.hub_audience_consent c where c.participant_id=p.id))));
$$;

create or replace function public.hub_audience_grant(p_hash text,p_version text,p_text_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare participant uuid;
begin
  if p_hash is null or p_text_hash is null or p_version is null or p_hash !~ '^[a-f0-9]{64}$' or p_text_hash !~ '^[a-f0-9]{64}$' or p_version <> 'stage35-v1' then raise exception 'Invalid consent'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
  select p.id into participant from public.hub_audience_participants p where p.token_hash=p_hash
    and p.credential_expires_at>clock_timestamp();
  if participant is null then return '{"active":false}'::jsonb; end if;
  if not exists(select 1 from public.hub_audience_consent where participant_id=participant) then
    update public.hub_audience_participants set credential_expires_at=now()+interval '8760 hours',delete_after_at=now()+interval '8760 hours' where id=participant;
  end if;
  insert into public.hub_audience_consent(participant_id,version,text_hash) values(participant,p_version,p_text_hash) on conflict(participant_id) do nothing;
  return public.hub_audience_state(p_hash);
end $$;

create or replace function public.hub_audience_contribution_gate(p_hash text,p_granted_at timestamptz,p_receipt uuid) returns text
language plpgsql security invoker set search_path='' as $$
declare participant uuid; amount integer;
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_granted_at is null then return 'inactive'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
  select p.id into participant from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id
    where p.token_hash=p_hash and c.granted_at=p_granted_at and c.consent_receipt=p_receipt and c.version='stage35-v1' and p.credential_expires_at>clock_timestamp();
  if participant is null then return 'inactive'; end if;
  update public.hub_audience_participants set
    contribution_requests=case when contribution_window_start is null or contribution_window_start<clock_timestamp()-interval '1 minute' then 1 else contribution_requests+1 end,
    contribution_window_start=case when contribution_window_start is null or contribution_window_start<clock_timestamp()-interval '1 minute' then clock_timestamp() else contribution_window_start end
    where id=participant returning contribution_requests into amount;
  return case when amount<=120 then 'ready' else 'limited' end;
end $$;

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
    where p.token_hash=p_hash and c.granted_at=p_granted_at and c.consent_receipt=p_receipt and c.version='stage35-v1' and p.credential_expires_at>clock_timestamp();
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

create or replace function public.hub_audience_write_phase_selection(p_hash text,p_granted_at timestamptz,p_receipt uuid,p_kind text,p_league text,p_season integer,p_event_id text,p_value text,p_season_type text,p_revision bigint,p_phase text,p_checked_at timestamptz,p_kickoff_at timestamptz) returns text
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
      where p.token_hash=p_hash and c.granted_at=p_granted_at and c.consent_receipt=p_receipt and c.version='stage35-v1' and p.credential_expires_at>clock_timestamp();
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
    where p.token_hash=p_hash and c.granted_at=p_granted_at and c.consent_receipt=p_receipt and c.version='stage35-v1' and p.credential_expires_at>clock_timestamp();
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

create or replace function public.hub_audience_run_retention(p_batch integer default 200) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare asof timestamptz:=clock_timestamp(); person record; n bigint; phases bigint:=0; tiers bigint:=0; favourites bigint:=0; versions bigint:=0; abandoned bigint:=0; expired bigint:=0; consented boolean;
  dt bigint; dp bigint; df bigint; dv bigint; failed integer:=0; busy integer:=0; counts jsonb;
begin
  if p_batch<1 or p_batch>1000 or p_batch is null then raise exception 'Invalid batch'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('hub-audience-retention',0)) then return '{"status":"busy"}'::jsonb; end if;
  begin
    for person in
      select p.id,p.token_hash from public.hub_audience_participants p join (
        select id as participant_id from public.hub_audience_participants where credential_expires_at<=asof
        union select t.participant_id from public.hub_audience_game_tiers t join public.hub_audience_season_ends s using(league,season) where s.expires_at<=asof
        union select t.participant_id from public.hub_audience_game_phases t join public.hub_audience_season_ends s using(league,season) where s.expires_at<=asof
        union select t.participant_id from public.hub_audience_favourites t join public.hub_audience_season_ends s using(league,season) where s.expires_at<=asof
        union select v.participant_id from public.hub_audience_selection_versions v join public.hub_audience_season_ends s
          on s.league=split_part(v.selection_key,':',2) and (s.season=v.season or (v.season is null and v.revision<=floor(extract(epoch from s.expires_at)*1000000)::bigint)) where s.expires_at<=asof
      ) eligible on eligible.participant_id=p.id order by p.id limit p_batch
    loop
      if not pg_try_advisory_xact_lock(hashtextextended(person.token_hash,0)) then busy:=busy+1; continue; end if;
      begin
        -- Same per-credential lock as writes/withdrawal. Expired parents cascade
        -- consent, current selections, phases and ordering, even for unknown seasons.
        if exists(select 1 from public.hub_audience_participants where id=person.id and credential_expires_at<=clock_timestamp()) then
          consented:=exists(select 1 from public.hub_audience_consent where participant_id=person.id);
          delete from public.hub_audience_participants where id=person.id;
          if consented then expired:=expired+1; else abandoned:=abandoned+1; end if;
          continue;
        end if;
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
    update public.hub_audience_participants set contribution_requests=0,contribution_window_start=null where contribution_window_start<asof-interval '1 minute';
    counts:=jsonb_build_object('phases',phases,'tiers',tiers,'favourites',favourites,'ordering',versions,'abandonedPreparations',abandoned,'expiredParticipants',expired);
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

create or replace function public.hub_audience_report(p_league text default null, p_season integer default null,
  p_game text default null, p_view text default 'current', p_phase text default null, p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' set statement_timeout='8s' as $$
declare result jsonb;
begin
  if (p_league is not null and p_league not in ('NFL','CFB')) or
    (p_season is not null and p_season not between 2000 and 2100) or
    (p_game is not null and (p_game !~ '^(NFL|CFB):(20[0-9]{2}|2100):[1-9][0-9]{0,11}$' or
      (p_league is not null and split_part(p_game,':',1)<>p_league) or
      (p_season is not null and split_part(p_game,':',2)::integer<>p_season))) or
    p_view is null or p_view not in ('current','phases') or
    (p_phase is not null and p_phase not in ('pregame','live','postgame')) or
    (p_view='current' and p_phase is not null) or p_offset is null or p_offset<0 or p_offset>10000 then
    raise exception 'Invalid report filters';
  end if;
  with
  tiers as materialized (
    select t.* from public.hub_audience_game_tiers t
    join public.hub_audience_consent c on c.participant_id=t.participant_id and c.version='stage35-v1'
    join public.hub_audience_participants p on p.id=t.participant_id and p.credential_expires_at>now()
    left join public.hub_audience_season_ends e using(league,season)
    where (p_league is null or t.league=p_league) and (p_season is null or t.season=p_season)
      and (t.delete_after_at is null or t.delete_after_at>now()) and (e.expires_at is null or e.expires_at>now())
  ), phases as materialized (
    select t.* from public.hub_audience_game_phases t
    join public.hub_audience_consent c on c.participant_id=t.participant_id and c.version='stage35-v1'
    join public.hub_audience_participants p on p.id=t.participant_id and p.credential_expires_at>now()
    left join public.hub_audience_season_ends e using(league,season)
    where (p_league is null or t.league=p_league) and (p_season is null or t.season=p_season)
      and (t.delete_after_at is null or t.delete_after_at>now()) and (e.expires_at is null or e.expires_at>now())
  ), favourites as materialized (
    select t.* from public.hub_audience_favourites t
    join public.hub_audience_consent c on c.participant_id=t.participant_id and c.version='stage35-v1'
    join public.hub_audience_participants p on p.id=t.participant_id and p.credential_expires_at>now()
    left join public.hub_audience_season_ends e using(league,season)
    where (p_league is null or t.league=p_league) and (p_season is null or t.season=p_season)
      and (t.delete_after_at is null or t.delete_after_at>now()) and (e.expires_at is null or e.expires_at>now())
  ), samples as materialized (
    select league,season,event_id,canonical_game_id,'current'::text sample,tier from tiers
    union all select league,season,event_id,canonical_game_id,phase,tier from phases
  ), distributions as (
    select league,season,event_id,canonical_game_id,sample,count(*) n,
      jsonb_build_object('S',count(*) filter(where tier='S'),'A',count(*) filter(where tier='A'),
        'B',count(*) filter(where tier='B'),'C',count(*) filter(where tier='C'),'D',count(*) filter(where tier='D')) counts
    from samples group by league,season,event_id,canonical_game_id,sample
  ), eligible as materialized (
    select distinct league,season,event_id,canonical_game_id from samples where
      (p_game is null or canonical_game_id=p_game) and
      ((p_view='current' and sample='current') or (p_view='phases' and sample<>'current' and (p_phase is null or sample=p_phase)))
  ), page as (select * from eligible order by season desc,league,canonical_game_id limit 10 offset p_offset),
  fav_counts as (select league,team_id,count(*) n from favourites group by league,team_id),
  seasons as (select league,season from public.hub_audience_game_tiers union select league,season from public.hub_audience_game_phases
    union select league,season from public.hub_audience_favourites union select league,season from public.hub_audience_season_ends)
  select jsonb_build_object(
    'overview',jsonb_build_object(
      'activeBrowsers',(select count(*) from public.hub_audience_consent c join public.hub_audience_participants p on p.id=c.participant_id where c.version='stage35-v1' and p.credential_expires_at>now()),
      'currentRatings',(select count(*) from tiers),
      'nflFavourites',(select count(*) from favourites where league='NFL'),
      'cfbFavourites',(select count(*) from favourites where league='CFB'),
      'games',(select count(distinct canonical_game_id) from samples),
      'pregame',(select count(*) from phases where phase='pregame'),
      'live',(select count(*) from phases where phase='live'),
      'postgame',(select count(*) from phases where phase='postgame'),
      'latestContribution',(select max(contributed_at) from (select contributed_at from tiers union all select contributed_at from phases union all select contributed_at from favourites) a)),
    'favourites',coalesce((select jsonb_agg(jsonb_build_object('league',league,'teamId',team_id,'count',n,'denominator',
      (select count(*) from favourites f where f.league=fav_counts.league)) order by league,n desc,team_id) from fav_counts),'[]'::jsonb),
    'gameTotal',(select count(*) from eligible),
    'games',coalesce((select jsonb_agg(jsonb_build_object('league',g.league,'season',g.season,'eventId',g.event_id,'gameId',g.canonical_game_id,
      'samples',(select jsonb_object_agg(sample,jsonb_build_object('count',n,'tiers',counts)) from distributions d where d.canonical_game_id=g.canonical_game_id))
      order by g.season desc,g.league,g.canonical_game_id) from page g),'[]'::jsonb),
    'seasons',coalesce((select jsonb_agg(jsonb_build_object('league',s.league,'season',s.season,'endedAt',e.ended_at,'expiresAt',e.expires_at)
      order by s.season desc,s.league) from seasons s left join public.hub_audience_season_ends e using(league,season)),'[]'::jsonb),
    'retention',(select jsonb_build_object('status',status,'lastSuccessAt',last_success_at,'lastFailureAt',last_failure_at) from public.hub_audience_retention_operation where id='retention')
  ) into result;
  return result;
end $$;
-- CREATE OR REPLACE preserves existing deny-public/service-role-only grants.

