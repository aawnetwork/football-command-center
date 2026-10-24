import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const {addSelected,moveSelected,reconcileSelected,selectionIssue,collectionIssue}=await import(await compileLocalModule(new URL('../app/features/exports/multi-game-selection.ts',import.meta.url)));
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/multi-game-publishing.json',import.meta.url)));
const pre=fixtures.pregame.CFB,finals=fixtures.finals.CFB;
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),cache=new Map();
function load(file){if(cache.has(file))return cache.get(file).exports;const unit={exports:{}};cache.set(file,unit);const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>{if(!name.startsWith('.'))return require(name);const base=path.resolve(path.dirname(file),name);if(name.endsWith('.json'))return {default:require(base)};return load(existsSync(base+'.ts')?base+'.ts':base+'.tsx');},unit,unit.exports);return unit.exports;}
const {MultiGameGraphic}=load(path.join(root,'app/features/exports/MultiGameGraphic.tsx'));
test('add in editorial order, reject duplicates/fifth game, move both directions and remove',()=>{
 let rows=[];for(const i of [3,0,2])rows=addSelected(rows,pre[i],'8');
 assert.deepEqual(rows.map(r=>r.game.id),[pre[3].id,pre[0].id,pre[2].id]);
 assert.equal(addSelected(rows,pre[0],'8'),rows);
 rows=moveSelected(rows,2,-1);assert.deepEqual(rows.map(r=>r.game.id),[pre[3].id,pre[2].id,pre[0].id]);
 rows=moveSelected(rows,0,1);assert.equal(rows[1].game.id,pre[3].id);assert.equal(moveSelected(rows,0,-1),rows);
 rows=rows.filter((_,i)=>i!==1);assert.equal(rows.length,2);
 rows=addSelected(addSelected(rows,pre[1],'8'),pre[3],'8');assert.equal(rows.length,4);assert.equal(addSelected(rows,{...pre[0],id:'fifth'},'9'),rows);
});
test('refreshes preserve exact editorial order, accept final transitions/corrections, withhold missing/failed observations',()=>{
 let rows=[3,0,1].map(i=>({game:pre[i],week:'8',availability:'verified'}));
 const changed=pre.map(g=>({...g,stage:'final',away:{...g.away,score:17},home:{...g.home,score:10}}));
 rows=reconcileSelected(rows,new Map([['8',changed]]));assert.deepEqual(rows.map(r=>r.game.id),[pre[3].id,pre[0].id,pre[1].id]);
 assert.equal(collectionIssue(rows,'final'),null);assert.match(collectionIssue(rows,'pregame'),/marked games/);
 rows=reconcileSelected(rows,new Map([['8',null]]));assert.ok(rows.every(r=>r.availability==='refresh-failed'));assert.equal(rows[0].game.away.score,17);
 rows=reconcileSelected(rows,new Map([['8',changed.slice(0,2)]]));assert.equal(rows[0].availability,'missing');assert.equal(rows.length,3);assert.match(collectionIssue(rows,'final'),/not be exported partially/);
});
test('mode changes retain collection; live games, missing scores, mixed leagues and duplicate identities cannot publish',()=>{
 const rows=pre.slice(0,2).map(game=>({game,week:'8',availability:'verified'}));assert.equal(collectionIssue(rows,'pregame'),null);assert.ok(collectionIssue(rows,'final'));
 assert.match(selectionIssue({...rows[0],game:{...rows[0].game,stage:'live'}},'final'),/Live/);
 assert.match(selectionIssue({...rows[0],game:{...rows[0].game,stage:'final',away:{...rows[0].game.away,score:null}}},'final'),/scores unavailable/);
 assert.match(collectionIssue([rows[0],rows[0]],'pregame'),/duplicate/);
 assert.match(collectionIssue([rows[0],{...rows[1],game:{...rows[1].game,league:'NFL'}}],'pregame'),/one league/);
});
test('Current Week selections can be recovered from their fixed week without changing order',()=>{
 const rows=pre.slice(0,2).map(game=>({game,week:'',availability:'verified'}));
 const next=reconcileSelected(rows,new Map([['',[]],['8',pre]]));assert.deepEqual(next.map(r=>r.game.id),rows.map(r=>r.game.id));assert.ok(next.every(r=>r.week==='8'&&r.availability==='verified'));
});
for(const mode of ['pregame','final'])for(const [league,count] of [['NFL',2],['CFB',3],['CFB',4]])test(`${mode} ${league} ${count}: source-backed content and exact collection order`,()=>{
 const games=(mode==='pregame'?fixtures.pregame:fixtures.finals)[league].slice(0,count).reverse();
 const html=renderToStaticMarkup(createElement(MultiGameGraphic,{games,mode}));
 const ids=[...html.matchAll(/data-game-id="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(ids,games.map(g=>g.id));
 assert.equal((html.match(/multi-graphic__game"/g)??[]).length,count);assert.match(html,/aaw-network-wordmark/);assert.doesNotMatch(html,/undefined|NaN|Tennessee win|tier-/);
 if(mode==='pregame'){assert.match(html,/Weekend Watchlist/);assert.match(html,/dateTime=/);assert.doesNotMatch(html,/multi-graphic__scores|0–0|0–0/);}
 else{assert.match(html,/Results Roundup/);assert.match(html,/FINAL/);assert.doesNotMatch(html,/WATCH ·|dateTime=/);for(const game of games)assert.ok(html.includes(`>${game.away.score}</strong>`));}
});
test('real overtime, neutral conventions, unknown records and zero scores remain accurate',()=>{
 let html=renderToStaticMarkup(createElement(MultiGameGraphic,{games:finals,mode:'final'}));assert.match(html,/FINAL \/ 2OT/);
 const games=pre.slice(0,2).map(g=>({...g,neutral:true,away:{...g.away,record:null}}));html=renderToStaticMarkup(createElement(MultiGameGraphic,{games,mode:'pregame'}));assert.match(html,/multi-graphic__versus">vs</);assert.doesNotMatch(html,/>null</);
});
test('verified corrections replace prior scores and do not append or reorder games',()=>{
 const rows=finals.slice(0,2).map(game=>({game,week:'7',availability:'verified'}));
 const correction=structuredClone(rows[0].game);correction.away.score=0;
 const next=reconcileSelected(rows,new Map([['7',[correction,rows[1].game]]]));assert.equal(next.length,2);assert.equal(next[0].game.away.score,0);assert.equal(next[1].game.id,rows[1].game.id);
});
test('three-digit final scores receive a bounded treatment without changing their values',()=>{
 const games=structuredClone(finals.slice(0,2));games[0].away.score=100;games[0].home.score=0;
 const html=renderToStaticMarkup(createElement(MultiGameGraphic,{games,mode:'final'}));assert.match(html,/multi-graphic__scores--wide/);assert.match(html,/>100<\/strong>/);assert.match(html,/>0<\/strong>/);
});
test('Results Roundup retains source-reported CFB rankings and total records beside unchanged final scores',()=>{
 const games=fixtures.finals.CFB.slice(0,2);
 const html=renderToStaticMarkup(createElement(MultiGameGraphic,{games,mode:'final'}));
 assert.match(html,/>#20<\/b>/);assert.match(html,/>#12<\/b>/);assert.match(html,/>3-1<\/span>/);assert.match(html,/>4-1<\/span>/);
 assert.match(html,/>41<\/strong>/);assert.match(html,/>27<\/strong>/);
 const unknown=structuredClone(games);unknown[0].away.rank=null;unknown[0].away.record=null;
 const missing=renderToStaticMarkup(createElement(MultiGameGraphic,{games:unknown,mode:'final'}));assert.doesNotMatch(missing,/>#20<\/b>|>3-1<\/span>/);
});
test('multi-game heading has a stable bundled font and cannot wrap into the first matchup',()=>{
 const css=readFileSync(path.join(root,'app/features/exports/multi-game.css'),'utf8');
 assert.match(css,/@font-face[^}]*font-family:aaw-export-heading[^}]*aaw-export-heading\.woff2/);
 assert.match(css,/multi-graphic__header > div \{ flex:1; min-width:0/);
 assert.match(css,/multi-graphic \.multi-graphic__header h2[^}]*font-family:aaw-export-heading[^}]*white-space:nowrap/);
 const font=readFileSync(path.join(root,'public/exports/aaw-export-heading.woff2'));assert.equal(font.toString('ascii',0,4),'wOF2');assert.ok(font.length>1000);
});
