import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Compile the real local module graph in memory; no Next server, source writes
// or production/environment credentials. One cache preserves shared singletons.
const compiled = new Map();
async function compile(file) {
  const path = file.href;
  if (compiled.has(path)) return compiled.get(path);
  if (file.pathname.endsWith('.json')) {
    const url = 'data:text/javascript;base64,' + Buffer.from('export default ' + await readFile(file, 'utf8')).toString('base64'); compiled.set(path, url); return url;
  }
  let js = ts.transpileModule(await readFile(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const match of [...js.matchAll(/from (['"])(\.[^'"]+)\1/g)]) {
    const dependency = new URL(match[2] + (/\.(ts|json)$/.test(match[2]) ? '' : '.ts'), file);
    js = js.replace(match[0], `from ${JSON.stringify(await compile(dependency))}`);
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64'); compiled.set(path, url); return url;
}
const file = path => new URL('../' + path, import.meta.url);

const {buildCfbSeason,cfbSeasonTotals,cfbSeasonResponse}=await import(await compile(file('app/lib/stats-v2/cfb-season.ts')));
const {statsUpdateStatus}=await import(await compile(file('app/preview/nfl-stats/update-status.ts')));
const id='espn:cfb:athlete:123';
const cols=['completions','attempts','passing_yards','passing_tds','passing_interceptions','carries','rushing_yards','rushing_tds','rushing_long','receptions','receiving_yards','receiving_tds','receiving_long','tackles','def_sacks','def_tackles_for_loss','def_interceptions'];
const cells=patch=>cols.map(k=>patch[k]??null);
function fixture(){return {data:{season:2026,phase:'REG',columns:cols,players:[id],teams:{'1':{name:'A',logo:null,fbs:true},'2':{name:'B',logo:null,fbs:true}},games:[1,2,3,4,5,6,7,8].map(week=>({id:'espn:cfb:game:'+week,week,kickoff:`2026-09-${String(week).padStart(2,'0')}T12:00Z`,observedAt:'2026-10-21T12:00Z',home:'1',away:'2'})),rows:[[0,0,'1','2',cells({completions:1,attempts:2,passing_yards:20,passing_tds:0,passing_interceptions:0,carries:2,rushing_yards:10,rushing_tds:0,rushing_long:8,receptions:1,receiving_yards:20,receiving_tds:0,receiving_long:20,tackles:1,def_sacks:.5,def_tackles_for_loss:.5,def_interceptions:0})],[0,1,'1','2',cells({completions:9,attempts:10,passing_yards:90,passing_tds:1,passing_interceptions:0,carries:3,rushing_yards:30,rushing_tds:0,rushing_long:18,receptions:2,receiving_yards:15,receiving_tds:1,receiving_long:10,tackles:2,def_sacks:1.5,def_tackles_for_loss:1,def_interceptions:1})]]},meta:{season:2026,throughWeek:7,names:{[id]:'Same Name'},conferences:{'1':'A','2':'B'},positions:{[id+'|1']:{position:'QB'}}}};}
test('season sums all retained appearances, weights rates and maximises longest gains',()=>{
 const {data,meta}=fixture(),line=buildCfbSeason(data,meta).lines[0];
 assert.equal(line.metrics.passing_yards.value,110);assert.ok(Math.abs(line.metrics.completion_pct.value-100*10/12)<1e-10);assert.equal(line.metrics.rushing_yards_per_carry.value,8);assert.equal(line.metrics.receiving_yards_per_reception.value,35/3);
 assert.equal(line.metrics.rushing_long.value,18);assert.equal(line.metrics.receiving_long.value,20);assert.equal(line.metrics.def_sacks.value,2);assert.equal(line.metrics.def_tackles_for_loss.value,1.5);assert.equal(line.metrics.tackles.value,3);assert.deepEqual(line.categories,['QB','Rush','Rec','Def']);
 const many=structuredClone(data);many.rows=Array.from({length:7},(_,i)=>[0,i,'1','2',data.rows[0][4]]);assert.equal(buildCfbSeason(many,meta).lines[0].metrics.passing_yards.value,140);
});
test('zero remains zero, unknown stays missing, zero denominators are N/A',()=>{
 const a=cfbSeasonTotals([[0,0,'1','2',cells({completions:0,attempts:0,passing_yards:0})]],cols);
 assert.equal(a.passing_yards.value,0);assert.equal(a.completion_pct.state,'not-applicable');assert.equal(a.passing_yards_per_attempt.state,'not-applicable');assert.equal(a.carries.state,'missing');
 const {data}=fixture();data.rows[1][4][cols.indexOf('attempts')]=null;
 const total=cfbSeasonTotals(data.rows,cols);assert.equal(total.attempts.value,null);assert.equal(total.completion_pct.value,null);
 data.rows[0][4][cols.indexOf('rushing_yards')]=NaN;assert.equal(cfbSeasonTotals(data.rows,cols).rushing_yards.value,null);
});
test('absent activity is never zero; interception season totals stay unsupported even with positive rows',()=>{
 const {data,meta}=fixture();data.rows[1][4][cols.indexOf('carries')]=null;
 const line=buildCfbSeason(data,meta).lines[0];assert.equal(line.metrics.carries.value,null);assert.equal(line.metrics.rushing_yards_per_carry.value,null);assert.equal(line.metrics.def_interceptions.value,null);
 assert.equal(cfbSeasonTotals([data.rows[1]],cols).def_interceptions.value,null);
});
test('identical duplicates collapse; conflicting game observations withhold the whole player total',()=>{
 const {data,meta}=fixture();data.rows.push(structuredClone(data.rows[0]));assert.equal(buildCfbSeason(data,meta).lines[0].metrics.passing_yards.value,110);
 data.rows.at(-1)[4][0]=2;const model=buildCfbSeason(data,meta);assert.equal(model.lines.length,0);assert.equal(model.conflictingAppearances,1);
});
test('QB requires exact season player and own-team position; activity categories remain independent',()=>{
 const {data,meta}=fixture();delete meta.positions[id+'|1'];meta.positions['espn:cfb:athlete:999|1']={position:'QB'};
 let model=buildCfbSeason(data,meta);assert.equal(model.lines[0].categories.includes('QB'),false);assert.equal(model.unresolvedPassers,1);assert.ok(model.lines[0].categories.includes('Rush'));
 meta.positions[id+'|1']={position:'WR'};model=buildCfbSeason(data,meta);assert.equal(model.lines[0].categories.includes('QB'),false);assert.equal(model.nonQbPassers,1);
 assert.throws(()=>buildCfbSeason(data,{...meta,season:2025}));
});
test('transfers keep separate stints and own-team conference totals; no name joins',()=>{
 const {data,meta}=fixture();data.rows[1][2]='2';data.rows[1][3]='1';meta.positions[id+'|2']={position:'QB'};
 const all=buildCfbSeason(data,meta).lines[0];assert.equal(all.stints.length,2);assert.equal(all.metrics.passing_yards.value,110);assert.equal(all.stints[1].metrics.passing_yards.value,90);
 assert.equal(buildCfbSeason(data,meta,'A').lines[0].metrics.passing_yards.value,20);assert.equal(buildCfbSeason(data,meta,'B').lines[0].metrics.passing_yards.value,90);assert.equal(buildCfbSeason(data,meta,'unknown').lines.length,0);
 delete meta.positions[id+'|2'];assert.equal(buildCfbSeason(data,meta).lines[0].categories.includes('QB'),false);
 data.players.push('espn:cfb:athlete:999');meta.names[data.players[1]]='Same Name';data.rows.push([1,0,'1','2',data.rows[0][4]]);assert.equal(buildCfbSeason(data,meta).lines.length,2);
});
test('future weeks cannot enter the snapshot and invalid identities fail closed',()=>{
 const {data,meta}=fixture();data.rows.push([0,7,'1','2',data.rows[0][4]]);assert.equal(buildCfbSeason(data,meta).lines[0].metrics.passing_yards.value,110);
 data.teams['1'].fbs=false;assert.throws(()=>buildCfbSeason(data,meta));data.teams['1'].fbs=true;
 data.rows[0][2]='999';assert.throws(()=>buildCfbSeason(data,meta));
});
test('real fixed snapshot serves all categories without fetches; unsupported season metrics have no ranks',async()=>{
 const saved=globalThis.fetch;globalThis.fetch=()=>{throw Error('No provider requests authorised');};
 try{for(const category of ['QB','Rush','Rec','Def']){
  const response=cfbSeasonResponse(new URLSearchParams(),'leaders',category,null);assert.equal(response.status,200);const body=await response.json();assert.equal(body.coveredGames,510);assert.equal(body.retainedAppearances,29483);assert.equal(body.period.week,null);assert.equal(body.throughWeek,7);assert.equal(body.complete,false);assert.equal(body.independentNationalCertification,false);assert.equal(body.lines.length,({QB:170,Rush:1475,Rec:1980,Def:5397})[category]);assert.equal(body.confidence[body.columns[0]].supportedPlayers,({QB:151,Rush:1001,Rec:1357,Def:4931})[category]);assert.equal(body.scope,'retained-espn-season');
  assert.equal(new Set(body.lines.map(r=>r.id)).size,body.lines.length);assert.ok(body.lines.every(r=>!r.playingNow));
  if(category==='Def'){assert.equal(body.confidence.def_interceptions.status,'unverified');assert.equal(body.confidence.def_interceptions.supportedPlayers,0);assert.ok(body.lines.every(r=>r.values[body.columns.indexOf('def_interceptions')]===null));}
  const params=new URLSearchParams({snapshot:body.snapshot,players:body.lines[0].id});const detail=await cfbSeasonResponse(params,'details',category,null).json();assert.ok(detail.lines[0].games.length<=5);assert.ok(detail.lines[0].games.every(g=>g.week<=7));
  for(let i=1;i<detail.lines[0].games.length;i++)assert.ok(detail.lines[0].games[i-1].week>=detail.lines[0].games[i].week);
  assert.deepEqual(detail.lines[0].metrics[body.columns[0]].value,body.lines[0].values[0]);
 }}finally{globalThis.fetch=saved;}
});
test('season details isolate conference/snapshot identities; exports and current-style status are withheld',async()=>{
 const body=await cfbSeasonResponse(new URLSearchParams(),'leaders','Rush',null).json();
 assert.equal(cfbSeasonResponse(new URLSearchParams({snapshot:body.snapshot,players:body.lines[0].id}),'details','Rush','1').status,400);
 assert.equal(cfbSeasonResponse(new URLSearchParams({week:'8'}),'leaders','Rush',null).status,400);
 assert.equal(cfbSeasonResponse(new URLSearchParams(),'export','Rush',null).status,409);assert.equal(cfbSeasonResponse(new URLSearchParams(),'status','Rush',null).status,409);
});
test('actual UI retains tied sorting and null ranks; season is explicitly historical with no live claims',async()=>{
 const ui=await readFile(file('app/preview/nfl-stats/stats-preview.tsx'),'utf8');
 assert.match(ui,/Season totals\$\{data\?\.throughWeek/);assert.match(ui,/retained-espn-season/);assert.match(ui,/historical: mode === 'weekly' && week === '7'/);
 const fragment=ui.slice(ui.indexOf('  const ranked ='),ui.indexOf('  const positions ='));
 const sort=new Function('data','value','metric','ascending',ts.transpileModule(fragment,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return {ranked,ranks};');
 const data={lines:[{id:'b',values:[5]},{id:'a',values:[5]},{id:'c',values:[null]},{id:'d',values:[0]}]};
 const {ranks}=sort(data,row=>row.values[0],'yards',false);assert.equal(ranks.get('a'),'1');assert.equal(ranks.get('b'),'1');assert.equal(ranks.get('d'),'3');assert.equal(ranks.get('c'),'—');
 const status=statsUpdateStatus({scope:'retained-espn-season',observationAt:'2026-10-21T12:00Z',lines:[{playingNow:true}]},Date.now(),false,false);assert.equal(status.cadence,'Historical ESPN snapshot');assert.ok(status.snapshot);assert.doesNotMatch(status.cadence,/LIVE|30 seconds/);
});

test('CFB Season includes existing exact-team logos for every category without changing history',async()=>{
 const historyText=await readFile(file('app/lib/stats-v2/cfb-player-history.json'),'utf8');
 const history=JSON.parse(historyText),directory=JSON.parse(await readFile(file('app/lib/cfb-team-display-2026.json'),'utf8')).teams;
 assert.equal(history.teams['204'].logo,null);assert.ok(directory['204'].logo);
 for(const category of ['QB','Rush','Rec','Def']){
  const response=await cfbSeasonResponse(new URLSearchParams(),'leaders',category,null).json();
  assert.equal(response.logos['204'],directory['204'].logo);
  assert.equal(response.teams['204'].logo,directory['204'].logo);
  for(const [id,team] of Object.entries(history.teams)){
   assert.equal(response.logos[id],team.logo??directory[id]?.logo??null);
   assert.equal(response.teams[id].name,team.name);
  }
  assert.ok(response.lines.length>0);
  for(const row of response.lines)for(const team of row.teams)if(directory[team]?.logo)assert.equal(response.logos[team],directory[team].logo);
 }
 assert.equal(await readFile(file('app/lib/stats-v2/cfb-player-history.json'),'utf8'),historyText);
});
