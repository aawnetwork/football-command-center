import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const schools=JSON.parse(await readFile(new URL('../app/lib/cfb-ncaa-season-schools.json',import.meta.url),'utf8'));
const code=(await readFile(new URL('../app/lib/cfb-season-team-stats.ts',import.meta.url),'utf8')).replace("import schools from './cfb-ncaa-season-schools.json';",'const schools='+JSON.stringify(schools)+';');
const url='data:text/javascript;base64,'+Buffer.from(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const {ncaaTeamDefinitions,projectNcaaSeasonTeam,cfbSeasonTeamLeaders,formatCfbSeasonTeam,cfbSeasonTeamCoverage,ncaa2026Cutoff}=await import(url);
const updated='Saturday, October 17, 2026 12:10 am - Through games Friday, October 16, 2026';
const row=(team='Ohio St.',stat='10',category='total-offense',date=updated)=>projectNcaaSeasonTeam({Team:team,...(['sacks','turnover-margin'].includes(category)?{G:'2',Avg:String(Number(stat)/2)}:{}),[ncaaTeamDefinitions[category].field]:stat},category,date);
test('all ten existing field contracts distinguish totals, per-game values and turnover margin',()=>{
 assert.equal(Object.keys(ncaaTeamDefinitions).length,10);
 for(const [category,d] of Object.entries(ncaaTeamDefinitions)){
  const r=projectNcaaSeasonTeam({Team:'Ohio St.',G:'6',...(['sacks','turnover-margin'].includes(category)?{Avg:'2'}:{}),[d.field]:'12'},category,updated);assert.equal(r.stat,12);assert.equal(r.sourceUpdated,updated);assert.equal(r.gamesPlayed,6);assert.match(formatCfbSeasonTeam(category,12),new RegExp(d.unit));
 }
 assert.equal(formatCfbSeasonTeam('total-defense',200.5),'200.5 YPG allowed');assert.equal(formatCfbSeasonTeam('scoring-offense',30),'30 PPG');assert.equal(formatCfbSeasonTeam('total-offense',1203),'1,203 yards total');assert.equal(formatCfbSeasonTeam('turnover-margin',-2),'-2 turnover margin total');
});
test('genuine zero is ranked; missing, invalid and unavailable observations stay missing',()=>{
 for(const value of [null,undefined,'',' ','NaN',NaN,Infinity,'5 yards',false]){
  const r=value===undefined?projectNcaaSeasonTeam({Team:'Ohio St.'},'total-offense',updated):row('Ohio St.',value);assert.equal(r.stat,null);const [leader]=cfbSeasonTeamLeaders([r],'total-offense');assert.ok(Number.isNaN(leader.value));assert.equal(leader.rank,null);assert.equal(formatCfbSeasonTeam('total-offense',leader.value),'—');
 }
 assert.equal(row('Ohio St.','-1','sacks').stat,null);assert.equal(row('Ohio St.','0.3','sacks').stat,null);assert.equal(row('Ohio St.','0.5','sacks').stat,.5);assert.equal(row('Ohio St.','-1','scoring-offense').stat,null);assert.equal(row('Ohio St.','+2','turnover-margin').stat,2);
 const [zero]=cfbSeasonTeamLeaders([row('Ohio St.','0')],'total-offense');assert.equal(zero.value,0);assert.equal(zero.rank,1);
});
test('exact retained FBS names distinguish Miami schools and reject unverified/FCS schools',async()=>{
 const names=schools.schools.filter(n=>n.includes('Miami'));assert.equal(names.length,2);
 const result=cfbSeasonTeamLeaders([...names.map(n=>row(n)),row('Miami'),row('Montana')],'total-offense');assert.deepEqual(new Set(result.map(r=>r.team)),new Set(names));
 const fixture=JSON.parse(await readFile(new URL('./fixtures/cfb-season-schools.json',import.meta.url),'utf8'));assert.deepEqual(schools.schools,fixture.ncaaSchools);
});
test('only a verified 2026 source cutoff supports ranks; publication wording is retained verbatim',()=>{
 assert.equal(ncaa2026Cutoff(updated),true);
 for(const date of [undefined,'unknown','Updated October 2026',updated.replaceAll('2026','2025'),updated.replaceAll('2026','2027')])assert.equal(cfbSeasonTeamLeaders([{...row('Ohio St.','100'),sourceUpdated:date}],'total-offense')[0].rank,null);
 assert.match(cfbSeasonTeamCoverage([row()],'total-offense'),/Through games Friday, October 16, 2026/);
});
test('competition ranks, correct directions and missing observations last apply across all categories',()=>{
 for(const category of Object.keys(ncaaTeamDefinitions)){
  const result=cfbSeasonTeamLeaders([row('Ohio St.','10',category),row('Alabama','10',category),row('Michigan','0',category),row('Georgia','',category)],category);
  const ascending=['total-defense','rushing-defense','passing-defense','scoring-defense'].includes(category);
  assert.equal(result[0].value,ascending?0:10);assert.equal(result.at(-1).rank,null);assert.equal(result.at(-1).team,'Georgia');
  const tied=result.filter(r=>r.value===10);assert.equal(tied[0].rank,tied[1].rank);assert.equal(tied[0].rank,ascending?2:1);
 }
});
test('duplicate schools cannot silently gain ranks; reported population is separate from national certification',()=>{
 const rows=[row(),row(),row('Alabama','0'),row('FCS School','99')],leaders=cfbSeasonTeamLeaders(rows,'total-offense');assert.equal(leaders.length,2);assert.equal(leaders.find(r=>r.team==='Ohio St.').rank,null);assert.equal(leaders.find(r=>r.team==='Alabama').rank,1);
 const coverage=cfbSeasonTeamCoverage(rows,'total-offense');assert.match(coverage,/1\/2/);assert.match(coverage,/138 retained FBS/);assert.match(coverage,/1 unverified school/);assert.match(coverage,/National completeness is unverified/);
});
test('all recognised schools remain reachable and unrelated categories cannot pollute a selection',()=>{
 const rows=schools.schools.map((name,i)=>row(name,String(i)));rows.push(row('Ohio St.','9999','rushing-offense'));
 const leaders=cfbSeasonTeamLeaders(rows,'total-offense');assert.equal(leaders.length,138);assert.equal(leaders[0].value,137);assert.ok(leaders.every(r=>r.rank!==null));
});
test('sacks and turnover rates cannot masquerade as season totals without source corroboration',()=>{
 for(const category of ['sacks','turnover-margin']){
  const field=ncaaTeamDefinitions[category].field;
  assert.equal(projectNcaaSeasonTeam({Team:'Ohio St.',[field]:'2'},category,updated).stat,null);
  assert.equal(projectNcaaSeasonTeam({Team:'Ohio St.',G:'5',Avg:'2',[field]:'2'},category,updated).stat,null);
  assert.equal(projectNcaaSeasonTeam({Team:'Ohio St.',G:'5',Avg:'0.4',[field]:'2'},category,updated).stat,2);
 }
});
test('actual Team Stats view uses only the NCAA snapshot; player merges and weekly helpers remain independent',async()=>{
 const page=await readFile(new URL('../app/cfb/page.tsx',import.meta.url),'utf8');
 assert.match(page,/if \(statsView === "team"\) return cfbSeasonTeamLeaders\(seasonStats, selectedCategory\);\s*const currentSeasonStats = mergeLiveSeasonStats/);
 assert.match(page,/return cfbWeeklyTeamLeaders\(weeklyTeams, selectedCategory\)/);assert.match(page,/formatCfbSeasonTeam\(selectedCategory,leader.value\)/);assert.match(page,/cfbSeasonTeamCoverage\(seasonStats,selectedCategory\)/);assert.match(page,/leader.rank === null \? "—"/);assert.match(page,/statsMode === "season" && statsView === "team" \? leaders.length : 25/);
});
test('retained NCAA leading-decimal averages corroborate genuine sack and turnover totals',()=>{
 const sack=projectNcaaSeasonTeam({Team:'Marshall',G:'7',Sacks:'6.0',Avg:'.86'},'sacks',updated);
 assert.equal(sack.stat,6);
 const margin=projectNcaaSeasonTeam({Team:'Louisville',G:'6',Margin:'5',Avg:'.83'},'turnover-margin',updated);
 assert.equal(margin.stat,5);
 assert.equal(projectNcaaSeasonTeam({Team:'Louisville',G:'6',Margin:'5',Avg:'.23'},'turnover-margin',updated).stat,null);
});
