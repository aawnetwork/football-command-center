import {compileLocalModule} from './helpers/compile-local-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {rankHistoricalRecords,gamesPlayedRecords} from '../app/lib/all-time-records.ts';
import {nflAllTimeCareerTeam} from '../app/nfl/data/nfl-all-time-team.ts';
import {cfbAllTimeCareerProgram} from '../app/cfb/data/cfb-all-time-program.ts';
import {nflAllTimeCareerIndividual,nflAllTimeSeasonIndividual,nflAllTimeSingleGameIndividual} from '../app/nfl/data/nfl-all-time-career.ts';
import {cfbAllTimeCareerIndividual,cfbAllTimeSeasonIndividual,cfbAllTimeSingleGameIndividual} from '../app/cfb/data/cfb-all-time-career.ts';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const compile=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
function component(source,path,stubs={}){
 const module={exports:{}},require=createRequire(new URL('../'+path,import.meta.url));
 new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>name in stubs?stubs[name]:name.endsWith('.css')?{}:require(name),module,module.exports);return module.exports;
}
test('real retained categories remain populated; individual tables retain their original values',()=>{
 for(const [source,counts] of [[nflAllTimeCareerIndividual,9],[nflAllTimeSeasonIndividual,9],[nflAllTimeSingleGameIndividual,6],[cfbAllTimeCareerIndividual,11],[cfbAllTimeSeasonIndividual,11],[cfbAllTimeSingleGameIndividual,4]]){
  assert.equal(Object.keys(source).length,counts);
  for(const records of Object.values(source)){
   const before=structuredClone(records),ranked=rankHistoricalRecords(records);assert.equal(ranked.length,records.length);assert.deepEqual(records,before);
   assert.deepEqual(ranked.map(r=>r.value).sort((a,b)=>a-b),records.map(r=>r.value).sort((a,b)=>a-b));
  }
 }
 assert.equal(nflAllTimeCareerTeam.wins.length,32);assert.equal(cfbAllTimeCareerProgram.wins.length,25);
 assert.equal(nflAllTimeCareerIndividual['passing-yards'][0].value,89214);assert.equal(cfbAllTimeCareerIndividual['passing-yards'][0].value,19217);
});
test('Games Played derives only explicit retained W–L–T values for all 32 franchises',()=>{
 const before=structuredClone(nflAllTimeCareerTeam),games=gamesPlayedRecords(nflAllTimeCareerTeam.wins);
 assert.equal(games.length,32);assert.equal(games[0].player,'Chicago Bears');assert.equal(games[0].value,1503);
 assert.equal(games.find(row=>row.player==='Green Bay Packers').value,1469);assert.equal(games.find(row=>row.player==='Houston Texans').value,389);assert.deepEqual(nflAllTimeCareerTeam,before);
 for(const patch of [{team:'819–611'},{team:'--'},{team:'820–611–39'}])assert.throws(()=>gamesPlayedRecords([{...nflAllTimeCareerTeam.wins[0],...patch}]));
 assert.throws(()=>gamesPlayedRecords([nflAllTimeCareerTeam.wins[0],nflAllTimeCareerTeam.wins[0]]));
});
test('ranks use competition ties; genuine zero stays valid and absent/invalid values never become zero',()=>{
 const row={rank:0,player:'A',team:'Team',years:'2025',value:100};
 const ranked=rankHistoricalRecords([row,{...row,player:'B'},{...row,player:'C',value:99},{...row,player:'Zero',value:0},...['Missing','Invalid','NaN'].map((player,i)=>({...row,player,value:[null,'',NaN][i]}))]);
 assert.deepEqual(ranked.map(r=>[r.player,r.rank,r.value]),[['A',1,100],['B',1,100],['C',3,99],['Zero',4,0]]);
 const cfb=rankHistoricalRecords(cfbAllTimeCareerProgram.wins);assert.equal(cfb.find(r=>r.player==='Texas').rank,4);assert.equal(cfb.find(r=>r.player==='Notre Dame').rank,4);assert.equal(cfb.find(r=>r.player==='Oklahoma').rank,6);
});
test('record cards include boundary ties, hide unsupported categories and never infer active status from a year',async()=>{
 const {AllTimeRecordGrid}=component(await read('app/features/all-time/AllTimeRecordGrid.tsx'),'app/features/all-time/AllTimeRecordGrid.tsx',{'../../lib/all-time-records':{rankHistoricalRecords}});
 const records=Array.from({length:11},(_,i)=>({rank:i+1,player:'P'+i,team:'Team',years:'2026',value:i>=9?1:100-i}));
 const html=renderToStaticMarkup(createElement(AllTimeRecordGrid,{audience:'team',categories:[{title:'Wins',records},{title:'Unavailable',records:[{...records[0],value:null}]}]}));
 assert.match(html,/Top 11 of 11/);assert.equal((html.match(/__rank">10</g)||[]).length,2);assert.doesNotMatch(html,/Unavailable|>ACTIVE</);assert.match(html,/All-Time · Wins/);
 const historical=renderToStaticMarkup(createElement(AllTimeRecordGrid,{period:'single-game',categories:[{title:'Passing',records:[records[0]]}]}));assert.doesNotMatch(historical,/>ACTIVE</);
 const active=renderToStaticMarkup(createElement(AllTimeRecordGrid,{categories:[{title:'Passing',records:[{...records[0],isActive:true}]}]}));assert.match(active,/>ACTIVE</);
});
let monitorSequence=0;
async function monitorRead(state,run){
 const keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_URL','NODE_ENV'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]])),old=globalThis.fetch;
 process.env.SUPABASE_URL='https://all-time-test.invalid';process.env.SUPABASE_SECRET_KEY='test-only';process.env.NODE_ENV='production';let reads=0;
 globalThis.fetch=async(url,options={})=>{assert.ok(String(url).startsWith('https://all-time-test.invalid/rest/v1/all_time_monitor_state?'));assert.equal(options.method,undefined,'no database or provider writes');reads++;return state===null?new Response('',{status:503}):Response.json([{state}]);};
 try{
  let source=await read('app/lib/all-time-monitor.ts');for(const rel of ['./all-time-records','./all-time-comparison','./all-time-signal-retention','../cfb/data/cfb-all-time-career','../cfb/data/cfb-all-time-program','../nfl/data/nfl-all-time-career','../nfl/data/nfl-all-time-team'])source=source.replace(JSON.stringify(rel),JSON.stringify(new URL('../app/lib/'+rel+'.ts',import.meta.url).href));
  for(const name of ['all-time-nfl-teams','all-time-nfl-results','all-time-nfl-careers'])source=source.replace(JSON.stringify('./'+name),JSON.stringify(await compileLocalModule(new URL('../app/lib/'+name+'.ts',import.meta.url))));source=source.replace('"./all-time-live-sources"',JSON.stringify(compile('export async function loadNflActiveCareerSource(){throw Error("No providers allowed")}')));
  const mod=await import(compile(source+'\n// isolated fixture module '+monitorSequence++));await run(mod);assert.ok(reads>0);
 }finally{globalThis.fetch=old;for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
}
const entry={id:'retained-player',name:'Aaron Rodgers',context:'Pittsburgh Steelers',years:'2005–2026',rank:1,value:67000,isActive:true};
const snapshot=(league,audience,period,category,entries)=>({id:`${league}:${audience}:${period}:${category}`,league,audience,period,category,checkedAt:'2026-10-21T12:00:00Z',entries});
test('new bundled categories and corrections override stale static storage without a refresh or writes',()=>monitorRead({version:1,catalogVersion:'espn-active-career-v3',signals:[],snapshots:[snapshot('CFB','team','career','wins',[{...entry,name:'Wrong old winner',value:999999}]),snapshot('NFL','individual','season','passing-yards',[{...entry,value:999999}])]},async mod=>{
 const cfb=await mod.getAllTimeLeaderboardFeed('CFB');assert.equal(cfb.leaderboards['CFB:team:career:wins'][0].name,'Michigan');assert.equal(cfb.source.checkedAt,null);assert.equal(cfb.datasets['CFB:team:career:wins'].checkedAt,null);
 const nfl=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(nfl.leaderboards['NFL:individual:season:passing-yards'][0].value,5477);assert.equal(nfl.leaderboards['NFL:team:career:wins'].length,32);assert.equal(nfl.leaderboards['NFL:team:career:games-played'][0].value,1503);
}));
test('verified active career publications and downward corrections propagate on the next read, independently of static tables',async()=>{
 const state={version:1,catalogVersion:'espn-active-career-v4',signals:[],snapshots:[snapshot('NFL','individual','career','passing-yards',[{...entry,playerId:'espn:nfl:8439'},{...entry,id:'stale-retired',name:'Tom Brady',value:999999,isActive:false}])]};
 await monitorRead(state,async mod=>{
  state.snapshots[0].checkedAt='2026-10-24T12:00:00Z';const before=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(before.leaderboards['NFL:individual:career:passing-yards'].find(row=>row.name==='Aaron Rodgers').value,67000);assert.equal(before.leaderboards['NFL:individual:career:passing-yards'][0].value,89214);assert.equal(before.leaderboards['NFL:individual:career:passing-yards'].length,25);assert.ok(before.source.checkedAt);assert.equal(before.datasets['NFL:team:career:wins'].mode,'verified-baseline');
  state.snapshots[0].entries[0].value=66990;const corrected=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(corrected.leaderboards['NFL:individual:career:passing-yards'].find(row=>row.name==='Aaron Rodgers').value,66990);assert.ok(!('signals' in corrected));
  state.snapshots[0].entries[0].value=90000;const newLeader=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(newLeader.leaderboards['NFL:individual:career:passing-yards'][0].name,'Aaron Rodgers');
  state.snapshots[0].entries[0].value=null;const invalid=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(invalid.leaderboards['NFL:individual:career:passing-yards'][0].value,89214);assert.equal(invalid.source.mode,'active-career');
 });
});
test('storage failure cannot regress a published NFL ledger to the baseline; static CFB remains available',()=>monitorRead(null,async mod=>{
 await assert.rejects(mod.getAllTimeLeaderboardFeed('NFL'),/monitor read failed/);
 const cfb=await mod.getAllTimeLeaderboardFeed('CFB');assert.equal(cfb.source.publicationAvailable,false);assert.equal(cfb.source.checkedAt,null);assert.equal(cfb.leaderboards['CFB:team:career:wins'].length,25);
}));
