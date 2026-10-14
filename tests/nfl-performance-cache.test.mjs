import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { nflPerformanceCache } from '../app/lib/nfl-performance-cache.ts';

test('Five-minute computed cache shares concurrent work and expires without renewing on hits',async()=>{
  let clock=1_000_000,calls=0,release;
  const cache=nflPerformanceCache(async()=>{calls++;await new Promise(r=>release=r);return Response.json({season:2026,performances:[{passing_yards:calls}]});},()=>clock);
  const a=cache(),b=cache();assert.equal(calls,1);release();
  const first=await a,second=await b;assert.deepEqual(await first.json(),await second.json());
  const generated=first.headers.get('X-AAW-Performance-Generated-At');
  assert.equal(first.headers.get('Vercel-CDN-Cache-Control'),'public, s-maxage=300');
  clock+=299_000;const hit=await cache();assert.equal(calls,1);assert.equal(hit.headers.get('Vercel-CDN-Cache-Control'),'public, s-maxage=1');assert.equal(hit.headers.get('X-AAW-Performance-Generated-At'),generated);
  clock+=1000;const fresh=cache();assert.equal(calls,2);release();
  assert.equal((await(await fresh).json()).performances[0].passing_yards,2);
});
test('Failed responses and thrown failures are not cached; successful retries recover',async()=>{
  let calls=0;const cache=nflPerformanceCache(async()=>{calls++;if(calls===1)return Response.json({error:'Source failed',status:503},{status:503});if(calls===2)throw Error('Network');return Response.json({season:2026,performances:[]});});
  const failed=await cache();assert.equal(failed.status,503);assert.equal(failed.headers.get('Cache-Control'),'no-store');assert.equal(failed.headers.get('Vercel-CDN-Cache-Control'),'no-store');
  await assert.rejects(cache(),/Network/);assert.equal((await cache()).status,200);await cache();assert.equal(calls,3);
});
test('Large processed payloads do not depend on Next fetch-cache size limits',async()=>{
  let calls=0;const cache=nflPerformanceCache(async()=>{calls++;return Response.json({value:'x'.repeat(2_200_000)});});
  assert.equal((await(await cache()).json()).value.length,2_200_000);await cache();assert.equal(calls,1);
});

