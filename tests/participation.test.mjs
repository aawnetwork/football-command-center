import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { consentVersion } from '../app/lib/participation-contract.ts';
const compile=(source)=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const contract=new URL('../app/lib/participation-contract.ts',import.meta.url).href;
const securitySource=(await readFile(new URL('../app/lib/participation-security.ts',import.meta.url),'utf8')).replace('"./participation-contract"',JSON.stringify(contract));
const securityUrl=compile(securitySource);
const security=await import(securityUrl);
let source=await readFile(new URL('../app/api/audience/participation/route.ts',import.meta.url),'utf8');
source=source.replace('"../../../lib/participation-contract"',JSON.stringify(contract)).replace('"../../../lib/participation-security"',JSON.stringify(securityUrl))
 .replace(/import \{ participationRpc, ParticipationError \} from "[^"\n]+";/,'class ParticipationError extends Error { constructor(message:string,public status=503){super(message);} } const participationRpc=(name:string,params:unknown)=>globalThis.__audienceRpc(name,params);');
const route=await import(compile(source));
test('Token is 256-bit random; only hash is suitable for storage; cookie flags and parsing are strict',()=>{
 const a=security.newParticipationToken(),b=security.newParticipationToken();assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,b);
 const hash=security.hashParticipationToken(a);assert.match(hash,/^[a-f0-9]{64}$/);assert.notEqual(hash,a);
 const cookie=security.participationSetCookie(a,true);for(const flag of ['Secure','HttpOnly','SameSite=Lax','Path=/','Max-Age=31536000'])assert.ok(cookie.includes(flag));assert.doesNotMatch(cookie,/Domain=/i);
 assert.equal(security.participationToken(new Request('https://hub.test',{headers:{cookie:cookie.split(';')[0]}})),a);
 assert.equal(security.participationToken(new Request('https://hub.test',{headers:{cookie:`${cookie.split(';')[0]}; ${cookie.split(';')[0]}`}})),null);
});
test('Server flag fails closed independently of client flags',async()=>{
 const old=process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED;delete process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED;
 globalThis.__audienceRpc=()=>{throw Error('DB must not be accessed')};
 try{
  assert.equal((await route.GET(new Request('https://hub.test/api/audience/participation'))).status,200);
  const response=await route.POST(new Request('https://hub.test/api/audience/participation',{method:'POST',headers:{origin:'https://hub.test','content-type':'application/json'},body:JSON.stringify({action:'prepare',agree:true,consentVersion})}));
  assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);
 }finally{if(old===undefined)delete process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED;else process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED=old;}
});
test('Explicit opt-in, refresh, retries, CSRF, limits and honest withdrawal failures preserve the security contract',async()=>{
 const old=process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED;process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED='true';
 const records=new Map();let allowed=true,failDeletion=false;const captured=[];
 globalThis.__audienceRpc=async(name,params)=>{
  captured.push({name,params});
  if(name==='hub_audience_limit')return allowed;
  if(name==='hub_audience_prepare'){records.set(params.p_hash,{active:false,prepared:true});return true;}
  if(name==='hub_audience_state')return records.get(params.p_hash)??{active:false};
  if(name==='hub_audience_grant'){if(!records.has(params.p_hash))return{active:false};const current=records.get(params.p_hash);if(!current.active)records.set(params.p_hash,{active:true,consentVersion:params.p_version,grantedAt:'2026-10-12T12:00:00Z'});return records.get(params.p_hash);}
  if(name==='hub_audience_withdraw'){if(failDeletion)throw Error('database secret must not escape');records.delete(params.p_hash);return true;}
 };
 const url='https://hub.test/api/audience/participation';
 const request=(action,cookie,extra={})=>new Request(url,{method:'POST',headers:{origin:'https://hub.test','content-type':'application/json',...(cookie?{cookie}:{}),...extra},body:JSON.stringify({action,agree:true,consentVersion})});
 try{
  assert.equal((await route.POST(request('prepare',null,{origin:'https://evil.test'}))).status,403);
  assert.equal((await route.POST(new Request(url,{method:'POST',headers:{origin:'https://hub.test','content-type':'application/json'},body:'{"agree":false}'}))).status,400);
  const prepared=await route.POST(request('prepare'));const cookie=prepared.headers.get('set-cookie').split(';')[0];const raw=cookie.split('=')[1];
  assert.equal((await prepared.json()).prepared,true);assert.equal(records.size,1);
  assert.equal((await(await route.POST(request('prepare',cookie))).json()).prepared,true);assert.equal(records.size,1);
  const confirmed=await route.POST(request('confirm',cookie));const first=await confirmed.json();assert.equal(first.active,true);
  assert.ok(confirmed.headers.get('set-cookie').includes('HttpOnly'));assert.equal(records.size,1);
  assert.deepEqual(await(await route.POST(request('confirm',cookie))).json(),first);
  assert.equal((await(await route.GET(new Request(url,{headers:{cookie}}))).json()).active,true);
  assert.equal(JSON.stringify(first).includes(raw),false);assert.equal(JSON.stringify(captured).includes(raw),false);
  failDeletion=true;
  const failed=await route.DELETE(new Request(url,{method:'DELETE',headers:{origin:'https://hub.test',cookie}}));assert.equal(failed.status,503);assert.equal(failed.headers.get('set-cookie'),null);assert.equal(records.size,1);assert.doesNotMatch(JSON.stringify(await failed.json()),/database secret/);
  failDeletion=false;process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED='false';
  const deleted=await route.DELETE(new Request(url,{method:'DELETE',headers:{origin:'https://hub.test',cookie}}));assert.equal((await deleted.json()).deleted,true);assert.equal(records.size,0);assert.match(deleted.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await(await route.DELETE(new Request(url,{method:'DELETE',headers:{origin:'https://hub.test',cookie}}))).json()).deleted,true);
  assert.equal((await(await route.DELETE(new Request(url,{method:'DELETE',headers:{origin:'https://hub.test'}}))).json()).deleted,false);
  process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED='true';allowed=false;assert.equal((await route.POST(request('prepare'))).status,429);
  allowed=true;assert.equal((await route.POST(request('confirm',cookie))).status,409);
  assert.equal(records.size,0);
 }finally{if(old===undefined)delete process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED;else process.env.AAW_AUDIENCE_PARTICIPATION_ENABLED=old;delete globalThis.__audienceRpc;}
});
test('Client submits only consent actions, keeps deletion pending, leaves tiers/favourites local and GA4 unavailable',async()=>{
 const hook=await readFile(new URL('../app/features/preferences/useParticipation.ts',import.meta.url),'utf8');
 assert.match(hook,/JSON\.stringify\(\{action,agree:true,consentVersion\}\)/);
 assert.doesNotMatch(hook,/cfb-game-tiers|nfl-game-tiers|favouriteKeys|document\.cookie|gtag/);
 assert.match(hook,/withdrawalPendingKey/);assert.match(hook,/value\.deleted!==true/);assert.match(hook,/withdrawal\/deletion remains pending/);
 const panel=await readFile(new URL('../app/features/preferences/HubPreferences.tsx',import.meta.url),'utf8');
 assert.match(panel,/useState\(false\)/);assert.match(panel,/audience\.active \|\| audience\.pending/);assert.match(panel,/GA4 is not enabled/);
 const sql=await readFile(new URL('../supabase/hub-audience-participation.sql',import.meta.url),'utf8');
 assert.match(sql,/on delete cascade/);assert.match(sql,/security invoker/);assert.doesNotMatch(sql,/create table.*(?:ratings|favourites|aggregate)/);
});
