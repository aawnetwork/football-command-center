/** Recover contiguous completed weeks into a candidate pair. No DB, deployment or
 * incremental counters. Original provider responses and request hashes are kept
 * separately from the deployable history. A failed week never advances cutoff. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareHandoff,hash,historyHash} from './cfb-season-handoff.mjs';
import {normaliseCapture} from './cfb-season-normalise.mjs';
const root=new URL('../',import.meta.url);
const site='https://site.api.espn.com/apis/site/v2/sports/football/college-football/';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const identity=e=>({id:e.id,date:e.date,teams:e.competitions?.[0]?.competitors?.map(t=>({id:t.team?.id,homeAway:t.homeAway})).sort((a,b)=>a.id.localeCompare(b.id))});
/** Independent all-FBS team schedules must agree with the explicit weekly board.
 * Neither endpoint alone can claim weekly schedule completeness. */
export function reconcileWeek(board,schedules,membership,week){
 assert.equal(board.season?.year,2026);assert.equal(board.season.type,2);assert.equal(board.week?.number,week);
 const fbs=Object.keys(membership.teams).filter(id=>membership.teams[id].fbs);
 assert.equal(membership.season,2026);assert.ok(fbs.length>=130);
 assert.equal(schedules.length,fbs.length);assert.ok(same(schedules.map(s=>s.team?.id),fbs),'Incomplete team schedule set');
 const independent=new Map();
 for(const s of schedules){
  assert.equal(s.season?.year,2026);assert.equal(s.season.type,2);assert.ok(Array.isArray(s.events));
  for(const e of s.events.filter(e=>e.week?.number===week)){
   assert.equal(e.season?.year,2026);assert.equal(e.seasonType?.type,2);if(e.season.type!==undefined)assert.equal(e.season.type,2);
   assert.ok(e.competitions?.[0]?.competitors?.some(t=>t.team?.id===s.team.id),'Schedule owner mismatch');
   const old=independent.get(e.id);if(old)assert.deepEqual(identity(old),identity(e),'Conflicting schedule identities');else independent.set(e.id,e);
  }
 }
 assert.ok(board.events?.length>0&&board.events.length<100,'Empty or potentially truncated weekly board');
 assert.equal(new Set(board.events.map(e=>e.id)).size,board.events.length,'Duplicate scoreboard game');
 assert.ok(same(independent.keys(),board.events.map(e=>e.id)),'Scoreboard and all-team schedules disagree');
 const games=board.events.map(e=>{
  assert.match(e.id,/^[1-9]\d*$/);assert.equal(e.season?.year,2026);assert.equal(e.season.type,2);assert.equal(e.week?.number,week);
  assert.deepEqual(identity(e),identity(independent.get(e.id)),'Independent game identity mismatch');
  for(const t of e.competitions[0].competitors){
   if(membership.teams[t.team.id]?.fbs){
    const own=schedules.find(s=>s.team.id===t.team.id).events.filter(g=>g.week?.number===week&&g.id===e.id);
    assert.equal(own.length,1,'Missing or duplicate own-team schedule game');
    assert.deepEqual(identity(own[0]),identity(e),'Own-team schedule identity conflict');
   }
  }
  const c=e.competitions?.[0];assert.equal(c?.status?.type?.state,'post','Week is not wholly final');assert.equal(c.status.type.completed,true);
  assert.equal(c.competitors.length,2);assert.ok(c.competitors.some(t=>membership.teams[t.team?.id]?.fbs));
  const teams=c.competitors.map(t=>{
   const known=membership.teams[t.team?.id];assert.ok(known&&typeof known.fbs==='boolean','Unknown participant membership');
   return {id:t.team.id,name:t.team.displayName,homeAway:t.homeAway,fbs:known.fbs,conferenceId:t.team.conferenceId};
  });
  return {id:e.id,name:e.name,kickoff:e.date,state:'post',completed:true,teams};
 });
 return {season:2026,season_type:'regular',week,count:games.length,games,
  fbsMembershipEvidence:{sha256:hash(membership)},
  reconciliation:{kind:'all-fbs-team-schedules',checkedTeams:schedules.length,expectedTeams:fbs.length,gameCount:independent.size,idSetEqual:true,sha256:hash(schedules.map(s=>({team:s.team.id,games:s.events.filter(e=>e.week?.number===week).map(identity)})))}};
}
/** Resumable evidence cache; bytes, original received times and URL are pinned.
 * Failure is never cached as an empty response. No retry/redirect/provider writes. */
