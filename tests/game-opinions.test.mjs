import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {weeklyRows,weeklySnapshot,sortOpinionRows,opinionSpread,leadingTier,loadOpinionSeason} from '../app/features/audience/game-opinions-model.ts';
const sample=tiers=>({count:Object.values(tiers).reduce((a,b)=>a+b,0),tiers});
const votes=(id,tiers,extra={})=>({league:'NFL',season:2026,eventId:String(id),gameId:`NFL:2026:${id}`,samples:{current:sample(tiers)},...extra});
const game=(id,week=6,extra={})=>({id,homeTeam:'Home '+id,awayTeam:'Away '+id,homeLogo:'https://a.espncdn.com/home.png',awayLogo:'https://a.espncdn.com/away.png',context:{verified:true,league:'NFL',season:2026,identity:`NFL:2026:${id}`,regularWeek:week,seasonType:'regular',status:'completed',kickoffAt:`2026-10-${10+id}T17:00:00Z`,...extra}});
const single={S:1,A:0,B:0,C:0,D:0},twentyFive={S:20,A:5,B:0,C:0,D:0},split={S:15,A:0,B:0,C:0,D:15};
test('Week joins preserve zero-rated games and isolate exact league, season and verified event identity',()=>{
 const schedule=[game(1),game(2),game(3,7),game(4,6,{verified:false}),game(5,6,{season:2025}),game(6,6,{league:'CFB'}),game(1)];
 const source=[votes(1,twentyFive),votes(2,single,{league:'CFB',gameId:'CFB:2026:2'}),votes(7,split)];
 const rows=weeklyRows(schedule,source,'NFL',2026,6);
 assert.equal(rows.length,2);assert.equal(rows[0].opinion.samples.current.count,25);assert.equal(rows[1].opinion,undefined);
 assert.equal(weeklyRows([game(1,6,{seasonType:'postseason',regularWeek:null})],source,'NFL',2026,'postseason').length,1);
 assert.equal(weeklyRows([game(1,6,{seasonType:'postseason'})],source,'NFL',2026,6).length,0);
});
test('Highlights require 25 ratings; no leading tier or divisive claim for one vote; ties stay honest',()=>{
 const small=weeklyRows([game(1)],[votes(1,single)],'NFL',2026,6),summary=weeklySnapshot(small);
 assert.equal(summary.s,null);assert.equal(summary.rated,null);assert.equal(leadingTier(sample(single)),null);assert.equal(opinionSpread(sample(single)),null);
 assert.equal(leadingTier(sample(twentyFive)),'S');assert.equal(leadingTier(sample(split)),null);
 assert.equal(opinionSpread(sample(split)),2);
 const rows=weeklyRows([game(1),game(2),game(3)],[votes(1,twentyFive),votes(2,split),votes(3,twentyFive)],'NFL',2026,6);
 const stats=weeklySnapshot(rows);assert.equal(stats.s.ties,2);assert.equal(stats.divisive.row.id,'NFL:2026:2');assert.equal(stats.rated.value,30);
 assert.equal(stats.total,80);assert.equal(stats.games,3);assert.equal(stats.browserMinimum,30);assert.equal(stats.browserMaximum,80);
});
test('Sorting is deterministic, leaves inputs untouched and does not rank small samples as divisive',()=>{
 const rows=weeklyRows([game(3),game(1),game(2)],[votes(3,single),votes(1,twentyFive),votes(2,split)],'NFL',2026,6);
 assert.equal(sortOpinionRows(rows,'kickoff')[0].id,'NFL:2026:1');assert.equal(sortOpinionRows(rows,'rated')[0].id,'NFL:2026:2');
 assert.equal(sortOpinionRows(rows,'s')[0].id,'NFL:2026:1');assert.equal(sortOpinionRows(rows,'divisive')[0].id,'NFL:2026:2');assert.equal(rows[0].id,'NFL:2026:3');
});
test('Report pagination reads every existing page; failed, shifting or duplicate pages never become zero/partial weekly totals',async()=>{
 const items=Array.from({length:12},(_,i)=>votes(i+1,single)),offsets=[];
 const loaded=await loadOpinionSeason('NFL',2026,async offset=>{offsets.push(offset);return {games:items.slice(offset,offset+10),gameTotal:12};});
 assert.deepEqual(offsets,[0,10]);assert.equal(loaded.length,12);
 await assert.rejects(()=>loadOpinionSeason('NFL',2026,async()=>{throw Error('Unavailable');}),/Unavailable/);
 await assert.rejects(()=>loadOpinionSeason('NFL',2026,async offset=>({games:items.slice(0,10),gameTotal:offset?11:12})),/changed/);
 await assert.rejects(()=>loadOpinionSeason('NFL',2026,async()=>({games:items.slice(0,10),gameTotal:12})),/changed/);
 assert.deepEqual(await loadOpinionSeason('CFB',2026,async()=>({games:[],gameTotal:0})),[]);
});
const file=p=>new URL('../'+p,import.meta.url).href;
const source=await readFile(new URL('../app/features/audience/GameOpinions.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source.replace("'../../lib/audience-report'",JSON.stringify(file('app/lib/audience-report.ts'))).replace("'./game-opinions-model'",JSON.stringify(file('app/features/audience/game-opinions-model.ts'))),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace('"react/jsx-runtime"',JSON.stringify(file('node_modules/react/jsx-runtime.js'))).replace("'react'",JSON.stringify(file('node_modules/react/index.js')));
const {OpinionSnapshot,OpinionDetails,OpinionDistribution}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
test('Compact summaries and details expose accurate phase counts, percentages and secondary identity without summing phases',()=>{
 const opinion=votes(1,twentyFive,{samples:{current:sample(twentyFive),pregame:sample(single),live:sample(split)}});
 const row={id:opinion.gameId,opinion,game:game(1)};
 const html=renderToStaticMarkup(React.createElement(OpinionDetails,{row}));
 assert.match(html,/Pregame/);assert.match(html,/Postgame/);assert.match(html,/80.0%/);assert.match(html,/0 ratings/);assert.match(html,/Technical identity/);assert.match(html,/not necessarily the same respondents/);
 const snapshot=renderToStaticMarkup(React.createElement(OpinionSnapshot,{rows:[row]}));assert.match(snapshot,/Away 1 @ Home 1/);assert.match(snapshot,/25/);assert.match(snapshot,/range/);
 const empty=renderToStaticMarkup(React.createElement(OpinionDistribution,{}));assert.match(empty,/No ratings/);assert.doesNotMatch(empty,/NaN|Infinity/);
});
test('The UI only reads existing endpoints; manual refresh, abort cleanup, small schedule cache and no audience writes',()=>{
 assert.match(source,/\/api\/admin\/audience\/report/);assert.match(source,/\/api\/nfl\/scoreboard/);assert.match(source,/controller.abort/);assert.match(source,/300_000/);
 assert.doesNotMatch(source,/setInterval|method:\s*['"](?:POST|PUT|DELETE)|participant_id|token_hash/);
});
test('Weekly table renders matchups, logos, UK times and expanded phase details',async()=>{
 const injected=compiled.replace('useState }','useState as realUseState }').replace(/(from [^;]+;)/,'$1\nconst useState = initial => globalThis.__opinionStates?.length ? [globalThis.__opinionStates.shift(),()=>{}] : realUseState(initial);');
 const {default:Fixture}=await import(`data:text/javascript;base64,${Buffer.from(injected).toString('base64')}`);
 globalThis.__opinionStates=['NFL',2026,'6','kickoff',[votes(1,twentyFive)],[game(1),game(2)],6,false,false,'','',0,'NFL:2026:1'];
 try{
  const html=renderToStaticMarkup(React.createElement(Fixture,{initialSeason:2026,seasons:[2026]}));
  assert.match(html,/Weekly game opinions/);assert.match(html,/Away 1/);assert.match(html,/Home 2/);
  assert.equal((html.match(/class="opinions-logo"/g)||[]).length,4);
  assert.match(html,/18:00 UK/);assert.match(html,/aria-expanded="true"/);assert.match(html,/Pregame/);assert.match(html,/Postgame/);
  assert.ok(html.indexOf('opinions-snapshot')<html.indexOf('opinions-table'));assert.match(html,/No ratings/);
 }finally{delete globalThis.__opinionStates;}
});
