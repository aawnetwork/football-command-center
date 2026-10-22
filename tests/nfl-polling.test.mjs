import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compiled=new Map();
async function compile(path){if(compiled.has(path.href))return compiled.get(path.href);let js=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;for(const m of [...js.matchAll(/from (['"])(\.[^'"]+)\1/g)])js=js.replace(m[0],`from ${JSON.stringify(await compile(new URL(m[2]+'.ts',path)))}`);const url='data:text/javascript;base64,'+Buffer.from(js).toString('base64');compiled.set(path.href,url);return url;}
const file=p=>new URL('../'+p,import.meta.url);
const {startNflPolling}=await import(await compile(file('app/preview/nfl-stats/nfl-polling.ts')));
const {createCfbGate}=await import(await compile(file('app/preview/nfl-stats/cfb-polling.ts')));
const {respondNflPollStatus}=await import(await compile(file('app/lib/stats-v2/nfl-poll-status.ts')));
const base=Date.parse('2026-10-25T00:50:00Z');
const game=(state='pre',minutes=120,id='1')=>({id,startDate:new Date(base+minutes*60000).toISOString(),live:state==='in',completed:state==='post'});
const flush=()=>new Promise(r=>setImmediate(r));
async function harness(initial={games:[game()],historical:false}){
 let clock=base,observation=initial,task,heavy=0,checks=0,gate,historical,fail=false,statsFail=false;
 const stop=startNflPolling({refresh:async()=>{heavy++;return !statsFail;},status:async()=>{checks++;if(fail)throw Error('offline');return observation;},report:(g,_checked,h)=>{gate=g;historical=h;},now:()=>clock,schedule:(run,delay)=>{task={run,delay};return 1;},cancel:()=>{task=null;}});await flush();
 return {stop,get heavy(){return heavy;},get checks(){return checks;},get gate(){return gate;},get historical(){return historical;},get delay(){return task?.delay;},set:(games)=>{observation={games,historical:false};},fail:value=>{fail=value;},statsFail:value=>{statsFail=value;},async step(ms){clock+=ms??task.delay;const run=task.run;task=null;run();await flush();}};
}
test('idle completed games load once: 1 heavy request instead of 121 over an hour',async()=>{
 const h=await harness({games:[game('post')],historical:false});for(let i=0;i<12;i++)await h.step();assert.equal(h.heavy,1);assert.equal(h.checks,13);assert.equal(h.gate.state,'idle');h.stop();
});
test('near kickoff and lagging scheduled status stay light, live/final cooldown and second live reopen',async()=>{
 const h=await harness();await h.step(105*60000);assert.equal(h.gate.state,'approaching');assert.equal(h.delay,30000);await h.step(16*60000);assert.equal(h.heavy,1);
 h.set([game('in')]);await h.step();assert.equal(h.heavy,2);assert.equal(h.gate.state,'live');
 h.set([game('post')]);await h.step();assert.equal(h.gate.state,'cooldown');
 h.set([game('post'),game('in',120,'2')]);await h.step();assert.equal(h.gate.state,'live');
 h.set([game('post'),game('post',120,'2')]);await h.step();assert.equal(h.gate.state,'cooldown');await h.step(15*60000);assert.equal(h.gate.state,'idle');assert.equal(h.delay,300000);h.stop();
});
test('provider failure/missing live game retains active heavy polling and recovers',async()=>{
 const h=await harness({games:[game('in')],historical:false});h.fail(true);await h.step();assert.equal(h.gate.state,'recovering');assert.equal(h.heavy,2);assert.equal(h.delay,30000);h.fail(false);h.set([]);await h.step();assert.equal(h.gate.heavy,true);h.set([game('post')]);await h.step();assert.equal(h.gate.state,'cooldown');h.stop();
});
test('historical weeks stop after initial stats/status; Season remains independently live',async()=>{
 const old=await harness({games:[],historical:true});assert.equal(old.heavy,1);assert.equal(old.checks,1);assert.equal(old.delay,undefined);assert.equal(old.historical,true);
 const season=await harness({games:[game('in')],historical:false});await season.step();assert.equal(season.heavy,2);old.stop();season.stop();
});
test('NFL and CFB gates have independent live/idle state in all combinations',async()=>{
 for(const nflLive of [false,true])for(const cfbLive of [false,true]){const h=await harness({games:[game(nflLive?'in':'pre')],historical:false});const cfb=createCfbGate();assert.equal(cfb([game(cfbLive?'in':'pre')],base).heavy,cfbLive);assert.equal(h.gate.heavy,nflLive);h.stop();}
});
test('failed heavy refresh retries while idle, cancellation prevents later checks',async()=>{
 const h=await harness({games:[game('in')],historical:false});h.statsFail(true);await h.step();h.set([game('post')]);await h.step();await h.step(16*60000);assert.equal(h.gate.heavy,false);assert.equal(h.delay,30000);h.statsFail(false);await h.step();assert.equal(h.delay,300000);h.stop();assert.equal(h.delay,undefined);
});
test('status API validates period/status and calls only existing scoreboard, with no player/history work',async()=>{
 const calls=[];let board={season:{year:2026,type:2},week:{number:8},events:[{id:'123',date:new Date(base).toISOString(),season:{year:2026,type:2},competitions:[{status:{type:{state:'in',completed:false}}}]}]};
 const source=async url=>{calls.push(url);return {value:url.includes('week=7')?{...board,week:{number:7},events:board.events.map(e=>({...e,competitions:[{status:{type:{state:'post',completed:true}}}]}))}:board,observedAt:base};};
 const get=q=>respondNflPollStatus(new Request('http://fixture/?view=status&'+q),source);
 assert.equal((await(await get('')).json()).games[0].live,true);
 assert.equal((await(await get('mode=season')).json()).period.week,null);
 assert.equal((await(await get('week=7')).json()).historical,true);
 assert.ok(calls.every(url=>new URL(url).pathname.endsWith('/nfl/scoreboard')));assert.equal(calls.length,4);
 const before=calls.length;for(const q of ['week=19','week=7&week=8','mode=season&week=7','season=2025','players=x'])assert.equal((await get(q)).status,400);assert.equal(calls.length,before);
 board={...board,season:{year:2025,type:2}};assert.equal((await get('')).status,503);
 board={season:{year:2026,type:2},week:{number:8},events:[]};assert.equal((await get('')).status,503);
});
test('UI polling callback preserves selection, rankings, expanded cards and history; CFB branch unchanged',async()=>{
 const ui=await readFile(file('app/preview/nfl-stats/stats-preview.tsx'),'utf8');const branch=ui.slice(ui.indexOf("if (league === 'NFL' && !fixture)"),ui.indexOf('queueMicrotask(() => { if (active) void refresh(); })'));
 assert.match(branch,/startNflPolling/);assert.doesNotMatch(branch,/setExpanded|setOrder|setMetric|setSearch|setConference|setData/);assert.match(ui,/expandedRef.current.filter/);assert.match(ui,/setLastChecked\(Date.now\(\)\)/);assert.match(ui,/league === 'CFB' && !fixture/);
});
test('failed initial historical load retries once recovered without an ongoing historical loop',async()=>{
 let heavy=0,task;const stop=startNflPolling({refresh:async()=>++heavy>1,status:async()=>({historical:true,games:[]}),report:()=>{},now:()=>base,schedule:(run,delay)=>{task={run,delay};return 1;},cancel:()=>{task=null;}});
 await flush();assert.equal(heavy,1);assert.equal(task.delay,30000);const run=task.run;task=null;run();await flush();assert.equal(heavy,2);assert.equal(task,null);stop();
});
test('a prior week is not historical until its own games are verified final',async()=>{
 const urls=[];const source=async url=>{urls.push(url);return {value:{season:{year:2026,type:2},week:{number:url.includes('week=7')?7:8},events:[{id:'123',date:new Date(base).toISOString(),season:{year:2026,type:2},competitions:[{status:{type:{state:'in',completed:false}}}]}]},observedAt:base};};
 const body=await(await respondNflPollStatus(new Request('http://fixture/?view=status&week=7'),source)).json();assert.equal(body.historical,false);assert.equal(body.games[0].live,true);assert.equal(urls.length,2);assert.match(urls[1],/week=7/);
});
