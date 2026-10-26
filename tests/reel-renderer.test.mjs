import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../app/features/exports/reel-renderer.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { clamp, easeOut, revealAt, drawReelFrame, REEL_FPS, REEL_SECONDS, REEL_WIDTH, REEL_HEIGHT } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const images = {
  awayLogo: { width: 500, height: 500, id: 'away' },
  homeLogo: { width: 500, height: 500, id: 'home' },
  wordmark: { width: 2591, height: 332, id: 'wordmark' },
  photo: { width: 1800, height: 2800, id: 'photo' },
};
const team = (id, name, score) => ({ id, name, logo: '', color: '#223344', rank: null, record: null, score });
const finalGame = {
  id: 'aaw-test', league: 'CFB', stage: 'final', away: team('1', 'Example Away Team', 38),
  home: team('2', 'Example Home Team', 27), finalLabel: 'FINAL', context: 'RANKED UPSET',
  kickoff: '2026-10-24T19:00:00Z', observedAt: '2026-10-25T00:00:00Z', neutral: false,
};

function fakeContext() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const context = { canvas: { width: REEL_WIDTH, height: REEL_HEIGHT }, calls };
  for (const key of ['save','restore','setTransform','clearRect','fillRect','beginPath','rect','clip','stroke','moveTo','lineTo','translate']) {
    context[key] = (...args) => calls.push({ key, args });
  }
  context.createLinearGradient = () => gradient;
  context.drawImage = (image) => calls.push({ key: 'drawImage', id: image.id });
  context.fillText = (value) => calls.push({ key: 'fillText', value });
  context.measureText = (value) => ({ width: value.length * 26 });
  return context;
}

test('Reel timing is nine seconds at 30 fps with bounded, monotonic transitions', () => {
  assert.equal(REEL_FPS * REEL_SECONDS, 270);
  assert.equal(REEL_WIDTH / REEL_HEIGHT, 9 / 16);
  assert.equal(clamp(-4), 0);
  assert.equal(clamp(12), 1);
  assert.equal(revealAt(1, 2), 0);
  assert.equal(revealAt(3, 2), 1);
  assert.ok(easeOut(.4) > .4);
});

test('Final Reel draws uploaded photography, source scores/logos, then AAW outro', () => {
  const before = structuredClone(finalGame);
  const beginning = fakeContext();
  drawReelFrame(beginning, { game: finalGame, images, treatment: 'dark', time: 0, sans: 'Arial', display: 'Arial' });
  assert.ok(beginning.calls.some(c => c.key === 'fillText' && c.value === 'FINAL'));
  assert.ok(beginning.calls.some(c => c.key === 'drawImage' && c.id === 'photo'));
  const middle = fakeContext();
  drawReelFrame(middle, { game: finalGame, images, treatment: 'dark', time: 4, sans: 'Arial', display: 'Arial' });
  assert.deepEqual(middle.calls.filter(c => c.key === 'drawImage').map(c => c.id), ['photo', 'away', 'home']);
  assert.ok(middle.calls.some(c => c.key === 'fillText' && c.value === '38'));
  assert.ok(middle.calls.some(c => c.key === 'fillText' && c.value === '27'));
  const outro = fakeContext();
  drawReelFrame(outro, { game: finalGame, images, treatment: 'light', time: 8.9, sans: 'Arial', display: 'Arial' });
  assert.ok(outro.calls.some(c => c.key === 'drawImage' && c.id === 'wordmark'));
  assert.deepEqual(finalGame, before, 'render must never change source game data');
});

test('Pregame Reel never invents scores, even when the source has null score fields', () => {
  const pregame = { ...finalGame, stage: 'pregame', away: team('1', 'Away', null), home: team('2', 'Home', null) };
  const context = fakeContext();
  drawReelFrame(context, { game: pregame, images: { ...images, photo: null }, treatment: 'light', time: 5, sans: 'Arial', display: 'Arial' });
  assert.ok(context.calls.some(c => c.key === 'fillText' && c.value === 'GAME DAY'));
  assert.ok(context.calls.some(c => c.key === 'fillText' && c.value.includes('SAT 24 OCT')));
  assert.ok(!context.calls.some(c => c.key === 'fillText' && (c.value === 'null' || c.value === 'undefined')));
});
