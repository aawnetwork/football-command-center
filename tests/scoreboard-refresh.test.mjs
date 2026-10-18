import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { getScoreboardRefreshDelay } from '../app/lib/scoreboard-refresh.ts';

const kickoff = Date.parse('2026-10-18T17:00:00Z');
const game = (offset = 0, flags = {}) => ({
  startDate: new Date(kickoff + offset).toISOString(), live: false, completed: false, ...flags,
});
const flush = () => new Promise(resolve => setImmediate(resolve));

test('unfinished kickoffs keep polling, including exactly kickoff and mixed slates', t => {
  t.mock.timers.enable({ apis: ['Date'], now: kickoff });
  assert.equal(getScoreboardRefreshDelay([game()]), 30_000);
  t.mock.timers.tick(60_000);
  assert.equal(getScoreboardRefreshDelay([game()]), 30_000);
  assert.equal(getScoreboardRefreshDelay([game(), game(3_600_000)]), 30_000);
  assert.equal(getScoreboardRefreshDelay([game(0, { live: true })]), 30_000);
  assert.equal(getScoreboardRefreshDelay([game(0, { completed: true })]), null);
});

test('future kickoff buffer, finished/empty slates and invalid dates retain existing behavior', t => {
  t.mock.timers.enable({ apis: ['Date'], now: kickoff });
  assert.equal(getScoreboardRefreshDelay([game(3_600_000), game(60_000)]), 75_000);
  assert.equal(getScoreboardRefreshDelay([game(1_000)]), 30_000);
  assert.equal(getScoreboardRefreshDelay([game(-60_000, { completed: true }), game(60_000)]), 75_000);
  assert.equal(getScoreboardRefreshDelay([]), null);
  assert.equal(getScoreboardRefreshDelay([game(60_000, { completed: true })]), null);
  assert.equal(getScoreboardRefreshDelay([{ ...game(), startDate: 'invalid' }]), null);
});

// Exercise the actual page effects with fake time, timers and fetch; no network.
for (const league of ['cfb', 'nfl']) {
  const source = await readFile(new URL(`../app/${league}/page.tsx`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.getText(ast).includes('function scheduleRefresh')) callback = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback);
  const names = 'activeTab,seasonIndicators,gamesLoading,selectedWeek,selectedGameWeek,window,fetch,getScoreboardRefreshDelay,setGamesLoading,setLoading,setGamesError,setSeasonGames,setCurrentWeek,setSelectedWeek,setGames,setGamesCheck,setGameSeason,setRivalryGames,setUpsets,recordDataCheck,isRivalryGame,detectUpsets,setCurrentGameWeek,setSelectedGameWeek,getGameImportance,console';
  const js = ts.transpileModule(`export function run(env) { const {${names}} = env; return (${callback})(); }`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { run } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

  test(`${league}: future -> overdue scheduled -> error/retry -> live -> final; cleanup cancels`, async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: kickoff - 60_000 });
    let response = [game()], calls = 0;
    const snapshots = [], delays = [];
    const noop = () => {};
    const env = Object.fromEntries(names.split(',').map(name => [name, noop]));
    Object.assign(env, {
      activeTab: 'games', seasonIndicators: false, gamesLoading: true,
      selectedWeek: 1, selectedGameWeek: 1, getScoreboardRefreshDelay,
      window: { setTimeout(fn, delay) { delays.push(delay); return setTimeout(fn, delay); }, clearTimeout },
      fetch: async url => { assert.equal(url, league === 'cfb' ? '/api/scoreboard?week=1' : '/api/nfl/scoreboard?week=1'); calls++; if (response instanceof Error) throw response; if (response === 'http-error') return Response.json({}, { status: 503 }); return Response.json({ games: response }); },
      setGames: games => snapshots.push(games), isRivalryGame: () => null,
      detectUpsets: () => [], getGameImportance: () => ({ importance: 0, reasons: [] }),
      console: { error: noop },
    });
    const cleanup = run(env);
    t.after(cleanup);
    await flush();
    assert.equal(delays.at(-1), 75_000);
    async function advance(ms) { t.mock.timers.tick(ms); await flush(); }
    await advance(75_000);
    assert.equal(calls, 2);
    assert.equal(snapshots.at(-1)[0].live, false);
    assert.equal(delays.at(-1), 30_000);
    response = new Error('offline');
    await advance(30_000);
    assert.equal(delays.at(-1), 60_000);
    response = 'http-error';
    await advance(60_000);
    assert.equal(delays.at(-1), 60_000);
    response = [game(0, { live: true })];
    await advance(60_000);
    assert.equal(snapshots.at(-1)[0].live, true);
    assert.equal(delays.at(-1), 30_000);
    response = [game(0, { completed: true })];
    await advance(30_000);
    assert.equal(snapshots.at(-1)[0].completed, true);
    const finishedCalls = calls;
    await advance(3_600_000);
    assert.equal(calls, finishedCalls);
    response = [game()];
    const cancel = run(env);
    await flush();
    cancel();
    const cancelledCalls = calls;
    await advance(60_000);
    assert.equal(calls, cancelledCalls);
  });
}
