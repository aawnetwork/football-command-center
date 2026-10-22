import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const membership=JSON.parse(await readFile(new URL('../app/lib/cfb-team-membership-2026.json',import.meta.url),'utf8'));
const jsonUrl='data:text/javascript;base64,'+Buffer.from('export default '+JSON.stringify(membership)).toString('base64');
const helperUrl=compile((await readFile(new URL('../app/lib/cfb-weekly-team-stats.ts',import.meta.url),'utf8')).replace("'./cfb-team-membership-2026.json'",JSON.stringify(jsonUrl)));
const {projectCfbWeeklyTeams,cfbTeamNumber,cfbWeeklyTeamLeaders,cfbWeeklyTeamCoverage}=await import(helperUrl);
const now=Date.parse('2026-10-21T18:00Z');
function fixture(week=7,opponent='130'){
 const competition={id:'101',status:{type:{state:'post',completed:true}},competitors:[{homeAway:'home',team:{id:'194',displayName:'Wrong display name'}},{homeAway:'away',team:{id:opponent,displayName:'Opponent'}}]};
 const stats=(yards,pass,rush)=>[{name:'totalYards',displayValue:yards},{name:'netPassingYards',displayValue:pass},{name:'rushingYards',displayValue:rush}];
 const summary={header:{id:'101',season:{year:2026,type:2},week,competitions:[competition]},boxscore:{teams:[{team:{id:'194'},statistics:stats('100','100','0')},{team:{id:opponent},statistics:stats('100','80','20')}],players:[{team:{id:'194'},statistics:[{name:'defensive',labels:['TOT','SACKS'],totals:['0','0'],athletes:[{stats:['999','99']}]}]},{team:{id:opponent},statistics:[{name:'defensive',labels:['TOT','SACKS'],totals:['20','2']}]}]}};
 return {board:{season:{year:2026,type:2},week:{number:week},events:[{id:'101',date:'2026-10-17T18:00Z',season:{year:2026,type:2},week:{number:week},competitions:[competition]}]},summary};
}
const model=(f=fixture())=>projectCfbWeeklyTeams(f.board,[f.summary],f.board.week.number,now);
test('explicit team values, genuine zeros and tackles retain their exact meanings without player reconstruction',()=>{
 const data=model();assert.equal(cfbWeeklyTeamLeaders(data,'rushing-offense').find(r=>r.playerId.endsWith(':194')).value,0);
 assert.equal(cfbWeeklyTeamLeaders(data,'total-defense').find(r=>r.playerId.endsWith(':194')).value,0);
 assert.equal(cfbWeeklyTeamLeaders(data,'total-offense').find(r=>r.playerId.endsWith(':194')).value,100);
 assert.ok(cfbWeeklyTeamLeaders(data,'total-offense').every(r=>r.team!=='Wrong display name'),'identity comes from exact retained team ID');
 for(const value of [null,undefined,'',' ','—','n/a','1,2',true,NaN,Infinity,{},'12 yards'])assert.equal(cfbTeamNumber(value),null);
 assert.equal(cfbTeamNumber('0'),0);assert.equal(cfbTeamNumber('-2'),-2);
 for(const value of [null,undefined,'','invalid']){const f=fixture();f.summary.boxscore.teams[0].statistics[0].displayValue=value;assert.equal(cfbWeeklyTeamLeaders(model(f),'total-offense').some(r=>r.playerId.endsWith(':194')),false);}
 const f=fixture();f.summary.boxscore.players[0].statistics[0].totals=[];assert.equal(cfbWeeklyTeamLeaders(model(f),'total-defense').some(r=>r.playerId.endsWith(':194')),false);
});
test('exact FBS membership excludes FCS and unknown teams while retaining an FBS appearance against them',()=>{
 const fcs=Object.entries(membership.teams).find(([,v])=>!v.fbs)[0];
 for(const id of [fcs,'99999999']){const data=model(fixture(7,id));assert.equal(data.rows.length,1);assert.equal(data.rows[0].teamId,'espn:cfb:team:194');assert.equal(cfbWeeklyTeamLeaders(data,'total-offense').length,1);assert.equal(id===fcs?data.excludedNonFbs:data.unverifiedTeams,1);}
 assert.equal(Object.values(membership.teams).filter(t=>t.fbs).length,138);
 const coverage=cfbWeeklyTeamCoverage(model(),'total-defense');assert.match(coverage,/2\/2 FBS teams/);assert.match(coverage,/reported values only/);assert.match(coverage,/coverage is unverified/);
});
test('missing source lines, conflicting identities/periods and duplicate games never establish zero observations',()=>{
 for(const change of [f=>f.summary.header.id='bad',f=>f.summary.header.week=8,f=>f.summary.header.season.year=2025,f=>f.summary.boxscore.teams[1].team.id='99',f=>f.summary.boxscore.teams[0].statistics.push(f.summary.boxscore.teams[0].statistics[0])]){
  const f=fixture();change(f);const data=model(f);assert.equal(cfbWeeklyTeamLeaders(data,'total-offense').some(r=>r.playerId.endsWith(':194')),false);
 }
 const f=fixture();f.board.events.push(f.board.events[0]);const duplicate=projectCfbWeeklyTeams(f.board,[f.summary,f.summary],7,now);assert.equal(cfbWeeklyTeamLeaders(duplicate,'total-offense').length,0);
 assert.throws(()=>projectCfbWeeklyTeams({...fixture().board,season:{year:2025,type:2}},[],7,now));
 assert.throws(()=>projectCfbWeeklyTeams(fixture().board,[],8,now));
 const empty=projectCfbWeeklyTeams(fixture().board,[null],7,now);assert.equal(cfbWeeklyTeamLeaders(empty,'total-offense').length,0);assert.match(cfbWeeklyTeamCoverage(empty,'total-offense'),/0\/2/);
});
test('weekly aggregation, descending ties and the actual team-only rank expression are consistent',async()=>{
 const data=model(),leaders=cfbWeeklyTeamLeaders(data,'total-offense');assert.equal(leaders.length,2);assert.ok(leaders.every(r=>r.value===100));
 const page=await readFile(new URL('../app/cfb/page.tsx',import.meta.url),'utf8');assert.match(page,/statsMode === "weekly" && statsView === "team" && "rank" in leader/);
 assert.deepEqual(leaders.map(leader=>leader.rank),[1,1]);
 const third={...data.rows[0],teamId:'espn:cfb:team:other',team:'Third',values:{...data.rows[0].values,'total-offense':50}};assert.deepEqual(cfbWeeklyTeamLeaders({...data,rows:[...data.rows,third]},'total-offense').map(row=>row.rank),[1,1,3]);
 const later={...data.rows[0],gameId:'espn:cfb:game:102',values:{...data.rows[0].values,'total-offense':50}};
 assert.equal(cfbWeeklyTeamLeaders({...data,rows:[...data.rows,later]},'total-offense')[0].value,150);
 assert.equal(cfbWeeklyTeamLeaders({...data,rows:[...data.rows,{...later,values:{...later.values,'total-offense':null}}]},'total-offense').some(r=>r.playerId===later.teamId),false);
 assert.equal(cfbWeeklyTeamLeaders({...data,rows:[data.rows[0],data.rows[0]]},'total-offense').length,0);
});
test('actual Team Stats effect keeps Current Week automatic, numbered weeks fixed and late responses cancelled',async()=>{
 const page=await readFile(new URL('../app/cfb/page.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
 function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.getText(ast).includes('function refreshTeams'))callback=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(callback);
 const js=ts.transpileModule(`export function run(env){const {teamWeekly,teamWeek,queueMicrotask,setWeeklyTeams,setTeamWeeklyError,fetch,setTeamWeeklyCheck,recordDataCheck,setInterval,clearInterval}=env;return (${callback})();}`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {run}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 for(const selected of [null,7]){
  const calls=[],results=[],timers=new Map();let current=8;
  const env={teamWeekly:true,teamWeek:selected,queueMicrotask:run=>run(),setWeeklyTeams:data=>results.push(data),setTeamWeeklyError(){},fetch:async url=>{calls.push(url);return Response.json({week:selected??current});},setTeamWeeklyCheck(){},recordDataCheck(){},setInterval(fn,ms){assert.equal(ms,30000);timers.set(1,fn);return 1;},clearInterval(id){timers.delete(id);}};
  const stop=run(env);await new Promise(setImmediate);current=9;await timers.get(1)();await new Promise(setImmediate);
  assert.deepEqual(results.filter(Boolean).map(r=>r.week),selected===null?[8,9]:[7,7]);assert.ok(calls.every(url=>selected===null?!url.includes('week='):url.includes('week=7')));
  stop();assert.equal(timers.size,0);
  let release;results.length=0;
  const cancel=run({...env,fetch:()=>new Promise(resolve=>{release=resolve;})});cancel();release(Response.json({week:10}));await new Promise(setImmediate);assert.equal(results.filter(Boolean).length,0,'a cancelled old selection cannot replace the current team data');
 }
 const teamEffect=callback;assert.doesNotMatch(teamEffect,/\b(?:setSelectedWeek|setTeamWeek|setPlayerStats|setSeasonStats)\s*\(/);
});
test('additive team API uses existing retrieval, exact team view isolation and no history reads',async()=>{
 const f=fixture();let calls=0;const original=globalThis.fetch;
 const source=(await readFile(new URL('../app/api/player-stats/route.ts',import.meta.url),'utf8'))
  .replace("import {indexCfbHistory,loadCfbPreviousHighs,seasonHighEligible} from '../../lib/cfb-history';",'const loadCfbPreviousHighs=()=>{throw Error("team view must not load player history");};')
  .replace('import { NextResponse } from "next/server";','const NextResponse={json:Response.json};')
  .replace('import { createCfbPlayerStatsFlights } from "../../lib/cfb-player-stats-flight";','const createCfbPlayerStatsFlights=()=>((_request,load)=>load());')
  .replace('import { isTeamPlaying } from "../../lib/gameday-status";','')
  .replace('await import("../../lib/cfb-weekly-team-stats")',`await import(${JSON.stringify(helperUrl)})`);
 globalThis.fetch=async input=>{calls++;const url=new URL(String(input));if(url.pathname.endsWith('/scoreboard')){assert.equal(url.searchParams.get('limit'),'100');return Response.json(f.board);}return Response.json(f.summary);};
 try{const {GET}=await import(compile(source));const result=await GET(new Request('http://fixture/?view=teams'));assert.equal(result.status,200);const data=await result.json();assert.equal(data.week,7);assert.equal(data.rows.length,2);assert.equal(calls,2);assert.equal((await GET(new Request('http://fixture/?view=teams&week=0'))).status,400);}finally{globalThis.fetch=original;}
});
test('teams yet to play are identified separately from missing completed-game observations',()=>{
 const f=fixture();f.board.events[0].competitions[0].status.type={state:'pre',completed:false};
 const data=projectCfbWeeklyTeams(f.board,[null],7,now);
 assert.equal(data.pendingTeams.length,2);assert.equal(data.completedTeams.length,0);
 assert.ok(data.rows.every(row=>Object.values(row.values).every(v=>v===null)));
 assert.ok(data.rows.every(row=>data.pendingTeams.includes(row.teamId)));
});
test('allowed statistics use exact opponent team fields and final score, with ascending ties and distinct tackles',()=>{
 const f=fixture();f.summary.header.competitions[0].competitors[0].score='14';f.summary.header.competitions[0].competitors[1].score='0';
 const data=model(f),ohio=data.rows.find(r=>r.teamId.endsWith(':194'));
 assert.equal(ohio.values['yards-allowed'],100);assert.equal(ohio.values['passing-defense'],80);assert.equal(ohio.values['rushing-defense'],20);assert.equal(ohio.values['scoring-defense'],0);
 assert.equal(ohio.values['total-defense'],0,'tackles remain a separate source metric');
 assert.deepEqual(cfbWeeklyTeamLeaders(data,'yards-allowed').map(r=>r.rank),[1,1]);assert.equal(cfbWeeklyTeamLeaders(data,'scoring-defense')[0].playerId,ohio.teamId);
});
test('opponent missing, invalid or contradictory fields never become zero or reconstructed yards',()=>{
 for(const bad of [null,undefined,'','invalid']){
  const f=fixture();f.summary.boxscore.teams[1].statistics.find(s=>s.name==='totalYards').displayValue=bad;
  assert.equal(model(f).rows.find(r=>r.teamId.endsWith(':194')).values['yards-allowed'],null);
 }
 const f=fixture();f.summary.boxscore.teams[1].statistics.find(s=>s.name==='totalYards').displayValue='999';assert.equal(model(f).rows.find(r=>r.teamId.endsWith(':194')).values['yards-allowed'],null);
 const absent=fixture();absent.summary.boxscore.teams.pop();const row=model(absent).rows.find(r=>r.teamId.endsWith(':194'));for(const id of ['yards-allowed','passing-defense','rushing-defense'])assert.equal(row.values[id],null);
 const zero=fixture();for(const s of zero.summary.boxscore.teams[1].statistics)s.displayValue='0';assert.equal(model(zero).rows.find(r=>r.teamId.endsWith(':194')).values['yards-allowed'],0);
});
test('FBS teams retain opponent allowances against FCS teams; unfinished games do not supply final allowances',()=>{
 const f=fixture(7,'2775');f.summary.header.competitions[0].competitors[1].score='7';const data=model(f);assert.equal(data.rows.length,1);assert.equal(data.rows[0].values['yards-allowed'],100);assert.equal(data.rows[0].values['scoring-defense'],7);
 const live=fixture();live.board.events[0].competitions[0].status.type={state:'in',completed:false};const row=model(live).rows[0];for(const key of ['yards-allowed','passing-defense','rushing-defense','scoring-defense'])assert.equal(row.values[key],null);
});
