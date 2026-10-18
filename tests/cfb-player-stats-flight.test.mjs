import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createCfbPlayerStatsFlights } from '../app/lib/cfb-player-stats-flight.ts';

const request = query => new Request(`https://local.invalid/api/player-stats${query ? `?${query}` : ''}`);
const deferred = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('normalised simultaneous requests share one operation with independently consumable bodies/headers', async () => {
  const share = createCfbPlayerStatsFlights(), gate = deferred(); let calls = 0;
  const load = async () => { calls++; await gate.promise; return Response.json({ value: 'José', checkedAt: '2026-10-18T18:00:00Z' }, { headers: { 'X-Source-Time': 'original' } }); };
  const work = ['mode=weekly&week=%37', 'week=7&mode=weekly', 'week=7&week=8&mode=weekly'].map(q => share(request(q), load));
  assert.equal(calls, 1); gate.release();
  const [a, b, c] = await Promise.all(work);
  assert.notEqual(a, b); a.headers.set('X-Source-Time', 'caller-only');
  assert.equal(b.headers.get('X-Source-Time'), 'original');
  assert.equal(b.headers.get('Cache-Control'), null);
  await a.body.cancel();
  assert.deepEqual(await b.json(), { value: 'José', checkedAt: '2026-10-18T18:00:00Z' });
  assert.match(await c.text(), /José/);
  const fresh = await share(request('week=7&mode=weekly'), load);
  assert.equal(calls, 2, 'settled successful responses are never reused'); await fresh.text();
});

test('absent/empty first week values share; different effective query identities remain separate', async () => {
  const share = createCfbPlayerStatsFlights(), gate = deferred(); let calls = 0;
  const load = async () => { calls++; await gate.promise; return Response.json([]); };
  const queries = ['', 'week=', 'week=&week=7', 'week=7', 'week=07', 'week=8', 'week=7&season=2025', 'week=7&season=2026', 'week=7&mode=season', 'week=7&mode=weekly', 'week=7&seasontype=3', 'week=7&extra=a&extra=b', 'week=7&extra=b&extra=a', 'week=7&x=a&y=b', 'week=7&x=a%26y%3Db'];
  const work = queries.map(q => share(request(q), load));
  assert.equal(calls, queries.length - 2); gate.release();
  await Promise.all(work.map(async p => (await p).text()));
});

test('rejections, synchronous throws, HTTP errors and body-read failures clean up for retries', async () => {
  for (const failure of ['reject', 'throw', 'http', 'body']) {
    const share = createCfbPlayerStatsFlights(), gate = deferred(); let calls = 0;
    const load = () => {
      calls++;
      if (failure === 'throw') throw Error('synchronous');
      return gate.promise.then(() => {
        if (failure === 'reject') throw Error('asynchronous');
        if (failure === 'http') return Response.json({ error: 'upstream' }, { status: 503 });
        return new Response(new ReadableStream({ start(controller) { controller.error(Error('body failed')); } }));
      });
    };
    const joined = Promise.allSettled([share(request('week=7'), load), share(request('week=7'), load)]);
    assert.equal(calls, 1); gate.release();
    const settled = await joined;
    if (failure === 'http') {
      for (const result of settled) { assert.equal(result.status, 'fulfilled'); assert.equal(result.value.status, 503); assert.deepEqual(await result.value.json(), { error: 'upstream' }); }
    } else assert.ok(settled.every(result => result.status === 'rejected'));
    const fresh = await share(request('week=7'), async () => { calls++; return Response.json({ recovered: true }); });
    assert.equal(calls, 2); assert.deepEqual(await fresh.json(), { recovered: true });
  }
});

test('32-entry registry bypasses excess distinct keys without evicting active work and recovers capacity', async () => {
  const share = createCfbPlayerStatsFlights(), gate = deferred(); let calls = 0;
  const load = async () => { calls++; await gate.promise; return Response.json([]); };
  const work = Array.from({ length: 32 }, (_, i) => share(request(`week=${i}`), load));
  work.push(share(request('week=0'), load)); assert.equal(calls, 32);
  work.push(share(request('week=overflow'), load), share(request('week=overflow'), load));
  assert.equal(calls, 34, 'overflow operations run independently');
  work.push(share(request('week=0'), load)); assert.equal(calls, 34);
  gate.release(); await Promise.all(work.map(async p => (await p).text()));
  const nextGate = deferred();
  const next = async () => { calls++; await nextGate.promise; return Response.json([]); };
  const a = share(request('week=new'), next), b = share(request('week=new'), next);
  assert.equal(calls, 35, 'completed entries released capacity'); nextGate.release();
  await Promise.all([a, b]);
});

test('oversized identities bypass storage; separate instances do not share work', async () => {
  const a = createCfbPlayerStatsFlights(), b = createCfbPlayerStatsFlights(), gate = deferred(); let calls = 0;
  const load = async () => { calls++; await gate.promise; return Response.json([]); };
  const long = `week=7&extra=${'x'.repeat(2048)}`;
  const work = [a(request(long), load), a(request(long), load), a(request('week=7'), load), b(request('week=7'), load)];
  assert.equal(calls, 4); gate.release(); await Promise.all(work);
});

