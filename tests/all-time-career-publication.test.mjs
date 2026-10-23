import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const file=name=>new URL('../app/lib/'+name,import.meta.url);
const career=await import(await compileLocalModule(file('all-time-nfl-careers.ts')));
const source=await import(await compileLocalModule(file('all-time-live-sources.ts')));
const ids=['8439','12483','3043078'];
const evidence=Object.fromEntries(await Promise.all(ids.map(async id=>[id,JSON.parse(await readFile(new URL('./fixtures/nfl-career-current/'+id+'.json',import.meta.url)))])));
function gridComponent(){
 const require=createRequire(import.meta.url),harness={exports:{}};
 const js=ts.transpileModule(require('node:fs').readFileSync(new URL('../app/features/all-time/AllTimeRecordGrid.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 return import('../app/lib/all-time-records.ts').then(records=>{
 new Function('require','module','exports',js)(name=>name.endsWith('.css')?{}:name==='../../lib/all-time-records'?records:require(name),harness,harness.exports);return harness.exports.AllTimeRecordGrid;
 });
}
const csv='full_name,espn_id,gsis_id,team,week,entry_year\nAaron Rodgers,8439,00-0023459,PIT,7,2005\nMatthew Stafford,12483,00-0026498,LA,7,2009\nDerrick Henry,3043078,00-0032764,BAL,7,2016';
const row=(feed,cat,name)=>feed.leaderboards['NFL:individual:career:'+cat].find(r=>r.name===name);

test('45 retained source-qualified observations recalculate all nine Top 25s; retired values remain intact and new category entrants appear',()=>{
 const sets=career.nflCareerRecordSets();assert.equal(career.nflCareerPublication.players.length,45);
 for(const rows of Object.values(sets)){assert.equal(rows.length,25);assert.equal(new Set(rows.map(r=>r.player)).size,25);}
 assert.equal(sets['passing-yards'].find(r=>r.player==='Jared Goff').value,41107);
 assert.equal(sets['passing-yards'].find(r=>r.player==='Tom Brady').value,89214);
 assert.equal(sets['passing-td'].find(r=>r.player==='Peyton Manning').value,539);
 assert.throws(()=>career.nflCareerRecordSets({...career.retainedNflCareerSource(),categories:{...career.retainedNflCareerSource().categories,'passing-td':[{player:'Peyton Manning',team:'Other',years:'2020–2026',value:600,playerId:'espn:nfl:999'}]}}),/identity/);
});

test('real ESPN observations render all five corrections; changing totals, downward corrections, failures and cold state preserve publication without double counting',async()=>{
 const saved={...process.env},old=globalThis.fetch;process.env.SUPABASE_URL='https://career-storage.invalid';process.env.SUPABASE_SECRET_KEY='test-only';process.env.NODE_ENV='production';
 let state={version:1,snapshots:[],signals:[]},stamp=null,writes=0,providerCalls=0,fail=false,readOnly=false;
 globalThis.fetch=async(url,options={})=>{
  const u=String(url);
  if(u.startsWith('https://career-storage.invalid/')){
   if(options.method){assert.equal(readOnly,false);writes++;state=JSON.parse(options.body).state;stamp='2026-10-23T01:00:00.000Z';return Response.json([{state,updated_at:stamp}]);}
   return Response.json(stamp?[{state,updated_at:stamp}]:[]);
  }
  assert.equal(readOnly,false,'public reads must not contact providers');providerCalls++;
  if(fail)throw Error('Controlled provider outage');
  if(u.includes('/rosters/'))return new Response(csv);if(u.includes('/leaders/0'))return new Response(await readFile(new URL('./fixtures/nfl-career-discovery-leaders.json',import.meta.url)));
  const id=/athletes\/(\d+)\/stats/.exec(u)?.[1];assert.ok(ids.includes(id));assert.equal(new URL(u).searchParams.get('seasontype'),'2');return Response.json(evidence[id]);
 };
 const overrides=new Map([[file('all-time-nfl-results.ts').href,'export async function loadNflTeamResults(){throw Error("Isolated career test; no team provider");}']]);
 try{
  const mod=await import(await compileLocalModule(file('all-time-monitor.ts'),overrides));
  const update=await mod.refreshAllTimeMonitor('NFL');assert.equal(update.failures.individual,false);assert.equal(writes,1);assert.equal(providerCalls,5);
  readOnly=true;const feed=await mod.getAllTimeLeaderboardFeed('NFL');
  for(const [cat,name,value,rank] of [['passing-td','Aaron Rodgers',539,3],['passing-td','Matthew Stafford',434,6],['rushing-yards','Derrick Henry',13552,9],['passing-yards','Aaron Rodgers',67761,5],['passing-yards','Matthew Stafford',66310,6]]){
   assert.equal(row(feed,cat,name).value,value);assert.equal(row(feed,cat,name).rank,rank);
  }
  assert.equal(row(feed,'passing-td','Peyton Manning').rank,3);
  const Grid=await gridComponent();
  for(const cat of ['passing-td','passing-yards','rushing-yards']){
   const html=renderToStaticMarkup(createElement(Grid,{categories:[{title:cat,records:feed.leaderboards['NFL:individual:career:'+cat].map(r=>({rank:r.rank,player:r.name,team:r.context,years:r.years,value:r.value,isActive:r.isActive}))}]}));
   const expected=cat==='passing-td'?['Aaron Rodgers','539','Matthew Stafford','434']:cat==='passing-yards'?['67,761','66,310']:['Derrick Henry','13,552'];for(const text of expected)assert.ok(html.includes(text),text);
  }
  // Legitimate changing provider totals replace observations; they are not increments.
  readOnly=false;const passing=evidence['8439'].categories.find(c=>c.name==='passing'),idx=passing.names.indexOf('passingTouchdowns');passing.totals[idx]='540';passing.statistics.at(-1).stats[idx]='13';
  await mod.refreshAllTimeMonitor('NFL');readOnly=true;const changed=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(row(changed,'passing-td','Aaron Rodgers').value,540);assert.equal(row(changed,'passing-td','Peyton Manning').rank,4);
  const cold=await import(await compileLocalModule(file('all-time-monitor.ts'),new Map([...overrides,[file('all-time-monitor.ts').href,(await readFile(file('all-time-monitor.ts'),'utf8'))+'\n// fresh server state\n']])));
  assert.equal(row(await cold.getAllTimeLeaderboardFeed('NFL'),'passing-td','Aaron Rodgers').value,540);
  readOnly=false;await cold.refreshAllTimeMonitor('NFL');readOnly=true;assert.equal(row(await cold.getAllTimeLeaderboardFeed('NFL'),'passing-td','Aaron Rodgers').value,540);
  readOnly=false;passing.totals[idx]='539';passing.statistics.at(-1).stats[idx]='12';await cold.refreshAllTimeMonitor('NFL');readOnly=true;assert.equal(row(await cold.getAllTimeLeaderboardFeed('NFL'),'passing-td','Aaron Rodgers').value,539);
  const before=structuredClone(state);readOnly=false;fail=true;await assert.rejects(cold.refreshAllTimeMonitor('NFL'),/outage/);assert.deepEqual(state,before);readOnly=true;assert.equal(row(await cold.getAllTimeLeaderboardFeed('NFL'),'passing-td','Aaron Rodgers').value,539);
 }finally{globalThis.fetch=old;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});

test('regular-season selection and identity conflicts fail safely',async()=>{
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async url=>String(url).includes('/rosters/')?new Response(csv.replace('00-0023459','00-9999999')):Response.json(evidence['8439']);
  await assert.rejects(source.loadNflActiveCareerSource(),/GSIS/);
  globalThis.fetch=async url=>String(url).includes('/rosters/')?new Response(csv.split('\n').slice(0,2).join('\n')):String(url).includes('/leaders/0')?new Response(await readFile(new URL('./fixtures/nfl-career-discovery-leaders.json',import.meta.url))):Response.json({...evidence['8439'],filters:[{name:'seasontype',value:'3'}]});
  await assert.rejects(source.loadNflActiveCareerSource(),/regular season/);
 }finally{globalThis.fetch=old;}
});

test('reported zeroes survive the source loader; absent categories are not manufactured',async()=>{
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async url=>String(url).includes('/rosters/')?new Response(csv.split('\n').slice(0,2).join('\n')):String(url).includes('/leaders/0')?new Response(await readFile(new URL('./fixtures/nfl-career-discovery-leaders.json',import.meta.url))):Response.json(evidence['8439']);
  const loaded=await source.loadNflActiveCareerSource();assert.equal(loaded.categories.sacks[0].value,0);assert.equal(loaded.categories.interceptions[0].value,0);
 }finally{globalThis.fetch=old;}
});

test('partial scheduled source failures return a failure status while retaining successful publications',async()=>{
 const require=createRequire(import.meta.url),harness={exports:{}};let failures={team:false,individual:true};
 const saved=process.env.CRON_SECRET;process.env.CRON_SECRET='test-only';
 try{
  const js=ts.transpileModule(await readFile(file('all-time-cron.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  new Function('require','module','exports',js)(name=>name==='next/server'?{NextResponse:{json:(data,init)=>Response.json(data,init)}}:name==='./all-time-monitor'?{refreshAllTimeMonitor:async()=>({failures})}:require(name),harness,harness.exports);
  const request=new Request('http://localhost/api/cron/all-time/nfl',{headers:{authorization:'Bearer test-only'}});
  assert.equal((await harness.exports.runAllTimeCron(request,'NFL')).status,503);failures={team:false,individual:false};assert.equal((await harness.exports.runAllTimeCron(request,'NFL')).status,200);
 }finally{if(saved===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=saved;}
});
