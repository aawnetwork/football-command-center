import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { parseContribution, personalTierChange, advanceRevision } from '../app/lib/audience-contributions.ts';
const compile=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const file=name=>new URL(`../${name}`,import.meta.url);
const read=name=>readFile(file(name),'utf8');
const contract=file('app/lib/participation-contract.ts').href;
const security=compile((await read('app/lib/participation-security.ts')).replace('"./participation-contract"',JSON.stringify(contract)));
const store=compile('export class ParticipationError extends Error { constructor(message, status=503){super(message);this.status=status;} } export const participationRpc=(name,params)=>globalThis.__selectionRpc(name,params);');
let validator=await read('app/lib/audience-validation.ts');
validator=validator.replace('import "server-only";','').replace('"./game-context"',JSON.stringify(file('app/lib/game-context.ts').href))
 .replace('"./team-logos"',JSON.stringify(file('app/lib/team-logos.ts').href)).replace('"./participation-store"',JSON.stringify(store));
validator=validator.replace('"./audience-phases"',JSON.stringify(compile((await read('app/lib/audience-phases.ts')).replace('"./game-context"',JSON.stringify(file('app/lib/game-context.ts').href)))));
const validatorUrl=compile(validator),validation=await import(validatorUrl);
let source=await read('app/api/audience/contributions/route.ts');
source=source.replace('"../../../lib/audience-contributions"',JSON.stringify(file('app/lib/audience-contributions.ts').href))
 .replace('"../../../lib/audience-validation"',JSON.stringify(validatorUrl)).replace('"../../../lib/participation-security"',JSON.stringify(security))
 .replace('"../../../lib/participation-store"',JSON.stringify(store));
const route=await import(compile(source));
const receipt='12345678-1234-4123-8123-123456789abc';
const base={kind:'tier',league:'NFL',season:2026,eventId:'401772833',identity:'NFL:2026:401772833',tier:'A',revision:Date.now()*1000,consentGrantedAt:'2026-10-12T12:00:00Z',consentReceipt:receipt};
const summary=(league='NFL',eventId='401772833',season=2026)=>({header:{id:eventId,season:{year:season,type:2},week:2,league:{id:league==='NFL'?'28':'23',slug:league==='NFL'?'nfl':'college-football'},competitions:[{date:`${season}-09-14T17:00:00Z`,competitors:[{homeAway:'home',team:{id:'18'}},{homeAway:'away',team:{id:'25'}}],status:{type:{name:'STATUS_FINAL',state:'post',completed:true}}}]}});
const request=(body=base,headers={})=>new Request('https://hub.test/api/audience/contributions',{method:'POST',headers:{origin:'https://hub.test','content-type':'application/json',cookie:'__Host-aaw_participation='+ 'a'.repeat(64),...headers},body:JSON.stringify(body)});

