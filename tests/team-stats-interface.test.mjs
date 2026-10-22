import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const file=p=>new URL('../'+p,import.meta.url),read=p=>readFile(file(p),'utf8'),cache=new Map();
async function compile(url){
 if(cache.has(url.href))return cache.get(url.href);
 if(url.pathname.endsWith('.json')){const result='data:text/javascript;base64,'+Buffer.from('export default '+await readFile(url,'utf8')).toString('base64');cache.set(url.href,result);return result;}
 let code=ts.transpileModule(await readFile(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const match of [...code.matchAll(/from (['"])(\.[^'"]+)\1/g)])code=code.replace(match[0],'from '+JSON.stringify(await compile(new URL(match[2]+(/\.(ts|json)$/.test(match[2])?'':'.ts'),url))));
 const result='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(url.href,result);return result;
}
const model=await import(await compile(file('app/features/stats/team-stats-model.ts')));
const {teamColumns,rankTeamRows,nflTeamData,cfbWeeklyData,cfbSeasonData}=model;
const {loadTeamStats,startTeamChecks}=await import(await compile(file('app/features/stats/team-stats-load.ts')));
const metadata=JSON.parse(await read('app/lib/cfb-team-display-2026.json'));
const updated='Saturday, October 17, 2026 - Through games Friday, October 16, 2026';
const fixture=JSON.parse(await read('tests/fixtures/nfl-team-boxscore.json'));
const {projectWeeklyTeams}=await import(await compile(file('app/lib/nfl-weekly-team-stats.ts')));
const weeklyNfl=()=>({season:2026,mode:'weekly',week:2,availableWeeks:[1,2],stats:projectWeeklyTeams(fixture,2,fixture.observedAt),coverage:'Reported net team boxscores only.'});
const cfbId=Object.keys(metadata.teams).find(id=>metadata.teams[id].ncaa==='Ohio St.');
const cfbOther=Object.keys(metadata.teams).find(id=>metadata.teams[id].conferenceId!==metadata.teams[cfbId].conferenceId);
const weekData=()=>({season:2026,week:7,games:1,complete:false,observedAt:'2026-10-20T12:00Z',excludedNonFbs:0,unverifiedTeams:0,rows:[cfbId,cfbOther].map((id,i)=>({teamId:'espn:cfb:team:'+id,team:metadata.teams[id].name,gameId:'espn:cfb:game:123',values:{'total-offense':i?null:0,'passing-offense':i?50:0,'rushing-offense':i?null:0,'total-defense':i?10:0,sacks:i?0.5:0}}))});
test('compact column groups expose only appropriate league/period metrics and units',()=>{
 assert.equal(teamColumns('NFL','weekly','Offense').length,4);assert.equal(teamColumns('NFL','weekly','Defense').length,5);assert.equal(teamColumns('CFB','weekly','Offense').length,3);assert.equal(teamColumns('CFB','weekly','Defense').length,6);
 for(const league of ['NFL','CFB']){assert.equal(teamColumns(league,'weekly','Other').length,0);assert.equal(teamColumns(league,'season','Other').length,1);}
 assert.equal(teamColumns('CFB','weekly','Defense').find(c=>c.id==='total-defense').label,'TACKLES');assert.equal(teamColumns('CFB','weekly','Defense').find(c=>c.id==='total-defense').lower,false);
 assert.equal(teamColumns('CFB','season','Defense')[0].unit,'YPG allowed');assert.equal(teamColumns('CFB','season','Defense')[0].lower,true);assert.equal(teamColumns('CFB','season','Offense')[0].unit,'yards total');
 assert.equal(teamColumns('NFL','season','Offense').find(c=>c.id==='passing-offense').unit,'gross yards total');assert.equal(teamColumns('NFL','weekly','Offense')[1].unit,'net yards');
});
test('NFL weekly comparisons use existing verified net totals, zeros and correct defensive directions',()=>{
 const columns=[...teamColumns('NFL','weekly','Offense'),...teamColumns('NFL','weekly','Defense')];const data=nflTeamData(weeklyNfl(),'weekly','2',columns);
 const dal=data.rows.find(r=>r.id==='DAL');assert.equal(dal.values['total-offense'],332);assert.equal(dal.values['passing-offense'],266);assert.equal(dal.values.sacks,0);
 assert.equal(rankTeamRows(data.rows,'total-defense',true,'','').rows[0].id,'WAS');
 const broken=weeklyNfl();broken.stats.push({...broken.stats[0],team:'FAKE'});assert.equal(nflTeamData(broken,'weekly','',columns).rows.length,2);
 const duplicate=weeklyNfl();duplicate.stats.push(duplicate.stats[0]);assert.equal(nflTeamData(duplicate,'weekly','',columns).rows.find(r=>r.id===duplicate.stats[0].team).values['total-offense'],null);
});
test('NFL Season exposes supported counts while seven unsupported categories stay missing',()=>{
 const columns=['Offense','Defense','Other'].flatMap(g=>teamColumns('NFL','season',g));const data=nflTeamData({season:2026,mode:'season',week:null,stats:[{team:'WSH',season:'2026',season_type:'REG',aaw_season_verified:'1',passing_yards:'100',rushing_yards:'0',def_sacks:'1.5',points:'999',def_tackles_solo:'999'}]},'season','',columns);
 assert.equal(data.rows[0].id,'WAS');assert.equal(data.rows[0].values['passing-offense'],100);assert.equal(data.rows[0].values['rushing-offense'],0);assert.equal(data.rows[0].values.sacks,1.5);
 for(const metric of ['total-offense','scoring-offense','total-defense','rushing-defense','passing-defense','scoring-defense','turnover-margin'])assert.equal(data.rows[0].values[metric],null);
 assert.match(data.coverage['total-offense'],/unavailable/);
});
test('CFB uses exact FBS membership, reports missing values, and keeps tackles separate from defense yards',()=>{
 const columns=[...teamColumns('CFB','weekly','Offense'),...teamColumns('CFB','weekly','Defense')];const raw=weekData();raw.rows.push({...raw.rows[0],teamId:'espn:cfb:team:999999'});
 const data=cfbWeeklyData(raw,'7',columns);assert.equal(data.rows.length,2);assert.equal(data.rows.find(r=>r.id===cfbId).values['total-offense'],0);assert.equal(data.rows.find(r=>r.id===cfbOther).values['total-offense'],null);
 assert.equal(data.rows.find(r=>r.id===cfbOther).values['total-defense'],10);assert.equal(data.rows.find(r=>r.id===cfbOther).values.sacks,.5);
 const conflict=weekData();conflict.rows.push(conflict.rows[0]);assert.equal(cfbWeeklyData(conflict,'7',columns).rows.find(r=>r.id===cfbId).values['total-offense'],null);
});
test('conference selection recalculates competition ranks; search retains those ranks and true zeros',()=>{
 const rows=[{id:'a',name:'Alpha',aliases:['School A'],conferenceId:'1',values:{x:10}},{id:'b',name:'Beta',aliases:[],conferenceId:'2',values:{x:20}},{id:'c',name:'Charlie',aliases:[],conferenceId:'1',values:{x:10}},{id:'d',name:'Delta',aliases:[],conferenceId:'1',values:{x:0}},{id:'e',name:'Echo',aliases:[],conferenceId:null,values:{x:null}}];
 const all=rankTeamRows(rows,'x',false,'','');assert.equal(all.rows[0].id,'b');assert.equal(all.rows.find(r=>r.id==='a').rank,2);assert.equal(all.rows.at(-1).rank,null);
 const filtered=rankTeamRows(rows,'x',false,'1','');assert.deepEqual(filtered.rows.map(r=>r.rank),[1,1,3]);assert.equal(filtered.supported,3);assert.equal(rankTeamRows(rows,'x',false,'1','school a').rows[0].rank,1);
 assert.equal(rankTeamRows(rows,'x',true,'1','').rows[0].values.x,0);assert.equal(rankTeamRows(rows,'x',false,'unknown','').rows.length,0);
});
test('NCAA Season joins exact identities across columns, retains independent cutoffs and withholds invalid periods',()=>{
 const columns=teamColumns('CFB','season','Offense');const records=columns.map((c,i)=>({id:c.id,type:'team',statType:'TEAM',category:c.id,team:'Ohio St.',name:'Ohio St.',stat:i?0:200,sourceUpdated:i===1?updated.replace('October 16','October 15'):updated}));
 records.push({...records[0],team:'FCS School',stat:999});
 const data=cfbSeasonData(records,columns);assert.equal(data.rows.length,1);assert.equal(data.rows[0].id,cfbId);assert.equal(data.rows[0].values['total-offense'],200);assert.equal(data.rows[0].values['passing-offense'],0);assert.notDeepEqual(data.cutoffs['total-offense'],data.cutoffs['passing-offense']);
 assert.equal(cfbSeasonData(records.map(r=>({...r,sourceUpdated:'unknown'})),columns).rows[0].values['total-offense'],null);
});
test('request selection is bounded, Current Week stays automatic and malformed periods fail safely',async()=>{
 for(const [league,mode,week,match] of [['NFL','weekly','','/api/nfl/team-stats?mode=weekly'],['NFL','season','7','/api/nfl/team-stats?mode=season'],['CFB','weekly','','/api/player-stats?view=teams']]){
  const calls=[];await loadTeamStats(league,mode,week,'Offense',async url=>{calls.push(url);return Response.json(league==='CFB'?weekData():mode==='weekly'?weeklyNfl():{season:2026,mode:'season',week:null,stats:[]});});assert.deepEqual(calls,[match]);
 }
 await assert.rejects(loadTeamStats('NFL','weekly','3','Offense',async()=>Response.json(weeklyNfl())),/period/);assert.throws(()=>cfbWeeklyData({...weekData(),season:2025},'',teamColumns('CFB','weekly','Offense')),/period/);
});
test('CFB Season uses at most two category requests concurrently and isolates failed tables',async()=>{
 let requests=0,active=0,max=0;const data=await loadTeamStats('CFB','season','','Defense',async url=>{
  requests++;active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));active--;const category=new URL(url,'http://fixture').searchParams.get('category');
  if(category==='passing-defense')return new Response('',{status:503});
  return Response.json([{id:category,type:'team',team:'Ohio St.',name:'Ohio St.',category,stat:0,sourceUpdated:updated}]);
 });assert.equal(requests,5);assert.equal(max,2);assert.equal(data.rows[0].values['total-defense'],0);assert.equal(data.rows[0].values['passing-defense'],null);assert.ok(data.warnings.length);assert.match(data.coverage['passing-defense'],/could not be checked/);
});
test('Team checks preserve user-owned state, reject overlapping work and ignore cancelled/late responses',async()=>{
 let resolve,calls=0,timer,checked=0,cleared=0;const saved={group:'Defense',conference:'1',search:'Ohio',metric:'sacks'};
 const stop=startTeamChecks({load:()=>{calls++;return new Promise(r=>resolve=r);},clear:()=>cleared++,success:()=>checked++,failure:()=>assert.fail('failure'),checking(){},setTimer:(fn,delay)=>{assert.equal(delay,30000);timer=fn;return 1;},clearTimer(){},now:()=>100});
 await new Promise(r=>setImmediate(r));assert.equal(cleared,1);await timer();assert.equal(calls,1);resolve({});await new Promise(r=>setImmediate(r));assert.equal(checked,1);const work=timer();assert.equal(calls,2);stop();resolve({});await work;assert.equal(checked,1);assert.deepEqual(saved,{group:'Defense',conference:'1',search:'Ohio',metric:'sacks'});
});
test('failed checks retry without poisoning the next successful response',async()=>{
 let timer,fail=true,errors=0,success=0;const stop=startTeamChecks({load:async()=>{if(fail)throw Error('offline');return {};},clear(){},success:()=>success++,failure:()=>errors++,checking(){},setTimer:fn=>{timer=fn;return 1;},clearTimer(){}});
 await new Promise(r=>setImmediate(r));assert.equal(errors,1);fail=false;await timer();assert.equal(success,1);stop();
});
const componentSource=await read('app/features/stats/TeamStats.tsx');
const require=createRequire(file('app/features/stats/TeamStats.tsx')),componentModule={exports:{}};
const code=ts.transpileModule(componentSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','module','exports',code)(name=>name.endsWith('.css')?{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}:name.includes('TeamLogo')?{TeamLogo:()=>createElement('span',{'data-team-logo':'true'})}:name.includes('use-nfl-preview-teams')?{useNflPreviewTeams:()=>()=>({})}:name==='./team-stats-model'?model:name==='./team-stats-load'?{loadTeamStats,startTeamChecks}:require(name),componentModule,componentModule.exports);
const {TeamStatsTable,default:TeamStats}=componentModule.exports;
test('actual table shows multi-column zero/missing values and a useful whole-metric empty state',()=>{
 const columns=teamColumns('NFL','season','Offense');const data=nflTeamData({season:2026,mode:'season',week:null,stats:[{team:'DAL',season:'2026',season_type:'REG',aaw_season_verified:'1',passing_yards:'100',rushing_yards:'0'}]},'season','',columns);
 const props={data,columns,ascending:false,count:25,sort(){},teamLogo:()=>undefined,emptyMessage:'Net team offense is unavailable. Select another heading.'};
 const unavailable=renderToStaticMarkup(createElement(TeamStatsTable,{...props,metric:'total-offense',ranked:rankTeamRows(data.rows,'total-offense',false,'','')}));assert.match(unavailable,/Net team offense is unavailable/);assert.doesNotMatch(unavailable,/Dallas Cowboys/);assert.match(unavailable,/gross yards total/);
 const available=renderToStaticMarkup(createElement(TeamStatsTable,{...props,metric:'passing-offense',ranked:rankTeamRows(data.rows,'passing-offense',false,'','')}));assert.match(available,/Dallas Cowboys/);assert.match(available,/>100<\/td>/);assert.match(available,/>0<\/td>/);assert.match(available,/>—<\/td>/);assert.match(available,/aria-sort="descending"/);
});
test('actual controls match Player Stats, league branding and isolated integration; no public exports',async()=>{
 for(const league of ['NFL','CFB']){const html=renderToStaticMarkup(createElement(TeamStats,{league}));assert.match(html,/Period/);assert.match(html,/Current Week/);assert.match(html,/Find a team/);assert.match(html,/Offense/);assert.match(html,/Defense/);assert.equal(html.includes('<label>Conference'),league==='CFB');assert.doesNotMatch(html,/Export|Development tools/);assert.equal((html.match(/<h2>Stats<\/h2>/g)??[]).length,1);}
 for(const league of ['nfl','cfb']){const page=await read(`app/${league}/page.tsx`);assert.match(page,new RegExp(`statsPreview.teams && <TeamStats league="${league.toUpperCase()}"`));assert.match(page,/!statsPreview.enabled && !statsPreview.teams/);assert.match(page,/statsPreview.enabled \|\| statsPreview.teams/);assert.match(page,/statsPreview.select\(false\)/);}
 assert.match(componentSource,/sourceGroup=league==='CFB'&&mode==='season'\?group:'Offense'/);assert.match(componentSource,/controller.abort/);assert.match(componentSource,/rankTeamRows/);
});
