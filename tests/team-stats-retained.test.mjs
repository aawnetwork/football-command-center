import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const file=p=>new URL('../'+p,import.meta.url),read=p=>readFile(file(p),'utf8'),cache=new Map();
async function compile(url){
 if(cache.has(url.href))return cache.get(url.href);
 if(url.pathname.endsWith('.json')){const result='data:text/javascript;base64,'+Buffer.from('export default '+await readFile(url,'utf8')).toString('base64');cache.set(url.href,result);return result;}
 let code=ts.transpileModule(await readFile(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const match of [...code.matchAll(/from (['"])(\.[^'"]+)\1/g)])code=code.replace(match[0],'from '+JSON.stringify(await compile(new URL(match[2]+(/\.(ts|json)$/.test(match[2])?'':'.ts'),url))));
 const result='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(url.href,result);return result;
}
const retained=await import(await compile(file('app/lib/retained-team-stats.ts'))),model=await import(await compile(file('app/features/stats/team-stats-model.ts')));
const history=JSON.parse(await read('app/lib/nfl-team-history-2026.json')),cfb=JSON.parse(await read('app/lib/cfb-team-week7-2026.json')),ncaa=JSON.parse(await read('app/lib/cfb-team-ncaa-retained.json'));
const columns=(league,mode)=>['Offense','Defense','Other'].flatMap(g=>model.teamColumns(league,mode,g,'net'));
test('real retained NFL Weeks 1–6 deliver all 93 final games with exact IDs, hashes, net totals, allowed yards and sacks',()=>{
 assert.deepEqual(history.weeks.map(w=>w.games),[16,16,16,16,15,14]);
 for(const week of history.weeks){
  const body=retained.retainedNflTeams('weekly',week.week);assert.equal(body.stats.length,week.games*2);assert.equal(new Set(body.stats.map(r=>r.team)).size,body.stats.length);
  for(const r of body.stats){assert.equal(r.total_yards,r.passing_yards+r.rushing_yards);assert.equal(r.def_total_yards,r.def_passing_yards+r.def_rushing_yards);assert.ok(r.def_sacks>=0);assert.ok(r.logo?.startsWith('https://a.espncdn.com/'));assert.match(week.sources.find(s=>s.gameId===r.game_id).summarySha256,/^[a-f0-9]{64}$/);}
 }
 const dal=retained.retainedNflTeams('weekly',2).stats.find(r=>r.team==='DAL');assert.equal(dal.total_yards,332);assert.equal(dal.passing_yards,266);assert.equal(dal.rushing_yards,66);assert.equal(dal.def_total_yards,389);assert.equal(dal.def_sacks,0);
 assert.equal(retained.retainedNflTeams('weekly',7),null,'unretained weeks must not borrow another week');
});
test('real Season is explicitly through Week 6; each metric sums only actual team boxscores and includes games played',()=>{
 const body=retained.retainedNflTeams('season',null);assert.equal(body.stats.length,32);assert.match(body.coverage,/through Week 6/);assert.equal(body.passingBasis,'net');
 const data=model.nflTeamData(body,'season','',columns('NFL','season'));
 for(const team of data.rows){const games=history.weeks.flatMap(w=>w.rows.filter(r=>r.team===team.id));assert.equal(team.gamesPlayed,games.length);assert.equal(team.values['total-offense'],games.reduce((n,r)=>n+r.total_yards,0));assert.equal(team.values['total-defense'],games.reduce((n,r)=>n+r.def_total_yards,0));assert.equal(team.values['passing-offense'],games.reduce((n,r)=>n+r.passing_yards,0));assert.equal(team.values['turnover-margin'],null);}
 assert.equal(model.rankTeamRows(data.rows,'total-offense',false,'','').supported,32);
 const dal=data.rows.find(r=>r.id==='DAL');assert.equal(dal.values['total-offense'],2059);assert.equal(dal.gamesPlayed,6);
});
test('season aggregation rejects duplicate games and incomplete weeks; missing values never become partial totals or zeros',()=>{
 const copy=structuredClone(history.weeks);copy[0].rows[0].total_yards=null;const missing=retained.aggregateRetainedTeams(copy,6).find(r=>r.team===copy[0].rows[0].team);assert.equal(missing.total_yards,null);
 const zero=structuredClone(history.weeks);for(const w of zero)for(const r of w.rows)r.def_sacks=0;assert.ok(retained.aggregateRetainedTeams(zero,6).every(r=>r.def_sacks===0));
 assert.throws(()=>retained.aggregateRetainedTeams(copy.slice(1),6),/Incomplete/);
 const dupe=structuredClone(history.weeks);dupe[0].rows[1]=dupe[0].rows[0];assert.throws(()=>retained.aggregateRetainedTeams(dupe,6),/Conflicting/);
});
test('real CFB Week 7 supplies 121 FBS teams from 62 games, correct logos and genuine zeros without admitting FCS opponents',()=>{
 const data=model.cfbWeeklyData(cfb,'7',columns('CFB','weekly'));assert.equal(data.rows.length,121);assert.equal(cfb.games,62);assert.equal(cfb.excludedNonFbs,3);assert.ok(data.rows.every(r=>r.logo));
 for(const c of columns('CFB','weekly'))assert.equal(model.rankTeamRows(data.rows,c.id,false,'','').supported,121);
 assert.ok(data.rows.some(r=>r.values.sacks===0));assert.equal(model.rankTeamRows(data.rows,'total-offense',false,'','').rows[0].values['total-offense'],716);
 const conf=data.rows[0].conferenceId,filtered=model.rankTeamRows(data.rows,'total-offense',false,conf,'');assert.ok(filtered.rows.every(r=>r.conferenceId===conf));assert.equal(filtered.rows[0].rank,1);
});
test('real NCAA Season retains independent dated tables, six complete populations and four honestly partial populations',()=>{
 assert.equal(Object.keys(ncaa.tables).length,10);
 const records=Object.values(ncaa.tables).flatMap(t=>t.rows),data=model.cfbSeasonData(records,columns('CFB','season'));
 for(const [category,t]of Object.entries(ncaa.tables)){const expected=t.rows.length;assert.ok([50,138].includes(expected));assert.equal(model.rankTeamRows(data.rows,category,false,'','').supported,expected);assert.ok(data.cutoffs[category].every(s=>s.includes('2026')));if(expected===50)assert.match(data.coverage[category],/first 50.*remaining pages/);}
 const texas=data.rows.find(r=>r.name==='Texas State Bobcats');assert.equal(texas.values['total-offense'],3374);assert.equal(data.rows.find(r=>r.name==='Notre Dame Fighting Irish').values['total-defense'],235);
 assert.notDeepEqual(data.cutoffs['total-offense'],data.cutoffs['passing-offense']);
});
const require=createRequire(file('app/features/stats/TeamStats.tsx')),component={exports:{}};
const js=ts.transpileModule(await read('app/features/stats/TeamStats.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','module','exports',js)(name=>name.endsWith('.css')?{__esModule:true,default:new Proxy({},{get:(_,k)=>String(k)})}:name==='./team-stats-model'?model:name==='./team-stats-load'?{}:name.includes('TeamLogo')?{TeamLogo:({src})=>createElement('img',{'data-team-logo':true,src,alt:''})}:require(name),component,component.exports);
function render(data,cols,metric){return renderToStaticMarkup(createElement(component.exports.TeamStatsTable,{data,columns:cols,metric,ascending:false,count:150,sort(){},teamLogo:()=>undefined,ranked:model.rankTeamRows(data.rows,metric,false,'',''),emptyMessage:'This statistic is unavailable. Choose another heading.'}));}
test('actual table renders real weekly and Season values, all league logos, games played and a useful unavailable state',()=>{
 const week=model.nflTeamData(retained.retainedNflTeams('weekly',2),'weekly','2',columns('NFL','weekly')),season=model.nflTeamData(retained.retainedNflTeams('season',null),'season','',columns('NFL','season'));
 const weekly=render(week,model.teamColumns('NFL','weekly','Offense'),'total-offense');assert.match(weekly,/Dallas Cowboys/);assert.match(weekly,/>332<\/td>/);assert.equal((weekly.match(/data-team-logo/g)??[]).length,32);
 const seasonHtml=render(season,model.teamColumns('NFL','season','Offense','net'),'total-offense');assert.match(seasonHtml,/>2,059<\/td>/);assert.match(seasonHtml,/net yards total/);assert.match(seasonHtml,/>G<\/th>/);
 const empty=render(season,model.teamColumns('NFL','season','Other'),'turnover-margin');assert.match(empty,/This statistic is unavailable/);assert.doesNotMatch(empty,/Dallas Cowboys/);
 const cfbData=model.cfbWeeklyData(cfb,'7',columns('CFB','weekly')),cfbHtml=render(cfbData,model.teamColumns('CFB','weekly','Offense'),'total-offense');assert.match(cfbHtml,/>716<\/td>/);assert.equal((cfbHtml.match(/data-team-logo/g)??[]).length,121);
 const ncaaData=model.cfbSeasonData(Object.values(ncaa.tables).flatMap(t=>t.rows),columns('CFB','season')),ncaaHtml=render(ncaaData,model.teamColumns('CFB','season','Offense'),'total-offense');assert.match(ncaaHtml,/>3,374<\/td>/);assert.equal((ncaaHtml.match(/data-team-logo/g)??[]).length,138);
});
test('actual NFL route serves retained weeks and Season without any upstream request or player processing',async()=>{
 let code=await read('app/api/nfl/team-stats/route.ts');code=code.replace('import { NextResponse } from "next/server";','const NextResponse={json:Response.json};').replace('import { loadNflLiveSource } from "../live-stats";','const loadNflLiveSource=()=>{throw Error("Unexpected upstream request");};').replace('"../../../lib/nfl-weekly-team-stats"',JSON.stringify(await compile(file('app/lib/nfl-weekly-team-stats.ts')))).replace('"../../../lib/retained-team-stats"',JSON.stringify(await compile(file('app/lib/retained-team-stats.ts'))));
 const route=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
 for(const query of ['week=2','week=6','mode=season']){const response=await route.GET(new Request('http://fixture/?'+query));assert.equal(response.status,200);const body=await response.json();assert.ok(body.stats.length>=28);assert.ok(body.stats.every(r=>r.total_yards!==null));}
});
test('NFL real season totals and per-game yardage are independent, separately sortable metrics',()=>{
 const body=retained.retainedNflTeams('season',null),data=model.nflTeamData(body,'season','',columns('NFL','season'));
 for(const row of data.rows){assert.equal(row.values['total-defense-ypg'],row.values['total-defense']/row.gamesPlayed);assert.equal(row.values['total-offense-ypg'],row.values['total-offense']/row.gamesPlayed);}
 const totals=model.rankTeamRows(data.rows,'total-defense',true,'',''),ypg=model.rankTeamRows(data.rows,'total-defense-ypg',true,'','');assert.equal(totals.supported,32);assert.equal(ypg.supported,32);assert.notDeepEqual(totals.rows.map(r=>r.id),ypg.rows.map(r=>r.id));
 assert.equal(model.defaultTeamColumn('NFL','season','Defense').id,'total-defense-ypg');assert.equal(model.defaultTeamColumn('NFL','season','Defense').lower,true);assert.equal(model.defaultTeamColumn('NFL','weekly','Defense').id,'total-defense');
 const col=model.teamColumns('NFL','season','Defense','net'),html=render(data,col,'total-defense-ypg');assert.match(html,/TOTAL YDS ALLOWED/);assert.match(html,/ALLOWED YPG/);assert.match(html,/>G<\/th>/);
 console.log('Real NFL defensive total ordering:',totals.rows.slice(0,5).map(r=>`${r.id} ${r.values['total-defense']}`).join(', '));console.log('Real NFL YPG ordering:',ypg.rows.slice(0,5).map(r=>`${r.id} ${r.values['total-defense-ypg'].toFixed(1)}`).join(', '));
});
test('YPG rejects missing/zero/invalid games and unverified cutoffs while retaining genuine zero totals',()=>{
 const body=retained.retainedNflTeams('season',null),cols=columns('NFL','season');
 for(const games of [null,undefined,0,'0','',false,true,-1,1.5,7]){const input=structuredClone(body);input.stats[0].games_played=games;const data=model.nflTeamData(input,'season','',cols);assert.equal(data.rows[0].values['total-defense-ypg'],null);}
 for(const change of [b=>b.snapshot=false,b=>delete b.throughWeek,b=>b.throughWeek=0,b=>b.throughWeek=99,b=>b.stats[0].def_total_yards=null]){const input=structuredClone(body);change(input);assert.equal(model.nflTeamData(input,'season','',cols).rows[0].values['total-defense-ypg'],null);}
 const zero=structuredClone(body);zero.stats[0].def_total_yards=0;assert.equal(model.nflTeamData(zero,'season','',cols).rows[0].values['total-defense-ypg'],0);
});
test('real CFB Week 7 defensive allowances cover all 121 FBS observations, preserve shutouts and opponent identities',()=>{
 const data=model.cfbWeeklyData(cfb,'7',columns('CFB','weekly')),def=model.teamColumns('CFB','weekly','Defense');assert.equal(def.length,6);
 for(const id of ['yards-allowed','passing-defense','rushing-defense','scoring-defense']){assert.equal(model.rankTeamRows(data.rows,id,true,'','').supported,121);assert.equal(def.find(c=>c.id===id).lower,true);}
 const middle=data.rows.find(r=>r.id==='2393');assert.deepEqual(['yards-allowed','passing-defense','rushing-defense','scoring-defense'].map(k=>middle.values[k]),[391,321,70,30]);
 assert.equal(data.rows.filter(r=>r.values['scoring-defense']===0).length,4);
 for(const own of cfb.rows){const other=cfb.rows.find(r=>r.gameId===own.gameId&&r.teamId!==own.teamId);if(other){assert.equal(own.values['yards-allowed'],other.values['total-offense']);assert.equal(own.values['passing-defense'],other.values['passing-offense']);assert.equal(own.values['rushing-defense'],other.values['rushing-offense']);}}
 const html=render(data,def,'yards-allowed');assert.match(html,/YDS ALLOWED/);assert.match(html,/PASS ALLOWED/);assert.match(html,/RUSH ALLOWED/);assert.match(html,/POINTS ALLOWED/);assert.match(html,/TACKLES/);assert.match(html,/SACKS/);
});
test('Team refresh wording distinguishes historical snapshots, fixed season cutoffs and automatic Current Week checks',()=>{
 const nfl=model.nflTeamData(retained.retainedNflTeams('season',null),'season','',columns('NFL','season'));
 assert.match(model.teamRefreshLabel('season','',nfl,'total-defense-ypg'),/Season snapshot.*Through Week 6/);
 assert.match(model.teamRefreshLabel('weekly','7',model.cfbWeeklyData(cfb,'7',columns('CFB','weekly')),'yards-allowed'),/Historical week.*snapshot/);
 assert.equal(model.teamRefreshLabel('weekly','',null,'yards-allowed'),'Current Week · Automatic checks every 30 seconds');
 const season=model.cfbSeasonData(Object.values(ncaa.tables).flatMap(t=>t.rows),columns('CFB','season'));assert.match(model.teamRefreshLabel('season','',season,'total-offense'),/Through games Tuesday, October 20, 2026/);
 assert.match(model.teamRefreshLabel('season','',null,'total-offense'),/cutoff unavailable/);
});
