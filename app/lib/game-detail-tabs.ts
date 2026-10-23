import type { DetailStage } from './game-details';
export function detailTabs(stage:DetailStage){
 return stage==='scheduled'?['Comparison','Players to Watch','Recent Form']:stage==='live'?['Team Stats','Player Leaders','Scoring']:['Final Stats','Standout Players','Scoring Summary'];
}
export function detailTabKey(key:string,index:number){return key==='ArrowRight'?(index+1)%3:key==='ArrowLeft'?(index+2)%3:key==='Home'?0:key==='End'?2:null;}

/** Preserve displayed away/home order; merge achievements only on exact team/athlete IDs. */
export function groupedGamePlayers<T extends {id:string;team:string;name:string;category:string;line:string}>(teams:readonly {id:string;name:string}[],players:readonly T[]){
 return teams.map(team=>{
  const athletes=new Map<string,{id:string;name:string;achievements:{category:string;line:string}[]}>();
  for(const player of players.filter(p=>p.team===team.id)){
   let athlete=athletes.get(player.id);if(!athlete){athlete={id:player.id,name:player.name,achievements:[]};athletes.set(player.id,athlete);}
   if(!athlete.achievements.some(a=>a.category===player.category&&a.line===player.line))athlete.achievements.push({category:player.category,line:player.line});
  }
  return {...team,players:[...athletes.values()]};
 });
}
/** A provider scoring period beyond regulation establishes overtime. College OT
 * is untimed; NFL OT has a meaningful running clock, including expiration. */
export function scoringPeriodLabel(period:number,clock:string,league:'NFL'|'CFB'){
 const label=period<=4?`Q${period}`:period===5?'OT':`${period-4}OT`;
 const time=league==='CFB'&&period>=5&&/^0*:00(?:\.0+)?$/.test(clock.trim())?'':clock.trim();
 return [label,time].filter(Boolean).join(' ');
}
export function additionalGameContext(collapsed:string|null,notes:readonly string[]){
 const words=(text:string)=>text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(w=>!['nfl','game','games'].includes(w));
 const existing=new Set(words(collapsed??'')),seen=new Set<string>();
 return notes.filter(note=>{
  const tokens=words(note),key=tokens.join(' ');
  if(!key||seen.has(key)||existing.size>0&&tokens.every(token=>existing.has(token)))return false;
  seen.add(key);return true;
 });
}
/** Conservative editorial filter, not a statistical qualification rule. Only
 * distinct leading yardage positions with a material positive gap qualify.
 * Small counting-stat differences and ties never create a forced storyline. */
export function meaningfulWatchComparison(metric:string,gap:number,largest:number,leftRank:number,rightRank:number,conference:boolean){
 return metric.endsWith('_yards')&&gap>=25&&gap<=200&&largest>0&&gap/largest<=.2&&leftRank!==rightRank&&Math.min(leftRank,rightRank)<=3&&Math.max(leftRank,rightRank)<=(conference?5:3)&&Math.abs(leftRank-rightRank)<=2;
}
export function comparisonGap(gap:number,unit:string){
 const singular:Record<string,string>={yards:'yard',TDs:'TD',tackles:'tackle',sacks:'sack'};
 return `${gap.toLocaleString('en-GB',{maximumFractionDigits:1})} ${gap===1?singular[unit]??unit:unit}`;
}
