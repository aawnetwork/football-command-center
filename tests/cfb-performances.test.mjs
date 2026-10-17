import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBigPerformances,buildWeeklyTeamLeaders} from '../app/lib/cfb-helpers.ts';
const base={team:'Michigan State Spartans',gameId:123,opponent:'Northwestern Wildcats'};
const totals=[{...base,category:'defensive',stat:'TOT',value:84},{...base,category:'defensive',stat:'SACKS',value:6}];
const players=[
 {...base,playerId:101,player:'Quarterback',category:'passing',stat:'YDS',value:450},
 {...base,playerId:102,player:'Linebacker',category:'defensive',stat:'TOT',value:12},
 {...base,playerId:103,player:'Defensive End',category:'defensive',stat:'SACKS',value:3},
];
test('Top Performers contains only players when the feed includes full-team totals',()=>{
 const input=[...totals,...players];const original=structuredClone(input);
 assert.deepEqual(buildBigPerformances(input),buildBigPerformances(players));
 assert.deepEqual(buildBigPerformances(input).map(row=>row.player),['Quarterback','Linebacker','Defensive End']);
 assert.deepEqual(input,original);
});
test('Team-only feeds and missing/invalid athlete IDs cannot produce performance cards',()=>{
 assert.deepEqual(buildBigPerformances(totals),[]);
 for(const playerId of [undefined,null,NaN,Infinity,0,-1]){
  assert.deepEqual(buildBigPerformances([{...players[0],playerId}]),[]);
 }
 assert.deepEqual(buildBigPerformances([]),[]);
});
test('Team defensive leaderboards retain their aggregate totals',()=>{
 const input=[...totals,...players];
 assert.equal(buildWeeklyTeamLeaders(input,'total-defense')[0].value,84);
 assert.equal(buildWeeklyTeamLeaders(input,'sacks')[0].value,6);
});
