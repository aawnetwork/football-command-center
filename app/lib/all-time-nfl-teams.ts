import baseline from './all-time-nfl-baseline.json';
import { nflTeamNameByAbbreviation } from '../nfl/data/divisions';
import { rankHistoricalRecords, type HistoricalRecord } from './all-time-records';

export type FinalNflGame = { id:string; season:number; week:number; home:string; away:string; homeScore:number; awayScore:number };
export type NflTeamLedger = { baselineHash:string; checkedAt:string; games:FinalNflGame[] };
export const nflTeamBaselineHash=baseline.fingerprint;
const names=new Set(baseline.teams.map(team=>team.name));
export function nflFranchise(code:string):string {
 const name=nflTeamNameByAbbreviation[code==='WSH'?'WAS':code];
 if(!name||!names.has(name))throw Error(`Unverified NFL franchise identity: ${code}`);
 return name;
}
export function reconcileNflTeamGames(previous:NflTeamLedger|undefined,observations:readonly FinalNflGame[],checkedAt:string):NflTeamLedger {
 if(baseline.teams.length!==32||baseline.throughSeason!==2025||!Number.isFinite(Date.parse(checkedAt)))throw Error('Unverified NFL historical baseline or observation time');
 if(previous&&previous.baselineHash!==nflTeamBaselineHash)throw Error('NFL baseline changed; ledger needs explicit review');
 const games=new Map<string,FinalNflGame>();
 const add=(game:FinalNflGame,correction:boolean)=>{
  if(!/^espn:nfl:game:\d+$/.test(game.id)||!Number.isInteger(game.season)||game.season<=baseline.throughSeason||game.season>new Date(checkedAt).getUTCFullYear()||!Number.isInteger(game.week)||game.week<1||game.week>18||!names.has(game.home)||!names.has(game.away)||game.home===game.away||![game.homeScore,game.awayScore].every(score=>Number.isInteger(score)&&score>=0&&score<=100))throw Error('Invalid final NFL game observation');
  const old=games.get(game.id);
  if(old&&(old.home!==game.home||old.away!==game.away||old.season!==game.season))throw Error('Conflicting NFL game participants/season');
  if(old&&!correction&&JSON.stringify(old)!==JSON.stringify(game))throw Error('Conflicting duplicate NFL game');
  games.set(game.id,{...game});
 };
 for(const game of previous?.games??[])add(game,false);
 const current=new Map<string,FinalNflGame>();
 for(const game of observations){const old=current.get(game.id);if(old&&JSON.stringify(old)!==JSON.stringify(game))throw Error('Conflicting duplicate NFL observation');current.set(game.id,game);}
 for(const game of current.values())add(game,true);
 return {baselineHash:nflTeamBaselineHash,checkedAt,games:[...games.values()].sort((a,b)=>a.id.localeCompare(b.id))};
}
export function nflTeamRecordSets(ledger?:NflTeamLedger):Record<'wins'|'winning-percentage'|'games-played',HistoricalRecord[]> {
 const verified=ledger?reconcileNflTeamGames(undefined,ledger.games,ledger.checkedAt):undefined;
 if(ledger&&ledger.baselineHash!==nflTeamBaselineHash)throw Error('Unverified persisted NFL ledger');
 const totals=new Map(baseline.teams.map(team=>[team.name,{wins:team.wins,losses:team.losses,ties:team.ties}]));
 const appearances=new Map<string,number>();
 for(const game of verified?.games??[]){
  for(const name of [game.home,game.away])appearances.set(name,(appearances.get(name)??0)+1);
  const home=totals.get(game.home)!,away=totals.get(game.away)!;
  if(game.homeScore===game.awayScore){home.ties++;away.ties++;}
  else if(game.homeScore>game.awayScore){home.wins++;away.losses++;}
  else {away.wins++;home.losses++;}
 }
 const records=(metric:'wins'|'winning-percentage'|'games-played')=>rankHistoricalRecords([...totals].map(([name,total])=>{
  const games=total.wins+total.losses+total.ties;
  return {rank:0,player:name,team:`${total.wins}–${total.losses}–${total.ties}`,years:ledger?`2025 base + ${appearances.get(name)??0} confirmed regular-season games`:'Through 2025 regular season',value:metric==='wins'?total.wins:metric==='games-played'?games:games?(total.wins+total.ties/2)/games*100:0,isActive:false};
 }));
 return {wins:records('wins'),'winning-percentage':records('winning-percentage'),'games-played':records('games-played')};
}
