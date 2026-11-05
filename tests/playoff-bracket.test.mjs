import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const {cfpBracket,nflBracket,superBowl,bracketWinner,confirmedCfpField}=await import(await compileLocalModule(new URL('../app/lib/playoff-bracket.ts',import.meta.url)));
const {selectCfp2026}=await import(await compileLocalModule(new URL('../app/lib/postseason-model.ts',import.meta.url)));
const team=(seed,prefix='')=>({id:String((prefix==='N'?100:0)+seed),seed,name:`${prefix}Team ${seed}`,logo:null});
const field=Array.from({length:12},(_,i)=>team(i+1));
function game(id,round,a,b,winner,completed=true){return {id,round,label:round,date:'2026-01-01T20:00Z',timeTbd:false,playoff:true,status:'Final',statusLabel:completed?'FINAL':'LIVE',completed,live:!completed,teams:[{...a,score:a.id===winner?'30':'10',winner:a.id===winner},{...b,score:b.id===winner?'30':'10',winner:b.id===winner}]};}
const sourceTeams=slot=>slot.teams.filter(t=>typeof t!=='string').map(t=>t.seed);
test('CFP follows canonical seeds rather than chronological game order',()=>{
 const first=[game('1','first-round',field[4],field[11],field[11].id),game('2','first-round',field[7],field[8],field[8].id),game('3','first-round',field[5],field[10],field[5].id),game('4','first-round',field[6],field[9],field[6].id)];
 const path=cfpBracket(field,first);
 assert.deepEqual(path.columns[0].slots.map(sourceTeams),[[8,9],[5,12],[7,10],[6,11]]);
 assert.deepEqual(path.columns[1].slots.map(sourceTeams),[[1,9],[4,12],[2,7],[3,6]]);
 assert.equal(new Set(path.columns[0].slots.map(s=>s.game.id)).size,4);
});
test('CFP advances upset winners along fixed paths and never reseeds',()=>{
 const games=[game('1','first-round',field[7],field[8],field[8].id),game('2','first-round',field[4],field[11],field[11].id),game('3','first-round',field[6],field[9],field[9].id),game('4','first-round',field[5],field[10],field[10].id),game('5','quarterfinal',field[0],field[8],field[8].id),game('6','quarterfinal',field[3],field[11],field[11].id),game('7','quarterfinal',field[1],field[9],field[9].id),game('8','quarterfinal',field[2],field[10],field[10].id)];
 const path=cfpBracket(field,games);
 assert.deepEqual(path.columns[2].slots.map(sourceTeams),[[9,12],[10,11]]);
});
test('live scores do not advance a team; one completed semifinal winner appears in the final',()=>{
 const games=[game('1','semifinal',field[0],field[3],field[0].id,false),game('2','semifinal',field[1],field[2],field[2].id,true)];
 const path=cfpBracket(field,games),final=path.columns[3].slots[0];
 assert.equal(bracketWinner(path.columns[2].slots[0]),null);
 assert.deepEqual(sourceTeams(final),[3]);assert.equal(path.champion,null);
});
test('NFL reseeds Wild Card upsets and avoids duplicating Divisional source games',()=>{
 const afc=field.slice(0,7),games=[game('1','wild-card',afc[1],afc[6],afc[6].id),game('2','wild-card',afc[2],afc[5],afc[5].id),game('3','wild-card',afc[3],afc[4],afc[3].id)];
 let path=nflBracket(afc,games,'AFC');assert.deepEqual(path.columns[1].slots.map(sourceTeams),[[1,7],[4,6]]);
 games.push(game('4','divisional',afc[3],afc[5],afc[5].id));path=nflBracket(afc,games,'AFC');
 assert.equal(path.columns[1].slots[0].game,undefined);assert.equal(path.columns[1].slots[1].game.id,'4');assert.deepEqual(sourceTeams(path.columns[2].slots[0]),[6]);
});
test('NFL advances conference winners into a single Super Bowl and marks the champion',()=>{
 const a=field.slice(0,7),n=Array.from({length:7},(_,i)=>team(i+1,'N'));
 const games=[game('1','conference',a[0],a[5],a[5].id),game('2','conference',n[1],n[4],n[4].id)];
 const conferences=[{name:'AFC',teams:a},{name:'NFC',teams:n}];let final=superBowl(conferences,games);
 assert.deepEqual(final.teams.map(t=>t.id),[a[5].id,n[4].id]);
 games.push(game('3','super-bowl',a[5],n[4],n[4].id));final=superBowl(conferences,games);assert.equal(bracketWinner(final).id,n[4].id);
});
test('a confirmed CFP field requires all twelve distinct teams and twelve distinct source seeds',()=>{
 const games=[[8,9],[5,12],[7,10],[6,11]].map(([a,b],i)=>game(String(i),'first-round',field[a-1],field[b-1],field[a-1].id));
 games.push(...[[1,8],[4,5],[2,7],[3,6]].map(([a,b],i)=>game(String(10+i),'quarterfinal',field[a-1],field[b-1],field[b-1].id)));
 assert.equal(confirmedCfpField(games).length,12);
 const invalid=structuredClone(games);invalid.at(-1).teams[0].seed=2;assert.equal(confirmedCfpField(invalid),null);
 assert.equal(confirmedCfpField(games.slice(0,4)),null);
});
test('multiple unranked assumed champions qualify without inventing their relative committee order',()=>{
 const ranked=field.concat(Array.from({length:13},(_,i)=>team(i+13))).map(t=>({...t,rank:t.seed}));
 const result=selectCfp2026(ranked,[ranked[0],ranked[1],{...team(50),seed:0},{...team(51),seed:0}],ranked[19]);
 const unresolved=result.filter(t=>t.possibleSeeds?.length);
 assert.equal(unresolved.length,2);assert.ok(unresolved.every(t=>t.seed===0));assert.deepEqual(unresolved[0].possibleSeeds,[11,12]);
});
