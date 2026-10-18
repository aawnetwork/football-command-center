import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildIndividualLeaders, individualCategories, buildWeeklyIndividualLeaders } from '../app/lib/cfb-helpers.ts';

const categories = ['passing','passing-td','rushing','rushing-td','receiving','receiving-td','tackles','sacks','interceptions'];
const source = await readFile(new URL('../app/api/player-stats/route.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/import .*?from ['"]\.\.\/\.\.\/lib\/cfb-history['"];?/, 'const loadCfbPreviousHighs = async () => []; const indexCfbHistory = facts => facts; const seasonHighEligible = () => false;')
  .replace('"next/server"', JSON.stringify(import.meta.resolve('next/server.js')))
  .replace('"../../lib/cfb-player-stats-flight"', JSON.stringify(new URL('../app/lib/cfb-player-stats-flight.ts', import.meta.url).href))
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
      assert.match(render(leader,category,{statsMode:'season'}),/PLAYING NOW/);
      for (const extra of [{statsView:'team'},{statsMode:'season',statsView:'team'}]) assert.doesNotMatch(render(leader,category,extra),/weekly-leader--playing|PLAYING NOW/);
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
test('Navy text on yellow highlights and badges meet WCAG AA normal-text contrast on the actual light colours',async()=>{
  const css=await readFile(new URL('../app/command-center.css',import.meta.url),'utf8');
  for(const colour of ['#ffc720','#ffc72024','--hub-accent-on-light: var(--hub-navy)']) assert.ok(css.includes(colour));
  for(const bg of ['ffc720','fffdf7','f3f0e7']) assert.ok(contrast('0b1f33',bg)>=4.5);
  assert.ok(contrast('0b1f33','ffc720')>=4.5);
});

