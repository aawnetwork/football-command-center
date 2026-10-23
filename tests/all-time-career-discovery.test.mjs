import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const file=name=>new URL('../app/lib/'+name,import.meta.url);
const {parseNflCareerDiscovery}=await import(await compileLocalModule(file('all-time-nfl-discovery.ts')));
const career=await import(await compileLocalModule(file('all-time-nfl-careers.ts')));
const feed=JSON.parse(await readFile(new URL('./fixtures/nfl-career-discovery-leaders.json',import.meta.url)));
const csv=await readFile(new URL('./fixtures/nfl-career-discovery-roster.csv',import.meta.url),'utf8');
const ids=['8439','12483','3043078','14012','14945','2510863'];
const coreOriginal=JSON.parse(await readFile(new URL('./fixtures/nfl-career-current/14012-core.json',import.meta.url)));
const originals=Object.fromEntries(await Promise.all(ids.map(async id=>[id,JSON.parse(await readFile(new URL('./fixtures/nfl-career-current/'+id+'.json',import.meta.url)))])));
const thresholds=Object.fromEntries(Object.entries(career.nflCareerRecordSets()).map(([cat,rows])=>[cat,rows.at(-1).value]));

test('real 100-entry primary career feed discovers unknown IDs, covers seven threshold ranges and explicitly limits yards/tackles',()=>{
 const result=parseNflCareerDiscovery(feed,thresholds,new Set(ids));
 assert.ok(result.candidateIds.has('14012'));assert.ok(!career.nflCareerPublication.players.some(p=>p.playerId==='espn:nfl:14012'));
 assert.equal(Object.values(result.coverage).filter(c=>c.status==='covered-range').length,7);
 assert.equal(result.coverage['receiving-yards'].status,'insufficient-range');assert.equal(result.coverage.tackles.status,'source-unavailable');
 for(const entry of Object.values(result.coverage).filter(c=>c.status==='covered-range'))assert.ok(entry.lastReportedValue<entry.threshold);
 // Core active flags are unreliable (including historical players); exact current roster identity governs discovery.
 const garrett=feed.categories.find(c=>c.name==='sacks').leaders.find(r=>r.athlete.$ref.includes('/3122132?'));assert.equal(garrett.active,false);
 assert.ok(parseNflCareerDiscovery(feed,thresholds,new Set(['3122132'])).candidateIds.has('3122132'));
});

test('discovery rejects duplicates, unsorted values, foreign identity references, invalid totals and ambiguous categories',()=>{
 for(const mutate of [x=>x.categories[0].leaders.push(x.categories[0].leaders[0]),x=>x.categories.find(c=>c.name==='passingYards').leaders.reverse(),x=>x.categories.find(c=>c.name==='passingYards').leaders[0].value=null,x=>x.categories.find(c=>c.name==='passingYards').leaders[0].athlete.$ref='https://other.invalid/athletes/8439',x=>x.categories.push(x.categories.find(c=>c.name==='passingYards'))]){
  const changed=structuredClone(feed);mutate(changed);
  // Mutations must affect a category used for discovery.
  if(changed.categories[0].leaders.length===101){const c=changed.categories.find(c=>c.name==='passingYards');c.leaders.push(c.leaders[0]);}
  assert.throws(()=>parseNflCareerDiscovery(changed,thresholds,new Set(ids)));
 }
 const shallow=structuredClone(feed);shallow.categories.find(c=>c.name==='passingYards').leaders=shallow.categories.find(c=>c.name==='passingYards').leaders.slice(0,10);
 assert.equal(parseNflCareerDiscovery(shallow,thresholds,new Set(ids)).coverage['passing-yards'].status,'insufficient-range');
});

