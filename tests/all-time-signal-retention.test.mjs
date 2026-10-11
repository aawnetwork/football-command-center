import test from 'node:test';
import assert from 'node:assert/strict';
import { retainAllTimeSignals } from '../app/lib/all-time-signal-retention.ts';

const signal = (id, league = 'CFB', createdAt = '2026-10-11T10:00:00.000Z') => ({
  id, league, audience: 'individual', period: 'career', category: 'yards',
  type: 'rank-movement', player: 'Player', isActive: true,
  previousRank: 3, currentRank: 2, createdAt,
});
test('No-change refreshes preserve both leagues, including rebaseline with no generated events', () => {
  const existing = [signal('cfb'), signal('nfl', 'NFL')];
  assert.deepEqual(retainAllTimeSignals(existing, []), existing);
  assert.deepEqual(retainAllTimeSignals(retainAllTimeSignals(existing, []), []), existing);
});
test('League-specific and combined refresh events append without discarding older signals', () => {
  const existing = [signal('old-cfb'), signal('old-nfl', 'NFL')];
  const generated = [signal('new-cfb'), signal('new-nfl', 'NFL')];
  assert.equal(retainAllTimeSignals(existing, generated.slice(0, 1)).length, 3);
  assert.equal(retainAllTimeSignals(existing, generated).length, 4);
});
test('Exact event IDs deduplicate but separate genuine movements remain distinct', () => {
  const prior = signal('event');
  assert.deepEqual(retainAllTimeSignals([prior], [prior]), [prior]);
  assert.equal(retainAllTimeSignals([prior], [signal('later-movement')]).length, 2);
});
test('Retention remains bounded to newest 250 without mutating inputs', () => {
  const existing = Array.from({ length: 260 }, (_, index) => signal(String(index), 'CFB', new Date(index * 1000).toISOString()));
  const original = structuredClone(existing);
  const retained = retainAllTimeSignals(existing, [signal('new')]);
  assert.equal(retained.length, 250);
  assert.equal(retained[0].id, 'new');
  assert.equal(retained.at(-1).id, '11');
  assert.deepEqual(existing, original);
});
