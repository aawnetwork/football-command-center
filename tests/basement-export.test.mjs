import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const lib=name=>new URL('../app/lib/'+name,import.meta.url);
const {validBasementToken,recordEnvelope}=await import(await compileLocalModule(lib('basement-export.ts')));
test('private factual export requires a dedicated strong bearer token, never tester/admin Basic credentials',()=>{
 const token='test-only-'.repeat(5);assert.equal(validBasementToken('Bearer '+token,token),true);
 for(const header of [null,'Bearer wrong','Basic '+Buffer.from('aaw:'+token).toString('base64')])assert.equal(validBasementToken(header,token),false);
 assert.equal(validBasementToken('Bearer short','short'),false);assert.equal(validBasementToken('Bearer '+token,undefined),false);
 const a=recordEnvelope({value:1}),b=recordEnvelope({value:1}),c=recordEnvelope({value:2});assert.equal(a.publicationId,b.publicationId);assert.notEqual(a.publicationId,c.publicationId);
});
test('export pins both leagues to one durable read, includes every retained signal and carries exact player/team identities',async()=>{
 const savedFetch=global.fetch,saved={...process.env};const store={version:1,snapshots:[],signals:Array.from({length:140},(_,n)=>({id:'retained:'+n})),lastCheckedAt:'2026-11-02T12:00:00Z'};let reads=0;
 Object.assign(process.env,{NODE_ENV:'production',SUPABASE_URL:'https://record-db.example',SUPABASE_SECRET_KEY:'test-key'});
 global.fetch=async(url,options)=>{reads++;assert.match(String(url),/all_time_monitor_state\?select=state,updated_at/);assert.equal(options.method,undefined,'Export must never write or call collectors');return Response.json([{state:store,updated_at:'version-1'}]);};
 try{
  const {getBasementRecordPublication}=await import(await compileLocalModule(lib('basement-record-publication.ts'))),result=await getBasementRecordPublication();
  assert.equal(reads,1);assert.equal(result.schemaVersion,1);assert.equal(result.content.legacySignals.length,140);assert.ok(result.content.playerIdentities.length>=40);assert.ok(result.content.playerIdentities.every(p=>p.gsisId&&p.playerId.startsWith('espn:nfl:')));
  const teams=result.content.leagues.NFL.leaderboards['NFL:team:career:wins'];assert.equal(teams.length,32);assert.ok(teams.every(t=>t.teamId));assert.equal(result.content.leagues.CFB.source.mode,'record-book');assert.ok(result.content.leagues.CFB.rejectedTables['CFB:individual:season:total-offense-yards']);assert.doesNotMatch(JSON.stringify(result),/test-key|record-db/);
 }finally{global.fetch=savedFetch;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
test('only the exact read export bypasses tester gating, and public-gamecard references remain in Hub',async()=>{
 const {testerMachineRoute}=await import(await compileLocalModule(lib('tester-access.ts')));
 assert.equal(testerMachineRoute('/api/basement/records','GET'),true);assert.equal(testerMachineRoute('/api/basement/records','POST'),false);assert.equal(testerMachineRoute('/api/basement/records/other','GET'),false);
 for(const name of ['app/cfb/data/rivalries.ts','app/lib/cfb-rivalries.ts','app/components/GameCard.tsx'])assert.ok((await readFile(new URL('../'+name,import.meta.url),'utf8')).length>0);
 const admin=await readFile(new URL('../app/admin/content/page.tsx',import.meta.url),'utf8');assert.match(admin,/await requireAdmin\(\)/);assert.match(admin,/basement.aawnetwork.co.uk\/#games/);assert.match(admin,/BASEMENT_MILESTONES_MOVED === "true"/);assert.match(admin,/<ContentPanel/,'Rollback keeps the original private panel until cutover is accepted');
});
