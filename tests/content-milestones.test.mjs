import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {achievedMilestoneSignals} from '../app/lib/content-milestones.ts';
const now=Date.parse('2026-10-18T12:00:00Z');
const base={id:'move',league:'NFL',audience:'individual',period:'career',category:'passing-yards',type:'rank-movement',player:'Player',isActive:true,previousRank:2,currentRank:1,createdAt:'2026-10-17T12:00:00Z'};
test('One record takeover produces one editorial achievement without deleting stored signals',()=>{
 const input=[base,{...base,id:'holder',type:'record-holder'},base],before=structuredClone(input);
 assert.deepEqual(achievedMilestoneSignals(input,'NFL',now).map(s=>s.type),['record-holder']);assert.deepEqual(input,before);
});
test('Falls, unchanged ranks, old, invalid, future and wrong-scope signals are not achievements',()=>{
 for(const patch of [{previousRank:1,currentRank:2},{previousRank:1},{previousRank:undefined},{createdAt:'bad'},{createdAt:'2026-10-19'},{createdAt:'2026-10-01'},{league:'CFB'},{isActive:false},{audience:'team'},{period:'single-game'}])assert.deepEqual(achievedMilestoneSignals([{...base,...patch}],'NFL',now),[]);
 const signals=[{...base,currentRank:2,previousRank:5},{...base,id:'entry',player:'New Player',type:'new-entry'}];assert.equal(achievedMilestoneSignals(signals,'NFL',now).length,2);
});
test('Content has no public tab/component entry, while its private gated implementation survives',async()=>{
 for(const league of ['cfb','nfl']){const source=await readFile(new URL(`../app/${league}/page.tsx`,import.meta.url),'utf8');assert.doesNotMatch(source,/ContentPanel|\["content", "Content"\]/);}
 const privatePage=await readFile(new URL('../app/admin/content/page.tsx',import.meta.url),'utf8');assert.match(privatePage,/await requireAdmin\(\)/);assert.match(privatePage,/ContentPanel sport="CFB"/);assert.match(privatePage,/ContentPanel sport="NFL"/);
 const content=await readFile(new URL('../app/features/content/ContentPanel.tsx',import.meta.url),'utf8');assert.match(content,/Promise.allSettled/);assert.match(content,/achievedMilestoneSignals/);
});
