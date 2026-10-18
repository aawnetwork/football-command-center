import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchBroadcastRows, parseBroadcastCsv, loadGamesForBroadcastDates } from '../app/lib/broadcast-availability.ts';

const row = (matchup = 'Michigan @ Oregon', date = '17/10/2026', time = '20:00') => ({ date, time, matchup, platforms: ['Sky Sports'] });
const game = (id = 1, awayTeam = 'Michigan Wolverines', homeTeam = 'Oregon Ducks', startDate = '2026-10-17T19:00:00Z') => ({ id, awayTeam, homeTeam, startDate });
const ids = (r, games) => matchBroadcastRows([r], games).matched.map(({ game }) => game.id);

test('row date excludes the same matchup a week later, regardless of schedule ordering', () => {
  const later = game(2, undefined, undefined, '2026-10-24T19:00:00Z');
  assert.deepEqual(ids(row(), [later]), []);
  assert.deepEqual(ids(row(), [later, game()]), [1]);
});

test('Miami identities require explicit aliases; prefix neighbours never match', () => {
  const ohio = game(1, 'Miami (OH) RedHawks');
  const florida = game(2, 'Miami Hurricanes');
  assert.deepEqual(ids(row('Miami @ Oregon'), [ohio]), []);
  assert.deepEqual(ids(row('Miami @ Oregon'), [florida, ohio]), []);
  for (const name of ['Miami (Ohio)', 'Miami (OH)', 'Miami Ohio', 'Miami (OH) RedHawks']) {
    assert.deepEqual(ids(row(`${name} @ Oregon`), [florida, ohio]), [1]);
  }
  for (const name of ['Miami (FL)', 'Miami (Florida)', 'Miami Hurricanes']) {
    assert.deepEqual(ids(row(`${name} @ Oregon`), [ohio, florida]), [2]);
  }
});

test('Michigan and Michigan State remain distinct, in either order', () => {
  const state = game(2, 'Michigan State Spartans');
  assert.deepEqual(ids(row(), [state]), []);
  assert.deepEqual(ids(row(), [state, game()]), [1]);
  assert.deepEqual(ids(row('Oregon vs. Michigan State'), [game(), state]), [2]);
});

test('explicit aliases and ranked names preserve safe matching', () => {
  for (const [alias, full] of [['NC State', 'North Carolina State Wolfpack'], ['UCF', 'UCF Knights'], ['UTSA', 'UTSA Roadrunners'], ['UL Monroe', 'UL Monroe Warhawks'], ['Alabama', 'Alabama Crimson Tide'], ['UNC', 'North Carolina Tar Heels'], ['Pitt', 'Pittsburgh Panthers'], ['Ohio State', 'Ohio State Buckeyes'], ['Notre Dame', 'Notre Dame Fighting Irish'], ['Southern Miss', 'Southern Miss Golden Eagles'], ['Troy', 'Troy Trojans']]) {
    assert.deepEqual(ids(row(`#12 ${alias} @ Oregon`), [game(1, full)]), [1]);
  }
  assert.deepEqual(ids(row('Oregon v. Michigan'), [game()]), [1]);
});

test('London dates handle midnight, overnight kickoffs and both DST boundaries', () => {
  for (const [instant, date] of [
    ['2026-10-17T23:30:00Z', '18/10/2026'],
    ['2026-10-18T00:15:00Z', '18/10/2026'],
    ['2026-03-28T23:59:00Z', '28/03/2026'],
    ['2026-03-29T00:30:00Z', '29/03/2026'],
    ['2026-03-29T01:30:00Z', '29/03/2026'],
    ['2026-10-25T00:30:00Z', '25/10/2026'],
    ['2026-10-25T01:30:00Z', '25/10/2026'],
    ['2026-10-25T23:30:00Z', '25/10/2026'],
    ['2026-10-18T00:30:00+01:00', '18/10/2026'],
    ['2028-02-29T20:00:00Z', '29/02/2028'],
  ]) assert.deepEqual(ids(row(undefined, date, '01:30'), [game(1, undefined, undefined, instant)]), [1]);
  assert.deepEqual(ids(row(undefined, '17/10/2026', '00:30'), [game(1, undefined, undefined, '2026-10-17T23:30:00Z')]), []);
});

test('multiple eligible games, invalid dates and unknown identities fail closed', () => {
  for (const games of [[game(), game(2)], [], [game(1, undefined, undefined, 'invalid')]]) {
    const result = matchBroadcastRows([row()], games);
    assert.equal(result.matched.length, 0);
    assert.equal(result.unmatched.length, 1);
  }
  for (const date of ['31/02/2026', '29/02/2026', '17/13/2026', '', '10/17/2026']) assert.deepEqual(ids(row(undefined, date), [game()]), []);
  assert.deepEqual(ids(row('Michigan S @ Oregon'), [game(1, 'Michigan State Spartans')]), []);
  assert.deepEqual(ids(row('Unknown @ Oregon'), [game()]), []);
  assert.equal(matchBroadcastRows([row('Studio coverage'), { ...row(), platforms: [] }], [game()]).skipped.length, 2);
});

test('autumn repeated local hour cannot disambiguate two games', () => {
  assert.deepEqual(ids(row(undefined, '25/10/2026', '01:30'), [
    game(1, undefined, undefined, '2026-10-25T00:30:00Z'),
    game(2, undefined, undefined, '2026-10-25T01:30:00Z'),
  ]), []);
  assert.deepEqual(ids(row(), [game(1, undefined, undefined, '2026-10-17T19:00:00')]), []);
});

test('checked-in NFL CSV keeps exact full-name matches and reversed ordering', async () => {
  const rows = parseBroadcastCsv(await readFile(new URL('../NFL-Schedule-5-fixed.csv', import.meta.url), 'utf8'));
  const sample = rows.find(r => r.matchup.includes('Pittsburgh Steelers'));
  const fixture = game(1, 'Pittsburgh Steelers', 'Cleveland Browns', '2026-10-02T00:15:00Z');
  assert.deepEqual(ids(sample, [fixture]), [1]);
  assert.deepEqual(ids({ ...sample, matchup: 'Cleveland Browns vs Pittsburgh Steelers' }, [fixture]), [1]);
});

test('schedule lookup retains neighbouring UTC dates and rejects impossible row dates without fetching', async t => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => { urls.push(new URL(url)); return Response.json({ events: [] }); });
  await loadGamesForBroadcastDates('CFB', ['18/10/2026', '18/10/2026']);
  assert.deepEqual(urls.map(u => u.searchParams.get('dates')).sort(), ['20261017', '20261018', '20261019']);
  urls.length = 0;
  await loadGamesForBroadcastDates('NFL', ['31/02/2026']);
  assert.equal(urls.length, 0);
});
