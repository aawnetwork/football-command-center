import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const {projectOverlayGames,ukKickoff}=await import(await compileLocalModule(new URL('../app/features/exports/game-overlay.ts',import.meta.url)));
const checked='2026-10-20T12:00:00Z';
const scheduled=()=>({id:'123',date:'2026-10-25T00:30Z',competitions:[{neutralSite:false,status:{type:{name:'STATUS_SCHEDULED',state:'pre',completed:false}},competitors:[{homeAway:'away',team:{id:'1',displayName:'Away University',logo:'/away.png'},curatedRank:{current:8},score:'0'},{homeAway:'home',team:{id:'2',displayName:'Home University',logo:'/home.png'},curatedRank:{current:3},score:'0'}]}]});
const project=(event,league='CFB')=>projectOverlayGames({events:[event]},league,checked);
test('scheduled ranked projection preserves order, exact logos, ranks and neutral flag',()=>{
 const e=scheduled(),g=project(e)[0];assert.equal(g.stage,'pregame');assert.equal(g.away.id,'1');assert.equal(g.away.logo,'/away.png');assert.equal(g.context,'RANKED MATCHUP');assert.equal(g.neutral,false);
 e.competitions[0].neutralSite=true;assert.equal(project(e)[0].neutral,true);
 e.competitions[0].competitors.forEach(t=>t.curatedRank.current=99);assert.equal(project(e)[0].context,null);assert.equal(project(e)[0].away.rank,null);
 assert.equal(project(e,'NFL')[0].away.rank,null);
});
test('live, postponed, contradictory, unknown and past scheduled games cannot masquerade as pregame or final',()=>{
 for(const type of [{name:'STATUS_IN_PROGRESS',state:'in',completed:false},{name:'STATUS_POSTPONED',state:'pre',completed:false},{name:'STATUS_FINAL',state:'post',completed:false}]){const e=scheduled();e.competitions[0].status.type=type;assert.deepEqual(project(e),[]);}
 const e=scheduled();e.status={type:{name:'STATUS_FINAL',state:'post',completed:true}};assert.deepEqual(project(e),[]);
 e.status=undefined;e.date='2026-10-19T12:00Z';assert.deepEqual(project(e),[]);
});
test('final scores preserve zero, reject unavailable scores and label confirmed overtime',()=>{
 const e=scheduled(),c=e.competitions[0];c.status={type:{name:'STATUS_FINAL',state:'post',completed:true},period:6};c.competitors[0].score='0';c.competitors[1].score='3';let g=project(e)[0];assert.equal(g.away.score,0);assert.equal(g.home.score,3);assert.equal(g.finalLabel,'FINAL / 2OT');
 delete c.status.period;c.status.type.shortDetail='Final/OT';assert.equal(project(e)[0].finalLabel,'FINAL / OT');
 for(const invalid of [null,'',undefined,'NaN','—',-1]){c.competitors[0].score=invalid;assert.deepEqual(project(e),[]);}
});
test('duplicate games and same-team identities fail closed',()=>{
 const e=scheduled();assert.deepEqual(projectOverlayGames({events:[e,e]},'CFB',checked),[]);
 e.competitions[0].competitors[1].team.id='1';assert.deepEqual(project(e),[]);
});
test('UK kickoffs respect overnight dates and the autumn daylight-saving boundary',()=>{
 assert.match(ukKickoff('2026-10-24T23:30Z'),/25 Oct 2026.*00:30.*BST/);
 assert.match(ukKickoff('2026-10-25T01:30Z'),/25 Oct 2026.*01:30.*GMT/);
 assert.equal(ukKickoff('invalid'),null);
});
test('retained real CFB and NFL finals retain genuine team identities and scores',()=>{
 for(const [file,league] of [['cfb-final.json','CFB'],['nfl-final.json','NFL']]){
  const {summary}=JSON.parse(readFileSync(new URL(`fixtures/game-details/${file}`,import.meta.url),'utf8'));
  const header=summary.header,c=header.competitions[0],event={...header,date:c.date,competitions:[c]};
  const [g]=project(event,league);assert.ok(g);assert.equal(g.id,header.id);assert.equal(g.stage,'final');
  for(const side of ['home','away']){const row=c.competitors.find(t=>t.homeAway===side);assert.equal(g[side].name,row.team.displayName);assert.equal(g[side].score,Number(row.score));}
 }
});
test('overlay source route is bounded, validates selection and returns safe failures offline',async()=>{
 const file=new URL('../app/api/admin/export-games/route.ts',import.meta.url);
 const source=readFileSync(file,'utf8').replace("import {NextResponse} from 'next/server';",'const NextResponse={json:(body,options={})=>new Response(JSON.stringify(body),{...options,headers:{"content-type":"application/json",...options.headers}})};');
 const {GET}=await import(await compileLocalModule(file,new Map([[file.href,source]])));
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(input)=>{calls.push(String(input));return new Response(JSON.stringify({events:[scheduled()]}));};
 try{
  assert.equal((await GET(new Request('http://local/api/admin/export-games?league=OTHER'))).status,400);
  assert.equal((await GET(new Request('http://local/api/admin/export-games?league=CFB&week=999'))).status,400);
  assert.equal(calls.length,0);
  const response=await GET(new Request('http://local/api/admin/export-games?league=CFB&season=2026&week=8'));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(calls.length,1);const url=new URL(calls[0]);assert.equal(url.searchParams.get('limit'),'100');assert.equal(url.searchParams.get('groups'),'80');assert.equal(url.searchParams.get('week'),'8');
  globalThis.fetch=async()=>{throw Error('Offline');};assert.equal((await GET(new Request('http://local/api/admin/export-games?league=NFL'))).status,502);
 }finally{globalThis.fetch=original;}
});
test('team colours are optional validated presentation metadata, not inferred from names',()=>{
 const e=scheduled();e.competitions[0].competitors[0].team.color='6b1028';e.competitions[0].competitors[1].team.color='not-a-colour';
 const g=project(e)[0];assert.equal(g.away.color,'#6b1028');assert.equal(g.home.color,null);assert.equal(g.away.name,'Away University');assert.equal(g.away.score,0);
});

