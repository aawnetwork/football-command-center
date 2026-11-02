-- Apply after desk-curated-decks.sql, before deploying the contributor UI.
-- Additive, transactional upgrade. No existing decks are removed or published.
begin;
create table public.desk_preset_invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  label text not null check (length(btrim(label)) between 1 and 100),
  mode text not null check (mode in ('one_time', 'continuous')),
  season integer, week integer,
  expires_at timestamptz, revoked_at timestamptz, consumed_at timestamptz,
  created_at timestamptz not null default now(),
  rate_window timestamptz not null default now(),
  rate_count integer not null default 0 check (rate_count >= 0),
  check ((season is null and week is null) or
    (season is not null and week is not null and season between 2000 and 2100 and week between 0 and 16 and (week <> 0 or season = 2026))),
  check (mode = 'one_time' or consumed_at is null)
);
alter table public.desk_preset_invitations enable row level security;
revoke all on public.desk_preset_invitations from public, anon, authenticated, service_role;
grant select, insert, update on public.desk_preset_invitations to service_role;

alter table public.desk_curated_decks
  add column contributor_link_id uuid references public.desk_preset_invitations(id),
  add column review_state text not null default 'draft' check (review_state in ('draft', 'submitted', 'returned', 'approved')),
  add column submitted_at timestamptz,
  add column review_note text check (length(review_note) <= 1000);
create index desk_curated_decks_contributor on public.desk_curated_decks(contributor_link_id) where contributor_link_id is not null;

-- Server role only: the HTTP layer hashes the bearer secret and validates against
-- the live game slate. The row lock serializes usage, one-time creation/submission,
-- and revocation across all app instances. No SECURITY DEFINER privilege bypass.
create function public.desk_guest_preset(
  p_token_hash text, p_action text, p_id uuid default null,
  p_revision integer default null, p_draft jsonb default null
) returns jsonb language plpgsql security invoker set search_path = '' set lock_timeout = '5s'
as $$
declare
  invite public.desk_preset_invitations;
  deck public.desk_curated_decks;
  items jsonb;
  total integer;
  stamp timestamptz;
