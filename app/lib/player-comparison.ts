import type { EspnData } from './espn-football';
export type ComparisonMetric = { key:string; label:string; category:string; value:string|null };
export function projectPlayerLog(data: EspnData, season:number, phase:number, week:number|null) {
  if(String(data.filters?.find((f:EspnData)=>f.name==='season')?.value)!==String(season))throw new Error('Player statistics do not match the selected season.');
  const groups=(data.seasonTypes??[]).filter((s:EspnData)=>new RegExp(`^${season}\\b`).test(s.displayName??'')).flatMap((s:EspnData)=>(s.categories??[]).filter((c:EspnData)=>Number(c.splitType)===phase));
  const games=groups.flatMap((g:EspnData)=>g.events??[]);
  const distinct=[...new Map(games.map((g:EspnData)=>[String(g.eventId),g])).values()] as EspnData[];
  const selected=distinct.filter(g=>week===null||Number(data.events?.[g.eventId]?.week)===week);
  // Provider total rows preserve weighted averages and ratings; never sum percentages.
  const summaries=(data.seasonTypes??[]).filter((s:EspnData)=>new RegExp(`^${season}\\b`).test(s.displayName??'')&&(s.categories??[]).some((c:EspnData)=>Number(c.splitType)===phase));
  const totals=summaries.length===1?summaries[0].summary?.stats?.find((s:EspnData)=>s.type==='total')?.stats:null;
  const stats=week===null?totals:selected.length===1?selected[0].stats:null;
  const metrics:ComparisonMetric[]=[];
  let offset=0;
  for(const c of data.categories??[]) {
    for(let i=0;i<Number(c.count??0);i++) {
      const index=offset+i,name=data.names?.[index]??String(index);
      metrics.push({key:`${c.name}:${name}`,label:data.displayNames?.[index]??data.labels?.[index]??name,category:c.displayName??c.name,value:stats?.[index]==null||stats[index]===''||stats[index]==='--'?null:String(stats[index])});
    }
    offset+=Number(c.count??0);
  }
  return {metrics,gamesPlayed:week===null?distinct.length:selected.length,availableWeeks:[...new Set(distinct.map(g=>Number(data.events?.[g.eventId]?.week)).filter(Number.isInteger))].sort((a,b)=>a-b),opponents:selected.map(g=>data.events?.[g.eventId]?.opponent?.displayName).filter(Boolean) as string[],lastGameAt:distinct.map(g=>data.events?.[g.eventId]?.gameDate).filter(Boolean).sort().at(-1)??null,message:stats?null:week===null?'No season statistics reported.':'No player statistics reported for this week. This may be a bye, a non-appearance, or an unreported game.'};
}
