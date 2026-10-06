import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSnapshots,mapEntries,parseSelection,getArchivePolls} from '../app/lib/cfb-polls.ts';
import {previousRankLabel} from '../app/features/standings/poll-model.ts';
const row=(week,phase='regular',season=2026)=>({id:`${season}-${phase}-${week}`,poll_type:'ap',season,season_phase:phase,week,published_at:null,captured_at:'2026-10-01T00:00:00Z',source:'ESPN',revision:1,entries:[{rank:1,previous_rank:null,team_name:'A',team_abbreviation:null,team_logo_url:null,record:'1-0',points:null,first_place_votes:null}]});
test('Latest ignores historical replacement/publication dates and respects season/phase/week',()=>{
 const old={...row(2),published_at:'2099-01-01',captured_at:'2099-01-01',revision:100};
 const rows=[old,row(6),row(0,'preseason'),row(1,'postseason'),row(0,'preseason',2027)];
 assert.deepEqual(rows.sort(compareSnapshots).map(r=>r.id),['2027-preseason-0','2026-postseason-1','2026-regular-6','2026-regular-2','2026-preseason-0']);
});
test('Known, unknown and explicit NR are distinct; null points/votes stay null',()=>{
 const r=row(4);r.entries=[null,5,0].map((previous_rank,i)=>({...r.entries[0],rank:i+1,previous_rank}));
 r.entries.push({...r.entries[0],rank:4,previous_rank_status:'unranked'});
 assert.deepEqual(mapEntries(r).map(previousRankLabel),['—',5,'NR','NR']);
 assert.equal(mapEntries(r)[0].points,null);assert.equal(mapEntries(r)[0].firstPlaceVotes,null);
});
test('Selection accepts preseason zero and rejects invalid/incomplete parameters',()=>{
 assert.equal(parseSelection(new URLSearchParams('week=0')).phase,'preseason');
 for(const q of ['type=coaches','season=0','week=-1','week=31','week=','phase=bad&week=1','phase=regular'])assert.throws(()=>parseSelection(new URLSearchParams(q)));
});
test('Archive reads actual availability, never fabricates missing week, and keeps older snapshots',async()=>{
 const previousFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_POLL_READ_KEY;
 const archive=[row(0,'preseason'),row(2),row(4),row(6),{...row(4),poll_type:'uki'}];
 const calls=[];process.env.SUPABASE_URL='https://archive.example';process.env.SUPABASE_POLL_READ_KEY='sb_publishable_test';
 globalThis.fetch=async(url,options)=>{
  calls.push({url,options});const q=new URL(url).searchParams;
  let rows=archive.filter(r=>r.poll_type===q.get('poll_type').slice(3));
  for(const field of ['season','season_phase','week'])if(q.has(field))rows=rows.filter(r=>String(r[field])===q.get(field).slice(3));
  return Response.json(rows);
 };
 try {
  const latest=await getArchivePolls(new URLSearchParams('type=ap'));assert.equal(latest.poll.week,6);
  assert.deepEqual(latest.availableSnapshots.map(r=>r.week),[6,4,2,0]);
  for(const week of [0,2,4]){const p=await getArchivePolls(new URLSearchParams(`type=ap&season=2026&week=${week}`));assert.equal(p.poll.week,week);}
  const missing=await getArchivePolls(new URLSearchParams('type=ap&season=2026&week=1'));assert.equal(missing.poll,null);assert.equal(missing.selectedWeek,1);
  const uki=await getArchivePolls(new URLSearchParams('type=uki'));assert.deepEqual(uki.availableWeeks,[4]);
  const cfp=await getArchivePolls(new URLSearchParams('type=cfp'));assert.equal(cfp.poll,null);assert.deepEqual(cfp.availableSnapshots,[]);
  archive.push(row(7));assert.equal((await getArchivePolls(new URLSearchParams('type=ap'))).poll.week,7);
  assert.equal((await getArchivePolls(new URLSearchParams('type=ap&season=2026&week=2'))).poll.week,2);
  assert.ok(calls.every(c=>c.options.cache==='no-store'&&c.options.headers.apikey==='sb_publishable_test'));
 } finally {globalThis.fetch=previousFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_POLL_READ_KEY;else process.env.SUPABASE_POLL_READ_KEY=oldKey;}
});
