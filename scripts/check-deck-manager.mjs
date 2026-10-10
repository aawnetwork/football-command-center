// Integration test against an explicitly selected local production server.
// Prints the temporary row ID for exact cleanup after verification.
import assert from 'node:assert/strict';
const base=process.env.DESK_TEST_ORIGIN;
if (!base || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('Select a local test server with DESK_TEST_ORIGIN.');
const auth='Basic '+Buffer.from('aaw:'+process.env.DESK_TEST_PASSWORD).toString('base64');
async function request(path,init={},status=200) {
  const r=await fetch(base+path,init); assert.equal(r.status,status,`${path}: expected ${status}, got ${r.status}`);
  return r.headers.get('content-type')?.includes('application/json') ? r.json() : {};
}
const headers={Authorization:auth,Origin:base,'Content-Type':'application/json'};
const post=(body,status=200,h=headers)=>request('/api/admin/decks',{method:'POST',headers:h,body:JSON.stringify(body)},status);
await request('/admin/decks',{},401);
await request('/api/admin/decks',{},401);
await post({action:'create'},401,{Origin:base,'Content-Type':'application/json'});
await post({action:'create'},403,{...headers,Origin:'https://evil.example'});
await post({action:'create'},403,{Authorization:auth,'Content-Type':'application/json'});
await post({action:'create'},415,{...headers,'Content-Type':'text/plain'});
await request('/admin/decks',{headers:{Authorization:auth}});
await request('/api/decks?season=2026&week=99',{},400);
const slate=await request('/api/admin/decks?view=games&season=2026&week=6',{headers:{Authorization:auth}});
const game=slate.games[0].id;
let draft={league:'CFB',name:'AAW temporary API verification',season:2026,week:6,assignments:{[game]:'S'}};
await post({action:'create',draft:{...draft,assignments:{'999999999':'S'}}},400);
await post({action:'create',draft:{...draft,assignments:{[game]:'Z'}}},400);
let {deck}=await post({action:'create',draft});
console.log('TEMPORARY_DECK_ID='+deck.id);
assert.equal((await request('/api/decks?season=2026&week=6')).decks.some(d=>d.id===deck.id),false);
const stale=deck.revision;
({deck}=await post({action:'publish',id:deck.id,revision:deck.revision}));
assert.equal((await request('/api/decks?season=2026&week=6')).decks.find(d=>d.id===deck.id).name,draft.name);
draft={...draft,name:'AAW temporary edited draft',assignments:{[game]:'B'}};
await post({action:'save',id:deck.id,revision:stale,draft},409);
({deck}=await post({action:'save',id:deck.id,revision:deck.revision,draft}));
assert.equal((await request('/api/decks?season=2026&week=6')).decks.find(d=>d.id===deck.id).assignments[game],'S');
// Independent HTTP read proves persistence outside the editor's client state.
assert.equal((await request('/api/admin/decks',{headers:{Authorization:auth}})).decks.find(d=>d.id===deck.id).draft.name,draft.name);
const concurrentRevision=deck.revision;
const outcomes=await Promise.all([1,2].map(()=>fetch(base+'/api/admin/decks',{method:'POST',headers,body:JSON.stringify({action:'save',id:deck.id,revision:concurrentRevision,draft})}).then(r=>r.status)));
assert.deepEqual(outcomes.sort(),[200,409]);
deck=(await request('/api/admin/decks',{headers:{Authorization:auth}})).decks.find(d=>d.id===deck.id);
({deck}=await post({action:'publish',id:deck.id,revision:deck.revision}));
assert.equal((await request('/api/decks?season=2026&week=6')).decks.find(d=>d.id===deck.id).assignments[game],'B');
assert.equal((await request('/api/decks?season=2026&week=5')).decks.some(d=>d.id===deck.id),false);
({deck}=await post({action:'unpublish',id:deck.id,revision:deck.revision}));
assert.equal(deck.published,null); assert.equal(deck.draft.name,draft.name);
assert.equal((await request('/api/decks?season=2026&week=6')).decks.some(d=>d.id===deck.id),false);
console.log('PASS: auth, origin, validation, private draft, publish isolation, conflict/CAS, independent read, republish and unpublish.');
