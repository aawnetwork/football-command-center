import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reconcileWeek,evidenceReader} from '../scripts/cfb-season-retain.mjs';
import {normaliseCapture} from '../scripts/cfb-season-normalise.mjs';
import {prepareHandoff,hash,historyHash} from '../scripts/cfb-season-handoff.mjs';
const captured=JSON.parse(await readFile(new URL('./fixtures/cfb-final-week8.json',import.meta.url),'utf8'));
function fixture(week=8){
 const event=structuredClone(captured.scoreboard.events[0]);event.week={number:week};
 const ids=event.competitions[0].competitors.map(t=>t.team.id);
 const membership={season:2026,teams:Object.fromEntries([...new Set([...ids,...Array.from({length:130},(_,i)=>String(90000+i))])].map(id=>[id,{fbs:true}]))};
 const schedules=Object.keys(membership.teams).map(id=>({team:{id},season:{year:2026,type:2},events:ids.includes(id)?[{...structuredClone(event),seasonType:{type:2}}]:[]}));
 return {board:{season:{year:2026,type:2},week:{number:week},events:[event]},schedules,membership};
}
test('independent all-team schedule reconciliation rejects missing games, duplicate owners, truncation, wrong periods and unfinished weeks',()=>{
 const f=fixture();assert.equal(reconcileWeek(f.board,f.schedules,f.membership,8).count,1);
 for(const change of [f=>f.schedules.pop(),f=>f.board.events=[],f=>f.board.events.push(f.board.events[0]),f=>f.schedules[0].season.year=2025,f=>f.schedules[0].events=[],f=>f.board.events[0].competitions[0].status.type.completed=false,f=>f.schedules[0].team.id=f.schedules[1].team.id]){
  const f=fixture();change(f);assert.throws(()=>reconcileWeek(f.board,f.schedules,f.membership,8));
 }
});
test('real final Week 8 capture survives normalisation and contiguous 8→9→10 handoffs with exact hashes, no fabricated cells or positions',()=>{
 let base={season:2026,phase:'REG',columns:['completions','attempts','passing_yards','carries','rushing_yards','receiving_yards','def_interceptions'],players:[],games:[],teams:{},rows:[],sourceManifests:[]};
 let metadata={season:2026,throughWeek:7,names:{},positions:{},conferences:{},historySha256:historyHash(base)};
 // The real source payload is retained unchanged for Week 8; later weeks are
 // explicitly synthetic period/identity variants for rollover regression only.
 for(const week of [8,9,10]){
  const f=fixture(week),summary=structuredClone(captured.summary);summary.header.week=week;
  if(week!==8){summary.header.id=String(900000000+week);summary.header.competitions[0].id=summary.header.id;f.board.events[0].id=summary.header.id;f.board.events[0].competitions[0].id=summary.header.id;for(const schedule of f.schedules)for(const e of schedule.events){e.id=summary.header.id;e.competitions[0].id=summary.header.id;}}
  const manifest=reconcileWeek(f.board,f.schedules,f.membership,week),manifestHash=hash(manifest);
  const raw={source:'ESPN',game_id:summary.header.id,summary,summary_hash:hash(summary),observed_at:captured.observedAt,observation_basis:'retained test source'};
  const report={manifest_hash:manifestHash,game_observations_complete:true,stopped_after_failure:false,games:[{game_id:raw.game_id,observation:'validated'}]};
  const provenance={manifest_hash:manifestHash,requests:[{game_id:raw.game_id,summary_sha256:raw.summary_hash,response_received_at:raw.observed_at}]};
  const input={base,metadata,manifest,manifestHash,report,provenance,captures:new Map([[raw.game_id,raw]]),normaliseCapture};
  const result=prepareHandoff(input);assert.equal(result.metadata.throughWeek,week);assert.equal(result.metadata.historySha256,historyHash(result.history));assert.ok(result.history.rows.some(r=>r[4].includes(null)));assert.deepEqual(result.metadata.positions,{});
  const repeat=prepareHandoff({...input,base:result.history,metadata:result.metadata});assert.deepEqual(repeat.history,result.history);
  assert.throws(()=>prepareHandoff({...input,manifest:{...manifest,week:week+2},manifestHash:hash({...manifest,week:week+2})}));
  base=result.history;metadata=result.metadata;
 }
 assert.equal(base.games.length,3);assert.equal(new Set(base.rows.map(r=>r[0]+'|'+r[1])).size,base.rows.length);
});
test('provider failures and malformed responses never become cached zero data; successful evidence reuses original timestamps and rejects tampering',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cfb-retain-'));let calls=0;
 for(const request of [async()=>{throw Error('offline');},async()=>new Response('busy',{status:429}),async()=>new Response('not json')]){
  await assert.rejects(evidenceReader(dir,request)('failed','https://provider.test'));assert.deepEqual(await readdir(dir),[]);
 }
 const get=evidenceReader(dir,async()=>{calls++;return Response.json({value:null,zero:0});});
 const first=await get('source','https://provider.test'),second=await get('source','https://provider.test');assert.deepEqual(first,second);assert.equal(calls,1);assert.equal(first.value.value,null);assert.equal(first.value.zero,0);
 await writeFile(join(dir,'source.json'),JSON.stringify({...first,value:{zero:999}}));await assert.rejects(get('source','https://provider.test'));
});