test('pregame surfaces separate primary marks from their background using verified palette metadata',async()=>{
 const {pregameTeamAppearance,pregameJoinInk}=await import(await compileLocalModule(new URL('../app/features/exports/game-overlay.ts',import.meta.url)));
 const cases=[
  ['Oregon','00934b','fff41b','#fff41b'],['Tennessee','ff8200','ffffff','#0b1f33'],
  ['Duke','00539b','ffffff','#fffaf0'],['Texas State','501214','6a5638','#fffaf0'],
  ['Virginia','232d4b','f84c1e','#fffaf0'],['Illinois','ff5f05','13294b','#13294b'],
  ['LSU','461d76','fdd023','#fdd023'],['North Carolina','7bafd4','13294b','#13294b'],
  ['Notre Dame','062340','c99700','#fffaf0'],['USC','9d2235','ffc72c','#ffc72c'],
 ];
 for(const [name,color,secondaryColor,expected]of cases){const value=pregameTeamAppearance({name,color,secondaryColor,logo:'/original.png'});assert.equal(value.surface,expected,name);assert.notEqual(value.primary,value.surface,name);assert.equal(value.logo,'/original.png');}
 const alternate=pregameTeamAppearance({color:'#ff8200',secondaryColor:'#ffffff',logo:'/original.png',darkLogo:'/provider-dark.png'});assert.equal(alternate.logo,'/provider-dark.png');
 const invalid=pregameTeamAppearance({color:'url(no)',secondaryColor:'no',logo:'/original.png'});assert.equal(invalid.surface,'#fffaf0');assert.equal(invalid.logo,'/original.png');
 assert.equal(pregameJoinInk('#fffaf0','#fffaf0'),'#0b1f33');assert.equal(pregameJoinInk('#0b1f33','#13294b'),'#fffaf0');
});

