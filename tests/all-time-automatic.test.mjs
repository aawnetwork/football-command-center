import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const file=name=>new URL('../app/lib/'+name,import.meta.url);
const {reconcileNflTeamGames,nflTeamRecordSets}=await import(await compileLocalModule(file('all-time-nfl-teams.ts')));
const {loadNflTeamResults}=await import(await compileLocalModule(file('all-time-nfl-results.ts')));
const baseline=JSON.parse(await readFile(file('all-time-nfl-baseline.json'),'utf8'));
const fixture=JSON.parse(await readFile(new URL('./fixtures/nfl-all-time-final.json',import.meta.url),'utf8'));
const now=()=>Date.parse('2026-10-23T12:00:00Z');
const clock=new Date(now()).toISOString();
const game={id:'espn:nfl:game:401872944',season:2026,week:2,home:'Dallas Cowboys',away:'Washington Commanders',homeScore:37,awayScore:20};
const number=(sets,category,team)=>sets[category].find(row=>row.player===team).value;
function csv(row=fixture.row){const fields=Object.keys(row);return fields.join(',')+'\n'+fields.map(key=>String(row[key]).includes(',')?'"'+row[key]+'"':row[key]).join(',')+'\n';}
function source({row=fixture.row,board=fixture.board,fail=false}={}){
 const calls=[];
 const request=async(url,options)=>{calls.push(String(url));assert.ok(options.signal);if(fail)return new Response('',{status:503});if(String(url).includes('games.csv'))return new Response(csv(row));assert.match(String(url),/dates=2026&seasontype=2&week=2/);return Response.json(board);};
 return {request,calls};
}
test('all 32 official baselines have explicit 2025 cutoff evidence and a pinned fingerprint',()=>{
 const {fingerprint,...payload}=baseline;assert.equal(fingerprint,createHash('sha256').update(JSON.stringify(payload)).digest('hex'));
 assert.equal(baseline.teams.length,32);assert.equal(baseline.throughSeason,2025);
 for(const team of baseline.teams){assert.match(team.sourceUrl,/profootballhof.com\/teams\/.+\/team-facts$/);assert.match(team.evidence,/2026/);assert.match(team.sourceSha256,/^[a-f0-9]{64}$/);}
 assert.equal(baseline.teams.find(team=>team.name==='San Francisco 49ers').wins,642);
 assert.equal(baseline.teams.filter(team=>!team.retainedMatches).length,1);
});
test('actual retained Dallas 37–20 final updates verified WLT, games and unrounded percentage once',async()=>{
 const mock=source(),ledger=await loadNflTeamResults(undefined,mock.request,now),sets=nflTeamRecordSets(ledger);
 assert.deepEqual(ledger.games,[game]);assert.equal(mock.calls.length,2);
 assert.equal(number(sets,'wins','Dallas Cowboys'),577);assert.equal(number(sets,'games-played','Dallas Cowboys'),1016);assert.equal(number(sets,'winning-percentage','Dallas Cowboys'),(577+3.5)/1016*100);
 assert.equal(sets.wins.find(row=>row.player==='Washington Commanders').team,'646–661–29');
 const repeat=source();const twice=await loadNflTeamResults(JSON.parse(JSON.stringify(ledger)),repeat.request,now);assert.deepEqual(twice,ledger);assert.equal(repeat.calls.length,1,'unchanged finals require no ESPN reads');
 assert.deepEqual(nflTeamRecordSets(JSON.parse(JSON.stringify(twice))),sets,'fresh server replays persisted evidence, not increments');
});
test('verified corrections replace prior outcomes; ties count half a win and never accumulate',()=>{
 const first=reconcileNflTeamGames(undefined,[game],clock),before=structuredClone(first);
 const reversed=reconcileNflTeamGames(first,[{...game,homeScore:20,awayScore:37}],clock);
 assert.equal(nflTeamRecordSets(reversed).wins.find(row=>row.player===game.home).team,'576–433–7');assert.equal(number(nflTeamRecordSets(reversed),'games-played',game.home),1016);assert.deepEqual(first,before);
 const tied=reconcileNflTeamGames(reversed,[{...game,homeScore:20,awayScore:20}],clock),sets=nflTeamRecordSets(tied);
 assert.equal(sets.wins.find(row=>row.player===game.home).team,'576–432–8');assert.equal(number(sets,'winning-percentage',game.home),580/1016*100);
 assert.deepEqual(reconcileNflTeamGames(tied,[],clock),tied,'no observation/disappeared scoreboard retains verified finals');
});
test('new final results and corrections require exact ESPN final/period/participants; failures keep prior ledger intact',async()=>{
 const previous=reconcileNflTeamGames(undefined,[game],clock),before=structuredClone(previous);
 const correctedRow={...fixture.row,home_score:'20',away_score:'37',result:'-17'};
 const correctedBoard=structuredClone(fixture.board);correctedBoard.events[0].competitions[0].competitors[0].score='20';correctedBoard.events[0].competitions[0].competitors[1].score='37';
 const corrected=await loadNflTeamResults(previous,source({row:correctedRow,board:correctedBoard}).request,now);assert.equal(number(nflTeamRecordSets(corrected),'wins',game.home),576);
 for(const change of ['live','period','identity','score']){
  const board=structuredClone(fixture.board);if(change==='live')board.events[0].competitions[0].status.type.completed=false;
  if(change==='period')board.week.number=3;if(change==='identity')board.events[0].competitions[0].competitors[0].team.abbreviation='NYG';if(change==='score')board.events[0].competitions[0].competitors[0].score='--';
  await assert.rejects(loadNflTeamResults(undefined,source({board}).request,now));
 }
 await assert.rejects(loadNflTeamResults(previous,source({fail:true}).request,now));assert.deepEqual(previous,before);
 const noGame=await loadNflTeamResults(previous,source({row:{...fixture.row,espn:'999999999',home_score:'',away_score:'',result:''}}).request,now);assert.deepEqual(noGame,previous);
});
test('season rollovers, historical exclusions and ambiguous identities fail safely',()=>{
 const first=reconcileNflTeamGames(undefined,[game],clock);
 const next=reconcileNflTeamGames(first,[{...game,id:'espn:nfl:game:999999999',season:2027,week:1}], '2027-09-25T12:00:00Z');assert.equal(number(nflTeamRecordSets(next),'wins',game.home),578);
 for(const patch of [{season:2025},{home:'Oakland Raiders'},{away:game.home},{homeScore:null},{week:0}])assert.throws(()=>reconcileNflTeamGames(first,[{...game,...patch}],clock));
 assert.throws(()=>reconcileNflTeamGames({...first,baselineHash:'wrong'},[],clock));assert.throws(()=>reconcileNflTeamGames(undefined,[game,{...game,homeScore:0}],clock));
});
let instance=0;
async function publication({careerFails=false,teamFails=false,conflict=false},run){
 const saved={...process.env},old=globalThis.fetch;process.env.SUPABASE_URL='https://all-time-auto-test.invalid';process.env.SUPABASE_SECRET_KEY='test-only';process.env.NODE_ENV='production';
 let state={version:1,catalogVersion:'espn-active-career-v3',signals:[],snapshots:[]},writes=0,stamp='2026-10-22T12:00:00Z',providerReads=0;
 const provider=source({fail:teamFails});globalThis.fetch=async(url,options={})=>{
  if(!String(url).startsWith('https://all-time-auto-test.invalid')){providerReads++;return provider.request(url,options);}
  if(!options.method)return Response.json([{state:structuredClone(state),updated_at:stamp}]);
  assert.equal(options.method,'PATCH');assert.ok(String(url).includes('updated_at=eq.'));if(conflict)return Response.json([]);
  state=JSON.parse(options.body).state;writes++;stamp='2026-10-23T12:00:01Z';return Response.json([{id:'global'}]);
 };
 const sourceCode=careerFails?'export async function loadNflActiveCareerSource(){throw Error("career unavailable")}':`export async function loadNflActiveCareerSource(){return ${JSON.stringify({checkedAt:new Date().toISOString(),categories:Object.fromEntries(['passing-yards','passing-td','rushing-yards','rushing-td','receiving-yards','receiving-td','tackles','sacks','interceptions'].map(key=>[key,key==='passing-yards'?[{player:'Aaron Rodgers',team:'Pittsburgh Steelers',years:'2005–2026',value:67000,playerId:'espn:nfl:8439'}]:[]]))})}}`;
 const overrides=new Map([[file('all-time-live-sources.ts').href,sourceCode],[file('all-time-monitor.ts').href,(await readFile(file('all-time-monitor.ts'),'utf8'))+'\n// fresh instance '+instance++]]);
 try{const mod=await import(await compileLocalModule(file('all-time-monitor.ts'),overrides));await run(mod,{get state(){return state;},get writes(){return writes;},get providerReads(){return providerReads;},cold:async()=>{overrides.set(file('all-time-monitor.ts').href,(await readFile(file('all-time-monitor.ts'),'utf8'))+'\n// cold instance '+instance++);return import(await compileLocalModule(file('all-time-monitor.ts'),overrides));}});}
 finally{globalThis.fetch=old;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
}
test('scheduled publication persists to existing storage and public/cold reads never trigger providers',()=>publication({},async(mod,state)=>{
 const update=await mod.refreshAllTimeMonitor('NFL');assert.ok(update.teamResults);assert.equal(update.teamResults.games,1);assert.equal(state.writes,1);
 const before=state.providerReads,feed=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(feed.leaderboards['NFL:team:career:wins'].find(row=>row.name===game.home).value,577);assert.equal(feed.datasets['NFL:team:career:wins'].mode,'team-results');assert.equal(feed.source.team.baselineThroughSeason,2025);assert.equal(state.providerReads,before);
 const cold=await state.cold();assert.deepEqual((await cold.getAllTimeLeaderboardFeed('NFL')).leaderboards,feed.leaderboards);
}));
test('individual-source failure does not block Team updates; Team failure does not block verified individual observations',async()=>{
 await publication({careerFails:true},async(mod,state)=>{const result=await mod.refreshAllTimeMonitor('NFL');assert.equal(result.failures.individual,true);assert.equal(state.state.nflTeamLedger.games.length,1);assert.equal(result.failures.team,false);});
 await publication({teamFails:true},async(mod,state)=>{const result=await mod.refreshAllTimeMonitor('NFL');assert.equal(result.failures.team,true);assert.equal(state.state.nflTeamLedger,undefined);const feed=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(feed.leaderboards['NFL:individual:career:passing-yards'].find(row=>row.name==='Aaron Rodgers').value,67000);assert.ok(feed.source.team.failedAt);});
});
test('concurrent publication is rejected instead of clobbering another league; both-source failures write nothing',async()=>{
 await publication({conflict:true},async(mod,state)=>{await assert.rejects(mod.refreshAllTimeMonitor('NFL'),/Concurrent/);assert.equal(state.writes,0);});
 await publication({careerFails:true,teamFails:true},async(mod,state)=>{await assert.rejects(mod.refreshAllTimeMonitor('NFL'),/career unavailable/);assert.equal(state.writes,0);});
});
