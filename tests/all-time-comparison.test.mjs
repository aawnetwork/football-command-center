import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSnapshot, allTimeMovementDetail } from '../app/lib/all-time-comparison.ts';

const entry = { id: 'legacy-player-team-years', name: 'Active Player', context: 'Old Team', years: '2010-25', rank: 5, value: 100, isActive: true };
const snapshot = (entries, overrides = {}) => ({ id: 'NFL:individual:career:tds', league: 'NFL', audience: 'individual', period: 'career', category: 'tds', checkedAt: '2026-10-11', entries, ...overrides });

test('Career metadata updates match legacy snapshots without a reset for both leagues', () => {
  for (const league of ['NFL', 'CFB']) {
    const prior = snapshot([entry], { league });
    const original = structuredClone(prior);
    assert.deepEqual(compareSnapshot(prior, snapshot([{ ...entry, id: 'changed-id', context: 'New Team', years: '2010-present', value: 104 }], { league })), []);
    assert.deepEqual(prior, original);
  }
});
test('Program record/year metadata does not create a new entry', () => {
  const prior = snapshot([entry], { audience: 'team' });
  assert.deepEqual(compareSnapshot(prior, snapshot([{ ...entry, id: 'new-id', context: '101-90-2', years: 'Through 2026' }], { audience: 'team' })), []);
});
test('Metadata updates still detect real rises and falls', () => {
  for (const rank of [3, 7]) {
    const [signal] = compareSnapshot(snapshot([entry]), snapshot([{ ...entry, id: 'new-id', years: '2010-26', rank }]));
    assert.equal(signal.type, 'rank-movement');
    assert.equal(signal.previousRank, 5);
    assert.equal(signal.currentRank, rank);
    assert.match(allTimeMovementDetail(signal), rank < 5 ? /rose from #5 to #3/ : /fell from #5 to #7/);
  }
});
test('Genuine new entrants, record holders and initial baselines retain behaviour', () => {
  assert.deepEqual(compareSnapshot(undefined, snapshot([entry])), []);
  assert.equal(compareSnapshot(snapshot([entry]), snapshot([{ ...entry, name: 'New Player', id: 'new-player' }]))[0].type, 'new-entry');
  assert.deepEqual(compareSnapshot(snapshot([entry]), snapshot([{ ...entry, rank: 1 }])).map(s => s.type), ['rank-movement', 'record-holder']);
});
test('Season team/label metadata is ignored but different seasons remain different records', () => {
  const season = { ...entry, years: '2025' };
  assert.deepEqual(compareSnapshot(snapshot([season], { period: 'season' }), snapshot([{ ...season, id: 'new-id', context: 'Renamed Team', years: '2025 season' }], { period: 'season' })), []);
  assert.equal(compareSnapshot(snapshot([season], { period: 'season' }), snapshot([{ ...season, id: '2026-id', years: '2026' }], { period: 'season' }))[0].type, 'new-entry');
});
test('Separate dated/undated games and duplicate historical seasons are not merged', () => {
  for (const period of ['single-game', 'season']) {
    const a = { ...entry, id: 'a', years: period === 'season' ? '2025' : 'Oct. 1, 2025' };
    const b = { ...a, id: 'b', context: 'Other opponent', years: period === 'season' ? '2024' : 'Oct. 8, 2025', rank: 8 };
    assert.deepEqual(compareSnapshot(snapshot([a, b], { period }), snapshot([a, b], { period })), []);
  }
  const a = { ...entry, id: 'a', years: '' };
  const b = { ...a, id: 'b', context: 'Other opponent', rank: 8 };
  assert.deepEqual(compareSnapshot(snapshot([a, b], { period: 'single-game' }), snapshot([a, b], { period: 'single-game' })), []);
  assert.deepEqual(compareSnapshot(snapshot([entry, { ...entry, id: 'b', rank: 8 }], { period: 'season' }), snapshot([entry, { ...entry, id: 'b', rank: 8 }], { period: 'season' })), []);
});
test('Missing/equal previous ranks never claim a rise', () => {
  assert.equal(allTimeMovementDetail({ player: 'Player', currentRank: 5 }), 'Player is ranked #5 all-time.');
  assert.equal(allTimeMovementDetail({ player: 'Player', previousRank: 5, currentRank: 5 }), 'Player is ranked #5 all-time.');
});

const mahomes = snapshot([5312, 5109].map((value, index) => ({
  id: 'CFB:individual:season:total-offense-yards:patrick-mahomes-texas-tech-2016',
  name: 'Patrick Mahomes', context: 'Texas Tech', years: '2016',
  value, rank: index === 0 ? 10 : 23, isActive: false,
})), { id: 'CFB:individual:season:total-offense-yards', league: 'CFB', period: 'season', category: 'total-offense-yards' });

test('Actual Mahomes duplicate-ID fixture generates no signals unchanged or reordered', () => {
  const original = structuredClone(mahomes);
  assert.deepEqual(compareSnapshot(mahomes, structuredClone(mahomes)), []);
  assert.deepEqual(compareSnapshot(mahomes, { ...mahomes, entries: [...mahomes.entries].reverse() }), []);
  assert.deepEqual(mahomes, original);
});
test('Repeated unchanged comparisons at different refresh timestamps generate zero signals', () => {
  let previous = mahomes;
  for (const checkedAt of ['2026-10-11T02:00:00Z', '2026-10-11T03:00:00Z']) {
    const next = { ...structuredClone(mahomes), checkedAt };
    assert.deepEqual(compareSnapshot(previous, next), []);
    previous = next;
  }
});
test('Distinct totals establish genuine duplicate-ID historical movement one-to-one', () => {
  const current = { ...mahomes, entries: mahomes.entries.map(e => ({ ...e, rank: e.rank - 1 })) };
  assert.deepEqual(compareSnapshot(mahomes, current).map(s => [s.previousRank, s.currentRank]), [[10, 9], [23, 22]]);
});
test('Ambiguous duplicate identities suppress unsupported movement and new-entry claims', () => {
  const ambiguous = { ...mahomes, entries: mahomes.entries.map(e => ({ ...e, value: 5312 })) };
  assert.deepEqual(compareSnapshot(ambiguous, { ...ambiguous, entries: ambiguous.entries.map(e => ({ ...e, rank: e.rank - 1 })) }), []);
  const changed = { ...mahomes, entries: mahomes.entries.map(e => ({ ...e, value: e.value + 1, rank: e.rank - 1 })) };
  assert.deepEqual(compareSnapshot(mahomes, changed), []);
  // A single old row cannot be guessed as the baseline for two colliding rows.
  assert.deepEqual(compareSnapshot({ ...ambiguous, entries: ambiguous.entries.slice(0, 1) }, ambiguous), []);
});
