import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createNflIdentityIndex } from '../app/lib/stats-v2/nfl-identity.ts';
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString('base64');
const statSource = (await readFile(new URL('../app/lib/stats-v2/nfl-statlines.ts', import.meta.url), 'utf8'))
  .replace("'./nfl-identity'", JSON.stringify(new URL('../app/lib/stats-v2/nfl-identity.ts', import.meta.url).href));
const statUrl = moduleUrl(statSource);
const { buildNflStatlines, NFL_METRICS } = await import(statUrl);
const exportSource = (await readFile(new URL('../app/lib/stats-v2/nfl-export.ts', import.meta.url), 'utf8'))
  .replace("'./nfl-statlines'", JSON.stringify(statUrl));
const { projectNflRanking } = await import(moduleUrl(exportSource));
const period = { season: 2026, phase: 'REG', week: null };
const at = '2026-10-20T12:00:00Z';
const row = (extra = {}) => ({
  ...Object.fromEntries(Object.keys(NFL_METRICS).map(key => [key, '0'])),
  season: '2026', season_type: 'REG', week: '1', game_id: '2026_01_KC_DEN',
  player_id: '00-0000001', player_display_name: 'Same Name', position: 'QB',
  team: 'KC', opponent_team: 'DEN', attempts: '1', completions: '1', passing_yards: '20', ...extra,
});
const roster = (extra = {}) => ({ season: '2026', game_type: 'REG', week: '1', team: 'KC', gsis_id: '00-0000001', espn_id: '123', position: 'QB', ...extra });
const build = (rows, selection = period, rosters = []) => buildNflStatlines(rows, selection, at, rosters);