begin
  select * into invite from public.desk_preset_invitations where token_hash = p_token_hash for update;
  stamp := clock_timestamp();
  if not found or invite.revoked_at is not null or (invite.expires_at is not null and invite.expires_at <= stamp) then
    return jsonb_build_object('error', 'This invitation is invalid, expired or revoked. Ask AAW for a new link.', 'status', 403);
  end if;
  if invite.consumed_at is not null then
    return jsonb_build_object('error', 'This one-time invitation has already been submitted. AAW can reopen it if changes are needed.', 'status', 410);
  end if;
  if invite.rate_window <= stamp - interval '1 minute' then
    update public.desk_preset_invitations set rate_window = stamp, rate_count = 1 where id = invite.id;
  elsif invite.rate_count >= 120 then
    return jsonb_build_object('error', 'Too many requests. Wait one minute before trying again.', 'status', 429);
  else
    update public.desk_preset_invitations set rate_count = rate_count + 1 where id = invite.id;
  end if;
  if p_action in ('read', 'games') then
    items := '[]'::jsonb;
    if p_action = 'read' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'draft', d.draft, 'revision', d.revision, 'review_state', d.review_state,
        'review_note', d.review_note, 'submitted_at', d.submitted_at, 'updated_at', d.updated_at
      ) order by d.updated_at desc), '[]'::jsonb) into items
      from public.desk_curated_decks d where d.contributor_link_id = invite.id;
    end if;
    return jsonb_build_object('invitation', jsonb_build_object(
      'id', invite.id, 'label', invite.label, 'mode', invite.mode, 'season', invite.season, 'week', invite.week,
      'expires_at', invite.expires_at, 'revoked_at', invite.revoked_at, 'consumed_at', invite.consumed_at, 'created_at', invite.created_at
    ), 'decks', items);
  end if;
  if p_action is null or p_action not in ('create', 'save', 'submit') then
    return jsonb_build_object('error', 'Guests cannot publish or unpublish presets.', 'status', 403);
  end if;
  if p_action = 'create' then
    if p_id is not null or p_revision is not null then
      return jsonb_build_object('error', 'Invalid creation fields.', 'status', 400);
    end if;
    select count(*) into total from public.desk_curated_decks where contributor_link_id = invite.id;
    if (invite.mode = 'one_time' and total > 0) or total >= 250 then
      return jsonb_build_object('error', 'This invitation has reached its preset limit. Continue an existing draft or ask AAW for a new link.', 'status', 409);
    end if;
  else
    select * into deck from public.desk_curated_decks where id = p_id and contributor_link_id = invite.id for update;
    if not found then return jsonb_build_object('error', 'Preset not found.', 'status', 404); end if;
    if p_revision is null or deck.revision <> p_revision then
      return jsonb_build_object('error', 'This preset changed elsewhere. Reload before continuing.', 'status', 409);
    end if;
    if deck.review_state not in ('draft', 'returned') then
      return jsonb_build_object('error', 'This preset is locked for admin review.', 'status', 409);
    end if;
  end if;
  if p_action = 'submit' then
    if p_draft is not null then return jsonb_build_object('error', 'Save before submitting.', 'status', 400); end if;
    if jsonb_typeof(deck.draft->'assignments') is distinct from 'object' or deck.draft->'assignments' = '{}'::jsonb then
      return jsonb_build_object('error', 'Assign at least one game before submitting.', 'status', 400);
    end if;
    update public.desk_curated_decks set review_state = 'submitted', submitted_at = stamp,
      revision = revision + 1, updated_at = stamp where id = deck.id returning * into deck;
    if invite.mode = 'one_time' then
      update public.desk_preset_invitations set consumed_at = stamp where id = invite.id;
    end if;
  else
    if jsonb_typeof(p_draft) is distinct from 'object' or p_draft->>'league' is distinct from 'CFB'
      or jsonb_typeof(p_draft->'name') is distinct from 'string' or length(btrim(p_draft->>'name')) not between 1 and 100
      or jsonb_typeof(p_draft->'assignments') is distinct from 'object'
      or coalesce(p_draft->>'season', '') !~ '^\d{4}$' or coalesce(p_draft->>'week', '') !~ '^\d{1,2}$' then
      return jsonb_build_object('error', 'Invalid preset draft.', 'status', 400);
    end if;
    if (p_draft->>'season')::integer not between 2000 and extract(year from stamp)::integer + 1
      or (p_draft->>'week')::integer not between 0 and 16
      or ((p_draft->>'week')::integer = 0 and (p_draft->>'season')::integer <> 2026) then
      return jsonb_build_object('error', 'Invalid season or week.', 'status', 400);
    end if;
    if invite.season is not null and ((p_draft->>'season')::integer <> invite.season or (p_draft->>'week')::integer <> invite.week) then
      return jsonb_build_object('error', 'This invitation is restricted to its selected season and week.', 'status', 403);
    end if;
    if exists (select 1 from jsonb_each_text(p_draft->'assignments') a where a.key !~ '^\d+$' or a.value not in ('S','A','B','C','D'))
      or (select count(*) from jsonb_each(p_draft->'assignments')) > 200 then
      return jsonb_build_object('error', 'Invalid game assignments.', 'status', 400);
    end if;
    if p_action = 'create' then
      insert into public.desk_curated_decks (draft, contributor_link_id) values (p_draft, invite.id) returning * into deck;
    else
      update public.desk_curated_decks set draft = p_draft, revision = revision + 1, updated_at = stamp where id = deck.id returning * into deck;
    end if;
  end if;
  return jsonb_build_object('deck', jsonb_build_object(
    'id', deck.id, 'draft', deck.draft, 'revision', deck.revision, 'review_state', deck.review_state,
    'review_note', deck.review_note, 'submitted_at', deck.submitted_at, 'updated_at', deck.updated_at
  ), 'consumed', invite.mode = 'one_time' and p_action = 'submit');
end;
$$;
revoke all on function public.desk_guest_preset(text,text,uuid,integer,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.desk_guest_preset(text,text,uuid,integer,jsonb) to service_role;

-- Lock invitation before deck, matching guest requests. Returning a one-time
-- submission reopens only that existing preset; revoked/expired links stay closed.
create function public.desk_return_preset(p_id uuid, p_revision integer, p_note text)
returns jsonb language plpgsql security invoker set search_path = '' set lock_timeout = '5s'
as $$
declare
  link_id uuid;
  deck public.desk_curated_decks;
begin
  select contributor_link_id into link_id from public.desk_curated_decks where id = p_id;
  if link_id is null then return jsonb_build_object('error', 'Contributor preset not found.', 'status', 404); end if;
  perform 1 from public.desk_preset_invitations where id = link_id for update;
  select * into deck from public.desk_curated_decks where id = p_id for update;
  if p_revision is null or deck.revision <> p_revision then
    return jsonb_build_object('error', 'This preset changed elsewhere. Reload before returning it.', 'status', 409);
  end if;
  if deck.review_state not in ('submitted', 'approved') then
    return jsonb_build_object('error', 'Only submitted or approved presets can be returned.', 'status', 409);
  end if;
  if p_note is null or length(btrim(p_note)) not between 1 and 1000 then
    return jsonb_build_object('error', 'Enter feedback of 1–1,000 characters.', 'status', 400);
  end if;
  update public.desk_curated_decks set review_state = 'returned', review_note = p_note,
    revision = revision + 1, updated_at = clock_timestamp() where id = p_id returning * into deck;
  update public.desk_preset_invitations set consumed_at = null where id = link_id and mode = 'one_time';
  return jsonb_build_object('deck', to_jsonb(deck));
end;
$$;
revoke all on function public.desk_return_preset(uuid,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.desk_return_preset(uuid,integer,text) to service_role;
notify pgrst, 'reload schema';
commit;
