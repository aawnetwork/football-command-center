import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = await readFile(new URL('../app/features/stats/StatsLeaderboardTable.tsx',import.meta.url),'utf8');
const js = ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  .replace(/import .*?from "..\/..\/components\/TeamLogo";/,'const TeamLogo=({name})=>React.createElement("span",null,name);');
const {StatsLeaderboardTable}=await import(`data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(import.meta.resolve('react'))};\n${js}`).toString('base64')}`);

test('NFL actual shared table distinguishes live players and returns final/unknown/team rows to normal',()=>{
  const row={id:'1',name:'Player',team:'Team',value:'150 yards',playingNow:true};
  const render=(rows,showTeam=true)=>renderToStaticMarkup(React.createElement(StatsLeaderboardTable,{title:'Weekly leaders',subtitle:'Test provider data',rows,showTeam}));
  assert.match(render([row]),/weekly-leader--playing/);
  assert.match(render([row]),/PLAYING NOW/);
  for(const playingNow of [false,undefined]) {
    const html=render([{...row,playingNow}]);
    assert.doesNotMatch(html,/weekly-leader--playing|PLAYING NOW/);
    assert.match(html,/150 yards/);
  }
  assert.doesNotMatch(render([row],false),/weekly-leader--playing|PLAYING NOW/);
  assert.doesNotMatch(render([]),/weekly-leader--playing|PLAYING NOW/);
});
test('NFL cream live-player CSS matches approved CFB contrast treatment without touching its detection',async()=>{
  const nfl=await readFile(new URL('../app/nfl/nfl-centre.css',import.meta.url),'utf8');
  const cfb=await readFile(new URL('../app/cfb/cfb-centre.css',import.meta.url),'utf8');
  const block=css=>css.match(/\.command-center--(?:nfl|cfb) tr\.weekly-leader--playing > td \{[\s\S]*?white-space: nowrap;\n\}/)[0].replaceAll('--cfb','--league').replaceAll('--nfl','--league');
  assert.equal(block(nfl),block(cfb));
});
