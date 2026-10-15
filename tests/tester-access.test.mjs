import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=s=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const password=compile(await readFile(new URL('../app/lib/export-password.ts',import.meta.url),'utf8'));
const helper=compile((await readFile(new URL('../app/lib/tester-access.ts',import.meta.url),'utf8')).replace('"./export-password"',JSON.stringify(password)));
const {testerGateEnabled,validTesterPassword,testerMachineRoute}=await import(helper);
const basic=p=>'Basic '+Buffer.from('aaw:'+p).toString('base64');
test('Collection forces tester protection; missing, weak and Admin-identical passwords fail closed',()=>{
 assert.equal(testerGateEnabled({}),false);
 assert.equal(testerGateEnabled({AAW_INVITED_TESTING_ENABLED:'true'}),true);
 assert.equal(testerGateEnabled({AAW_AUDIENCE_PARTICIPATION_ENABLED:'true'}),true);
 for(const p of [undefined,'short','same-long-admin-password'])assert.equal(validTesterPassword(basic(p??''),{AAW_TESTER_PASSWORD:p,EXPORT_STUDIO_PASSWORD:'same-long-admin-password'}),false);
 const env={AAW_TESTER_PASSWORD:'separate-long-tester-password',EXPORT_STUDIO_PASSWORD:'same-long-admin-password'};
 assert.equal(validTesterPassword(basic(env.AAW_TESTER_PASSWORD),env),true);
 assert.equal(validTesterPassword(basic(env.EXPORT_STUDIO_PASSWORD),env),false);
 assert.equal(validTesterPassword(null,env),false);
});
test('Only existing machine-authenticated methods are exempt, never participation or status reads',()=>{
 assert.equal(testerMachineRoute('/api/cron/all-time/cfb','GET'),true);
 assert.equal(testerMachineRoute('/api/all-time/refresh','POST'),true);
 assert.equal(testerMachineRoute('/api/all-time/refresh','GET'),false);
 for(const p of ['/cfb','/nfl','/api/audience/participation','/api/audience/contributions','/api/cron/all-time/cfb/extra'])assert.equal(testerMachineRoute(p,'POST'),false);
});
test('Proxy rejects anonymous and tester credentials on private Admin while preserving its own password',async()=>{
 let source=await readFile(new URL('../proxy.ts',import.meta.url),'utf8');
 source=source.replace(/import \{ NextResponse, type NextRequest \} from "next\/server";/,'class NextResponse extends Response { static next(){ return new Response(null,{status:200}); } }');
 source=source.replace('"./app/lib/export-access"',JSON.stringify(compile(await readFile(new URL('../app/lib/export-access.ts',import.meta.url),'utf8')))).replace('"./app/lib/export-password"',JSON.stringify(password)).replace('"./app/lib/tester-access"',JSON.stringify(helper));
 const {proxy}=await import(compile(source));
 const saved={...process.env};Object.assign(process.env,{NODE_ENV:'production',AAW_INVITED_TESTING_ENABLED:'true',AAW_TESTER_PASSWORD:'separate-long-tester-password',EXPORT_STUDIO_PASSWORD:'separate-long-admin-password'});
 const request=(path,auth,host='desk.aawnetwork.co.uk')=>({nextUrl:new URL('https://'+host+path),method:'GET',headers:new Headers({host,...(auth?{authorization:auth}:{})})});
 try{
  for(const host of ['desk.aawnetwork.co.uk','alternate.vercel.app','localhost'])for(const path of ['/','/cfb','/nfl','/api/games','/api/audience/participation','/api/audience/contributions']){
   assert.equal(proxy(request(path,null,host)).status,401);
   assert.equal(proxy(request(path,basic(process.env.AAW_TESTER_PASSWORD),host)).status,200);
  }
  for(const path of ['/admin','/admin/decks','/admin/exports','/admin/user-stats','/api/admin/audience/report']){
   assert.equal(proxy(request(path,basic(process.env.AAW_TESTER_PASSWORD))).status,401);
   assert.equal(proxy(request(path,basic(process.env.EXPORT_STUDIO_PASSWORD))).status,200);
  }
 }finally{for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});
