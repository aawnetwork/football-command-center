import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const schools=JSON.parse(await readFile(new URL('../app/lib/cfb-ncaa-season-schools.json',import.meta.url),'utf8'));
const helper=compile((await readFile(new URL('../app/lib/cfb-season-team-stats.ts',import.meta.url),'utf8')).replace("import schools from './cfb-ncaa-season-schools.json';",'const schools='+JSON.stringify(schools)+';'));
const source=(await readFile(new URL('../app/api/season-stats/route.ts',import.meta.url),'utf8')).replace('import { statsV2Access } from "../../lib/stats-v2/release-access";', 'const statsV2Access=()=>false;').replace('"../../lib/cfb-season-team-stats"',JSON.stringify(helper)).replace('import { NextResponse } from "next/server";','const NextResponse={json:Response.json};');
const {GET}=await import(compile(source));
const updated='Saturday, October 17, 2026 12:10 am - Through games Friday, October 16, 2026';
test('Season API preserves NCAA cutoff, exact average numerators and every player page',async()=>{
 const old=globalThis.fetch;const requests=[];
 globalThis.fetch=async value=>{const url=new URL(value);requests.push(url);const team=url.pathname.includes('/team/'),endpoint=url.pathname.split('/').at(-1),page=url.searchParams.get('page');return Response.json({updated,pages:2,data:[team?{Team:page?'Second Page Team':'Ohio St.',G:'6',YPG:'200.5',YDS:'1203','Opp Rush Yds':'900','Opp Pass <br/>Yds':'1203',Pts:'180',Avg:'30',PPG:'30'}:{Name:page?'Second Page Player':'First Page Player',Team:'Ohio St.','Pass Yds':'100','Pass TD':'1','Rush Yds':'50','Rush TD':'1','Rec Yds':'25','Rec TD':'1',TT:'10','Tot Sack':'2'}],endpoint})};
 try{const response=await GET(new Request('https://hub.test/api/season-stats'));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const rows=await response.json();
 assert.ok(rows.some(row=>row.name==='Second Page Player'));assert.ok(rows.some(row=>row.team==='Second Page Team'));assert.ok(rows.every(row=>row.sourceUpdated===updated));
 const rushing=rows.find(row=>row.category==='rushing-defense');assert.equal(rushing.stat,200.5);assert.equal(rushing.seasonTotal,900);assert.equal(rushing.gamesPlayed,6);
 const scoring=rows.find(row=>row.category==='scoring-defense');assert.equal(scoring.seasonTotal,180);
 assert.equal(requests.filter(url=>url.searchParams.get('page')==='2').length,15);
 }finally{globalThis.fetch=old;}
});

test('Selected categories do not depend on unrelated upstream leaderboards',async()=>{
 const old=globalThis.fetch,requests=[];
 globalThis.fetch=async url=>{requests.push(String(url));assert.match(String(url),/individual\/469/);return Response.json({updated,pages:1,data:[{Name:'Runner',Team:'Ohio St.','Rush Yds':'750','Rush TD':'5'}]})};
 try{const response=await GET(new Request('https://hub.test/api/season-stats?view=individual&category=rushing'));assert.equal(response.status,200);const rows=await response.json();assert.equal(rows.length,2);assert.equal(rows[0].stat,750);assert.equal(requests.length,1);assert.equal((await GET(new Request('https://hub.test/api/season-stats?view=individual&category=unknown'))).status,400)}finally{globalThis.fetch=old}
});
