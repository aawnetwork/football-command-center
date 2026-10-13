-- Synthetic fixtures only. Execute inside BEGIN/ROLLBACK, never standalone.
set local role service_role;
do $phases$
declare h text:=repeat('1',64); t timestamptz; receipt uuid; pid uuid; r bigint; result text;
begin
  perform public.hub_audience_prepare(h); perform public.hub_audience_grant(h,'stage35-v1',repeat('e',64));
  select p.id,c.granted_at,c.consent_receipt into pid,t,receipt from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id where token_hash=h;
  r:=floor(extract(epoch from clock_timestamp())*1000)::bigint*1000+1000;
  result:=public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000001','A','regular',r,'pregame',clock_timestamp(),clock_timestamp()+interval '1 day');
  if result<>'saved' then raise exception 'Pregame failed'; end if;
  perform public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000001','B','regular',r+1,'pregame',clock_timestamp(),clock_timestamp()+interval '1 day');
  if (select count(*) from public.hub_audience_game_phases where participant_id=pid)<>1 then raise exception 'Unbounded pregame'; end if;
  perform public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000001','S','regular',r+2,'live',clock_timestamp(),clock_timestamp()-interval '1 day');
  if not exists(select 1 from public.hub_audience_game_phases where participant_id=pid and phase='pregame' and tier='B') then raise exception 'Pregame overwritten'; end if;
  -- Re-verifying the same action after final must not invent a postgame selection.
  perform public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000001','S','regular',r+2,'postgame',clock_timestamp(),clock_timestamp()-interval '1 day');
  if (select count(*) from public.hub_audience_game_phases where participant_id=pid)<>2 then raise exception 'Replay invented phase'; end if;
  perform public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000001','C','regular',r+3,'postgame',clock_timestamp(),clock_timestamp()-interval '1 day');
  if (select count(*) from public.hub_audience_game_phases where participant_id=pid)<>3 or not exists(select 1 from public.hub_audience_game_tiers where participant_id=pid and tier='C') then raise exception 'Current and phases inconsistent'; end if;
  if not exists(select 1 from public.hub_audience_game_phases where participant_id=pid and phase='live' and tier='S') then raise exception 'Live overwritten'; end if;
  if public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000001','A','regular',r+2,'live',clock_timestamp(),clock_timestamp()-interval '1 day')<>'conflict' then raise exception 'Out of order accepted'; end if;
  if public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000001','A','regular',r+4,'pregame',clock_timestamp(),clock_timestamp()+interval '1 day')<>'unverified' then raise exception 'Phase regression accepted'; end if;
  if public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000001','A','regular',r+4,'live',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 day')<>'unverified' then raise exception 'Stale phase accepted'; end if;
  perform public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000001',null,null,r+4,null,null,null);
  if public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000001',null,null,r+4,null,null,null)<>'saved' then raise exception 'Removal retry failed'; end if;
  if exists(select 1 from public.hub_audience_game_phases where participant_id=pid) then raise exception 'Removal retained history'; end if;
  perform public.hub_audience_write_phase_selection(h,t,receipt,'tier','CFB',2026,'401000002','S','postseason',r+5,'postgame',clock_timestamp(),clock_timestamp()-interval '1 day');
  perform public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000003','A','regular',r+6,'pregame',clock_timestamp(),clock_timestamp()+interval '1 day');
  perform public.hub_audience_write_phase_selection(h,t,receipt,'clearTiers','NFL',2026,null,null,null,r+7,null,null,null);
  if exists(select 1 from public.hub_audience_game_phases where participant_id=pid and league='NFL') or (select count(*) from public.hub_audience_game_phases where participant_id=pid and league='CFB')<>1 then raise exception 'Clear/leagues failed'; end if;
  perform public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000003','B','regular',r+9,'postgame',clock_timestamp(),clock_timestamp()-interval '1 day');
  perform public.hub_audience_write_phase_selection(h,t,receipt,'clearTiers','NFL',2026,null,null,null,r+8,null,null,null);
  if not exists(select 1 from public.hub_audience_game_phases where participant_id=pid and league='NFL') then raise exception 'Old clear deleted new phase'; end if;
  perform public.hub_audience_withdraw(h);
  if exists(select 1 from public.hub_audience_game_phases where participant_id=pid) then raise exception 'Withdrawal did not cascade'; end if;
  if public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2026,'401000003','B','regular',r+10,'postgame',clock_timestamp(),clock_timestamp()-interval '1 day')<>'inactive' then raise exception 'Deleted participant recreated'; end if;
