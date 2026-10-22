import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Compile the real local module graph in memory; no Next server, source writes
// or production/environment credentials. One cache preserves shared singletons.
const compiled = new Map();
async function compile(file) {
  const path = file.href;
  if (compiled.has(path)) return compiled.get(path);
  let js = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const match of [...js.matchAll(/from (['"])(\.[^'"]+)\1/g)]) {
    const dependency = new URL(match[2] + (match[2].endsWith('.ts') ? '' : '.ts'), file);
    js = js.replace(match[0], `from ${JSON.stringify(await compile(dependency))}`);
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64'); compiled.set(path, url); return url;
}
const file = path => new URL('../' + path, import.meta.url);


const {createPublicSources}=await import(await compile(file('app/lib/stats-v2/public-source.ts')));
test('published metadata projection is bounded and reuses original observation, while live requests stay fresh',async()=>{
 let clock=1,calls=0;const load=createPublicSources(async()=>{calls++;return Response.json({privateUnused:'discard',id:1})},()=>clock);
 const project=value=>({id:value.id});const a=await load('http://source',true,project,'position');clock=2000;const b=await load('http://source',true,project,'position');assert.strictEqual(a,b);assert.equal(b.observedAt,1);assert.deepEqual(b.value,{id:1});assert.equal(calls,1);
 await load('http://live');await load('http://live');assert.equal(calls,3);clock=300001;assert.equal((await load('http://source',true,project,'position')).observedAt,clock);assert.equal(calls,4);
});
test('metadata source concurrency is six, failures retry and pending work cleans up',async()=>{
 let active=0,peak=0,calls=0;const load=createPublicSources(async url=>{calls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;if(String(url).endsWith('/fail')&&calls===15)throw Error('transient');return Response.json({ok:true})});
 await Promise.all(Array.from({length:14},(_,i)=>load('http://fixture/'+i,true)));assert.equal(peak,6);await assert.rejects(load('http://fixture/fail',true));assert.equal((await load('http://fixture/fail',true)).value.ok,true);
});
test('identity-pair projection keeps identifiers and rejects invalid/name-only links',async()=>{
 const {parseNflIdentityPairs}=await import(await compile(file('app/lib/stats-v2/nfl-source-csv.ts')));
 assert.deepEqual(parseNflIdentityPairs('gsis_id,espn_id,display_name,position\n00-0000001,123,Name,QB\ninvalid,123,Name,QB\n00-0000002,,Name,QB'),[{gsis_id:'00-0000001',espn_id:'123'}]);
});

test('incomplete historical sources are retried rather than poisoning the published snapshot store',async()=>{
 const {loadNflHistorySources}=await import(await compile(file('app/lib/stats-v2/nfl-history-source.ts')));const saved=globalThis.fetch;let calls=0,valid=false;
 globalThis.fetch=async url=>{calls++;if(String(url).includes('scoreboard'))return Response.json({season:{year:2026,type:2},week:{number:5},events:[{id:'999',competitions:[{status:{type:{state:'post',completed:true}}}]}]});return Response.json(valid?{header:{id:'999',competitions:[{id:'999',status:{type:{completed:true}}}]},boxscore:{players:[{team:{id:'1'}},{team:{id:'2'}}]}}:{header:{id:'wrong'}});};
 try{await assert.rejects(loadNflHistorySources([5]));valid=true;const result=await loadNflHistorySources([5]);assert.equal(result[0].summaries[0].header.id,'999');assert.equal(calls,3);}finally{globalThis.fetch=saved;}
});
