-- Run inside BEGIN/ROLLBACK. Fixtures never become visible as real findings.
set local role service_role;
do $test$
declare a uuid; b uuid; h text:=md5(random()::text)||md5(random()::text); report jsonb; before_count integer; expired_season integer:=extract(year from now())::integer-2;
begin
  before_count:=(public.hub_audience_report()->'overview'->>'activeBrowsers')::integer;
  insert into public.hub_audience_participants(token_hash) values(h) returning id into a;
  insert into public.hub_audience_participants(token_hash) values(md5(random()::text)||md5(random()::text)) returning id into b;
  insert into public.hub_audience_consent(participant_id,version,text_hash) values(a,'stage28-v1',repeat('a',64)),(b,'stage28-v1',repeat('b',64));
  insert into public.hub_audience_favourites(participant_id,league,team_id,season) values(a,'NFL','12',2099),(b,'NFL','6',2099),(a,'CFB','12',2099);
  insert into public.hub_audience_game_tiers(participant_id,league,season,event_id,canonical_game_id,season_type,tier)
    values(a,'NFL',2099,'991','NFL:2099:991','regular','S'),(b,'NFL',2099,'991','NFL:2099:991','regular','A');
  insert into public.hub_audience_game_phases(participant_id,league,season,event_id,canonical_game_id,phase,tier,revision,source_checked_at)
    values(a,'NFL',2099,'991','NFL:2099:991','pregame','B',1,now()),(a,'NFL',2099,'991','NFL:2099:991','live','S',2,now()),(b,'NFL',2099,'991','NFL:2099:991','postgame','D',3,now());
  report:=public.hub_audience_report(null,2099);
  if (report->'overview'->>'activeBrowsers')::integer<>before_count+2 or (report->'overview'->>'currentRatings')::integer<>2 or (report->'overview'->>'games')::integer<>1 then raise exception 'Overview or cross-phase double-count failure'; end if;
  if (report->'overview'->>'nflFavourites')::integer<>2 or (report->'overview'->>'cfbFavourites')::integer<>1 then raise exception 'League denominators mixed'; end if;
  if exists(select 1 from jsonb_array_elements(report->'favourites') f where (f->>'denominator')::integer<>case when f->>'league'='NFL' then 2 else 1 end) then raise exception 'Favourite denominator wrong'; end if;
  if report->'games'->0->'samples'->'current'->'tiers'->>'S'<>'1' or report->'games'->0->'samples'->'pregame'->'tiers'->>'B'<>'1' or report->'games'->0->'samples'->'live'->'count'<>'1' or report->'games'->0->'samples'->'postgame'->'count'<>'1' then raise exception 'Distribution failure'; end if;
  if jsonb_array_length(public.hub_audience_report('CFB',2099)->'games')<>0 or jsonb_array_length(public.hub_audience_report('NFL',2099,null,'phases','live')->'games')<>1 or jsonb_array_length(public.hub_audience_report('NFL',2099,null,'current',null,10)->'games')<>0 then raise exception 'Filtering or pagination failure'; end if;
  -- Prove registry expiry excludes rows even without stamped delete_after_at and before purge.
  insert into public.hub_audience_season_ends(league,season,ended_at,reference,postseason_complete,expires_at)
    values('NFL',expired_season,make_timestamptz(expired_season+1,1,1,0,0,0,'UTC'),'https://www.nfl.com/',true,make_timestamptz(expired_season+1,1,1,0,0,0,'UTC')+interval '2160 hours');
  insert into public.hub_audience_game_tiers(participant_id,league,season,event_id,canonical_game_id,season_type,tier)
    values(a,'NFL',expired_season,'992','NFL:'||expired_season||':992','regular','S');
  insert into public.hub_audience_game_phases(participant_id,league,season,event_id,canonical_game_id,phase,tier,revision,source_checked_at)
    values(a,'NFL',expired_season,'992','NFL:'||expired_season||':992','postgame','S',1,now());
  update public.hub_audience_favourites set season=expired_season where participant_id=b;
  report:=public.hub_audience_report('NFL',expired_season);
  if report->'overview'->>'currentRatings'<>'0' or report->'overview'->>'postgame'<>'0' or report->'overview'->>'nflFavourites'<>'0' then raise exception 'Expired data counted'; end if;
  perform public.hub_audience_withdraw(h);
  report:=public.hub_audience_report(null,2099);
  if (report->'overview'->>'activeBrowsers')::integer<>before_count+1 or report->'overview'->>'currentRatings'<>'1' or report->'overview'->>'pregame'<>'0' or report->'overview'->>'live'<>'0' or report->'overview'->>'cfbFavourites'<>'0' then raise exception 'Withdrawal not reflected'; end if;
  begin perform public.hub_audience_report('BAD'); raise exception 'Invalid input accepted'; exception when raise_exception then if sqlerrm='Invalid input accepted' then raise; end if; end;
  if report::text ~ 'participant_id|token_hash|consent_receipt|revision|value_fingerprint' then raise exception 'Private fields exposed'; end if;
end $test$;
reset role;
