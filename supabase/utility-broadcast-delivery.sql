-- Server-only receipt and atomic delivery; existing reader/table stay unchanged.
create table public.ur_desk_broadcast_publications (
 league text primary key check (league in ('CFB','NFL')),
 feed_id text not null, version bigint not null check (version>0),
 payload_hash text not null, record_count integer not null, received_at timestamptz not null default now()
);
alter table public.ur_desk_broadcast_publications enable row level security;
revoke all on public.ur_desk_broadcast_publications from public,anon,authenticated;
grant select,insert,update on public.ur_desk_broadcast_publications to service_role;
create function public.ur_publish_desk_broadcasts(p_league text,p_feed_id text,p_version bigint,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='20s' as $$
declare previous public.ur_desk_broadcast_publications; incoming_hash text; r jsonb; unchanged boolean;
begin
 if p_league not in ('CFB','NFL') or p_league is null or p_feed_id is null or p_feed_id !~ '^[0-9]{1,20}$' or p_version is null or p_version<1 then raise exception using errcode='22023',message='Invalid publication identity'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception using errcode='22023',message='Broadcast rows required'; end if;
 if jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>1000 then raise exception using errcode='22023',message='Invalid publication size'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if r->>'league' is distinct from p_league or coalesce(r->>'event_id','') !~ '^[0-9]{1,15}$' or (r->>'event_id')::bigint<1 or coalesce(r->>'event_date','')='' or coalesce(r->>'away_team','')='' or coalesce(r->>'home_team','')='' or coalesce(r->>'source_date','') !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' or jsonb_typeof(r->'source_time') is distinct from 'string' or ((r->>'source_time')<>'' and (r->>'source_time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') or coalesce(r->>'source_matchup','')='' then raise exception using errcode='22023',message='Invalid approved broadcast row'; end if;
  if jsonb_typeof(r->'dazn') is distinct from 'boolean' or jsonb_typeof(r->'disney_plus') is distinct from 'boolean' or jsonb_typeof(r->'sky_sports') is distinct from 'boolean' or jsonb_typeof(r->'channel_5') is distinct from 'boolean' then raise exception using errcode='22023',message='Explicit platform booleans required'; end if;
 end loop;
 if (select count(distinct (value->>'event_id')::bigint) from jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows) then raise exception using errcode='22023',message='Duplicate event IDs'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ur-desk-broadcasts:'||p_league,0));
 select * into previous from public.ur_desk_broadcast_publications where league=p_league for update;
 incoming_hash=md5(p_rows::text);
 if found then
  if previous.feed_id<>p_feed_id then raise exception using errcode='22023',message='Another authoritative feed is configured for this league'; end if;
  if previous.version>p_version then raise exception using errcode='22023',message='A newer publication is already live'; end if;
  if previous.version=p_version and previous.payload_hash<>incoming_hash then raise exception using errcode='22023',message='Same version contains different records'; end if;
 end if;
 unchanged=previous.version=p_version;
 insert into public.broadcast_availability(league,event_id,event_date,away_team,home_team,source_date,source_time,source_matchup,dazn,disney_plus,sky_sports,channel_5,imported_at)
 select p_league,x.event_id,x.event_date,x.away_team,x.home_team,x.source_date,x.source_time,x.source_matchup,x.dazn,x.disney_plus,x.sky_sports,x.channel_5,now()
 from jsonb_to_recordset(p_rows) as x(event_id bigint,event_date timestamptz,away_team text,home_team text,source_date text,source_time text,source_matchup text,dazn boolean,disney_plus boolean,sky_sports boolean,channel_5 boolean)
 on conflict(league,event_id) do update set event_date=excluded.event_date,away_team=excluded.away_team,home_team=excluded.home_team,source_date=excluded.source_date,source_time=excluded.source_time,source_matchup=excluded.source_matchup,dazn=excluded.dazn,disney_plus=excluded.disney_plus,sky_sports=excluded.sky_sports,channel_5=excluded.channel_5,imported_at=excluded.imported_at
 where (broadcast_availability.event_date,broadcast_availability.away_team,broadcast_availability.home_team,broadcast_availability.source_date,broadcast_availability.source_time,broadcast_availability.source_matchup,broadcast_availability.dazn,broadcast_availability.disney_plus,broadcast_availability.sky_sports,broadcast_availability.channel_5)
 is distinct from (excluded.event_date,excluded.away_team,excluded.home_team,excluded.source_date,excluded.source_time,excluded.source_matchup,excluded.dazn,excluded.disney_plus,excluded.sky_sports,excluded.channel_5);
 if exists(select 1 from jsonb_to_recordset(p_rows) as x(event_id bigint,event_date timestamptz,away_team text,home_team text,source_date text,source_time text,source_matchup text,dazn boolean,disney_plus boolean,sky_sports boolean,channel_5 boolean) left join public.broadcast_availability b on b.league=p_league and b.event_id=x.event_id where b.event_id is null or (b.event_date,b.away_team,b.home_team,b.source_date,b.source_time,b.source_matchup,b.dazn,b.disney_plus,b.sky_sports,b.channel_5) is distinct from (x.event_date,x.away_team,x.home_team,x.source_date,x.source_time,x.source_matchup,x.dazn,x.disney_plus,x.sky_sports,x.channel_5)) then raise exception 'Broadcast verification failed'; end if;
 insert into public.ur_desk_broadcast_publications(league,feed_id,version,payload_hash,record_count) values(p_league,p_feed_id,p_version,incoming_hash,jsonb_array_length(p_rows)) on conflict(league) do update set version=excluded.version,payload_hash=excluded.payload_hash,record_count=excluded.record_count,received_at=now();
 return jsonb_build_object('ok',true,'verified',true,'feed_id',p_feed_id,'version',p_version,'league',p_league,'records',jsonb_array_length(p_rows),'unchanged',coalesce(unchanged,false));
end $$;
revoke all on function public.ur_publish_desk_broadcasts(text,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.ur_publish_desk_broadcasts(text,text,bigint,jsonb) to service_role;
notify pgrst,'reload schema';
