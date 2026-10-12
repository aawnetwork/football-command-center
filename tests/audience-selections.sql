-- Transactional integration tests; all records and counters are rolled back.
set local role service_role;
do $test$
declare h text:=repeat('d',64); t timestamptz; receipt uuid; r bigint; result text; stamp timestamptz; i integer;
begin
  if public.hub_audience_contribution_gate(h,clock_timestamp(),null)<>'inactive' then raise exception 'Missing consent accepted'; end if;
  perform public.hub_audience_prepare(h);
  perform public.hub_audience_grant(h,'stage28-v1',repeat('e',64));
  select c.granted_at,c.consent_receipt into t,receipt from public.hub_audience_consent c join public.hub_audience_participants p on p.id=c.participant_id where p.token_hash=h;
  if public.hub_audience_contribution_gate(h,t-interval '1 second',receipt)<>'inactive' then raise exception 'Wrong consent epoch accepted'; end if;
  if public.hub_audience_contribution_gate(h,t,receipt)<>'ready' then raise exception 'Gate failed'; end if;
  if exists(select 1 from public.hub_audience_game_tiers) or exists(select 1 from public.hub_audience_favourites) then raise exception 'Opt-in restored selections'; end if;
  r:=floor(extract(epoch from clock_timestamp())*1000)::bigint*1000+1000;
  result:=public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2026,'401772833','S','regular',r);
  if result<>'saved' then raise exception 'Tier save failed'; end if;
  select contributed_at into stamp from public.hub_audience_game_tiers where canonical_game_id='NFL:2026:401772833';
  perform public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2026,'401772833','S','regular',r);
  if not exists(select 1 from public.hub_audience_game_tiers where contributed_at=stamp) then raise exception 'Duplicate changed timestamp'; end if;
  if public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2026,'401772833','A','regular',r)<>'conflict' then raise exception 'Equal conflicting revision accepted'; end if;
  perform public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2026,'401772833','B','regular',r+2);
  if public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2026,'401772833','A','regular',r+1)<>'conflict' then raise exception 'Old selection accepted'; end if;
  perform public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2026,'401772833',null,'regular',r+3);
  if exists(select 1 from public.hub_audience_game_tiers) then raise exception 'Removal failed'; end if;
  if public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2026,'401772833','B','regular',r+2)<>'conflict' then raise exception 'Removal resurrected'; end if;
  perform public.hub_audience_write_selection(h,t,receipt,'tier','CFB',2026,'401772833','A','postseason',r+4);
  perform public.hub_audience_write_selection(h,t,receipt,'clearTiers','NFL',null,null,null,null,r+5);
  if public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2026,'401772833',null,'regular',r+3)<>'conflict' then raise exception 'Old duplicate reported saved after clear'; end if;
  if (select count(*) from public.hub_audience_game_tiers where league='CFB')<>1 then raise exception 'Leagues mixed'; end if;
  perform public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2026,'401772833','S','regular',r+7);
  perform public.hub_audience_write_selection(h,t,receipt,'clearTiers','NFL',null,null,null,null,r+6);
  if (select count(*) from public.hub_audience_game_tiers where league='NFL')<>1 then raise exception 'Delayed clear deleted newer choice'; end if;
  if public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2026,'401772834','S','regular',r+5)<>'conflict' then raise exception 'Clear barrier failed'; end if;
  perform public.hub_audience_write_selection(h,t,receipt,'favourite','NFL',2026,null,'6',null,r+8);
  perform public.hub_audience_write_selection(h,t,receipt,'favourite','NFL',2026,null,'7',null,r+9);
  perform public.hub_audience_write_selection(h,t,receipt,'favourite','CFB',2026,null,'6',null,r+10);
  if (select count(*) from public.hub_audience_favourites)<>2 then raise exception 'Favourite replacement duplicated'; end if;
  perform public.hub_audience_write_selection(h,t,receipt,'favourite','NFL',null,null,null,null,r+11);
  if (select count(*) from public.hub_audience_favourites)<>1 then raise exception 'Favourite removal failed'; end if;
  update public.hub_audience_participants set contribution_requests=0,contribution_window_start=clock_timestamp() where token_hash=h;
  for i in 1..120 loop
    if public.hub_audience_contribution_gate(h,t,receipt)<>'ready' then raise exception 'Premature limit'; end if;
  end loop;
  if public.hub_audience_contribution_gate(h,t,receipt)<>'limited' then raise exception 'Limit failed'; end if;
  perform public.hub_audience_withdraw(h);
  if exists(select 1 from public.hub_audience_game_tiers) or exists(select 1 from public.hub_audience_favourites) or exists(select 1 from public.hub_audience_selection_versions) then raise exception 'Withdrawal did not cascade'; end if;
  if public.hub_audience_write_selection(h,t,receipt,'tier','NFL',2026,'401772833','S','regular',r+12)<>'inactive' then raise exception 'In-flight write resurrected participant'; end if;
  perform public.hub_audience_prepare(repeat('f',64));
  perform public.hub_audience_grant(repeat('f',64),'stage28-v1',repeat('e',64));
  if public.hub_audience_contribution_gate(repeat('f',64),t,receipt)<>'inactive' then raise exception 'Old opt-in epoch reused'; end if;
  if exists(select 1 from public.hub_audience_game_tiers) or exists(select 1 from public.hub_audience_favourites) then raise exception 'Rejoin restored data'; end if;
end $test$;
reset role;
do $security$
declare item record;
begin
  for item in select c.oid,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('hub_audience_game_tiers','hub_audience_favourites','hub_audience_selection_versions') loop
    if not item.relrowsecurity or has_table_privilege('anon',item.oid,'SELECT') or has_table_privilege('authenticated',item.oid,'INSERT') then raise exception 'Public access'; end if;
  end loop;
  for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('hub_audience_contribution_gate','hub_audience_write_selection') loop
    if has_function_privilege('anon',item.oid,'EXECUTE') or has_function_privilege('authenticated',item.oid,'EXECUTE') then raise exception 'Public RPC access'; end if;
  end loop;
end $security$;
