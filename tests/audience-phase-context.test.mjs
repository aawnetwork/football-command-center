import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { normalizeGameContext, validateSeasonEnd } from '../app/lib/game-context.ts';
const compile=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const gameContext=new URL('../app/lib/game-context.ts',import.meta.url).href;
const load=async name=>compile((await readFile(new URL(`../app/lib/${name}.ts`,import.meta.url),'utf8')).replace('"./game-context"',JSON.stringify(gameContext)));
const {audiencePhase}=await import(await load('audience-phases'));
const {seasonEndConfirmation}=await import(await load('audience-season-end'));
const now='2026-10-13T12:00:00Z';
const context=(name,state,completed,date='2026-10-12T12:00:00Z',type=2)=>normalizeGameContext('NFL',{
 id:'401000001',season:{year:2026,type},date,week:{number:6},competitions:[{date,status:{type:{name,state,completed}},competitors:[{homeAway:'home',team:{id:'1'}},{homeAway:'away',team:{id:'2'}}]}]
},{},{season:2026,seasonType:type},now);
test('Pregame/live/halftime/end-period/final map only from confidently verified source status',()=>{
 assert.equal(audiencePhase(context('STATUS_SCHEDULED','pre',false,'2026-10-13T12:00:01Z'),now),'pregame');
 for(const name of ['STATUS_IN_PROGRESS','STATUS_HALFTIME','STATUS_END_PERIOD'])assert.equal(audiencePhase(context(name,'in',false),now),'live');
 assert.equal(audiencePhase(context('STATUS_FINAL','post',true),now),'postgame');
 assert.equal(audiencePhase(context('STATUS_FINAL','post',true,'2027-01-12T12:00:00Z',3),'2027-01-13T12:00:00Z'),null); // stale observation, not a guessed phase
});
test('Kickoff passing, postponement, cancellation, unknown status and stale observations never infer a phase',()=>{
 for(const [name,state,done] of [['STATUS_SCHEDULED','pre',false],['STATUS_POSTPONED','pre',false],['STATUS_CANCELED','pre',false],['STATUS_DELAYED','in',false],['STATUS_FINAL','post',false]])assert.equal(audiencePhase(context(name,state,done),now),null);
 const live=context('STATUS_IN_PROGRESS','in',false);assert.equal(audiencePhase({...live,sourceCheckedAt:'2026-10-13T11:58:00Z'},now),null);
 assert.equal(audiencePhase({...live,verified:false},now),null);
});
test('Rescheduling retains canonical identity; regular and postseason are not conflated',()=>{
 const a=context('STATUS_SCHEDULED','pre',false,'2026-10-14T12:00:00Z'),b=context('STATUS_SCHEDULED','pre',false,'2026-10-15T12:00:00Z');
 assert.equal(a.identity,b.identity);assert.equal(audiencePhase(b,now),'pregame');
 const post=context('STATUS_FINAL','post',true,'2026-10-12T12:00:00Z',3);assert.equal(post.seasonType,'postseason');assert.equal(audiencePhase(post,now),'postgame');
});
test('Season confirmation requires explicit ended postseason and official evidence, not calendar guesses',()=>{
 const valid={league:'NFL',season:2025,endedAt:'2026-02-09T04:00:00Z',reference:'https://www.nfl.com/super-bowl/',postseasonComplete:true};
 const confirmed=seasonEndConfirmation(valid,now);assert.equal(confirmed.expiresAt,'2026-05-10T04:00:00.000Z');assert.equal(confirmed.source,'administrator');
 for(const bad of [{...valid,postseasonComplete:false},{...valid,endedAt:'2027-02-01T00:00:00Z'},{...valid,reference:'https://nfl.com.evil.test/'},{...valid,reference:'https://user:secret@nfl.com/'},{...valid,source:'verified-source'},{...valid,expiresAt:'2026-01-01T00:00:00Z'},{...valid,season:2026}])assert.throws(()=>seasonEndConfirmation(bad,now));
});
test('Exactly 90 UTC days across leap years and DST; unknown or premature confirmations fail safely',()=>{
 const endedAt='2024-02-12T03:00:00Z',confirmedAt='2024-02-13T00:00:00Z';
 const result=validateSeasonEnd({league:'NFL',season:2023,endedAt,confirmedAt,postseasonComplete:true,source:'administrator',reference:'official'},confirmedAt);
 assert.equal(Date.parse(result.expiresAt)-Date.parse(endedAt),90*86400000);assert.equal(result.expiresAt,'2024-05-12T03:00:00.000Z');
 assert.throws(()=>validateSeasonEnd({league:'CFB',season:2023,endedAt:null,confirmedAt,postseasonComplete:true,source:'administrator',reference:'official'},confirmedAt));
});
test('Private authority route has no development bypass, bounded body and CSRF; scheduler is independent of visitors',async()=>{
 const api=await readFile(new URL('../app/api/admin/audience/season-ends/route.ts',import.meta.url),'utf8');
 assert.match(api,/validExportPassword/);assert.doesNotMatch(api,/canUseExportStudio/);assert.match(api,/participationOrigin/);assert.match(api,/size > 2048/);
 const sql=await readFile(new URL('../supabase/hub-audience-phases-retention.sql',import.meta.url),'utf8');
 assert.match(sql,/primary key\(participant_id,canonical_game_id,phase\)/);assert.match(sql,/on delete cascade/);assert.match(sql,/expires_at<=asof/);assert.match(sql,/exception when others then failed:=failed\+1/);
 assert.doesNotMatch(sql,/delete from public\.hub_audience_consent/);
 const cron=await readFile(new URL('../supabase/hub-audience-retention-schedule.sql',import.meta.url),'utf8');assert.match(cron,/'17 \* \* \* \*'/);assert.match(cron,/hub_audience_run_retention/);assert.doesNotMatch(cron,/http|service_role|Bearer/);
});
test('Actual season-end API requires the existing password even locally; rejects CSRF and validates bounded confirmations',async()=>{
 const contract=new URL('../app/lib/participation-contract.ts',import.meta.url).href;
 const sec=compile((await readFile(new URL('../app/lib/participation-security.ts',import.meta.url),'utf8')).replace('"./participation-contract"',JSON.stringify(contract)));
 let source=await readFile(new URL('../app/api/admin/audience/season-ends/route.ts',import.meta.url),'utf8');
 source=source.replace('"../../../../lib/export-password"',JSON.stringify(new URL('../app/lib/export-password.ts',import.meta.url).href))
  .replace('"../../../../lib/participation-security"',JSON.stringify(sec)).replace('"../../../../lib/audience-season-end"',JSON.stringify(await load('audience-season-end')))
  .replace(/import \{ participationRpc \} from "[^"\n]+";/,'const participationRpc=(name,params)=>globalThis.__seasonRpc(name,params);');
 const route=await import(compile(source));
 const old=process.env.EXPORT_STUDIO_PASSWORD;process.env.EXPORT_STUDIO_PASSWORD='stage30-test-password-only';
 const url='https://hub.test/api/admin/audience/season-ends';const auth='Basic '+Buffer.from('aaw:stage30-test-password-only').toString('base64');
 const body={league:'NFL',season:2025,endedAt:'2026-02-09T04:00:00Z',reference:'https://www.nfl.com/super-bowl/',postseasonComplete:true};
 const request=(value=body,extra={})=>new Request(url,{method:'POST',headers:{authorization:auth,origin:'https://hub.test','content-type':'application/json',...extra},body:JSON.stringify(value)});
 let result='confirmed';const calls=[];globalThis.__seasonRpc=async(name,params)=>{calls.push({name,params});return result;};
 try{
  assert.equal((await route.GET(new Request(url))).status,401);assert.equal((await route.POST(request(body,{authorization:''}))).status,401);assert.equal(calls.length,0);
  assert.equal((await route.POST(request(body,{origin:'https://evil.test'}))).status,403);
  assert.equal((await route.POST(request({...body,postseasonComplete:false}))).status,400);
  assert.equal((await route.POST(request({reference:'x'.repeat(3000)}))).status,413);
  const response=await route.POST(request());assert.equal(response.status,200);assert.equal((await response.json()).expiresAt,'2026-05-10T04:00:00.000Z');assert.equal(calls[0].params.p_postseason_complete,true);
  result='conflict';assert.equal((await route.POST(request())).status,409);
  globalThis.__seasonRpc=()=>{throw Error('secret must not escape')};const failed=await route.GET(new Request(url,{headers:{authorization:auth}}));assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/secret/);
 }finally{if(old===undefined)delete process.env.EXPORT_STUDIO_PASSWORD;else process.env.EXPORT_STUDIO_PASSWORD=old;delete globalThis.__seasonRpc;}
});
