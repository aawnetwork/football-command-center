import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../app/lib/cfb-helpers.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {weeklyTeamCategories,teamCategories,buildWeeklyTeamLeaders,buildTeamLeaders,formatStatValue}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

test('CFB weekly team tackles are labelled as tackles; season yards-allowed category is preserved',()=>{
 assert.equal(weeklyTeamCategories.find(c=>c.id==='total-defense').name,'Tackles');
 assert.equal(teamCategories.find(c=>c.id==='total-defense').name,'Total Defense');
 const row=(team,value,playerId)=>({team,player:team,playerId,gameId:1,category:'defensive',stat:'TOT',value});
 const rows=buildWeeklyTeamLeaders([row('One',30),row('Two',0),row('One',20,123)],'total-defense');
 assert.deepEqual(rows.map(r=>[r.team,r.value]),[['One',30],['Two',0]]);
 assert.equal(formatStatValue('total-defense',30),'30 tackles');
 assert.deepEqual(buildWeeklyTeamLeaders([],'total-defense'),[],'absent team observations do not create zero rows');
});
test('CFB team season ordering remains lower-first for defense and higher-first for offense',()=>{
 const rows=[{team:'One',type:'team',category:'total-defense',stat:300},{team:'Two',type:'team',category:'total-defense',stat:200}];
 assert.deepEqual(buildTeamLeaders(rows,'total-defense').map(r=>r.team),['Two','One']);
 assert.deepEqual(buildTeamLeaders(rows.map(r=>({...r,category:'total-offense'})),'total-offense').map(r=>r.team),['One','Two']);
});
