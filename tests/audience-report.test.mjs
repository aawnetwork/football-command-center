import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {reportFilters,percentage,sampleLabel,sortFavourites} from '../app/lib/audience-report.ts';
const compile=s=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const contract=new URL('../app/lib/audience-report.ts',import.meta.url).href;
const password=new URL('../app/lib/export-password.ts',import.meta.url).href;
let source=await readFile(new URL('../app/api/admin/audience/report/route.ts',import.meta.url),'utf8');
source=source.replace("'../../../../lib/export-password'",JSON.stringify(password)).replace("'../../../../lib/audience-report'",JSON.stringify(contract)).replace(/import \{ loadAudienceReport \} from '[^']+';/,'const loadAudienceReport=(filters:unknown)=>globalThis.__reportLoad(filters);');
const route=await import(compile(source));
test('Bounded report filters preserve canonical identity and reject ambiguity',()=>{
 assert.deepEqual(reportFilters(new URLSearchParams()),{league:null,season:null,game:null,view:'current',phase:null,offset:0,sort:'popular'});
 assert.equal(reportFilters(new URLSearchParams('league=NFL&season=2026&game=NFL:2026:401123&view=phases&phase=live')).phase,'live');
 for(const p of ['league=BAD','season=2026.1','offset=10001','offset=-1','view=phases&phase=unknown','view=current&phase=live','league=NFL&game=CFB:2026:123','season=2025&game=NFL:2026:123','league=NFL&league=CFB','participant=secret','sort=wrong'])assert.throws(()=>reportFilters(new URLSearchParams(p)));
});
test('Counts, league denominators, zero and small sample boundaries are honest',()=>{
 assert.equal(percentage(23,100),'23.0%');assert.equal(percentage(1,3),'33.3%');assert.equal(percentage(0,0),'—');
 for(const n of [0,1,24])assert.equal(sampleLabel(n),'Insufficient sample');assert.equal(sampleLabel(25),'25+ participating browsers');
 const rows=[{league:'NFL',teamId:'1',name:'Zulu',count:2,denominator:3},{league:'NFL',teamId:'2',name:'Alpha',count:1,denominator:3}];
 assert.equal(sortFavourites(rows,'alphabetical')[0].name,'Alpha');assert.equal(sortFavourites(rows,'popular')[0].name,'Zulu');assert.equal(rows[0].name,'Zulu');
});
test('Private reporting API denies anonymous access independently, validates before querying and separates failures from zero',async()=>{
 const old=process.env.EXPORT_STUDIO_PASSWORD;process.env.EXPORT_STUDIO_PASSWORD='test-report-password-long';let calls=0;
 globalThis.__reportLoad=()=>{calls++;return {overview:{currentRatings:0},games:[]};};
 const auth='Basic '+Buffer.from('aaw:test-report-password-long').toString('base64');
 try {
  assert.equal((await route.GET(new Request('http://localhost:3001/api/admin/audience/report'))).status,401);assert.equal(calls,0);
  assert.equal((await route.GET(new Request('https://hub.test/api/admin/audience/report?offset=10001',{headers:{authorization:auth}}))).status,400);assert.equal(calls,0);
  const zero=await route.GET(new Request('https://hub.test/api/admin/audience/report',{headers:{authorization:auth}}));assert.equal(zero.status,200);assert.equal(zero.headers.get('cache-control'),'private, no-store');assert.equal((await zero.json()).overview.currentRatings,0);
  globalThis.__reportLoad=()=>{throw Error('token_hash=PRIVATE');};const failed=await route.GET(new Request('https://hub.test/api/admin/audience/report',{headers:{authorization:auth}}));assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/PRIVATE|token_hash/);
 }finally{if(old===undefined)delete process.env.EXPORT_STUDIO_PASSWORD;else process.env.EXPORT_STUDIO_PASSWORD=old;}
});
test('Reporting stays server-only; no public aggregation, participant fields, collection activation or polling',async()=>{
 const sql=await readFile(new URL('../supabase/hub-audience-report.sql',import.meta.url),'utf8');
 assert.match(sql,/security invoker set search_path=''/);assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/e.expires_at>now\(\)/);
 assert.doesNotMatch(sql,/create table|insert into|delete from|update public/i);
 const page=await readFile(new URL('../app/admin/user-stats/page.tsx',import.meta.url),'utf8');assert.match(page,/await requireAdmin\(\)/);assert.match(page,/Insufficient|sampleLabel/);assert.match(page,/not necessarily the same respondents/);assert.doesNotMatch(page,/setInterval|participant_id|token_hash|consent_receipt/);
});
test('Exact league/team IDs resolve names; missing, stale and failed game metadata never invent status',async()=>{
 let code=await readFile(new URL('../app/lib/audience-report-store.ts',import.meta.url),'utf8');
 code=code.replace("import 'server-only';",'').replace(/import \{ participationRpc \} from '[^']+';/,'const participationRpc=()=>globalThis.__reportData();')
  .replace(/import \{ verifiedSummary \} from '[^']+';/,'const verifiedSummary=(...args:unknown[])=>globalThis.__reportSummary(...args);')
  .replace("'./team-logos'",JSON.stringify(new URL('../app/lib/team-logos.ts',import.meta.url).href));
 const {loadAudienceReport}=await import(compile(code));
 const oldFetch=globalThis.fetch;
 const base={overview:{},favourites:[{league:'NFL',teamId:'12',count:1,denominator:1},{league:'CFB',teamId:'12',count:1,denominator:1}],games:[{league:'NFL',season:2026,eventId:'123',gameId:'NFL:2026:123',samples:{}}],seasons:[],gameTotal:1,retention:null};
 globalThis.__reportData=()=>structuredClone(base);let summaryCalls=0;
 globalThis.__reportSummary=(league,season,event,data)=>{assert.equal(league,'NFL');assert.equal(season,2026);assert.equal(event,'123');return {homeTeamId:'1',awayTeamId:'2',kickoffAt:'2026-10-13T12:00:00Z',status:'completed'};};
 const directory=league=>({uid:league==='NFL'?'s:20~l:28~g:9':'s:20~l:23~g:80',children:[{standings:{entries:[{team:{id:'12',displayName:league==='NFL'?'Chiefs':'College team',logos:[{href:'https://a.espncdn.com/logo.png',rel:['dark']}]}}]}}]});
 let stale=false,fail=false;
 globalThis.fetch=async url=>{
  if(url.includes('standings'))return Response.json(directory(url.includes('/nfl/')?'NFL':'CFB'));
  summaryCalls++;if(fail)throw Error('Upstream unavailable');
  return Response.json({header:{competitions:[{competitors:[{homeAway:'home',team:{id:'1',displayName:'Home'}},{homeAway:'away',team:{id:'2',displayName:'Away'}}]}]}},{headers:{date:stale?'Tue, 01 Jan 2000 00:00:00 GMT':new Date().toUTCString(),age:'0'}});
 };
 try{
  const list=await loadAudienceReport(reportFilters(new URLSearchParams()));assert.equal(summaryCalls,0);assert.equal(list.favourites[0].name,'Chiefs');assert.equal(list.favourites[1].name,'College team');
  const filters=reportFilters(new URLSearchParams('game=NFL:2026:123'));
  const fresh=await loadAudienceReport(filters);assert.equal(fresh.games[0].matchup,'Away @ Home');assert.equal(fresh.games[0].status,'completed');
  stale=true;assert.equal((await loadAudienceReport(filters)).games[0].status,undefined);
  fail=true;assert.equal((await loadAudienceReport(filters)).games[0].matchup,undefined);
  globalThis.fetch=async()=>{throw Error('Unavailable');};const missing=await loadAudienceReport(filters);assert.equal(missing.favourites[0].name,undefined);assert.equal(missing.games[0].status,undefined);
 }finally{globalThis.fetch=oldFetch;}
});