test('Contribution payload is strict, canonical, bounded and league-separated',()=>{
 assert.deepEqual(parseContribution(base),base);
 for(const bad of [{...base,phase:'pregame'},{...base,league:'NBA'},{...base,identity:'CFB:2026:401772833'},{...base,eventId:'../x'},{...base,tier:'F'},{...base,season:2025},{...base,revision:-1},{...base,status:'live'},{...base,consentReceipt:null},{...base,participantId:'x'}]) assert.equal(parseContribution(bad),null);
 assert.ok(parseContribution({...base,tier:null}));
 assert.equal(parseContribution({kind:'favourite',league:'NFL',teamId:'Chiefs',revision:1,consentGrantedAt:base.consentGrantedAt,consentReceipt:receipt}),null);
 assert.equal(personalTierChange(undefined,'NFL','S'),null);
 assert.equal(personalTierChange({verified:true,league:'CFB',season:2026,eventId:'1',identity:'CFB:2026:1'},'NFL','S'),null);
 assert.equal(personalTierChange({verified:true,league:'NFL',season:2026,eventId:'1',identity:'NFL:2026:1'},'NFL',null).tier,null);
});
test('Ordering revisions advance despite same-millisecond actions and clock rollback',()=>{
 assert.equal(advanceRevision(null,1000),1_000_000);assert.equal(advanceRevision('1000000',1000),1_000_001);
 assert.equal(advanceRevision('1000000',999),1_000_001);assert.throws(()=>advanceRevision(String(Number.MAX_SAFE_INTEGER),1000));
});
test('Authoritative summaries validate final, scheduled, rescheduled and postseason identities; reject uncertain or wrong context',()=>{
 const now='2026-10-12T12:00:00Z';
 assert.equal(validation.verifiedSummary('NFL',2026,'401772833',summary(),now).status,'completed');
 for(const bad of [summary('CFB'),summary('NFL','999'),summary('NFL','401772833',2025),{header:{}}])assert.throws(()=>validation.verifiedSummary('NFL',2026,'401772833',bad,now));
 const scheduled=summary();scheduled.header.competitions[0].date='2026-11-01T12:00:00Z';scheduled.header.competitions[0].status.type={name:'STATUS_SCHEDULED',state:'pre',completed:false};
 const original=validation.verifiedSummary('NFL',2026,'401772833',scheduled,now);
 scheduled.header.competitions[0].date='2026-11-02T12:00:00Z';assert.equal(validation.verifiedSummary('NFL',2026,'401772833',scheduled,now).identity,original.identity);
 scheduled.header.competitions[0].status.type={name:'STATUS_DELAYED',state:'pre',completed:false};assert.throws(()=>validation.verifiedSummary('NFL',2026,'401772833',scheduled,now));
 const postseason=summary('CFB');postseason.header.season.type=3;postseason.header.competitions[0].date='2027-01-12T12:00:00Z';
 assert.equal(validation.verifiedSummary('CFB',2026,'401772833',postseason,'2027-01-13T12:00:00Z').seasonType,'postseason');
});
test('Favourite team verification uses exact IDs, FBS/NFL boundaries and server season',()=>{
 const data={uid:'s:20~l:23~g:80',season:{year:2026},children:[{standings:{entries:[{team:{id:'256'}}]}}]};
 assert.equal(validation.verifiedFavourite('CFB','256',data),2026);assert.throws(()=>validation.verifiedFavourite('NFL','256',data));assert.throws(()=>validation.verifiedFavourite('CFB','999',data));
 data.children[0].standings.entries.push({team:{id:'256'}});assert.throws(()=>validation.verifiedFavourite('CFB','256',data));
});
test('Server flag, cookies, CSRF, malformed input and oversized payloads block before data access',async()=>{
 const old=process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED;
 globalThis.__selectionRpc=()=>{throw Error('must not reach database')};
 try{
  for(const value of [undefined,'false','TRUE','1']){if(value===undefined)delete process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED;else process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED=value;assert.equal((await route.POST(request())).status,503);}
  process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED='true';
  assert.equal((await route.POST(request(base,{origin:'https://evil.test'}))).status,403);
  assert.equal((await route.POST(request(base,{cookie:''}))).status,401);
  assert.equal((await route.POST(request({...base,tier:'F'}))).status,400);
  assert.equal((await route.POST(request({data:'x'.repeat(3000)}))).status,413);
 }finally{if(old===undefined)delete process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED;else process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED=old;}
});
test('Server verifies consent before feeds; transactional writes recheck consent and report failures honestly',async()=>{
 const old=process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED,oldFetch=globalThis.fetch;
 process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED='true';let gate='inactive',written='saved',fetches=0;const calls=[];
 globalThis.__selectionRpc=async(name,params)=>{calls.push({name,params});return name==='hub_audience_contribution_gate'?gate:written;};
 globalThis.fetch=async()=>{fetches++;return Response.json(summary(),{headers:{date:new Date().toUTCString()}});};
 try{
  assert.equal((await route.POST(request())).status,401);assert.equal(fetches,0);
  gate='limited';assert.equal((await route.POST(request())).status,429);assert.equal(fetches,0);
  gate='ready';const response=await route.POST(request());assert.deepEqual(await response.json(),{saved:true});
  const write=calls.find(call=>call.name==='hub_audience_write_phase_selection');assert.notEqual(write.params.p_hash,'a'.repeat(64));assert.equal(write.params.p_season_type,'regular');assert.equal(write.params.p_receipt,receipt);assert.equal(write.params.p_phase,'postgame');assert.ok(write.params.p_checked_at);
  written='conflict';assert.equal((await route.POST(request())).status,409);
  written='inactive';assert.equal((await route.POST(request())).status,401);
  written='saved';const before=fetches;const removal=await route.POST(request({...base,tier:null}));assert.equal(removal.status,200);assert.equal(fetches,before);assert.equal(calls.at(-1).params.p_phase,null);
  globalThis.__selectionRpc=()=>{throw Error('SECRET must not escape')};const failed=await route.POST(request());assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/SECRET/);
 }finally{globalThis.fetch=oldFetch;if(old===undefined)delete process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED;else process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED=old;}
});
test('Canonical cache preserves observation time; stale/missing responses fail closed; favourite removal needs no feed lookup',async()=>{
 const oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json(summary('CFB','777'),{headers:{date:new Date().toUTCString()}});};
 try{
  const change={...base,league:'CFB',eventId:'777',identity:'CFB:2026:777'};
  await Promise.all([validation.validateContribution(change),validation.validateContribution(change)]);assert.equal(calls,1);
  await validation.validateContribution(change);assert.equal(calls,1);
  globalThis.fetch=async()=>Response.json(summary('CFB','778'),{headers:{date:'Mon, 01 Jan 2001 00:00:00 GMT'}});
  await assert.rejects(validation.validateContribution({...change,eventId:'778'}),/stale/);
  globalThis.fetch=async()=>Response.json(summary('CFB','779'));
  await assert.rejects(validation.validateContribution({...change,eventId:'779'}),/stale/);
  globalThis.fetch=async()=>{throw Error('network offline')};await assert.rejects(validation.validateContribution({...change,eventId:'780'}));
  assert.deepEqual(await validation.validateContribution({kind:'favourite',league:'NFL',teamId:null}),{season:null,seasonType:null});
  globalThis.fetch=async()=>Response.json({uid:'s:20~l:28~g:9',season:{year:2026}},{headers:{date:new Date().toUTCString()}});
  assert.deepEqual(await validation.validateContribution({kind:'clearTiers',league:'NFL'}),{season:2026,seasonType:null});
 }finally{globalThis.fetch=oldFetch;}
});
test('Only personal event handlers submit: hydration, decks, exports and sharing stay separate',async()=>{
 for(const [name,league] of [['cfb','CFB'],['nfl','NFL']]){
  const source=await read(`app/${name}/page.tsx`);
  const handler=source.slice(source.indexOf('  function setGameTier('),source.indexOf('  function clearGameTiers('));
  assert.match(handler,/personalTierChange/);assert.ok(handler.includes(`"${league}"`));
  if(league==='CFB')assert.ok(handler.indexOf('if (loadedDeck)')<handler.indexOf('audience.contribute'));
  assert.equal((source.match(/audience\.contribute/g)??[]).length,2);
 }
 const panel=await read('app/features/preferences/HubPreferences.tsx');assert.match(panel,/audience\.contribute\(\{kind:"favourite",league,teamId:id\}\)/);
 assert.equal((panel.match(/audience\.contribute/g)??[]).length,1);
 const sql=await read('supabase/hub-audience-selections.sql');assert.equal((sql.match(/on delete cascade/g)??[]).length,3);
 assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/p_revision<=barrier/);assert.match(sql,/c\.consent_receipt=p_receipt/);
 assert.doesNotMatch(sql,/create table.*(?:history|aggregate|statistics)/);
});

