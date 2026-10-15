import type { AudienceReport, Sample } from '../../lib/audience-report';
import type { GameContext } from '../../lib/game-context';

export const opinionMinimum = 25;
export const opinionTiers = ['S','A','B','C','D'] as const;
export type OpinionGame = AudienceReport['games'][number];
export type ScheduleGame = {id:number;context:GameContext;homeTeam:string;awayTeam:string;homeLogo?:string|null;awayLogo?:string|null;startDate?:string};
export type OpinionRow = {id:string;game?:ScheduleGame;opinion?:OpinionGame};
export type OpinionSort = 'kickoff'|'rated'|'s'|'divisive';
export const countRatings = (row:OpinionRow) => row.opinion?.samples.current?.count??0;
export function leadingTier(sample?:Sample) {
  if (!sample || sample.count<opinionMinimum) return null;
  const max=Math.max(...opinionTiers.map(t=>sample.tiers[t]));
  const winners=opinionTiers.filter(t=>sample.tiers[t]===max);
  return winners.length===1?winners[0]:null;
}
/** Spread of audience responses only; not a game-quality score or prediction. */
export function opinionSpread(sample?:Sample) {
  if(!sample || sample.count<opinionMinimum) return null;
  const mean=opinionTiers.reduce((sum,t,i)=>sum+(4-i)*sample.tiers[t],0)/sample.count;
  return Math.sqrt(opinionTiers.reduce((sum,t,i)=>sum+((4-i)-mean)**2*sample.tiers[t],0)/sample.count);
}
export function weeklyRows(schedule:ScheduleGame[],opinions:OpinionGame[],league:'NFL'|'CFB',season:number,week:number|'postseason') {
  const byId=new Map(opinions.filter(o=>o.league===league&&o.season===season).map(o=>[o.gameId,o]));
  const unique=new Map<string,OpinionRow>();
  for(const game of schedule){
    const c=game.context;
    if(!c?.verified || c.league!==league || c.season!==season || !c.identity || c.identity!==`${league}:${season}:${game.id}` ||
      (week==='postseason'?c.seasonType!=='postseason':c.seasonType!=='regular'||c.regularWeek!==week))continue;
    unique.set(c.identity,{id:c.identity,game,opinion:byId.get(c.identity)});
  }
  return [...unique.values()];
}
export function sortOpinionRows(rows:OpinionRow[],sort:OpinionSort) {
  const kickoff=(r:OpinionRow)=>r.game?.context.kickoffAt?Date.parse(r.game.context.kickoffAt):Infinity;
  return [...rows].sort((a,b)=>{
    const metric=(r:OpinionRow)=>sort==='rated'?countRatings(r):sort==='s'?r.opinion?.samples.current?.tiers.S??0:opinionSpread(r.opinion?.samples.current)??-1;
    return (sort==='kickoff'?0:metric(b)-metric(a)) || kickoff(a)-kickoff(b) || a.id.localeCompare(b.id);
  });
}
export function weeklySnapshot(rows:OpinionRow[]) {
  const eligible=rows.filter(r=>countRatings(r)>=opinionMinimum);
  const best=(value:(r:OpinionRow)=>number)=>{
    const sorted=[...eligible].sort((a,b)=>value(b)-value(a)||a.id.localeCompare(b.id));
    if(!sorted.length||value(sorted[0])<=0)return null;
    return {row:sorted[0],value:value(sorted[0]),ties:sorted.filter(r=>value(r)===value(sorted[0])).length};
  };
  const counts=rows.map(countRatings), total=counts.reduce((a,b)=>a+b,0);
  return {s:best(r=>r.opinion!.samples.current!.tiers.S),a:best(r=>r.opinion!.samples.current!.tiers.A),rated:best(countRatings),
    divisive:best(r=>opinionSpread(r.opinion?.samples.current)??0),games:counts.filter(n=>n>0).length,total,
    browserMinimum:Math.max(0,...counts),browserMaximum:total};
}
/** Reuse the existing bounded report endpoint; never accept a truncated season as complete. */
export async function loadOpinionSeason(league:'NFL'|'CFB',season:number,read:(offset:number)=>Promise<AudienceReport>) {
  const games=new Map<string,OpinionGame>();
  let total:number|undefined;
  for(let offset=0;offset<=10000;offset+=10){
    const page=await read(offset);
    if(!Array.isArray(page.games)||!Number.isSafeInteger(page.gameTotal)||page.gameTotal<0)throw Error('Invalid audience report.');
    if(total!==undefined&&page.gameTotal!==total)throw Error('Audience report changed while loading. Refresh to retry.');
    total=page.gameTotal;
    for(const game of page.games)if(game.league===league&&game.season===season)games.set(game.gameId,game);
    if(offset+10>=page.gameTotal){
      if(games.size!==page.gameTotal)throw Error('Audience report changed while loading. Refresh to retry.');
      return [...games.values()];
    }
    if(!page.games.length)throw Error('Audience report changed while loading. Refresh to retry.');
    if(offset>=990)throw Error('This season exceeds the safe report-page limit. No partial weekly totals are shown.');
  }
  throw Error('Incomplete audience report.');
}
