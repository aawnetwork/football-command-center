import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTeamLogo, loadTeamDirectory } from '../app/lib/team-logos.ts';
const teams = [
  { team: 'Louisville Cardinals', location: 'Louisville', shortName: 'Louisville', abbreviation: 'LOU', logo: 'https://example.com/lou.png' },
  { team: 'Dallas Cowboys', location: 'Dallas', abbreviation: 'DAL', logo: 'https://example.com/dal.png' },
];
test('Canonical names and explicit provider aliases resolve for both leagues', () => {
  assert.equal(resolveTeamLogo('Louisville Cardinals', teams), teams[0].logo);
  assert.equal(resolveTeamLogo(' louisville ', teams), teams[0].logo);
  assert.equal(resolveTeamLogo('DAL', teams), teams[1].logo);
});
test('Missing, ambiguous and fuzzy matches never invent logos', () => {
  assert.equal(resolveTeamLogo('Unknown', teams), undefined);
  assert.equal(resolveTeamLogo('', teams), undefined);
  assert.equal(resolveTeamLogo('Cardinals', teams), undefined);
  assert.equal(resolveTeamLogo('Dallas', [...teams, { team: 'Other Team', location: 'Dallas', logo: 'other' }]), undefined);
  assert.equal(resolveTeamLogo('Louisville', [{ ...teams[0], logo: null }]), undefined);
});
test('The logo directory shares concurrent requests and supports retry after failure', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: calls !== 1, json: async () => ({ sections: [{ name: 'Conference', teams }] }) }; };
  try {
    await assert.rejects(loadTeamDirectory('CFB'));
    const [a, b] = await Promise.all([loadTeamDirectory('CFB'), loadTeamDirectory('CFB')]);
    assert.equal(calls, 2);
    assert.equal(a, b);
    assert.equal(resolveTeamLogo('Louisville', a.sections[0].teams), teams[0].logo);
  } finally { globalThis.fetch = original; }
});
