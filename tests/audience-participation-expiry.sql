-- Execute inside BEGIN/ROLLBACK: no fixtures, counters or cleanup persist.
set local role service_role;
do $test$
declare h text:=md5(random()::text)||md5(random()::text); oldh text:=md5(random()::text)||md5(random()::text);
  person uuid; consent_at timestamptz; receipt uuid; deadline timestamptz; revision bigint;
  state jsonb; report jsonb; cleaned jsonb; before_count integer; league text;
begin
  before_count:=(public.hub_audience_report()->'overview'->>'activeBrowsers')::integer;
  perform public.hub_audience_prepare(h);
  if public.hub_audience_state(h)->>'active'<>'false' then raise exception 'Preparation collected consent'; end if;
  begin
    perform public.hub_audience_grant(h,'stage28-v1',repeat('a',64));
    raise exception 'Old wording accepted';
  exception when raise_exception then if sqlerrm='Old wording accepted' then raise; end if; end;
  state:=public.hub_audience_grant(h,'stage35-v1',repeat('a',64));
  if state->>'active'<>'true' or state->>'consentVersion'<>'stage35-v1' then raise exception 'Opt-in failed'; end if;
  select p.id,p.credential_expires_at,c.granted_at,c.consent_receipt into person,deadline,consent_at,receipt
    from public.hub_audience_participants p join public.hub_audience_consent c on c.participant_id=p.id where p.token_hash=h;
  if deadline<>consent_at+interval '8760 hours' then raise exception 'Not exactly 365 UTC days'; end if;
  perform public.hub_audience_grant(h,'stage35-v1',repeat('a',64));
  if (select credential_expires_at from public.hub_audience_participants where id=person)<>deadline then raise exception 'Retry renewed consent'; end if;
  if public.hub_audience_state(h)<>state then raise exception 'Refresh changed consent'; end if;
  report:=public.hub_audience_report(null,2099);
  if report->'overview'->>'currentRatings'<>'0' or report->'overview'->>'nflFavourites'<>'0' or report->'overview'->>'cfbFavourites'<>'0' then raise exception 'Retrospective upload'; end if;
  revision:=floor(extract(epoch from clock_timestamp())*1000000)::bigint;
  foreach league in array array['NFL','CFB'] loop
    if public.hub_audience_contribution_gate(h,consent_at,receipt)<>'ready' then raise exception 'Gate failed'; end if;
    if public.hub_audience_write_phase_selection(h,consent_at,receipt,'tier',league,2099,'999999999', 'A','regular',revision,'pregame',clock_timestamp(),clock_timestamp()+interval '1 day')<>'saved' then raise exception 'Rating failed'; end if;
    revision:=revision+1;
    if public.hub_audience_write_selection(h,consent_at,receipt,'favourite',league,2099,null,'12',null,revision)<>'saved' then raise exception 'Favourite failed'; end if;
    revision:=revision+1;
    if public.hub_audience_write_phase_selection(h,consent_at,receipt,'tier',league,2099,'999999999','S','regular',revision,'pregame',clock_timestamp(),clock_timestamp()+interval '1 day')<>'saved' then raise exception 'Change failed'; end if;
    revision:=revision+1;
    report:=public.hub_audience_report(league,2099);
    if report->'overview'->>'currentRatings'<>'1' or report->'overview'->>'pregame'<>'1' or report->'games'->0->'samples'->'current'->'tiers'->>'S'<>'1' then raise exception 'Admin ratings wrong'; end if;
    if report->'favourites'->0->>'teamId'<>'12' or report->'favourites'->0->>'count'<>'1' then raise exception 'Admin favourites wrong'; end if;
    if public.hub_audience_write_selection(h,consent_at,receipt,'favourite',league,null,null,null,null,revision)<>'saved' then raise exception 'Favourite removal failed'; end if;
    revision:=revision+1;
    if public.hub_audience_write_phase_selection(h,consent_at,receipt,'tier',league,2099,'999999999',null,'regular',revision,null,null,null)<>'saved' then raise exception 'Rating removal failed'; end if;
    revision:=revision+1;
    if public.hub_audience_report(league,2099)->'overview'->>'currentRatings'<>'0' then raise exception 'Removal still reported'; end if;
  end loop;
  -- Put contributions back, then simulate expiry before the scheduler can purge.
  perform public.hub_audience_write_phase_selection(h,consent_at,receipt,'tier','NFL',2099,'999999999','S','regular',revision,'pregame',clock_timestamp(),clock_timestamp()+interval '1 day');
  perform public.hub_audience_write_selection(h,consent_at,receipt,'favourite','CFB',2099,null,'12',null,revision+1);
  update public.hub_audience_participants set created_at=now()-interval '366 days',credential_expires_at=clock_timestamp()-interval '1 second' where id=person;
  if public.hub_audience_state(h)->>'active'<>'false' or public.hub_audience_state(h)->>'prepared'<>'false' then raise exception 'Expired state recognised'; end if;
  if public.hub_audience_grant(h,'stage35-v1',repeat('a',64))->>'active'<>'false' then raise exception 'Expired credential renewed'; end if;
  if public.hub_audience_contribution_gate(h,consent_at,receipt)<>'inactive' then raise exception 'Expired gate accepted'; end if;
  if public.hub_audience_write_selection(h,consent_at,receipt,'favourite','NFL',2099,null,'12',null,revision+2)<>'inactive' then raise exception 'Expired writer accepted'; end if;
  if public.hub_audience_write_phase_selection(h,consent_at,receipt,'tier','NFL',2099,'999999999','A','regular',revision+3,'pregame',clock_timestamp(),clock_timestamp()+interval '1 day')<>'inactive' then raise exception 'Expired phase accepted'; end if;
  if public.hub_audience_write_phase_selection(h,consent_at,receipt,'tier','NFL',2099,'999999999',null,'regular',revision+4,null,null,null)<>'inactive' then raise exception 'Expired removal treated as active'; end if;
  report:=public.hub_audience_report(null,2099);
  if (report->'overview'->>'activeBrowsers')::integer<>before_count or report->'overview'->>'currentRatings'<>'0' or report->'overview'->>'cfbFavourites'<>'0' then raise exception 'Expired records counted before purge'; end if;
  cleaned:=public.hub_audience_run_retention();
  if cleaned->>'status'<>'success' or (cleaned->'deleted'->>'expiredParticipants')::integer<1 then raise exception 'Expired cleanup failed'; end if;
  if exists(select 1 from public.hub_audience_participants where id=person) or exists(select 1 from public.hub_audience_consent where participant_id=person)
    or exists(select 1 from public.hub_audience_game_phases where participant_id=person) or exists(select 1 from public.hub_audience_game_tiers where participant_id=person)
    or exists(select 1 from public.hub_audience_favourites where participant_id=person) or exists(select 1 from public.hub_audience_selection_versions where participant_id=person) then raise exception 'Cascade incomplete'; end if;
  -- Fresh opt-in is a new epoch; old delayed requests cannot reappear.
  perform public.hub_audience_prepare(h); state:=public.hub_audience_grant(h,'stage35-v1',repeat('a',64));
  if state->>'active'<>'true' or (state->>'consentReceipt')::uuid=receipt then raise exception 'Rejoin not fresh'; end if;
  if public.hub_audience_contribution_gate(h,consent_at,receipt)<>'inactive' then raise exception 'Old consent replay'; end if;
  perform public.hub_audience_withdraw(h);
  if public.hub_audience_state(h)->>'active'<>'false' then raise exception 'Withdrawal failed'; end if;
  -- Even an expired credential remains able to delete its own records.
  perform public.hub_audience_prepare(oldh); perform public.hub_audience_grant(oldh,'stage35-v1',repeat('a',64));
  update public.hub_audience_participants set created_at=now()-interval '366 days',credential_expires_at=clock_timestamp()-interval '1 second' where token_hash=oldh;
  if public.hub_audience_withdraw(oldh) is distinct from true then raise exception 'Expired withdrawal blocked'; end if;
  if exists(select 1 from public.hub_audience_participants where token_hash=oldh) then raise exception 'Expired withdrawal did not delete'; end if;
end $test$;
reset role;
