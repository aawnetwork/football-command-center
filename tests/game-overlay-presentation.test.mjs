import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),cache=new Map();
function load(file){if(cache.has(file))return cache.get(file).exports;const unit={exports:{}};cache.set(file,unit);const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>{if(!name.startsWith('.'))return require(name);const base=path.resolve(path.dirname(file),name);if(name.endsWith('.json'))return {default:require(base)};return load(base+(existsSync(base+'.ts')?'.ts':'.tsx'));},unit,unit.exports);return unit.exports;}
const {GameOverlay}=load(path.join(root,'app/features/exports/GameOverlay.tsx'));
const fixture=()=>({id:'fixture',league:'CFB',stage:'pregame',kickoff:'2026-10-25T01:30Z',neutral:false,finalLabel:'FINAL / 2OT',context:'RANKED MATCHUP',observedAt:'2026-10-23T00:00Z',platforms:['Sky Sports'],away:{id:'a',name:'Away University',logo:'/a.png',rank:4,record:'4–2',score:0},home:{id:'h',name:'Home University',logo:'/h.png',rank:5,record:'5–1',score:0}});
const render=(game,treatment='dark')=>renderToStaticMarkup(createElement(GameOverlay,{game,treatment}));
test('pregame joins both identities and separator within one panel, with no score or final styling',()=>{
 const html=render(fixture());assert.equal((html.match(/class="game-overlay__panel"/g)||[]).length,1);assert.equal((html.match(/class="game-overlay__matchup"/g)||[]).length,1);
 assert.ok(html.indexOf('Away University')<html.indexOf('game-overlay__versus'));assert.ok(html.indexOf('game-overlay__versus')<html.indexOf('Home University'));
 assert.doesNotMatch(html,/game-overlay__score|FINAL|LIVE/);assert.match(html,/#4/);assert.match(html,/4–2/);assert.match(html,/RANKED MATCHUP/);
 assert.match(html,/<footer[^>]*>.*25 Oct 2026.*01:30 GMT.*UK.*WATCH · Sky Sports/);assert.match(html,/dateTime="2026-10-25T01:30Z"/);
});
test('confirmed neutral fixtures use vs; missing optional information leaves no placeholder fields',()=>{
 const g=fixture();g.neutral=true;g.context=null;g.platforms=[];for(const t of [g.away,g.home]){t.rank=null;t.record=null;t.logo=null;}
 const html=render(g,'light');assert.match(html,/game-overlay__versus">vs<\/span>/);assert.match(html,/PREGAME/);assert.doesNotMatch(html,/#null|null|undefined|WATCH|logo-well/);assert.equal((html.match(/<img/g)||[]).length,1);
});
test('final binds opposing team identities to one score each and restores source records',()=>{
 const g=fixture();g.stage='final';g.context=null;g.away.score=10;g.home.score=26;
 const html=render(g);assert.equal((html.match(/game-overlay__score">10</g)||[]).length,1);assert.equal((html.match(/game-overlay__score">26</g)||[]).length,1);assert.equal((html.match(/team--winner/g)||[]).length,1);
 assert.match(html,/FINAL \/ 2OT/);assert.doesNotMatch(html,/<footer|game-overlay__versus|Sky Sports|TENNESSEE WIN/);
 assert.match(html,/4–2/);assert.match(html,/5–1/);g.away.score=26;assert.doesNotMatch(render(g),/team--winner/);
});
test('long names and zero results remain intact in both independently styled treatments',()=>{
 const g=fixture();g.stage='final';g.away.name='A Very Long University Programme Name';g.away.score=0;g.home.score=3;
 for(const treatment of ['dark','light']){const html=render(g,treatment);assert.ok(html.includes(g.away.name));assert.match(html,/game-overlay__score">0</);assert.match(html,new RegExp(`game-overlay--${treatment}`));}
});
test('publishing-only CSS contains text within panels and uses the existing Montserrat family',()=>{
 const css=readFileSync(path.join(root,'app/features/exports/export-studio.css'),'utf8');const overlay=css.slice(css.indexOf('/* Publishing-only panels:'));
 assert.match(overlay,/--font-montserrat/);assert.match(overlay,/grid-template-columns:minmax\(0,1fr\) 36px minmax\(0,1fr\)/);assert.match(overlay,/overflow-wrap:anywhere/);assert.match(overlay,/background:transparent/);assert.match(overlay,/\.game-overlay__panel \{ background:var\(--overlay-panel\)/);assert.match(overlay,/\.game-overlay header .*background:#0b1f33/);
 assert.doesNotMatch(overlay,/text-shadow|--font-geist|\.game-card/);
});
test('final retains the genuine network artwork while both templates omit league headings',()=>{
 const g=fixture();g.stage='final';g.away.color='#6b1028';g.home.color='#005030';
 const html=render(g);assert.match(html,/src="\/exports\/aaw-network-navy.png" alt="AAW Network"/);assert.doesNotMatch(html,/game-overlay__brand">AAW</);assert.match(html,/--team-ink:#6b1028/);assert.doesNotMatch(html,/game-overlay__league|COLLEGE FOOTBALL/);
 g.away.color='url(bad)';assert.doesNotMatch(render(g),/url\(bad\)/);
 g.stage='pregame';const pre=render(g);assert.match(pre,/aaw-network-navy/);assert.match(pre,/--team-ink:#0b1f33/);assert.doesNotMatch(pre,/url\(bad\)|game-overlay__league|COLLEGE FOOTBALL/);
});
test('three-digit finals retain the exact score with a bounded typography treatment',()=>{
 const g=fixture();g.stage='final';g.away.score=100;g.home.score=0;const html=render(g);
 assert.match(html,/game-overlay__score game-overlay__score--wide">100</);assert.match(html,/game-overlay__score">0</);
});

test('scorebug has a connected central result spine, free-standing logos and no winner underline',()=>{
 const g=fixture();g.stage='final';const html=render(g);assert.match(html,/game-overlay__logo-slot/);assert.doesNotMatch(html,/game-overlay__logo-well/);
 const css=readFileSync(path.join(root,'app/features/exports/export-studio.css'),'utf8').split('/* Final scorebug only:')[1].split('/* Approved pregame companion:')[0];
 assert.doesNotMatch(css,/border-bottom-color/);assert.match(css,/grid-template-columns:minmax\(0,1fr\) 112px/);assert.doesNotMatch(css,/linear-gradient/);assert.match(css,/background:var\(--team-ink\)/);assert.match(css,/scorebug__footing/);assert.match(css,/game-overlay__team--winner \.game-overlay__score \{ font-weight:900; \}/);assert.match(css,/game-overlay__logo-slot .*background:transparent/);
});

test('approved pregame carries dynamic solid colours, a central blend, and optional verified TV in the bottom strip',()=>{
 const g=fixture();g.away.color='#782f40';g.home.color='#f47423';
 const html=render(g);assert.match(html,/--away-colour:#fffaf0;--home-colour:#0b1f33/);assert.match(html,/--team-surface:/);assert.match(html,/WATCH · Sky Sports/);assert.doesNotMatch(html,/game-overlay__score|team--winner/);
 const css=readFileSync(path.join(root,'app/features/exports/export-studio.css'),'utf8').split('/* Approved pregame companion:')[1];
 assert.match(css,/linear-gradient\(90deg,var\(--away-colour\) 0%/);assert.match(css,/color-mix\(in srgb/);assert.match(css,/var\(--home-colour\) 100%/);assert.match(css,/background:transparent/);assert.match(css,/border-radius:0/);
 g.platforms=[];assert.doesNotMatch(render(g),/WATCH/);
});

test('live scorebug uses current scores, period/clock, broadcast footer and qualifier without a final winner',()=>{
 const g=fixture();g.stage='live';g.liveLabel='LIVE | 1st · 4:32';g.context='RIVALRY — Duke–Virginia Rivalry';g.away.score=7;g.home.score=0;
 const html=render(g);assert.match(html,/LIVE \| 1st · 4:32/);assert.match(html,/RIVALRY — Duke–Virginia Rivalry/);assert.match(html,/<footer>.*WATCH · Sky Sports/);assert.match(html,/live score/);assert.doesNotMatch(html,/team--winner|FINAL|PREGAME/);
});
test('record metadata cannot wrap hyphenated records and source artwork stays mounted between captures',()=>{
 const css=readFileSync(path.join(root,'app/features/exports/export-studio.css'),'utf8');assert.match(css,/scorebug__record[^}]*white-space:nowrap/);
 const studio=readFileSync(path.join(root,'app/features/exports/OverlayStudio.tsx'),'utf8');assert.equal((studio.match(/ref=\{artwork\}/g)||[]).length,1);assert.doesNotMatch(studio,/left:-100000|result\?<div/);
});
test('shared header places the real status left, official logo centre and existing context right',()=>{
 for(const league of ['NFL','CFB'])for(const stage of ['pregame','live','final']){
  const g={...fixture(),league,stage,liveLabel:'LIVE | 2nd · 1:48'};const html=render(g),header=html.match(/<header>(.*?)<\/header>/s)[1];
  assert.ok(header.indexOf('game-overlay__status')<header.indexOf('AAW Network'));
  assert.ok(header.indexOf('AAW Network')<header.indexOf('scorebug__context'));
  assert.match(header,/RANKED MATCHUP/);assert.doesNotMatch(header,/status-dot|separator|🔴/);
  if(stage==='live')assert.match(header,/LIVE \| 2nd · 1:48/);if(stage==='final')assert.match(header,/FINAL \/ 2OT/);
 }
});
test('NFL viewing destinations stay out of publishing overlays while existing CFB behaviour is unchanged',()=>{
 for(const stage of ['pregame','live','final']){const g={...fixture(),league:'NFL',stage,platforms:['Channel 5','Sky Sports','DAZN','Virgin']};assert.doesNotMatch(render(g),/WATCH|Channel 5|Virgin|Sky Sports/);}
 const g={...fixture(),stage:'live'};assert.match(render(g),/WATCH · Sky Sports/);
});
test('NFL UK destinations are uncapped, escaped, deduplicated and absent when no assignment is supplied',()=>{
 const {NflUkBroadcasts}=load(path.join(root,'app/features/games/NflUkBroadcasts.tsx'));
 const show=platforms=>renderToStaticMarkup(createElement(NflUkBroadcasts,{platforms}));
 assert.equal(show([]),'');assert.equal(show([' ','']),'');assert.equal((show(['DAZN']).match(/role="listitem"/g)||[]).length,1);
 const platforms=['Channel 5','Sky Sports','DAZN','Virgin','Additional approved destination','Another approved destination'];
 const html=show([...platforms,'DAZN']);assert.equal((html.match(/role="listitem"/g)||[]).length,6);for(const name of platforms)assert.ok(html.includes(name));
 assert.match(show(['<unsafe>']),/&lt;unsafe&gt;/);assert.match(html,/Confirmed UK viewing destinations/);assert.match(html,/data-export-omit/);
 const css=readFileSync(path.join(root,'app/command-center.css'),'utf8');assert.match(css,/\.nfl-uk-broadcasts[^}]*flex-wrap:wrap/);assert.match(css,/game-grid--nfl \.game-card__header-right[^}]*white-space:normal/);
});

test('supplied navy branding has no temporary backing or generated replacement',()=>{const html=render({...fixture(),stage:'final'});assert.match(html,/aaw-network-navy.png/);assert.doesNotMatch(html,/temporary-brand/);const css=readFileSync(path.join(root,'app/features/exports/export-studio.css'),'utf8');assert.match(css,/scorebug__branding \.game-overlay__network-logo[^}]*background:transparent/);assert.doesNotMatch(css,/scorebug__temporary-brand/);});

test('brand crop retains its layout height when the PNG engine normalises wrapper heights to auto',()=>{const css=readFileSync(path.join(root,'app/features/exports/export-studio.css'),'utf8');assert.match(css,/scorebug__brand-artwork[^}]*min-height:22px/);});
