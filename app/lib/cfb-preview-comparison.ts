import ncaa from './cfb-team-ncaa-retained.json';
import schools from './cfb-team-display-2026.json';
import form from './game-form-retained.json';
import splits from './cfb-preview-team-splits.json';
import { detailNumber, type GameDetails } from './game-details';

type Cell = { value:number; count:number; date:string; timestamp:number };
export type PreviewComparison = {label:string;away:number|null;home:number|null;cutoff:string;awayCutoff:string|null;homeCutoff:string|null};
function sourceCell(key:string,id:string,before:number):Cell|null {
 const teams=schools.teams as Record<string,{ncaa:string}>;
 const tables=ncaa.tables as Record<string,{updated?:string;rows:{team:string;stat:number|null;gamesPlayed?:number|null;sourceUpdated?:string}[]}>;
 const table=tables[key], rows=table?.rows.filter(r=>r.team===teams[id]?.ncaa)??[];
 if(rows.length!==1)return null;
 const date=(rows[0].sourceUpdated??table.updated)?.match(/Through games \w+, (\w+ \d{1,2}, 2026)/)?.[1];
 if(!date)return null;
 const timestamp=Date.parse(date+' UTC'),value=detailNumber(rows[0].stat),count=detailNumber(rows[0].gamesPlayed);
 if(!Number.isFinite(timestamp)||timestamp+86400000>before||value===null||count===null||!Number.isInteger(count)||count<=0)return null;
 return {value,count,date,timestamp};
}
/** Supplement splits only after independently reconciling the complete NCAA period.
 * NCAA official total offense/defense remain authoritative; conflicting ESPN totals
 * are never reconstructed or substituted. Public requests need no capture files. */
export function cfbPreviewComparison(detail:GameDetails):PreviewComparison[] {
 if(detail.identity.season!==2026||!detail.kickoff)return [];
 const before=Date.parse(detail.kickoff);if(!Number.isFinite(before))return [];
 const retained=splits.games as Record<string,Record<string,(number|null)[]>>;
 const cells=[detail.identity.away,detail.identity.home].map(id=>{
  const offense=sourceCell('total-offense',id,before),defense=sourceCell('total-defense',id,before),base=offense??defense;
  const values:(number|null)[]=[offense?offense.value/offense.count:null,null,null,null];
  if(!base)return {values,note:null,splitNote:null};
  const note=`NCAA · through games ${base.date} · ${base.count} games`;
  const defenseMatches=defense?.timestamp===base.timestamp&&defense?.count===base.count;
  if(defenseMatches)values[3]=defense!.value;
  let splitNote='Passing/rushing unavailable: retained final-game coverage does not match the NCAA season period.';
  if(offense){
   const cohort=form.CFB.filter(g=>g.id!==detail.identity.event&&g.week!==null&&g.week<=splits.throughWeek&&g.kickoff&&Date.parse(g.kickoff)<=base.timestamp+86399999&&Date.parse(g.kickoff)<before&&g.teams.some(t=>t.id===id));
   const rows=cohort.map(g=>retained[`espn:cfb:game:${g.id}`]?.[`espn:cfb:team:${id}`]);
   if(cohort.length===offense.count&&new Set(cohort.map(g=>g.id)).size===cohort.length&&rows.every(r=>r?.length===2&&r.every(v=>typeof v==='number'&&Number.isFinite(v)))){
    const passing=rows.reduce((sum,r)=>sum+r![0]!,0),rushing=rows.reduce((sum,r)=>sum+r![1]!,0);
    if(passing+rushing===offense.value){
     values[1]=passing/offense.count;values[2]=rushing/offense.count;
     splitNote=`ESPN team boxscores; period verified against NCAA · through games ${base.date} · ${base.count} games`;
    }else splitNote='Passing/rushing unavailable: retained splits conflict with NCAA total offense.';
   }
  }
  return {values,note:offense?note:null,splitNote,defenseNote:defenseMatches?note:'Allowed yards unavailable: NCAA source periods do not match.'};
 });
 if(cells.every(c=>c.values.every(v=>v===null)))return [];
 return ['Offence YPG','Passing YPG','Rushing YPG','Allowed YPG'].map((label,i)=>({label,away:cells[0].values[i],home:cells[1].values[i],cutoff:'Verified season-to-cutoff team statistics',awayCutoff:i===1||i===2?cells[0].splitNote:i===3?cells[0].defenseNote??null:cells[0].note,homeCutoff:i===1||i===2?cells[1].splitNote:i===3?cells[1].defenseNote??null:cells[1].note}));
}
