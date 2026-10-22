/** Offline only. Prepare a new, complete history/metadata pair; never overwrite the
 * running base, collect data, access SQLite or infer new player positions. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const historyHash=value=>createHash('sha256').update(JSON.stringify(value)+'\n').digest('hex');
const names={def_tackles_solo:'solo_tackles',def_sacks:'defensive_sacks',def_tackles_for_loss:'tackles_for_loss',def_interceptions:'defensive_interceptions',def_pass_defended:'passes_defended',def_qb_hurries:'qb_hurries',def_tds:'defensive_touchdowns'};
/** Uses the existing Utility Room normaliseCapture function, injected for offline
 * tests. Collection report and capture hashes must agree with the pinned manifest. */
export function prepareHandoff({base,metadata,manifest,manifestHash,report,provenance,captures,normaliseCapture}){
 assert.equal(metadata.historySha256,historyHash(base),'Base fingerprint mismatch');
 assert.equal(base.season,2026);assert.equal(metadata.season,base.season);assert.ok(Number.isInteger(metadata.throughWeek)&&metadata.throughWeek>=1);assert.ok(Number.isInteger(manifest.week)&&manifest.week<=30);
 assert.equal(manifestHash,hash(manifest),'Pinned manifest mismatch');
 assert.equal(manifest.season,base.season);assert.equal(manifest.season_type,'regular');assert.equal(base.phase,'REG');
 assert.equal(manifest.coreIdSetEqual,true,'Independent game sets must agree');
 assert.equal(manifest.coreReportedCount,manifest.count);assert.ok(manifest.count>0);
 assert.equal(manifest.games.length,manifest.count);assert.equal(new Set(manifest.games.map(g=>g.id)).size,manifest.count,'Duplicate games');
 assert.match(manifest.fbsMembershipEvidence?.sha256??'',/^[a-f0-9]{64}$/);
 assert.equal(provenance.manifest_hash,manifestHash);
 assert.equal(report.manifest_hash,manifestHash);assert.equal(report.game_observations_complete,true,'Incomplete collection');
 assert.equal(report.stopped_after_failure,false);assert.equal(report.games.length,manifest.count);
 const repeat=metadata.throughWeek===manifest.week;
 assert.ok(repeat||manifest.week===metadata.throughWeek+1,'Intervening weeks missing');
 if(repeat)assert.equal(base.sourceManifests.find(m=>m.week===manifest.week)?.sha256,manifestHash,'Different already-retained week');
 else assert.ok(!base.games.some(g=>g.week>=manifest.week),'Unexpected future retained game');
 const data=structuredClone(base),meta=structuredClone(metadata),seen=new Set();let fbsRecords=0,nonFbsRecords=0;
 for(const game of manifest.games){
  assert.equal(game.state,'post');assert.equal(game.completed,true,'Non-final game');assert.ok(Number.isFinite(Date.parse(game.kickoff)));
  assert.equal(game.teams.length,2);assert.notEqual(game.teams[0].id,game.teams[1].id);assert.ok(game.teams.some(t=>t.fbs===true));
  const entries=report.games.filter(g=>g.game_id===game.id);assert.equal(entries.length,1);assert.equal(entries[0].observation,'validated');
  const raw=captures.get(game.id);assert.ok(raw,'Missing capture');assert.equal(raw.game_id,game.id);assert.equal(raw.source,'ESPN');
  const proof=provenance.requests.filter(p=>p.game_id===game.id);assert.equal(proof.length,1,'Missing original request provenance');
  assert.equal(proof[0].summary_sha256,raw.summary_hash,'Original source hash mismatch');assert.equal(proof[0].response_received_at,raw.observed_at,'Observation timestamp changed');
  assert.equal(raw.summary_hash,hash(raw.summary),'Capture hash mismatch');assert.ok(Number.isFinite(Date.parse(raw.observed_at)));assert.ok(raw.observation_basis);
  const summary=raw.summary,c=summary.header?.competitions?.[0];assert.equal(summary.header.id,game.id);
  assert.equal(summary.header.season.year,base.season);assert.equal(summary.header.season.type,2);assert.equal(typeof summary.header.week==='number'?summary.header.week:summary.header.week?.number,manifest.week);
  if(c.date)assert.equal(Date.parse(c.date),Date.parse(game.kickoff),'Kickoff mismatch');
  assert.equal(c.status.type.completed,true);assert.equal(c.status.type.state,'post');
  assert.deepEqual(c.competitors.map(t=>t.team.id).sort(),game.teams.map(t=>t.id).sort());
  for(const t of game.teams){assert.equal(c.competitors.find(p=>p.team.id===t.id).homeAway,t.homeAway);assert.equal(typeof t.fbs,'boolean');if(data.teams[t.id])assert.equal(data.teams[t.id].fbs,t.fbs,'FBS membership conflict');}
  for(const t of game.teams){if(!data.teams[t.id])data.teams[t.id]={name:t.name,logo:null,fbs:t.fbs};}
  const input={event:{id:game.id,date:game.kickoff,season:{year:base.season,type:2},week:{number:manifest.week},competitions:[c]},summary,observed_at:raw.observed_at,observation_basis:raw.observation_basis,evidence_kind:'captured-provider-response'};
  const parsed=normaliseCapture(input);assert.equal(parsed.issues.length,0,JSON.stringify(parsed.issues));assert.ok(parsed.valid.length,'No individual evidence');
  const retained={id:'espn:cfb:game:'+game.id,week:manifest.week,kickoff:game.kickoff,observedAt:raw.observed_at,observationBasis:raw.observation_basis,summarySha256:hash(summary),importHash:hash(input),home:game.teams.find(t=>t.homeAway==='home').id,away:game.teams.find(t=>t.homeAway==='away').id};
  let gi=data.games.findIndex(g=>g.id===retained.id);
  if(repeat){assert.ok(gi>=0);assert.deepEqual(data.games[gi],retained,'Changed retained game requires explicit correction review');}
  else {assert.equal(gi,-1,'Already retained identity');gi=data.games.length;data.games.push(retained);}
  const expected=[];
  for(const r of parsed.valid){
   assert.equal(r.season,base.season);assert.equal(r.week,manifest.week);assert.equal(r.game_id,retained.id);assert.equal(r.completed,true);
   const team=r.team_id.split(':').at(-1),opponent=r.opponent_id.split(':').at(-1),t=game.teams.find(t=>t.id===team);assert.ok(t);assert.ok(game.teams.some(t=>t.id===opponent&&t.id!==team));
   const key=r.player_id+'|'+r.game_id;assert.ok(!seen.has(key),'Duplicate athlete/game');seen.add(key);
   if(!t.fbs){nonFbsRecords++;continue;}fbsRecords++;
   if(!data.teams[team])data.teams[team]={name:t.name,logo:null,fbs:true};
   if(t.conferenceId){if(meta.conferences[team])assert.equal(meta.conferences[team],t.conferenceId,'Conference conflict');meta.conferences[team]=t.conferenceId;}
   meta.names[r.player_id]=r.player_name;
   let pi=data.players.indexOf(r.player_id);if(pi<0){assert.ok(!repeat);pi=data.players.length;data.players.push(r.player_id);}
   const cells=data.columns.map(k=>r.statistics[names[k]??k]??null);assert.ok(cells.every(v=>v===null||typeof v==='number'&&Number.isFinite(v)));
   expected.push([pi,gi,team,opponent,cells]);
  }
  if(repeat)assert.deepEqual(data.rows.filter(r=>r[1]===gi),expected,'Changed retained records');else data.rows.push(...expected);
 }
 if(!repeat)data.sourceManifests.push({week:manifest.week,sha256:manifestHash,games:manifest.count});
 meta.throughWeek=manifest.week;meta.historySha256=historyHash(data);
 return {history:data,metadata:meta,review:{week:manifest.week,games:manifest.count,fbsRecords,nonFbsRecords,manifestHash,historySha256:meta.historySha256,idempotent:repeat,positions:'Existing exact season/team positions retained; new identities remain unresolved',nationalCertification:false}};
}
// Explicit file arguments only. The pure Utility Room validator is a development
// dependency supplied by path, never a dependency of the deployed Football Hub.
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [basePath,metadataPath,manifestPath,pin,reportPath,provenancePath,validatorPath,out]=process.argv.slice(2);
 assert.ok(out,'Usage: node scripts/cfb-season-handoff.mjs BASE META MANIFEST PIN REPORT PROVENANCE UTILITY_VALIDATOR NEW_OUTPUT_DIR');
 const read=async p=>JSON.parse(await readFile(p,'utf8'));
 const [base,metadata,manifest,report,provenance]=await Promise.all([read(basePath),read(metadataPath),read(manifestPath),read(reportPath),read(provenancePath)]);
 const {normaliseCapture}=await import(pathToFileURL(resolve(validatorPath)).href),captures=new Map();
 for(const g of report.games){assert.ok(g.capture);assert.ok(!captures.has(g.game_id));const bytes=await readFile(g.capture),proof=provenance.requests.find(p=>p.game_id===g.game_id);assert.equal(createHash('sha256').update(bytes).digest('hex'),proof?.capture_file_sha256,'Original capture file hash mismatch');captures.set(g.game_id,JSON.parse(bytes));}
 const result=prepareHandoff({base,metadata,manifest,manifestHash:pin,report,provenance,captures,normaliseCapture});
 await mkdir(out,{mode:0o700}); // fail if output exists; preserve earlier evidence
 for(const [file,value]of [['cfb-player-history.json',result.history],['cfb-season-metadata.json',result.metadata],['handoff-review.json',result.review]])await writeFile(resolve(out,file),JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify(result.review));
}
