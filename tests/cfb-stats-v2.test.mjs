import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Compile the real local module graph in memory; no Next server, source writes
// or production/environment credentials. One cache preserves shared singletons.
const compiled = new Map();
async function compile(file) {
  const path = file.href;
  if (compiled.has(path)) return compiled.get(path);
  if (file.pathname.endsWith('.json')) {
    const url = 'data:text/javascript;base64,' + Buffer.from('export default ' + await readFile(file, 'utf8')).toString('base64'); compiled.set(path, url); return url;
  }
  let js = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const match of [...js.matchAll(/from (['"])(\.[^'"]+)\1/g)]) {
    const dependency = new URL(match[2] + (/\.(ts|json)$/.test(match[2]) ? '' : '.ts'), file);
    js = js.replace(match[0], `from ${JSON.stringify(await compile(dependency))}`);
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64'); compiled.set(path, url); return url;
}
const file = path => new URL('../' + path, import.meta.url);

const { buildCfbStatlines, filterCfbConference } = await import(await compile(file('app/lib/stats-v2/cfb-statlines.ts')));
const now='2026-10-20T18:00:00Z';
function fixture(week=8,team='2390',id='101') {
 const competition={id,status:{type:{state:'in',completed:false}},competitors:[{homeAway:'home',team:{id:team,displayName:team==='2390'?'Miami (Ohio)':'Miami',logo:'https://a.espncdn.com/test.png'}},{homeAway:'away',team:{id:'130',displayName:'Michigan'}}]};
 const event={id,date:'2026-10-20T17:00Z',week:{number:week},season:{year:2026,type:2},competitions:[competition]};
 const summary={header:{id,season:{year:2026,type:2},week,competitions:[competition]},boxscore:{players:[{team:{id:team},statistics:[
  {name:'passing',labels:['C/ATT','YDS','TD','INT'],athletes:[{athlete:{id:'123',displayName:'Same Name'},stats:['1/2','30','0','0']}]},
  {name:'rushing',labels:['CAR','YDS','TD'],athletes:[{athlete:{id:'123',displayName:'Same Name'},stats:['1','-2','0']}]},
  {name:'receiving',labels:['REC','YDS','TD'],athletes:[{athlete:{id:'124',displayName:'Same Name'},stats:['0','0','0']}]},
  {name:'defensive',labels:['TOT','SOLO','SACKS','TFL'],athletes:[{athlete:{id:'125',displayName:'Defender'},stats:['3','2','0.5','1.5']}]}
 ]},{team:{id:'130'},statistics:[]}]}};return {event,summary};
}
function build(fixtures=[fixture()],extra={}) {
 return buildCfbStatlines({period:{season:2026,phase:'REG',week:null},observedAt:now,events:fixtures.map(f=>f.event),summaries:fixtures.map(f=>f.summary),...extra});
}
test('CFB QB needs explicit positions; activity categories keep zero, missing and low participation',()=>{
 const unknown=build();assert.equal(unknown.lines.find(p=>p.id.endsWith(':123')).categories.includes('QB'),false);
 const model=build(undefined,{positions:[{season:2026,teamId:'2390',athleteId:'123',position:'QB'}]});
 const qb=model.lines.find(p=>p.id.endsWith(':123'));assert.deepEqual(qb.categories,['QB','Rush']);assert.equal(qb.metrics.completion_pct.value,50);assert.equal(qb.metrics.rushing_yards.value,-2);assert.equal(qb.playingNow,true);
 const receiver=model.lines.find(p=>p.id.endsWith(':124'));assert.equal(receiver.metrics.receptions.value,0);assert.equal(receiver.metrics.targets.value,null);assert.equal(receiver.metrics.receiving_yards_per_reception.state,'not-applicable');
 const defender=model.lines.find(p=>p.id.endsWith(':125'));assert.equal(defender.metrics.tackles.value,3);assert.equal(defender.metrics.def_tackle_assists.value,null);assert.equal(defender.metrics.def_sacks.value,.5);
 assert.equal(model.complete,false);assert.equal(model.lines.filter(p=>p.name==='Same Name').length,2);
});
test('CFB conference filter uses own team, selected season and team stints without name guesses',()=>{
 const a=fixture(),b=fixture(9,'239','102');
 b.summary.boxscore.players[0].statistics[0].athletes[0].stats=['3/3','90','1','0'];
 const memberships=[{season:2026,teamId:'2390',conferenceId:'MAC',conferenceName:'MAC'},{season:2026,teamId:'239',conferenceId:'ACC',conferenceName:'ACC'},{season:2025,teamId:'2390',conferenceId:'OLD',conferenceName:'Old'},{season:2026,teamId:'130',conferenceId:'B1G',conferenceName:'Big Ten'}];
 const model=build([a,b],{memberships});const combined=model.lines.find(p=>p.id.endsWith(':123'));
 assert.equal(combined.metrics.completion_pct.value,80);assert.equal(combined.metrics.passing_yards.value,120);assert.equal(combined.stints.length,2);
 assert.equal(filterCfbConference(model,'MAC').find(p=>p.id.endsWith(':123')).metrics.passing_yards.value,30);
 assert.equal(filterCfbConference(model,'ACC').find(p=>p.id.endsWith(':123')).metrics.passing_yards.value,90);
 assert.equal(filterCfbConference(model,'B1G').length,0);assert.equal(filterCfbConference(model,'OLD').length,0);
 assert.equal(filterCfbConference(build(),'MAC').length,0);
 const conflict=build([a],{memberships:[...memberships,{season:2026,teamId:'2390',conferenceId:'ACC',conferenceName:'ACC'}]});assert.equal(filterCfbConference(conflict,'MAC').length,0);
});
test('CFB rejects wrong seasons, phases, games, duplicate identities and conflicting positions',()=>{
 for(const mutate of [f=>f.event.season.year=2025,f=>f.event.season.type=3,f=>f.summary.header.id='999',f=>f.event.week={},f=>f.event.date='invalid']){const f=fixture();mutate(f);assert.equal(build([f]).lines.length,0);}
 const repeated=fixture();assert.equal(build([repeated,repeated]).lines.length,0);
 const dup=fixture();dup.summary.boxscore.players[0].statistics[0].athletes.push(dup.summary.boxscore.players[0].statistics[0].athletes[0]);assert.equal(build([dup]).lines.some(p=>p.id.endsWith(':123')),false);
 const positions=[{season:2026,teamId:'2390',athleteId:'123',position:'QB'},{season:2026,teamId:'2390',athleteId:'123',position:'WR'}];assert.equal(build(undefined,{positions}).lines[0].categories.includes('QB'),false);
});
test('CFB corrections rebuild totals and live-to-final transitions preserve namespaced identity',()=>{
 const f=fixture();const first=build([f]);f.summary.boxscore.players[0].statistics[1].athletes[0].stats[1]='12';f.event.competitions[0].status.type={state:'post',completed:true};const corrected=build([f]);assert.equal(corrected.lines[0].id,first.lines[0].id);assert.equal(corrected.lines[0].metrics.rushing_yards.value,12);assert.equal(corrected.lines[0].playingNow,false);assert.equal(first.lines[0].metrics.rushing_yards.value,-2);
});
test('CFB local route shares active downloads, never fetches per card, refreshes live season, blocks exports and defaults off',async()=>{
 const routeModule=await import(await compile(file('app/lib/stats-v2/cfb-server.ts'))),route={GET:routeModule.createCfbStatsV2Route(board=>board)};const saved=globalThis.fetch, flag=process.env.AAW_STATS_V2_LOCAL_PREVIEW;
 let calls=0;const f=fixture();
 try {
 delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;assert.equal((await route.GET(new Request('http://local/?view=leaders&category=Rush'))).status,404);
 process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';globalThis.fetch=async url=>{calls++;await new Promise(resolve=>setTimeout(resolve,2));const text=String(url);if(text.includes('/roster')){const id=text.match(/teams\/(\d+)/)[1];return Response.json({season:{year:2026},team:{id},athletes:[{items:id==='2390'?[{id:'123',position:{abbreviation:'QB'}}]:[]}]});}if(text.includes('/standings'))return Response.json({season:{year:2026},children:[]});return Response.json(text.includes('scoreboard')?{leagues:[{season:{year:2026,type:{type:2}}}],week:{number:8},events:[f.event]}:f.summary);};
 const req=query=>route.GET(new Request('http://local/?'+query));
 const results=await Promise.all([req('category=Rush'),req('category=Rec')]);const body=await results[0].json();assert.equal(calls,4);assert.equal(body.lines.length,1);assert.equal(body.complete,false);
 const details=await req('view=details&snapshot='+body.snapshot+'&players='+body.lines[0].id);assert.equal(details.status,200);assert.equal(calls,4);
 assert.equal((await req('mode=season&category=Rush')).status,200);assert.equal((await req('view=export')).status,409);assert.equal((await req('week=0&category=Rush')).status,400);assert.equal(calls,6);
 await req('category=Rush');assert.equal(calls,8);
 } finally {globalThis.fetch=saved;if(flag===undefined)delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;else process.env.AAW_STATS_V2_LOCAL_PREVIEW=flag;}
});

test('CFB season metadata and covered-game confidence never guess affiliations or claim full FBS coverage',async()=>{
 const {cfbRosterPositions,cfbConferenceMemberships,cfbAthletePosition}=await import(await compile(file('app/lib/stats-v2/cfb-metadata.ts')));
 const {cfbCoveredConfidence}=await import(await compile(file('app/lib/stats-v2/cfb-confidence.ts')));
 const roster={season:{year:2026},team:{id:'2390'},athletes:[{items:[{id:'123',position:{abbreviation:'QB'}}]}]};
 assert.equal(cfbRosterPositions(roster,'2390',2026)[0].position,'QB');assert.throws(()=>cfbRosterPositions(roster,'193',2026));assert.throws(()=>cfbRosterPositions(roster,'2390',2025));
 assert.equal(cfbAthletePosition({season:{year:2026},athlete:{id:'123',team:{id:'2390'},position:{abbreviation:'P'}}},'123','2390',2026)[0].position,'P');assert.throws(()=>cfbAthletePosition({season:{year:2025}},'123','2390',2026));
 const group={season:{year:2026},children:[{isConference:true,id:'1',name:'ACC',standings:{season:2026,seasonType:2,entries:[{team:{id:'2390'}}]}}]};assert.equal(cfbConferenceMemberships(group,2026)[0].conferenceId,'1');assert.throws(()=>cfbConferenceMemberships(group,2025));
 const model=build(undefined,{positions:cfbRosterPositions(roster,'2390',2026)});const confidence=cfbCoveredConfidence(model,1,1);assert.equal(confidence.QB.passing_yards.status,'verified');assert.equal(confidence.QB.passing_yards.scope,'supplied-games');assert.equal(model.complete,false);assert.notEqual(cfbCoveredConfidence(model,2,1).QB.passing_yards.status,'verified');model.lines[0].metrics.attempts={state:'missing',value:null};assert.notEqual(cfbCoveredConfidence(model,1,1).QB.attempts.status,'verified');
});

test('explicit negative-ID Team observations stay separate; a verified punter is not a quarterback',()=>{
 const f=fixture();f.summary.boxscore.players[0].statistics[0].athletes.push({athlete:{id:'-1',displayName:' Team'},stats:['0/1','0','0','0']});
 const model=build([f],{positions:[{season:2026,teamId:'2390',athleteId:'123',position:'P'}]});assert.equal(model.teamContext.length,1);assert.equal(model.teamContext[0].stats[0],'0/1');assert.equal(model.lines.some(line=>line.categories.includes('QB')),false);assert.equal(model.lines[0].metrics.attempts.value,2);assert.equal(model.issues.includes('Player identity unavailable'),false);
});

test('temporary CFB position failure excludes unresolved QBs explicitly without suppressing verified activity categories',async()=>{
 const routeModule=await import(await compile(file('app/lib/stats-v2/cfb-server.ts'))),route={GET:routeModule.createCfbStatsV2Route(board=>board)};const saved=globalThis.fetch,flag=process.env.AAW_STATS_V2_LOCAL_PREVIEW;const f=fixture(9,'239','103');
 try{process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';globalThis.fetch=async url=>String(url).includes('scoreboard')?Response.json({season:{year:2026,type:2},week:{number:9},events:[f.event]}):String(url).includes('summary')?Response.json(f.summary):String(url).includes('standings')?Response.json({season:{year:2026},children:[]}):new Response('',{status:503});const response=await route.GET(new Request('http://fixture/?week=9&category=QB'));assert.equal(response.status,200);const body=await response.json();assert.equal(body.lines.length,0);assert.equal(body.collection.unresolvedPassers,1);assert.equal(body.confidence.passing_yards.status,'unverified');assert.equal(body.complete,false);const rush=await(await route.GET(new Request('http://fixture/?week=9&category=Rush'))).json();assert.equal(rush.lines.length,1);}finally{globalThis.fetch=saved;if(flag===undefined)delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;else process.env.AAW_STATS_V2_LOCAL_PREVIEW=flag;}
});

test('future CFB fixtures do not invalidate available live player facts; passed-kickoff gaps are not ignored',()=>{
 const active=fixture(),later=fixture(8,'239','102');later.event.date='2026-10-21T17:00Z';later.event.competitions[0].status.type={state:'pre',completed:false};later.summary=null;
 const positions=[{season:2026,teamId:'2390',athleteId:'123',position:'QB'}];const model=build([active,later],{positions});assert.equal(model.issues.length,0);assert.equal(model.lines[0].metrics.passing_yards.value,30);assert.equal(model.lines[0].playingNow,true);
 later.event.date='2026-10-20T17:00Z';assert.ok(build([active,later],{positions}).issues.includes('Game identity or boxscore unavailable'));
});

test('CFB schedule discovery uses the verified limit and processes more than 25 games without certifying missing boxscores', async () => {
 const routeModule=await import(await compile(file('app/lib/stats-v2/cfb-server.ts'))),route={GET:routeModule.createCfbStatsV2Route(board=>board)}, saved=globalThis.fetch, flag=process.env.AAW_STATS_V2_LOCAL_PREVIEW;
 const games=Array.from({length:62},(_,i)=>fixture(6,'2390',String(8000+i)).event), requested=[];let scoreboardCalls=0;
 try {
  process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';
  globalThis.fetch=async input=>{
   const url=new URL(String(input));
   if(url.pathname.endsWith('/scoreboard')){
    scoreboardCalls++;
    assert.equal(url.searchParams.get('groups'),'80');assert.equal(url.searchParams.get('week'),'6');assert.equal(url.searchParams.get('dates'),'2026');assert.equal(url.searchParams.get('seasontype'),'2');
    assert.equal(url.searchParams.get('limit'),'100','oversized limit=1000 returns the truncated 25-game response');
    return Response.json({season:{year:2026,type:2},week:{number:7},events:games});
   }
   if(url.pathname.endsWith('/standings'))return Response.json({season:{year:2026},children:[]});
   assert.ok(url.pathname.endsWith('/summary'));requested.push(url.searchParams.get('event'));
   return new Response('',{status:503});
  };
  const response=await route.GET(new Request('http://fixture/?week=6&category=QB'));
  assert.equal(scoreboardCalls,1);assert.deepEqual(requested,games.map(game=>game.id));assert.equal(new Set(requested).size,62);
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.lines.length,0);assert.equal(body.collection.missingGames,62);assert.equal(body.complete,false);assert.equal(body.confidence.passing_yards.status,'unverified');
 } finally {globalThis.fetch=saved;if(flag===undefined)delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;else process.env.AAW_STATS_V2_LOCAL_PREVIEW=flag;}
});

test('reviewed Week 7 actual local route serves all offensive candidates and details without upstream calls', async () => {
 const {createHash}=await import('node:crypto');
 const routeModule=await import(await compile(file('app/lib/stats-v2/cfb-server.ts'))),route={GET:routeModule.createCfbStatsV2Route(board=>board)};
 const saved=globalThis.fetch, flag=process.env.AAW_STATS_V2_LOCAL_PREVIEW, hosted=process.env.VERCEL;
 const expected={"hashes":{"QB":"b092551ab6807fd5b375f75be0a763d9fed3a5ce6ab3d2906234a19ed4bf5d2c","Rush":"ed53dfe0a99e8f4619863564ab8150f2bd8b050d11010b1109ea39cd66e96129","Rec":"df63ada98cfae4750bf7f833a798f55b1f605653b14d38e7ef6032ca35e884f4"},"nonQbs":["espn:cfb:athlete:5157266","espn:cfb:athlete:5236210","espn:cfb:athlete:5083103","espn:cfb:athlete:4837193","espn:cfb:athlete:5123988","espn:cfb:athlete:5296027","espn:cfb:athlete:4870876","espn:cfb:athlete:4899366","espn:cfb:athlete:5154245","espn:cfb:athlete:4569262","espn:cfb:athlete:4919037","espn:cfb:athlete:4916888","espn:cfb:athlete:5326947"],"nonFbs":["espn:cfb:athlete:5224320","espn:cfb:athlete:5298251","espn:cfb:athlete:5298252","espn:cfb:athlete:5402478","espn:cfb:athlete:5402482","espn:cfb:athlete:5157412","espn:cfb:athlete:5164751","espn:cfb:athlete:5402476","espn:cfb:athlete:5254264","espn:cfb:athlete:5095773","espn:cfb:athlete:5164740","espn:cfb:athlete:5164726","espn:cfb:athlete:5224334","espn:cfb:athlete:4869609","espn:cfb:athlete:5224339","espn:cfb:athlete:5298255","espn:cfb:athlete:5402497","espn:cfb:athlete:5298263","espn:cfb:athlete:5089109","espn:cfb:athlete:5298266","espn:cfb:athlete:5449384","espn:cfb:athlete:5224329","espn:cfb:athlete:5298288","espn:cfb:athlete:5402493","espn:cfb:athlete:5298258","espn:cfb:athlete:5164723","espn:cfb:athlete:5219461","espn:cfb:athlete:5224359","espn:cfb:athlete:5298256","espn:cfb:athlete:5402489","espn:cfb:athlete:4876588","espn:cfb:athlete:5086886","espn:cfb:athlete:5298250","espn:cfb:athlete:5298289","espn:cfb:athlete:5402485","espn:cfb:athlete:5402484","espn:cfb:athlete:5402517","espn:cfb:athlete:4695602","espn:cfb:athlete:5302081","espn:cfb:athlete:5223107","espn:cfb:athlete:4832849","espn:cfb:athlete:5230060","espn:cfb:athlete:5230050","espn:cfb:athlete:5302082","espn:cfb:athlete:4695743","espn:cfb:athlete:5431301","espn:cfb:athlete:5089455","espn:cfb:athlete:5441543","espn:cfb:athlete:5168686","espn:cfb:athlete:5085498","espn:cfb:athlete:5230065","espn:cfb:athlete:5302086","espn:cfb:athlete:5157273","espn:cfb:athlete:5441535","espn:cfb:athlete:5088881","espn:cfb:athlete:5433816","espn:cfb:athlete:5304076","espn:cfb:athlete:5230053","espn:cfb:athlete:5085851","espn:cfb:athlete:5088148","espn:cfb:athlete:5153428","espn:cfb:athlete:5162969","espn:cfb:athlete:5088151","espn:cfb:athlete:5095783","espn:cfb:athlete:5164042","espn:cfb:athlete:5173937","espn:cfb:athlete:5230048","espn:cfb:athlete:5230078","espn:cfb:athlete:5302085","espn:cfb:athlete:5302101","espn:cfb:athlete:5302106","espn:cfb:athlete:4489406","espn:cfb:athlete:5088871","espn:cfb:athlete:5153449","espn:cfb:athlete:5230067","espn:cfb:athlete:5230077","espn:cfb:athlete:5306282","espn:cfb:athlete:5302084","espn:cfb:athlete:5151062","espn:cfb:athlete:5405043","espn:cfb:athlete:5155783","espn:cfb:athlete:5162540","espn:cfb:athlete:5405049","espn:cfb:athlete:5086540","espn:cfb:athlete:4877774","espn:cfb:athlete:560158","espn:cfb:athlete:5155785","espn:cfb:athlete:5299678","espn:cfb:athlete:5086519","espn:cfb:athlete:5308425","espn:cfb:athlete:5299682","espn:cfb:athlete:5156101","espn:cfb:athlete:5299696","espn:cfb:athlete:5299673","espn:cfb:athlete:5299697","espn:cfb:athlete:5405044","espn:cfb:athlete:5405041","espn:cfb:athlete:5095125","espn:cfb:athlete:5224795","espn:cfb:athlete:5224810","espn:cfb:athlete:5299677","espn:cfb:athlete:5086527","espn:cfb:athlete:5224815","espn:cfb:athlete:5302514","espn:cfb:athlete:5405047","espn:cfb:athlete:5224798","espn:cfb:athlete:5405050"]};
 try {
  delete process.env.VERCEL;process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';
  globalThis.fetch=()=>{throw Error('No upstream request permitted for reviewed Week 7');};
  for(const [category,count] of Object.entries({QB:166,Rush:622,Rec:855})) {
   const response=await route.GET(new Request('http://local/?week=7&category='+category));assert.equal(response.status,200);
   const body=await response.json();assert.equal(body.lines.length,count);assert.equal(body.coveredGames,62);assert.equal(body.scope,'reviewed-espn-week');assert.equal(body.independentNationalCertification,false);
   assert.ok(body.columns.every(key=>body.confidence[key].status==='reviewed'));assert.ok(body.lines.every(row=>!expected.nonFbs.includes(row.id)));
   if(category==='QB')assert.ok(body.lines.every(row=>!expected.nonQbs.includes(row.id)));
   if(category==='Rec')assert.ok(!body.columns.includes('targets')&&!body.columns.includes('catch_pct'));
   assert.equal(createHash('sha256').update(JSON.stringify(body.lines.map(row=>[row.id,row.teams[0],row.values,row.notApplicable]))).digest('hex'),expected.hashes[category]);
   assert.ok(Buffer.byteLength(JSON.stringify(body))<180000,'bounded regular refresh payload');
   const first=body.lines[0], detail=await route.GET(new Request('http://local/?week=7&view=details&snapshot='+body.snapshot+'&players='+first.id));
   assert.equal(detail.status,200);const line=(await detail.json()).lines[0];assert.equal(line.id,first.id);assert.ok(line.games.length>=1&&line.games.length<=5);assert.equal(line.games[0].week,7);
   const conf=body.teams[first.teams[0]].conferenceId;
   const filtered=await (await route.GET(new Request('http://local/?week=7&category='+category+'&conference='+conf))).json();assert.ok(filtered.lines.every(row=>body.teams[row.teams[0]].conferenceId===conf));
   assert.equal((await route.GET(new Request('http://local/?week=7&view=details&conference='+conf+'&snapshot='+body.snapshot+'&players='+first.id))).status,400,'snapshot isolated by own-team conference');
  }
  const rush=await (await route.GET(new Request('http://local/?week=7&category=Rush'))).json();
  for(const [id,yards] of [['5125012',4],['5225603',12]]){const row=rush.lines.find(r=>r.id.endsWith(':'+id));assert.equal(row.values[rush.columns.indexOf('rushing_yards')],yards);assert.equal(row.values[rush.columns.indexOf('carries')],0);assert.ok(row.notApplicable.includes('rushing_yards_per_carry'));}
  assert.equal((await route.GET(new Request('http://local/?mode=season&week=7&category=QB'))).status,400);
  assert.equal((await route.GET(new Request('http://local/?week=7&view=export'))).status,409);
  const {reviewedCfbWeek7}=await import(await compile(file('app/lib/stats-v2/cfb-week7-reviewed.ts')));
  for(const week of [null,6,8])assert.equal(reviewedCfbWeek7(new URLSearchParams(),week,'leaders','QB',null),null);
  delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;assert.equal((await route.GET(new Request('http://local/?week=7&category=QB'))).status,404);
  process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';process.env.VERCEL='1';assert.equal((await route.GET(new Request('http://local/?week=7&category=QB'))).status,404);
 }finally{globalThis.fetch=saved;if(flag===undefined)delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;else process.env.AAW_STATS_V2_LOCAL_PREVIEW=flag;if(hosted===undefined)delete process.env.VERCEL;else process.env.VERCEL=hosted;}
});

test('actual preview sort/rank logic handles all 21 reviewed metrics, zeros, N/A and deterministic competition ties',async()=>{
 const {reviewedCfbWeek7}=await import(await compile(file('app/lib/stats-v2/cfb-week7-reviewed.ts')));
 const ui=await readFile(file('app/preview/nfl-stats/stats-preview.tsx'),'utf8');
 const source=ui.slice(ui.indexOf('  const ranked ='),ui.indexOf('  const positions ='));
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const sort=new Function('data','value','metric','ascending',js+';return {ranked,ranks};');
 for(const category of ['QB','Rush','Rec','Def']){
  const body=await reviewedCfbWeek7(new URLSearchParams(),7,'leaders',category,null).json();
  for(const metric of body.columns)for(const ascending of [false,true]){
   const value=(row,key)=>row.values[body.columns.indexOf(key)]??null;
   const {ranked,ranks}=sort(body,value,metric,ascending);const first=new Map();
   for(let i=0;i<ranked.length;i++){
    const n=value(ranked[i],metric),previous=i?value(ranked[i-1],metric):null;
    if(n===null){assert.equal(ranks.get(ranked[i].id),'—');continue;}
    if(!first.has(n))first.set(n,String(i+1));assert.equal(ranks.get(ranked[i].id),first.get(n));
    if(i){assert.notEqual(previous,null);assert.ok(ascending?previous<=n:previous>=n);if(previous===n)assert.ok(ranked[i-1].id.localeCompare(ranked[i].id)<=0);}
   }
  }
 }
 assert.match(ui,/setInterval\(refresh, 30_000\)/);assert.match(ui,/expandedRef.current.filter/);assert.match(ui,/sourceAttribution/);assert.match(ui,/visibleColumns.map/);
});

test('Current Week uses current discovery, agrees with explicit week and advances without year-wide event leakage',async()=>{
 const routeModule=await import(await compile(file('app/lib/stats-v2/cfb-server.ts'))),route={GET:routeModule.createCfbStatsV2Route(board=>board)},saved=globalThis.fetch,flag=process.env.AAW_STATS_V2_LOCAL_PREVIEW;
 let currentWeek=8;const requests=[];
 try{
  process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';
  globalThis.fetch=async input=>{
   const url=new URL(String(input));requests.push(url);const f=fixture(currentWeek,'2390','88001');f.event.competitions[0].status.type={state:'post',completed:true};
   if(url.pathname.endsWith('/scoreboard')){
    // Reproduce the bad provider shape if a current selection accidentally uses a year range.
    if(url.searchParams.has('dates')&&!url.searchParams.has('week'))return Response.json({season:{year:2026,type:2},week:{number:currentWeek},events:[]});
    return Response.json({season:{year:2026,type:2},week:{number:currentWeek},events:[f.event]});
   }
   if(url.pathname.endsWith('/roster'))return Response.json({season:{year:2026},team:{id:'2390'},athletes:[{items:[{id:'123',position:{abbreviation:'QB'}}]}]});
   if(url.pathname.endsWith('/standings'))return Response.json({season:{year:2026},children:[]});
   assert.ok(url.pathname.endsWith('/summary'));return Response.json(f.summary);
  };
  const request=week=>route.GET(new Request('http://local/?category=QB'+(week?'&week='+week:'')));
  const current=await (await request()).json(),explicit=await (await request(8)).json();
  assert.equal(current.period.week,8);assert.equal(current.coveredGames,1);assert.ok(current.lines.length>0);assert.deepEqual(current.lines,explicit.lines);assert.equal(current.complete,false);
  const boards=requests.filter(u=>u.pathname.endsWith('/scoreboard'));
  assert.equal(boards[0].searchParams.has('dates'),false);assert.equal(boards[0].searchParams.has('week'),false);assert.equal(boards[1].searchParams.get('dates'),'2026');assert.equal(boards[1].searchParams.get('week'),'8');
  assert.ok(boards.every(u=>u.searchParams.get('limit')==='100'));
  currentWeek=9;const next=await (await request()).json();assert.equal(next.period.week,9);assert.ok(next.lines.length>0);
  const ui=await readFile(file('app/preview/nfl-stats/stats-preview.tsx'),'utf8');
  assert.match(ui,/league !== 'CFB' && !rankingAvailable/);assert.match(ui,/catch \{ if \(active\) setError/);assert.match(ui,/expandedRef.current.filter/);assert.match(ui,/setInterval\(refresh, 30_000\)/);
 }finally{globalThis.fetch=saved;if(flag===undefined)delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;else process.env.AAW_STATS_V2_LOCAL_PREVIEW=flag;}
});

test('Week 7 Def ranks only reported observations while retaining every candidate and interception-only defender',async()=>{
 const expected={"hash":"06bcad2466a3386ded277e813427d5afc6fd7b97c89ff29e44ee204e8e698d5a","interceptionOnly":["espn:cfb:athlete:5276974","espn:cfb:athlete:5125530","espn:cfb:athlete:5214512","espn:cfb:athlete:5268746","espn:cfb:athlete:5147164","espn:cfb:athlete:4891196"],"nonFbs":["espn:cfb:athlete:5224320","espn:cfb:athlete:5298251","espn:cfb:athlete:5298252","espn:cfb:athlete:5402478","espn:cfb:athlete:5402482","espn:cfb:athlete:5157412","espn:cfb:athlete:5164751","espn:cfb:athlete:5402476","espn:cfb:athlete:5254264","espn:cfb:athlete:5095773","espn:cfb:athlete:5164740","espn:cfb:athlete:5164726","espn:cfb:athlete:5224334","espn:cfb:athlete:4869609","espn:cfb:athlete:5224339","espn:cfb:athlete:5298255","espn:cfb:athlete:5402497","espn:cfb:athlete:5298263","espn:cfb:athlete:5089109","espn:cfb:athlete:5298266","espn:cfb:athlete:5449384","espn:cfb:athlete:5224329","espn:cfb:athlete:5298288","espn:cfb:athlete:5402493","espn:cfb:athlete:5298258","espn:cfb:athlete:5164723","espn:cfb:athlete:5219461","espn:cfb:athlete:5224359","espn:cfb:athlete:5298256","espn:cfb:athlete:5402489","espn:cfb:athlete:4876588","espn:cfb:athlete:5086886","espn:cfb:athlete:5298250","espn:cfb:athlete:5298289","espn:cfb:athlete:5402485","espn:cfb:athlete:5402484","espn:cfb:athlete:5402517","espn:cfb:athlete:4695602","espn:cfb:athlete:5302081","espn:cfb:athlete:5223107","espn:cfb:athlete:4832849","espn:cfb:athlete:5230060","espn:cfb:athlete:5230050","espn:cfb:athlete:5302082","espn:cfb:athlete:4695743","espn:cfb:athlete:5431301","espn:cfb:athlete:5089455","espn:cfb:athlete:5441543","espn:cfb:athlete:5168686","espn:cfb:athlete:5085498","espn:cfb:athlete:5230065","espn:cfb:athlete:5302086","espn:cfb:athlete:5157273","espn:cfb:athlete:5441535","espn:cfb:athlete:5088881","espn:cfb:athlete:5433816","espn:cfb:athlete:5304076","espn:cfb:athlete:5230053","espn:cfb:athlete:5085851","espn:cfb:athlete:5088148","espn:cfb:athlete:5153428","espn:cfb:athlete:5162969","espn:cfb:athlete:5088151","espn:cfb:athlete:5095783","espn:cfb:athlete:5164042","espn:cfb:athlete:5173937","espn:cfb:athlete:5230048","espn:cfb:athlete:5230078","espn:cfb:athlete:5302085","espn:cfb:athlete:5302101","espn:cfb:athlete:5302106","espn:cfb:athlete:4489406","espn:cfb:athlete:5088871","espn:cfb:athlete:5153449","espn:cfb:athlete:5230067","espn:cfb:athlete:5230077","espn:cfb:athlete:5306282","espn:cfb:athlete:5302084","espn:cfb:athlete:5151062","espn:cfb:athlete:5405043","espn:cfb:athlete:5155783","espn:cfb:athlete:5162540","espn:cfb:athlete:5405049","espn:cfb:athlete:5086540","espn:cfb:athlete:4877774","espn:cfb:athlete:560158","espn:cfb:athlete:5155785","espn:cfb:athlete:5299678","espn:cfb:athlete:5086519","espn:cfb:athlete:5308425","espn:cfb:athlete:5299682","espn:cfb:athlete:5156101","espn:cfb:athlete:5299696","espn:cfb:athlete:5299673","espn:cfb:athlete:5299697","espn:cfb:athlete:5405044","espn:cfb:athlete:5405041","espn:cfb:athlete:5095125","espn:cfb:athlete:5224795","espn:cfb:athlete:5224810","espn:cfb:athlete:5299677","espn:cfb:athlete:5086527","espn:cfb:athlete:5224815","espn:cfb:athlete:5302514","espn:cfb:athlete:5405047","espn:cfb:athlete:5224798","espn:cfb:athlete:5405050"]}, {createHash}=await import('node:crypto');
 const routeModule=await import(await compile(file('app/lib/stats-v2/cfb-server.ts'))),route={GET:routeModule.createCfbStatsV2Route(board=>board)},saved=globalThis.fetch,flag=process.env.AAW_STATS_V2_LOCAL_PREVIEW;
 try{
  process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';globalThis.fetch=()=>{throw Error('Reviewed defence must be offline');};
  const response=await route.GET(new Request('http://local/?week=7&category=Def'));assert.equal(response.status,200);const body=await response.json();
  assert.equal(body.lines.length,2532);assert.equal(new Set(body.lines.map(r=>r.id)).size,2532);assert.equal(body.rankScope,'reported-values');assert.equal(body.complete,false);assert.equal(body.independentNationalCertification,false);assert.equal(body.scope,'reviewed-espn-week');
  assert.equal(createHash('sha256').update(JSON.stringify(body.lines.map(r=>[r.id,r.teams[0],r.values]))).digest('hex'),expected.hash);
  for(const key of body.columns){const values=body.lines.map(r=>r.values[body.columns.indexOf(key)]);const count=key==='def_interceptions'?80:2526;assert.equal(values.filter(v=>v!==null).length,count);assert.deepEqual(body.confidence[key],{status:'reported-values',supportedPlayers:count,candidatePlayers:2532,missingPlayers:2532-count});}
  assert.ok(body.lines.every(r=>!expected.nonFbs.includes(r.id)&&/^espn:cfb:athlete:[1-9]\d*$/.test(r.id)));
  assert.equal(body.lines.filter(r=>r.values[body.columns.indexOf('tackles')]===0).length,68);assert.equal(body.lines.filter(r=>r.values[body.columns.indexOf('def_sacks')]===0).length,2276);
  assert.equal(body.lines.filter(r=>r.values[body.columns.indexOf('def_interceptions')]===0).length,0,'missing interceptions never become zero');
  for(const id of expected.interceptionOnly){const r=body.lines.find(r=>r.id===id);assert.ok(r);assert.ok(r.values[body.columns.indexOf('def_interceptions')]>0);for(const key of body.columns.filter(k=>k!=='def_interceptions'))assert.equal(r.values[body.columns.indexOf(key)],null);}
  const details=await (await route.GET(new Request('http://local/?week=7&view=details&snapshot='+body.snapshot+'&players='+expected.interceptionOnly.join(',')))).json();assert.equal(details.lines.length,6);
  for(const line of details.lines){assert.equal(line.metrics.tackles.state,'missing');assert.equal(line.metrics.def_interceptions.state,'value');assert.equal(line.metrics.def_tackle_assists.state,'unavailable');assert.equal(line.metrics.def_fumbles_forced.state,'unavailable');assert.equal(line.games[0].week,7);}
  assert.ok(!body.displayColumns.includes('def_tackle_assists')&&!body.displayColumns.includes('def_fumbles_forced'));
  assert.ok(Buffer.byteLength(JSON.stringify(body))<650000);
  const conf=body.teams[body.lines[0].teams[0]].conferenceId;
  const filtered=await (await route.GET(new Request('http://local/?week=7&category=Def&conference='+conf))).json();assert.ok(filtered.lines.every(r=>body.teams[r.teams[0]].conferenceId===conf));assert.equal(filtered.confidence.tackles.candidatePlayers,filtered.lines.length);
  const {reviewedCfbWeek7}=await import(await compile(file('app/lib/stats-v2/cfb-week7-reviewed.ts')));for(const week of [null,8])assert.equal(reviewedCfbWeek7(new URLSearchParams(),week,'leaders','Def',null),null);
  assert.equal((await route.GET(new Request('http://local/?mode=season&week=7&category=Def'))).status,400);
  const ui=await readFile(file('app/preview/nfl-stats/stats-preview.tsx'),'utf8');assert.match(ui,/Ranks cover reported values only/);assert.match(ui,/data.rankScope === 'reported-values'/);
 }finally{globalThis.fetch=saved;if(flag===undefined)delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;else process.env.AAW_STATS_V2_LOCAL_PREVIEW=flag;}
});

test('CFB details combine current verified game with retained multiweek history without changing selected tiles',async()=>{
 const {withReviewedCfbHistory,reviewedCfbWeek7,reviewedCfbHistoryTeams}=await import(await compile(file('app/lib/stats-v2/cfb-week7-reviewed.ts')));
 const response=await reviewedCfbWeek7(new URLSearchParams(),7,'leaders','QB',null).json();const first=response.lines[0];const snapshot=await reviewedCfbWeek7(new URLSearchParams({snapshot:response.snapshot,players:first.id}),7,'details','QB',null).json();const old=snapshot.lines[0];assert.ok(old.games.length>=1&&old.games.length<=5);
 const current={...old,metrics:{passing_yards:{state:'value',value:400}},games:[{...old.games[0],gameId:'espn:cfb:game:900000001',week:8,metrics:{passing_yards:{state:'value',value:400}}}]};
 const before=JSON.stringify(current);const combined=withReviewedCfbHistory(current,8);assert.equal(combined.games.length,Math.min(5,old.games.length+1));assert.deepEqual(combined.games.slice(0,2).map(g=>g.week),[8,7]);assert.equal(combined.metrics,current.metrics);assert.equal(JSON.stringify(current),before);assert.equal(combined.games[1].metrics.passing_yards.value,old.metrics.passing_yards.value);assert.ok(reviewedCfbHistoryTeams[combined.games[1].opponent].name);
 const duplicate=withReviewedCfbHistory(combined,8);assert.deepEqual(duplicate.games,combined.games);
 assert.deepEqual(withReviewedCfbHistory(old,7).games,old.games,'historical cutoff must not add Week 8');
 const missing=withReviewedCfbHistory({...current,id:'espn:cfb:athlete:999999999'},8);assert.equal(missing.games.length,1);
 const noCurrent=withReviewedCfbHistory({...current,games:[]},8);assert.deepEqual(noCurrent.games.map(g=>g.gameId),old.games.map(g=>g.gameId));assert.equal(noCurrent.games[0].metrics.passing_yards.value,old.games[0].metrics.passing_yards.value);
 const ui=await readFile(file('app/preview/nfl-stats/stats-preview.tsx'),'utf8');assert.match(ui,/expandedRef.current.filter/);assert.match(ui,/setInterval\(refresh, 30_000\)/);
});

test('CFB status view uses only validated scoreboard discovery, never summaries or positions',async()=>{
 const routeModule=await import(await compile(file('app/lib/stats-v2/cfb-server.ts'))),route={GET:routeModule.createCfbStatsV2Route(board=>board)};
 const saved=globalThis.fetch,flag=process.env.AAW_STATS_V2_LOCAL_PREVIEW;let calls=0,fail=false;
 process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';
 globalThis.fetch=async input=>{calls++;const url=new URL(String(input));assert.ok(url.pathname.endsWith('/scoreboard'));assert.equal(url.searchParams.get('limit'),'100');assert.equal(url.searchParams.has('dates'),false);if(fail)throw Error('offline');const {event}=fixture();return Response.json({season:{year:2026,type:2},week:{number:8},events:[event]});};
 try {
  const response=await route.GET(new Request('http://local/?view=status'));assert.equal(response.status,200);const body=await response.json();assert.equal(calls,1);assert.equal(body.period.week,8);assert.deepEqual(body.games,[{id:'101',startDate:'2026-10-20T17:00Z',live:true,completed:false}]);assert.equal(body.lines,undefined);
  fail=true;assert.equal((await route.GET(new Request('http://local/?view=status'))).status,503);assert.equal(calls,2);
 }finally{globalThis.fetch=saved;if(flag===undefined)delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;else process.env.AAW_STATS_V2_LOCAL_PREVIEW=flag;}
});

test('CFB card-only metrics use maxima, preserve missing/zero and do not double-count interception TD',()=>{
 const a=fixture(7,'2390','101'),b=fixture(8,'2390','102');
 function enrich(f,long,recLong,hurries,td){for(const group of f.summary.boxscore.players[0].statistics){
  const extra=group.name==='rushing'?['LONG',String(long)]:group.name==='receiving'?['LONG',String(recLong)]:group.name==='defensive'?['QB HUR',String(hurries),'TD',String(td)]:[];
  for(let i=0;i<extra.length;i+=2){group.labels.push(extra[i]);for(const row of group.athletes)row.stats.push(extra[i+1]);}
 }f.summary.boxscore.players[0].statistics.push({name:'interceptions',labels:['INT','TD'],athletes:[{athlete:{id:'125',displayName:'Defender'},stats:['1','1']}]});}
 enrich(a,12,40,0,1);enrich(b,27,10,2,0);
 const extra={period:{season:2026,phase:'REG',week:null},positions:[{season:2026,teamId:'2390',athleteId:'123',position:'QB'}]};
 const all=build([a,b],extra),find=(model,id)=>model.lines.find(line=>line.id.endsWith(':'+id));
 assert.equal(find(all,'123').metrics.rushing_long.value,27);assert.equal(find(all,'124').metrics.receiving_long.value,40);
 assert.equal(find(all,'125').metrics.def_qb_hurries.value,2);assert.equal(find(all,'125').metrics.def_tds.value,1);assert.equal(find(all,'125').metrics.def_qb_hits.state,'missing');
 assert.equal(find(all,'125').games[0].metrics.def_qb_hurries.value,0);
 const past=build([a,b],{...extra,period:{season:2026,phase:'REG',week:7}});assert.equal(find(past,'123').metrics.rushing_long.value,12);assert.equal(find(past,'125').metrics.def_tds.value,1);
 const missing=fixture();missing.summary.boxscore.players[0].statistics.find(g=>g.name==='defensive').athletes=[];
 missing.summary.boxscore.players[0].statistics.push({name:'interceptions',labels:['INT','TD'],athletes:[{athlete:{id:'125',displayName:'Defender'},stats:['1','1']}]});
 const defender=find(build([missing]),'125');assert.equal(defender.metrics.def_qb_hurries.state,'missing');assert.equal(defender.metrics.def_tds.state,'missing');
 const unavailable=fixture();const group=unavailable.summary.boxscore.players[0].statistics.find(g=>g.name==='rushing');group.labels.push('LONG');group.athletes[0].stats.push('--');assert.equal(find(build([unavailable]),'123').metrics.rushing_long.state,'missing');
 group.athletes[0].stats[group.athletes[0].stats.length-1]='0';assert.equal(find(build([unavailable]),'123').metrics.rushing_long.value,0);
 group.athletes[0].stats[group.athletes[0].stats.length-1]='-3';assert.equal(find(build([unavailable]),'123').metrics.rushing_long.value,-3);
});

test('reviewed Week 7 card coverage preserves all original ranking evidence and six missing defensive lines',async()=>{
 const data=JSON.parse(await readFile(file('app/lib/stats-v2/cfb-week7-reviewed.json'),'utf8'));
 const {createHash}=await import('node:crypto');const {cardMetricColumns,cardMetricValues,cardMetricCoverage,...original}=data;
 assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),'365a7112ac288838a4ebae08cf05916affb6994a09963dc641828f51d2a8da75');
 assert.equal(cardMetricValues.length,data.rows.length);assert.deepEqual(cardMetricColumns,['rushing_long','receiving_long','def_qb_hurries','def_tds']);
 for(const [category,index,expected,zeros] of [['Rush',0,622,47],['Rec',1,855,17],['Def',2,2526,2227],['Def',3,2526,2514],['QB',0,152,11]]){
  const rows=data.rows.flatMap((row,i)=>row[5].includes(category)?[cardMetricValues[i][index]]:[]);
  assert.equal(rows.filter(v=>v!==null).length,expected);assert.equal(rows.filter(v=>v===0).length,zeros);
 }
 assert.equal(cardMetricCoverage['Def:qb_hurries'].missing,6);
 const {reviewedCfbWeek7,withReviewedCfbHistory}=await import(await compile(file('app/lib/stats-v2/cfb-week7-reviewed.ts')));
 const leader=await reviewedCfbWeek7(new URLSearchParams(),7,'leaders','Def',null).json();
 const missingIndex=data.rows.findIndex((row,i)=>row[5].includes('Def')&&cardMetricValues[i][2]===null),id=data.rows[missingIndex][0];
 const detail=await reviewedCfbWeek7(new URLSearchParams({snapshot:leader.snapshot,players:id}),7,'details','Def',null).json();assert.equal(detail.lines[0].metrics.def_qb_hurries.state,'missing');assert.equal(detail.lines[0].metrics.def_tds.state,'missing');
 const interceptionOnly=data.rows.filter((row,i)=>row[5].includes('Def')&&cardMetricValues[i][2]===null);assert.equal(interceptionOnly.length,6);
 for(const row of interceptionOnly){const result=await reviewedCfbWeek7(new URLSearchParams({snapshot:leader.snapshot,players:row[0]}),7,'details','Def',null).json();const game=result.lines[0].games.find(g=>g.week===7);assert.ok(game);assert.equal(game.metrics.tackles.state,'missing');assert.equal(game.metrics.def_qb_hurries.state,'missing');assert.ok(game.metrics.def_interceptions.value>0);}

 const qb=await reviewedCfbWeek7(new URLSearchParams(),7,'leaders','QB',null).json();const qid='espn:cfb:athlete:4870971';
 const q=await reviewedCfbWeek7(new URLSearchParams({snapshot:qb.snapshot,players:qid}),7,'details','QB',null).json();assert.equal(q.lines[0].metrics.rushing_long.value,11);
 const history=withReviewedCfbHistory({id:qid,games:[]},8);assert.equal(history.games[0].metrics.rushing_long.value,11);assert.equal(history.games.length,5);assert.ok(history.games.every(g=>g.week<=7));
});

const historyModule = await import(await compile(file('app/lib/stats-v2/cfb-player-history.ts')));
const retainedHistory = JSON.parse(await readFile(file('app/lib/stats-v2/cfb-player-history.json'),'utf8'));
test('retained CFB history has exact FBS identities, unique appearances and measured Week 7 coverage',async()=>{
 const data=retainedHistory,seen=new Set(),depth=new Map();
 assert.equal(data.games.length,510);assert.equal(data.rows.length,29483);assert.equal(data.players.length,7611);
 for(const [player,game,team,opponent,values] of data.rows){
  const key=data.players[player]+'|'+data.games[game].id;assert.ok(!seen.has(key));seen.add(key);
  assert.equal(data.teams[team].fbs,true);assert.ok([data.games[game].home,data.games[game].away].includes(team));assert.notEqual(team,opponent);
  assert.ok([data.games[game].home,data.games[game].away].includes(opponent));assert.equal(values.length,data.columns.length);
  depth.set(data.players[player],(depth.get(data.players[player])??0)+1);
 }
 const reviewed=JSON.parse(await readFile(file('app/lib/stats-v2/cfb-week7-reviewed.json'),'utf8'));
 const ids=new Set(reviewed.rows.map(row=>row[0]));assert.equal(ids.size,3720);
 const distribution={1:0,2:0,3:0,4:0,5:0};for(const id of ids)distribution[Math.min(5,depth.get(id))]++;
 assert.deepEqual(distribution,{1:159,2:221,3:289,4:414,5:2637});
 assert.ok(data.rows.some(row=>!data.teams[row[3]].fbs),'FBS appearances against FCS are retained');
 for(const game of data.games){assert.match(game.summarySha256,/^[a-f0-9]{64}$/);assert.match(game.importHash,/^[a-f0-9]{64}$/);assert.ok(Number.isFinite(Date.parse(game.observedAt)));}
});
test('real CFB histories preserve cutoffs, byes, short histories, opponents and missing/zero/N/A',()=>{
 const period={season:2026,phase:'REG',week:7},line={id:'espn:cfb:athlete:5157266',games:[],metrics:{unchanged:true}};
 const result=historyModule.withCfbPlayerHistory(line,period);
 assert.deepEqual(result.games.map(g=>g.week),[7,5,4,3,2]);assert.equal(result.metrics,line.metrics);assert.deepEqual(line.games,[]);
 assert.equal(historyModule.withCfbPlayerHistory({id:'espn:cfb:athlete:5295765',games:[]},period).games.length,1);
 assert.ok(historyModule.withCfbPlayerHistory(line,{...period,week:4}).games.every(g=>g.week<=4));
 assert.equal(historyModule.withCfbPlayerHistory(line,{...period,season:2025}),line);assert.equal(historyModule.withCfbPlayerHistory(line,{...period,phase:'POST'}),line);
 assert.equal(historyModule.withCfbPlayerHistory({id:'espn:cfb:athlete:unknown',games:[]},period).games.length,0);
 for(const category of ['QB','Rush','Rec','Def']){
  const key={QB:'passing_yards',Rush:'rushing_yards',Rec:'receiving_yards',Def:'tackles'}[category],col=retainedHistory.columns.indexOf(key);
  const row=retainedHistory.rows.find(r=>r[4][col]===0);assert.ok(row);
  const games=historyModule.withCfbPlayerHistory({id:retainedHistory.players[row[0]],games:[]},{...period,week:retainedHistory.games[row[1]].week}).games;
  const game=games.find(g=>g.gameId===retainedHistory.games[row[1]].id);assert.equal(game.metrics[key].value,0);
  assert.equal(game.metrics.targets.state,'missing');assert.equal(game.metrics.def_tackle_assists.state,'missing');
 }
 const carries=retainedHistory.columns.indexOf('carries'),yards=retainedHistory.columns.indexOf('rushing_yards');
 const row=retainedHistory.rows.find(r=>r[4][carries]===0&&r[4][yards]!==null);
 const game=historyModule.withCfbPlayerHistory({id:retainedHistory.players[row[0]],games:[]},{...period,week:retainedHistory.games[row[1]].week}).games.find(g=>g.gameId===retainedHistory.games[row[1]].id);
 assert.equal(game.metrics.rushing_yards_per_carry.state,'not-applicable');
});
test('CFB history merge handles corrections, same-week kickoffs, team stints and conflicting identities',()=>{
 const game=(gameId,week,team='1',opponent='2',extra={})=>({gameId,week,team,opponent,metrics:{yards:0},...extra});
 const old=game('a',7,'1','2',{observedAt:'2026-10-20T00:00Z'}),correction={...old,metrics:{yards:12},observedAt:'2026-10-21T00:00Z'};
 const merged=historyModule.mergeCfbGameLogs([old,game('b',6,'3','4')],[correction,game('c',8)],8);
 assert.deepEqual(merged.map(g=>g.gameId),['c','a','b']);assert.equal(merged[1].metrics.yards,12);assert.equal(merged[2].team,'3');
 assert.equal(historyModule.mergeCfbGameLogs([correction],[old],7)[0].metrics.yards,12);
 assert.deepEqual(historyModule.mergeCfbGameLogs([old],[{...old,team:'9'}],7),[]);
 assert.deepEqual(historyModule.mergeCfbGameLogs([old],[{...old,opponent:'9'}],7),[]);
 const same=[game('early',1,'1','2',{kickoff:'2026-08-29T16:00Z'}),game('late',1,'1','3',{kickoff:'2026-09-05T16:00Z'})];
 assert.deepEqual(historyModule.mergeCfbGameLogs(same,[],1).map(g=>g.gameId),['late','early']);
 assert.deepEqual(historyModule.mergeCfbGameLogs([old],[game('future',8)],6),[]);
});


const reportedModule=await import(await compile(file('app/lib/stats-v2/cfb-reported-rankings.ts')));
const fbsEvidence=JSON.parse(await readFile(file('app/lib/cfb-team-membership-2026.json'),'utf8'));
function reported(f=fixture(),extra={}){return reportedModule.buildReportedCfbModel({period:{season:2026,phase:'REG',week:8},observedAt:now,events:[f.event],summaries:[f.summary],...extra});}
test('Current CFB FBS eligibility is exact, keeps FBS games against FCS and never establishes QB from passing activity',()=>{
 const fcs=Object.entries(fbsEvidence.teams).find(([,team])=>!team.fbs)[0];
 for(const opponent of [fcs,'99999999']){
  const f=fixture();f.event.competitions[0].competitors[1].team.id=opponent;
  f.summary.boxscore.players[1]={team:{id:opponent},statistics:structuredClone(f.summary.boxscore.players[0].statistics)};for(const group of f.summary.boxscore.players[1].statistics)for(const row of group.athletes)row.athlete.id=String(Number(row.athlete.id)+1000);
  const model=reported(f);assert.ok(model.lines.length);assert.ok(model.lines.every(line=>line.teams.every(id=>reportedModule.isVerifiedCfbFbsTeam(id))));assert.ok(model.lines.every(line=>line.games[0].opponent===opponent));
  assert.equal(opponent===fcs?model.collection.excludedNonFbsPlayers:model.collection.unverifiedMembershipPlayers,3);assert.equal(model.collection.expectedTeamObservations,1);
  assert.equal(model.lines.some(line=>line.categories.includes('QB')),false);assert.equal(model.collection.unresolvedPassers,1);
  const verified=reported(f,{positions:[{season:2026,teamId:'2390',athleteId:'123',position:'QB'}]});assert.equal(verified.lines.find(line=>line.id.endsWith(':123')).categories.includes('QB'),true);
  for(const positions of [[{season:2025,teamId:'2390',athleteId:'123',position:'QB'}],[{season:2026,teamId:'239',athleteId:'123',position:'QB'}],[{season:2026,teamId:'2390',athleteId:'123',position:'WR'}]])assert.equal(reported(f,{positions}).lines.some(line=>line.categories.includes('QB')),false);
 }
});
test('Current defensive counts are metric-specific: zero stays reported, absent INT stays missing, interception-only defenders stay visible',()=>{
 const f=fixture(),box=f.summary.boxscore.players[0];
 box.statistics.find(group=>group.name==='defensive').athletes.push({athlete:{id:'126',displayName:'Zero Defender'},stats:['0','0','0','0']});
 box.statistics.push({name:'interceptions',labels:['INT'],athletes:[{athlete:{id:'127',displayName:'Interception Only'},stats:['1']}]});
 const model=reported(f),confidence=reportedModule.cfbReportedConfidence(model,'Def');
 for(const key of ['tackles','def_tackles_solo','def_sacks','def_tackles_for_loss'])assert.deepEqual(confidence[key],{status:'reported-values',supportedPlayers:2,candidatePlayers:3,missingPlayers:1,notApplicablePlayers:0});
 assert.deepEqual(confidence.def_interceptions,{status:'reported-values',supportedPlayers:1,candidatePlayers:3,missingPlayers:2,notApplicablePlayers:0});
 assert.equal(confidence.def_pass_defended.status,'unverified');assert.equal(confidence.def_tackle_assists.supportedPlayers,0);
 const zero=model.lines.find(line=>line.id.endsWith(':126'));assert.equal(zero.metrics.def_sacks.value,0);assert.equal(zero.metrics.def_interceptions.state,'missing');
 const only=model.lines.find(line=>line.id.endsWith(':127'));assert.equal(only.metrics.tackles.state,'missing');assert.equal(only.metrics.def_interceptions.value,1);
 box.statistics.at(-1).athletes.push({athlete:{id:'128',displayName:'Zero INT'},stats:['0']});assert.equal(reportedModule.cfbReportedConfidence(reported(f),'Def').def_interceptions.supportedPlayers,2);
});
test('Current collection gaps do not erase valid records and never certify a whole week',()=>{
 const f=fixture(),missing=fixture(8,'239','102');
 const model=reported(f,{events:[f.event,missing.event],summaries:[f.summary,null],positions:[{season:2026,teamId:'2390',athleteId:'123',position:'QB'}]});
 assert.equal(model.collection.expectedGames,2);assert.equal(model.collection.observedGames,1);assert.equal(model.collection.missingGames,1);assert.equal(model.collection.expectedTeamObservations,4);assert.equal(model.collection.observedTeamObservations,2);assert.equal(model.complete,false);
 for(const category of ['QB','Rush','Rec','Def'])assert.ok(Object.values(reportedModule.cfbReportedConfidence(model,category)).some(value=>value.status==='reported-values'));
 const half=fixture();half.summary.boxscore.players.pop();const partial=reported(half);assert.ok(partial.lines.length);assert.equal(partial.collection.missingTeamObservations,1);
 for(const change of [f=>f.event.week.number=9,f=>f.summary.header.week=9,f=>f.summary.header.season={year:2025,type:2},f=>f.summary.header.id='wrong']){const wrong=fixture();change(wrong);assert.equal(reported(wrong).lines.length,0);}
});
test('Current confidence follows the selected own-team conference, supports N/A and leaves actual UI tie sorting intact',async()=>{
 const f=fixture(),second=fixture(8,'239','102');second.summary.boxscore.players[0].statistics[0].athletes[0].stats=['0/0','0','0','0'];
 const model=reported(f,{events:[f.event,second.event],summaries:[f.summary,second.summary],positions:[{season:2026,teamId:'2390',athleteId:'123',position:'QB'},{season:2026,teamId:'239',athleteId:'123',position:'QB'}],memberships:[{season:2026,teamId:'2390',conferenceId:'MAC',conferenceName:'MAC'},{season:2026,teamId:'239',conferenceId:'ACC',conferenceName:'ACC'}]});
 const scoped={...model,lines:filterCfbConference(model,'ACC')};const confidence=reportedModule.cfbReportedConfidence(scoped,'QB');assert.equal(confidence.completion_pct.supportedPlayers,0);assert.equal(confidence.completion_pct.notApplicablePlayers,1);assert.equal(confidence.passing_yards.supportedPlayers,1);assert.equal(scoped.lines[0].metrics.passing_yards.value,0);
 const ui=await readFile(file('app/preview/nfl-stats/stats-preview.tsx'),'utf8'),start=ui.indexOf('  const ranked ='),end=ui.indexOf('  const positions =');
 const js=ts.transpileModule(ui.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const run=new Function('data','value','metric','ascending',js+';return {ranked,ranks};');
 for(const ascending of [false,true]){const data={lines:[{id:'b',n:0},{id:'a',n:0},{id:'c',n:null},{id:'d',n:1}]};const result=run(data,row=>row.n,'def_sacks',ascending);assert.equal(result.ranks.get('a'),result.ranks.get('b'));assert.equal(result.ranks.get('c'),'—');assert.equal(result.ranked.at(-1).id,'c');}
 assert.match(ui,/\['reviewed-espn-week','supplied-games','retained-espn-season'\]\.includes/);assert.match(ui,/reportedCoverage.missingPlayers/);assert.match(ui,/collection.observedTeamObservations/);
});
test('real Current route exposes guarded reported-value scopes, excludes opponent athletes and expands without upstream calls',async()=>{
 const routeModule=await import(await compile(file('app/lib/stats-v2/cfb-server.ts'))),route={GET:routeModule.createCfbStatsV2Route(board=>board)},saved=globalThis.fetch,flag=process.env.AAW_STATS_V2_LOCAL_PREVIEW;
 const f=fixture(8,'2390','880008'),fcs=Object.entries(fbsEvidence.teams).find(([,team])=>!team.fbs)[0];
 f.event.competitions[0].competitors[1].team.id=fcs;f.summary.boxscore.players[1]={team:{id:fcs},statistics:[{name:'defensive',labels:['TOT'],athletes:[{athlete:{id:'900001',displayName:'FCS'},stats:['99']}]}]};
 f.summary.boxscore.players[0].statistics.find(group=>group.name==='passing').athletes[0].athlete.position={abbreviation:'QB'};
 const missed=fixture(8,'239','880009');let calls=0;
 globalThis.fetch=async input=>{calls++;const url=new URL(String(input));if(url.pathname.endsWith('/scoreboard'))return Response.json({season:{year:2026,type:2},week:{number:8},events:[f.event,missed.event]});if(url.pathname.endsWith('/standings'))return Response.json({season:{year:2026},children:[]});assert.ok(url.pathname.endsWith('/summary'));return url.searchParams.get('event')==='880008'?Response.json(f.summary):new Response('',{status:503});};
 try{process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';
  const response=await route.GET(new Request('http://fixture/?category=Def'));assert.equal(response.status,200);const body=await response.json();assert.equal(body.period.week,8);assert.equal(body.rankScope,'reported-values');assert.equal(body.independentNationalCertification,false);assert.equal(body.complete,false);assert.equal(body.collection.missingGames,1);assert.ok(body.lines.every(line=>line.id!=='espn:cfb:athlete:900001'));assert.equal(body.confidence.def_interceptions.status,'unverified');assert.equal(body.confidence.def_sacks.supportedPlayers,1);assert.ok(calls===3||calls===4,'three live requests plus at most one uncached conference request');
  const before=calls;const details=await route.GET(new Request('http://fixture/?view=details&snapshot='+body.snapshot+'&players='+body.lines[0].id));assert.equal(details.status,200);assert.equal(calls,before);assert.equal((await details.json()).lines[0].games[0].week,8);
 }finally{globalThis.fetch=saved;if(flag===undefined)delete process.env.AAW_STATS_V2_LOCAL_PREVIEW;else process.env.AAW_STATS_V2_LOCAL_PREVIEW=flag;}
});

test('Current exact athlete/game identity conflicts across FBS and FCS teams are withheld rather than hidden by filtering',()=>{
 const f=fixture(),fcs=Object.entries(fbsEvidence.teams).find(([,team])=>!team.fbs)[0];f.event.competitions[0].competitors[1].team.id=fcs;
 f.summary.boxscore.players[1]={team:{id:fcs},statistics:[{name:'defensive',labels:['TOT'],athletes:[{athlete:{id:'125',displayName:'Conflicting athlete'},stats:['9']}]}]};
 const model=reported(f);assert.equal(model.lines.some(line=>line.id==='espn:cfb:athlete:125'),false);assert.equal(model.collection.ambiguousPlayers,1);assert.ok(model.lines.some(line=>line.id.endsWith(':123')));
});

test('actual UI admits Current reported-value ranks only for supported metrics and preserves NFL and reviewed rank gates',async()=>{
 const ui=await readFile(file('app/preview/nfl-stats/stats-preview.tsx'),'utf8');const source=ui.slice(ui.indexOf('  const rankingAvailable ='),ui.indexOf('  const reportedCoverage ='));
 const run=new Function('data','error','fixture','league','metric',source+';return rankingAvailable;');
 const data={lines:[{id:'player'}],scope:'supplied-games',rankScope:'reported-values',confidence:{tackles:{status:'reported-values'}}};
 assert.equal(run(data,'',false,'CFB','tackles'),true);assert.equal(run(data,'',false,'CFB','def_interceptions'),false);
 assert.equal(run(data,'failed',false,'CFB','tackles'),false);assert.equal(run({...data,lines:[]},'',false,'CFB','tackles'),false);
 assert.equal(run(data,'',false,'NFL','tackles'),false);assert.equal(run({...data,confidence:{tackles:{status:'verified'}}},'',false,'NFL','tackles'),true);
 assert.equal(run({...data,scope:'reviewed-espn-week'},'',false,'CFB','tackles'),true);
});
