import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function route(league) {
  const path = league === 'NFL' ? '../app/api/nfl/scoreboard/route.ts' : '../app/api/scoreboard/route.ts';
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  source = source.replace('import { NextResponse } from "next/server";', 'const NextResponse = { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) };')
    .replace(/"(?:\.\.\/)+lib\/gameday-status"/, JSON.stringify(new URL('../app/lib/gameday-status.ts', import.meta.url).href))
    .replace(/"(?:\.\.\/)+lib\/game-context"/, JSON.stringify(new URL('../app/lib/game-context.ts', import.meta.url).href));
  const js = ts.transpileModule(source, { compilerOptions: { module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
test('Both routes add context with one existing fetch while preserving scores, IDs, logos and legacy flags', async () => {
  const original = globalThis.fetch;
  try {
    for (const league of ['NFL','CFB']) {
      let calls=0;
      globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({season:{year:2026,type:2},week:{number:5},events:[{id:'123',date:'2026-10-13T12:00Z',season:{year:2026,type:2},week:{number:5},competitions:[{status:{type:{state:'pre',name:'STATUS_SCHEDULED',completed:false}},competitors:[{homeAway:'home',team:{id:'1',displayName:'Home',logo:'home.png'},score:'24'},{homeAway:'away',team:{id:'2',displayName:'Away',logo:'away.png'},score:'10'}]}]}]})}};
      const {GET}=await route(league);
      const response=await GET(new Request('https://hub.test/api/scoreboard?week=5'));
      const data=await response.json();
      assert.equal(calls,1);assert.equal(data.games[0].id,123);assert.equal(data.games[0].homePoints,24);assert.equal(data.games[0].awayPoints,10);
      assert.equal(data.games[0].homeLogo,'home.png');assert.equal(data.games[0].completed,false);assert.equal(data.games[0].live,false);
      assert.equal(data.games[0].context.identity,`${league}:2026:123`);assert.equal(data.season,2026);
      calls=0;assert.equal((await GET(new Request('https://hub.test/api/scoreboard?seasontype=bad'))).status,400);assert.equal(calls,0);
    }
  } finally {globalThis.fetch=original;}
});
test('A regular-season response cannot masquerade as postseason; unknown coverage stays explicit', async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>({ok:true,json:async()=>({season:{year:2026,type:2},week:{number:5},events:[]})});
    for(const league of ['NFL','CFB']){
      const {GET}=await route(league);const data=await(await GET(new Request('https://hub.test/api/scoreboard?seasontype=3'))).json();
      assert.deepEqual(data.games,[]);assert.equal(data.week,null);assert.equal(data.contextCoverage.complete,false);
      assert.ok(data.contextCoverage.limitations.some(value=>value.includes('No verified')));
    }
  }finally{globalThis.fetch=original;}
});