end $phases$;
do $retention$
declare h text:=repeat('2',64); t timestamptz; receipt uuid; pid uuid; r bigint; result jsonb; finish timestamptz:=clock_timestamp()-interval '2160 hours'+interval '1 hour';
begin
  perform public.hub_audience_prepare(h); perform public.hub_audience_grant(h,'stage35-v1',repeat('e',64));
  select p.id,c.granted_at,c.consent_receipt into pid,t,receipt from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id where token_hash=h;
  r:=floor(extract(epoch from clock_timestamp())*1000)::bigint*1000+1000;
  perform public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2025,'401000004','S','postseason',r,'postgame',clock_timestamp(),clock_timestamp()-interval '1 day');
  perform public.hub_audience_write_selection(h,t,receipt,'favourite','NFL',2025,null,'6',null,r+1);
  perform public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2025,'401000005',null,'postseason',r+2);
  perform public.hub_audience_write_phase_selection(h,t,receipt,'tier','CFB',2026,'401000006','A','regular',r+3,'postgame',clock_timestamp(),clock_timestamp()-interval '1 day');
  -- A forged expiry field without a verified authority must not delete anything.
  update public.hub_audience_game_phases set delete_after_at=clock_timestamp()-interval '1 day' where participant_id=pid;
  result:=public.hub_audience_run_retention();
  if result->>'status'<>'success' or (select count(*) from public.hub_audience_game_phases where participant_id=pid)<>2 then raise exception 'Unknown end deleted'; end if;
  if public.hub_audience_confirm_season_end('NFL',2025,finish,'https://www.nfl.com/stage30-rollback-fixture',true)<>'confirmed' then raise exception 'Confirmation failed'; end if;
  if not exists(select 1 from public.hub_audience_season_ends where league='NFL' and season=2025 and expires_at=finish+interval '2160 hours') then raise exception 'Not exactly 90 days'; end if;
  if public.hub_audience_confirm_season_end('NFL',2025,finish-interval '1 day','https://www.nfl.com/stage30-rollback-fixture',true)<>'conflict' then raise exception 'Confirmation silently changed'; end if;
  result:=public.hub_audience_run_retention();
  if (select count(*) from public.hub_audience_game_phases where participant_id=pid)<>2 then raise exception 'Deleted before expiry'; end if;
end $retention$;
reset role;
-- Advance the synthetic confirmation to an exact due boundary, not the clock/API.
update public.hub_audience_season_ends set ended_at=statement_timestamp()-interval '2160 hours',expires_at=statement_timestamp() where league='NFL' and season=2025;
create function pg_temp.stage30_fail_delete() returns trigger language plpgsql as $$begin raise exception 'Synthetic failure'; end$$;
create trigger stage30_fixture_failure before delete on public.hub_audience_game_phases for each row execute function pg_temp.stage30_fail_delete();
do $retry$
declare result jsonb;
begin
  result:=public.hub_audience_run_retention();
  if result->>'status'<>'partial_failure' then raise exception 'Failure not recorded'; end if;
  if not exists(select 1 from public.hub_audience_game_tiers where league='NFL') then raise exception 'Partial participant failure was not atomic'; end if;
end $retry$;
drop trigger stage30_fixture_failure on public.hub_audience_game_phases;
do $due$
declare result jsonb; h text:=repeat('2',64); pid uuid; t timestamptz; receipt uuid; r bigint;
begin
  result:=public.hub_audience_run_retention();
  if result->>'status'<>'success' then raise exception 'Retry failed'; end if;
  select p.id,c.granted_at,c.consent_receipt into pid,t,receipt from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id where token_hash=h;
  if pid is null then raise exception 'Contribution retention deleted consent'; end if;
  if exists(select 1 from public.hub_audience_game_phases where participant_id=pid and league='NFL') or exists(select 1 from public.hub_audience_game_tiers where participant_id=pid and league='NFL') or exists(select 1 from public.hub_audience_favourites where participant_id=pid and league='NFL') or exists(select 1 from public.hub_audience_selection_versions where participant_id=pid and selection_key like '%:NFL%') then raise exception 'Expired individual data remains'; end if;
  if not exists(select 1 from public.hub_audience_game_phases where participant_id=pid and league='CFB') then raise exception 'Other league deleted'; end if;
  result:=public.hub_audience_run_retention();
  if (result->'deleted'->>'phases')::integer<>0 then raise exception 'Not idempotent'; end if;
  r:=floor(extract(epoch from clock_timestamp())*1000)::bigint*1000+1000;
  if public.hub_audience_write_phase_selection(h,t,receipt,'tier','NFL',2025,'401000004','S','postseason',r,'postgame',clock_timestamp(),clock_timestamp()-interval '1 day')<>'expired' then raise exception 'Expired season recreated'; end if;
  if public.hub_audience_write_selection(h,t,receipt,'tier','CFB',2026,'401000007','S','regular',1)<>'conflict' then raise exception 'Old contribution allowed'; end if;
  perform public.hub_audience_withdraw(h);
end $due$;
do $security$
declare item record;
begin
  for item in select c.oid,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('hub_audience_game_phases','hub_audience_season_ends','hub_audience_retention_operation') loop
    if not item.relrowsecurity or has_table_privilege('anon',item.oid,'SELECT') or has_table_privilege('authenticated',item.oid,'INSERT') then raise exception 'Public access'; end if;
  end loop;
  for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('hub_audience_write_phase_selection','hub_audience_confirm_season_end','hub_audience_run_retention','hub_audience_retention_status') loop
    if has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('authenticated',item.oid,'EXECUTE') then raise exception 'Public RPC access'; end if;
  end loop;
end $security$;
