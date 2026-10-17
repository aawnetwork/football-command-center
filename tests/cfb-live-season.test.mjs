import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const source=await readFile(new URL('../app/lib/cfb-live-season.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('"./team-logos"',JSON.stringify(new URL('../app/lib/team-logos.ts',import.meta.url).href));
const {mergeLiveSeasonStats}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const now=Date.parse('2026-10-17T19:00:00Z');const updated='Saturday, October 17, 2026 12:10 am - Through games Friday, October 16, 2026';
const teams=[{id:'1',team:'Ohio State Buckeyes',location:'Ohio State'},{id:'2',team:'Indiana Hoosiers',location:'Indiana'}];
const game={id:123,startDate:'2026-10-17T16:00:00Z',homeTeam:'Ohio State Buckeyes',awayTeam:'Indiana Hoosiers',homePoints:21,awayPoints:7,live:true,completed:false,context:{verified:true}};
const base={id:'season-player',name:'Julian Sayin',team:'Ohio St.',category:'passing',statType:'YDS',stat:1700,type:'individual',sourceUpdated:updated};
const live={playerId:17,player:'Julian Sayin',team:'Ohio State Buckeyes',category:'passing',stat:'YDS',value:150,gameId:123,opponent:'Indiana Hoosiers'};
const merge=(baseline=[base],stats=[live],games=[game])=>mergeLiveSeasonStats(baseline,stats,games,teams,now);
test('Live contributions refresh without accumulating twice; final totals persist until NCAA catches up',()=>{
 assert.equal(merge()[0].stat,1850);assert.equal(merge()[0].stat,1850);
 assert.equal(merge([base],[{...live,value:180}])[0].stat,1880);
 assert.equal(merge([base],[live],[{...game,live:false,completed:true}])[0].stat,1850);
 const caughtUp={...base,stat:1850,sourceUpdated:updated.replace('Friday, October 16','Saturday, October 17')};assert.equal(merge([caughtUp])[0].stat,1850);
 assert.equal(base.stat,1700);
});
test('Unverified dates, future/scheduled games, missing identity and duplicate athlete names fail closed',()=>{
 assert.equal(merge([{...base,sourceUpdated:undefined}])[0].stat,1700);
 assert.equal(merge([{...base,team:'Unknown'}])[0].stat,1700);
 for(const fixture of [{...game,context:{verified:false}},{...game,live:false},{...game,startDate:'2026-10-18T16:00:00Z'}])assert.equal(merge([base],[live],[fixture])[0].stat,1700);
 assert.equal(merge([base],[live,{...live,playerId:18}])[0].stat,1700);
 assert.equal(merge([base],[live,live])[0].stat,1850);
});
test('Season TD, sacks and tackles match weekly labels and preserve published values',()=>{
 for(const [category,statType,weeklyCategory,label] of [['passing','TD','passing','TD'],['sacks','SACKS','defensive','SACKS'],['tackles','TACKLES','defensive','TOT']]){
  assert.equal(merge([{...base,category,statType,stat:20}],[{...live,category:weeklyCategory,stat:label,value:2}])[0].stat,22);
 }
});
test('Team cumulative totals, exact points averages, defense yardage, sacks and turnover margin update correctly',()=>{
 const teamBase={...base,type:'team',name:'Ohio State',team:'Ohio State',statType:'TEAM',gamesPlayed:6};
 const stats=[live,{...live,playerId:18,category:'rushing',value:50},{...live,playerId:19,team:'Indiana Hoosiers',value:70},{...live,playerId:undefined,category:'defensive',stat:'SACKS',value:3},{...live,playerId:undefined,category:'defensive',stat:'MARGIN',value:1}];
 const result=(category,stat,seasonTotal)=>merge([{...teamBase,category,stat,seasonTotal}],stats)[0].stat;
 assert.equal(result('total-offense',2000,2000),2200);assert.equal(result('scoring-offense',30,180),28.7);
 assert.equal(result('scoring-defense',10,60),9.6);assert.equal(result('passing-defense',200,1200),181.4);
 assert.equal(result('sacks',20,20),23);assert.equal(result('turnover-margin',5,5),6);
 assert.equal(merge([{...teamBase,category:'scoring-defense',stat:10}])[0].stat,10,'never reconstruct rounded points totals');
});

const pageSource=await readFile(new URL('../app/cfb/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',pageSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('const baselineInterval'))callback=node.arguments[0].getText(ast);ts.forEachChild(node,visit)}visit(ast);assert.ok(callback);
const effectJs=ts.transpileModule(`export function run(env){const {activeTab,statsMode,window,fetch,setSeasonStats,setSeasonPlayerStats,setSeasonStatsLoading,setStatsCheck,recordDataCheck}=env;return (${callback})();}`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {run}=await import(`data:text/javascript;base64,${Buffer.from(effectJs).toString('base64')}`);
test('Actual season effect refreshes current-week totals every 30s independently of baseline and cancels on exit',async()=>{
 const intervals=new Map(),calls=[],published=[];let next=1;
 const env={activeTab:'stats',statsMode:'season',window:{setInterval(fn,ms){intervals.set(next,{fn,ms});return next++},clearInterval(id){intervals.delete(id)}},fetch:async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('season-stats')?[base]:[live]}},setSeasonStats:data=>published.push(['base',data]),setSeasonPlayerStats:data=>published.push(['live',data]),setSeasonStatsLoading(){},setStatsCheck(){},recordDataCheck(){}};
 const settle=()=>new Promise(r=>setImmediate(r));const cleanup=run(env);await settle();assert.deepEqual(calls,['/api/season-stats','/api/player-stats']);
 const tick=[...intervals.values()].find(i=>i.ms===30000);assert.ok(tick);assert.ok([...intervals.values()].some(i=>i.ms===300000));
 tick.fn();await settle();assert.equal(calls.at(-1),'/api/player-stats');assert.equal(calls.filter(url=>url==='/api/season-stats').length,1);
 cleanup();assert.equal(intervals.size,0);const count=published.length;await tick.fn();await settle();assert.equal(published.length,count);
 assert.equal(run({...env,statsMode:'weekly'}),undefined);assert.equal(run({...env,activeTab:'games'}),undefined);
});
