import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../app/preview/nfl-stats/update-status.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {statsUpdateStatus,playerDetailCheckLabel}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const checked=Date.parse('2026-10-21T16:00:00Z');
const data=(overrides={})=>({observationAt:'2026-10-21T02:45:11.510Z',lines:[{playingNow:false}],...overrides});
test('CFB reviewed Week 7 separates fixed observation from advancing check time',()=>{
 const fixed=data({scope:'reviewed-espn-week'}),a=statsUpdateStatus(fixed,checked,false,false),b=statsUpdateStatus(fixed,checked+30000,false,false);
 assert.equal(a.cadence,'Historical ESPN snapshot');assert.match(a.snapshot,/Snapshot through 21 Oct 2026/);assert.equal(a.snapshot,b.snapshot);assert.notEqual(a.heading,b.heading);assert.match(a.heading,/Last checked/);assert.doesNotMatch(a.cadence,/LIVE/);
 assert.equal(statsUpdateStatus(data({scope:'reviewed-espn-week',observationAt:'invalid'}),checked,false,false).snapshot,null);
});
test('CFB current or explicit week with completed/scheduled data does not imply live games',()=>{
 for(const rows of [[],[{playingNow:false}],[{playingNow:null}],[{playingNow:false},{playingNow:null}]]){
  const state=statsUpdateStatus(data({lines:rows}),checked,false,false);assert.equal(state.cadence,'Automatic checks every 30 seconds');assert.equal(state.snapshot,null);
 }
});
test('confirmed live fixture permits live cadence; failure pauses live claims without a fresh timestamp',()=>{
 const live=data({lines:[{playingNow:true}]}),ok=statsUpdateStatus(live,checked,false,false),failed=statsUpdateStatus(live,checked,false,true);
 assert.equal(ok.cadence,'LIVE · updates every 30 seconds');assert.equal(failed.cadence,'Automatic checks every 30 seconds');assert.match(failed.heading,/Check failed/);assert.ok(failed.heading.endsWith(ok.heading));
 assert.equal(statsUpdateStatus(data({scope:'reviewed-espn-week',lines:[{playingNow:true}]}),checked,false,false).cadence,'Historical ESPN snapshot');
});
test('NFL historical Week 6 and season use neutral check wording without treating response observationAt as publication',()=>{
 for(const period of [{season:2026,phase:'REG',week:6},{season:2026,phase:'REG',week:null}]){
  const state=statsUpdateStatus(data({period}),checked,false,false);assert.equal(state.snapshot,null);assert.equal(state.cadence,'Automatic checks every 30 seconds');assert.doesNotMatch(state.heading,/Updated|observed|verified/i);
 }
 assert.equal(statsUpdateStatus(data({period:{week:null},lines:[{playingNow:true}]}),checked,false,false).cadence,'LIVE · updates every 30 seconds');
});
test('unchanged responses advance only check labels; expanded-card labels do not claim statistical changes',()=>{
 const a=statsUpdateStatus(data(),checked,false,false),b=statsUpdateStatus(data(),checked+30000,false,false);assert.notEqual(a.heading,b.heading);assert.equal(a.snapshot,b.snapshot);
 assert.match(playerDetailCheckLabel(checked,false,false),/^Last checked /);assert.match(playerDetailCheckLabel(checked,false,true),/Check failed/);assert.match(playerDetailCheckLabel(checked,true,false),/Checking/);assert.equal(playerDetailCheckLabel(null,false,false),'');
});
test('client wires check timestamps only to successful responses while retaining polling and expansion paths',async()=>{
 const ui=await readFile(new URL('../app/preview/nfl-stats/stats-preview.tsx',import.meta.url),'utf8');
 assert.match(ui,/if \(active\) \{ setData\(body\); setLastChecked\(Date.now\(\)\)/);assert.match(ui,/setDetailChecked\(Date.now\(\)\)/);
 assert.doesNotMatch(ui,/Last Updated|detailObservation|setLastChecked\(.*observationAt/);
 assert.match(ui,/catch \{ if \(active\) setError/);assert.match(ui,/setInterval\(refresh, 30_000\)/);assert.match(ui,/expandedRef.current.filter/);assert.match(ui,/row.playingNow && !error/);
});
