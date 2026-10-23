import retained from './game-form-retained.json';
import { gameWatch, type Watch } from './game-watch';
import nfl from './nfl-team-history-2026.json';
import { cfbPreviewComparison } from './cfb-preview-comparison';
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
  comparison.push(...cfbPreviewComparison(detail));
 }
 return {comparison,form,players,watch};
}
