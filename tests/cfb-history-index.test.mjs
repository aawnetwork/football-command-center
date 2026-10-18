import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { indexCfbHistory, seasonHighEligible } from '../app/lib/cfb-history.ts';

// Frozen reference to the pre-optimisation rules; deliberately uses the old scan.
function legacyEligible(stat, facts, completed, teamId) {
  const matches = facts.filter(r => r.player_id === String(stat.playerId) && r.game_id === String(stat.gameId) && r.category === stat.category);
  const r = matches[0];
  return completed && stat.stat === 'YDS' && Number.isSafeInteger(stat.value) && matches.length === 1 && r.season === 2026 && r.season_type === 'regular' && r.team_id === teamId && r.complete === true && r.reason === null && Number.isSafeInteger(r.previous_high) && Number.isSafeInteger(r.revision) && r.revision > 0 && stat.value > r.previous_high;
}
const stat = { playerId: 101, gameId: 2, category: 'passing', stat: 'YDS', value: 200 };
const fact = { player_id: '101', game_id: '2', team_id: '10', season: 2026, week: 2, season_type: 'regular', category: 'passing', previous_high: 100, complete: true, reason: null, revision: 1, captured_at: '2026-10-18T00:00:00Z', source: 'CFBD' };
function parity(s, facts, completed = true, team = '10') {
  const expected = legacyEligible(s, facts, completed, team);
  assert.equal(seasonHighEligible(s, indexCfbHistory(facts), completed, team), expected);
  assert.equal(seasonHighEligible(s, facts, completed, team), expected, 'array-call compatibility');
  return expected;
}

test('index preserves exact identity, missing-history and completeness rules', () => {
  assert.equal(parity(stat, [fact]), true);
  assert.equal(parity(stat, []), false);
  for (const patch of [
    { player_id: '102' }, { player_id: '0101' }, { player_id: 101 },
    { game_id: '3' }, { game_id: '02' }, { game_id: 2 },
    { category: 'rushing' }, { team_id: 'wrong' }, { team_id: 10 },
    { season: 2025 }, { season: '2026' }, { season_type: 'postseason' },
    { complete: false }, { complete: 'true' }, { reason: 'missing' }, { reason: undefined },
  ]) assert.equal(parity(stat, [{ ...fact, ...patch }]), false, JSON.stringify(patch));
  assert.equal(parity(stat, [fact], true, 'wrong-team'), false);
  assert.equal(parity({ ...stat, playerId: 102 }, [fact]), false);
  assert.equal(parity({ ...stat, gameId: 3 }, [fact]), false);
  assert.equal(parity({ ...stat, category: 'rushing' }, [fact]), false);
});

test('all duplicates fail closed, including conflicts in fields outside the identity', () => {
  for (const patch of [{}, { team_id: 'wrong' }, { season: 2025 }, { revision: 2 }, { previous_high: null, complete: false }]) {
    const other = { ...fact, ...patch };
    for (const facts of [[fact, other], [other, fact], [fact, other, fact]]) assert.equal(parity(stat, facts), false);
  }
  assert.equal(parity(stat, [fact, { ...fact, game_id: '3' }, { ...fact, player_id: '102' }, { ...fact, category: 'rushing' }]), true);
});

test('ties, non-yardage rows, invalid numbers and revision checks match the old implementation', () => {
  for (const value of [100, 99, NaN, Infinity, -Infinity, 200.5, Number.MAX_SAFE_INTEGER + 1, '200', null]) assert.equal(parity({ ...stat, value }, [fact]), false);
  for (const previous_high of [null, undefined, NaN, Infinity, 100.5, '100', Number.MAX_SAFE_INTEGER + 1]) assert.equal(parity(stat, [{ ...fact, previous_high }]), false);
  for (const revision of [0, -1, 1.5, NaN, Infinity, '1', null, Number.MAX_SAFE_INTEGER + 1]) assert.equal(parity(stat, [{ ...fact, revision }]), false);
  for (const name of ['TD', 'INT', 'TOT', 'SACKS']) assert.equal(parity({ ...stat, stat: name }, [fact]), false);
  // These metadata fields were not eligibility gates before; don't introduce one.
  assert.equal(parity(stat, [{ ...fact, week: 99, captured_at: 'invalid', source: 'other' }]), true);
});

test('new request indexes observe final transitions and late corrections without mutating facts', () => {
  const facts = Object.freeze([Object.freeze({ ...fact })]);
  assert.equal(parity(stat, facts, false), false);
  assert.equal(parity(stat, facts, true), true);
  assert.equal(parity(stat, [{ ...fact, revision: 2, previous_high: 250 }]), false);
  assert.equal(parity(stat, [{ ...fact, revision: 3, previous_high: 150 }]), true);
  assert.deepEqual(facts, [fact]);
});

test('one index returns the same results as scans over a mixed multi-game history', () => {
  const facts = Array.from({ length: 400 }, (_, i) => ({ ...fact, player_id: String(i % 20), game_id: String(Math.floor(i / 20)), category: i % 2 ? 'rushing' : 'passing', previous_high: i % 7 * 25 }));
  facts.push({ ...facts[0], revision: 99 }, { ...facts[75], team_id: 'conflict' });
  const index = indexCfbHistory(facts);
  for (let gameId = 0; gameId <= 20; gameId++) for (let playerId = 0; playerId <= 20; playerId++) for (const category of ['passing', 'rushing', 'receiving']) {
    const s = { ...stat, gameId, playerId, category };
    assert.equal(seasonHighEligible(s, index, true, '10'), legacyEligible(s, facts, true, '10'));
  }
});