test('Actual participation hook submits only post-consent events; sync/opt-in never upload; pending withdrawal aborts work',async()=>{
 const originals={fetch:globalThis.fetch,window:globalThis.window,localStorage:globalThis.localStorage,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
 const data=new Map([['nfl-game-tiers','{"1":"S"}'],['aaw-hub-favourite-nfl-v1','{"version":1,"teamId":"6"}']]);
 const listeners=new Map();const states=[],refs=[],effects=[];let s=0,r=0;
 globalThis.__hookReact={useState(initial){const index=s++;if(!(index in states))states[index]=initial;return[states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value}];},useRef(initial){const index=r++;return refs[index]??(refs[index]={current:initial});},useEffect(fn){if(effects.length===0)effects.push(fn);}};
 globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 globalThis.window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(name,fn)=>fn()}}});
 let active=false,offline=false,deleting=false,release;const sent=[];
 const current=()=>({available:true,active,grantedAt:active?base.consentGrantedAt:null,consentVersion:active?'stage28-v1':null,consentReceipt:active?receipt:null});
 globalThis.fetch=async(url,options={})=>{
  if(url.endsWith('/participation')){
   if(options.method==='POST'){const body=JSON.parse(options.body);if(body.action==='confirm')active=true;return Response.json(body.action==='prepare'?{prepared:true}:current());}
   if(options.method==='DELETE'){deleting=true;if(offline)throw Error('offline');active=false;return Response.json({deleted:true});}
   return Response.json(current());
  }
  sent.push(JSON.parse(options.body));
  if(offline)throw Error('offline');
  if(release)return new Promise((resolve,reject)=>{release.resolve=()=>resolve(Response.json({saved:true}));options.signal.addEventListener('abort',()=>reject(Error('aborted')));});
  return Response.json({saved:true});
 };
 try{
  let hookSource=await read('app/features/preferences/useParticipation.ts');
  hookSource=hookSource.replace(/import \{ useEffect, useRef, useState \} from "react";/,'const {useEffect,useRef,useState}=globalThis.__hookReact;')
   .replace('"../../lib/participation-contract"',JSON.stringify(contract)).replace('"../../lib/audience-contributions"',JSON.stringify(file('app/lib/audience-contributions.ts').href));
  const {useParticipation}=await import(compile(hookSource));const render=()=>{s=0;r=0;return useParticipation();};let hook=render();effects[0]();await new Promise(resolve=>setImmediate(resolve));hook=render();
  await hook.contribute({kind:'favourite',league:'NFL',teamId:'7'});assert.equal(sent.length,0);
  await hook.optIn();hook=render();assert.equal(hook.active,true);assert.equal(sent.length,0);assert.equal(data.get('nfl-game-tiers'),'{"1":"S"}');
  const tier={kind:'tier',league:'NFL',season:2026,eventId:'401772833',identity:'NFL:2026:401772833',tier:'S'};
  await hook.contribute(tier);await hook.contribute({...tier,tier:'B'});await hook.contribute({...tier,tier:null});
  for(const teamId of ['7','8',null])await hook.contribute({kind:'favourite',league:'CFB',teamId});assert.equal(sent.length,6);
  assert.ok(sent.every(item=>item.consentReceipt===receipt));assert.ok(sent.every((item,i)=>i===0||item.revision>sent[i-1].revision));
  listeners.get('storage')({key:'aaw-hub-favourite-nfl-v1',newValue:'6'});listeners.get('storage')({key:'aaw-hub-participation-refresh-v1'});await new Promise(resolve=>setImmediate(resolve));assert.equal(sent.length,6);
  hook=render();const locks=navigator.locks;navigator.locks=undefined;await hook.contribute(tier);hook=render();assert.equal(sent.length,6);assert.match(hook.contributionWarning,/could not be saved/);navigator.locks=locks;
  const getItem=localStorage.getItem;localStorage.getItem=()=>{throw Error('blocked')};await hook.contribute(tier);hook=render();assert.equal(sent.length,6);assert.match(hook.contributionWarning,/browser storage/);localStorage.getItem=getItem;
  hook=render();offline=true;await hook.contribute(tier);hook=render();assert.match(hook.contributionWarning,/could not be saved/);
  await hook.withdraw();hook=render();assert.equal(hook.pending,true);const before=sent.length;await hook.contribute(tier);assert.equal(sent.length,before);assert.ok(deleting);
  offline=false;await hook.withdraw();hook=render();assert.equal(hook.pending,false);assert.equal(hook.active,false);assert.equal(data.get('nfl-game-tiers'),'{"1":"S"}');
  await hook.optIn();hook=render();assert.equal(sent.length,before);release={};const inFlight=hook.contribute(tier);await new Promise(resolve=>setImmediate(resolve));await hook.withdraw();await inFlight;hook=render();assert.equal(hook.active,false);
 }finally{
  globalThis.fetch=originals.fetch;globalThis.window=originals.window;globalThis.localStorage=originals.localStorage;if(originals.navigator)Object.defineProperty(globalThis,'navigator',originals.navigator);else delete globalThis.navigator;delete globalThis.__hookReact;delete globalThis.__selectionRpc;
 }
});
