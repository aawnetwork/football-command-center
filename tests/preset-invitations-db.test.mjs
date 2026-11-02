import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');

let db;
const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64);
const draft = { league: 'CFB', name: 'Pat’s picks', season: 2026, week: 6, assignments: { '123': 'S' } };
before(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role, anon, authenticated;');
  await db.exec(await readFile(new URL('../supabase/desk-curated-decks.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/desk-preset-invitations.sql', import.meta.url), 'utf8'));
});
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('truncate public.desk_curated_decks, public.desk_preset_invitations;'); });
async function invite(token = tokenA, mode = 'continuous', extra = {}) {
  const { rows } = await db.query('insert into public.desk_preset_invitations(token_hash,label,mode,season,week,expires_at) values ($1,$2,$3,$4,$5,$6) returning id', [token, 'Pat', mode, extra.season ?? null, extra.week ?? null, extra.expires_at ?? null]);
  return rows[0].id;
}
async function rpc(action, { token = tokenA, id = null, revision = null, value = null } = {}) {
  const { rows } = await db.query('select public.desk_guest_preset($1,$2,$3,$4,$5::jsonb) as result', [token, action, id, revision, value ? JSON.stringify(value) : null]);
  return rows[0].result;
}
async function create(token = tokenA, value = draft) { return (await rpc('create', { token, value })).deck; }
async function submit(deck, token = tokenA) { return rpc('submit', { token, id: deck.id, revision: deck.revision }); }
async function returnDeck(deck) {
  const { rows } = await db.query('select public.desk_return_preset($1,$2,$3) as result', [deck.id, deck.revision, 'Please check the Saturday games.']);
  return rows[0].result;
}
test('Guests see only their own drafts and cannot read or alter another contributor’s preset', async () => {
  await invite(); await invite(tokenB);
  const a = await create(); const b = await create(tokenB, { ...draft, name: 'Other contributor' });
  const view = await rpc('read');
  assert.deepEqual(view.decks.map(d => d.id), [a.id]);
  assert.equal(JSON.stringify(view).includes('token_hash'), false);
  assert.equal((await rpc('save', { id: b.id, revision: b.revision, value: draft })).status, 404);
  assert.equal((await submit(b)).status, 404);
  assert.equal((await rpc('publish', { id: a.id, revision: a.revision })).status, 403);
  assert.equal((await rpc('unpublish', { id: a.id, revision: a.revision })).status, 403);
  assert.equal((await db.query('select published from public.desk_curated_decks')).rows.every(d => d.published === null), true);
});
test('One-preset links survive reads and saves, permit one creation, and close only on submission', async () => {
  await invite(tokenA, 'one_time');
  await rpc('read'); await rpc('games');
  let deck = await create();
  assert.equal((await rpc('create', { value: draft })).status, 409);
  deck = (await rpc('save', { id: deck.id, revision: deck.revision, value: { ...draft, name: 'Saved again' } })).deck;
  const result = await submit(deck);
  assert.equal(result.consumed, true); assert.equal(result.deck.review_state, 'submitted');
  for (const action of ['read', 'games', 'save', 'submit', 'create']) assert.equal((await rpc(action, { id: deck.id, revision: deck.revision, value: draft })).status, 410);
  const row = (await db.query('select * from public.desk_curated_decks')).rows[0];
  assert.equal(row.published, null); assert.equal(row.draft.name, 'Saved again');
});
test('Competing one-preset creations and submissions have only one successful result', async () => {
  await invite(tokenA, 'one_time');
  const creates = await Promise.all([rpc('create', { value: draft }), rpc('create', { value: draft })]);
  assert.equal(creates.filter(r => r.deck).length, 1);
  const deck = creates.find(r => r.deck).deck;
  const submissions = await Promise.all([submit(deck), submit(deck)]);
  assert.equal(submissions.filter(r => r.deck).length, 1);
  assert.equal(submissions.find(r => r.error).status, 410);
});
test('Continuous links create further presets; submission locks edits and stale revisions fail', async () => {
  await invite(); let deck = await create();
  assert.equal((await rpc('save', { id: deck.id, revision: deck.revision + 1, value: draft })).status, 409);
  deck = (await submit(deck)).deck;
  assert.equal(deck.review_state, 'submitted');
  assert.equal((await rpc('save', { id: deck.id, revision: deck.revision, value: draft })).status, 409);
  assert.ok((await create()).id);
  assert.equal((await rpc('read')).decks.length, 2);
});
test('Revocation and expiry block every subsequent guest action and retain saved work', async () => {
  const id = await invite(); const deck = await create();
  await db.query('update public.desk_preset_invitations set revoked_at=now() where id=$1', [id]);
  for (const action of ['read', 'games', 'create', 'save', 'submit']) assert.equal((await rpc(action, { id: deck.id, revision: deck.revision, value: draft })).status, 403);
  assert.equal((await db.query('select count(*)::integer as n from public.desk_curated_decks')).rows[0].n, 1);
  await invite(tokenB, 'continuous', { expires_at: '2020-01-01' });
  assert.equal((await rpc('read', { token: tokenB })).status, 403);
  assert.equal((await rpc('read', { token: 'c'.repeat(64) })).status, 403);
});
test('Returning reopens only the existing one-time preset, while retaining its public snapshot', async () => {
  await invite(tokenA, 'one_time'); let deck = (await submit(await create())).deck;
  // Model the existing admin publish operation; guest code never sets published.
  await db.query("update public.desk_curated_decks set published=draft,published_season=2026,published_week=6,published_at=now(),review_state='approved',revision=revision+1 where id=$1", [deck.id]);
  deck.revision += 1;
  deck = (await returnDeck(deck)).deck;
  assert.equal(deck.review_state, 'returned'); assert.equal(deck.published.name, draft.name);
  assert.equal((await rpc('read')).decks[0].review_note, 'Please check the Saturday games.');
  assert.equal((await rpc('create', { value: draft })).status, 409);
  deck = (await rpc('save', { id: deck.id, revision: deck.revision, value: { ...draft, name: 'Revised' } })).deck;
  assert.equal((await submit(deck)).consumed, true);
  const row = (await db.query('select draft,published from public.desk_curated_decks')).rows[0];
  assert.equal(row.draft.name, 'Revised'); assert.equal(row.published.name, draft.name);
});
test('Returning a revoked link does not restore access; review revision conflicts fail', async () => {
  const link = await invite(tokenA, 'one_time'); const deck = (await submit(await create())).deck;
  assert.equal((await returnDeck({ ...deck, revision: 999 })).status, 409);
  await db.query('update public.desk_preset_invitations set revoked_at=now() where id=$1', [link]);
  assert.ok((await returnDeck(deck)).deck);
  assert.equal((await rpc('read')).status, 403);
});
test('Slate restrictions, empty submissions and persistent request limits are enforced', async () => {
  const link = await invite(tokenA, 'continuous', { season: 2026, week: 6 });
  assert.equal((await rpc('create', { value: { ...draft, week: 7 } })).status, 403);
  const deck = await create(tokenA, { ...draft, assignments: {} });
  assert.equal((await submit(deck)).status, 400);
  await db.query('update public.desk_preset_invitations set rate_count=120 where id=$1', [link]);
  assert.equal((await rpc('read')).status, 429);
  await db.query("update public.desk_preset_invitations set rate_window=now()-interval '2 minutes' where id=$1", [link]);
  assert.ok((await rpc('read')).invitation);
});
test('Anonymous and authenticated database roles cannot access tables or execute guest/review RPCs', async () => {
  await invite();
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query('select * from public.desk_preset_invitations'), /permission denied/);
      await assert.rejects(db.query('select * from public.desk_curated_decks'), /permission denied/);
      await assert.rejects(rpc('read'), /permission denied/);
      await assert.rejects(returnDeck({ id: '00000000-0000-0000-0000-000000000000', revision: 1 }), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try { assert.ok((await rpc('read')).invitation); assert.ok((await create()).id); }
  finally { await db.exec('reset role'); }
});
