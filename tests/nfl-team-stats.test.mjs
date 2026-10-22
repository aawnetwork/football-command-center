import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const helperUrl=compile(await readFile(new URL('../app/lib/nfl-weekly-team-stats.ts',import.meta.url),'utf8'));
const seasonUrl=compile((await readFile(new URL('../app/lib/nfl-season-team-stats.ts',import.meta.url),'utf8')).replace("'./nfl-weekly-team-stats'",JSON.stringify(helperUrl)));
const {projectWeeklyTeams,weeklyTeamValue,teamNumber,unavailableTeam}=await import(helperUrl);
const fixture=JSON.parse(await readFile(new URL('./fixtures/nfl-team-boxscore.json',import.meta.url),'utf8'));
const project=input=>projectWeeklyTeams(input,2,fixture.observedAt);

test('retained team boxscore uses net passing and official totals, opponents establish yards allowed, sacks remain supported',()=>{
 const rows=project(fixture),dal=rows.find(r=>r.team==='DAL'),was=rows.find(r=>r.team==='WAS');
 assert.equal(dal.total_yards,332);assert.equal(dal.passing_yards,266);assert.equal(dal.rushing_yards,66);assert.equal(dal.def_total_yards,389);assert.equal(was.def_total_yards,332);
 assert.equal(was.def_sacks,2);assert.equal(dal.def_sacks,0);assert.equal(dal.points,37);assert.equal(dal.def_points,20);
 assert.equal(weeklyTeamValue(dal,'total-offense'),332);assert.notEqual(dal.total_yards,279+66,'gross player passing plus rushing is not team net offense');
});
test('explicit zero survives; missing/null/invalid fields cannot become tackles or fabricated totals',()=>{
 for(const invalid of [null,undefined,'',' ',false,'—','12 yards','1,2','NaN',NaN,Infinity,{}])assert.equal(teamNumber(invalid),null);
 assert.equal(teamNumber('0'),0);assert.equal(teamNumber('-4'),-4);
 const source=structuredClone(fixture);for(const t of source.summaries[0].boxscore.teams)for(const stat of t.statistics)stat.displayValue='0';
 assert.ok(project(source).every(row=>weeklyTeamValue(row,'total-defense')===0));
 for(const invalid of [null,'',undefined,'invalid']){
  const broken=structuredClone(fixture);broken.summaries[0].boxscore.teams[0].statistics.find(s=>s.name==='totalYards').displayValue=invalid;
  const row=project(broken).find(r=>r.team==='WAS');assert.equal(row.total_yards,null);assert.equal(weeklyTeamValue(row,'total-offense'),null);
 }
 assert.equal(weeklyTeamValue({team_stat_source:'espn-team-boxscore',def_tackles_solo:50},'total-defense'),null);
 const missing=structuredClone(fixture);missing.summaries[0].boxscore.teams[0].statistics=missing.summaries[0].boxscore.teams[0].statistics.filter(s=>s.name!=='totalYards');
 assert.equal(project(missing).find(r=>r.team==='WAS').total_yards,null,'do not derive even when passing/rushing components exist');
 assert.equal(weeklyTeamValue({team:'DAL',passing_yards:999,rushing_yards:999},'total-offense'),null,'legacy player sums are not verified team fields');
});
test('identity, period, incomplete sources, contradictions and source age fail safely',()=>{
 for(const change of [s=>s.scoreboard.season.year=2025,s=>s.summaries[0].header.id='wrong',s=>s.summaries[0].header.week=3,s=>s.summaries[0].header.season.year=2025,s=>s.summaries[0].boxscore.teams[1].team.id='99',s=>s.summaries[0]=null,s=>s.scoreboard.events.push(s.scoreboard.events[0]),s=>s.observedAt-=60001,s=>s.observedAt+=1]){
  const bad=structuredClone(fixture);change(bad);assert.ok(project(bad).every(row=>weeklyTeamValue(row,'total-offense')===null));
 }
 const bad=structuredClone(fixture);bad.summaries[0].boxscore.teams[0].statistics.find(s=>s.name==='totalYards').displayValue='999';assert.equal(project(bad).find(r=>r.team==='WAS').total_yards,null);
 assert.deepEqual(projectWeeklyTeams(fixture,1,fixture.observedAt),[]);
});
const page=await readFile(new URL('../app/nfl/page.tsx',import.meta.url),'utf8');
const getters=ts.transpileModule(page.slice(page.indexOf('  function getTeamStatValue('),page.indexOf('  function getTeamStatLabel()')),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const get=new Function('statsMode','teamStatCategory','team','weeklyTeamValue',getters+';return getTeamStatValue(team);');
test('actual weekly UI getter and sorting keep unavailable rows unranked and preserve supported zero and order',()=>{
 const input=[unavailableTeam('MIA'),...project(fixture)];
 const begin=page.indexOf('  const sortedTeamStats ='),end=page.indexOf('  const filteredPerformances =');
 const source=ts.transpileModule(page.slice(begin,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const run=new Function('teamStats','statsMode','teamStatCategory','statsView','getTeamStatValue','getTeamName','teamLogo',source+';return statsLeaderboardRows;');
 for(const cat of ['total-offense','total-defense','sacks']){
  const rows=run(input,'weekly',cat,'teams',team=>get('weekly',cat,team,weeklyTeamValue),team=>team.team,()=>undefined);
  assert.equal(rows.at(-1).name,'MIA');assert.equal(rows.at(-1).rank,null);assert.equal(rows.at(-1).value,'—');assert.equal(rows[0].rank,1);
  assert.equal(rows[0].name,'WAS');
 }
 assert.ok(Number.isNaN(get('weekly','total-defense',{def_tackles_solo:'50'},weeklyTeamValue)));
 assert.equal(get('weekly','total-defense',{team_stat_source:'espn-team-boxscore',def_total_yards:0},weeklyTeamValue),0);
});
test('shared table renders dash only for explicit unavailable rank; existing Player Stats numbering is unchanged',async()=>{
 const url=new URL('../app/features/stats/StatsLeaderboardTable.tsx',import.meta.url),componentModule={exports:{}};
 const js=ts.transpileModule(await readFile(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const require=createRequire(url);new Function('require','module','exports',js)(name=>name.includes('TeamLogo')?{TeamLogo:()=>null}:require(name),componentModule,componentModule.exports);
 const {StatsLeaderboardTable}=componentModule.exports;
 const html=renderToStaticMarkup(createElement(StatsLeaderboardTable,{title:'Teams',subtitle:'Week 2',rows:[{id:'1',name:'Unknown',value:'—',rank:null}]}));assert.match(html,/>—<\/td>/);assert.doesNotMatch(html,/>1<\/td>/);
 const player=renderToStaticMarkup(createElement(StatsLeaderboardTable,{title:'Players',subtitle:'Week 2',showTeam:true,rows:[{id:'1',name:'Player',value:'10'}]}));assert.match(player,/>1<\/td>/);
});
test('current team route makes one shared live load, no player CSV or per-team downloads; invalid/failed sources stay honest',async()=>{
 let calls=0,fail=false;globalThis.__teamFinishLive=async()=>{calls++;if(fail)throw Error('offline');return {...fixture,observedAt:Date.now()};};
 try{
  let source=await readFile(new URL('../app/api/nfl/team-stats/route.ts',import.meta.url),'utf8');
  source=source.replace('import { NextResponse } from "next/server";','const NextResponse={json:Response.json};').replace('import { loadNflLiveSource } from "../live-stats";','const loadNflLiveSource=globalThis.__teamFinishLive;').replace('"../../../lib/nfl-weekly-team-stats"',JSON.stringify(helperUrl)).replace('import { retainedNflTeams } from "../../../lib/retained-team-stats";','const retainedNflTeams=()=>null;');
  const route=await import(compile(source)),response=await route.GET(new Request('http://fixture/'));
  assert.equal(response.status,200);const body=await response.json();assert.equal(calls,1);assert.equal(body.stats.find(r=>r.team==='DAL').total_yards,332);
  assert.equal((await route.GET(new Request('http://fixture/?week=0'))).status,400);assert.equal(calls,1);
  fail=true;assert.equal((await route.GET(new Request('http://fixture/'))).status,503);
 }finally{delete globalThis.__teamFinishLive;}
});
