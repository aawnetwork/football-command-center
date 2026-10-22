import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareHandoff,hash,historyHash} from '../scripts/cfb-season-handoff.mjs';
const fixture=JSON.parse(await readFile(new URL('./fixtures/cfb-live-week8.json',import.meta.url),'utf8'));
// Inject a narrow validator result to test the handoff contract; real Utility Room
// validation of the captured provider record is performed separately offline.
function setup(){
 const summary=structuredClone(fixture.summary);summary.header.competitions[0].status.type={state:'post',completed:true};
 const teams=summary.header.competitions[0].competitors.map(t=>({id:t.team.id,name:t.team.displayName,homeAway:t.homeAway,fbs:true,conferenceId:'12'}));
 const manifest={season:2026,season_type:'regular',week:8,count:1,coreIdSetEqual:true,coreReportedCount:1,fbsMembershipEvidence:{sha256:'a'.repeat(64)},games:[{id:summary.header.id,kickoff:fixture.scoreboard.events[0].date,state:'post',completed:true,teams}]};
 const base={season:2026,phase:'REG',columns:['carries','rushing_yards','rushing_long'],players:[],teams:{},games:[],rows:[],sourceManifests:[]};
 const metadata={season:2026,throughWeek:7,names:{},positions:{},conferences:{},historySha256:historyHash(base)};
 const record={player_id:'espn:cfb:athlete:5220253',player_name:'James Jones',team_id:'espn:cfb:team:166',opponent_id:'espn:cfb:team:2534',game_id:'espn:cfb:game:'+summary.header.id,season:2026,week:8,completed:true,statistics:{carries:8,rushing_yards:20,rushing_long:0}};
 const report={manifest_hash:hash(manifest),game_observations_complete:true,stopped_after_failure:false,games:[{game_id:summary.header.id,observation:'validated'}]};
 const raw={game_id:summary.header.id,source:'ESPN',summary,summary_hash:hash(summary),observed_at:fixture.observedAt,observation_basis:'retained provider capture'};
 return {base,metadata,manifest,manifestHash:hash(manifest),report,provenance:{manifest_hash:hash(manifest),requests:[{game_id:raw.game_id,summary_sha256:raw.summary_hash,response_received_at:raw.observed_at}]},captures:new Map([[summary.header.id,raw]]),normaliseCapture:()=>({issues:[],valid:[record]})};
}
test('complete next-week pair is restart-safe, exact, idempotent and leaves original evidence unchanged',async()=>{
 const input=setup(),before=JSON.stringify(input.base),result=prepareHandoff(input);
 assert.equal(result.metadata.throughWeek,8);assert.equal(result.metadata.historySha256,historyHash(result.history));assert.equal(result.history.rows.length,1);assert.equal(result.history.rows[0][4][2],0);assert.deepEqual(result.metadata.positions,{});assert.equal(JSON.stringify(input.base),before);
 const dir=await mkdtemp(join(tmpdir(),'cfb-handoff-'));await writeFile(join(dir,'history.json'),JSON.stringify(result.history));await writeFile(join(dir,'metadata.json'),JSON.stringify(result.metadata));
 const fresh=JSON.parse(await readFile(join(dir,'history.json'))),meta=JSON.parse(await readFile(join(dir,'metadata.json')));
 const rerun=prepareHandoff({...input,base:fresh,metadata:meta});assert.deepEqual(rerun.history,fresh);assert.equal(rerun.review.idempotent,true);
 const altered=structuredClone(input.captures.get(input.manifest.games[0].id));altered.summary_hash='b'.repeat(64);assert.throws(()=>prepareHandoff({...input,captures:new Map([[altered.game_id,altered]])}),/hash mismatch/);
});
test('incomplete, non-final, wrong-period, duplicated, unpinned and skipped-week evidence fails closed',()=>{
 for(const change of [x=>x.report.game_observations_complete=false,x=>x.manifest.games[0].completed=false,x=>x.manifest.week=9,x=>x.report.games.push(x.report.games[0]),x=>x.manifestHash='bad',x=>x.captures.clear(),x=>x.captures.values().next().value.summary.header.week=9]){
  const x=setup();change(x);assert.throws(()=>prepareHandoff(x));
 }
});