const source = await readFile(new URL('../app/api/player-stats/route.ts', import.meta.url), 'utf8');
let token = 0;
async function loadRoute(t, state, reference = false) {
  const key = `__cfbFlightFixture${++token}`;
  globalThis[key] = state; t.after(() => { delete globalThis[key]; });
  let text = source.replace("import {indexCfbHistory,loadCfbPreviousHighs,seasonHighEligible} from '../../lib/cfb-history';", `import {indexCfbHistory as originalIndex,seasonHighEligible} from ${JSON.stringify(new URL('../app/lib/cfb-history.ts', import.meta.url).href)};
const indexCfbHistory = facts => { globalThis[${JSON.stringify(key)}].builds++; return originalIndex(facts); };
const loadCfbPreviousHighs = async () => { globalThis[${JSON.stringify(key)}].historyReads++; return globalThis[${JSON.stringify(key)}].facts; };`)
    .replace('import { NextResponse } from "next/server";', 'const NextResponse = { json: (body, init) => Response.json(body, init) };')
    .replace('"../../lib/gameday-status"', JSON.stringify(new URL('../app/lib/gameday-status.ts', import.meta.url).href));
  if (reference) text = text.replace('import { createCfbPlayerStatsFlights } from "../../lib/cfb-player-stats-flight";', 'const createCfbPlayerStatsFlights = () => (_request, load) => load();');
  else text = text.replace('"../../lib/cfb-player-stats-flight"', JSON.stringify(new URL('../app/lib/cfb-player-stats-flight.ts', import.meta.url).href));
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).GET;
}
function fixture(t) {
  const state = { builds: 0, historyReads: 0, scoreboard: 0, summaries: 0, fail: null, value: 200, gate: deferred(), facts: [] };
  t.mock.method(globalThis, 'fetch', async url => {
    const u = new URL(url), isScoreboard = u.pathname.endsWith('/scoreboard');
    if (isScoreboard) { state.scoreboard++; await state.gate.promise; }
    else state.summaries++;
    if (state.fail === 'scoreboard-throw' && isScoreboard) throw Error('offline');
    if (state.fail === 'scoreboard-http' && isScoreboard) return Response.json({ error: 'source' }, { status: 503 });
    if (state.fail === 'summary-http' && !isScoreboard) return Response.json({}, { status: 503 });
    if (state.fail === 'summary-json' && !isScoreboard) return new Response('bad json');
    const id = isScoreboard ? u.searchParams.get('week') || '7' : u.searchParams.get('event');
    const competition = { competitors: [{ homeAway: 'home', team: { id: '10', displayName: 'Home' } }, { homeAway: 'away', team: { id: '11', displayName: 'Away' } }], status: { type: { state: 'post', completed: true } } };
    if (isScoreboard) return Response.json({ events: [{ id, competitions: [competition] }] });
    return Response.json({ header: { competitions: [competition] }, boxscore: { players: [{ team: { id: '10', displayName: 'Home' }, statistics: [{ name: 'passing', labels: ['YDS'], athletes: [{ athlete: { id: '101', displayName: 'Player' }, stats: [String(state.value)] }] }] }] } });
  });
  return state;
}

test('actual route coalesces upstream/history/processing, preserves full output, and starts fresh after completion', async t => {
  const state = fixture(t), actual = await loadRoute(t, state), reference = await loadRoute(t, state, true);
  state.facts = [{ player_id: '101', game_id: '7', team_id: '10', season: 2026, week: 7, season_type: 'regular', category: 'passing', previous_high: 100, complete: true, reason: null, revision: 1 }];
  const controller = new AbortController();
  const work = [actual(new Request(request('week=7'), { signal: controller.signal })), actual(request('week=7')), actual(request('week=%37'))];
  await flush(); assert.equal(state.scoreboard, 1); controller.abort(); state.gate.release();
  const responses = await Promise.all(work), bodies = await Promise.all(responses.map(r => r.text()));
  assert.equal(state.builds, 1); assert.equal(state.historyReads, 1); assert.equal(state.summaries, 1);
  const old = await reference(request('week=7'));
  assert.equal(old.status, responses[0].status); assert.deepEqual([...old.headers], [...responses[0].headers]);
  assert.ok(bodies.every(body => body === bodies[0])); assert.equal(await old.text(), bodies[0]);
  assert.equal(JSON.parse(bodies[0])[0].seasonHigh, true);
  state.value = 250; state.facts = [{ ...state.facts[0], previous_high: 300, revision: 2 }];
  const fresh = await (await actual(request('week=7'))).json();
  assert.equal(state.builds, 3); assert.equal(fresh[0].value, 250); assert.equal(fresh[0].seasonHigh, undefined);
});

test('actual route separates concurrent weeks and preserves each response identity', async t => {
  const state = fixture(t), actual = await loadRoute(t, state);
  const work = [actual(request('week=7')), actual(request('week=8'))];
  await flush(); assert.equal(state.scoreboard, 2); state.gate.release();
  const bodies = await Promise.all(work.map(async p => (await p).json()));
  assert.equal(state.builds, 2); assert.equal(state.historyReads, 2); assert.equal(state.summaries, 2);
  assert.equal(bodies[0][0].gameId, 7); assert.equal(bodies[1][0].gameId, 8);
});

test('actual route shares errors/partial successes only while active and retries all sources next time', async t => {
  t.mock.method(console, 'error', () => {});
  for (const failure of ['scoreboard-http', 'scoreboard-throw', 'summary-http', 'summary-json']) {
    const state = fixture(t), actual = await loadRoute(t, state);
    state.fail = failure;
    const work = [actual(request('week=7')), actual(request('week=7'))];
    await flush(); assert.equal(state.scoreboard, 1); state.gate.release();
    const [a, b] = await Promise.all(work);
    assert.equal(a.status, failure === 'scoreboard-http' ? 503 : failure === 'scoreboard-throw' ? 500 : 200);
    assert.equal(await a.text(), await b.text());
    state.fail = null;
    const retry = await actual(request('week=7'));
    assert.equal(retry.status, 200); assert.equal((await retry.json()).length, 1);
    assert.equal(state.scoreboard, 2);
    assert.equal(state.summaries, failure.startsWith('summary') ? 2 : 1);
  }
});
