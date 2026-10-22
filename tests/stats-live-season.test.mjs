import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const root=new URL('../',import.meta.url),cache=new Map();
async function compile(file){if(cache.has(file.href))return cache.get(file.href);let js=file.pathname.endsWith('.json')?'export default '+await readFile(file,'utf8'):ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const m of [...js.matchAll(/from (['"])(\.[^'"]+)\1/g)])js=js.replace(m[0],'from '+JSON.stringify(await compile(new URL(m[2]+(/\.(ts|json)$/.test(m[2])?'':'.ts'),file))));const out='data:text/javascript;base64,'+Buffer.from(js).toString('base64');cache.set(file.href,out);return out;}
const mod=async p=>import(await compile(new URL(p,root)));
const {GET}=await mod('app/api/cfb/stats-v2/route.ts');
const season=await mod('app/lib/stats-v2/cfb-season.ts'),reported=await mod('app/lib/stats-v2/cfb-reported-rankings.ts');
const {startCfbPolling}=await mod('app/preview/nfl-stats/cfb-polling.ts');
const {statsUpdateStatus}=await mod('app/preview/nfl-stats/update-status.ts');
const fixture=JSON.parse(await readFile(new URL('tests/fixtures/cfb-live-week8.json',root),'utf8'));
const history=JSON.parse(await readFile(new URL('app/lib/stats-v2/cfb-player-history.json',root),'utf8')),meta=JSON.parse(await readFile(new URL('app/lib/stats-v2/cfb-season-metadata.json',root),'utf8'));
const memberships=Object.entries(meta.conferences).map(([teamId,conferenceId])=>({season:2026,teamId,conferenceId,conferenceName:conferenceId}));
const makeModel=(s=fixture.summary,board=fixture.scoreboard)=>({...reported.buildReportedCfbModel({period:{season:2026,phase:'REG',week:8},observedAt:fixture.observedAt,events:board.events,summaries:[s],positions:season.retainedCfbPositions(),memberships}),events:board.events});
const id='espn:cfb:athlete:5220253';
const row=(body,id,key)=>body.lines.find(l=>l.id===id)?.values[body.columns.indexOf(key)];
test('captured live CFB observations plus changing/final/correction observations update Week and Season by exact identity',()=>{
 const base=season.buildCfbSeason(history,meta),baseline=base.lines.find(l=>l.id===id);assert.ok(baseline);console.log('James Jones historical rushing base:',baseline.metrics.rushing_yards);
 const first=makeModel(),one=season.withCfbSeasonLive(history,meta,first),live=first.lines.find(l=>l.id===id),total=one.lines.find(l=>l.id===id);
 assert.equal(live.playingNow,true);assert.equal(total.playingNow,true);assert.equal(live.metrics.rushing_yards.value,20);assert.equal(total.metrics.rushing_yards.value,baseline.metrics.rushing_yards.value+20);
 const second=structuredClone(fixture.summary),athlete=second.boxscore.players.find(b=>b.team.id==='166').statistics.find(g=>g.name==='rushing').athletes.find(r=>r.athlete.id==='5220253');athlete.stats[1]='45';athlete.stats[0]='10';
 const changed=makeModel(second),two=season.withCfbSeasonLive(history,meta,changed),updated=two.lines.find(l=>l.id===id);assert.equal(changed.lines.find(l=>l.id===id).metrics.rushing_yards.value,45);assert.equal(updated.metrics.rushing_yards.value,baseline.metrics.rushing_yards.value+45);
 const rank=(lines)=>[...lines].sort((a,b)=>(b.metrics.rushing_yards.value??-Infinity)-(a.metrics.rushing_yards.value??-Infinity)).findIndex(l=>l.id===id)+1;
 console.log('James Jones reported Season ranking:',rank(one.lines),'->',rank(two.lines));assert.notEqual(rank(one.lines),rank(two.lines));
 assert.equal(updated.metrics.rushing_yards_per_carry.value,updated.metrics.rushing_yards.value/updated.metrics.carries.value);
 assert.equal(season.withCfbSeasonLive(history,meta,changed).lines.find(l=>l.id===id).metrics.rushing_yards.value,updated.metrics.rushing_yards.value,'repeat refresh must not increment');
 const board=structuredClone(fixture.scoreboard);board.events[0].competitions[0].status.type={state:'post',completed:true};second.header.competitions[0].status.type={state:'post',completed:true};
 const final=season.withCfbSeasonLive(history,meta,makeModel(second,board)).lines.find(l=>l.id===id);assert.equal(final.playingNow,false);assert.equal(final.metrics.rushing_yards.value,updated.metrics.rushing_yards.value);
 athlete.stats[1]='44';assert.equal(season.withCfbSeasonLive(history,meta,makeModel(second,board)).lines.find(l=>l.id===id).metrics.rushing_yards.value,baseline.metrics.rushing_yards.value+44,'late correction replaces current game');
 const missing=makeModel();missing.lines=[];const absent=season.withCfbSeasonLive(history,meta,missing).lines.find(l=>l.id===id);assert.equal(absent.metrics.rushing_yards.value,null,'missing current game must not regress to base as if current contribution were zero');
 const future=makeModel();future.period.week=9;assert.throws(()=>season.withCfbSeasonLive(history,meta,future),/intervening completed weeks/);
 console.log('Changing real-player replay:',live.metrics.rushing_yards.value,'->',45,'season',total.metrics.rushing_yards.value,'->',updated.metrics.rushing_yards.value);
});
test('real CFB current-model aggregation supports all four categories, independent stints and missing versus zero',()=>{
 const current=makeModel(),combined=season.withCfbSeasonLive(history,meta,current);
 for(const cat of ['QB','Rush','Rec','Def']){const candidates=current.lines.filter(l=>l.categories.includes(cat));assert.ok(candidates.length,cat);for(const live of candidates){const line=combined.lines.find(l=>l.id===live.id);if(line)assert.equal(line.playingNow,true);}}
 const baseline=season.buildCfbSeason(history,meta);
 for(const [cat,key]of [['QB','passing_yards'],['Rush','rushing_yards'],['Rec','receiving_yards'],['Def','tackles']]){
  const live=current.lines.find(l=>l.categories.includes(cat)&&typeof l.metrics[key]?.value==='number'&&typeof baseline.lines.find(b=>b.id===l.id)?.metrics[key]?.value==='number');
  assert.ok(live,'retained base plus current '+cat);const base=baseline.lines.find(b=>b.id===live.id),total=combined.lines.find(l=>l.id===live.id);assert.equal(total.metrics[key].value,base.metrics[key].value+live.metrics[key].value);
 }
 const once=season.withCfbSeasonLive(history,meta,current),again=season.withCfbSeasonLive(history,meta,current);assert.deepEqual(once.lines,again.lines);
 const tj=once.lines.find(l=>l.id==='espn:cfb:athlete:5076584');assert.ok(tj.playingNow);assert.ok(tj.categories.includes('Rec'));assert.ok(tj.categories.includes('Rush'));
});
test('actual CFB Week/Season response snapshots, polling status and details use changing sources without per-card fetches',async()=>{
 const saved=globalThis.fetch,flag=process.env.AAW_STATS_V2_LOCAL_PREVIEW;process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';let current=structuredClone(fixture.summary),calls=0;
 const conferences={season:{year:2026},children:[...new Set(memberships.map(m=>m.conferenceId))].map(id=>({id,name:id,isConference:true,standings:{season:2026,seasonType:2,entries:memberships.filter(m=>m.conferenceId===id).map(m=>({team:{id:m.teamId}}))}}))};
 globalThis.fetch=async input=>{calls++;const u=new URL(String(input));if(u.pathname.endsWith('/scoreboard'))return Response.json(fixture.scoreboard);if(u.pathname.endsWith('/summary'))return Response.json(current);if(u.pathname.endsWith('/standings'))return Response.json(conferences);throw Error('No additional evidence '+u.pathname);};
 try{
  const get=async query=>{const r=await GET(new Request('http://local/?'+query));const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));return b;};
  const w=await get('category=Rush'),s=await get('mode=season&category=Rush');assert.ok(w.lines.find(l=>l.id===id).playingNow);assert.ok(s.lines.find(l=>l.id===id).playingNow);assert.equal(s.liveWeek,8);assert.equal(s.observationRange.through,s.observationAt);assert.ok(s.coveredGames>510);
  const before=calls;await get('mode=season&view=details&snapshot='+s.snapshot+'&players='+id);assert.equal(calls,before);
  current.boxscore.players.find(b=>b.team.id==='166').statistics.find(g=>g.name==='rushing').athletes.find(a=>a.athlete.id==='5220253').stats[1]='45';
  const w2=await get('category=Rush'),s2=await get('mode=season&category=Rush');assert.equal(row(w2,id,'rushing_yards')-row(w,id,'rushing_yards'),25);assert.equal(row(s2,id,'rushing_yards')-row(s,id,'rushing_yards'),25);
  const status=await get('mode=season&view=status');assert.ok(status.games.some(g=>g.live));assert.match(statsUpdateStatus(s2,Date.now(),false,false).cadence,/LIVE/);
  assert.notEqual(s.snapshot,s2.snapshot);assert.match(s2.sourceAttribution,/base through Week 7.*Week 8/);
  const values=[];let timer;
  const stop=startCfbPolling({historical:false,currentWeek:true,refresh:async()=>{values.push(row(await get('mode=season&category=Rush'),id,'rushing_yards'));return true;},status:async()=>(await get('mode=season&view=status')).games,report(){},schedule:(run,delay)=>{timer={run,delay};return 1;},cancel(){}});
  await new Promise(r=>setImmediate(r));assert.equal(timer.delay,30000);
  current.boxscore.players.find(b=>b.team.id==='166').statistics.find(g=>g.name==='rushing').athletes.find(a=>a.athlete.id==='5220253').stats[1]='55';
  timer.run();await new Promise(r=>setImmediate(r));stop();assert.equal(values.at(-1)-values[0],10,'adaptive Season timer fetches and applies changed statistics');

 }finally{globalThis.fetch=saved;if(flag===undefined)delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;else process.env.AAW_STATS_V2_LOCAL_PREVIEW=flag;}
});
test('retained Week 8 base survives restart and accepts Week 9 without duplicate retained contributions',()=>{
 const base8=structuredClone(history),meta8=structuredClone(meta),live8=makeModel();
 const james=live8.lines.find(l=>l.id===id),g=james.games[0];let pi=base8.players.indexOf(id);
 const e=fixture.scoreboard.events[0],c=e.competitions[0];const gi=base8.games.length;
 base8.games.push({id:g.gameId,week:8,kickoff:g.kickoff,observedAt:g.observedAt,home:c.competitors.find(p=>p.homeAway==='home').team.id,away:c.competitors.find(p=>p.homeAway==='away').team.id});
 base8.rows.push([pi,gi,g.team,g.opponent,base8.columns.map(k=>g.metrics[k]?.value??null)]);meta8.throughWeek=8;
 // Serialization models a new process with no in-flight response state.
 const restarted=JSON.parse(JSON.stringify(base8)),m=JSON.parse(JSON.stringify(meta8));
 const retained=season.buildCfbSeason(restarted,m).lines.find(l=>l.id===id);assert.equal(retained.metrics.rushing_yards.value,619);
 const fixed=season.buildCfbSeason(restarted,m,null,7).lines.find(l=>l.id===id);assert.equal(fixed.metrics.rushing_yards.value,599);
 const week9=structuredClone(live8);week9.period.week=9;week9.lines=week9.lines.filter(l=>l.id===id);week9.events[0].id='999999999';
 week9.lines[0].games[0]={...g,gameId:'espn:cfb:game:999999999',week:9};
 const combined=season.withCfbSeasonLive(restarted,m,week9).lines.find(l=>l.id===id);assert.equal(combined.metrics.rushing_yards.value,639);assert.equal(combined.playingNow,true);
 assert.equal(season.withCfbSeasonLive(restarted,m,week9).lines.find(l=>l.id===id).metrics.rushing_yards.value,639);
});
test('bounded fresh provider observation replays through actual Week and Season response paths',{skip:!process.env.AAW_CFB_OBSERVATION_FILE},async()=>{
 const fresh=JSON.parse(await readFile(process.env.AAW_CFB_OBSERVATION_FILE,'utf8'));
 const savedFetch=globalThis.fetch,flag=process.env.AAW_STATS_V2_LOCAL_PREVIEW;process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';let supplied=fixture;
 const conferences={season:{year:2026},children:[...new Set(memberships.map(m=>m.conferenceId))].map(id=>({id,name:id,isConference:true,standings:{season:2026,seasonType:2,entries:memberships.filter(m=>m.conferenceId===id).map(m=>({team:{id:m.teamId}}))}}))};
 globalThis.fetch=async input=>{const u=new URL(String(input));if(u.pathname.endsWith('/scoreboard'))return Response.json(supplied.scoreboard);if(u.pathname.endsWith('/summary'))return Response.json(supplied.summary);if(u.pathname.endsWith('/standings'))return Response.json(conferences);throw Error('No additional provider requests');};
 try{
  const get=async mode=>{const r=await GET(new Request('http://local/?category=Rush'+(mode?'&mode=season':'')));assert.equal(r.status,200);return r.json();};
  const weekBefore=await get(false),seasonBefore=await get(true);supplied=fresh;
  const weekAfter=await get(false),seasonAfter=await get(true);
  const value=(body)=>row(body,id,'rushing_yards'),line=body=>body.lines.find(l=>l.id===id);
  const rank=body=>[...body.lines].filter(l=>l.values[body.columns.indexOf('rushing_yards')]!==null).sort((a,b)=>b.values[body.columns.indexOf('rushing_yards')]-a.values[body.columns.indexOf('rushing_yards')]).findIndex(l=>l.id===id)+1;
  assert.equal(value(weekBefore),20);assert.equal(value(weekAfter),178);assert.equal(value(seasonBefore),619);assert.equal(value(seasonAfter),777);
  assert.equal(line(weekBefore).playingNow,true);assert.equal(line(seasonBefore).playingNow,true);assert.equal(line(weekAfter).playingNow,false);assert.equal(line(seasonAfter).playingNow,false);
  assert.notEqual(rank(seasonBefore),rank(seasonAfter));assert.equal(value(await get(true)),777);
  console.log('REAL retained-live -> fresh-final:',JSON.stringify({week:[value(weekBefore),value(weekAfter)],season:[value(seasonBefore),value(seasonAfter)],reportedSeasonPosition:[rank(seasonBefore),rank(seasonAfter)],playingNow:[true,false],finalObservedAt:fresh.observedAt}));
 }finally{globalThis.fetch=savedFetch;if(flag===undefined)delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;else process.env.AAW_STATS_V2_LOCAL_PREVIEW=flag;}
});
test('production-gated CFB Week/Season keep the real final contribution after scoreboard disappearance, fresh handler and correction',async()=>{
 const final=JSON.parse(await readFile(new URL('tests/fixtures/cfb-final-week8.json',root),'utf8'));
 const route=await mod('app/lib/stats-v2/cfb-server.ts');
 const env={...process.env},saved=globalThis.fetch;let supplied=fixture,omitted=false;
 process.env.AAW_STATS_V2_RELEASE='1';process.env.NEXT_PUBLIC_AAW_STATS_V2_RELEASE='1';process.env.VERCEL='1';delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;
 const conferences={season:{year:2026},children:[...new Set(memberships.map(m=>m.conferenceId))].map(id=>({id,name:id,isConference:true,standings:{season:2026,seasonType:2,entries:memberships.filter(m=>m.conferenceId===id).map(m=>({team:{id:m.teamId}}))}}))};
 let summaryRequests=0;
 globalThis.fetch=async input=>{const u=new URL(String(input));if(u.pathname.endsWith('/scoreboard'))return Response.json({...supplied.scoreboard,events:omitted?[]:supplied.scoreboard.events});if(u.pathname.endsWith('/summary')){summaryRequests++;return u.searchParams.get('event')==='401871070'?Response.json(supplied.summary):new Response(null,{status:503});}if(u.pathname.endsWith('/standings'))return Response.json(conferences);throw Error('Unexpected source '+u);};
 try{
  let handler=route.createCfbStatsV2Route();const get=async seasonMode=>{const r=await handler(new Request('http://local/?category=Rush'+(seasonMode?'&mode=season':'')));assert.equal(r.status,200);return r.json();};
  const beforeWeek=await get(false),beforeSeason=await get(true);assert.equal(row(beforeWeek,id,'rushing_yards'),20);assert.equal(row(beforeSeason,id,'rushing_yards'),619);assert.ok(beforeWeek.lines.find(l=>l.id===id).playingNow);assert.ok(beforeSeason.lines.find(l=>l.id===id).playingNow);
  supplied=final;const after=await get(true);assert.equal(row(after,id,'rushing_yards'),777);assert.equal(after.lines.find(l=>l.id===id).playingNow,false);
  const rank=body=>1+body.lines.filter(l=>l.values[body.columns.indexOf('rushing_yards')]!==null&&l.values[body.columns.indexOf('rushing_yards')]>row(body,id,'rushing_yards')).length;assert.notEqual(rank(beforeSeason),rank(after));
  omitted=true;handler=route.createCfbStatsV2Route();const week=await get(false),seasonBody=await get(true);assert.equal(row(week,id,'rushing_yards'),178);assert.equal(row(seasonBody,id,'rushing_yards'),777);assert.equal(rank(seasonBody),rank(after));assert.equal(seasonBody.lines.find(l=>l.id===id).playingNow,false);assert.ok(summaryRequests>0);
  assert.equal(row(await get(true),id,'rushing_yards'),777);
  supplied=structuredClone(final);supplied.summary.boxscore.players.find(b=>b.team.id==='166').statistics.find(g=>g.name==='rushing').athletes.find(a=>a.athlete.id==='5220253').stats[1]='177';
  assert.equal(row(await get(false),id,'rushing_yards'),177);assert.equal(row(await get(true),id,'rushing_yards'),776);
  delete process.env.AAW_STATS_V2_RELEASE;assert.equal((await handler(new Request('http://local/?category=Rush'))).status,404,'public build/server release gates must agree');
 }finally{globalThis.fetch=saved;for(const key of ['AAW_STATS_V2_RELEASE','NEXT_PUBLIC_AAW_STATS_V2_RELEASE','VERCEL','AAW_STATS_V2_LOCAL_PREVIEW']){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}}
});
test('retained discovery rejects duplicate or contradictory game, team and period identities',async()=>{
 const {stableGameDiscovery,observedGame}=await mod('app/lib/stats-v2/stable-game-discovery.ts');
 const final=JSON.parse(await readFile(new URL('tests/fixtures/cfb-final-week8.json',root),'utf8'));
 const board=stableGameDiscovery({...final.scoreboard,events:[]},'CFB');assert.equal(board.events.length,56);const event=board.events.find(e=>e.id==='401871070');assert.ok(event);
 for(const mutate of [s=>s.header.season.year=2025,s=>s.header.week=9,s=>s.header.id='999',s=>s.header.competitions[0].competitors[0].team.id='999']){const wrong=structuredClone(final.summary);mutate(wrong);assert.throws(()=>observedGame(event,wrong,2026,8));}
 const conflict=structuredClone(final.scoreboard);conflict.events[0].competitions[0].competitors[0].team.id='999';assert.throws(()=>stableGameDiscovery(conflict,'CFB'),/identity conflict/);
 assert.throws(()=>stableGameDiscovery({...final.scoreboard,events:[final.scoreboard.events[0],final.scoreboard.events[0]]},'CFB'),/Duplicate/);
 const expected={season:2026,week:8,events:[event,event]};assert.throws(()=>stableGameDiscovery({...final.scoreboard,events:[]},'CFB',expected),/manifest/);
});
