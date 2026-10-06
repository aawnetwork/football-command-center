-- Confirmed snapshots only. Preview/draft data never enters this table.
-- Additive, read-only access; no snapshot contents or existing write grants change.
grant select (id, league, poll_type, season, season_phase, week, published_at,
  captured_at, source, revision, entries) on public.ur_cfb_polls to anon;
create policy ur_cfb_polls_public_read on public.ur_cfb_polls
  for select to anon using (league = 'CFB' and poll_type in ('ap','cfp','uki'));
-- No grants on revisions, captures or ur_save_cfb_poll.
