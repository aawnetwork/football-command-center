import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase, restResponse, sampleDraft } from './helpers/preset-database.mjs';
import { loadModule } from './helpers/preset-modules.mjs';
let db, links, guests, admin, publicDecks;
const originalFetch = globalThis.fetch, savedEnv = { ...process.env };
const origin = 'https://hub.test';
const adminAuth = 'Basic ' + Buffer.from('aaw:an-isolated-test-password').toString('base64');
const request = (url, token, body, overrides = {}) => new Request(origin + url, {
  headers: { host: 'hub.test', origin, ...(token ? { authorization: token } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...overrides },
  ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
});
const decode = async response => ({ status: response.status, ...await response.json() });
const postLink = body => links.POST(request('/api/admin/preset-links', adminAuth, body)).then(decode);
const guest = (token, body) => guests.POST(request('/api/contributor/presets', `Bearer ${token}`, body)).then(decode);
const publish = (deck, action = 'publish') => admin.POST(request('/api/admin/decks', adminAuth, { action, id: deck.id, revision: deck.revision })).then(decode);
const publicView = () => publicDecks.GET(request('/api/decks?season=2026&week=6')).then(decode);
before(async () => {
  db = await testDatabase();
  Object.assign(process.env, { NODE_ENV: 'production', SUPABASE_URL: 'https://test-database.invalid', SUPABASE_SECRET_KEY: 'test-secret', EXPORT_STUDIO_PASSWORD: 'an-isolated-test-password' });
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).startsWith('https://test-database.invalid/rest/v1/'));
    assert.equal(init.headers.apikey, 'test-secret');
    assert.equal(init.headers.Authorization, 'Bearer test-secret');
    return restResponse(db, url, init);
  };
  [links, guests, admin, publicDecks] = await Promise.all(['app/api/admin/preset-links/route.ts', 'app/api/contributor/presets/route.ts', 'app/api/admin/decks/route.ts', 'app/api/decks/route.ts'].map(loadModule));
});
after(async () => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv); await db?.close();
});
test('Complete contributor flow: create link → save → submit → admin publish → revise → republish → revoke', async () => {
  const created = await postLink({ action: 'create', label: 'Pat', mode: 'continuous', season: 2026, week: 6 });
  assert.equal(created.status, 201); assert.equal(created.invitation.token_hash, undefined);
  const token = created.path.split('#token=')[1];
  assert.match(token, /^[a-f0-9]{64}$/);
  const stored = (await db.query('select token_hash from public.desk_preset_invitations where id=$1', [created.invitation.id])).rows[0];
  assert.notEqual(stored.token_hash, token);
  let result = await guest(token, { action: 'create', draft: sampleDraft });
  assert.equal(result.status, 201); let deck = result.deck;
  assert.deepEqual((await publicView()).decks, []);
  assert.equal((await guest(token, { action: 'publish', id: deck.id, revision: deck.revision })).status, 403);
  assert.equal((await publish(deck)).status, 409);
  result = await guest(token, { action: 'save', id: deck.id, revision: deck.revision, draft: { ...sampleDraft, name: 'Saved guest preset' } });
  assert.equal(result.status, 200); deck = result.deck;
  result = await guest(token, { action: 'submit', id: deck.id, revision: deck.revision });
  assert.equal(result.status, 200); deck = result.deck;
  assert.deepEqual((await publicView()).decks, []);
  assert.equal((await guest(token, { action: 'save', id: deck.id, revision: deck.revision, draft: sampleDraft })).status, 409);
  result = await publish(deck); assert.equal(result.status, 200); deck = result.deck;
  assert.equal(deck.review_state, 'approved');
  assert.equal((await publicView()).decks[0].name, 'Saved guest preset');
  result = await postLink({ action: 'return', id: deck.id, revision: deck.revision, note: 'Please revise.' });
  assert.equal(result.status, 200); deck = result.deck;
  result = await guest(token, { action: 'save', id: deck.id, revision: deck.revision, draft: { ...sampleDraft, name: 'Revised guest preset' } });
  assert.equal(result.status, 200); deck = result.deck;
  assert.equal((await publicView()).decks[0].name, 'Saved guest preset');
  assert.equal((await publish(deck)).status, 409);
  deck = (await guest(token, { action: 'submit', id: deck.id, revision: deck.revision })).deck;
  deck = (await publish(deck)).deck;
  assert.equal((await publicView()).decks[0].name, 'Revised guest preset');
  deck = (await publish(deck, 'unpublish')).deck;
  assert.deepEqual((await publicView()).decks, []);
  assert.equal((await publish(deck)).status, 200, 'Admins can republish a previously approved snapshot');
  assert.equal((await postLink({ action: 'revoke', id: created.invitation.id })).status, 200);
  assert.equal((await guests.GET(request('/api/contributor/presets', `Bearer ${token}`))).status, 403);
  assert.equal((await publicView()).decks[0].name, 'Revised guest preset');
});
test('Guest and admin routes independently reject unauthorized access, foreign origins and malformed writes', async () => {
  assert.equal((await links.GET(request('/api/admin/preset-links'))).status, 401);
  assert.equal((await guests.GET(request('/api/contributor/presets'))).status, 401);
  const created = await postLink({ action: 'create', label: 'Another guest', mode: 'one_time' });
  const token = created.path.split('#token=')[1];
  assert.equal((await links.GET(request('/api/admin/preset-links', `Bearer ${token}`))).status, 401);
  assert.equal((await admin.GET(request('/api/admin/decks', `Bearer ${token}`))).status, 401);
  const body = { action: 'create', draft: sampleDraft };
  for (const headers of [{ origin: 'https://elsewhere.test' }, { origin: 'null' }, { 'content-type': 'text/plain' }]) {
    const response = await guests.POST(request('/api/contributor/presets', `Bearer ${token}`, body, headers));
    assert.ok([403, 415].includes(response.status));
  }
  assert.equal((await guest(token, { ...body, draft: { ...sampleDraft, assignments: { '999': 'S' } } })).status, 400);
  assert.equal((await guest(token, { ...body, published: true })).status, 403);
  const large = request('/api/contributor/presets', `Bearer ${token}`, { action: 'create', draft: 'x'.repeat(21000) });
  assert.equal((await guests.POST(large)).status, 413);
  const response = await guests.GET(request('/api/contributor/presets', `Bearer ${token}`));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});
