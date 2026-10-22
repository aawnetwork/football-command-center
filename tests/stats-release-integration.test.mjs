import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const nfl=await read('app/nfl/page.tsx'),cfb=await read('app/cfb/page.tsx');
function effect(source,needle){
 const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let result;
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0].getText(ast).includes(needle))result=node.arguments[0].getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(result);return ts.transpileModule(result,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText.trim().replace(/;$/,'');
}
const nflEffect=effect(nfl,'async function loadStats'),cfbEffect=effect(cfb,'async function loadBaseline');
const flush=async()=>{await new Promise(r=>setImmediate(r));};
function setupNfl({mode='weekly',week=null,fetcher}={}){
 let rows=['old'],coverage='old',error='';const requests=[],timers=new Map();
 const env={activeTab:'stats',statsPreview:{enabled:false},statsMode:mode,statsWeek:week,statsView:'teams',fetch:async url=>{requests.push(url);assert.ok(url.startsWith('/api/nfl/team-stats?'));return fetcher?fetcher(url):Response.json({stats:[{team:'DAL'}],week:8,availableWeeks:[7,8],coverage:'Reported only'});},setStatsLoading(){},setTeamStats:r=>{rows=r;},setTeamStatsCoverage:r=>{coverage=r;},setTeamStatsError:r=>{error=r;},setAvailableStatsWeeks(){},setTeamStatsCheck:fn=>fn({}),recordDataCheck:(prior,scope)=>{assert.equal(scope,String(week??'latest'));return prior;},setStatsWeek(){assert.fail('Current Week became a fixed week');},setInterval(fn,ms){assert.equal(ms,30000);timers.set(1,fn);return 1;},clearInterval:id=>timers.delete(id)};
 const cleanup=new Function(...Object.keys(env),`return (${nflEffect})();`)(...Object.values(env));
 return {cleanup,requests,timers,get rows(){return rows;},get coverage(){return coverage;},get error(){return error;}};
}
test('NFL Teams is independent of player retrieval and keeps Current Week automatic across checks',async()=>{
 const s=setupNfl();await flush();assert.deepEqual(s.rows,[{team:'DAL'}]);assert.equal(s.requests[0],'/api/nfl/team-stats?mode=weekly');await s.timers.get(1)();await flush();assert.equal(s.requests[1],s.requests[0]);s.cleanup();assert.equal(s.timers.size,0);
});
test('NFL explicit weeks and Season use distinct requests and clear old rows while pending',async()=>{
 for(const [mode,week,query] of [['weekly',7,'mode=weekly&week=7'],['season',7,'mode=season']]){
  let resolve;const s=setupNfl({mode,week,fetcher:()=>new Promise(r=>resolve=r)});await flush();assert.deepEqual(s.rows,[]);assert.equal(s.coverage,'');assert.match(s.requests[0],new RegExp(query));resolve(Response.json({stats:[],availableWeeks:[]}));await flush();assert.deepEqual(s.rows,[]);s.cleanup();
 }
});
test('NFL failed selections stay empty with an error; cancelled older-period responses cannot overwrite newer selection',async()=>{
 const original=console.error;console.error=()=>{};
 try{
  const failed=setupNfl({mode:'season',fetcher:async()=>new Response('',{status:503})});await flush();assert.deepEqual(failed.rows,[]);assert.match(failed.error,/could not be checked/);failed.cleanup();
  let resolve;const old=setupNfl({week:6,fetcher:()=>new Promise(r=>resolve=r)});await flush();old.cleanup();resolve(Response.json({stats:[{team:'OLD'}]}));await flush();assert.deepEqual(old.rows,[]);
 }finally{console.error=original;}
});
test('CFB Season clears prior-category rows and ignores late responses after switching away',async()=>{
 let rows=['old'],resolve;const timers=new Map();
 const env={activeTab:'stats',statsMode:'season',statsPreview:{enabled:false},statsView:'team',selectedCategory:'total-defense',setSeasonStats:r=>rows=r,setSeasonStatsLoading(){},setSeasonStatsError(){},setSeasonPlayerStats(){},setStatsCheck:fn=>fn({}),recordDataCheck:()=>({}),fetch:async url=>url.includes('season-stats')?new Promise(r=>resolve=r):Response.json([]),window:{setInterval(fn){const id=timers.size+1;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id)}};
 const cleanup=new Function(...Object.keys(env),`return (${cfbEffect})();`)(...Object.values(env));await flush();assert.deepEqual(rows,[]);cleanup();resolve(Response.json([{team:'old category'}]));await flush();assert.deepEqual(rows,[]);assert.equal(timers.size,0);
});
function component(source,path,stubs={}){
 const componentModule={exports:{}},require=createRequire(new URL('../'+path,import.meta.url));
 new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>name in stubs?stubs[name]:name.endsWith('.css')?{}:require(name),componentModule,componentModule.exports);return componentModule.exports;
}
test('Players/Teams navigation and comparison are explicit, accessible and preview wording is absent',async()=>{
 const source=await read('app/features/stats/StatsPreviewSwitch.tsx');
 const {StatsPreviewSwitch,useStatsPreview}=component(source,'app/features/stats/StatsPreviewSwitch.tsx',{'next/navigation':{useSearchParams:()=>new URLSearchParams('stats2=1')}});
 const html=renderToStaticMarkup(createElement(StatsPreviewSwitch,{enabled:true,teams:false,onPreview(){},onTeams(){},onExisting(){}}));assert.match(html,/>Players<\/button>/);assert.match(html,/>Teams<\/button>/);assert.doesNotMatch(html,/Compare existing Stats/);assert.doesNotMatch(html,/Local Stats preview|Players · Stats 2.0/);
 const flag=process.env.NEXT_PUBLIC_AAW_STATS_V2_PREVIEW;
 try{delete process.env.NEXT_PUBLIC_AAW_STATS_V2_PREVIEW;assert.equal(useStatsPreview().available,false);assert.equal(useStatsPreview().enabled,false);}finally{if(flag!==undefined)process.env.NEXT_PUBLIC_AAW_STATS_V2_PREVIEW=flag;}
});
test('legacy comparison is restricted to explicitly enabled development, never production navigation',async()=>{
 const {StatsPreviewSwitch}=component(await read('app/features/stats/StatsPreviewSwitch.tsx'),'app/features/stats/StatsPreviewSwitch.tsx',{'next/navigation':{}});
 const saved={...process.env};
 try {
  for(const mode of ['development','production'])for(const flag of ['0','1'])for(const release of ['0','1']){
   process.env.NODE_ENV=mode;process.env.NEXT_PUBLIC_AAW_STATS_V2_PREVIEW=flag;process.env.NEXT_PUBLIC_AAW_STATS_V2_RELEASE=release;
   const html=renderToStaticMarkup(createElement(StatsPreviewSwitch,{enabled:true,onPreview(){},onTeams(){},onExisting(){}}));
   assert.equal(html.includes('Compare existing Stats'),mode==='development'&&flag==='1'&&release==='0');
  }
 }finally{for(const key of ['NODE_ENV','NEXT_PUBLIC_AAW_STATS_V2_PREVIEW','NEXT_PUBLIC_AAW_STATS_V2_RELEASE']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
test('candidate Teams uses one navigation row while the existing fallback retains its view controls',async()=>{
 const {StatsPanelControls}=component(await read('app/features/stats/StatsPanelControls.tsx'),'app/features/stats/StatsPanelControls.tsx');
 const props={title:'Stats',description:'Reported values',mode:'season',modes:[{value:'season',label:'Season'}],onModeChange(){},view:'team',views:[{value:'team',label:'Teams'}],onViewChange(){}};
 assert.doesNotMatch(renderToStaticMarkup(createElement(StatsPanelControls,{...props,hideViewControls:true})),/Leaderboard type/);assert.match(renderToStaticMarkup(createElement(StatsPanelControls,props)),/Leaderboard type/);
 for(const page of [nfl,cfb]){assert.match(page,/hideViewControls=\{statsPreview.teams\}/);assert.match(page,/statsPreview.selectTeams/);assert.match(page,/statsPreview.select\(false\)/);}
});
test('guarded scopes, histories, polling and selected-stat export isolation remain wired',async()=>{
 const preview=await read('app/preview/nfl-stats/stats-preview.tsx');
 for(const scope of ['reviewed-espn-week','supplied-games','retained-espn-season'])assert.ok(preview.includes(scope));
 assert.match(preview,/expandedRef.current.filter/);assert.match(preview,/startNflPolling/);assert.match(preview,/startCfbPolling/);assert.match(preview,/RecentGames/);assert.doesNotMatch(preview,/Export selected stat|exportError/);
 assert.match(nfl,/setStatsWeek\(null\).*Current Week/);assert.match(cfb,/cfbSeasonTeamLeaders\(seasonStats/);
});
test('release gate defaults normal Centre Stats to Players, navigates Teams without preview parameters and preserves disabled fallback',async()=>{
 const source=await read('app/features/stats/StatsPreviewSwitch.tsx'),env={...process.env};let query='',location='http://local/cfb?section=stats';
 const savedWindow=globalThis.window;globalThis.window={location:{get href(){return location;}},history:{replaceState(_s,_t,url){location=String(url);query=new URL(location).search.slice(1);}}};
 const {useStatsPreview,StatsPreviewSwitch}=component(source,'app/features/stats/StatsPreviewSwitch.tsx',{'next/navigation':{useSearchParams:()=>new URLSearchParams(query)}});
 try{
  delete process.env.NEXT_PUBLIC_AAW_STATS_V2_PREVIEW;delete process.env.NEXT_PUBLIC_AAW_STATS_V2_RELEASE;
  assert.equal(useStatsPreview().available,false);assert.equal(useStatsPreview().enabled,false);
  process.env.NEXT_PUBLIC_AAW_STATS_V2_RELEASE='1';assert.equal(useStatsPreview().enabled,true);assert.equal(useStatsPreview().teams,false);
  useStatsPreview().selectTeams();assert.equal(useStatsPreview().teams,true);assert.equal(new URL(location).searchParams.get('stats2'),null);
  useStatsPreview().select(true);assert.equal(useStatsPreview().enabled,true);assert.equal(new URL(location).searchParams.get('statsView'),null);
  const html=renderToStaticMarkup(createElement(StatsPreviewSwitch,{enabled:true,onPreview(){},onTeams(){},onExisting(){}}));assert.doesNotMatch(html,/Compare existing/);assert.match(html,/>Players<\/button>/);assert.match(html,/>Teams<\/button>/);
  for(const page of [nfl,cfb]){assert.match(page,/statsPreview.enabled && <StatsPreview/);assert.match(page,/statsPreview.teams && <TeamStats/);assert.match(page,/!statsPreview.enabled && !statsPreview.teams/);}
  delete process.env.NEXT_PUBLIC_AAW_STATS_V2_RELEASE;assert.equal(useStatsPreview().enabled,false);
 }finally{globalThis.window=savedWindow;for(const key of ['NEXT_PUBLIC_AAW_STATS_V2_RELEASE','NEXT_PUBLIC_AAW_STATS_V2_PREVIEW']){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}}
});
test('server release requires both switches and local preview cannot expose a Vercel deployment',async()=>{
 const {statsV2Access}=component(await read('app/lib/stats-v2/release-access.ts'),'app/lib/stats-v2/release-access.ts'),env={...process.env};
 try{
  for(const key of ['AAW_STATS_V2_RELEASE','NEXT_PUBLIC_AAW_STATS_V2_RELEASE','AAW_STATS_V2_LOCAL_PREVIEW','VERCEL'])delete process.env[key];
  assert.equal(statsV2Access(),false);process.env.AAW_STATS_V2_LOCAL_PREVIEW='1';assert.equal(statsV2Access(),true);process.env.VERCEL='1';assert.equal(statsV2Access(),false);
  process.env.AAW_STATS_V2_RELEASE='1';assert.equal(statsV2Access(),false);process.env.NEXT_PUBLIC_AAW_STATS_V2_RELEASE='1';assert.equal(statsV2Access(),true);
 }finally{for(const key of ['AAW_STATS_V2_RELEASE','NEXT_PUBLIC_AAW_STATS_V2_RELEASE','AAW_STATS_V2_LOCAL_PREVIEW','VERCEL']){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}}
});
