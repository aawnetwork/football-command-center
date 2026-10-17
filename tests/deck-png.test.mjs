import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { groupDeckGames } from '../app/lib/curated-decks.ts';

const source=await readFile(new URL('../app/features/games/deck-png.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createDeckPng}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

async function canvasTest(run,{broken=false,failedExport=false,contextAvailable=true}={}) {
  const keys=['document','window','getComputedStyle','Image'];
  const previous=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
  const calls=[],images=[];
  let scale=1;
  const context={font:'',fillStyle:'',textAlign:'left',
    measureText(text){return {width:String(text).length*(Number(this.font.match(/(\d+)px/)?.[1])||36)*.55};},
    fillText(text,x,y){calls.push({text,x,y,font:this.font,align:this.textAlign,colour:this.fillStyle});},
    scale(value){scale=value;},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
    drawImage(image){calls.push({image:image.src});}};
  const canvas={width:0,height:0,getContext:()=>contextAvailable?context:null,toBlob(callback,type){assert.equal(type,'image/png');callback(failedExport?null:new Blob(['png'],{type}));}};
  Object.assign(globalThis,{
    document:{fonts:{ready:Promise.resolve(),load:async()=>[]},documentElement:{},querySelector:()=>null,createElement:()=>canvas},
    window:{setTimeout,clearTimeout},getComputedStyle:()=>({getPropertyValue:()=>''}),
    Image:class {naturalWidth=100;naturalHeight=60;set src(value){this.url=value;images.push(value);assert.equal(this.crossOrigin,'anonymous');queueMicrotask(()=>broken?this.onerror?.():this.onload?.());}get src(){return this.url;}},
  });
  try{await run({calls,images,canvas,context,getScale:()=>scale});}
  finally{keys.forEach((key,index)=>previous[index]?Object.defineProperty(globalThis,key,previous[index]):delete globalThis[key]);}
}
const games=[
  {id:1,awayTeam:'USC Trojans',homeTeam:'Hawaii Rainbow Warriors',awayLogo:'usc.png',homeLogo:'hawaii.png'},
  {id:2,awayTeam:'Georgia Southern Eagles',homeTeam:'San José State Spartans',awayLogo:'gs.png',homeLogo:'sj.png'},
  {id:3,awayTeam:'Eastern Michigan Eagles',homeTeam:'USC Trojans',awayLogo:'em.png',homeLogo:'usc.png'},
];

test('Deck PNG uses Hub branding, all supplied logos and unchanged tier/selection order',async()=>{
 await canvasTest(async({calls,images,canvas})=>{
  const groups=groupDeckGames(games,{1:'A',2:'S',3:'A'},['A','S']);
  const before=structuredClone(groups);const blob=await createDeckPng(2026,7,groups);
  assert.equal(blob.type,'image/png');assert.equal(canvas.width,2160);assert.deepEqual(groups,before);
  const text=calls.filter(call=>call.text).map(call=>call.text);
  assert.ok(text.includes('The HUB'));assert.ok(text.includes('hub.aawnetwork.co.uk'));
  assert.ok(text.includes('2026 · COLLEGE FOOTBALL'));assert.ok(text.includes('7'));
  assert.doesNotMatch(text.join(' '),/FOOTBALL DESK|desk\.aawnetwork/);
  const teamNames=new Set(games.flatMap(game=>[game.awayTeam,game.homeTeam]));
  assert.deepEqual(text.filter(value=>teamNames.has(value)),['Georgia Southern Eagles','San José State Spartans','USC Trojans','Hawaii Rainbow Warriors','Eastern Michigan Eagles','USC Trojans']);
  assert.equal(images.length,5,'each source loaded once');assert.equal(calls.filter(call=>call.image).length,6);
 });
});
test('Single S-tier, week zero and long team names fit without dropping or mutating selections',async()=>{
 await canvasTest(async({calls,canvas,context,getScale})=>{
  const groups=[{tier:'S',games:[{id:1,awayTeam:'An Exceptionally Long College Football Team Name With Many Words',homeTeam:'Another Very Long College Football University Team Name'}]}];
  await createDeckPng(2026,0,groups);
  const text=calls.filter(call=>call.text);assert.ok(text.some(call=>call.text==='My must-watch games'));assert.ok(text.some(call=>call.text==='0'));
  const logicalHeight=canvas.height/getScale();
  for(const call of text){context.font=call.font;assert.ok(call.y<logicalHeight);if(call.align==='left')assert.ok(call.x+context.measureText(call.text).width<=1080,call.text);}
  assert.equal(groups[0].games.length,1);
 });
});
test('Missing or blocked team logos still yield a usable PNG with every team name',async()=>{
 await canvasTest(async({calls})=>{
  const blob=await createDeckPng(2026,7,[{tier:'S',games}]);assert.equal(blob.type,'image/png');
  assert.equal(calls.filter(call=>call.image).length,0);
  for(const game of games)for(const name of [game.awayTeam,game.homeTeam])assert.ok(calls.some(call=>call.text===name));
 },{broken:true});
});
test('Large decks preserve every selection and keep the existing 16000px height bound',async()=>{
 await canvasTest(async({calls,canvas})=>{
  const games=Array.from({length:120},(_,id)=>({id,awayTeam:`Away ${id}`,homeTeam:`Home ${id}`}));
  await createDeckPng(2026,7,[{tier:'S',games}]);assert.equal(canvas.height,16000);
  assert.equal(calls.filter(call=>call.text?.startsWith('Away ')).length,120);
  assert.equal(calls.filter(call=>call.text?.startsWith('Home ')).length,120);
 });
});
test('Empty decks, unavailable canvas and PNG encoding failures reject cleanly',async()=>{
 await canvasTest(async()=>{await assert.rejects(createDeckPng(2026,7,[]),/No assigned games/);});
 await canvasTest(async()=>{await assert.rejects(createDeckPng(2026,7,[{tier:'S',games}]),/Canvas is unavailable/);},{contextAvailable:false});
 await canvasTest(async()=>{await assert.rejects(createDeckPng(2026,7,[{tier:'S',games}]),/PNG creation failed/);},{failedExport:true});
});

test('ESPN IDs distinguish both Miamis and recover a missing schedule URL without name guessing',async()=>{
 const {deckLogoSources}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
 assert.deepEqual(deckLogoSources(null,'193'),['/api/team-logo?id=193','https://a.espncdn.com/i/teamlogos/ncaa/500/193.png']);
 assert.equal(deckLogoSources('https://a.espncdn.com/i/teamlogos/ncaa/500/2390.png')[0],'/api/team-logo?id=2390');
 assert.deepEqual(deckLogoSources(null,'https://evil.test'),[]);
 assert.deepEqual(deckLogoSources('https://other.test/logo.png'),['https://other.test/logo.png']);
 assert.deepEqual(deckLogoSources(),[]);
});
test('Unavailable marks are reported by team name and visibly use initials',async()=>{
 await canvasTest(async({calls})=>{
  let missing;await createDeckPng(2026,7,[{tier:'S',games:[{id:1,awayTeam:'Miami Hurricanes',homeTeam:'Army Black Knights',awayTeamId:'2390',homeTeamId:'349'}]}],teams=>{missing=teams});
  assert.deepEqual(missing,['Miami Hurricanes','Army Black Knights']);
  assert.ok(calls.some(c=>c.text==='MH'));assert.ok(calls.some(c=>c.text==='ABK'));
 },{broken:true});
});