test('source projection retains only explicitly supplied secondary colours and dark-logo references',()=>{
 const e=scheduled(),t=e.competitions[0].competitors[0].team;t.alternateColor='fff41b';t.logos=[{href:'/light.png',rel:['default']},{href:'/dark.png',rel:['dark']}];
 assert.equal(project(e)[0].away.secondaryColor,'#fff41b');assert.equal(project(e)[0].away.darkLogo,'/dark.png');assert.equal(project(e)[0].away.logo,'/away.png');
 t.alternateColor='not-a-colour';t.logos=[];assert.equal(project(e)[0].away.secondaryColor,null);assert.equal(project(e)[0].away.darkLogo,null);
});


test('exact CFB provider variants retain primary backgrounds for previously failed exports',async()=>{
 const {pregameTeamAppearance}=await import(await compileLocalModule(new URL('../app/features/exports/game-overlay.ts',import.meta.url)));
 for(const [id,color]of [['277','eaaa00'],['2628','4d1979'],['164','ce0e2d'],['77','492f92'],['2199','006938'],['195','154734'],['2483','00934b'],['2633','ff8200'],['150','00539b'],['326','501214']]){
  const e=scheduled();e.competitions[0].competitors[0].team={id,color,displayName:'Exact source identity',logo:'/original.png'};
  const team=project(e)[0].away,appearance=pregameTeamAppearance(team);assert.ok(team.primarySurfaceLogo?.endsWith('/primary_logo_on_primary_color.png'),id);assert.equal(appearance.surface,'#'+color);assert.equal(appearance.logo,team.primarySurfaceLogo);assert.notEqual(appearance.surface,'#fffaf0');
 }
 const e=scheduled();e.competitions[0].competitors[0].team={id:'277',color:'123456',displayName:'West Virginia Mountaineers',logo:'/original.png'};
 assert.equal(project(e)[0].away.primarySurfaceLogo,null);e.competitions[0].competitors[0].team.color='eaaa00';assert.equal(project(e,'NFL')[0].away.primarySurfaceLogo,null);
});

test('live projection supports scores, period, clock, half and overtime without masquerading as final',()=>{
 const e=scheduled();e.date='2026-10-20T10:00Z';const c=e.competitions[0];c.status={type:{state:'in',name:'STATUS_IN_PROGRESS',completed:false},period:1,displayClock:'4:32'};
 let g=project(e)[0];assert.equal(g.stage,'live');assert.equal(g.liveLabel,'LIVE | 1st · 4:32');assert.equal(g.away.score,0);
 c.status.type.name='STATUS_HALFTIME';assert.equal(project(e)[0].liveLabel,'LIVE | HALF');
 c.status.type.name='STATUS_IN_PROGRESS';c.status.period=6;delete c.status.displayClock;assert.equal(project(e)[0].liveLabel,'LIVE | 2OT');
 c.competitors[0].score=null;assert.deepEqual(project(e),[]);
});
test('existing CFB rivalry catalogue applies to pregame, live and final overlays',()=>{
 const e=scheduled(),c=e.competitions[0];c.competitors[0].team.displayName='Akron Zips';c.competitors[1].team.displayName='Kent State Golden Flashes';
 assert.match(project(e)[0].context,/RIVALRY — Akron–Kent State Rivalry/);
 e.date='2026-10-20T10:00Z';c.status={type:{state:'in',name:'STATUS_IN_PROGRESS',completed:false},period:1};assert.match(project(e)[0].context,/RIVALRY/);
 c.status.type={state:'post',name:'STATUS_FINAL',completed:true};assert.match(project(e)[0].context,/RIVALRY/);
});
test('retained CFB live observation projects exact scores; refreshed scores and final status replace the prior export',()=>{
 const retained=JSON.parse(readFileSync(new URL('./fixtures/cfb-live-week8.json',import.meta.url),'utf8'));
 const event=retained.scoreboard.events[0],c=event.competitions[0];
 const at=retained.observedAt??'2026-10-22T23:00:00Z';
 const rows=projectOverlayGames({events:[event]},'CFB',at),g=rows[0];assert.equal(g.stage,'live');
 assert.equal(g.away.score,Number(c.competitors.find(t=>t.homeAway==='away').score));assert.equal(g.home.score,Number(c.competitors.find(t=>t.homeAway==='home').score));
 const changed=structuredClone(event),own=changed.competitions[0].competitors.find(t=>t.homeAway==='away');own.score=String(Number(own.score)+7);
 assert.equal(projectOverlayGames({events:[changed]},'CFB',at)[0].away.score,g.away.score+7);
 changed.competitions[0].status.type={state:'post',name:'STATUS_FINAL',completed:true};changed.status=changed.competitions[0].status;
 assert.equal(projectOverlayGames({events:[changed]},'CFB',at)[0].stage,'final');
});
test('retained final summaries preserve explicit rank and total record fields without borrowing conference records',()=>{
 const retained=JSON.parse(readFileSync(new URL('./fixtures/game-details/cfb-final.json',import.meta.url),'utf8')).summary;
 const c=retained.header.competitions[0],event={...retained.header,date:c.date,competitions:[c]};
 const g=projectOverlayGames({events:[event]},'CFB','2026-10-24T00:00Z')[0];
 for(const [side,team] of [['away',g.away],['home',g.home]]){
  const source=c.competitors.find(t=>t.homeAway===side);assert.equal(team.rank,source.rank??null);assert.equal(team.record,source.record.find(r=>r.type==='total').summary);
 }
 const e=scheduled(),own=e.competitions[0].competitors[0];own.record=[{type:'vsconf',summary:'3-1'}];assert.equal(project(e)[0].away.record,null);
 own.record=[{type:'total',summary:'0-0'}];assert.equal(project(e)[0].away.record,'0-0');
 own.records=[{type:'total',summary:'4-1'}];assert.equal(project(e)[0].away.record,null);
});

