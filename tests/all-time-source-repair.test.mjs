import {compileLocalModule} from './helpers/compile-local-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const source=(await readFile(new URL('../app/lib/all-time-live-sources.ts',import.meta.url),'utf8'))
 .replace('"../nfl/data/nfl-all-time-career"',JSON.stringify(new URL('../app/nfl/data/nfl-all-time-career.ts',import.meta.url).href))
 .replace('"../nfl/data/divisions"',JSON.stringify(new URL('../app/nfl/data/divisions.ts',import.meta.url).href));
const discoveryUrl=await compileLocalModule(new URL('../app/lib/all-time-nfl-discovery.ts',import.meta.url));
const resolvedSource=source.replace('\"./all-time-nfl-discovery\"',JSON.stringify(discoveryUrl)).replace('"./all-time-nfl-careers"',JSON.stringify(await compileLocalModule(new URL('../app/lib/all-time-nfl-careers.ts',import.meta.url))));
const liveModule=compile(resolvedSource),{calculateNflCareer,loadNflActiveCareerSource}=await import(liveModule);
const receiving=JSON.parse(await readFile(new URL('./fixtures/espn-career-receiving.json',import.meta.url),'utf8'));
const passing={name:'passing',names:['passingYards','passingTouchdowns'],totals:['120','12'],statistics:[{season:{year:2025},teamId:'1',stats:['100','10']},{season:{year:2026},teamId:'1',stats:['20','2']}]};
test('Actual ESPN Davante Adams response counts 2024 stints once and agrees with the provider career total',()=>{
 const before=structuredClone(receiving);assert.deepEqual(calculateNflCareer([receiving],'receiving-yards'),{value:13074,years:'2014–2026'});assert.deepEqual(receiving,before);
});
test('Totals-only seasons work, while missing numbers and contradictory/duplicated rows cannot publish',()=>{
 const only={...passing,statistics:[{season:{year:2026},displayName:'2026 Totals',stats:['120','12']}]};assert.equal(calculateNflCareer([only],'passing-yards').value,120);
 for(const patch of [{totals:['1,,20','12']},{totals:['9'.repeat(400),'12']},{totals:['119','12']},{statistics:[{season:{year:2026},stats:['--','2']}]},{statistics:[passing.statistics[0],passing.statistics[0]]},{statistics:[...passing.statistics,{season:{year:2026},displayName:'2026 Totals',stats:['999','2']}]}])assert.throws(()=>calculateNflCareer([{...passing,...patch}],'passing-yards'));
 assert.equal(calculateNflCareer([],'passing-yards'),null);
});
const currentRodgers=JSON.parse(await readFile(new URL('./fixtures/nfl-career-current/8439.json',import.meta.url),'utf8'));
async function mockedSource({csv='full_name,espn_id,team,week\nAaron Rodgers,8439,PIT,6',categories=currentRodgers.categories.map(category=>category.name==='passing'?passing:category)}={},run){const old=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert.ok(options.signal,'upstream calls must be bounded');if(String(url).includes('/rosters/'))return new Response(csv);if(String(url).includes('/leaders/0'))return Response.json(JSON.parse(await readFile(new URL('./fixtures/nfl-career-discovery-leaders.json',import.meta.url))));if(String(url).includes('/athletes/8439/stats'))return Response.json({categories,filters:[{name:"seasontype",value:"2"}]});throw Error('Unexpected external request: '+url)};try{return await run()}finally{globalThis.fetch=old}}
test('Empty/malformed roster or missing ranked categories rejects; valid zeroes stay valid',async()=>{
 await mockedSource({csv:'unexpected,response\nnot,a-roster'},()=>assert.rejects(loadNflActiveCareerSource(),/no identifiable/));
 await mockedSource({categories:[]},()=>assert.rejects(loadNflActiveCareerSource(),/no categories/));
 await mockedSource({categories:[{...passing,names:['other']}]},()=>assert.rejects(loadNflActiveCareerSource(),/Missing (ranked|discovered)/));
 await mockedSource({},async()=>{const loaded=await loadNflActiveCareerSource();assert.equal(loaded.categories['passing-yards'][0].value,120);assert.equal(loaded.categories['passing-td'][0].value,12);});
});
async function monitorTest(run){
 const saved={...process.env},old=globalThis.fetch;process.env.SUPABASE_URL='https://storage.invalid';process.env.SUPABASE_SECRET_KEY='test-only';
 let writes=0;const state={version:1,catalogVersion:'espn-active-career-v3',lastCheckedAt:'2026-10-13',signals:[],snapshots:[{id:'CFB:individual:career:passing-yards',league:'CFB',audience:'individual',period:'career',category:'passing-yards',checkedAt:'2026-10-12',entries:[]},{id:'NFL:individual:career:passing-yards',league:'NFL',audience:'individual',period:'career',category:'passing-yards',checkedAt:'2026-10-13',entries:[]}]};
 globalThis.fetch=async(url,options={})=>{if(String(url).startsWith('https://storage.invalid/')){if(options.method==='POST'){writes++;throw Error('No writes expected')}return Response.json([{state}]);}if(String(url).includes('/rosters/'))return new Response('unexpected,response\nnot,a-roster');throw Error('Unexpected external request')};
 try{let monitor=await readFile(new URL('../app/lib/all-time-monitor.ts',import.meta.url),'utf8');for(const rel of ['./all-time-records','./all-time-comparison','./all-time-signal-retention','../cfb/data/cfb-all-time-career','../cfb/data/cfb-all-time-program','../nfl/data/nfl-all-time-career','../nfl/data/nfl-all-time-team'])monitor=monitor.replace(JSON.stringify(rel),JSON.stringify(new URL('../app/lib/'+rel+'.ts',import.meta.url).href));for(const name of ['all-time-nfl-teams','all-time-nfl-results','all-time-nfl-careers'])monitor=monitor.replace(JSON.stringify('./'+name),JSON.stringify(await compileLocalModule(new URL('../app/lib/'+name+'.ts',import.meta.url))));monitor=monitor.replace('"./all-time-live-sources"',JSON.stringify(liveModule));const mod=await import(compile(monitor));await run(mod,state);assert.equal(writes,0);}finally{globalThis.fetch=old;for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
}
test('Failed NFL source keeps the existing cloud publication untouched; public feed exposes no signals',()=>monitorTest(async(mod,state)=>{
 const before=structuredClone(state);await assert.rejects(mod.refreshAllTimeMonitor('NFL'),/no identifiable/);assert.deepEqual(state,before);
 const cfb=await mod.getAllTimeLeaderboardFeed('CFB'),nfl=await mod.getAllTimeLeaderboardFeed('NFL');assert.equal(cfb.source.mode,'record-book');assert.equal(cfb.source.checkedAt,null);assert.ok(nfl.source.checkedAt);assert.match(nfl.source.provider,/ESPN/);assert.equal(nfl.datasets['NFL:individual:career:passing-yards'].mode,'active-career');assert.ok(!('signals' in nfl));
}));
