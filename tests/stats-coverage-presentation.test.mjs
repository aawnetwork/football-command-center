import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const root=new URL('../',import.meta.url),file=new URL('app/preview/nfl-stats/StatsCoverage.tsx',root);
const harness={exports:{}},require=createRequire(file),styles=new Proxy({},{get:(_,key)=>key});
const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','module','exports',js)(name=>name.endsWith('.module.css')?{default:styles}:require(name),harness,harness.exports);
const {StatsCoverage,cfbPeriodLabel,cfbMetricLimitation}=harness.exports;
const fixture=()=>({period:{season:2028,week:null},throughWeek:3,liveWeek:4,scope:'retained-espn-season',rankScope:'reported-values',independentNationalCertification:false,coveredGames:95,sourceAttribution:'Retained source through the supplied cutoff',confidence:{passing_yards:{status:'reported-values',supportedPlayers:12,candidatePlayers:15,missingPlayers:2,notApplicablePlayers:1}},coverage:{warnings:['Position verification evidence is season-qualified.','Detailed missing-value methodology.']}});
const render=(data,props={})=>renderToStaticMarkup(createElement(StatsCoverage,{data,metric:'passing_yards',metricLabel:'Passing yards',category:'QB',rankingAvailable:true,snapshot:'Snapshot through supplied source time',...props}));
const visible=html=>html.split('<details')[0];
test('period labels resolve the supplied season, base and update week without hardcoded cutoffs',()=>{
 const data=fixture();assert.equal(cfbPeriodLabel(data,'season',''),'2028 Season — through Week 3 + available Week 4 updates');
 data.liveWeek=3;assert.equal(cfbPeriodLabel(data,'season',''),'2028 Season — through Week 3 · Week 3 observations refreshed');
 delete data.liveWeek;assert.equal(cfbPeriodLabel(data,'season',''),'2028 Season — through Week 3');data.period.week=12;assert.equal(cfbPeriodLabel(data,'weekly','1'),'2028 Week 12');
 delete data.throughWeek;assert.match(cfbPeriodLabel(data,'season',''),/cutoff unavailable/);assert.doesNotMatch(cfbPeriodLabel(null,'season',''),/2026|Week 7/);
});
test('compact summary keeps counts and diagnostics expandable without implying live play',()=>{
 const data=fixture(),html=render(data),brief=visible(html);assert.match(brief,/Partial coverage/);assert.doesNotMatch(brief,/12\/15|95 games|provisional|position-verified/);assert.match(brief,/reported statistics only/);assert.match(html,/12\/15 observed players/);assert.match(html,/95 games observed/);assert.match(brief,/Snapshot through supplied source time/);
 assert.doesNotMatch(brief,/Detailed missing-value methodology|Position verification evidence is season-qualified/);assert.match(html,/<summary>Coverage and methodology<\/summary>/);assert.doesNotMatch(html,/<details[^>]*\bopen/);for(const warning of data.coverage.warnings)assert.ok(html.includes(warning));assert.match(html,/2 missing values; 1 not applicable/);
});
test('unsupported selected metric and defensive interception limitation stay visible, not buried in methodology',()=>{
 const data=fixture();data.confidence.def_interceptions={status:'unverified',supportedPlayers:0,candidatePlayers:10,missingPlayers:10};
 const html=visible(render(data,{metric:'def_interceptions',metricLabel:'Defensive interceptions',category:'Def',rankingAvailable:false}));assert.match(html,/Numerical rankings are unavailable/);assert.doesNotMatch(html,/0\/10 observed defenders/);assert.match(html,/Defensive interceptions unavailable/);assert.match(html,/not zero/);
 const tackles=visible(render(data,{metric:'tackles',metricLabel:'Tackles',category:'Def'}));assert.match(tackles,/Defensive interceptions are unavailable/);
 assert.match(cfbMetricLimitation(data,'def_interceptions','Defensive interceptions'),/unavailable/);
});
test('current-week source failures, unresolved eligibility and ambiguous identities remain explicit',()=>{
 const data=fixture();data.collection={expectedGames:8,observedGames:6,missingGames:2,expectedTeamObservations:14,observedTeamObservations:10,missingCategoryTeamObservations:3,unverifiedMembershipPlayers:4,unresolvedPassers:5,validationWarnings:2,ambiguousPlayers:1};
 const html=render(data),brief=visible(html);assert.doesNotMatch(brief,/6\/8|10\/14|failed validation|conflicting player/);assert.match(html,/6\/8 started or overdue/);assert.match(html,/10\/14/);assert.match(html,/failed validation/);assert.match(html,/1 conflicting player identity is withheld/);
 assert.match(html,/5 passers have unverified positions/);assert.match(html,/4 players have unverified FBS membership/);assert.match(html,/Category data absent for 3 team observations/);
});
test('unknown coverage never becomes invented zeros or a certified national population',()=>{
 const data=fixture();delete data.confidence;delete data.coveredGames;const html=visible(render(data));assert.match(html,/Reported data/);assert.match(html,/may not include every eligible player/);assert.doesNotMatch(html,/0\/0|0 games|complete national rankings/);
 const zero=fixture();zero.confidence.passing_yards={status:'unverified',supportedPlayers:0,candidatePlayers:0,missingPlayers:0,notApplicablePlayers:0};assert.match(render(zero),/0\/0 observed players/);
});
test('actual retained CFB season response retains exact metric counts and every source warning offline',async()=>{
 const {cfbSeasonResponse}=await import(await compileLocalModule(new URL('app/lib/stats-v2/cfb-season.ts',root)));
 const data=await cfbSeasonResponse(new URLSearchParams(),'leaders','QB',null).json();const c=data.confidence.passing_yards,html=render(data);assert.ok(html.includes(`${c.supportedPlayers.toLocaleString('en-GB')}/${c.candidatePlayers.toLocaleString('en-GB')}`));
 for(const warning of data.coverage.warnings)assert.ok(html.includes(warning));assert.ok(cfbPeriodLabel(data,'season','').includes(`through Week ${data.throughWeek}`));assert.doesNotMatch(visible(html),/national leaderboard certification|season-qualified/);
});
test('shared Centre rules style only named navigation/filter groups and retain league hierarchy and keyboard focus',()=>{
 const css=readFileSync(new URL('app/features/centre/centre-navigation.css',root),'utf8'),shared=css.slice(css.indexOf('/* Shared Centre controls only:'));
 for(const group of ['.command-center__nav','.centre-secondary-nav','.stats-preview-switch','.centre-category-controls','.cc-week-strip','.standings-panel__filters'])assert.ok(shared.includes(group));
 assert.match(shared,/font-size: 13px/);assert.match(shared,/min-height: 42px/);assert.match(shared,/min-height: 38px/);assert.match(shared,/color: #fff !important/);assert.match(shared,/color: var\(--centre-control-ink\)/);assert.match(shared,/background: transparent !important/);assert.match(shared,/:focus-visible/);assert.match(shared,/@media \(max-width: 650px\)/);
 assert.doesNotMatch(shared,/\.game-card|\.cc-tier-filters|\.game-card__tier-buttons|\.deck-controls/);
 assert.match(css,/--centre-control-accent: #FFC720/);assert.match(css,/--centre-control-accent: #B94700/);
});

test('provisional wording follows actual selected live observations in both leagues',()=>{
 for(const league of ['CFB','NFL']){
  const data=fixture();data.lines=[{playingNow:true}];
  assert.match(visible(render(data,{league})),/In-progress statistics are provisional/);
  data.lines=[{playingNow:false},{playingNow:null}];
  assert.doesNotMatch(visible(render(data,{league})),/provisional|In-progress/);
  data.lines=[{playingNow:true}];
  for(const props of [{historical:true},{failed:true}])assert.doesNotMatch(visible(render(data,{league,...props})),/provisional|In-progress/);
  data.scope='reviewed-espn-week';data.period.week=7;
  assert.doesNotMatch(visible(render(data,{league})),/provisional|In-progress/);
 }
});
test('NFL source details remain accessible and unsupported ranks remain visible',()=>{
 const data=fixture(),html=render(data,{league:'NFL',rankingAvailable:false});
 assert.match(visible(html),/Numerical rankings are unavailable/);
 assert.doesNotMatch(visible(html),/Retained source|12\/15/);
 assert.match(html,/Retained source through the supplied cutoff/);
});
