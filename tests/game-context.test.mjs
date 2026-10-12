import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGameContext, assessGameContext, supersedeGameContext, validateSeasonEnd, contextSelection } from '../app/lib/game-context.ts';
const checked = '2026-10-12T12:00:00.000Z';
const scheduled = { state: 'pre', name: 'STATUS_SCHEDULED', completed: false };
const live = { state: 'in', name: 'STATUS_IN_PROGRESS', completed: false };
const final = { state: 'post', name: 'STATUS_FINAL', completed: true };
const event = { id: '401872994', date: '2026-10-13T00:15Z', season: { year: 2026, type: 2 }, week: { number: 5 }, competitions: [{ status: { type: scheduled }, competitors: [{ homeAway: 'home', team: { id: '1' } }, { homeAway: 'away', team: { id: '2' } }] }] };
const normalize = (e = event, selection = { seasonType: 2 }, at = checked, league = 'NFL', feed = {}) => normalizeGameContext(league, e, feed, selection, at);
const withStatus = (status) => ({ ...event, date: status.state === 'pre' ? event.date : '2026-10-12T11:00Z', competitions: [{ ...event.competitions[0], status: { type: status } }] });
test('Regular season identity and scope come from feed, not January/calendar time or requested year', () => {
  const value = normalize();
  assert.equal(value.identity, 'NFL:2026:401872994');
  assert.equal(value.verified, true);
  assert.equal(value.regularWeek, 5);
  assert.equal(value.kickoffAt, '2026-10-13T00:15:00.000Z');
  assert.equal(value.sourceUpdatedAt, null);
  assert.equal(normalize({}, { seasonType: 2, season: 2026 }).season, null);
});
test('CFB 2026 Week 0 is preserved without changing event identity', () => {
  const early = { ...event, date: '2026-08-29T12:00Z', week: { number: 1 } };
  const c = normalize(early, { seasonType: 2, week: 0 }, '2026-08-28T12:00:00.000Z', 'CFB');
  assert.equal(c.regularWeek, 0);
  assert.equal(c.verified, true);
});
test('NFL postseason uses source round metadata, never an ordinary week or inferred round label', () => {
  const e = { ...withStatus(final), date: '2026-02-08T23:30Z', season: { year: 2025, type: 3 }, week: { number: 5 } };
  const c = normalize(e, { seasonType: 3, season: 2025 }, checked);
  assert.equal(c.verified, true);
  assert.equal(c.season, 2025);
  assert.equal(c.regularWeek, null);
  assert.deepEqual(c.postseasonRound, { sourceNumber: 5, label: null });
});
test('CFB conference championship, bowl and playoff labels come from explicit feed notes', () => {
  for (const [label, type, kind] of [['SEC Championship',2,'conference-championship'],['Peach Bowl',3,'bowl'],['College Football Playoff National Championship',3,'playoff']]) {
    const e = { ...event, season: { year: 2026, type }, competitions: [{ ...event.competitions[0], notes: [{ type: 'event', headline: label }] }] };
    const c = normalize(e, { seasonType: type }, checked, 'CFB');
    assert.equal(c.competitionKind, kind);
    assert.equal(c.verified, true);
    if (type === 3) assert.equal(c.regularWeek, null);
  }
});
test('Rescheduling changes kickoff/week metadata but keeps canonical identity; older snapshots cannot supersede', () => {
  const previous = normalize();
  const next = normalize({ ...event, date: '2026-10-20T00:15Z', week: { number: 6 } }, { seasonType: 2 }, '2026-10-12T12:00:30.000Z');
  assert.equal(next.identity, previous.identity);
  assert.deepEqual(supersedeGameContext(previous,next).changes, ['kickoffAt','regularWeek']);
  assert.equal(supersedeGameContext(next,previous).context, next);
  assert.throws(() => supersedeGameContext(previous, { ...next, identity: 'other' }));
  assert.throws(() => supersedeGameContext(previous, { ...next, sourceCheckedAt: 'invalid' }));
});
test('Scheduled/live/final transitions verify; halftime remains live; postponed/cancelled/suspended cannot measure', () => {
  for (const [type,state] of [[scheduled,'scheduled'],[live,'live'],[final,'completed'],[{ ...live, name:'STATUS_HALFTIME' },'live'],[{ ...scheduled,name:'STATUS_POSTPONED' },'postponed'],[{ ...scheduled,name:'STATUS_CANCELED' },'cancelled']]) {
    const c = normalize(withStatus(type));
    assert.equal(c.status,state);
    assert.equal(assessGameContext(c,checked).usable, ['scheduled','live','completed'].includes(state));
  }
  assert.equal(normalize(withStatus({ ...live,name:'STATUS_SUSPENDED' })).status, 'uncertain');
});
test('Missing, contradictory, mismatched or stale context is never usable; upstream freshness remains unknown', () => {
  const cases = [
    { ...event, season: undefined }, { ...event,date:undefined }, { ...event,id:'bad' },
    { ...event,status:{ type:final } }, { ...event,competitions:[] },
    { ...event,date:'2030-01-01T12:00Z' },
    { ...event,season:{ year:2025,type:2 } }, { ...event,season:{ year:2026,type:3 } },
  ];
  for (const e of cases) assert.equal(assessGameContext(normalize(e,{ seasonType:2,season:2026 }),checked).usable,false);
  assert.equal(normalize(event,{ seasonType:2 },checked,'NFL',{ season:{year:2025,type:2} }).verified,false);
  assert.equal(assessGameContext(normalize(),'2026-10-12T12:01:01.000Z').stale,true);
  assert.equal(assessGameContext(normalize(),'2026-10-13T00:16:00.000Z',86400000).usable,false);
  assert.equal(assessGameContext(normalize(),checked).upstreamFreshness,'unknown');
});
test('Selections validate types/week zero/duplicates; no season inferred from current date', () => {
  assert.deepEqual(contextSelection(new URLSearchParams(), 'NFL'), { seasonType:2 });
  assert.deepEqual(contextSelection(new URLSearchParams('season=2025&seasontype=3&week=1'), 'NFL'), { season:2025,seasonType:3,week:1 });
  for (const q of ['seasontype=1','week=0','season=bad','season=2025&season=2026']) assert.throws(()=>contextSelection(new URLSearchParams(q),'NFL'));
  assert.throws(()=>contextSelection(new URLSearchParams('season=2025&week=0'),'CFB'));
});
test('Season end is explicit postseason-complete confirmation, with exact 90-day UTC expiry', () => {
  const end = { league:'NFL',season:2025,endedAt:'2026-02-09T03:00:00Z',confirmedAt:'2026-02-10T12:00:00Z',postseasonComplete:true,source:'administrator',reference:'Confirmed final official game' };
  assert.equal(validateSeasonEnd(end,checked).expiresAt,'2026-05-10T03:00:00.000Z');
  for (const patch of [{postseasonComplete:false},{reference:''},{confirmedAt:'2027-01-01T00:00:00Z'},{season:2026}]) assert.throws(()=>validateSeasonEnd({...end,...patch},checked));
});
