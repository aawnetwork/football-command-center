import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft, deckSlate, sameDeckOrigin } from '../app/lib/deck-validation.ts';
const draft = { league:'CFB', name:' Test ', season:2026, week:6, assignments:{'1':'S'} };
test('Draft validation scopes valid tiers to verified games and normalises the name', () => {
  assert.equal(validateDraft(draft,[1]).name,'Test');
  for (const bad of [{...draft,league:'NFL'},{...draft,name:''},{...draft,assignments:{'2':'A'}},{...draft,assignments:{'1':'Z'}},{...draft,extra:true},{...draft,season:'2026'}]) assert.throws(()=>validateDraft(bad,[1]));
  assert.deepEqual(validateDraft({...draft,assignments:{}},[1]).assignments,{});
  assert.throws(()=>validateDraft({...draft,assignments:{}},[1],true));
});
test('Season/week rejects unsupported week zero, non-integers and out-of-range values', () => {
  assert.deepEqual(deckSlate(2026,0),{season:2026,week:0});
  for (const args of [[2025,0],[2026,17],[2026,-1],[2026,1.5],[1999,1],[2100,1],[null,1]]) assert.throws(()=>deckSlate(...args));
});
test('Writes require exact origin and reject missing, foreign and cross-site origins', () => {
  const req=(headers)=>new Request('https://desk.aawnetwork.co.uk/api/admin/decks',{headers});
  assert.equal(sameDeckOrigin(req({origin:'https://desk.aawnetwork.co.uk'})),true);
  for (const headers of [{},{origin:'null'},{origin:'https://evil.example'},{origin:'http://desk.aawnetwork.co.uk'},{origin:'https://desk.aawnetwork.co.uk','sec-fetch-site':'cross-site'}]) assert.equal(sameDeckOrigin(req(headers)),false);
});
