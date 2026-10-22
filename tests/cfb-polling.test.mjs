import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../app/preview/nfl-stats/cfb-polling.ts',import.meta.url),'utf8');
const {createCfbGate,startCfbPolling}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const base=Date.parse('2026-10-24T23:50:00Z');
const game=(state='pre',minutes=60,id='1')=>({id,startDate:new Date(base+minutes*60000).toISOString(),live:state==='in',completed:state==='post'});
test('actual kickoff, midnight/DST, lagging scheduled status and cooldown transitions',()=>{
 const gate=createCfbGate();
 assert.deepEqual(gate([game()],base),{state:'idle',delay:300000,heavy:false});
 assert.equal(gate([game()],base+45*60000).state,'approaching');
 assert.equal(gate([game()],base+61*60000).heavy,false);
 assert.equal(gate([game('in')],base+62*60000).heavy,true);
 assert.equal(gate([game('post')],base+65*60000).state,'cooldown');
 assert.equal(gate(null,base+66*60000).heavy,true);
 assert.equal(gate([game('post'),game('in',70,'2')],base+70*60000).state,'live');
 assert.equal(gate([game('post'),game('post',70,'2')],base+75*60000).state,'cooldown');
 assert.equal(gate([game('post'),game('post',70,'2')],base+90*60000).state,'idle');
});
test('failure and disappearing live game never prove completion; recovery reopens',()=>{
 const gate=createCfbGate(); assert.equal(gate([game('in')],base).state,'live');
 assert.equal(gate([],base+30000).state,'recovering');
 assert.equal(gate(null,base+60000).heavy,true);
 assert.equal(gate([game('in')],base+90000).state,'live');
 const idle=createCfbGate();assert.equal(idle(null,base).heavy,false);assert.equal(idle([game('in')],base).heavy,true);
});
function harness({games=[game()],historical=false,currentWeek=true}={}) {
 let clock=base,heavy=0,status=0,task,decision;const selection={expanded:['player'],sort:'yards',ranks:[1,2]};
 const stop=startCfbPolling({refresh:async()=>{heavy++;},status:async()=>{status++;return games;},report:gate=>{decision=gate;},historical,currentWeek,now:()=>clock,schedule:(run,delay)=>{task={run,delay};return 1;},cancel:()=>{task=null;}});
 return {stop,selection,get heavy(){return heavy;},get status(){return status;},get decision(){return decision;},async flush(){await new Promise(resolve=>setImmediate(resolve));},async advance(){clock+=task.delay;const run=task.run;task=null;run();await this.flush();}};
}
test('idle hour: 1 initial heavy call vs 121 fixed-interval calls; state untouched',async()=>{
 const h=harness({games:[game('pre',180)]});await h.flush();for(let i=0;i<12;i++)await h.advance();
 assert.equal(h.heavy,1);assert.equal(h.status,13);assert.deepEqual(h.selection,{expanded:['player'],sort:'yards',ranks:[1,2]});h.stop();
});
test('initial completed stats always load, cooldown expires, history loads once',async()=>{
 const h=harness({games:[game('post')]});await h.flush();assert.equal(h.heavy,1);for(let i=0;i<31;i++)await h.advance();assert.equal(h.decision.state,'idle');assert.equal(h.heavy,30);h.stop();
 const history=harness({historical:true});await history.flush();assert.equal(history.heavy,1);assert.equal(history.status,0);history.stop();
 const selected=harness({games:[game('post')],currentWeek:false});await selected.flush();await selected.advance();assert.equal(selected.heavy,1);selected.stop();
});
test('live 30-second checks and cancellation; NFL interval and UI state ownership unchanged',async()=>{
 const h=harness({games:[game('in')]});await h.flush();await h.advance();assert.equal(h.heavy,2);h.stop();
 const ui=await readFile(new URL('../app/preview/nfl-stats/stats-preview.tsx',import.meta.url),'utf8');
 assert.match(ui,/league === 'CFB' && !fixture/);assert.match(ui,/setInterval\(refresh, 30_000\)/);
 const effect=ui.slice(ui.indexOf('report: (gate'),ui.indexOf('// Foundation.complete'));
 assert.doesNotMatch(effect,/setExpanded|setOrder|setMetric|setConference/);
});
test('failed initial statistics retry even while status is idle; stale work cannot schedule after stop',async()=>{
 let calls=0,task;const stop=startCfbPolling({refresh:async()=>++calls>1,status:async()=>[game()],report:()=>{},historical:false,currentWeek:true,now:()=>base,schedule:(run,delay)=>{task={run,delay};return 1;},cancel:()=>{task=null;}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.equal(task.delay,30000);task.run();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);assert.equal(task.delay,300000);stop();assert.equal(task,null);
});