const seasonSource = await readFile(new URL('../app/lib/cfb-season-playing.ts', import.meta.url), 'utf8');
const seasonJs = ts.transpileModule(seasonSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace('"./team-logos"', JSON.stringify(new URL('../app/lib/team-logos.ts', import.meta.url).href));
const { withSeasonPlayingStatus } = await import(`data:text/javascript;base64,${Buffer.from(seasonJs).toString('base64')}`);
const now = Date.parse('2026-10-17T18:00:00Z');
const directory = [
  {id:'7',team:'Home Wildcats',location:'Home',shortName:'Home St.'},
  {id:'8',team:'Away Bears',location:'Away'},
];
const game = {startDate:'2026-10-17T16:00:00Z',live:true,completed:false,playingTeamIds:['7','8'],context:{verified:true,status:'live',season:2026,sourceCheckedAt:new Date(now).toISOString()}};
test('All eight season categories retain totals, order and ranks while live rows match weekly presentation', () => {
  for (const {id:category} of individualCategories) {
    const sourceCategory=category.replace(/-td$/,'');
    const statType=category.endsWith('-td')?'TD':category==='tackles'?'TACKLES':category==='sacks'?'SACKS':'YDS';
    const stats=[{id:'1',name:'Active',team:'Home',category:sourceCategory,statType,stat:200,type:'individual'},
      {id:'2',name:'Inactive',team:'Unknown',category:sourceCategory,statType,stat:300,type:'individual'}];
    const ranked=buildIndividualLeaders(stats,category);
    const decorated=withSeasonPlayingStatus(ranked,[game],directory,now);
    assert.deepEqual(decorated.map(({playingNow,...rest})=>{assert.equal(typeof playingNow,'boolean');return rest;}),ranked);
    assert.deepEqual(decorated.map(row=>row.playingNow),[false,true]);
    assert.match(render(decorated[1],category,{statsMode:'season'}),/weekly-leader--playing/);
    assert.match(render(decorated[1],category,{statsMode:'season'}),/PLAYING NOW/);
    assert.doesNotMatch(render(decorated[0],category,{statsMode:'season'}),/weekly-leader--playing|PLAYING NOW/);
    const final=withSeasonPlayingStatus(ranked,[{...game,completed:true,live:false}],directory,now);
    assert.ok(final.every(row=>!row.playingNow));
    assert.doesNotMatch(render(final[1],category,{statsMode:'season'}),/weekly-leader--playing|PLAYING NOW/);
  }
});
test('Season identity and freshness fail closed for unknown, ambiguous, stale and inactive games', () => {
  const leader={playerId:'1',player:'Player',team:'Home',value:200};
  const status=(games,teams=directory,team='Home')=>withSeasonPlayingStatus([{...leader,team}],games,teams,now)[0].playingNow;
  assert.equal(status([game]),true);
  assert.equal(status([game],directory,'Home State'),true);
  for(const games of [[],[{...game,live:false}],[{...game,completed:true}],[{...game,playingTeamIds:[]}],[{...game,startDate:'2026-10-01T00:00:00Z'}],
    ...[{status:'postponed'},{status:'scheduled'},{status:'completed'},{status:'uncertain'},{verified:false},
      {sourceCheckedAt:new Date(now-60001).toISOString()},{sourceCheckedAt:new Date(now+1).toISOString()},{sourceCheckedAt:'invalid'}]
      .map(context=>[{...game,context:{...game.context,...context}}])]) assert.equal(status(games),false);
  assert.equal(status([game],directory,'Unknown'),false);
  assert.equal(status([game],[...directory,{id:'9',team:'Other',location:'Home'}]),false);
  assert.equal(status([game],[]),false);
});

test('Actual scoreboard → season badges uses one upstream call and rejects scheduled, postponed and completed states',async()=>{
  let routeSource=await readFile(new URL('../app/api/scoreboard/route.ts',import.meta.url),'utf8');
  routeSource=routeSource.replace('"next/server"',JSON.stringify(import.meta.resolve('next/server.js')))
    .replace('"../../lib/gameday-status"',JSON.stringify(new URL('../app/lib/gameday-status.ts',import.meta.url).href))
    .replace('"../../lib/game-context"',JSON.stringify(new URL('../app/lib/game-context.ts',import.meta.url).href));
  const code=ts.transpileModule(routeSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {GET:scoreboard}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const original=globalThis.fetch;
  try {
    for(const [state,name,completed,active] of [['in','STATUS_IN_PROGRESS',false,true],['pre','STATUS_SCHEDULED',false,false],['pre','STATUS_POSTPONED',false,false],['in','STATUS_POSTPONED',false,false],['post','STATUS_FINAL',true,false],['in','STATUS_FINAL',true,false]]) {
      let calls=0;
      const current=Date.now(),date=new Date(current-3600000).toISOString(),year=new Date().getUTCFullYear();
      globalThis.fetch=async()=>{calls++;return Response.json({season:{year,type:2},week:{number:7},events:[{id:'123',date,competitions:[{competitors,status:{type:{state,name,completed}}}]}]});};
      const response=await scoreboard(new Request('http://localhost/api/scoreboard'));
      const data=await response.json();assert.equal(calls,1);
      const [leader]=withSeasonPlayingStatus([{playerId:'1',player:'Player',team:'Home',value:2000}],data.games,directory,Date.now());
      assert.equal(leader.playingNow,active,name);
      if(active)assert.match(render(leader,'passing',{statsMode:'season'}),/PLAYING NOW/);
      else assert.doesNotMatch(render(leader,'passing',{statsMode:'season'}),/PLAYING NOW/);
    }
  }finally{globalThis.fetch=original;}
});

test('Season live indicators use the same school aliases as team logos', () => {
  const teams=[
    {id:'30',team:'USC Trojans',location:'USC'},
    {id:'62',team:"Hawai'i Rainbow Warriors",location:"Hawai'i"},
    {id:'290',team:'Georgia Southern Eagles',location:'Georgia Southern'},
    {id:'23',team:'San José State Spartans',location:'San José State'},
    {id:'2199',team:'Eastern Michigan Eagles',location:'Eastern Michigan'},
  ];
  for(const [index,name] of ['Southern California','Hawaii','Ga. Southern','San Jose St.','Eastern Mich.'].entries()) {
    const ranked=[{playerId:'1',player:'Player',team:name,value:2000}];
    const live={...game,playingTeamIds:[teams[index].id]};
    assert.equal(withSeasonPlayingStatus(ranked,[live],teams,now)[0].playingNow,true,name);
    assert.equal(withSeasonPlayingStatus(ranked,[{...live,completed:true}],teams,now)[0].playingNow,false,name);
  }
});

// Exercise the real table JSX: the shared formatter alone cannot catch a UI override.
test('Season team scoring defense and offense show PPG; yardage defenses retain YPG', () => {
  const leader={playerId:'team',player:'Test Team',team:'Test Team',value:17.25};
  for(const category of ['scoring-defense','scoring-offense']) {
    const html=render(leader,category,{statsMode:'season',statsView:'team'});
    assert.match(html,/17\.3 PPG/);
    assert.doesNotMatch(html,/YPG|yards|tackles/);
  }
  for(const category of ['total-defense','rushing-defense','passing-defense']) {
    const html=render(leader,category,{statsMode:'season',statsView:'team'});
    assert.match(html,/17\.25 YPG/);
    assert.doesNotMatch(html,/PPG|tackles/);
  }
  assert.match(render(leader,'total-defense',{statsMode:'weekly',statsView:'team'}),/17\.25 tackles/);
});