const compile=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const original=await readFile(new URL('../app/api/nfl/performances/route.ts',import.meta.url),'utf8');
async function route(clock){
  const key='__nflCacheClock'+Math.random().toString(36).slice(2);globalThis[key]=clock;
  const source=original.replace("import {loadNflverseSnapshot} from '../../../lib/nflverse-snapshots';",`import {createNflverseSnapshots} from ${JSON.stringify(new URL('../app/lib/nflverse-snapshots.ts',import.meta.url).href)};const loadNflverseSnapshot=createNflverseSnapshots((...args)=>fetch(...args),()=>globalThis[${JSON.stringify(key)}]());`).replace('import { NextResponse } from "next/server";','const NextResponse={json:Response.json};')
    .replace('"../../../lib/nfl-season-highs"',JSON.stringify(new URL('../app/lib/nfl-season-highs.ts',import.meta.url).href))
    .replace('import { nflPerformanceCache } from "../../../lib/nfl-performance-cache";',`import {nflPerformanceCache as makeCache} from ${JSON.stringify(new URL('../app/lib/nfl-performance-cache.ts',import.meta.url).href)};const nflPerformanceCache=load=>makeCache(load,()=>globalThis[${JSON.stringify(key)}]());`);
  return {api:await import(compile(source)),cleanup:()=>delete globalThis[key]};
}
const schedule='game_id,alt_game_id,season,game_type,week,gameday,home_team,away_team,home_score,away_score,result,total\nfirst,,2026,REG,1,2026-09-01,JAX,KC,10,24,-14,34\nsecond,,2026,REG,2,2026-09-08,KC,JAX,21,21,0,42\nthird,,2026,REG,3,2026-09-15,JAX,KC,,,,\nold,,2025,REG,1,2025-09-01,KC,JAX,0,7,-7,7\npost,,2026,POST,4,2027-01-01,KC,JAX,7,0,7,7';
const players=value=>'player_id,player_display_name,player_name,season,season_type,week,game_id,team,opponent_team,passing_yards,passing_tds,rushing_yards,rushing_tds,receiving_yards,receiving_tds,def_tackles_solo,def_tackle_assists,def_sacks\np1,"Player, One",backup,2026,REG,1,first,KC,JAC,200,2,10,0,0,0,1,2,0.5\np1,"Player, One",backup,2026,REG,2,second,KC,JAC,'+value+',3,20,1,5,0,2,3,1\np1,"Player, One",backup,2026,REG,3,third,KC,JAC,5,0,0,0,0,0,0,0,0\nold,Old,,2025,REG,1,old,KC,JAC,999,9,0,0,0,0,0,0,0\npost,Post,,2026,POST,4,post,KC,JAC,999,9,0,0,0,0,0,0,0';
test('Actual route reuses parsing/results, preserves stats/records and refreshes source data after five minutes',async()=>{
  let clock=Date.now(),calls=0,value=300;const loaded=await route(()=>clock),oldFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.cache,'no-store');return new Response(url.includes('stats_player')?players(value):schedule);};
  try{
    const [a,b]=await Promise.all([loaded.api.GET(),loaded.api.GET()]);const first=await a.json();assert.deepEqual(first,await b.json());assert.equal(calls,2);
    assert.equal(first.season,2026);assert.equal(first.performances.length,3);
    assert.deepEqual(first.performances[1],{seasonHighs:[],player_id:'p1',player_display_name:'Player, One',recent_team:'KC',opponent_team:'JAC',game_id:'second',result:'T',game_score:'T 21-21',week:2,team_record:'1-0',opponent_record:'0-1',passing_yards:300,passing_tds:3,rushing_yards:20,rushing_tds:1,receiving_yards:5,receiving_tds:0,tackles:5,sacks:1});
    assert.equal(first.performances[0].game_score,'W 24-10');assert.equal(first.performances[0].tackles,3);assert.equal(first.performances[0].sacks,0.5);
    assert.equal(first.performances[2].team_record,'1-0-1');assert.equal(first.performances[2].opponent_record,'0-1-1');assert.equal(first.performances[2].game_score,'');
    value=400;clock+=299_000;assert.equal((await(await loaded.api.GET()).json()).performances[1].passing_yards,300);assert.equal(calls,2);
    clock+=1000;assert.equal((await(await loaded.api.GET()).json()).performances[1].passing_yards,400);assert.equal(calls,4);
  }finally{globalThis.fetch=oldFetch;loaded.cleanup();}
});
test('Actual route preserves source error shape/status without poisoning the result cache',async()=>{
  const loaded=await route(Date.now),oldFetch=globalThis.fetch;let fail=true;
  globalThis.fetch=async url=>fail&&url.includes('stats_player')?new Response('',{status:503}):new Response(url.includes('stats_player')?players(300):schedule);
  try{const r=await loaded.api.GET();assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'NFL 2026 performance data request failed.',status:503});fail=false;assert.equal((await loaded.api.GET()).status,200);}
  finally{globalThis.fetch=oldFetch;loaded.cleanup();}
});

test('performance/CDN expiry never extends an already-aged source snapshot',async()=>{let clock=1000000,calls=0;const cached=nflPerformanceCache(async()=>{calls++;return Response.json({ok:true},{headers:{'X-AAW-Snapshot-Expires-At':String(clock+10000)}})},()=>clock);const first=await cached();assert.equal(first.headers.get('Vercel-CDN-Cache-Control'),'public, s-maxage=10');assert.equal(first.headers.has('X-AAW-Snapshot-Expires-At'),false);clock+=9000;await cached();assert.equal(calls,1);clock+=1000;await cached();assert.equal(calls,2)});
