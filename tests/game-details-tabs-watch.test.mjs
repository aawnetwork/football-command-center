import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const root=new URL('../',import.meta.url),readJson=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const {createWatchSelector,gameWatch}=await import(await compileLocalModule(new URL('app/lib/game-watch.ts',root)));
const {gamePreview}=await import(await compileLocalModule(new URL('app/lib/game-details-preview.ts',root)));
const {detailTabs,detailTabKey}=await import(await compileLocalModule(new URL('app/lib/game-detail-tabs.ts',root)));
const fixture=(await readJson('tests/fixtures/cfb-final-week8.json')).summary;
const {projectGameDetails}=await import(await compileLocalModule(new URL('app/lib/game-details.ts',root)));
const detail=()=>({...projectGameDetails(fixture,{league:'CFB',event:'401871070',season:2026,home:'2534',away:'166'},'2026-10-23T12:00:00Z'),stage:'scheduled',kickoff:'2026-10-25T00:00:00Z'});
const player=(id,team,value)=>({id:'espn:cfb:athlete:'+id,espnId:String(id),name:'Controlled runner '+id,teams:[team],categories:['Rush'],values:{rushing_yards:value}});
const snapshot=()=>({season:2026,throughWeek:7,phase:'REG',scope:'reported-values',complete:false,source:'CONTROLLED TEST FIXTURE',teams:{166:{name:'Away',conferenceId:'151',conferenceName:'Conference USA'},2534:{name:'Home',conferenceId:'151',conferenceName:'Conference USA'},99:{name:'Other',conferenceId:'151',conferenceName:'Conference USA'}},players:[player(1,'99',1200),player(2,'166',1000),player(3,'99',970),player(4,'2534',940)]});
test('all stages have three compact tabs and standard keyboard navigation',()=>{
 assert.deepEqual(detailTabs('scheduled'),['Comparison','Players to Watch','Recent Form']);assert.deepEqual(detailTabs('live'),['Team Stats','Player Leaders','Scoring']);assert.deepEqual(detailTabs('final'),['Final Stats','Standout Players','Scoring Summary']);
 assert.equal(detailTabKey('ArrowRight',2),0);assert.equal(detailTabKey('ArrowLeft',0),2);assert.equal(detailTabKey('Home',2),0);assert.equal(detailTabKey('End',0),2);assert.equal(detailTabKey('Enter',0),null);
});
test('controlled conference #2 versus #4 has exact 60-yard gap, qualified ranks and no prediction',()=>{
 const watch=createWatchSelector(snapshot())(detail());assert.equal(watch.players.length,2);assert.equal(watch.players[0].stat.conferenceRank,2);assert.equal(watch.players[1].stat.conferenceRank,4);assert.equal(watch.comparisons[0].gap,60);assert.equal(watch.comparisons[0].scope,'Conference USA reported totals');assert.match(watch.qualification,/not certified complete national/);
});
test('ties, genuine zero and missing values retain correct reported ranking population',()=>{
 const s=snapshot();s.players.push(player(5,'99',1000),player(6,'99',0),player(7,'99',null));const watch=createWatchSelector(s)(detail());
 const away=watch.players.find(p=>p.team==='166'),home=watch.players.find(p=>p.team==='2534');assert.equal(away.stat.rank,2);assert.equal(home.stat.rank,5);assert.equal(away.stat.population,6);assert.equal(home.stat.conferenceRank,5);
});
test('conference significance can outrank a better national brand-independent position',()=>{
 const s=snapshot();for(let i=10;i<40;i++){s.teams['other'+i]={name:'Other school',conferenceId:'other',conferenceName:'Other'};s.players.push(player(i,'other'+i,1500+i));}
 const watch=createWatchSelector(s)(detail());assert.equal(watch.players.find(p=>p.team==='166').stat.rank,32);assert.match(watch.players[0].reason,/No. 2 of 4 reported Conference USA/);assert.equal(watch.comparisons[0].gap,60);
});
test('unknown positions cannot enter QB, ambiguous teams cannot acquire matchup/conference rank',()=>{
 const s=snapshot();s.players.push({...player(8,'166',100),categories:['Rush'],values:{passing_yards:4000}});s.players.push({...player(9,'166',2000),teams:['166','2534']});
 const watch=createWatchSelector(s)(detail());assert.ok(watch.players.every(p=>p.stat.metric!=='passing_yards'));assert.ok(watch.players.every(p=>p.id!=='espn:cfb:athlete:9'));assert.equal(watch.players.find(p=>p.team==='166').stat.rank,3);
});
test('unknown, duplicate, wrong-season and unsupported histories cannot force a storyline',()=>{
 const s=snapshot();s.players.push({...s.players[1],values:{rushing_yards:9999}});assert.ok(createWatchSelector(s)(detail()).players.every(p=>p.id!==s.players[1].id));
 assert.equal(createWatchSelector(s)({...detail(),identity:{...detail().identity,season:2025}}).players.length,0);
 const empty={...s,players:s.players.map(p=>({...p,values:{rushing_yards:null}}))};assert.equal(createWatchSelector(empty)(detail()).players.length,0);
});
test('real retained season evidence produces exact Jones values and reported ranks',async()=>{
 const watch=gameWatch(detail()),jones=watch.players.find(p=>p.name==='James Jones');assert.equal(jones.id,'espn:cfb:athlete:5220253');assert.equal(jones.stat.value,599);assert.equal(jones.stat.conferenceRank,1);assert.equal(jones.stat.rank,21);assert.match(watch.cutoff,/through Week 7/);
 const source=(await readJson('app/lib/game-watch-season.json')).CFB;
 const candidates=source.players.filter(p=>p.categories.includes('Rush')&&Number.isFinite(p.values.rushing_yards));assert.equal(jones.stat.population,candidates.length);assert.equal(jones.stat.rank,1+candidates.filter(p=>p.values.rushing_yards>599).length);
});
test('real Florida UK connections preserve exact identities and birthplace semantics without participation claims',()=>{
 const d=detail();d.identity={...d.identity,home:'57',away:'2'};const watch=gameWatch(d),refs=watch.players.filter(p=>p.connection);assert.equal(refs.length,2);
 assert.equal(refs.find(p=>p.id==='espn:cfb:athlete:5226569').connection.fact,'Manchester, England');assert.equal(refs.find(p=>p.id==='espn:cfb:athlete:5391549').connection.fact,'Hackney, England');
 for(const p of refs){assert.equal(p.team,'57');assert.equal(p.connection.factType,'birthplace');assert.match(p.connection.sourceUrl,/espn.com\/college-football\/player\/bio/);assert.match(p.reason,/participation unconfirmed/);}
});
test('UK connection merges with statistical card, and wrong/conflicting roster identity is excluded',()=>{
 const s=snapshot(),id=s.players[1].id,ref={connectionKind:'UK',id,espnId:'2',league:'CFB',season:2026,team:'166',name:'Controlled runner 2',factType:'birthplace',fact:'London, England',rosterObservedAt:'2026-10-20T00:00:00Z',rosterStatus:'active',source:'Controlled evidence',sourceUrl:'https://example.org/verified'};
 const watch=createWatchSelector(s,[ref])(detail());assert.equal(watch.players.filter(p=>p.id===id).length,1);assert.equal(watch.players.find(p=>p.id===id).connection.kind,'UK');
 for(const bad of [{...ref,espnId:'999'},{...ref,season:2025},{...ref,team:'888'},{...ref,rosterObservedAt:'2026-11-01T00:00:00Z'},{...ref,rosterStatus:'inactive'}])assert.ok(createWatchSelector(s,[bad])(detail()).players.every(p=>!p.connection));
 assert.ok(createWatchSelector(s,[ref,{...ref,team:'2534'}])(detail()).players.every(p=>!p.connection));
});
test('real retained recent form has five completed games, correct results, dates, cutoffs and no duplicates',()=>{
 const p=gamePreview(detail());assert.deepEqual(p.form.map(f=>f.games.length),[5,5]);
 for(const f of p.form){assert.equal(new Set(f.games.map(g=>g.id)).size,5);for(let i=0;i<f.games.length;i++){const g=f.games[i];assert.match(g.result,/^[WLT] \d+–\d+$/);assert.ok(Date.parse(g.date)<Date.parse(detail().kickoff));if(i)assert.ok(Date.parse(f.games[i-1].date)>=Date.parse(g.date));}}
 const d=detail();d.kickoff='2026-09-01T00:00:00Z';d.week=2;assert.ok(gamePreview(d).form.every(f=>f.games.length<5));
});
test('comparison identifies separate supported cutoffs for each side, not one shared date',()=>{
 const d=detail();d.identity={...d.identity,home:'57',away:'2'};const p=gamePreview(d);assert.ok(p.comparison.length);
 for(const r of p.comparison){assert.equal(r.away===null,r.awayCutoff===null);assert.equal(r.home===null,r.homeCutoff===null);if(r.homeCutoff)assert.match(r.homeCutoff,/NCAA.*2026/);}
});
test('tabs preserve live request safeguards and stable state while only stage changes reset the active tab',async()=>{
 const ui=await readFile(new URL('app/features/games/GameDetails.tsx',root),'utf8');assert.match(ui,/role="tablist"/);assert.match(ui,/aria-selected=\{tab===index\}/);assert.match(ui,/tabIndex=\{tab===index\?0:-1\}/);assert.match(ui,/onClick=\{\(\)=>setTab\(index\)\}/);assert.match(ui,/visible\.identity\.event\}:\$\{visible\.stage/);assert.match(ui,/\},\[open,url,status,attempt\]\)/);assert.doesNotMatch(ui,/\[open,url,status,attempt,tab\]/);
});
test('different NCAA team cutoffs remain separate and invalid own-team cutoffs withhold only that cell',async()=>{
 const source=await readJson('app/lib/cfb-team-ncaa-retained.json');
 source.tables['total-offense'].rows=[{team:'Auburn',stat:800,gamesPlayed:2,sourceUpdated:'Through games Monday, October 19, 2026'},{team:'Florida',stat:900,gamesPlayed:3,sourceUpdated:'Through games Tuesday, October 20, 2026'}];
 const file=new URL('app/lib/cfb-team-ncaa-retained.json',root),entry=new URL('app/lib/game-details-preview.ts',root),d=detail();d.identity={...d.identity,home:'57',away:'2'};
 const build=async()=>await import(await compileLocalModule(entry,new Map([[file.href,JSON.stringify(source)]])));
 let projected=(await build()).gamePreview(d).comparison.find(r=>r.label==='Offence YPG');assert.equal(projected.away,400);assert.equal(projected.home,300);assert.match(projected.awayCutoff,/October 19/);assert.match(projected.homeCutoff,/October 20/);
 source.tables['total-offense'].rows[1].sourceUpdated='Cutoff unverified';projected=(await build()).gamePreview(d).comparison.find(r=>r.label==='Offence YPG');assert.equal(projected.away,400);assert.equal(projected.home,null);assert.equal(projected.homeCutoff,null);
});
test('selected event is never recycled into its own recent form',()=>{
 const d=detail(),prior=gamePreview(d).form[0].games[0];d.identity={...d.identity,event:prior.id};assert.ok(gamePreview(d).form.every(f=>f.games.every(g=>g.id!==prior.id)));
});
test('team grouping preserves displayed order, uneven counts and exact athlete identity',async()=>{
 const {groupedGamePlayers}=await import(await compileLocalModule(new URL('app/lib/game-detail-tabs.ts',root)));
 const teams=[{id:'away',name:'Duke'},{id:'home',name:'Virginia'}];
 const rows=[{id:'1',team:'home',name:'Home player',category:'receiving',line:'6 REC · 120 YDS'},{id:'2',team:'away',name:'Drake Maye',category:'passing',line:'250 YDS · 2 TD'},{id:'3',team:'away',name:'Other player',category:'receiving',line:'90 YDS'},{id:'2',team:'away',name:'Drake Maye',category:'rushing',line:'80 YDS · 1 TD'}];
 const result=groupedGamePlayers(teams,[...rows,rows[1]]);assert.deepEqual(result.map(t=>t.name),['Duke','Virginia']);assert.deepEqual(result.map(t=>t.players.length),[2,1]);assert.equal(result[0].players[0].achievements.length,2);assert.deepEqual(result[0].players[0].achievements.map(a=>a.category),['passing','rushing']);
 assert.equal(groupedGamePlayers(teams,[rows[0]])[0].players.length,0);assert.equal(groupedGamePlayers(teams,[rows[0],{...rows[1],name:'Home player'}])[0].players.length,1);
});
test('OT periods render football labels and only college untimed zero clocks are hidden',async()=>{
 const {scoringPeriodLabel}=await import(await compileLocalModule(new URL('app/lib/game-detail-tabs.ts',root)));
 assert.equal(scoringPeriodLabel(4,'0:00','CFB'),'Q4 0:00');assert.equal(scoringPeriodLabel(5,'0:00','CFB'),'OT');assert.equal(scoringPeriodLabel(6,'0:00','CFB'),'2OT');assert.equal(scoringPeriodLabel(7,'','CFB'),'3OT');assert.equal(scoringPeriodLabel(5,'4:12','NFL'),'OT 4:12');assert.equal(scoringPeriodLabel(5,'0:00','NFL'),'OT 0:00');
});
test('duplicate collapsed rivalry/international labels are omitted but genuinely new result context remains',async()=>{
 const {additionalGameContext}=await import(await compileLocalModule(new URL('app/lib/game-detail-tabs.ts',root)));
 assert.deepEqual(additionalGameContext('🏆 RIVALRY — Commonwealth Cup',['Rivalry: Commonwealth Cup','Confirmed upset: visitor beat #4 home','Confirmed upset: visitor beat #4 home']),['Confirmed upset: visitor beat #4 home']);
 assert.deepEqual(additionalGameContext('🌍 INTERNATIONAL GAME · LONDON, ENGLAND',['NFL London Games','International Game: London, England']),[]);
 assert.deepEqual(additionalGameContext(null,['Bowl championship','Bowl championship']),['Bowl championship']);
});
test('material leading yardage races qualify; ties, trivial TD gaps and irrelevant ranks do not',async()=>{
 const {meaningfulWatchComparison,comparisonGap}=await import(await compileLocalModule(new URL('app/lib/game-detail-tabs.ts',root)));
 assert.ok(meaningfulWatchComparison('rushing_yards',60,1000,2,4,true));assert.ok(meaningfulWatchComparison('receiving_yards',80,1000,1,3,false));
 for(const args of [['passing_tds',0,12,3,3,false],['receiving_tds',1,12,2,4,true],['rushing_yards',0,1000,2,2,true],['rushing_yards',1,1000,2,3,true],['rushing_yards',60,1000,8,10,true]])assert.equal(meaningfulWatchComparison(...args),false);
 assert.equal(comparisonGap(1,'TDs'),'1 TD');assert.equal(comparisonGap(1,'yards'),'1 yard');assert.equal(comparisonGap(60,'yards'),'60 yards');
});
test('active Game Details tabs have explicit high-specificity white-on-navy hover/selected rules and responsive team columns',async()=>{
 const css=await readFile(new URL('app/features/games/game-details.module.css',root),'utf8');
 const selected=css.match(/\.root \.tabs button\[role="tab"\]\[aria-selected="true"\] \{([^}]+)\}/)?.[1];assert.ok(selected);assert.match(selected,/background: #0b1f33 !important/);assert.match(selected,/color: #fff !important/);assert.match(selected,/var\(--cc-accent\)/);
 assert.match(css,/\[aria-selected="true"\]:hover \{[^}]*color: #fff !important/);assert.match(css,/@media \(max-width: 600px\) \{ \.teamPlayers \{ grid-template-columns: 1fr/);
 // Relative luminance verifies the actual selected foreground/background pair.
 const luminance=hex=>hex.match(/../g).map(n=>parseInt(n,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 assert.ok((luminance('ffffff')+.05)/(luminance('0b1f33')+.05)>15);
});
