import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function load(path,stubs={}){
 const module={exports:{}},require=createRequire(new URL('../'+path,import.meta.url));
 const js=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',js)(name=>name in stubs?stubs[name]:require(name),module,module.exports);
 return module.exports;
}
function elements(node,type){
 if(Array.isArray(node))return node.flatMap(child=>elements(child,type));
 if(!node||typeof node!=='object')return [];
 return [...(node.type===type?[node]:[]),...elements(node.props?.children,type)];
}
const html=node=>renderToStaticMarkup(node);
test('performance categories retain their selected state and selection callbacks',()=>{
 const {PerformancePositionControls}=load('app/features/performances/PerformancePositionControls.tsx');
 let selected='qb';const tree=PerformancePositionControls({value:selected,onChange:value=>selected=value});
 assert.match(html(tree),/aria-label="Performance categories"/);
 const buttons=elements(tree,'button');assert.deepEqual(buttons.map(b=>b.props.children),['All','QB','RB','REC','DEF']);
 assert.equal(buttons[1].props['aria-pressed'],true);buttons[4].props.onClick();assert.equal(selected,'def');
});
test('both All-Time views separate holder navigation from periods and preserve supported period transitions',()=>{
 for(const league of ['Nfl','Cfb']){
  const lower=league.toLowerCase();
  const hooks={useState:()=>[{},()=>{}],useEffect(){}};
  const data={...load(`app/${lower}/data/${lower}-all-time-career.ts`),...load(`app/${lower}/data/${lower}-all-time-${league==='Nfl'?'team':'program'}.ts`)};
  const Panel=load(`app/features/all-time/${league}AllTimePanel.tsx`,{'react':hooks,[`../../${lower}/data/${lower}-all-time-career`]:data,[`../../${lower}/data/${lower}-all-time-${league==='Nfl'?'team':'program'}`]:data,'./AllTimeRecordGrid':{AllTimeRecordGrid:()=>null},'./AllTimeSources':{AllTimeSources:()=>null,recordSourceLabel:()=>''},'../../lib/all-time-records':load('app/lib/all-time-records.ts')})[league+'AllTimePanel'];
  let view='individual',period='single-game';const props=()=>({view,period,onViewChange:v=>view=v,onPeriodChange:p=>period=p});
  const tree=Panel(props()),markup=html(tree);
  assert.ok(markup.indexOf('Record holders')<markup.indexOf('<h2>'));
  assert.ok(markup.indexOf('<h2>')<markup.indexOf('Record period'));
  const buttons=elements(tree,'button');assert.deepEqual(buttons.map(b=>b.props.children),['Individual','Team','Career','Season','Single Game']);
  buttons[1].props.onClick();assert.equal(view,'team');assert.equal(period,'career');
  const team=Panel(props());assert.deepEqual(elements(team,'button').map(b=>b.props.children),['Individual','Team','All-Time','Single Season · Unavailable']);
  assert.equal(elements(team,'button')[3].props.disabled,true);assert.equal(elements(team,'button')[3].props.onClick,undefined);assert.equal(period,'career');
 }
});
test('Standings secondary navigation, conference filters and league-specific modes remain functional',()=>{
 for(const sport of ['CFB','NFL']){
  const team={team:'Example',abbreviation:'EX',logo:null,overall:'5-1',conference:'3-0',division:'2-0',winPct:'.833',streak:'W2',seed:'1'};
  const state=[2026,[{name:sport==='CFB'?'ACC':'AFC East',conference:sport==='CFB'?'ACC':'AFC',teams:[team]}],'All','conferences','divisions',true,false,null];let index=0;
  const react={useState:()=>{const i=index++;return[state[i],v=>state[i]=v];},useEffect(){},useMemo:fn=>fn()};
  const {StandingsPanel}=load('app/features/standings/StandingsPanel.tsx',{'react':react,'./CfbRankings':{CfbRankings:()=>createElement('p',null,'Rankings fixture')}});
  const render=()=>{index=0;return StandingsPanel({sport});};
  const tree=render(),markup=html(tree);assert.ok(markup.indexOf('centre-secondary-nav')<markup.indexOf('<h2>Standings'));
  assert.match(markup,/Example/);
  const buttons=elements(tree,'button');
  if(sport==='CFB'){
   assert.deepEqual(buttons.map(b=>b.props.children),['Conferences','Rankings']);
   buttons[1].props.onClick();assert.match(html(render()),/Rankings fixture/);
   buttons[0].props.onClick();state[2]='Unknown';assert.doesNotMatch(html(render()),/>Example</);state[2]='ACC';assert.match(html(render()),/Example/);
  }else{
   assert.deepEqual(buttons.map(b=>b.props.children),['Divisions','Playoff Picture']);buttons[1].props.onClick();assert.match(html(render()),/AFC Playoff Picture/);
   state[5]=false;assert.doesNotMatch(html(render()),/>Playoff Picture<\/button>/);
  }
 }
});
test('both Centres retain all five sections, game tools and category-before-week hierarchy',()=>{
 for(const league of ['nfl','cfb']){
  const page=read(`app/${league}/page.tsx`),nav=league==='nfl'?read('app/features/nfl/NflCentreLayout.tsx'):page.slice(page.indexOf('aria-label="CFB sections"'));
  assert.deepEqual([...nav.matchAll(/\["(games|performances|stats|standings|all-time)",\s*"[^"]+"\]/g)].map(m=>m[1]),['games','performances','stats','standings','all-time']);
  const performances=page.slice(page.indexOf('{activeTab === "performances" && ('));
  assert.ok(performances.indexOf('<PerformancePositionControls')<performances.indexOf('aria-label="Performance week"'));
  assert.match(page,/centre-section-header/);assert.match(page,/cc-tier-filters/);assert.match(page,league==='cfb'?/DeckControls/:/NflGamesGrid/);
 }
});
