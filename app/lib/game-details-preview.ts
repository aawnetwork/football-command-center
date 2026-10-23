import retained from './game-form-retained.json';
import { gameWatch, type Watch } from './game-watch';
import nfl from './nfl-team-history-2026.json';
import ncaa from './cfb-team-ncaa-retained.json';
import schools from './cfb-team-display-2026.json';
import { detailNumber, type GameDetails } from './game-details';
export type Preview = { comparison:{label:string;away:number|null;home:number|null;cutoff:string;awayCutoff:string|null;homeCutoff:string|null}[]; form:{team:string;games:{id:string;week:number|null;opponent:string;result:string;date:string}[]}[]; players:Watch['players'];watch:Watch|null };
/** Exact retained team identities only. Never use a snapshot dated after kickoff. */
export function gamePreview(detail:GameDetails):Preview {
 const {league,season,home,away}=detail.identity;
 const empty:Preview={comparison:[],form:[],players:[],watch:null};if(season!==2026||!detail.kickoff)return empty;
 const before=Date.parse(detail.kickoff);if(!Number.isFinite(before))return empty;
 const games=retained[league].filter(g=>g.id!==detail.identity.event&&g.kickoff&&Date.parse(g.kickoff)<before).sort((a,b)=>Date.parse(b.kickoff!)-Date.parse(a.kickoff!));
 const form=[away,home].map(team=>({team,games:games.filter(g=>g.teams.some(t=>t.id===team)).slice(0,5).map(g=>{const own=g.teams.find(t=>t.id===team)!,opp=g.teams.find(t=>t.id!==team)!;return {id:g.id,week:g.week,opponent:opp.name,result:`${own.score>opp.score?'W':own.score<opp.score?'L':'T'} ${own.score}–${opp.score}`,date:g.kickoff!};})}));
 const watch=gameWatch(detail);
 const players=watch.players;
 const comparison:Preview['comparison']=[];
 if(league==='NFL'&&detail.week!==null&&detail.week>nfl.throughWeek){
  for(const [field,label] of [['total_yards','Offence YPG'],['passing_yards','Net passing YPG'],['rushing_yards','Rushing YPG'],['def_total_yards','Allowed YPG']] as const){
   const values=[away,home].map(id=>{const code=Object.entries(nfl.teams).find(([,t])=>t.id===`espn:nfl:team:${id}`)?.[0];const rows=nfl.weeks.flatMap(w=>w.rows.filter(r=>r.team===code));const v=rows.map(r=>detailNumber(r[field]));return rows.length&&v.every(n=>n!==null)?v.reduce<number>((a,b)=>a+b!,0)/rows.length:null;});
   comparison.push({label,away:values[0],home:values[1],cutoff:`2026 through Week ${nfl.throughWeek} · retained final games`,awayCutoff:values[0]===null?null:`2026 through Week ${nfl.throughWeek}`,homeCutoff:values[1]===null?null:`2026 through Week ${nfl.throughWeek}`});
  }
 }else if(league==='CFB'){
  const teams=schools.teams as Record<string,{ncaa:string}>;
  const tables=ncaa.tables as Record<string,{updated?:string;rows:{team:string;stat:number|null;gamesPlayed?:number|null;sourceUpdated?:string}[]}>;
  for(const [key,label,total] of [['total-offense','Offence YPG',true],['passing-offense','Passing YPG',true],['rushing-offense','Rushing YPG',true],['total-defense','Allowed YPG',false]] as const){
   const table=tables[key];
   const cells=[away,home].map(id=>{
    const rows=table?.rows.filter(r=>r.team===teams[id]?.ncaa)??[];if(rows.length!==1)return {value:null,cutoff:null};
    const text=rows[0].sourceUpdated??table.updated,cutoff=text?.match(/Through games \w+, (\w+ \d{1,2}, 2026)/)?.[1];
    if(!cutoff||Date.parse(cutoff+' UTC')+86400000>before)return {value:null,cutoff:null};
    const n=detailNumber(rows[0].stat),g=detailNumber(rows[0].gamesPlayed),value=n===null?null:total?g!==null&&g>0?n/g:null:n;
    return {value,cutoff:value===null?null:`NCAA · through games ${cutoff}`};
   });
   if(cells.every(c=>c.value===null))continue;
   comparison.push({label,away:cells[0].value,home:cells[1].value,cutoff:'Team-specific source cutoffs',awayCutoff:cells[0].cutoff,homeCutoff:cells[1].cutoff});
  }
 }
 return {comparison,form,players,watch};
}
