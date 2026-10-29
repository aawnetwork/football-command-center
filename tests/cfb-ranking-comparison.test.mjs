import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { comparisonWeek, comparisonSnapshots, comparisonSource, comparisonPoll, latestPollWeek, parsePollWeek, pollWeekKey, pollWeekOptions, pollWeekButtonLabel, pollLabel, selectedPoll, pollMovement } from '../app/features/standings/poll-model.ts';
import { mapEntries, recoverPreviousRanks } from '../app/lib/cfb-polls.ts';
const file=p=>new URL('../'+p,import.meta.url).href;
const compile=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace('"react/jsx-runtime"',JSON.stringify(file('node_modules/react/jsx-runtime.js')))).toString('base64')}`;
const {pollTeamLogo}=await import(compile((await readFile(new URL('../app/features/standings/poll-team.ts',import.meta.url),'utf8')).replace('"../../lib/team-logos"',JSON.stringify(file('app/lib/team-logos.ts')))));
const meta=(kind,week,phase='regular',season=2026)=>({id:`${kind}-${season}-${phase}-${week}`,kind,week,phase,season,source:kind==='uki'?'The Touchdown':'ESPN',publishedAt:null,capturedAt:'2026-10-01T00:00:00Z',revision:1});
const entry=(rank,overrides={})=>({rank,previousRank:rank,previousRankStatus:'ranked',team:'Team '+rank,abbreviation:'T'+rank,logo:null,record:'8-0',points:999,firstPlaceVotes:4,...overrides});
const poll=(kind,week)=>({...meta(kind,week),available:true,entries:Array.from({length:25},(_,i)=>entry(i+1,{team:kind.toUpperCase()+' School '+(i+1)}))});
test('Preseason and regular archive weeks have distinct visible and accessible labels',()=>{
  const snapshots=[meta('ap',0,'preseason'),meta('uki',1,'preseason'),meta('uki',0),meta('ap',2)];
  const weeks=pollWeekOptions(snapshots,2026);
  assert.deepEqual(weeks.map(pollWeekButtonLabel),['Preseason','Preseason','W0','W1','W2']);
  assert.equal(new Set(weeks.map(w=>pollLabel({...w,kind:'ap'}))).size,weeks.length);
  assert.equal(selectedPoll({...poll('ap',0),phase:'preseason'},'ap',parsePollWeek('2026:regular:0')),null);
  assert.equal(pollWeekButtonLabel(meta('cfp',1,'postseason')),'Post W1');
});
test('Shared football weeks align AP W7 with UKI W6 and collapse preseason and legacy W0 aliases',()=>{
  const catalog=[meta('ap',0,'preseason'),meta('uki',0,'preseason'),meta('uki',1,'preseason'),meta('uki',0),meta('uki',1),meta('uki',6),meta('ap',7)];
  const options=pollWeekOptions(comparisonSnapshots(catalog),2026);
  assert.deepEqual(options.map(pollWeekButtonLabel),['Preseason','W1','W2','W3','W4','W5','W6']);
  assert.equal(comparisonSource(catalog,'ap',parsePollWeek('2026:regular:6')).week,7);
  assert.equal(comparisonSource(catalog,'uki',parsePollWeek('2026:regular:6')).week,6);
  assert.equal(comparisonSource(catalog,'uki',parsePollWeek('2026:regular:1')).week,1);
  assert.equal(comparisonSource(catalog,'uki',parsePollWeek('2026:preseason:0')).week,0);
  assert.equal(comparisonWeek(meta('cfp',7)),null);
  assert.equal(comparisonPoll(poll('ap',7),'ap',parsePollWeek('2026:regular:6'),catalog)?.week,7);
  assert.equal(comparisonPoll(poll('ap',6),'ap',parsePollWeek('2026:regular:6'),catalog),null);
  assert.equal(comparisonSource(catalog,'ap',parsePollWeek('2026:regular:5')),undefined);
});
test('Shared default uses archived native weeks and season context, not dates or a calendar-week offset',()=>{
  const snapshots=[meta('ap',7),{...meta('uki',4),publishedAt:'2099-01-01'},meta('ap',2,'regular',2025),meta('cfp',1,'postseason',2025)];
  assert.deepEqual(latestPollWeek(snapshots,2026),{season:2026,phase:'regular',week:7});
  assert.equal(latestPollWeek(snapshots,2025).phase,'postseason');
  assert.equal(latestPollWeek(snapshots,2027),null);
  assert.equal(selectedPoll(poll('uki',4),'uki',latestPollWeek(snapshots,2026)),null);
});
test('Week selection preserves gaps, history and separate preseason/postseason identities',()=>{
  const snapshots=[meta('ap',0,'preseason'),meta('ap',2),meta('uki',4),meta('cfp',1,'postseason')];
  assert.deepEqual(pollWeekOptions(snapshots,2026).map(pollWeekKey),['2026:preseason:0','2026:regular:1','2026:regular:2','2026:regular:3','2026:regular:4','2026:postseason:1']);
  assert.equal(selectedPoll(poll('ap',4),'ap',parsePollWeek('2026:regular:1')),null);
  assert.equal(selectedPoll(poll('ap',4),'uki',parsePollWeek('2026:regular:4')),null);
  for(const bad of ['2026:regular:31','2026:bad:4','2026:regular:-1','x'])assert.equal(parsePollWeek(bad),null);
});
test('Movement uses the supplied previous poll rank; NEW and missing history are not conflated',()=>{
  assert.equal(pollMovement(entry(4,{previousRank:7})).text,'↑ 3');
  assert.equal(pollMovement(entry(8,{previousRank:6})).text,'↓ 2');
  assert.equal(pollMovement(entry(5)).text,'—');
  assert.equal(pollMovement(entry(25,{previousRankStatus:'unranked',previousRank:null})).text,'NEW');
  assert.equal(pollMovement(entry(25,{previousRank:28})).text,'NEW');
  assert.match(pollMovement(entry(5,{previousRankStatus:'unknown',previousRank:null})).label,/unavailable/);
});
test('Existing archive contract preserves stable IDs and points-free UKI rows, including legacy rows',()=>{
  const saved=mapEntries({entries:[{rank:1,previous_rank:0,team_id:'61',team_name:'Georgia',team_abbreviation:'UGA',team_logo_url:null,record:'6-0'}]});
  assert.equal(saved[0].teamId,'61');assert.equal(saved[0].points,null);assert.equal(saved[0].firstPlaceVotes,null);assert.equal(pollMovement(saved[0]).text,'NEW');
  assert.equal(mapEntries({entries:[{rank:1,previous_rank:null,team_name:'Legacy',team_abbreviation:null,team_logo_url:null} ]})[0].teamId,null);
});
test('Complete previous archived poll recovers genuine NEW; partial or ambiguous history never invents movement',()=>{
  const previous=Array.from({length:25},(_,i)=>entry(i+1,{teamId:String(i+1)}));
  const unknown=entry(12,{teamId:'4',previousRank:null,previousRankStatus:'unknown'});
  assert.equal(recoverPreviousRanks([unknown],previous)[0].previousRank,4);
  const newcomer={...unknown,teamId:'99',team:'New school'};
  assert.equal(recoverPreviousRanks([newcomer],previous)[0].previousRankStatus,'unranked');
  assert.equal(recoverPreviousRanks([newcomer],previous.slice(0,24))[0].previousRankStatus,'unknown');
  assert.equal(recoverPreviousRanks([newcomer],[...previous,previous[0]])[0].previousRankStatus,'unknown');
  assert.equal(recoverPreviousRanks([{...unknown,previousRankStatus:'ranked',previousRank:7}],previous)[0].previousRank,7);
});
test('Logos prefer stable identity; UNC/Pitt aliases resolve exactly and unknown schools remain graceful',()=>{
  const teams=[{id:'153',team:'North Carolina Tar Heels',location:'North Carolina',abbreviation:'UNC',logo:'unc.png'},{id:'221',team:'Pittsburgh Panthers',location:'Pittsburgh',shortName:'Pitt',abbreviation:'PITT',logo:'pitt.png'}];
  assert.equal(pollTeamLogo(entry(1,{teamId:'153',team:'Other spelling'}),teams),'unc.png');
  assert.equal(pollTeamLogo(entry(1,{team:'UNC'}),teams),'unc.png');
  assert.equal(pollTeamLogo(entry(1,{team:'North Carolina'}),teams),'unc.png');
  assert.equal(pollTeamLogo(entry(1,{team:'Pitt'}),teams),'pitt.png');
  assert.equal(pollTeamLogo(entry(1,{teamId:'999',team:'UNC'}),teams),undefined);
  assert.equal(pollTeamLogo(entry(1,{team:'Unknown School'}),teams),undefined);
  assert.equal(pollTeamLogo(entry(1,{team:'Miami (Fl)'}),[{team:'Miami Hurricanes',logo:'miami-fl.png'},{team:'Miami (OH) RedHawks',logo:'miami-oh.png'}]),'miami-fl.png');
});

let componentSource=await readFile(new URL('../app/features/standings/CfbRankings.tsx',import.meta.url),'utf8');
componentSource=componentSource.replace('import { useEffect, useMemo, useState } from "react";','const useEffect=()=>{};const useMemo=f=>f();const useState=initial=>[globalThis.__pollRenderStates.length?globalThis.__pollRenderStates.shift():initial,()=>{}];')
  .replace('"./poll-model"',JSON.stringify(file('app/features/standings/poll-model.ts')))
  .replace('"./poll-team"',JSON.stringify(compile((await readFile(new URL('../app/features/standings/poll-team.ts',import.meta.url),'utf8')).replace('"../../lib/team-logos"',JSON.stringify(file('app/lib/team-logos.ts'))))));
const {CfbRankings}=await import(compile(componentSource));
test('Three-card render contains each source’s 25 ordered teams, compact columns and a truthful CFP empty state',()=>{
  const ap=poll('ap',5),uki=poll('uki',4),catalog=[meta('ap',5),meta('uki',4)];
  ap.entries.reverse();globalThis.__pollRenderStates=['2026:regular:4',{ap:{kind:'ap',poll:ap},uki:{kind:'uki',poll:uki},cfp:{kind:'cfp',poll:null}},catalog,{},false];
  const html=renderToStaticMarkup(React.createElement(CfbRankings,{teams:[],season:2026}));
  assert.equal((html.match(/class="cfb-polls__card"/g)||[]).length,3);assert.equal((html.match(/<li /g)||[]).length,50);
  assert.ok(html.indexOf('AP School 1<')<html.indexOf('AP School 25<'));assert.ok(html.indexOf('AP Top 25')<html.indexOf('UK &amp; Ireland Top 25'));
  assert.match(html,/Source: week 4 - The Touchdown/);
  assert.match(html,/Source week 5/); // AP retains its separate source attribution.
  assert.match(html,/CFP rankings begin later/);assert.doesNotMatch(html,/8-0|999|First-place|<th/);
  delete globalThis.__pollRenderStates;
});
test('Shared week mismatch never renders another source’s older poll',()=>{
  globalThis.__pollRenderStates=['2026:regular:6',{ap:{poll:poll('ap',7)},uki:{poll:poll('uki',4)}},[meta('ap',7),meta('uki',4)],{},false];
  const html=renderToStaticMarkup(React.createElement(CfbRankings,{teams:[],season:2026}));
  assert.match(html,/AP School 25/);assert.doesNotMatch(html,/UKI School/);assert.match(html,/No published poll is archived for this week/);
  delete globalThis.__pollRenderStates;
});
test('CFP is not silently aligned before its mapping is confirmed',()=>{
  const results=Object.fromEntries(['ap','uki','cfp'].map(kind=>[kind,{kind,poll:poll(kind,10)}]));
  globalThis.__pollRenderStates=['2026:regular:10',results,['ap','uki','cfp'].map(kind=>meta(kind,10)),{},false];
  const html=renderToStaticMarkup(React.createElement(CfbRankings,{teams:[],season:2026}));
  assert.equal((html.match(/<li /g)||[]).length,25);assert.doesNotMatch(html,/CFP School 25/);
  delete globalThis.__pollRenderStates;
});
