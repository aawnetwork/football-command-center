import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { favouriteKeys, invitationKey, parseFavourite, writeFavourite, favouriteSides, shouldInvite } from '../app/lib/local-preferences.ts';
test('Independent canonical favourites select, change, restore and remove without touching tiers', () => {
  const data=new Map([['cfb-game-tiers','{"123":"S"}'],['nfl-game-tiers','{"456":"A"}']]);
  const storage={setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  assert.equal(writeFavourite(storage,'NFL','6'),true);assert.equal(writeFavourite(storage,'CFB','256'),true);
  assert.equal(parseFavourite(data.get(favouriteKeys.NFL)),'6');assert.equal(parseFavourite(data.get(favouriteKeys.CFB)),'256');
  writeFavourite(storage,'NFL','7');assert.equal(parseFavourite(data.get(favouriteKeys.NFL)),'7');assert.equal(parseFavourite(data.get(favouriteKeys.CFB)),'256');
  writeFavourite(storage,'CFB',null);assert.equal(parseFavourite(data.get(favouriteKeys.CFB)??null),null);
  assert.equal(data.get('cfb-game-tiers'),' {"123":"S"}'.trim());assert.equal(data.get('nfl-game-tiers'),'{"456":"A"}');
  writeFavourite(storage,'NFL',null);assert.equal(data.has(favouriteKeys.NFL),false);
});
test('Corrupt/missing storage and noncanonical identifiers are safe; blocked storage leaves a session fallback possible', () => {
  for(const value of [null,'bad','{}','{"version":2,"teamId":"6"}','{"version":1,"teamId":"Chiefs"}','{"version":1,"teamId":6}']) assert.equal(parseFavourite(value),null);
  const blocked={setItem:()=>{throw Error('blocked')},removeItem:()=>{throw Error('blocked')}};
  assert.equal(writeFavourite(blocked,'NFL','6'),false);assert.equal(writeFavourite(blocked,'CFB',null),false);
  assert.equal(writeFavourite(blocked,'NFL','invalid'),false);
});
test('Favourite highlighting uses exact league/team IDs and never mutates order, tiers or overlays', () => {
  const games=[{id:1,context:{league:'CFB',homeTeamId:'256',awayTeamId:'1'},tier:'S'},{id:2,context:{league:'NFL',homeTeamId:'256',awayTeamId:'2'},tier:'D'}];
  const before=JSON.stringify(games);
  assert.deepEqual(favouriteSides(games[0].context,'CFB','256'),{home:true,away:false});
  assert.deepEqual(favouriteSides(games[1].context,'CFB','256'),{home:false,away:false});
  assert.deepEqual(favouriteSides(undefined,'NFL','256'),{home:false,away:false});
  assert.deepEqual(favouriteSides(games[0].context,'CFB',null),{home:false,away:false});
  assert.equal(JSON.stringify(games),before);
});
test('Invitation requires an interaction, an enabled preview and an unseen visit', () => {
  assert.equal(shouldInvite(false,false,true),false);assert.equal(shouldInvite(true,false,false),false);
  assert.equal(shouldInvite(true,false,true),true);assert.equal(shouldInvite(true,true,true),false);
  assert.notEqual(invitationKey,favouriteKeys.NFL);
});
test('Preferences have no audience writes, analytics or consent cookies; dialog has keyboard/focus and cross-tab handling', async () => {
  const source=await readFile(new URL('../app/features/preferences/HubPreferences.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/document\.cookie|gtag|sendBeacon|\/api\/audience|method:\s*["']POST/);
  assert.match(source,/NEXT_PUBLIC_AAW_PARTICIPATION_PREVIEW === "true"/);
  assert.match(source,/showModal\(\)/);assert.match(source,/onCancel=/);assert.match(source,/previous\.focus\(\)/);
  assert.match(source,/addEventListener\("storage"/);assert.match(source,/Coming Soon · Unavailable/);
});