test('full scheduled collector recovers a missed completed week into a restart-safe pair and leaves deployed files untouched',async()=>{
 const {retain}=await import('../scripts/cfb-season-retain.mjs');
 const historyPath=new URL('../app/lib/stats-v2/cfb-player-history.json',import.meta.url),metaPath=new URL('../app/lib/stats-v2/cfb-season-metadata.json',import.meta.url);
 const original=await readFile(historyPath,'utf8'),metaText=await readFile(metaPath,'utf8'),meta=JSON.parse(metaText),week=meta.throughWeek+1;
 if(week>16){
  const out=await mkdtemp(join(tmpdir(),'cfb-complete-season-'));const result=await retain({out,request:async()=>Response.json({season:{year:2026,type:3},week:{number:17},events:[]})});assert.equal(result.changed,false);return;
 }
 const event=structuredClone(captured.scoreboard.events[0]),summary=structuredClone(captured.summary);event.id=String(900000000+week);event.week.number=week;event.competitions[0].id=event.id;summary.header.id=event.id;summary.header.week=week;summary.header.competitions[0].id=event.id;
 const owners=event.competitions[0].competitors.map(t=>t.team.id);let calls=0;
 const request=async value=>{
  calls++;const url=new URL(value),team=url.pathname.match(/teams\/(\d+)\/schedule/),selected=url.searchParams.get('week');
  if(team)return Response.json({team:{id:team[1]},season:{year:2026,type:2},events:owners.includes(team[1])?[{...event,seasonType:{type:2}}]:[]});
  if(url.pathname.endsWith('/summary'))return Response.json(summary);
  return Response.json({season:{year:2026,type:2},week:{number:selected?Number(selected):week+1},events:selected?[event]:[]});
 };
 const out=await mkdtemp(join(tmpdir(),'cfb-full-retention-'));
 const result=await retain({out,request});assert.equal(result.throughWeek,week);assert.equal(result.changed,true);assert.ok(calls<400);
 const next=JSON.parse(await readFile(join(out,'cfb-player-history.json'),'utf8')),nextMeta=JSON.parse(await readFile(join(out,'cfb-season-metadata.json'),'utf8'));
 assert.equal(nextMeta.historySha256,historyHash(next));assert.equal(next.games.length,JSON.parse(original).games.length+1);assert.equal(nextMeta.throughWeek,week);
 assert.equal(await readFile(historyPath,'utf8'),original);assert.equal(await readFile(metaPath,'utf8'),metaText);
 const replay=await retain({out,request:()=>{throw Error('Cached replay must not request provider');}});assert.equal(replay.throughWeek,week);assert.equal(await readFile(join(out,'cfb-player-history.json'),'utf8'),JSON.stringify(next)+'\n');
 const failureOut=await mkdtemp(join(tmpdir(),'cfb-failed-retention-'));
 await assert.rejects(retain({out:failureOut,request:async()=>new Response('unavailable',{status:503})}));assert.ok(!(await readdir(failureOut)).includes('cfb-player-history.json'));
});

test('recovered real Week 8 exactly matches the pinned 56-game source review and preserves every Weeks 1–7 fact',async()=>{
 const history=JSON.parse(await readFile(new URL('../app/lib/stats-v2/cfb-player-history.json',import.meta.url),'utf8'));
 const review=JSON.parse(await readFile(new URL('../docs/data/cfb-week8-retention-review.json',import.meta.url),'utf8'));
 const games=history.games.filter(g=>g.week===8);assert.equal(games.length,56);assert.equal(review.games.length,56);assert.equal(review.reconciliation.checkedTeams,138);
 let records=0;
 for(const game of games){
  const proof=review.games.find(g=>'espn:cfb:game:'+g.id===game.id);assert.ok(proof);assert.equal(proof.summary_sha256,game.summarySha256);assert.equal(proof.response_received_at,game.observedAt);assert.equal(proof.kickoff,game.kickoff);
  const count=history.rows.filter(r=>history.games[r[1]].id===game.id).length;assert.equal(count,proof.records);records+=count;
 }
 assert.equal(records,3447);
 const prior={...history,games:history.games.slice(0,510),rows:history.rows.slice(0,29483),players:history.players.slice(0,7611),sourceManifests:history.sourceManifests.filter(m=>m.week<=7)};
 assert.equal(historyHash(prior),review.previousHistorySha256,'All prior facts must remain unchanged');
});
