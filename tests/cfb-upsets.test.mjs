import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUpsets, upsetLabel } from '../app/lib/cfb-upsets.ts';
const game = { id:1, awayTeam:'Indiana', homeTeam:'Nebraska', awayRank:7, homeRank:null, awayPoints:3, homePoints:10, live:true, completed:false };
test('Live ranked trailer alerts against unranked and lower-ranked opponents', () => {
  const [signal] = detectUpsets([game]);
  assert.equal(signal.rank,7);
  assert.equal(upsetLabel(signal,false),'🚨 UPSET ALERT — #7 Indiana trailing Nebraska 10-3');
  assert.equal(detectUpsets([{...game,homeRank:20}]).length,1);
  assert.equal(detectUpsets([{...game,homeRank:1}]).length,0);
  const [home] = detectUpsets([{...game,homeRank:7,awayRank:null,homePoints:3,awayPoints:10}]);
  assert.equal(home.rankedTeam,'Nebraska');
});
test('A fresh live snapshot removes the alert when ranked team leads or ties', () => {
  assert.equal(detectUpsets([game]).length,1);
  assert.deepEqual(detectUpsets([{...game,awayPoints:14}]),[]);
  assert.deepEqual(detectUpsets([{...game,awayPoints:10}]),[]);
});
test('Scheduled games and unavailable scores never alert', () => {
  assert.deepEqual(detectUpsets([{...game,live:false}]),[]);
  assert.deepEqual(detectUpsets([{...game,homePoints:null}]),[]);
  assert.deepEqual(detectUpsets([{...game,awayRank:null}]),[]);
});
test('Final losses retain upset result wording; final wins and ties do not alert', () => {
  const final = {...game,live:false,completed:true};
  const [signal] = detectUpsets([final]);
  assert.equal(upsetLabel(signal,true),'🚨 UPSET — #7 Indiana lost to Nebraska 10-3');
  assert.deepEqual(detectUpsets([{...final,awayPoints:14}]),[]);
  assert.deepEqual(detectUpsets([{...final,awayPoints:10}]),[]);
});