test('all 32 retained NFL primary-surface logos reach scheduled overlays, including Packers and Lions',async()=>{
 const {pregameTeamAppearance}=await import(await compileLocalModule(new URL('../app/features/exports/game-overlay.ts',import.meta.url)));
 const retained=JSON.parse(readFileSync(new URL('../app/features/exports/nfl-overlay-logo-variants.json',import.meta.url),'utf8'));
 assert.equal(Object.keys(retained.teams).length,32);
 for(const [id,entry] of Object.entries(retained.teams)){
  const e=scheduled();e.competitions[0].competitors[0].team={id,displayName:'Retained NFL team',color:entry.color,logo:'/original.png'};e.competitions[0].competitors[1].team.id='999';
  const game=project(e,'NFL')[0],appearance=pregameTeamAppearance(game.away);
  assert.equal(appearance.surface,entry.color);assert.equal(appearance.logo,entry.logo);assert.notEqual(appearance.surface,'#fffaf0');
  e.competitions[0].competitors[0].team.color='abcdef';assert.equal(project(e,'NFL')[0].away.primarySurfaceLogo,null,'colour mismatch fails closed');
 }
 assert.equal(retained.teams['9'].color,'#204e32');assert.equal(retained.teams['8'].color,'#0076b6');
 const final=scheduled();final.competitions[0].status={type:{state:'post',name:'STATUS_FINAL',completed:true}};final.competitions[0].competitors[0].team={id:'9',displayName:'Packers',color:'204e32',logo:'/original.png'};
 assert.equal(project(final,'NFL')[0].away.primarySurfaceLogo,null,'final path unchanged');
});
test('NFL header context reuses sourced prime-time and international indicators; ordinary games stay blank',()=>{
 const feed=JSON.parse(readFileSync(new URL('fixtures/nfl-export-context.json',import.meta.url),'utf8'));
 const rows=projectOverlayGames(feed,'NFL','2026-10-25T16:00:00Z');
 assert.equal(rows.find(g=>g.id==='401873010').context,'THURSDAY NIGHT FOOTBALL');
 assert.match(rows.find(g=>g.id==='401873011').context,/^INTERNATIONAL GAME · SAINT-DENIS, FRANCE$/);
 assert.equal(rows.find(g=>g.id==='401873017').context,null);
 for(const row of rows)assert.doesNotMatch(row.context??'',/NFL Regular Season|RIVALRY/);
});
test('NFL neutral venue and Thursday date alone never invent an international or TNF distinction',()=>{
 const e=scheduled();e.date='2026-10-23T00:15:00Z';e.competitions[0].status={type:{name:'STATUS_FINAL',state:'post',completed:true}};
 e.competitions[0].neutralSite=true;e.competitions[0].venue={address:{city:'London'}};e.competitions[0].broadcasts=[{names:['CBS']}];
 assert.equal(project(e,'NFL')[0].context,null);
 e.competitions[0].broadcasts=[{names:['Prime Video']}];assert.equal(project(e,'NFL')[0].context,'THURSDAY NIGHT FOOTBALL');
});
test('owner examples: unranked winners upset ranked USC and Iowa; ranked outcomes keep their existing distinctions',()=>{
 const feed=JSON.parse(readFileSync(new URL('fixtures/cfb-export-owner-examples.json',import.meta.url),'utf8'));
 const rows=projectOverlayGames(feed,'CFB','2026-10-25T17:00:00Z'),byId=id=>rows.find(g=>g.id===id);
 assert.equal(byId('401858500').context,'RANKED UPSET');
 assert.match(byId('401858497').context,/RIVALRY.*Iowa–Minnesota.*RANKED UPSET/);
 assert.equal(byId('401856732').context,'RANKED UPSET');
 assert.equal(byId('401856837').context,'RANKED MATCHUP');
 assert.equal(byId('401858500').away.rank,16);assert.equal(byId('401858500').home.rank,null);
 assert.equal(byId('401858497').away.score,10);assert.equal(byId('401858497').home.score,13);
});
test('upsets work for either winning side, require a ranked loser and a final non-tied result',()=>{
 for(const awayWins of [true,false]){const e=scheduled(),c=e.competitions[0];c.status={type:{name:'STATUS_FINAL',state:'post',completed:true}};const winner=c.competitors[awayWins?0:1],loser=c.competitors[awayWins?1:0];winner.curatedRank.current=99;winner.score='24';loser.curatedRank.current=16;loser.score='7';assert.equal(project(e)[0].context,'RANKED UPSET');winner.score='7';assert.doesNotMatch(project(e)[0].context??'',/UPSET/);winner.score='24';loser.curatedRank.current=99;assert.doesNotMatch(project(e)[0].context??'',/UPSET/);loser.curatedRank.current=16;winner.curatedRank.current=2;assert.equal(project(e)[0].context,'RANKED MATCHUP');}
});
test('explicit provider logoDark is retained and selected ahead of an unsuitable primary-colour mark on dark surfaces',async()=>{
 const {pregameTeamAppearance,logoForSurface}=await import(await compileLocalModule(new URL('../app/features/exports/game-overlay.ts',import.meta.url)));
 const feed=JSON.parse(readFileSync(new URL('fixtures/cfb-export-owner-examples.json',import.meta.url),'utf8'));
 const iowa=projectOverlayGames(feed,'CFB','2026-10-25T17:00:00Z').find(g=>g.id==='401858497').away;
 assert.equal(iowa.darkLogo,'https://a.espncdn.com/i/teamlogos/ncaa/500-dark/2294.png');
 assert.equal(logoForSurface(iowa,'#000000'),iowa.darkLogo);
 const appearance=pregameTeamAppearance(iowa);assert.equal(appearance.surface,'#000000');assert.equal(appearance.logo,iowa.darkLogo);
 const light={...iowa,color:'#fffaf0',primarySurfaceLogo:null};assert.equal(logoForSurface(light,'#fffaf0'),iowa.logo);
});

test('export brand colour correction is shared, league-scoped and leaves other team colours intact',async()=>{
 const {exportTeamColour,pregameTeamAppearance}=await import(await compileLocalModule(new URL('../app/features/exports/game-overlay.ts',import.meta.url)));
 assert.equal(exportTeamColour('CFB','2294','231f20'),'#000000');
 assert.equal(exportTeamColour('NFL','2294','231f20'),'#231f20');
 for(const colour of ['#231f20','#000000','#154734','#461d7c','#ffb81c','#ffffff','#9d2235']){
  assert.equal(exportTeamColour('CFB','other',colour),colour);
  for(const darkLogo of [null,'/dark.png']){
   const appearance=pregameTeamAppearance({id:'other',color:colour,logo:'/default.png',darkLogo,primarySurfaceLogo:'/primary.png'});
   assert.equal(appearance.surface,colour);assert.ok(appearance.logo);
  }
 }
});
