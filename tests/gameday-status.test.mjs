import test from 'node:test';
import assert from 'node:assert/strict';
import { isTeamPlaying, possessionSide } from '../app/lib/gameday-status.ts';
import { buildWeeklyIndividualLeaders } from '../app/lib/cfb-helpers.ts';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const competition = {
  status: { type: { state: 'in', completed: false, name: 'STATUS_IN_PROGRESS', description: 'In Progress' } },
  competitors: [{ team: { id: '7' }, homeAway: 'home' }, { team: { id: '8' }, homeAway: 'away' }],
  situation: { possession: '7' },
};
test('Playing now requires an exact, unique team ID in an unfinished live game', () => {
  assert.equal(isTeamPlaying(competition, '7'), true);
  for (const id of ['9', '', undefined, 7]) assert.equal(isTeamPlaying(competition, id), false);
  assert.equal(isTeamPlaying({ ...competition, competitors: [...competition.competitors, competition.competitors[0]] }, '7'), false);
  for (const state of ['pre', 'post']) {
    assert.equal(isTeamPlaying({ ...competition, status: { type: { state } } }, '7'), false);
  }
  assert.equal(isTeamPlaying({ ...competition, status: { type: { state: 'in', completed: true } } }, '7'), false);
});
test('Possession follows explicit team ID, changes sides and clears on final', () => {
  assert.equal(possessionSide(competition), 'home');
  assert.equal(possessionSide({ ...competition, situation: { possession: '8' } }), 'away');
  assert.equal(possessionSide({ ...competition, status: { type: { state: 'post', completed: true } } }), null);
});
test('Possession is hidden for scheduled, halftime, suspended and unknown states', () => {
  for (const name of ['STATUS_SCHEDULED', 'STATUS_HALFTIME', 'STATUS_END_PERIOD', 'STATUS_DELAYED', 'STATUS_SUSPENDED']) {
    assert.equal(possessionSide({ ...competition, status: { type: { ...competition.status.type, name } } }), null);
  }
  assert.equal(possessionSide({ ...competition, status: { type: { ...competition.status.type, description: 'Halftime' } } }), null);
  for (const possession of [undefined, '', '99', 7]) assert.equal(possessionSide({ ...competition, situation: { possession } }), null);
  assert.equal(possessionSide({ ...competition, competitors: [...competition.competitors, competition.competitors[0]] }), null);
  assert.equal(possessionSide(undefined), null);
});
test('CFB weekly leader propagation preserves statistics/order and resets with the next snapshot', () => {
  const stat = { playerId: 1, gameId: 2, player: 'Player', team: 'Team', category: 'rushing', stat: 'YDS', value: 150, playingNow: true };
  const [live] = buildWeeklyIndividualLeaders([stat], 'rushing');
  assert.equal(live.playingNow, true);
  assert.equal(live.value, 150);
  const [final] = buildWeeklyIndividualLeaders([{ ...stat, playingNow: false }], 'rushing');
  assert.deepEqual(final, { ...live, playingNow: false });
  assert.equal(buildWeeklyIndividualLeaders([{ ...stat, playingNow: undefined }], 'rushing')[0].playingNow, false);
});
test('NFL existing stats fetch propagates live status and clears it on the final snapshot without extra requests', async () => {
  const source = await readFile(new URL('../app/api/nfl/live-stats.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace('"../../lib/gameday-status"', JSON.stringify(new URL('../app/lib/gameday-status.ts', import.meta.url).href));
  const { loadLiveNflStats } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const original = globalThis.fetch;
  let current = competition;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    return { ok: true, json: async () => String(url).includes('/scoreboard')
      ? { week: { number: 6 }, events: [{ id: '123', competitions: [current] }] }
      : { boxscore: { players: [{ team: { id: '7', displayName: 'Team' }, statistics: [{ name: 'rushing', labels: ['YDS'], athletes: [{ athlete: { id: '1', displayName: 'Player' }, stats: ['150'] }] }] }] } } };
  };
  try {
    const live = await loadLiveNflStats();
    assert.equal(live.players[0].playingNow, true);
    assert.equal(live.players[0].rushing_yards, 150);
    assert.equal(calls, 2); // Existing scoreboard + summary only.
    current = { ...competition, status: { type: { state: 'post', completed: true } } };
    const final = await loadLiveNflStats();
    assert.deepEqual(final.players[0], { ...live.players[0], playingNow: false });
    assert.equal(calls, 4);
  } finally { globalThis.fetch = original; }
});
