import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../app/features/exports/statistical-selection.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {readStatisticalSelection,statisticalExportRows}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const text=textContent=>({textContent});
function source({failed=false,hidden=false,value='0',rank='1',title='Rushing yards',search='',conference='',details=false}={}){
 const button={getAttribute:()=>title},heading={querySelector:()=>button};heading.parentElement={children:[{}, {},heading]};
 const identity={querySelector:selector=>selector==='strong'?text('Torrance Burgess Jr.'):selector==='small'?text('Texas State Bobcats'):{hidden,currentSrc:'/retained-logo.png'}};
 const row={cells:[text(rank),{},text(value)],querySelector:()=>identity};
 const table={querySelector:()=>heading,querySelectorAll:()=>[row]};
 const coverage={querySelector:()=>text('Partial coverage'),querySelectorAll:()=>[{...text('Snapshot through the retained cutoff'),closest:()=>null},{...text('Diagnostic only'),closest:()=>({})}]};
 const section={getAttribute:()=> 'ESPN reported observations',querySelector:selector=>selector==='[role="alert"]'?failed?{}:null:selector==='table'?table:selector.startsWith('aside')?coverage:selector.startsWith('[data-statistics-period]')?text('2026 Week 7 / CFB'):selector.startsWith('input')?{value:search}:null,querySelectorAll:()=>[{value:conference,selectedOptions:[text('Sun Belt')],parentElement:text('Conference')}]};
 return {querySelector:()=>details?null:section};
}
test('selected Stats 2.0 column, genuine zero, exact identity and logo survive unchanged',()=>{
 const a=readStatisticalSelection(source());assert.equal(a.rows[0].value,'0');assert.equal(a.rows[0].name,'Torrance Burgess Jr.');assert.equal(a.rows[0].logo,'/retained-logo.png');assert.equal(a.title,'Rushing yards');assert.equal(a.period,'2026 Week 7 / CFB');
});
test('missing and N/A observations never become numerical exports',()=>{for(const value of ['—','N/A'])assert.equal(readStatisticalSelection(source({value})).rows.length,0);});
test('competition ties and withheld ranks are copied, not independently manufactured',()=>{for(const rank of ['1','3','—'])assert.equal(readStatisticalSelection(source({rank})).rows[0].rank,rank);});
test('failed or cleared source cannot publish stale observations',()=>{assert.equal(readStatisticalSelection(source({failed:true})),null);assert.equal(readStatisticalSelection(source({details:true})),null);});
test('filtered exports retain scope, source and cutoff; diagnostics stay out',()=>{const a=readStatisticalSelection(source({search:'Burgess',conference:'37'}));assert.ok(a.qualifications.includes('Snapshot through the retained cutoff'));assert.ok(a.qualifications.includes('ESPN reported observations'));assert.ok(a.qualifications[0].includes('Sun Belt'));assert.ok(a.qualifications[0].includes('Burgess'));assert.ok(!a.qualifications.includes('Diagnostic only'));});
test('unloaded or hidden logos remain unavailable, never fabricated',()=>assert.equal(readStatisticalSelection(source({hidden:true})).rows[0].logo,''));
test('Top 5 and Top 10 preserve supplied order, ties and values without changing the source',()=>{const a=readStatisticalSelection(source());a.rows=Array.from({length:15},(_,i)=>({...a.rows[0],rank:i<2?'1':String(i+1),name:'Player '+i}));const before=JSON.stringify(a);assert.equal(statisticalExportRows(a,5).length,5);assert.equal(statisticalExportRows(a,10).length,10);assert.equal(statisticalExportRows(a,5)[1].rank,'1');assert.equal(JSON.stringify(a),before);});
