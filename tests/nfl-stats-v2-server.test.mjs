import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { performance } from 'node:perf_hooks';

// Compile the real local module graph in memory; no Next server, source writes
// or production/environment credentials. One cache preserves shared singletons.
const compiled = new Map();
async function compile(file) {
  const path = file.href;
  if (compiled.has(path)) return compiled.get(path);
  if(file.pathname.endsWith('.json')){const out='data:text/javascript;base64,'+Buffer.from('export default '+await readFile(file,'utf8')).toString('base64');compiled.set(path,out);return out;}
  let js = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const match of [...js.matchAll(/from (['"])(\.[^'"]+)\1/g)]) {
    const dependency = new URL(match[2] + (/\.(ts|json)$/.test(match[2]) ? '' : '.ts'), file);
    js = js.replace(match[0], `from ${JSON.stringify(await compile(dependency))}`);
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64'); compiled.set(path, url); return url;
}
const file = path => new URL('../' + path, import.meta.url);
const server = await import(await compile(file('app/lib/stats-v2/nfl-server.ts')));
const loader = await import(await compile(file('app/lib/nflverse-snapshots.ts')));
const liveModule = await import(await compile(file('app/api/nfl/live-stats.ts')));
const foundation = await import(await compile(file('app/lib/stats-v2/nfl-statlines.ts')));
const {stableGameDiscovery}=await import(await compile(file('app/lib/stats-v2/stable-game-discovery.ts')));
const { projectNflRanking } = await import(await compile(file('app/lib/stats-v2/nfl-export.ts')));
const { certifyNflRankings } = await import(await compile(file('app/lib/stats-v2/nfl-confidence.ts')));
const { parseNflSourceCsv } = await import(await compile(file('app/lib/stats-v2/nfl-source-csv.ts')));
const time = Date.parse('2026-10-20T18:00:00Z');
const gsis = '00-0000001';
const baseRow = (extra = {}) => ({
  ...Object.fromEntries(Object.keys(foundation.NFL_METRICS).map(k => [k, '0'])),
  player_id: gsis, player_display_name: 'Same Name', position: 'QB', season: '2026', season_type: 'REG',
  week: '1', game_id: '2026_01_KC_DEN', team: 'KC', opponent_team: 'DEN', completions: '1', attempts: '2', passing_yards: '20', ...extra,
});
const csv = rows => {
  const fields = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const cell = raw => /[",\r\n]/.test(raw ?? '') ? '"' + raw.replaceAll('"', '""') + '"' : raw ?? '';
  return fields.join(',') + '\n' + rows.map(row => fields.map(field => cell(row[field])).join(',')).join('\n');
};
const roster = (extra = {}) => ({ season: '2026', game_type: 'REG', week: '2', team: 'KC', position: 'QB', gsis_id: gsis, espn_id: '123', ...extra });
const game = (extra = {}) => ({ season: '2026', game_type: 'REG', week: '2', game_id: '2026_02_KC_DEN', home_team: 'DEN', away_team: 'KC', espn: '999', ...extra });
function liveFixture(state = 'in', yards = '100') {
  const competition = { id: '999', status: { type: { state, completed: state === 'post', name: 'STATUS_IN_PROGRESS' } },
    competitors: [{ homeAway: 'home', team: { id: '7', abbreviation: 'DEN', displayName: 'Denver Broncos' }, score: '0' },
      { homeAway: 'away', team: { id: '12', abbreviation: 'KC', displayName: 'Kansas City Chiefs', logo: 'https://a.espncdn.com/kc.png' }, score: '7' }] };
  const scoreboard = { season: { year: 2026, type: 2 }, week: { number: 2 }, events: [{ id: '999', date: '2026-10-20T17:00:00Z', season: { year: 2026, type: 2 }, competitions: [competition] }] };
  const summary = { header: { id: '999', season:{year:2026,type:2},week:2, competitions: [competition] }, boxscore: { players: [
    { team: { id: '12', displayName: 'Kansas City Chiefs' }, statistics: [{ name: 'passing', labels: ['C/ATT', 'YDS', 'TD', 'INT'], athletes: [{ athlete: { id: '123', displayName: 'Same Name', position: { abbreviation: 'QB' } }, stats: ['3/4', yards, '1', '0'] }] }] },
  ] } };
  return { scoreboard, summary };
}
function setup(implementation = server, stable = false) {
  let clock = time, stats = [baseRow()], rosters = [roster()], register = [], schedule = [game()], current = liveFixture(), failPlayer = false, failLive = false, builds = 0;
  const counts = { player: 0, roster: 0, schedule: 0, scoreboard: 0, summary: 0 };
  const request = async url => {
    const text = String(url);
    if (text.includes('/scoreboard')) { counts.scoreboard++; if (failLive) throw Error('network'); return Response.json(current.scoreboard); }
    if (text.includes('/summary')) { counts.summary++; return Response.json(current.summary); }
    const kind = text.includes('/players/') ? 'identity' : text.includes('stats_player') ? 'player' : text.includes('/rosters/') ? 'roster' : 'schedule';
    counts[kind] = (counts[kind] ?? 0) + 1; if (kind === 'identity') clock++; if (kind === 'player' && failPlayer) return new Response('', { status: 503 });
    return new Response(csv(kind === 'identity' ? register : kind === 'player' ? stats : kind === 'roster' ? rosters : schedule));
  };
  const snapshot = loader.createNflverseSnapshots(request, () => clock);
  const manifest={season:2026,week:2,events:structuredClone(current.scoreboard.events)};
  const live = liveModule.createNflLiveSource(request, () => clock,stable,(board,league)=>stableGameDiscovery(board,league,manifest));
  const load = implementation.createNflStatsV2Service({ snapshot, live, now: () => clock, build: (...args) => { builds++; return foundation.buildNflStatlines(...args); } });
  const respond = query => implementation.respondNflStatsV2(new Request('https://fixture.test/api/nfl/stats-v2?' + query), load, () => clock);
  return { counts, snapshot, live, load, respond, request, builds: () => builds,
    identities: rows => { register = rows; }, stats: rows => { stats = rows; }, rosters: rows => { rosters = rows; }, schedule: rows => { schedule = rows; },
    current: value => { current = value; }, advance: ms => { clock += ms; }, failPlayer: value => { failPlayer = value; }, failLive: value => { failLive = value; } };
}

test('real additive route exposes identities, nullable statlines, stints, bounded logs and source observation metadata', async () => {
  const s = setup(); const body = await (await s.respond('mode=season')).json();
  if (process.env.AAW_STATS_V2_FIXTURE_OUTPUT) await writeFile(process.env.AAW_STATS_V2_FIXTURE_OUTPUT, JSON.stringify(body, null, 2));
  assert.equal(body.version, 1); assert.equal(body.model.lines[0].identity.key, 'gsis:' + gsis);
  assert.equal(body.model.lines[0].playingNow, true); assert.ok(body.model.lines[0].categories.includes('QB'));
  assert.equal(body.model.lines[0].metrics.passing_yards.value, 120);
  assert.equal(body.model.lines[0].metrics.completion_pct.value, 4 / 6 * 100);
  assert.equal(body.model.lines[0].games[1].metrics.carries.state, 'missing');
  assert.equal(body.model.lines[0].stints[0].team, 'KC');
  assert.equal(body.sources.player.observedAt, new Date(time).toISOString());
  assert.equal(body.sources.player.upstreamUpdatedAt, null); assert.equal(body.sources.live.status, 'verified');
  const route = await import(await compile(file('app/api/nfl/stats-v2/route.ts')));
  const flag=process.env.AAW_STATS_V2_LOCAL_PREVIEW;process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';try{assert.equal((await route.GET(new Request('https://fixture.test/?season=2025'))).status,400);}finally{if(flag===undefined)delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;else process.env.AAW_STATS_V2_LOCAL_PREVIEW=flag;}
});
test('live game replaces rather than adds, final publication wins, corrections invalidate the exact source cache', async () => {
  const s = setup(); s.stats([baseRow(), baseRow({ week: '2', game_id: '2026_02_KC_DEN', passing_yards: '80' })]);
  const first = await (await s.respond('mode=season')).json(); assert.equal(first.model.lines[0].metrics.passing_yards.value, 120);
  s.current(liveFixture('post', '150'));
  const final = await (await s.respond('mode=season')).json(); assert.equal(final.model.lines[0].metrics.passing_yards.value, 100);
  assert.equal(final.model.lines[0].playingNow, false); assert.equal(final.model.lines[0].id, first.model.lines[0].id);
  s.stats([baseRow(), baseRow({ week: '2', game_id: '2026_02_KC_DEN', passing_yards: '160' })]); s.advance(300_000);
  const corrected = await (await s.respond('mode=season')).json(); assert.equal(corrected.model.lines[0].metrics.passing_yards.value, 180);
  assert.equal(s.counts.player, 2);
});
test('unknown/conflicting ESPN identities never name-join or inflate totals; incomplete rankings cannot export', async () => {
  for (const rows of [[roster({ espn_id: '456' })], [roster(), roster({ gsis_id: '00-0000002' })]]) {
    const s = setup(); s.rosters(rows);
    const data = await (await s.respond('mode=season')).json();
    assert.equal(data.sources.live.status, 'partial');
    assert.ok(data.model.lines.length === 0 || data.model.lines[0].metrics.passing_yards.value === 20);
    assert.equal((await s.respond('mode=season&view=export&category=QB&statistic=passing_yards')).status, 409);
  }
});
test('wrong season/team/game, missing summary and unverified status withhold live replacement', async () => {
  for (const mutate of [
    f => { f.scoreboard.season.year = 2025; }, f => { f.scoreboard.events[0].competitions[0].competitors[1].team.abbreviation = 'MIA'; },
    f => { f.summary.header.id = '998'; }, f => { f.summary = null; },
    f => { f.scoreboard.events[0].competitions[0].status.type = { state: 'pre', completed: false }; },
  ]) {
    const s = setup(), f = liveFixture(); mutate(f); s.current(f);
    const data = await (await s.respond('mode=season')).json(); assert.equal(data.model.lines[0].metrics.passing_yards.value, 20);
    assert.notEqual(data.model.lines[0].playingNow, true);
  }
});
test('live/source failures recover without cached errors; published timestamps do not renew on warm reads', async () => {
  const s = setup(); const first = await (await s.respond('mode=season&live=0')).json(); s.advance(100_000);
  const warm = await (await s.respond('mode=season&live=0')).json();
  assert.equal(first.sources.player.observedAt, warm.sources.player.observedAt);
  assert.notEqual(first.observationAt, warm.observationAt); assert.equal(s.counts.player, 1);
  s.failLive(true); const degraded = await (await s.respond('mode=season')).json();
  assert.equal(degraded.model.lines[0].playingNow, null); assert.equal(degraded.sources.live.status, 'unavailable');
  s.failLive(false); assert.equal((await (await s.respond('mode=season')).json()).model.lines[0].playingNow, true);
  s.advance(300_000); s.failPlayer(true); const failed = await s.respond('live=0');
  assert.equal(failed.status, 503); assert.equal(failed.headers.get('Cache-Control'), 'no-store');
  s.failPlayer(false); assert.equal((await s.respond('live=0')).status, 200);
});
test('export is one selected metric, transfers remain team-scoped and opening cards needs zero extra requests', async () => {
  const s = setup(); s.stats([baseRow(), baseRow({ week: '2', game_id: '2026_02_KC_DEN', team: 'DEN', opponent_team: 'KC', passing_yards: '40' })]);
  const dataResponse = await s.respond('mode=season&live=0&limit=1'), data = await dataResponse.json();
  assert.deepEqual(data.model.lines[0].teams, ['DEN', 'KC']);
  const before = { ...s.counts };
  for (let card = 0; card < 10; card++) assert.ok(data.model.lines[0].games.length);
  assert.deepEqual(s.counts, before);
  const result = await s.respond('mode=season&live=0&view=export&category=QB&statistic=passing_yards&team=KC');
  assert.equal(result.headers.get('Cache-Control'), 'no-store'); assert.equal(result.status, 409);
  const body = { export: projectNflRanking(data.model, { category: 'QB', statistic: 'passing_yards', team: 'KC' }) };
  assert.equal(body.export.rows[0].value, 20); assert.equal(body.export.accent, '#FFC720');
  assert.deepEqual(Object.keys(body.export.rows[0]).sort(), ['player', 'rank', 'teams', 'value']);
  assert.ok(!JSON.stringify(body).includes('completions'));
});
test('concurrent selections/pages reuse downloads and active builds; completed live work is always refreshed', async () => {
  const s = setup();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => s.respond('mode=season&limit=' + (i + 1))));
  assert.ok(results.every(r => r.status === 200)); assert.deepEqual(s.counts, { player: 1, roster: 1, schedule: 1, scoreboard: 1, summary: 1 });
  assert.equal(s.builds(), 1);
  await s.respond('mode=season'); assert.equal(s.counts.scoreboard, 2); assert.equal(s.counts.summary, 2); assert.equal(s.counts.player, 1);
});
test('strict parameter validation, CSV identity parsing and explicit live-disabled mode', async () => {
  const s = setup();
  for (const query of ['week=0', 'week=19', 'season=2025', 'mode=season&week=2', 'week=1&week=2', 'player=123', 'limit=51', 'offset=-1', 'view=bad', 'seasontype=3', 'view=export&category=QB&statistic=def_interceptions', 'view=export&category=QB&statistic=passing_yards&direction=bad']) assert.equal((await s.respond(query)).status, 400, query);
  assert.deepEqual(s.counts, { player: 0, roster: 0, schedule: 0, scoreboard: 0, summary: 0 });
  assert.equal((await (await s.respond('live=0')).json()).sources.live.status, 'disabled'); assert.equal(s.counts.scoreboard, 0);
  assert.deepEqual(parseNflSourceCsv('gsis_id,name\n00-0000001,"Last, First"\n'), [{ gsis_id: gsis, name: 'Last, First' }]);
  assert.throws(() => parseNflSourceCsv('a,a\n1,2')); assert.throws(() => parseNflSourceCsv('a,b\n1')); assert.throws(() => parseNflSourceCsv('a\n"open'));
});
test('fixture processing baseline: existing snapshot parsing versus one shared integration for ten consumers', async () => {
  const s = setup(), start = performance.now(); const cpu = process.cpuUsage();
  await s.snapshot('player', 'weekly', loader.parseWeeklyPlayers);
  const baseline = { ...s.counts };
  await Promise.all(Array.from({ length: 10 }, () => s.respond('mode=season')));
  const used = process.cpuUsage(cpu);
  console.log(JSON.stringify({ baselineCounts: baseline, integratedCounts: s.counts, builds: s.builds(), expandedCardAdditionalRequests: 0,
    fixtureCpuMs: (used.user + used.system) / 1000, fixtureWallMs: performance.now() - start }));
  assert.equal(s.counts.player, 1); assert.equal(s.builds(), 1);
});
test('stale/future live observations and expired/future published snapshots cannot claim freshness', async () => {
  const s = setup();
  for (const observedAt of [time - 60_001, time + 1]) {
    const load = server.createNflStatsV2Service({ snapshot: s.snapshot, live: async () => ({ ...(await s.live()), observedAt }), now: () => time });
    const r = await server.respondNflStatsV2(new Request('https://fixture.test/?mode=season'), load), data = await r.json();
    assert.equal(data.sources.live.status, 'unavailable'); assert.equal(data.model.lines[0].playingNow, null);
    assert.equal(data.model.lines[0].metrics.passing_yards.value, 20);
  }
  for (const observedAt of [time - 300_000, time + 1]) {
    const load = server.createNflStatsV2Service({ snapshot: async (...args) => ({ ...(await s.snapshot(...args)), observedAt, expiresAt: observedAt + 300_000 }), now: () => time });
    assert.equal((await server.respondNflStatsV2(new Request('https://fixture.test/?live=0'), load)).status, 503);
  }
});
test('legacy and new consumers share active ESPN retrieval, preserving the exact legacy response projection', async () => {
  const oldFetch = globalThis.fetch;
  const f = liveFixture(); f.scoreboard.events[0].date = new Date(Date.now() - 60_000).toISOString();
  const counts = { scoreboard: 0, summary: 0 };
  globalThis.fetch = async url => { const key = String(url).includes('/scoreboard') ? 'scoreboard' : 'summary'; counts[key]++; return Response.json(f[key]); };
  try {
    const [legacy, source] = await Promise.all([liveModule.loadLiveNflStats(), liveModule.loadNflLiveSource()]);
    assert.deepEqual(counts, { scoreboard: 1, summary: 1 }); assert.equal(source.scoreboard.events[0].id, '999');
    assert.deepEqual(legacy.players, [{ player_id: '123', player_display_name: 'Same Name', recent_team: 'Kansas City Chiefs', playingNow: true,
      passing_yards: 100, passing_tds: 1, rushing_yards: 0, rushing_tds: 0, receiving_yards: 0, receiving_tds: 0, tackles: 0, sacks: 0, interceptions: 0 }]);
    assert.deepEqual(Object.keys(legacy).sort(), ['players', 'teams', 'week']);
    await liveModule.loadLiveNflStats(); assert.deepEqual(counts, { scoreboard: 2, summary: 2 }, 'no completed-live response caching');
  } finally { globalThis.fetch = oldFetch; }
});
test('representative 6000-fact fixture shares one build, bounds payload/logs, and reports processing cost', async () => {
  const s = setup(), rows = [];
  for (let player = 0; player < 1000; player++) for (let week = 1; week <= 6; week++) rows.push(baseRow({
    player_id: '00-' + String(1000000 + player), week: String(week), game_id: `2026_${String(week).padStart(2, '0')}_KC_DEN`,
  }));
  s.stats(rows); const cpu = process.cpuUsage(), start = performance.now();
  const responses = await Promise.all(Array.from({ length: 10 }, () => s.respond('mode=season&live=0&limit=50')));
  const used = process.cpuUsage(cpu), text = await responses[0].text(), data = JSON.parse(text);
  assert.equal(data.pagination.total, 1000); assert.equal(data.model.lines.length, 50); assert.equal(data.model.lines[0].games.length, 5);
  assert.equal(data.model.lines[0].metrics.passing_yards.value, 120); assert.equal(s.builds(), 1);
  assert.equal(s.counts.player, 1); assert.ok(Buffer.byteLength(text) < 2_000_000);
  console.log(JSON.stringify({ fixtureFacts: rows.length, players: data.pagination.total, simultaneousConsumers: 10, builds: s.builds(), upstreamCounts: s.counts,
    payloadBytes: Buffer.byteLength(text), cpuMs: (used.user + used.system) / 1000, wallMs: performance.now() - start }));
});
test('duplicate events, contradictory summary teams and schedule game IDs all fail closed before overlay', async () => {
  for (const kind of ['duplicate-event', 'summary-team', 'schedule-game']) {
    const s = setup(), f = liveFixture();
    if (kind === 'duplicate-event') f.scoreboard.events.push(structuredClone(f.scoreboard.events[0]));
    if (kind === 'summary-team') { f.summary = structuredClone(f.summary); f.summary.header.competitions[0].competitors[0].team.id = '55'; }
    if (kind === 'schedule-game') s.schedule([game({ game_id: '2026_02_MIA_NYJ' })]);
    s.current(f); const data = await (await s.respond('mode=season')).json();
    assert.equal(data.model.lines[0].metrics.passing_yards.value, 20); assert.notEqual(data.model.lines[0].playingNow, true);
    assert.equal(data.model.complete, false);
  }
});
test('reported live tackles do not invent solo/assist components, and season tackles sum known per-game totals', async () => {
  const s = setup(), f = liveFixture();
  s.stats([baseRow({ def_tackles_solo: '2', def_tackle_assists: '1' })]);
  f.summary.boxscore.players[0].statistics.push({ name: 'defensive', labels: ['TOT', 'SACKS'], athletes: [{ athlete: { id: '123', displayName: 'Same Name', position: { abbreviation: 'QB' } }, stats: ['8', '0.5'] }] });
  s.current(f); const data = await (await s.respond('mode=season')).json(), line = data.model.lines[0];
  assert.equal(line.metrics.tackles.value, 11); assert.equal(line.games[1].metrics.def_tackles_solo.state, 'missing');
  assert.equal(line.games[1].metrics.def_tackle_assists.state, 'missing'); assert.equal(line.games[1].metrics.def_sacks.value, 0.5);
});
test('active registry is bounded, rejects excess work safely and cleans up for the next request', async () => {
  const s = setup(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  const load = server.createNflStatsV2Service({ snapshot: async (...args) => { await gate; return s.snapshot(...args); }, live: s.live, now: () => time });
  const respond = week => server.respondNflStatsV2(new Request('https://fixture.test/?week=' + week), load);
  const requests = Array.from({ length: 16 }, (_, i) => respond(i + 1));
  assert.equal((await respond(17)).status, 503); release();
  assert.ok((await Promise.all(requests)).every(r => r.status === 200));
  assert.equal((await respond(17)).status, 200);
});
test('future scheduled fixtures do not poison an otherwise verified active slate', async () => {
  const s = setup(), f = liveFixture(), future = structuredClone(f.scoreboard.events[0]);
  future.id = '998'; future.date = '2026-10-25T18:00:00Z';
  future.competitions[0].status.type = { state: 'pre', completed: false };
  f.scoreboard.events.push(future); s.current(f);
  const data = await (await s.respond('mode=season')).json();
  assert.equal(data.sources.live.status, 'verified'); assert.equal(data.model.complete, true);
  assert.equal(data.model.lines[0].playingNow, true); assert.equal(data.model.lines[0].metrics.passing_yards.value, 120);
});


test('compact leaders preserve nullable values, verified eligibility, observation details and single-stat exports without upstream card requests', async () => {
  const s = setup();
  const full = await (await s.respond('mode=season')).json();
  const compact = await (await s.respond('mode=season&view=leaders&category=QB')).json();
  assert.equal(compact.lines.length, 1);
  assert.deepEqual(compact.lines[0].values, compact.columns.map(key => full.model.lines[0].metrics[key].value));
  assert.equal(compact.lines[0].playingNow, true);
  assert.equal('games' in compact.lines[0], false); assert.equal('stints' in compact.lines[0], false);
  const before = { ...s.counts }, builds = s.builds();
  const detailResponse = await s.respond('mode=season&view=details&snapshot=' + compact.snapshot + '&players=' + encodeURIComponent(compact.lines[0].id));
  assert.equal(detailResponse.status, 200, 'Player expansion is independent of export certification');
  const detail = await detailResponse.json();
  assert.equal('error' in detail, false);
  assert.deepEqual(detail.lines[0].metrics, full.model.lines[0].metrics);
  assert.equal((await s.respond('mode=season&view=export&snapshot=' + compact.snapshot + '&category=QB&statistic=passing_yards')).status, 409);
  assert.deepEqual(s.counts, before); assert.equal(s.builds(), builds);
  assert.equal((await s.respond('mode=weekly&view=details&snapshot=' + compact.snapshot + '&players=' + encodeURIComponent(compact.lines[0].id))).status, 400);
  assert.equal((await s.respond('mode=season&view=details&snapshot=unknown&players=unknown')).status, 409);
});
test('compact observations are bounded, reject unknown players, preserve zero/missing/NA and refresh current data', async () => {
  const s = setup(); s.stats([baseRow({ attempts: '0', completions: '0', passing_yards: '' })]);
  const bodies = [];
  for (let i = 0; i < 5; i++) bodies.push(await (await s.respond('mode=season&live=0&view=leaders&category=QB')).json());
  const latest = bodies.at(-1), row = latest.lines[0];
  assert.equal(row.values[latest.columns.indexOf('attempts')], 0);
  assert.equal(row.values[latest.columns.indexOf('passing_yards')], null);
  assert.ok(row.notApplicable.includes('completion_pct'));
  assert.equal((await s.respond('mode=season&live=0&view=details&snapshot=' + bodies[0].snapshot + '&players=' + row.id)).status, 409);
  assert.equal((await s.respond('mode=season&live=0&view=details&snapshot=' + latest.snapshot + '&players=unknown')).status, 400);
  s.stats([baseRow({ passing_yards: '300' })]); s.advance(300_000);
  const next = await (await s.respond('mode=season&live=0&view=leaders&category=QB')).json();
  assert.equal(next.lines[0].values[next.columns.indexOf('passing_yards')], 300);
});
test('compact 6000-fact equivalent-input measurement (ten consumers, every eligible player, no card downloads)', async () => {
  const measurements = [];
  for (let run = 0; run < 3; run++) {
    const s = setup(), rows = [];
    for (let player = 0; player < 1000; player++) for (let week = 1; week <= 6; week++) rows.push(baseRow({ player_id: '00-' + String(1000000 + player), week: String(week), game_id: `2026_${String(week).padStart(2, '0')}_KC_DEN` }));
    s.stats(rows); const cpu = process.cpuUsage(), start = performance.now();
    const responses = await Promise.all(Array.from({ length: 10 }, () => s.respond('mode=season&live=0&view=leaders&category=QB')));
    const used = process.cpuUsage(cpu), text = await responses[0].text(), body = JSON.parse(text);
    assert.equal(body.lines.length, 1000); assert.equal(s.builds(), 1); assert.equal(s.counts.player, 1);
    assert.equal(body.lines[0].values[body.columns.indexOf('passing_yards')], 120);
    measurements.push({ payloadBytes: Buffer.byteLength(text), cpuMs: (used.user + used.system) / 1000, wallMs: performance.now() - start, upstreamCounts: s.counts, builds: s.builds() });
  }
  console.log(JSON.stringify({ compactMeasurements: measurements }));
});


test('controlled budget comparison against optional preserved pre-phase source', async () => {
  if (!process.env.AAW_STATS_V2_BASELINE_ROOT) return;
  const cache = new Map();
  async function baselineCompile(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const relative = decodeURIComponent(url.pathname).split('/AAW Football Hub/')[1];
    let source;
    try { source = await readFile(process.env.AAW_STATS_V2_BASELINE_ROOT + '/' + relative, 'utf8'); }
    catch { source = await readFile(url, 'utf8'); }
    let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    for (const match of [...js.matchAll(/from (['"])(\.[^'"]+)\1/g)]) js = js.replace(match[0], 'from ' + JSON.stringify(await baselineCompile(new URL(match[2] + '.ts', url))));
    const result = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64'); cache.set(url.href, result); return result;
  }
  const old = await import(await baselineCompile(file('app/lib/stats-v2/nfl-server.ts'))), measurements = [];
  let expected;
  for (let run = 0; run < 3; run++) for (const variant of ['before', 'after']) {
    const s = setup(variant === 'before' ? old : server), rows = [];
    for (let player = 0; player < 1000; player++) for (let week = 1; week <= 6; week++) rows.push(baseRow({ player_id: '00-' + String(1000000 + player), week: String(week), game_id: `2026_${String(week).padStart(2, '0')}_KC_DEN` }));
    s.stats(rows); const cpu = process.cpuUsage(), start = performance.now();
    const responses = await Promise.all(Array.from({ length: 10 }, () => s.respond(variant === 'before' ? 'mode=season&live=0&limit=50' : 'mode=season&live=0&view=leaders&category=QB')));
    const used = process.cpuUsage(cpu), text = await responses[0].text(), body = JSON.parse(text);
    assert.equal(responses[0].status, 200); assert.equal(s.builds(), 1);
    if (variant === 'before') expected = body.model.lines;
    else for (const line of expected) {
      const compact = body.lines.find(row => row.id === line.id);
      assert.deepEqual(compact.identity, line.identity); assert.deepEqual(compact.teams, line.teams);
      assert.deepEqual(compact.values, body.columns.map(key => line.metrics[key].value));
      assert.equal(compact.playingNow, line.playingNow);
    }
    measurements.push({ variant, run, cpuMs: (used.user + used.system) / 1000, wallMs: performance.now() - start, bytes: Buffer.byteLength(text), upstream: s.counts, players: body.pagination?.total ?? body.lines.length });
  }
  console.log(JSON.stringify({ controlledBudget: measurements }));
});

test('live compact refreshes retain coalescing, snapshot reuse, zero-upstream expansion and active-only freshness', async () => {
  const s = setup();
  const bodies = await Promise.all(Array.from({ length: 10 }, async () => (await s.respond('mode=season&view=leaders&category=QB')).json()));
  assert.equal(new Set(bodies.map(body => body.snapshot)).size, 1);
  assert.deepEqual(s.counts, { player: 1, roster: 1, schedule: 1, scoreboard: 1, summary: 1 });
  assert.equal(s.builds(), 1);
  const body = bodies[0], before = { ...s.counts };
  await s.respond('mode=season&view=details&snapshot=' + body.snapshot + '&players=' + body.lines[0].id);
  assert.deepEqual(s.counts, before);
  const next = await (await s.respond('mode=season&view=leaders&category=QB')).json();
  assert.notEqual(next.snapshot, body.snapshot);
  assert.deepEqual(s.counts, { player: 1, roster: 1, schedule: 1, scoreboard: 2, summary: 2 });
  s.advance(31_000);
  assert.equal((await s.respond('mode=season&view=details&snapshot=' + next.snapshot + '&players=' + next.lines[0].id)).status, 200);
  const counts = { ...s.counts };
  assert.equal((await s.respond('view=leaders&category=Unknown')).status, 400);
  assert.deepEqual(s.counts, counts, 'invalid compact selections do no source work');
});


test('idle details retain original observations without extending export or source freshness', async () => {
  const s = setup();
  await s.respond('mode=season&live=0&view=leaders&category=QB');
  s.advance(299_500);
  const body = await (await s.respond('mode=season&live=0&view=leaders&category=QB')).json();
  s.advance(501);
  const before = { ...s.counts };
  const detail = await s.respond('mode=season&live=0&view=details&snapshot=' + body.snapshot + '&players=' + body.lines[0].id);
  assert.equal(detail.status, 200); assert.equal((await detail.json()).observationAt, body.observationAt);
  assert.equal((await s.respond('mode=season&live=0&view=export&category=QB&statistic=passing_yards&snapshot=' + body.snapshot)).status, 409);
  assert.deepEqual(s.counts, before);
});

test('validated anonymous context rows do not invalidate player integrity or certify unverified league coverage', async () => {
  const s = setup();
  s.stats([baseRow(), { season: '2026', season_type: 'REG', week: '1', game_id: '2026_01_KC_DEN', team: 'KC', opponent_team: 'DEN', player_id: '', player_display_name: '', penalties: '25', penalty_yards: '128' }]);
  const body = await (await s.respond('mode=season&live=0&view=leaders&category=QB')).json();
  assert.equal(body.complete, true); assert.equal(body.lines.length, 1);
  assert.equal(body.coverage.warnings.length, 0);
  assert.equal(body.confidence.passing_yards.status, 'unverified');
  assert.equal((await s.respond('mode=season&live=0&view=export&snapshot=' + body.snapshot + '&category=QB&statistic=passing_yards')).status, 409);
});


test('WSH is the explicit Washington alias; context exclusions never hide anonymous player production or wrong games', () => {
  assert.equal(foundation.nflTeamCode('WSH'), 'WAS');
  const context = { season:'2026', season_type:'REG', week:'1', game_id:'2026_01_KC_DEN', team:'KC', opponent_team:'DEN', penalties:'3' };
  const build = rows => foundation.buildNflStatlines(rows, {season:2026, phase:'REG',week:1}, new Date(time).toISOString());
  assert.equal(build([baseRow(),context]).complete,true);
  for (const bad of [{passing_yards:'1'},{player_display_name:'Unknown'},{game_id:'2026_02_KC_DEN'},{team:'WSH'}]) {
    assert.equal(build([baseRow(),{...context,...bad}]).complete,false);
  }
  const washington=build([baseRow({team:'WSH',opponent_team:'KC',game_id:'2026_01_KC_WAS'})]);
  assert.equal(washington.complete,true);assert.deepEqual(washington.lines[0].teams,['WAS']);
});

test('per-metric certification isolates defense, rejects stale/corrected/missing sources and certifies only the verified period', () => {
  const f=liveFixture('post','100');
  f.summary.boxscore.players.push({team:{id:'7'},statistics:[{name:'passing',labels:['C/ATT','YDS','TD','INT'],athletes:[{athlete:{id:'124'},stats:['3/4','100','1','0']}]}]});
  f.summary.boxscore.players[0].statistics.push({name:'defensive',labels:['TOT'],athletes:[{athlete:{id:'999999'},stats:['1']}]});
  const rows=['KC','DEN'].map((team,i)=>baseRow({player_id:i?'00-0000002':gsis,team,opponent_team:i?'KC':'DEN',week:'2',game_id:'2026_02_KC_DEN',completions:'3',attempts:'4',passing_yards:'100',passing_tds:'1'}));
  const rosters=[roster(),roster({gsis_id:'00-0000002',espn_id:'124',team:'DEN'})];
  const build=(week=2)=>foundation.buildNflStatlines(rows,{season:2026,phase:'REG',week},new Date(time).toISOString(),rosters);
  const live={scoreboard:f.scoreboard,summaries:[f.summary],observedAt:time};
  const check=(model=build(),source=live,schedule=[game()],now=time)=>certifyNflRankings(model,rosters,schedule,source,now);
  assert.equal(check().QB.passing_yards.status,'verified');
  assert.equal(check().QB.completion_pct.status,'verified');
  assert.notEqual(check().Def.tackles.status,'verified');
  assert.notEqual(check().QB.sacks_suffered.status,'verified');
  assert.equal(check(build(null)).QB.passing_yards.status,'unverified');
  assert.equal(check(build(),live,[game()],time+60001).QB.passing_yards.status,'unverified');
  for(const schedule of [[],[game(),game()],[game({espn:'998'})]]) assert.notEqual(check(build(),live,schedule).QB.passing_yards.status,'verified');
  const correction=build();correction.lines[0].games[0].metrics.passing_yards.value=99;
  assert.notEqual(check(correction).QB.passing_yards.status,'verified');
  f.scoreboard.events[0].competitions[0].status.type={state:'pre',completed:false};
  assert.notEqual(check().QB.passing_yards.status,'verified');
});

test('fallback register uses explicit observed missing IDs only, preserves current positions and never guesses names', async () => {
 const s=setup();s.rosters([roster({espn_id:''})]);
 s.identities([{gsis_id:gsis,espn_id:'123',position:'WR'}, {gsis_id:'00-0000002',espn_id:'456'}]);
 const result=await (await s.respond('mode=season')).json();
 assert.equal(result.model.lines[0].identity.key,'gsis:'+gsis);assert.equal(result.model.lines[0].metrics.passing_yards.value,120);assert.ok(result.model.lines[0].categories.includes('QB'));
 assert.equal(s.counts.identity,1);assert.ok(result.sources.identity);assert.equal(result.sources.live.status,'verified');
 await s.respond('mode=season');assert.equal(s.counts.identity,1);
 const unknown=setup();unknown.rosters([roster({espn_id:''})]);unknown.identities([{gsis_id:'not-gsis',espn_id:'123',display_name:'Same Name'}]);
 const blocked=await(await unknown.respond('mode=season')).json();assert.equal(blocked.model.lines[0].metrics.passing_yards.value,20);assert.equal(blocked.sources.live.status,'partial');
});

test('season coverage verifies each prior week, rejects missing/stale/corrected observations and exports only the verified statistic', async()=>{
 const f=liveFixture('post','100');f.summary.boxscore.players.push({team:{id:'7'},statistics:[{name:'passing',labels:['C/ATT','YDS','TD','INT'],athletes:[{athlete:{id:'124'},stats:['3/4','100','1','0']}]}]});
 const old=structuredClone(f);old.scoreboard.week.number=1;old.scoreboard.events[0].id='998';old.scoreboard.events[0].competitions[0].id='998';old.summary.header.id='998';old.summary.header.competitions[0].id='998';
 const current={scoreboard:f.scoreboard,summaries:[f.summary],observedAt:time};const previous={scoreboard:old.scoreboard,summaries:[old.summary],observedAt:time-100000};
 const rosters=[roster(),roster({gsis_id:'00-0000002',espn_id:'124',team:'DEN'})];
 const rows=[1,2].flatMap(week=>['KC','DEN'].map((team,i)=>baseRow({player_id:i?'00-0000002':gsis,team,opponent_team:i?'KC':'DEN',week:String(week),game_id:`2026_0${week}_KC_DEN`,completions:'3',attempts:'4',passing_yards:'100',passing_tds:'1'})));
 const schedule=[game({week:'1',game_id:'2026_01_KC_DEN',espn:'998'}),game()];const model=foundation.buildNflStatlines(rows,{season:2026,phase:'REG',week:null},new Date(time).toISOString(),rosters);
 const check=history=>certifyNflRankings(model,rosters,schedule,current,time,history);
 assert.equal(check([previous]).QB.passing_yards.status,'verified');assert.equal(check([previous]).QB.passing_yards.verifiedGames,2);
 assert.notEqual(check([]).QB.passing_yards.status,'verified');assert.notEqual(check([{...previous,observedAt:time-300001}]).QB.passing_yards.status,'verified');
 const corrected=structuredClone(previous);corrected.summaries[0].boxscore.players[0].statistics[0].athletes[0].stats[1]='101';assert.notEqual(check([corrected]).QB.passing_yards.status,'verified');
 const load=server.createNflStatsV2Service({now:()=>time,live:async()=>current,history:async()=>[previous],snapshot:async kind=>({ok:true,status:200,observedAt:time,expiresAt:time+300000,rows:kind==='player'?rows:kind==='roster'?rosters:schedule})});
 const response=await server.respondNflStatsV2(new Request('http://fixture/?mode=season&view=export&category=QB&statistic=passing_yards'),load,()=>time);assert.equal(response.status,200);const body=await response.json();assert.equal(body.export.rows[0].value,200);assert.equal(body.sources.history[0].observedAt,new Date(previous.observedAt).toISOString());assert.deepEqual(Object.keys(body.export.rows[0]).sort(),['player','rank','teams','value']);
});

test('numbered period-to-date rankings exclude verified future fixtures but include after-kickoff scheduled gaps',()=>{
 const f=liveFixture('in','100');f.summary.boxscore.players.push({team:{id:'7'},statistics:[{name:'passing',labels:['C/ATT','YDS','TD','INT'],athletes:[{athlete:{id:'124'},stats:['3/4','100','1','0']}]}]});
 const later=structuredClone(f.scoreboard.events[0]);later.id='998';later.date='2026-10-21T17:00Z';later.competitions[0].id='998';later.competitions[0].status.type={state:'pre',completed:false};later.competitions[0].competitors[0].team={id:'33',abbreviation:'BAL'};later.competitions[0].competitors[1].team={id:'22',abbreviation:'ARI'};
 const rosters=[roster(),roster({gsis_id:'00-0000002',espn_id:'124',team:'DEN'})],rows=['KC','DEN'].map((team,i)=>baseRow({player_id:i?'00-0000002':gsis,team,opponent_team:i?'KC':'DEN',week:'2',game_id:'2026_02_KC_DEN',completions:'3',attempts:'4',passing_yards:'100',passing_tds:'1'}));
 f.scoreboard.events.push(later);const live={scoreboard:f.scoreboard,summaries:[f.summary,null],observedAt:time};const schedule=[game(),game({game_id:'2026_02_ARI_BAL',espn:'998',home_team:'BAL',away_team:'ARI'})];
 const model=foundation.buildNflStatlines(rows,{season:2026,phase:'REG',week:2},new Date(time).toISOString(),rosters);const check=()=>certifyNflRankings(model,rosters,schedule,live,time).QB.passing_yards;
 assert.equal(check().status,'verified');assert.equal(check().expectedGames,1);
 later.date='2026-10-20T17:00Z';assert.notEqual(check().status,'verified');later.date='2026-10-21T17:00Z';later.competitions[0].competitors[0].team.abbreviation='MIA';assert.notEqual(check().status,'verified');
 // Before the next slate starts, completed earlier weeks still certify season-to-date.
 const previous=structuredClone(f);previous.scoreboard.week.number=1;previous.scoreboard.events=[previous.scoreboard.events[0]];previous.scoreboard.events[0].id='997';previous.scoreboard.events[0].competitions[0].id='997';previous.scoreboard.events[0].competitions[0].status.type={state:'post',completed:true};previous.summary.header.id='997';previous.summary.header.competitions[0].id='997';
 const priorRows=rows.map(row=>({...row,week:'1',game_id:'2026_01_KC_DEN'}));const season=foundation.buildNflStatlines(priorRows,{season:2026,phase:'REG',week:null},new Date(time).toISOString(),rosters);
 later.competitions[0].competitors[0].team.abbreviation='BAL';f.scoreboard.events[0].date='2026-10-21T17:00Z';f.scoreboard.events[0].competitions[0].status.type={state:'pre',completed:false};
 const result=certifyNflRankings(season,rosters,[game({week:'1',game_id:'2026_01_KC_DEN',espn:'997'}),...schedule],live,time,[{scoreboard:previous.scoreboard,summaries:[previous.summary],observedAt:time}]);assert.equal(result.QB.passing_yards.status,'verified');assert.equal(result.QB.passing_yards.expectedGames,1);
});

test('weekly details reuse five preceding verified player games without changing selected totals or requesting sources',async()=>{
 const s=setup();const rows=Array.from({length:7},(_,i)=>baseRow({week:String(i+1),game_id:`2026_0${i+1}_KC_DEN`,passing_yards:String((i+1)*10),team:i===3?'DEN':'KC',opponent_team:i===3?'KC':'DEN'}));
 s.stats([...rows,rows[2],{...rows[0],season:'2025',game_id:'2025_01_KC_DEN'}]);
 const get=async week=>{
  const query=`live=0&week=${week}`,leader=await(await s.respond(query+'&view=leaders&category=QB')).json();
  const before={...s.counts};const details=await(await s.respond(query+'&view=details&snapshot='+leader.snapshot+'&players='+leader.lines[0].id)).json();assert.deepEqual(s.counts,before);
  return {leader,line:details.lines[0],query};
 };
 const six=await get(6);assert.deepEqual(six.line.games.map(g=>g.week),[6,5,4,3,2]);assert.equal(new Set(six.line.games.map(g=>g.gameId)).size,5);assert.equal(six.line.metrics.passing_yards.value,60);assert.equal(six.line.games.find(g=>g.week===4).team,'DEN');assert.equal(six.line.games.find(g=>g.week===4).opponent,'KC');
 const five=await get(5);assert.deepEqual(five.line.games.map(g=>g.week),[5,4,3,2,1]);assert.equal(five.line.metrics.passing_yards.value,50);
 const refreshed=await get(6);assert.deepEqual(refreshed.line.games,six.line.games);assert.equal(refreshed.line.id,six.line.id);
});

test('history retains fewer games, zero/missing/NA, and season players with no latest-week appearance; conflicts fail safely',async()=>{
 const s=setup();const rows=[1,2,3].map(week=>baseRow({week:String(week),game_id:`2026_0${week}_KC_DEN`,attempts:'0',completions:'0',passing_yards:'0',receiving_yards:''}));
 s.stats([...rows,baseRow({player_id:'00-0000002',week:'4',game_id:'2026_04_KC_DEN'})]);
 const leaders=await(await s.respond('mode=season&live=0&view=leaders&category=QB')).json();const details=await(await s.respond('mode=season&live=0&view=details&snapshot='+leaders.snapshot+'&players='+leaders.lines[0].id)).json();const games=details.lines[0].games;
 assert.deepEqual(games.map(g=>g.week),[3,2,1]);assert.equal(games[0].metrics.completions.value,0);assert.equal(games[0].metrics.completion_pct.state,'not-applicable');assert.equal(games[0].metrics.receiving_yards.state,'missing');
 s.stats([...rows,{...rows[1],passing_yards:'99'}]);s.advance(300001);
 const updated=await(await s.respond('live=0&week=3&view=leaders&category=QB')).json();const corrected=await(await s.respond('live=0&week=3&view=details&snapshot='+updated.snapshot+'&players='+updated.lines[0].id)).json();assert.deepEqual(corrected.lines[0].games.map(g=>g.week),[3,1]);
});
test('Week and Season refresh changing values for all categories, preserving rates and exact identities through final and publication',async()=>{
 const s=setup(),ids=['00-0000001','00-0000002','00-0000003','00-0000004'],espn=['123','124','125','126'],positions=['QB','RB','WR','LB'];
 const base=ids.map((player_id,i)=>baseRow({player_id,position:positions[i],carries:'2',rushing_yards:'10',receptions:'1',receiving_yards:'15',targets:'2',def_tackles_solo:'1',def_tackle_assists:'1',reported_tackles:'2'}));
 s.stats(base);s.rosters(ids.map((gsis_id,i)=>roster({gsis_id,espn_id:espn[i],position:positions[i]})));
 function observation(state='in',n=100){const f=liveFixture(state,String(n)),box=f.summary.boxscore.players[0];box.statistics=[
  {name:'passing',labels:['C/ATT','YDS','TD','INT'],athletes:[{athlete:{id:'123',displayName:'QB',position:{abbreviation:'QB'}},stats:['3/4',String(n),'1','0']}]},
  {name:'rushing',labels:['CAR','YDS','TD'],athletes:[{athlete:{id:'124',displayName:'RB',position:{abbreviation:'RB'}},stats:['4',String(n),'0']}]},
  {name:'receiving',labels:['REC','TGTS','YDS','TD'],athletes:[{athlete:{id:'125',displayName:'WR',position:{abbreviation:'WR'}},stats:['2','3',String(n),'0']}]},
  {name:'defensive',labels:['TOT','SOLO','AST','SACKS','TFL','PD'],athletes:[{athlete:{id:'126',displayName:'LB',position:{abbreviation:'LB'}},stats:[String(n),String(n-1),'1','1','1','0']}]}
 ];return f;}
 s.current(observation());const firstWeek=await s.load({mode:'weekly',week:null,live:true}),firstSeason=await s.load({mode:'season',week:null,live:true});
 for(let i=0;i<ids.length;i++){const a=firstWeek.model.lines.find(l=>l.identity.gsisId===ids[i]),b=firstSeason.model.lines.find(l=>l.identity.gsisId===ids[i]);assert.ok(a.playingNow);assert.ok(b.playingNow);assert.ok(a.categories.includes(['QB','Rush','Rec','Def'][i]));}
 s.current(observation('in',150));s.advance(30000);const changedWeek=await s.load({mode:'weekly',week:null,live:true}),changed=await s.load({mode:'season',week:null,live:true});
 for(const [i,key]of ['passing_yards','rushing_yards','receiving_yards','tackles'].entries()){
  const a=changedWeek.model.lines.find(l=>l.identity.gsisId===ids[i]),b=changed.model.lines.find(l=>l.identity.gsisId===ids[i]),old=firstSeason.model.lines.find(l=>l.identity.gsisId===ids[i]);assert.equal(a.metrics[key].value,150);assert.equal(b.metrics[key].value-old.metrics[key].value,50);
 }
 const qb=changed.model.lines.find(l=>l.identity.gsisId===ids[0]);assert.equal(qb.metrics.completion_pct.value,4/6*100);assert.equal(qb.metrics.passing_yards.value,170);
 s.current(observation('post',150));s.advance(30000);const final=await s.load({mode:'season',week:null,live:true});assert.equal(final.model.lines[0].playingNow,false);assert.equal(final.model.lines[0].metrics.passing_yards.value,170);
 const published=final.model.lines.flatMap(l=>l.games.filter(g=>g.week===2).map(g=>({season:'2026',season_type:'REG',week:'2',game_id:'2026_02_KC_DEN',team:'KC',opponent_team:'DEN',player_id:l.identity.gsisId,position:g.position,...Object.fromEntries(Object.entries(g.metrics).filter(([k,v])=>k in foundation.NFL_METRICS&&v.state==='value').map(([k,v])=>[k,String(v.value)]))})));
 s.stats([...base,...published]);s.advance(300001);const handoff=await s.load({mode:'season',week:null,live:true});assert.equal(handoff.model.lines.find(l=>l.identity.gsisId===ids[0]).metrics.passing_yards.value,170);assert.equal(handoff.model.lines.find(l=>l.identity.gsisId===ids[0]).games.length,2);
});
test('an unrelated unresolved NFL identity no longer leaves a known live player showing a badge with stale statistics',async()=>{
 const s=setup(),f=liveFixture();f.summary.boxscore.players[0].statistics.push({name:'defensive',labels:['TOT'],athletes:[{athlete:{id:'999999',displayName:'Unresolved defender'},stats:['2']}]});s.current(f);
 const week=await s.load({mode:'weekly',week:null,live:true}),season=await s.load({mode:'season',week:null,live:true});
 assert.equal(week.model.lines[0].playingNow,true);assert.equal(week.model.lines[0].metrics.passing_yards.value,100);assert.equal(season.model.lines[0].metrics.passing_yards.value,120);assert.ok(season.coverage.warnings.some(w=>w.includes('only exact')));
});
test('NFL adaptive Season timer applies changed live values and final cooldown without resetting selections',async()=>{
 const {startNflPolling}=await import(await compile(file('app/preview/nfl-stats/nfl-polling.ts')));
 const s=setup(),values=[];let timer,final=false;
 const stop=startNflPolling({refresh:async()=>{const result=await s.load({mode:'season',week:null,live:true});values.push(result.model.lines[0]);return true;},status:async()=>({historical:false,games:[{id:'999',startDate:'2026-10-20T17:00Z',live:!final,completed:final}]}),report(){},now:()=>time,schedule:(run,delay)=>{timer={run,delay};return 1;},cancel(){}});
 await new Promise(r=>setImmediate(r));assert.equal(timer.delay,30000);assert.equal(values[0].metrics.passing_yards.value,120);assert.equal(values[0].playingNow,true);
 s.current(liveFixture('in','150'));s.advance(30000);timer.run();await new Promise(r=>setImmediate(r));assert.equal(values.at(-1).metrics.passing_yards.value,170);
 final=true;s.current(liveFixture('post','150'));s.advance(30000);timer.run();await new Promise(r=>setImmediate(r));assert.equal(values.at(-1).metrics.passing_yards.value,170);assert.equal(values.at(-1).playingNow,false);assert.equal(timer.delay,30000);stop();
});

test('NFL stable discovery keeps completed Week/Season facts after disappearance, new service state and corrections',async()=>{
 const s=setup(server,true);const live=liveFixture('in','100');s.current(live);
 const read=async mode=>(await s.load({mode,week:null,live:true})).model.lines.find(l=>l.identity.gsisId===gsis);
 assert.equal((await read('season')).metrics.passing_yards.value,120);assert.equal((await read('weekly')).playingNow,true);
 const final=liveFixture('post','150');s.current(final);s.advance(30000);assert.equal((await read('season')).metrics.passing_yards.value,170);assert.equal((await read('season')).playingNow,false);
 final.scoreboard.events=[];s.current(final);s.advance(30000);assert.equal((await read('weekly')).metrics.passing_yards.value,150);assert.equal((await read('season')).metrics.passing_yards.value,170);
 const cold=setup(server,true);cold.current(final);assert.equal((await cold.load({mode:'season',week:null,live:true})).model.lines[0].metrics.passing_yards.value,170);
 final.summary.boxscore.players[0].statistics[0].athletes[0].stats[1]='149';s.current(final);s.advance(30000);assert.equal((await read('season')).metrics.passing_yards.value,169);assert.equal((await read('season')).metrics.passing_yards.value,169);
});
