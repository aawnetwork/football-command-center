import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTeamLogo, loadTeamDirectory, preferredTeamLogo, standingsEntries } from '../app/lib/team-logos.ts';
import { nflTeamNameByAbbreviation } from '../app/nfl/data/divisions.ts';
const teams = [
  { team: 'Louisville Cardinals', location: 'Louisville', shortName: 'Louisville', abbreviation: 'LOU', logo: 'https://example.com/lou.png' },
  { team: 'Dallas Cowboys', location: 'Dallas', abbreviation: 'DAL', logo: 'https://example.com/dal.png' },
];
test('NFLverse LA and ESPN LAR both resolve to the Rams name and logo, not the Chargers', () => {
  const directory = [
    { team: 'Los Angeles Rams', abbreviation: 'LAR', logo: 'rams.png' },
    { team: 'Los Angeles Chargers', abbreviation: 'LAC', logo: 'chargers.png' },
  ];
  for (const code of ['LA', 'LAR']) {
    assert.equal(nflTeamNameByAbbreviation[code], 'Los Angeles Rams');
    assert.equal(resolveTeamLogo(nflTeamNameByAbbreviation[code], directory), 'rams.png');
  }
  assert.equal(resolveTeamLogo(nflTeamNameByAbbreviation.LAC, directory), 'chargers.png');
});
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
test('State abbreviations resolve and nested Sun Belt entries remain available', () => {
  const nested = { children: [{ standings: { entries: [{ team: 'James Madison Dukes', location: 'James Madison', logo: 'jmu' }] } }] };
  assert.equal(resolveTeamLogo('James Madison', standingsEntries(nested)), 'jmu');
  assert.deepEqual(standingsEntries({ standings: { entries: ['parent'] }, children: [{ standings: { entries: ['duplicate'] } }] }), ['parent']);
  for (const name of ['Boise', 'Iowa', 'Oregon', 'Ohio']) {
    assert.equal(resolveTeamLogo(`${name} St.`, [{ team: `${name} State Team`, location: `${name} State`, logo: name }]), name);
  }
  assert.equal(resolveTeamLogo('St. Francis', [{ team: 'State Francis', logo: 'wrong' }]), undefined);
});
test('Light surfaces use default logos and dark surfaces explicitly retain light variants', () => {
  assert.equal(preferredTeamLogo([{ href: 'normal', rel: ['default'] }, { href: 'light', rel: ['dark'] }]), 'normal');
  assert.equal(preferredTeamLogo([{ href: 'normal', rel: ['default'] }, { href: 'light', rel: ['dark'] }], null, 'dark'), 'light');
  assert.equal(preferredTeamLogo([{ href: 'normal', rel: ['default'] }], null, 'dark'), 'normal');
  assert.equal(preferredTeamLogo([{ href: 'only', rel: ['dark'] }]), 'only');
  assert.equal(resolveTeamLogo('Dallas Cowboys', [{ ...teams[1], darkLogo: 'light' }], 'dark'), 'light');
  assert.equal(resolveTeamLogo('Dallas Cowboys', [{ ...teams[1], darkLogo: 'light' }]), teams[1].logo);
  assert.equal(preferredTeamLogo([{ href: 'normal', rel: ['default'] }]), 'normal');
  assert.equal(preferredTeamLogo([], 'single'), 'single');
  assert.equal(preferredTeamLogo(), null);
});
test('Surface selection preserves provider fallbacks and ambiguity safeguards', () => {
  const variants = [{ href: 'light', rel: ['dark'] }, { href: '', rel: ['default'] }, { href: 'normal', rel: ['default'] }];
  assert.equal(preferredTeamLogo(variants), 'normal');
  assert.equal(preferredTeamLogo(variants, null, 'dark'), 'light');
  assert.equal(preferredTeamLogo([{ href: 'single' }]), 'single');
  assert.equal(preferredTeamLogo([], 'single', 'dark'), 'single');
  assert.equal(resolveTeamLogo('Dallas Cowboys', teams, 'dark'), teams[1].logo);
  assert.equal(resolveTeamLogo('Dallas', [...teams, { team: 'Other', location: 'Dallas', darkLogo: 'other' }], 'dark'), undefined);
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

test('Reported NCAA school names resolve to unique ESPN identities and both logo variants', async () => {
  const { resolveTeam } = await import('../app/lib/team-logos.ts');
  const teams = [
    {id:'30',team:'USC Trojans',location:'USC',shortName:'USC',abbreviation:'USC'},
    {id:'62',team:"Hawai'i Rainbow Warriors",location:"Hawai'i",shortName:"Hawai'i",abbreviation:'HAW'},
    {id:'290',team:'Georgia Southern Eagles',location:'Georgia Southern',shortName:'GA Southern',abbreviation:'GASO'},
    {id:'23',team:'San José State Spartans',location:'San José State',shortName:'San José St',abbreviation:'SJSU'},
    {id:'2199',team:'Eastern Michigan Eagles',location:'Eastern Michigan',shortName:'E Michigan',abbreviation:'EMU'},
    {id:'2579',team:'South Carolina Gamecocks',location:'South Carolina',abbreviation:'SC'},
  ].map(team=>({...team,logo:`https://example.com/${team.id}.png`,darkLogo:`https://example.com/${team.id}-dark.png`}));
  const cases=[['Southern California','30'],['USC','30'],['Hawaii','62'],['Hawaiʻi','62'],['Ga. Southern','290'],['Georgia Southern','290'],['San Jose St.','23'],['San José State','23'],['Eastern Mich.','2199'],['Eastern Mich','2199']];
  for(const [name,id] of cases) {
    assert.equal(resolveTeam(name,teams)?.id,id,name);
    assert.equal(resolveTeamLogo(name,teams),`https://example.com/${id}.png`,name);
    assert.equal(resolveTeamLogo(name,teams,'dark'),`https://example.com/${id}-dark.png`,name);
  }
  assert.equal(resolveTeam('Southern California',[teams[5]]),undefined,'USC must never resolve to South Carolina');
  assert.equal(resolveTeamLogo('Ga. Southern',[...teams,{team:'Other School',location:'Ga. Southern',logo:'wrong'}]),undefined);
  assert.equal(resolveTeamLogo('San Jose',[...teams]),undefined,'partial school names remain unmatched');
});

test('Every current NCAA FBS school resolves uniquely to its ESPN identity for live season updates',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {resolveTeam}=await import('../app/lib/team-logos.ts');
 const {ncaaSchools,espnTeams}=JSON.parse(await readFile(new URL('./fixtures/cfb-season-schools.json',import.meta.url),'utf8'));
 for(const name of ncaaSchools)assert.ok(resolveTeam(name,espnTeams)?.id,name);
 assert.equal(resolveTeam('Miami (FL)',espnTeams)?.id,'2390');
 assert.equal(resolveTeam('Miami (OH)',espnTeams)?.id,'193');
});
