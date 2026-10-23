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
