import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const core=await import(await compileLocalModule(new URL('../app/lib/game-details.ts',import.meta.url)));
const {createGameDetailsService}=await import(await compileLocalModule(new URL('../app/lib/game-details-service.ts',import.meta.url)));
const {gamePreview}=await import(await compileLocalModule(new URL('../app/lib/game-details-preview.ts',import.meta.url)));
const at='2026-10-23T12:00:00.000Z';
const fixtures={};for(const league of ['NFL','CFB'])fixtures[league]=JSON.parse(await readFile(new URL(`./fixtures/game-details/${league.toLowerCase()}-final.json`,import.meta.url))).summary;
function identity(league){const h=fixtures[league].header,c=h.competitions[0];return {league,event:h.id,season:2026,home:c.competitors.find(p=>p.homeAway==='home').team.id,away:c.competitors.find(p=>p.homeAway==='away').team.id};}
for(const league of ['NFL','CFB']){
 test(`${league}: retained final team/player boxscore and scoring progression`,()=>{
  const d=core.projectGameDetails(fixtures[league],identity(league),at);assert.equal(d.stage,'final');assert.ok(d.stats.find(s=>s.key==='totalYards').home>0);assert.ok(d.players.some(p=>p.category==='passing'));assert.ok(d.players.some(p=>p.category==='rushing'));assert.ok(d.players.some(p=>p.category==='receiving'));assert.ok(d.scoring.length>5);assert.notEqual(d.leadChanges,null);
 });
 test(`${league}: scheduled → live → final → correction; no stale regression`,()=>{
  const s=structuredClone(fixtures[league]),c=s.header.competitions[0];c.status.type={state:'pre',completed:false,name:'STATUS_SCHEDULED'};
  const pre=core.projectGameDetails(s,identity(league),at);assert.equal(pre.stage,'scheduled');
  c.status.type={state:'in',completed:false,name:'STATUS_IN_PROGRESS'};const live=core.projectGameDetails(s,identity(league),'2026-10-23T12:00:30.000Z');assert.equal(core.acceptGameDetail(pre,live,'live').stage,'live');
  const home=s.boxscore.teams.find(b=>b.team.id===identity(league).home).statistics.find(x=>x.name==='totalYards');home.displayValue=String(Number(home.displayValue)+25);
  const changed=core.projectGameDetails(s,identity(league),'2026-10-23T12:01:00.000Z');assert.equal(changed.stats[0].home,live.stats[0].home+25);
  c.status.type={state:'post',completed:true,name:'STATUS_FINAL'};const final=core.projectGameDetails(s,identity(league),'2026-10-23T12:02:00.000Z');assert.equal(core.acceptGameDetail(changed,final,'final').stage,'final');
  home.displayValue=String(Number(home.displayValue)-2);const corrected=core.projectGameDetails(s,identity(league),'2026-10-23T12:03:00.000Z');assert.equal(core.acceptGameDetail(final,corrected,'final').stats[0].home,final.stats[0].home-2);
  assert.throws(()=>core.acceptGameDetail(corrected,{...corrected,stage:'live'},'final'));assert.equal(core.acceptGameDetail(corrected,live,'live'),corrected);
 });
 test(`${league}: zero, missing, invalid and conflicting statistics remain distinct`,()=>{
  const s=structuredClone(fixtures[league]),box=s.boxscore.teams[0],id=identity(league),side=box.team.id===id.home?'home':'away';
  box.statistics.find(x=>x.name==='totalYards').displayValue='0';let d=core.projectGameDetails(s,id,at);assert.equal(d.stats[0][side],0);
  for(const bad of [null,'',undefined,'NaN','—']){box.statistics.find(x=>x.name==='totalYards').displayValue=bad;assert.equal(core.projectGameDetails(s,id,at).stats[0][side],null);}
  s.boxscore.teams.push(box);assert.equal(core.projectGameDetails(s,id,at).stats[0][side],null);
 });
 test(`${league}: wrong game/season/team/league and unconfirmed final rejected`,()=>{
  for(const patch of [{event:'999'},{season:2025},{home:'999'},{league:league==='NFL'?'CFB':'NFL'}])assert.throws(()=>core.projectGameDetails(fixtures[league],{...identity(league),...patch},at));
  const s=structuredClone(fixtures[league]);s.header.competitions[0].status.type.completed=false;assert.throws(()=>core.projectGameDetails(s,identity(league),at));
 });
 test(`${league}: retained pre-game comparisons, performances and results respect cutoff`,()=>{
  const s=structuredClone(fixtures[league]);s.header.week=9;s.header.competitions[0].date='2026-10-31T19:00:00Z';s.header.competitions[0].status.type={state:'pre',name:'STATUS_SCHEDULED',completed:false};
  const d=core.projectGameDetails(s,identity(league),at),p=gamePreview(d);assert.ok(p.comparison.some(r=>r.home!==null||r.away!==null));assert.ok(p.players.length);assert.ok(p.form.some(f=>f.games.length));assert.ok(p.form.every(f=>new Set(f.games.map(g=>g.id)).size===f.games.length));
  d.kickoff='2026-01-01T00:00:00Z';d.week=1;const early=gamePreview(d);assert.equal(early.comparison.length,0);assert.equal(early.players.length,0);assert.ok(early.form.every(f=>f.games.length===0));
 });
 test(`${league}: bounded coalescing, status invalidation, final corrections, failure and retry`,async()=>{
  let now=Date.parse(at),calls=0,fail=false,state='scheduled';const raw=structuredClone(fixtures[league]);
  const load=createGameDetailsService(async()=>{calls++;await Promise.resolve();if(fail)throw Error('offline');raw.header.competitions[0].status.type=state==='scheduled'?{state:'pre',name:'STATUS_SCHEDULED',completed:false}:state==='live'?{state:'in',name:'STATUS_IN_PROGRESS',completed:false}:{state:'post',name:'STATUS_FINAL',completed:true};return Response.json(raw);},()=>now);
  const id=identity(league),results=await Promise.all(Array.from({length:10},()=>load(id)));assert.equal(calls,1);assert.equal(results.length,10);
  state='live';const live=await load(id,'live');assert.equal(live.stage,'live');assert.equal(calls,2);now+=30001;await load(id);assert.equal(calls,3);
  state='final';await load(id,'final');assert.equal(calls,4);now+=300001;fail=true;await assert.rejects(load(id));fail=false;await load(id);assert.equal(calls,6);
  const fresh=createGameDetailsService(async()=>Response.json(raw),()=>now);assert.deepEqual(await fresh(id),await load(id));
 });
}
test('request identities reject injected sources, duplicate fields and invalid IDs',()=>{
 assert.throws(()=>core.parseDetailIdentity(new URLSearchParams('league=CFB&event=1&season=2026&home=2&away=3&url=https://other.invalid')));
 assert.throws(()=>core.parseDetailIdentity(new URLSearchParams('league=CFB&event=1&event=2&season=2026&home=2&away=3')));
 assert.equal(core.detailInterval('live'),30000);assert.equal(core.detailInterval('final'),300000);
});
test('duplicate or non-monotonic scoring cannot create invented lead changes',()=>{
 const s=structuredClone(fixtures.NFL);s.scoringPlays.push(s.scoringPlays[0]);const d=core.projectGameDetails(s,identity('NFL'),at);assert.equal(d.leadChanges,null);assert.deepEqual(d.scoring,[]);
});
test('only open card starts details: collapsed scoreboard, tiers, Deck and possession markup unchanged',async()=>{
 const card=await readFile(new URL('../app/components/GameCard.tsx',import.meta.url),'utf8'),client=await readFile(new URL('../app/features/games/GameDetails.tsx',import.meta.url),'utf8');
 assert.match(client,/if\(!open\|\|!url\)return/);assert.match(client,/stopped=true;clearTimeout\(timer\)/);assert.match(client,/document.visibilityState==='hidden'/);assert.match(client,/aria-expanded=\{open\}/);assert.match(card,/statusKind === "live" && possession === "away"/);assert.match(card,/\{footer\}/);assert.match(card,/\{details\}/);
 for(const name of ['Cfb','Nfl']){const grid=await readFile(new URL(`../app/features/games/${name}GamesGrid.tsx`,import.meta.url),'utf8');assert.match(grid,/key=\{game.id\}/);assert.match(grid,/GameTierControls/);assert.match(grid,/context=\{game.context\}/);}
});
test('actual retained CFB live → final observations show changed rushing values',async()=>{
 const live=JSON.parse(await readFile(new URL('./fixtures/cfb-live-week8.json',import.meta.url))),final=JSON.parse(await readFile(new URL('./fixtures/cfb-final-week8.json',import.meta.url)));
 const id={league:'CFB',season:2026,event:'401871070',home:'2534',away:'166'};
 const a=core.projectGameDetails(live.summary,id,live.observedAt),b=core.projectGameDetails(final.summary,id,final.observedAt);
 assert.equal(a.stage,'live');assert.equal(b.stage,'final');
 const jones=p=>p.players.find(r=>r.id==='espn:cfb:athlete:5220253');assert.ok(jones(a));assert.ok(jones(b));assert.notEqual(jones(a).line,jones(b).line);assert.match(jones(b).line,/178 YDS/);
});
test('oversized observations fail, clean up and can be retried',async()=>{
 let bad=true,calls=0;const load=createGameDetailsService(async()=>{calls++;return bad?new Response('x',{headers:{'content-length':'2000001'}}):Response.json(fixtures.NFL);});
 await assert.rejects(load(identity('NFL')));bad=false;assert.equal((await load(identity('NFL'))).stage,'final');assert.equal(calls,2);
});
test('both leagues render useful scheduled, live and final details with no duplicated scoreboard',async()=>{
 const ts=(await import('typescript')).default,React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const jsx=new URL('../node_modules/react/jsx-runtime.js',import.meta.url).href,react=new URL('../node_modules/react/index.js',import.meta.url).href;
 const path=new URL('../app/features/games/GameDetails.tsx',import.meta.url);let code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 code=code.replace(/from ['"]react['"]/g,`from ${JSON.stringify(react)}`).replace(/from ['"]react\/jsx-runtime['"]/g,`from ${JSON.stringify(jsx)}`).replace(/from ['"]\.\.\/\.\.\/lib\/game-details['"]/g,`from ${JSON.stringify(await compileLocalModule(new URL('../app/lib/game-details.ts',import.meta.url)))}`).replace(/from ['\"]\.\.\/\.\.\/lib\/game-detail-tabs['\"]/g,`from ${JSON.stringify(await compileLocalModule(new URL('../app/lib/game-detail-tabs.ts',import.meta.url)))}`).replace(/import styles from ['"][^'"]+['"];?/,'const styles=new Proxy({},{get:(_,key)=>key});');
 const {GameDetailsContent,GameDetailsPanel}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 for(const league of ['NFL','CFB'])for(const stage of ['scheduled','live','final']){
  const detail=core.projectGameDetails(fixtures[league],identity(league),at);detail.stage=stage;detail.week=9;detail.kickoff='2026-10-31T19:00:00Z';const preview=stage==='scheduled'?gamePreview(detail):null;
  const html=renderToStaticMarkup(React.createElement(GameDetailsContent,{data:{...detail,preview},context:'Verified matchup'}));
  assert.match(html,stage==='scheduled'?/The Preview/:stage==='live'?/Game Pulse/:/The Breakdown/);assert.match(html,/<table/);assert.match(html,/Player|player/);assert.doesNotMatch(html,/game-card__score/);assert.doesNotMatch(html,/undefined|NaN/);
  const panels=[0,1,2].map(tab=>renderToStaticMarkup(React.createElement(GameDetailsPanel,{data:{...detail,preview},context:'Verified matchup',tab})));
  assert.match(panels[0],/<table/);assert.doesNotMatch(panels[1],/<table/);assert.doesNotMatch(panels[2],/<table/);
  assert.doesNotMatch(panels[0],/Listed birthplace|retained results|<ol/);
  if(stage==='scheduled'){assert.match(panels[1],/season through Week/);assert.match(panels[2],/retained results/);assert.doesNotMatch(panels[2],/Supported reported totals/);}
  else {assert.match(panels[1],/YDS|TD|SACKS|TOT/);assert.match(panels[2],/<ol/);assert.doesNotMatch(panels[0],/CeeDee Lamb 3 Yd pass/);}
  assert.match(html,/role="tablist"/);assert.match(html,/role="tabpanel"/);
  const sections=[...panels[1].matchAll(/<section[^>]*aria-label="([^"]+) players"[^>]*>([\s\S]*?)<\/section>/g)];
  assert.deepEqual(sections.map(s=>s[1]),detail.teams.map(t=>t.name));
  if(stage!=='scheduled'){
   const grouped={...detail,players:[{id:'espn:test:athlete:1',team:detail.teams[0].id,name:'Drake Maye',category:'passing',line:'250 YDS'},{id:'espn:test:athlete:1',team:detail.teams[0].id,name:'Drake Maye',category:'rushing',line:'80 YDS'}],preview};
   const combined=renderToStaticMarkup(React.createElement(GameDetailsPanel,{data:grouped,context:null,tab:1}));assert.equal((combined.match(/Drake Maye/g)??[]).length,1);assert.match(combined,/Passing · 250 YDS/);assert.match(combined,/Rushing · 80 YDS/);
   const overtime={...detail,preview,context:['International Game · London'],scoring:[{id:'ot',period:5,clock:'0:00',home:7,away:0,text:'Verified overtime score'}]};
   const scoreHtml=renderToStaticMarkup(React.createElement(GameDetailsPanel,{data:overtime,context:'🌍 INTERNATIONAL GAME · LONDON',tab:2}));assert.doesNotMatch(scoreHtml,/International Game/);assert.match(scoreHtml,league==='CFB'?/OT · 0–7/:/OT 0:00 · 0–7/);assert.doesNotMatch(scoreHtml,/Q5/);
  }


 }
});
