import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../app/api/team-logo/route.ts';
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const req=id=>new Request(`https://hub.test/api/team-logo?id=${encodeURIComponent(id)}`);
test('Logo proxy accepts only numeric NCAA IDs and a fixed upstream',async()=>{
 const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://a.espncdn.com/i/teamlogos/ncaa/500/349.png');assert.equal(options.redirect,'error');return new Response(png,{headers:{'content-type':'image/png'}})};
 try {
  for(const id of ['', '../349', 'https://evil.test', '349.png','12345678901'])assert.equal((await GET(req(id))).status,400);
  assert.equal(calls,0);const response=await GET(req('349'));assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),png);
 }finally{globalThis.fetch=previous;}
});
test('Failed, non-image and corrupt upstream responses are never cached as logos',async()=>{
 const previous=globalThis.fetch;
 try {for(const response of [new Response('missing',{status:404}),new Response('html',{headers:{'content-type':'text/html'}}),new Response('corrupt',{headers:{'content-type':'image/png'}})]){
  globalThis.fetch=async()=>response;const result=await GET(req('193'));assert.equal(result.status,502);assert.equal(result.headers.get('cache-control'),null);
 }
 globalThis.fetch=async()=>{throw new Error('timeout')};assert.equal((await GET(req('2390'))).status,502);
 }finally{globalThis.fetch=previous;}
});
