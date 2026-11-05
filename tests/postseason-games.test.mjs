import test from 'node:test';
import assert from 'node:assert/strict';
import { compileLocalModule } from './helpers/compile-local-module.mjs';
const {loadPostseason}=await import(await compileLocalModule(new URL('../app/lib/postseason-service.ts',import.meta.url)));
const {seasonGameSelection,seasonGameUrl,postseasonTime,postseasonDay}=await import(await compileLocalModule(new URL('../app/lib/season-game-selection.ts',import.meta.url)));
const final={name:'STATUS_FINAL',state:'post',completed:true,shortDetail:'Final'};
function event(id,label,date='2027-01-02T01:00Z',week=1,teams=['1','2']){
 return {id,date,season:{year:2026,type:3},week:{number:week},competitions:[{date,status:{type:final},notes:[{type:'event',headline:label}],competitors:[{homeAway:'away',team:{id:teams[0],displayName:`Team ${teams[0]}`},score:'0',records:[{type:'total',summary:'10-3'}]},{homeAway:'home',team:{id:teams[1],displayName:`Team ${teams[1]}`},score:'14',winner:true}]}]};
}
function board(events,entries=[]){return {season:{year:2026,type:3},events,leagues:[{calendar:[{value:'3',entries}]}]};}
test('college merges all bowls and the separate CFP selection, keeps January in its source season, and never duplicates a CFP bowl',async()=>{
 const rose=event('101','Rose Bowl'),other=event('102','Holiday Bowl'),regular={...event('103','Regular game'),season:{year:2026,type:2}};
 const called=[];
 const result=await loadPostseason('CFB',2026,async url=>{
  called.push(url);const week=new URL(url).searchParams.get('week');
  if(week==='999')return board([rose]);
  return board([rose,other,regular],[{value:'1',label:'Bowls'}]);
 });
 assert.ok(called.some(u=>u.includes('week=999')));assert.ok(called.every(u=>u.includes('limit=100')));
 assert.equal(result.games.length,2);assert.equal(result.games.filter(g=>g.playoff).length,1);
 assert.equal(result.games.find(g=>g.id==='101').context.season,2026);
 assert.equal(result.games.find(g=>g.id==='101').context.competitionKind,'playoff');
 assert.equal(result.games.find(g=>g.id==='102').teams[0].id,'2');
 assert.equal(result.games.find(g=>g.id==='102').teams[1].score,'0');
});
test('NFL requests all published playoff rounds and excludes Pro Bowl without assuming week 4 is always Pro Bowl',async()=>{
 const entries=[{value:'1',label:'Wild Card'},{value:'2',label:'Divisional Round'},{value:'3',label:'Conference Championship'},{value:'4',label:'Pro Bowl'},{value:'5',label:'Super Bowl'}],called=[];
 const result=await loadPostseason('NFL',2026,async url=>{
  const w=new URL(url).searchParams.get('week');called.push(w);
  return board(w?[event(String(200+ +w),'',undefined,+w)]:[],entries);
 });
 assert.deepEqual(called,[null,'1','2','3','5']);
 assert.deepEqual(result.games.map(g=>g.round),['wild-card','divisional','conference','super-bowl']);
});
test('partial feed failures keep available games with a visible coverage issue; complete failures do not pretend no games exist',async()=>{
 const result=await loadPostseason('CFB',2026,async url=>{if(url.includes('week=999'))throw Error('offline');return board([event('301','Holiday Bowl')]);});
 assert.equal(result.games.length,1);assert.equal(result.issues.length,1);
 await assert.rejects(()=>loadPostseason('NFL',2026,async()=>{throw Error('offline');}),/temporarily unavailable/);
});
test('conflicting event identities stay withheld even if another response repeats them',async()=>{
 const result=await loadPostseason('CFB',2026,async url=>board([event('401','Bowl',undefined,1,url.includes('week=1')?['3','4']:['1','2'])]));
 assert.equal(result.games.length,0);assert.ok(result.issues.some(x=>x.includes('conflicting')));
});
test('postseason links retain phase, season and round across refresh, reject NFL bowls and preserve Compare/history parameters',()=>{
 const clock={season:2026,phase:3};
 assert.equal(seasonGameSelection(new URLSearchParams(),'CFB',clock).phase,'bowls');
 assert.equal(seasonGameSelection(new URLSearchParams(),'NFL',clock).phase,'playoffs');
 assert.equal(seasonGameSelection(new URLSearchParams('gamePhase=regular'),'NFL',clock).phase,'regular');
 assert.equal(seasonGameSelection(new URLSearchParams('gamePhase=bowls'),'NFL',{...clock,phase:2}).phase,'regular');
 const path=seasonGameUrl('http://localhost:3001/cfb?section=games&source=home#scores',{phase:'playoffs',season:2025,round:'quarterfinal'});
 const state=seasonGameSelection(new URL(path,'http://localhost:3001').searchParams,'CFB',clock);
 assert.deepEqual(state,{phase:'playoffs',season:2025,round:'quarterfinal'});
 assert.ok(path.includes('source=home'));assert.ok(path.endsWith('#scores'));
 assert.equal(seasonGameSelection(new URLSearchParams('postSeason=2026&postSeason=2025&postRound=bad'),'NFL',clock).round,'all');
});
test('unannounced kickoffs never become a false 5am UK kickoff',()=>{
 assert.match(postseasonTime('2027-01-16T05:00Z',true),/Time TBA/);
 assert.doesNotMatch(postseasonTime('2027-01-16T05:00Z',true),/05:00/);
 assert.match(postseasonTime('2027-01-16T21:30Z',false),/21:30/);
 assert.equal(postseasonDay('2025-12-14T01:00Z',false).replace(/,/g,''),'Sun 14 Dec');
 assert.equal(postseasonDay('2027-01-16T05:00Z',true).replace(/,/g,''),'Sat 16 Jan');
});
