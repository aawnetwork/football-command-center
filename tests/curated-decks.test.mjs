import test from 'node:test';
import assert from 'node:assert/strict';
import { availableDecks, validDeckAssignments, toggleDeckTier, groupDeckGames } from '../app/lib/curated-decks.ts';

const deck = { id:'test',league:'CFB',season:2026,week:0,name:'Test deck',assignments:{'1':'S','2':'A','99':'D','3':'invalid'} };
test('Decks are scoped to league, season and week, including week zero', () => {
  assert.equal(availableDecks([deck],2026,0).length,1);
  assert.equal(availableDecks([deck],2026,1).length,0);
  assert.equal(availableDecks([deck],2027,0).length,0);
  assert.equal(availableDecks([{...deck,league:'NFL'}],2026,0).length,0);
});
test('Unknown IDs and invalid tiers are ignored', () => {
  assert.deepEqual(validDeckAssignments(deck.assignments,[1,2,3]),{1:'S',2:'A'});
});
test('Editing a deck does not mutate personal selections or original assignments', () => {
  const personal={1:'B'};
  const loaded=validDeckAssignments(deck.assignments,[1,2]);
  const edited=toggleDeckTier(loaded,1,'A');
  assert.deepEqual(edited,{1:'A',2:'A'});
  assert.deepEqual(loaded,{1:'S',2:'A'});
  assert.deepEqual(personal,{1:'B'});
  assert.deepEqual(toggleDeckTier(edited,1,'A'),{2:'A'});
});
test('Sharing respects tier selection, canonical order and selected slate only', () => {
  const games=[{id:1,awayTeam:'Away',homeTeam:'Home'},{id:2,awayTeam:'A2',homeTeam:'H2'}];
  const tiers={1:'S',2:'A',99:'S'};
  assert.deepEqual(groupDeckGames(games,tiers,['S']).map(x=>[x.tier,x.games.length]),[['S',1]]);
  assert.deepEqual(groupDeckGames(games,tiers,['A','S']).map(x=>x.tier),['S','A']);
  assert.deepEqual(groupDeckGames(games,tiers,[]),[]);
  assert.deepEqual(groupDeckGames(games,{},['S']),[]);
});