let instance=0;
test('real outside-registry discovery and controlled threshold crossing persist through publication, ties, corrections, cold state and failures',async()=>{
 const saved={...process.env},old=globalThis.fetch;process.env.NODE_ENV='production';process.env.SUPABASE_URL='https://discovery-test.invalid';process.env.SUPABASE_SECRET_KEY='test-only';
 let state={version:1,snapshots:[],signals:[]},stamp=null,writes=0,fail=false,reading=false,calls=[];const observations=structuredClone(originals),core=structuredClone(coreOriginal);
 globalThis.fetch=async(url,options={})=>{
  const u=String(url);
  if(u.startsWith('https://discovery-test.invalid/')){
   if(options.method){assert.equal(reading,false);state=JSON.parse(options.body).state;writes++;stamp=new Date().toISOString();return Response.json([{state,updated_at:stamp}]);}
   return Response.json(stamp?[{state,updated_at:stamp}]:[]);
  }
  assert.equal(reading,false,'public reads must not discover/download careers');calls.push(u);
  if(fail)throw Error('Controlled discovery outage');
  if(u.includes('/rosters/'))return new Response(csv);
  if(u.includes('/leaders/0'))return Response.json(feed);
  if(u.includes('/athletes/14012/statistics/0'))return Response.json(core);
  const id=/athletes\/(\d+)\/stats/.exec(u)?.[1];assert.ok(ids.includes(id),'bounded exact athlete ID');assert.equal(new URL(u).searchParams.get('seasontype'),'2');return Response.json(observations[id]);
 };
 const overrides=new Map([[file('all-time-nfl-results.ts').href,'export async function loadNflTeamResults(){throw Error("No team requests in isolated Career test");}']]);
 async function cold(){return import(await compileLocalModule(file('all-time-monitor.ts'),new Map([...overrides,[file('all-time-monitor.ts').href,await readFile(file('all-time-monitor.ts'),'utf8')+'\n// discovery instance '+instance++]])));}
 const getRow=(data,name)=>data.leaderboards['NFL:individual:career:passing-yards'].find(row=>row.name===name);
 try{
  let mod=await cold();await mod.refreshAllTimeMonitor('NFL');assert.equal(calls.length,9,'one roster, one discovery, six careers plus one complete-aggregate verification');
  assert.ok(state.nflCareerSource.identities.some(i=>i.playerId==='espn:nfl:14012'&&i.gsisId==='00-0027973'&&i.firstSeason===2011));
  assert.equal(state.nflCareerSource.categories['passing-yards'].find(row=>row.playerId==='espn:nfl:14012').value,39792);
  reading=true;let published=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(getRow(published,'Andy Dalton'),undefined,'real 39,792 total does not yet qualify; do not invent an entrant');
  assert.equal(published.source.discovery.coverage.tackles.status,'source-unavailable');
  // Controlled FUTURE provider observations, explicitly not claimed to be real current totals.
  function setYards(target){const category=observations['14012'].categories.find(c=>c.name==='passing');const i=category.names.indexOf('passingYards'),last=category.statistics.at(-1),previous=Number(category.totals[i].replaceAll(',',''));last.stats[i]=String(Number(last.stats[i].replaceAll(',',''))+target-previous);category.totals[i]=String(target);core.splits.categories.find(c=>c.name==='passing').stats.find(s=>s.name==='passingYards').value=target;}
  reading=false;setYards(40792);await mod.refreshAllTimeMonitor('NFL');reading=true;published=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(getRow(published,'Andy Dalton').value,40792);assert.equal(getRow(published,'Andy Dalton').rank,25);assert.equal(getRow(published,'Joe Montana'),undefined);assert.equal(published.leaderboards['NFL:individual:career:passing-yards'].length,25);
  const stableId=getRow(published,'Andy Dalton').id;
  reading=false;setYards(40922);await mod.refreshAllTimeMonitor('NFL');reading=true;published=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(getRow(published,'Andy Dalton').rank,24);assert.equal(getRow(published,'Kerry Collins').rank,24);assert.equal(getRow(published,'Andy Dalton').id,stableId);
  mod=await cold();assert.equal(getRow(await mod.getAllTimeLeaderboardFeed('NFL'),'Andy Dalton').value,40922);
  reading=false;await mod.refreshAllTimeMonitor('NFL');reading=true;assert.equal(getRow(await mod.getAllTimeLeaderboardFeed('NFL'),'Andy Dalton').value,40922,'repeat does not increment');
  reading=false;observations['14012']=structuredClone(originals['14012']);Object.assign(core,structuredClone(coreOriginal));await mod.refreshAllTimeMonitor('NFL');reading=true;published=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(getRow(published,'Andy Dalton'),undefined);assert.equal(getRow(published,'Joe Montana').value,40551);
  assert.equal(published.leaderboards['NFL:individual:career:passing-td'].find(r=>r.name==='Aaron Rodgers').value,539);
  assert.equal(published.leaderboards['NFL:individual:career:rushing-yards'].find(r=>r.name==='Derrick Henry').value,13552);
  const before=structuredClone(state),writeCount=writes;reading=false;fail=true;await assert.rejects(mod.refreshAllTimeMonitor('NFL'),/outage/);assert.equal(writes,writeCount);assert.deepEqual(state,before);reading=true;assert.deepEqual((await mod.getAllTimeLeaderboardFeed('NFL')).leaderboards,published.leaderboards);
  for(const category of Object.keys(thresholds))assert.equal(published.leaderboards['NFL:individual:career:'+category].length,25);
 }finally{globalThis.fetch=old;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});

test('a newly discovered incomplete career cannot publish when its aggregate identity or total is contradictory',async()=>{
 const {loadNflActiveCareerSource}=await import(await compileLocalModule(file('all-time-live-sources.ts'))),old=globalThis.fetch;
 try{
  for(const mutation of [x=>x.athlete.$ref=x.athlete.$ref.replace('14012','8439'),x=>x.$ref=x.$ref.replace('/statistics/0','/seasons/2026/statistics/0'),x=>x.splits.categories.find(c=>c.name==='passing').stats.find(s=>s.name==='passingYards').value=1]){
   const aggregate=structuredClone(coreOriginal);mutation(aggregate);
   globalThis.fetch=async url=>{
    const u=String(url);if(u.includes('/rosters/'))return new Response(csv);if(u.includes('/leaders/0'))return Response.json(feed);if(u.includes('/athletes/14012/statistics/0'))return Response.json(aggregate);
    return Response.json(originals[/athletes\/(\d+)\/stats/.exec(u)?.[1]]);
   };
   await assert.rejects(loadNflActiveCareerSource(),/aggregate/);
  }
 }finally{globalThis.fetch=old;}
});

test('release from a current roster does not erase qualifying discovery evidence or falsely label the player active',async()=>{
 const {loadNflActiveCareerSource}=await import(await compileLocalModule(file('all-time-live-sources.ts'))),old=globalThis.fetch;
 const released=csv.replace('ACT,Andy Dalton','CUT,Andy Dalton');assert.notEqual(released,csv);
 try{
  globalThis.fetch=async url=>{
   const u=String(url);if(u.includes('/rosters/'))return new Response(released);if(u.includes('/leaders/0'))return Response.json(feed);if(u.includes('/athletes/14012/statistics/0'))return Response.json(coreOriginal);
   return Response.json(originals[/athletes\/(\d+)\/stats/.exec(u)?.[1]]);
  };
  const result=await loadNflActiveCareerSource();const row=result.categories['passing-yards'].find(row=>row.playerId==='espn:nfl:14012');assert.equal(row.value,39792);assert.equal(row.isActive,false);
 }finally{globalThis.fetch=old;}
});