const source = await readFile(new URL('../app/api/player-stats/route.ts', import.meta.url), 'utf8');
async function route(reference, history) {
  const key = `__cfbHistoryIndex_${reference ? 'reference' : 'actual'}`;
  globalThis[key] = history;
  const imports = reference
    ? `const indexCfbHistory = facts => facts; const seasonHighEligible = ${legacyEligible.toString()};`
    : `import {indexCfbHistory,seasonHighEligible} from ${JSON.stringify(new URL('../app/lib/cfb-history.ts', import.meta.url).href)};`;
  let text = source.replace(/import .*?from ['"]\.\.\/\.\.\/lib\/cfb-history['"];?/, `${imports}\nconst loadCfbPreviousHighs = async () => globalThis[${JSON.stringify(key)}];`)
    .replace('import { NextResponse } from "next/server";', 'const NextResponse = { json: (body, init) => Response.json(body, init) };')
    .replace('"../../lib/gameday-status"', JSON.stringify(new URL('../app/lib/gameday-status.ts', import.meta.url).href));
  if (reference) {
    assert.ok(text.includes('isTeamPlaying(competitionsByGame.get(gameId), teamBox.team?.id)'));
    text = text.replace('isTeamPlaying(competitionsByGame.get(gameId), teamBox.team?.id)', 'isTeamPlaying(events.find(event => Number(event.id) === gameId)?.competitions?.[0], teamBox.team?.id)');
  }
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).GET;
}

test('actual route output matches the old lookup rules through transitions, duplicate IDs and corrections', async t => {
  let facts = [fact], state = 'pre', teamId = '10', duplicateEvent = false, duplicateTeam = false, summaryMissing = false;
  let calls = 0;
  const competitors = () => [{ homeAway: 'home', team: { id: '10', displayName: 'Home' } }, { homeAway: 'away', team: { id: '11', displayName: 'Away' } }];
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    const competition = { competitors: competitors(), status: { type: { state, completed: state === 'post' } } };
    if (duplicateTeam) competition.competitors.push(competition.competitors[0]);
    if (String(url).includes('/scoreboard')) {
      const events = [{ id: '2', competitions: [competition] }];
      if (duplicateEvent) events.push({ id: '02', competitions: [{ ...competition, status: { type: { state: 'post', completed: true } } }] });
      return Response.json({ events });
    }
    if (summaryMissing) return Response.json({});
    return Response.json({ header: { competitions: [competition] }, boxscore: {
      players: [{ team: { id: teamId, displayName: 'Home' }, statistics: [
        { name: 'passing', labels: ['YDS', 'TD'], athletes: [{ athlete: { id: '101', displayName: 'Player' }, stats: ['200', '2'] }] },
        { name: 'defensive', labels: ['TOT', 'SACKS'], totals: ['80', '3'], athletes: [{ athlete: { id: '102', displayName: 'Defender' }, stats: ['10', '1'] }] },
      ] }],
      teams: [{ team: { id: teamId }, statistics: [{ name: 'turnovers', displayValue: '1' }] }, { team: { id: '11' }, statistics: [{ name: 'turnovers', displayValue: '3' }] }],
    } });
  });
  t.after(() => { delete globalThis.__cfbHistoryIndex_actual; delete globalThis.__cfbHistoryIndex_reference; });
  const actual = await route(false, () => facts);
  const reference = await route(true, () => facts);
  // Helpers return the current array for every invocation, not the callback.
  Object.defineProperty(globalThis, '__cfbHistoryIndex_actual', { configurable: true, get: () => facts });
  Object.defineProperty(globalThis, '__cfbHistoryIndex_reference', { configurable: true, get: () => facts });
  async function check() {
    const request = new Request('https://local.invalid/api/player-stats?week=2');
    const before = calls;
    const a = await actual(request), b = await reference(request);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    const body = await a.text(); assert.equal(body, await b.text(), 'full JSON byte equivalence');
    assert.equal(calls - before, duplicateEvent ? 6 : 4, 'no changes to upstream calls');
    return JSON.parse(body);
  }
  let rows = await check();
  assert.ok(rows.filter(r => r.playerId).every(r => r.playingNow === false));
  assert.equal(rows.find(r => r.stat === 'YDS').seasonHigh, undefined);
  state = 'in'; rows = await check();
  assert.ok(rows.filter(r => r.playerId).every(r => r.playingNow === true));
  duplicateEvent = true; rows = await check();
  assert.ok(rows.filter(r => r.playerId).every(r => r.playingNow === true), 'first numeric event ID retains live state');
  duplicateTeam = true; rows = await check();
  assert.ok(rows.filter(r => r.playerId).every(r => r.playingNow === false), 'duplicate team identity fails closed');
  duplicateTeam = false; duplicateEvent = false; state = 'post'; rows = await check();
  assert.equal(rows.find(r => r.stat === 'YDS').seasonHigh, true);
  assert.equal(rows.find(r => r.stat === 'MARGIN').value, 2);
  assert.equal(rows.find(r => !r.playerId && r.stat === 'TOT').value, 80);
  assert.equal(rows.find(r => r.stat === 'TD').seasonHigh, undefined);
  facts = [fact, { ...fact, team_id: 'other' }]; rows = await check();
  assert.equal(rows.find(r => r.stat === 'YDS').seasonHigh, undefined);
  facts = [{ ...fact, revision: 2, previous_high: 250 }]; rows = await check();
  assert.equal(rows.find(r => r.stat === 'YDS').seasonHigh, undefined);
  facts = [{ ...fact, revision: 3, previous_high: 150 }]; rows = await check();
  assert.equal(rows.find(r => r.stat === 'YDS').seasonHigh, true);
  teamId = 'unknown'; rows = await check();
  assert.ok(rows.filter(r => r.playerId).every(r => !r.playingNow && !r.seasonHigh));
  facts = []; await check();
  summaryMissing = true; assert.deepEqual(await check(), []);
});
