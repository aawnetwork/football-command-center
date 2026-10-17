import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {getScoreboardRefreshDelay} from '../app/lib/scoreboard-refresh.ts';

const page=await readFile(new URL('../app/cfb/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.getText(ast).includes('function scheduleRefresh')) callback=node.arguments[0].getText(ast);
  ts.forEachChild(node,visit);
}
visit(ast);
assert.ok(callback);
const js=ts.transpileModule(`export function run(env) { const {activeTab,seasonIndicators,gamesLoading,selectedWeek,window,fetch,getScoreboardRefreshDelay,setGamesLoading,setGamesError,setSeasonGames,setCurrentWeek,setSelectedWeek,setGames,setGamesCheck,setGameSeason,setRivalryGames,setUpsets,recordDataCheck,isRivalryGame,detectUpsets}=env; return (${callback})(); }`,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {run}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup() {
  const snapshots=[],calls=[],timers=new Map();let counter=0;
  let response={games:[{id:1,live:true,completed:false,startDate:new Date().toISOString()}]};
  const env={activeTab:'stats',seasonIndicators:true,gamesLoading:false,selectedWeek:1,getScoreboardRefreshDelay,
    window:{setTimeout(fn,delay){timers.set(++counter,{fn,delay});return counter;},clearTimeout(id){timers.delete(id);}},
    fetch:async(url,options)=>{calls.push({url,options});if(response instanceof Error)throw response;return Response.json(response);},
    setSeasonGames:value=>snapshots.push(value),setGamesLoading(){},setGamesError(){},setGamesCheck(){},
    // Season-only refresh must never replace the user's selected weekly slate.
    setGames(){assert.fail('weekly games changed');},setSelectedWeek(){assert.fail('selected week changed');}};
  return {env,snapshots,calls,timers,respond(value){response=value;}};
}
test('Actual scoreboard effect refreshes current season games independent of selected week and stops after final',async()=>{
  const s=setup();const cleanup=run(s.env);await flush();
  assert.equal(s.calls[0].url,'/api/scoreboard');assert.equal(s.calls[0].options.cache,'no-store');
  assert.deepEqual(s.snapshots[0],[]);assert.equal(s.snapshots.at(-1)[0].live,true);
  const [id,timer]=[...s.timers][0];assert.equal(timer.delay,30000);s.timers.delete(id);
  s.respond({games:[{id:1,live:false,completed:true,startDate:new Date().toISOString()}]});
  await timer.fn();await flush();
  assert.equal(s.snapshots.at(-1)[0].completed,true);assert.equal(s.timers.size,0);
  cleanup();
});
test('Actual scoreboard effect clears stale indicators on failure and cancels pending work on leaving season view',async()=>{
  const s=setup();const cleanup=run(s.env);await flush();
  const [id,timer]=[...s.timers][0];s.timers.delete(id);s.respond(new Error('simulated status failure'));
  const original=console.error;console.error=()=>{};
  try{await timer.fn();await flush();}finally{console.error=original;}
  assert.deepEqual(s.snapshots.at(-1),[]);assert.equal([...s.timers.values()][0].delay,60000);
  cleanup();assert.equal(s.timers.size,0);
  const late=setup();let resolve;late.env.fetch=()=>new Promise(done=>{resolve=done;});
  const cancel=run(late.env);cancel();resolve(Response.json({games:[{live:true}]}));await flush();
  assert.deepEqual(late.snapshots,[[]]);assert.equal(late.timers.size,0);
});
test('Weekly Stats still uses its existing stats pipeline rather than starting a second scoreboard loop',()=>{
  const s=setup();run({...s.env,seasonIndicators:false});assert.equal(s.calls.length,0);
});
