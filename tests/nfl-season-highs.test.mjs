import test from 'node:test';
import assert from 'node:assert/strict';
import { nflSeasonHighs } from '../app/lib/nfl-season-highs.ts';

const schedule = Array.from({ length: 17 }, (_, index) => ({
  game_id: `game-${index + 1}`, season: '2026', game_type: 'REG', week: String(index + 1),
  gameday: index < 3 ? `2026-09-0${index + 1}` : '2026-12-01',
  home_team: 'PIT', away_team: 'BAL', home_score: index < 3 ? '24' : '',
  away_score: index < 3 ? '10' : '', result: index < 3 ? '14' : '', total: index < 3 ? '34' : '',
}));
const row = (week, value) => ({ player_id: 'player-1', season: '2026', season_type: 'REG', game_id: `game-${week}`,
  team: 'PIT', week: String(week), passing_yards: String(value), rushing_yards: '10', receiving_yards: '0' });
const stats = [row(1, 200), row(2, 220), row(3, 300)];
const run = (rows = stats, games = schedule) => nflSeasonHighs(rows, games, 2026, '2026-10-11');
test('Genuine completed new high is identified by category without changing input', () => {
  assert.deepEqual(run().get('player-1:game-3'), ['Passing Yards']);
  assert.equal(stats[2].passing_yards, '300');
});
test('Tied high and first recorded game never qualify', () => {
  assert.equal(run([row(1, 200), row(2, 220), row(3, 220)]).has('player-1:game-3'), false);
  assert.equal(run([row(3, 300)]).size, 0);
  assert.equal(run().has('player-1:game-1'), false);
});
test('Missing historical game, category, schedule or duplicate identity suppresses unsupported highs', () => {
  assert.equal(run([stats[0], stats[2]]).has('player-1:game-3'), false);
  assert.equal(run([{ ...stats[0], passing_yards: '' }, stats[1], stats[2]]).has('player-1:game-3'), false);
  assert.equal(run(stats, schedule.slice(1)).size, 0);
  assert.equal(run([...stats, stats[0]]).has('player-1:game-3'), false);
});
test('Other players, seasons, types or mismatched teams cannot fill historical coverage', () => {
  for (const mismatch of [{ player_id: 'other' }, { season: '2025' }, { season_type: 'POST' }, { team: 'DAL' }]) {
    assert.equal(run([{ ...stats[0], ...mismatch }, stats[1], stats[2]]).has('player-1:game-3'), false);
  }
});
test('Live, same-day, missing-final and future games cannot earn badges', () => {
  for (const mismatch of [{ result: '' }, { total: '' }, { home_score: '' }, { gameday: '2026-10-11' }, { gameday: '2026-10-12' }]) {
    assert.equal(run(stats, schedule.map((g) => g.game_id === 'game-3' ? { ...g, ...mismatch } : g)).has('player-1:game-3'), false);
  }
});
test('Postponed games with inconsistent week/date chronology suppress badges', () => {
  assert.equal(run(stats, schedule.map((g) => g.game_id === 'game-1' ? { ...g, gameday: '2026-09-04' } : g)).has('player-1:game-3'), false);
});
