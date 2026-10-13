-- Stage 31: read-only, private live aggregates. No reporting copies or collection changes.
create function public.hub_audience_report(p_league text default null, p_season integer default null,
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
    join public.hub_audience_consent c on c.participant_id=t.participant_id
    left join public.hub_audience_season_ends e using(league,season)
    where (p_league is null or t.league=p_league) and (p_season is null or t.season=p_season)
      and (t.delete_after_at is null or t.delete_after_at>now()) and (e.expires_at is null or e.expires_at>now())
  ), phases as materialized (
    select t.* from public.hub_audience_game_phases t
    join public.hub_audience_consent c on c.participant_id=t.participant_id
    left join public.hub_audience_season_ends e using(league,season)
    where (p_league is null or t.league=p_league) and (p_season is null or t.season=p_season)
      and (t.delete_after_at is null or t.delete_after_at>now()) and (e.expires_at is null or e.expires_at>now())
  ), favourites as materialized (
    select t.* from public.hub_audience_favourites t
    join public.hub_audience_consent c on c.participant_id=t.participant_id
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
      'activeBrowsers',(select count(*) from public.hub_audience_consent),
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
revoke all on function public.hub_audience_report(text,integer,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.hub_audience_report(text,integer,text,text,text,integer) to service_role;
