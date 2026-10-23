import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const file=new URL('../app/lib/cfb-preview-comparison.ts',import.meta.url);
const splitFile=new URL('../app/lib/cfb-preview-team-splits.json',import.meta.url);
const formFile=new URL('../app/lib/game-form-retained.json',import.meta.url);
const split=JSON.parse(await readFile(splitFile)),form=JSON.parse(await readFile(formFile));
const load=async(overrides=new Map())=> (await import(await compileLocalModule(file,overrides))).cfbPreviewComparison;
const compare=await load();
const detail=(away,home)=>({identity:{league:'CFB',season:2026,event:'999999',away,home},kickoff:'2026-10-24T17:00:00Z'});
const expected=[['150',6,1399,1257],['258',7,1436,1098],['349',6,415,2145],['202',7,1431,1117],['2005',6,390,2058],['2751',7,1025,1296],['152',6,1547,1011],['24',7,1676,724],['99',7,2156,1372],['2',6,1273,1092],['164',6,1595,825],['77',6,1398,1149]];
test('six actual retained matchups: all 48 core cells supported at the same verified cutoff',()=>{
 for(let i=0;i<expected.length;i+=2){
  const a=expected[i],h=expected[i+1],rows=compare(detail(a[0],h[0]));
  assert.equal(rows.length,4);assert.ok(rows.every(r=>r.away!==null&&r.home!==null));
  for(const [side,e] of [['away',a],['home',h]]){
   assert.equal(rows[1][side],e[2]/e[1]);assert.equal(rows[2][side],e[3]/e[1]);
   assert.equal(rows[0][side],(e[2]+e[3])/e[1]);
   assert.ok(rows.every(r=>r[side+'Cutoff'].includes('October 20, 2026')));
  }
  console.log(a[0],h[0],rows.map(r=>`${r.label}: ${r.away.toFixed(1)} / ${r.home.toFixed(1)}`).join('; '));
 }
});
test('projection provenance pins the existing 510-game evidence graph',()=>{
 assert.equal(Object.keys(split.games).length,510);
 assert.equal(split.gameFormSha256,createHash('sha256').update(JSON.stringify(form.CFB)).digest('hex'));
});
test('historical cutoff and exact team identities never borrow later or unrelated observations',()=>{
 assert.deepEqual(compare({...detail('150','258'),kickoff:'2026-10-15T17:00:00Z'}),[]);
 assert.deepEqual(compare(detail('999999','888888')),[]);
 assert.deepEqual(compare({...detail('150','258'),identity:{...detail('150','258').identity,season:2025}}),[]);
});
async function altered(change){const copy=structuredClone(split);change(copy);return load(new Map([[splitFile.href,JSON.stringify(copy)]]));}
const dukeGames=Object.values(split.games).filter(g=>g['espn:cfb:team:150']);
test('missing athlete-independent team observations remain unknown, not zero',async()=>{
 const fn=await altered(s=>{Object.values(s.games).find(g=>g['espn:cfb:team:150'])['espn:cfb:team:150'][0]=null;});
 const rows=fn(detail('150','258'));assert.equal(rows.length,4);assert.equal(rows[1].away,null);assert.equal(rows[2].away,null);assert.ok(rows[0].away>0);assert.match(rows[1].awayCutoff,/coverage does not match/);
});
test('conflicting splits are withheld instead of replacing official NCAA offense',async()=>{
 const fn=await altered(s=>{Object.values(s.games).find(g=>g['espn:cfb:team:150'])['espn:cfb:team:150'][0]+=1;});
 const rows=fn(detail('150','258'));assert.equal(rows[1].away,null);assert.equal(rows[0].away,2656/6);assert.match(rows[1].awayCutoff,/conflict/);
});
test('a reported zero is retained when the independent period total reconciles',async()=>{
 const fn=await altered(s=>{const r=Object.values(s.games).find(g=>g['espn:cfb:team:150'])['espn:cfb:team:150'];r[1]+=r[0];r[0]=0;});
 const rows=fn(detail('150','258'));assert.notEqual(rows[1].away,null);assert.equal(rows[1].away+rows[2].away,2656/6);
 assert.equal(dukeGames.length,6);
});
test('duplicate game cohort cannot count an appearance twice',async()=>{
 const copy=structuredClone(form);copy.CFB.push(copy.CFB.find(g=>g.teams.some(t=>t.id==='150')));
 const fn=await load(new Map([[formFile.href,JSON.stringify(copy)]]));assert.equal(fn(detail('150','258'))[1].away,null);
});
test('actual comparison component renders all six source-backed matchups without missing cells or old split cutoffs',async()=>{
 const ts=(await import('typescript')).default,React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const jsx=new URL('../node_modules/react/jsx-runtime.js',import.meta.url).href,react=new URL('../node_modules/react/index.js',import.meta.url).href;
 let code=ts.transpileModule(await readFile(new URL('../app/features/games/GameDetails.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 code=code.replace(/from ['"]react['"]/g,`from ${JSON.stringify(react)}`).replace(/from ['"]react\/jsx-runtime['"]/g,`from ${JSON.stringify(jsx)}`).replace(/from ['"]\.\.\/\.\.\/lib\/game-details['"]/g,`from ${JSON.stringify(await compileLocalModule(new URL('../app/lib/game-details.ts',import.meta.url)))}`).replace(/from ['"]\.\.\/\.\.\/lib\/game-detail-tabs['"]/g,`from ${JSON.stringify(await compileLocalModule(new URL('../app/lib/game-detail-tabs.ts',import.meta.url)))}`).replace(/import styles from ['"][^'"]+['"];?/,'const styles=new Proxy({},{get:(_,key)=>key});');
 const {GameDetailsPanel}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 for(let i=0;i<expected.length;i+=2){const d=detail(expected[i][0],expected[i+1][0]);
  const teams=[d.identity.away,d.identity.home].map(id=>({id,name:form.CFB.flatMap(g=>g.teams).find(t=>t.id===id).name}));
  const html=renderToStaticMarkup(React.createElement(GameDetailsPanel,{data:{...d,stage:'scheduled',context:[],teams,preview:{comparison:compare(d)}},context:null,tab:0}));
  assert.match(html,/Passing YPG/);assert.match(html,/Rushing YPG/);assert.match(html,/Allowed YPG/);assert.match(html,/October 20, 2026/);assert.doesNotMatch(html,/October 15|—|NaN|undefined/);
 }
});