test('explicit identities stay stable across providers; malformed, missing and conflicting crosswalks fail safely', () => {
  const index = createNflIdentityIndex([roster()], 2026);
  assert.deepEqual(index.resolve('gsis', '00-0000001'), index.resolve('espn', '123'));
  assert.equal(index.resolve('espn', '999').key, 'espn:999');
  assert.equal(index.resolve('gsis', 'same name'), null);
  assert.equal(index.resolve('espn', '00123'), null);
  const conflicts = createNflIdentityIndex([roster(), roster({ espn_id: '456' }), roster({ gsis_id: '00-0000002', espn_id: '456' })], 2026);
  for (const id of ['123', '456']) assert.equal(conflicts.resolve('espn', id), null);
  for (const id of ['00-0000001', '00-0000002']) assert.equal(conflicts.resolve('gsis', id), null);
  assert.equal(createNflIdentityIndex([roster({ season: '2025' })], 2026).resolve('gsis', '00-0000001').espnId, null);
});
test('QB requires verified primary position; low participation never excludes a real QB or activity category', () => {
  const line = build([row({ carries: '1', rushing_yards: '-2', receptions: '1', targets: '1', def_sacks: '0.5' })]).lines[0];
  assert.deepEqual(line.categories, ['QB', 'Rush', 'Rec', 'Def']);
  assert.equal(line.metrics.passing_yards_per_attempt.value, 20);
  for (const position of ['WR', 'P', '']) assert.ok(!build([row({ position })]).lines[0].categories.includes('QB'));
  assert.ok(build([row({ position: '' })], period, [roster()]).lines[0].categories.includes('QB'));
  assert.ok(!build([row()], period, [roster({ position: 'WR' })]).lines[0].categories.includes('QB'));
  assert.ok(!build([row({ position: '' })], period, [roster({ week: '2' })]).lines[0].categories.includes('QB'));
});
test('confirmed zero, missing and undefined rates are distinct; invalid numeric inputs never become zero', () => {
  const line = build([row({ attempts: '0', completions: '0', receptions: '', targets: undefined, def_sacks: '0.5', rushing_yards: '-3' })]).lines[0];
  assert.deepEqual(line.metrics.attempts, { state: 'value', value: 0 });
  assert.deepEqual(line.metrics.receptions, { state: 'missing', value: null });
  assert.deepEqual(line.metrics.completion_pct, { state: 'not-applicable', value: null });
  assert.deepEqual(line.metrics.catch_pct, { state: 'missing', value: null });
  assert.equal(line.metrics.def_sacks.value, 0.5); assert.equal(line.metrics.rushing_yards.value, -3);
  for (const attempts of [' ', 'NA', 'Infinity', '0x10', '-1', '1.5']) assert.equal(build([row({ attempts })]).lines[0].metrics.attempts.state, 'missing');
});
test('season rates use totals, transfers keep stints, own-team ranking never assigns the full season to one team', () => {
  const rows = [row({ attempts: '2', completions: '1', passing_yards: '30' }), row({ week: '2', game_id: '2026_02_DEN_KC', team: 'DEN', opponent_team: 'KC', attempts: '8', completions: '8', passing_yards: '70' })];
  const snapshot = build(rows), line = snapshot.lines[0];
  assert.equal(line.metrics.completion_pct.value, 90); assert.equal(line.metrics.passing_yards_per_attempt.value, 10);
  assert.deepEqual(line.teams, ['DEN', 'KC']); assert.equal(line.stints.find(s => s.team === 'KC').metrics.passing_yards.value, 30);
  assert.equal(projectNflRanking(snapshot, { category: 'QB', statistic: 'passing_yards', team: 'KC' }).rows[0].value, 30);
  assert.equal(projectNflRanking(snapshot, { category: 'QB', statistic: 'passing_yards' }).rows[0].value, 100);
  assert.equal(build(rows, { ...period, week: 1 }).lines[0].metrics.passing_yards.value, 30);
});
test('duplicates, wrong game/team identities and phase isolation cannot silently change totals', () => {
  const original = row();
  assert.equal(build([original, { ...original }]).lines[0].metrics.passing_yards.value, 20);
  const conflict = build([original, row({ passing_yards: '99' })]);
  assert.equal(conflict.complete, false); assert.equal(conflict.lines.length, 0);
  assert.throws(() => projectNflRanking(conflict, { category: 'QB', statistic: 'passing_yards' }));
  for (const extra of [{ team: 'MIA' }, { opponent_team: 'KC' }, { game_id: '2025_01_KC_DEN' }, { game_id: '2026_02_KC_DEN' }, { player_id: '123' }]) assert.equal(build([row(extra)]).complete, false);
  assert.equal(build([row({ season: '2025' }), row({ season_type: 'POST' })]).lines.length, 0);
  assert.equal(build([row({ season_type: 'POST' })], { ...period, phase: 'POST' }).lines.length, 1);
});
test('same names remain separate; missing weeks are not invented; corrections rebuild rather than accumulate', () => {
  const rows = [row(), row({ player_id: '00-0000002', passing_yards: '40' })];
  assert.equal(build(rows).lines.length, 2);
  const a = build([row()]), b = build([row({ passing_yards: '25' })]);
  assert.equal(a.lines[0].games.length, 1); assert.equal(a.lines[0].metrics.passing_yards.value, 20);
  assert.equal(b.lines[0].metrics.passing_yards.value, 25);
  assert.equal(a.lines[0].id, b.lines[0].id);
  assert.equal(build([row(), row({ week: '2', game_id: '2026_02_KC_DEN', attempts: '' })]).lines[0].metrics.attempts.state, 'missing');
});
test('export contains only selected metric, identity, branding and verified scope; tied ranks and zeroes survive', () => {
  const snapshot = build([row(), row({ player_id: '00-0000002' }), row({ player_id: '00-0000003', passing_yards: '0' })]);
  const before = JSON.stringify(snapshot);
  const output = projectNflRanking(snapshot, { category: 'QB', statistic: 'passing_yards' }, { KC: '/kc.svg' });
  assert.deepEqual(output.rows.map(r => r.rank), [1, 1, 3]);
  assert.equal(output.rows[2].value, 0); assert.equal(output.accent, '#FFC720');
  assert.equal(output.rows[0].teams[0].logo, '/kc.svg');
  assert.deepEqual(Object.keys(output.rows[0]).sort(), ['player', 'rank', 'teams', 'value']);
  assert.ok(!JSON.stringify(output).includes('completions')); assert.ok(!JSON.stringify(output).includes('gameId'));
  assert.deepEqual(output.period, period); assert.equal(JSON.stringify(snapshot), before);
  assert.throws(() => projectNflRanking(snapshot, { category: 'QB', statistic: 'def_interceptions' }));
  assert.throws(() => buildNflStatlines([], { ...period, season: 2025 }, at));
  assert.throws(() => buildNflStatlines([], period, 'yesterday'));
});
test('missing position, absent crosswalk and team aliases do not leak or guess identities', () => {
  assert.equal(build([row()], period, [roster({ espn_id: '456' }), roster()]).lines.length, 0);
  const alias = build([row({ team: 'LA', opponent_team: 'KC', game_id: '2026_01_LA_KC' })]).lines[0];
  assert.deepEqual(alias.teams, ['LAR']);
  const aliasSnapshot = build([row({ team: 'LA', opponent_team: 'KC', game_id: '2026_01_LA_KC' })]);
  assert.equal(projectNflRanking(aliasSnapshot, { category: 'QB', statistic: 'passing_yards', team: 'LA' }).scope.team, 'LAR');
  assert.throws(() => projectNflRanking(aliasSnapshot, { category: 'QB', statistic: 'passing_yards', team: '' }));
  const output = projectNflRanking(build([row({ attempts: '1', completions: '1' })]), { category: 'QB', statistic: 'completion_pct' });
  assert.equal(output.rows.length, 1, 'no automatic rate qualification threshold');
  assert.equal(output.rows[0].value, 100);
});
test('no passing-attempt rule hides a verified QB; impossible rates retain counts but fail closed', () => {
  const a = build([row({ attempts: '', completions: '1', passing_yards: '300' })]);
  assert.equal(projectNflRanking(a, { category: 'QB', statistic: 'passing_yards' }).rows[0].value, 300);
  assert.ok(build([row({ attempts: '0', completions: '0' })]).lines[0].categories.includes('QB'));
  const b = build([row({ attempts: '1', completions: '2', def_tackles_solo: '2', def_tackle_assists: '3' })]);
  assert.equal(b.lines[0].metrics.completions.value, 2);
  assert.equal(b.lines[0].metrics.completion_pct.state, 'missing');
  assert.equal(b.lines[0].metrics.tackles.value, 5);
});
test('team-scoped eligibility uses only that stint; a recovery alone is not proof of defensive activity', () => {
  const snapshot = build([row(), row({ position: 'WR', team: 'DEN', opponent_team: 'KC', week: '2', game_id: '2026_02_KC_DEN', receptions: '1', targets: '1' })]);
  assert.equal(projectNflRanking(snapshot, { category: 'QB', statistic: 'passing_yards' }).rows.length, 0);
  assert.equal(projectNflRanking(snapshot, { category: 'QB', statistic: 'passing_yards', team: 'KC' }).rows.length, 1);
  assert.equal(projectNflRanking(snapshot, { category: 'Rec', statistic: 'receiving_yards', team: 'KC' }).rows.length, 0);
  assert.ok(!build([row({ fumble_recovery_opp: '1' })]).lines[0].categories.includes('Def'));
});
test('existing NFL API headline totals agree with the additive foundation for valid complete inputs', async () => {
  const rows = [row({ passing_tds: '1', def_tackles_solo: '2', def_tackle_assists: '1' }),
    row({ week: '2', game_id: '2026_02_DEN_KC', passing_yards: '50', rushing_yards: '5', def_sacks: '0.5', def_interceptions: '1' })];
  const key = '__nflFoundationParity';
  globalThis[key] = rows;
  try {
    const source = (await readFile(new URL('../app/api/nfl/stats/route.ts', import.meta.url), 'utf8'))
      .replace(/import \{[^\n]+\} from '\.\.\/\.\.\/\.\.\/lib\/nflverse-snapshots';/,
        `const loadNflverseSnapshot=async()=>({ok:true,rows:globalThis[${JSON.stringify(key)}]}); const parseWeeklyPlayers=()=>[]; const deriveNflverseRows=(_rows,_key,fn)=>fn();`)
      .replace('import { NextResponse } from "next/server";', 'const NextResponse={json:Response.json};')
      .replace('import { loadLiveNflStats } from "../live-stats";', 'const loadLiveNflStats=async()=>null;');
    const { GET } = await import(moduleUrl(source));
    for (const [query, selected] of [['mode=season', period], ['mode=weekly&week=1', { ...period, week: 1 }]]) {
      const response = await GET(new Request('https://fixture.test/?' + query));
      const legacy = (await response.json()).stats[0], newer = build(rows, selected).lines[0].metrics;
      for (const field of ['passing_yards', 'passing_tds', 'rushing_yards', 'rushing_tds', 'receiving_yards', 'receiving_tds', 'tackles']) assert.equal(newer[field].value, legacy[field], field);
      assert.equal(newer.def_sacks.value, legacy.sacks);
      assert.equal(newer.def_interceptions.value, legacy.interceptions);
    }
  } finally { delete globalThis[key]; }
});
