import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildWeeklyIndividualLeaders } from '../app/lib/cfb-helpers.ts';

const categories = ['passing','passing-td','rushing','rushing-td','receiving','receiving-td','tackles','sacks','interceptions'];
const source = await readFile(new URL('../app/api/player-stats/route.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/import .*?from ['"]\.\.\/\.\.\/lib\/cfb-history['"];?/, 'const loadCfbPreviousHighs = async () => []; const seasonHighEligible = () => false;')
  .replace('"next/server"', JSON.stringify(import.meta.resolve('next/server.js')))
  .replace('"../../lib/gameday-status"', JSON.stringify(new URL('../app/lib/gameday-status.ts', import.meta.url).href));
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

// Render the actual table row JSX, not a parallel implementation of the badge rules.
const page = await readFile(new URL('../app/cfb/page.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let row;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'tr' && node.openingElement.attributes.getText(ast).includes('weekly-leader--playing')) row = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(row, 'actual CFB Stats row found');
const rowJs = ts.transpileModule(`export function Row({leader,selectedCategory,statsMode='weekly',statsView='individual'}) { const index=0; const tdStyle={}; return (${row}); }`, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const Row = (await import(`data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(import.meta.resolve('react'))};\nimport {formatStatValue} from ${JSON.stringify(new URL('../app/lib/cfb-helpers.ts', import.meta.url).href)};\nconst TeamLogo=({name})=>React.createElement('span',null,name);const teamLogo=()=>undefined;\n${rowJs}`).toString('base64')}`)).Row;
const render = (leader, selectedCategory, extra={}) => renderToStaticMarkup(React.createElement(Row, {leader,selectedCategory,...extra}));
const competitors = [{team:{id:'7',displayName:'Home'},homeAway:'home'}, {team:{id:'8',displayName:'Away'},homeAway:'away'}];
const statistics = [
  ...['passing','rushing','receiving'].map(name => ({name, labels:['YDS','TD'], athletes:[{athlete:{id:'1',displayName:'Player'},stats:['150','2']}]})),
  {name:'defensive',labels:['TOT','SACKS','INT'],athletes:[{athlete:{id:'1',displayName:'Player'},stats:['8','2','1']}]},
];
test('Actual CFB API → leader builder → actual row: live, final, scheduled and no-game states across all nine categories', async () => {
  const original=globalThis.fetch;
  let state='in'; let empty=false; let teamId='7';
  globalThis.fetch=async url => {
    const competition={competitors,status:{type:{state,completed:state==='post'}}};
    if (String(url).includes('/scoreboard')) return Response.json({events:empty?[]:[{id:'123',competitions:[competition]}]});
    assert.ok(String(url).includes('/summary?event=123'));
    return Response.json({header:{competitions:[competition]},boxscore:{players:[{team:{id:teamId,displayName:'Home'},statistics}]}});
  };
  try {
    const load=async()=> { const response=await GET(new Request('http://localhost/api/player-stats?week=7')); assert.equal(response.status,200); return response.json(); };
    const live=await load();
    for (const category of categories) {
      const [leader]=buildWeeklyIndividualLeaders(live,category); assert.equal(leader.playingNow,true,category);
      const html=render(leader,category); assert.match(html,/weekly-leader--playing/); assert.match(html,/PLAYING NOW/);
      for (const extra of [{statsMode:'season'},{statsView:'team'}]) assert.doesNotMatch(render(leader,category,extra),/weekly-leader--playing|PLAYING NOW/);
    }
    for (state of ['post','pre']) {
      const inactive=await load();
      for (const category of categories) {
        const [leader]=buildWeeklyIndividualLeaders(inactive,category);
        assert.equal(leader.playingNow,false); assert.doesNotMatch(render(leader,category),/weekly-leader--playing|PLAYING NOW/);
        const [previous]=buildWeeklyIndividualLeaders(live,category); assert.deepEqual(leader,{...previous,playingNow:false});
      }
    }
    state='in';teamId='99';
    for(const stat of await load()) assert.equal(stat.playingNow,false,'unknown team cannot be highlighted');
    empty=true; assert.deepEqual(await load(),[]);
    for(const category of categories) assert.deepEqual(buildWeeklyIndividualLeaders([],category),[]);
  } finally { globalThis.fetch=original; }
});
function luminance(hex) { const rgb=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722; }
function contrast(a,b) { const ls=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (ls[0]+.05)/(ls[1]+.05); }
test('Live orange text and badge meet WCAG AA normal-text contrast on the actual light colours',async()=>{
  const css=await readFile(new URL('../app/cfb/cfb-centre.css',import.meta.url),'utf8');
  for(const colour of ['#fff0df','#a64200','#fff8f0']) assert.ok(css.includes(colour));
  for(const bg of ['fff0df','fff8f0','f3f0e7']) assert.ok(contrast('a64200',bg)>=4.5);
  assert.ok(contrast('0b1f33','fff0df')>=4.5);
});
