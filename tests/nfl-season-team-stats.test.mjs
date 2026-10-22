import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const weekly=compile(await readFile(new URL('../app/lib/nfl-weekly-team-stats.ts',import.meta.url),'utf8'));
const helper=compile((await readFile(new URL('../app/lib/nfl-season-team-stats.ts',import.meta.url),'utf8')).replace("'./nfl-weekly-team-stats'",JSON.stringify(weekly)));
const {projectSeasonTeams,seasonTeamValue,seasonTeamCoverage,seasonTeamCategories}=await import(helper);
// Synthetic field-contract records, not evidence of actual 2026 source coverage.
const row=(team='DAL',patch={})=>({team,season:'2026',season_type:'REG',passing_yards:'100',rushing_yards:'20',def_sacks:'0.5',...patch});
const value=(patch,category)=>seasonTeamValue(projectSeasonTeams([row('DAL',patch)]).stats[0],category);
test('three directly supported count fields are totals, not per-game averages or net passing',()=>{
 assert.equal(Object.keys(seasonTeamCategories).length,10);assert.equal(value({games:'4'},'passing-offense'),100);assert.equal(value({games:'4'},'rushing-offense'),20);assert.equal(value({},'sacks'),.5);assert.match(seasonTeamCategories['passing-offense'].meaning,/gross.*before sack/);
});
test('all seven unverified categories remain unavailable even with tempting fallback fields',()=>{
 const tempting={total_yards:'900',def_total_yards:'800',def_passing_yards:'600',def_rushing_yards:'200',def_tackles_solo:'60',def_tackle_assists:'30',points:'0',def_points:'0',passing_tds:'5',def_interceptions:'2',fumble_recovery_opp:'1',passing_interceptions:'0',fumbles_lost_total:'0'};
 for(const category of Object.keys(seasonTeamCategories).filter(c=>!['passing-offense','rushing-offense','sacks'].includes(c)))assert.equal(value(tempting,category),null,category);
});
test('genuine zero survives; empty, null, absent and malformed values never become zero',()=>{
 for(const field of ['passing_yards','rushing_yards','def_sacks']){
  const cat={passing_yards:'passing-offense',rushing_yards:'rushing-offense',def_sacks:'sacks'}[field];assert.equal(value({[field]:'0'},cat),0);
  for(const invalid of [null,undefined,'',' ','NA','1 yard','NaN','Infinity',false])assert.equal(value({[field]:invalid},cat),null);
 }
 assert.equal(value({def_sacks:'-1'},'sacks'),null);assert.equal(value({def_sacks:'.3'},'sacks'),null);
});
test('explicit season and phase are required; game/week rows never masquerade as season totals',()=>{
 for(const patch of [{season:'2025'},{season_type:'POST'},{season:undefined},{season_type:undefined},{week:'7'},{game_id:'2026_07_DAL_WAS'}])assert.equal(value(patch,'rushing-offense'),null);
});
test('exact team aliases, duplicates and unknown identities fail safely',()=>{
 const p=projectSeasonTeams([row('WSH'),row('WAS'),row('LA'),row('FAKE')]);assert.deepEqual(p.stats.map(r=>r.team),['WAS','LAR']);assert.equal(seasonTeamValue(p.stats[0],'sacks'),null);assert.equal(seasonTeamValue(p.stats[1],'sacks'),.5);assert.match(p.coverage,/2 duplicate or unrecognised/);
});
const page=await readFile(new URL('../app/nfl/page.tsx',import.meta.url),'utf8');
const getter=ts.transpileModule(page.slice(page.indexOf('  function getTeamStatValue('),page.indexOf('  function getTeamStatLabel()')),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const get=new Function('statsMode','teamStatCategory','team','weeklyTeamValue','seasonTeamValue',getter+';return getTeamStatValue(team);');
const fragment=page.slice(page.indexOf('  const sortedTeamStats ='),page.indexOf('  const filteredPerformances ='));
const render=new Function('teamStats','statsMode','teamStatCategory','statsView','getTeamStatValue','getTeamName','teamLogo',ts.transpileModule(fragment,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return statsLeaderboardRows;');
test('actual UI shows all 32 recognised teams, competition ties, true zero and missing ranks',()=>{
 const codes='ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WAS'.split(' ');
 const teams=projectSeasonTeams(codes.map((code,i)=>row(code,{passing_yards:i<2?'100':i===2?'0':''}))).stats;
 const output=render(teams,'season','passing-offense','teams',team=>get('season','passing-offense',team,()=>null,seasonTeamValue),team=>team.team,()=>undefined);
 assert.equal(output.length,32);assert.equal(output[0].rank,1);assert.equal(output[1].rank,1);assert.equal(output[2].rank,3);assert.equal(output[2].value,'0 yards');assert.ok(output.slice(3).every(r=>r.rank===null&&r.value==='—'));
 const unsupported=render(teams,'season','total-defense','teams',team=>get('season','total-defense',team,()=>null,seasonTeamValue),team=>team.team,()=>undefined);assert.ok(unsupported.every(r=>r.rank===null&&r.value==='—'));
});
test('coverage and labels state reported population, gross semantics and unknown cutoff',()=>{
 const p=projectSeasonTeams([row('DAL',{def_sacks:'0'}),row('MIA',{def_sacks:''})]);assert.match(seasonTeamCoverage(p.stats,'sacks'),/1\/2/);assert.match(seasonTeamCoverage(p.stats,'total-offense'),/0\/2/);assert.match(p.coverage,/2\/32/);assert.match(p.coverage,/cutoff.*unverified/);assert.match(page,/Gross Passing Yards \(Season Total\)/);assert.match(page,/seasonTeamCoverage\(teamStats, teamStatCategory\)/);
});
test('verified team-boxscore season totals support net fields without admitting unverified CSV substitutes',()=>{
 const snapshot={team:'DAL',season:'2026',season_type:'REG',aaw_season_verified:'1',team_stat_source:'espn-team-boxscore-season',total_yards:0,passing_yards:0,def_total_yards:120,def_sacks:2};
 assert.equal(seasonTeamValue(snapshot,'total-offense'),0);assert.equal(seasonTeamValue(snapshot,'total-defense'),120);assert.equal(seasonTeamValue(snapshot,'turnover-margin'),null);
 assert.equal(seasonTeamValue({...snapshot,def_total_yards:null},'total-defense'),null);
 assert.equal(seasonTeamValue({...snapshot,team_stat_source:'unverified'},'total-offense'),null);
});
