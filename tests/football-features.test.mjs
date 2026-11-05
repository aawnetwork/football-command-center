import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCfp2026, nflSeedField, postseasonRound } from '../app/lib/postseason-model.ts';
import { projectPlayerLog } from '../app/lib/player-comparison.ts';
const team=(id,rank)=>({id:String(id),name:`Team ${id}`,seed:0,rank,logo:null,conference:`Conference ${id}`});
test('CFP includes automatic qualifiers outside the top 12, preserves ND and seeds by committee ranking',()=>{
 const ranked=Array.from({length:25},(_,i)=>team(i===9?87:i+1,i+1));
 const field=selectCfp2026(ranked,[ranked[0],ranked[1],ranked[2],team(99)],ranked[19]);
 assert.equal(field.length,12);assert.equal(new Set(field.map(t=>t.id)).size,12);
 assert.ok(field.some(t=>t.id==='99'));assert.ok(field.some(t=>t.id==='20'));assert.ok(field.some(t=>t.id==='87'));
 assert.equal(field.find(t=>t.id==='99').seed,12);assert.equal(field.find(t=>t.id==='20').seed,11);
 assert.ok(!field.some(t=>t.id==='12'));
});
test('NFL accepts seven distinct source seeds and rejects duplicated or missing seeds',()=>{
 const field=Array.from({length:7},(_,i)=>({...team(i+1),seed:i+1}));
 assert.equal(nflSeedField(field).length,7);
 assert.throws(()=>nflSeedField(field.slice(1)));
 assert.throws(()=>nflSeedField([...field.slice(0,6),{...field[6],seed:1}]));
});
test('postseason distinguishes CFP bowl rounds, excludes Pro Bowl, and uses NFL round metadata',()=>{
 assert.equal(postseasonRound('CFB','CFP Quarterfinal at the Rose Bowl',1),'quarterfinal');
 assert.equal(postseasonRound('CFB','College Football Playoff National Championship',1),'championship');
 assert.equal(postseasonRound('NFL','',5),'super-bowl');
 assert.equal(postseasonRound('NFL','Pro Bowl',4),'other');
});
const log={filters:[{name:'season',value:'2026'}],names:['completionPct','passingYards'],displayNames:['Completion %','Yards'],categories:[{name:'passing',displayName:'Passing',count:2}],events:{a:{week:1,gameDate:'2026-09-10T00:00Z'},b:{week:2,gameDate:'2026-09-17T00:00Z'}},seasonTypes:[{displayName:'2026 Regular Season',categories:[{splitType:'2',events:[{eventId:'a',stats:['50.0','100']},{eventId:'b',stats:['80.0','200']}]}],summary:{stats:[{type:'total',stats:['70.0','300']}]}}]};
test('season comparisons use provider weighted rates; weekly comparisons select exact weeks and preserve zeroes',()=>{
 assert.equal(projectPlayerLog(log,2026,2,null).metrics[0].value,'70.0');
 assert.equal(projectPlayerLog(log,2026,2,1).metrics[1].value,'100');
 assert.equal(projectPlayerLog(log,2026,2,3).metrics[1].value,null);
 assert.equal(projectPlayerLog(log,2026,3,null).metrics[1].value,null);
 const zero=structuredClone(log);zero.seasonTypes[0].categories[0].events[0].stats[1]='0';
 assert.equal(projectPlayerLog(zero,2026,2,1).metrics[1].value,'0');
 assert.throws(()=>projectPlayerLog(log,2025,2,null));
});
