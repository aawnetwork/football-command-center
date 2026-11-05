import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const {bracketOverlayLayout,bracketFormatDimensions}=await import(await compileLocalModule(new URL('../app/features/exports/bracket-layout.ts',import.meta.url)));
const team=(seed,offset=0)=>({id:String(seed+offset),seed,name:`Team ${seed}`,logo:null});
const cfp={league:'CFB',season:2026,state:'projected',conferences:[{name:'CFP',teams:Array.from({length:12},(_,i)=>team(i+1))}],games:[]};
const nfl={...cfp,league:'NFL',conferences:[{name:'AFC',teams:Array.from({length:7},(_,i)=>team(i+1))},{name:'NFC',teams:Array.from({length:7},(_,i)=>team(i+1,100))}]};
for(const data of [cfp,nfl])for(const format of ['wide','portrait','story'])test(`${data.league} ${format} keeps every matchup in bounds without overlapping cards`,()=>{
 const layout=bracketOverlayLayout(data,'full',format);
 assert.equal(layout.cards.length,data.league==='CFB'?11:13);
 assert.equal(new Set(layout.cards.map(c=>c.slot.key)).size,layout.cards.length);
 for(const card of layout.cards){assert.ok(card.x>=0);assert.ok(card.x+card.width<=layout.width);assert.ok(card.y-layout.cardHeight/2>=0);assert.ok(card.y+layout.cardHeight/2<=layout.height);}
 for(let a=0;a<layout.cards.length;a++)for(let b=a+1;b<layout.cards.length;b++){
  const x=layout.cards[a],y=layout.cards[b];
  assert.ok(x.x+x.width<=y.x||y.x+y.width<=x.x||Math.abs(x.y-y.y)>=layout.cardHeight,`Overlapping ${x.slot.key} and ${y.slot.key}`);
 }
});
test('Instagram and Stories formats have exact final dimensions and genuinely wider portrait match cards',()=>{
 assert.deepEqual(bracketFormatDimensions('portrait'),{width:1080,height:1350});assert.deepEqual(bracketFormatDimensions('story'),{width:1080,height:1920});
 assert.equal(bracketFormatDimensions('wide'),null);
 assert.equal(bracketOverlayLayout(cfp,'full','portrait').cards[0].width,474);
});
