import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {findCfbRivalry} from '../app/lib/cfb-rivalries.ts';
import {rivalries} from '../app/cfb/data/rivalries.ts';
const find=(homeTeam,awayTeam)=>findCfbRivalry({homeTeam,awayTeam},rivalries);
test('Michigan State–Northwestern never inherits Michigan’s George Jewett Trophy',()=>{
 for(const [a,b] of [['Michigan State Spartans','Northwestern Wildcats'],['Michigan State','Northwestern']]){
  assert.equal(find(a,b),undefined);assert.equal(find(b,a),undefined);
 }
 for(const [a,b] of [['Michigan Wolverines','Northwestern Wildcats'],['Michigan','Northwestern']]){
  assert.equal(find(a,b)?.trophy,'George Jewett Trophy');assert.equal(find(b,a)?.trophy,'George Jewett Trophy');
 }
 assert.equal(find('Michigan State Spartans','Michigan Wolverines')?.trophy,'Paul Bunyan Trophy');
});
test('Every catalogue pairing resolves in either home/away order',()=>{
 for(const rivalry of rivalries){const [a,b]=rivalry.teams;assert.equal(find(a,b),rivalry,`${a} / ${b}`);assert.equal(find(b,a),rivalry);}
});
test('School qualifiers cannot be consumed as mascots or partial matches',()=>{
 for(const [home,away] of [['Michigan State Spartans','Ohio State Buckeyes'],['Iowa State Cyclones','Wisconsin Badgers'],['Kansas State Wildcats','Missouri Tigers'],['Miami (OH) RedHawks','Florida Gators'],['Texas State Bobcats','Oklahoma Sooners'],['Western Michigan Broncos','Northwestern Wildcats']]){
  assert.equal(find(home,away),undefined,`${home} / ${away}`);
 }
 assert.equal(find('Arkansas Razorbacks','Texas A&M Aggies')?.teams[1],'Texas A&M');
 assert.equal(find('Arkansas Razorbacks','Texas Longhorns')?.teams[1],'Texas');
 assert.ok(find('San José State Spartans','Stanford Cardinal'));
 assert.ok(find("Hawai’i Rainbow Warriors",'Wyoming Cowboys'));
 assert.equal(find('','Northwestern'),undefined);assert.equal(find('Michigan','Michigan'),undefined);
});
test('All three rivalry consumers call the shared matcher',async()=>{
 for(const file of ['app/cfb/page.tsx','app/features/football/FootballSnapshot.tsx','app/features/content/ContentPanel.tsx']){
  const source=await readFile(new URL(`../${file}`,import.meta.url),'utf8');assert.match(source,/findCfbRivalry\(game, rivalries\)/,file);assert.doesNotMatch(source,/home\.includes\(a\)|mostSpecificMatch|rivalries\.find\(/,file);
 }
});