export function evidenceReader(directory,request=fetch){
 let requests=0,bytes=0;
 return async function get(name,url){
  const path=join(directory,name+'.json');
  try{
   const saved=await read(path);assert.equal(saved.url,url);assert.equal(saved.sha256,hash(saved.value));assert.ok(Number.isFinite(Date.parse(saved.receivedAt)));return saved;
  }catch(error){if(error.code!=='ENOENT')throw error;}
  assert.ok(++requests<=400,'Request budget exceeded');
  const response=await request(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  assert.ok(response.ok,'Provider '+response.status+'; no retry');
  const chunks=[];let size=0;assert.ok(response.body,'Missing provider body');
  for await(const chunk of response.body){size+=chunk.length;bytes+=chunk.length;if(size>12_000_000||bytes>100_000_000)throw Error('Provider byte budget exceeded');chunks.push(Buffer.from(chunk));}
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const saved={url,receivedAt:new Date().toISOString(),sha256:hash(value),value};
  await writeFile(path,JSON.stringify(saved)+'\n',{flag:'wx',mode:0o600});return saved;
 };
}
export async function retain({out,throughWeek,request=fetch}){
 await mkdir(out,{recursive:true,mode:0o700});
 let base=await read(new URL('app/lib/stats-v2/cfb-player-history.json',root)),metadata=await read(new URL('app/lib/stats-v2/cfb-season-metadata.json',root));
 assert.equal(metadata.historySha256,historyHash(base),'Retained base fingerprint mismatch');
 assert.equal(base.season,2026);assert.equal(metadata.season,2026);assert.equal(base.phase,'REG');
 const membership=await read(new URL('app/lib/cfb-team-membership-2026.json',root));
 const get=evidenceReader(out,request),reviews=[];
 const current=await get('current-scoreboard',site+'scoreboard?groups=80&limit=100&seasontype=2');
 assert.equal(current.value.season?.year,2026);assert.ok([2,3].includes(current.value.season.type),'Unverified season phase');
 const providerWeek=current.value.week?.number;
 assert.ok(Number.isInteger(providerWeek)&&providerWeek>=1&&providerWeek<=17,'Unverified current period');
 const last=throughWeek??Math.min(16,providerWeek-1);
 assert.ok(Number.isInteger(last)&&last>=metadata.throughWeek&&last<=16);
 assert.ok(last<providerWeek||current.value.season.type===3,'Cannot retain an unfinished current week');
 if(last===metadata.throughWeek)return {changed:false,reviews};
 const schedules=[];
 // Sequential and bounded. No unbounded season-summary crawl or operational storage.
 for(const id of Object.keys(membership.teams).filter(id=>membership.teams[id].fbs)){
  const saved=await get('schedule-'+id,site+`teams/${id}/schedule?season=2026&seasontype=2`);schedules.push(saved.value);
 }
 for(let week=metadata.throughWeek+1;week<=last;week++){
  const dir=join(out,'week-'+week);await mkdir(dir,{recursive:true,mode:0o700});
  const board=await get('scoreboard-'+week,site+`scoreboard?groups=80&limit=100&dates=2026&seasontype=2&week=${week}`);
  const manifest=reconcileWeek(board.value,schedules,membership,week),manifestHash=hash(manifest),captures=new Map(),requests=[],games=[];
  await writeFile(join(dir,'verified-game-set.json'),JSON.stringify(manifest)+'\n');
  for(const game of manifest.games){
   const saved=await get('summary-'+game.id,site+'summary?event='+game.id);
   const raw={source:'ESPN',game_id:game.id,summary:saved.value,summary_hash:saved.sha256,observed_at:saved.receivedAt,observation_basis:'ESPN response received by Hub bounded archive',evidence_kind:'captured-provider-response'};
   const path=join(dir,game.id+'.capture.json');
   try{await stat(path);assert.deepEqual(await read(path),raw,'Capture changed');}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(path,JSON.stringify(raw)+'\n',{flag:'wx',mode:0o600});}
   captures.set(game.id,raw);requests.push({game_id:game.id,url:saved.url,response_received_at:saved.receivedAt,summary_sha256:saved.sha256,capture_file_sha256:digest(await readFile(path))});
   const parsed=normaliseCapture({event:{id:game.id,date:game.kickoff,season:{year:2026,type:2},week:{number:week},competitions:saved.value.header.competitions},summary:saved.value,observed_at:saved.receivedAt});
   assert.equal(parsed.issues.length,0,JSON.stringify(parsed.issues));assert.ok(parsed.valid.length);
   assert.ok(parsed.coverage.teams.every(t=>!membership.teams[t.team_id.split(':').at(-1)]?.fbs||!t.missing_core_categories.length),'Missing FBS source groups');
   games.push({game_id:game.id,observation:'validated',capture:path,records:parsed.valid.length});
  }
  const report={manifest_hash:manifestHash,game_observations_complete:true,stopped_after_failure:false,games};
  const provenance={manifest_hash:manifestHash,publication_timestamp_available:false,requests};
  await writeFile(join(dir,'collection-results.json'),JSON.stringify(report)+'\n');await writeFile(join(dir,'request-provenance.json'),JSON.stringify(provenance)+'\n');
  const result=prepareHandoff({base,metadata,manifest,manifestHash,report,provenance,captures,normaliseCapture});
  base=result.history;metadata=result.metadata;reviews.push(result.review);
  await writeFile(join(dir,'handoff-review.json'),JSON.stringify(result.review)+'\n');
  console.log(JSON.stringify(result.review));
 }
 // Publish candidate files only after the entire requested contiguous recovery validates.
 await writeFile(join(out,'cfb-player-history.json'),JSON.stringify(base)+'\n');await writeFile(join(out,'cfb-season-metadata.json'),JSON.stringify(metadata)+'\n');
 await writeFile(join(out,'retention-review.json'),JSON.stringify({throughWeek:metadata.throughWeek,reviews})+'\n');
 return {changed:true,reviews,throughWeek:metadata.throughWeek};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [out,week]=process.argv.slice(2);assert.ok(out,'Supply a private candidate/evidence directory');
 console.log(JSON.stringify(await retain({out:resolve(out),throughWeek:week===undefined?undefined:Number(week)})));
}
