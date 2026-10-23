import seasons from './game-watch-season.json';
import connections from './game-player-connections.json';
import { meaningfulWatchComparison } from './game-detail-tabs';
import type { GameDetails } from './game-details';
export type WatchPlayer = {id:string;name:string;team:string;stat:null|{metric:string;label:string;value:number;rank:number;population:number;conferenceRank:number|null;conferencePopulation:number|null;conferenceName:string|null};connection:null|{kind:string;factType:string;fact:string;source:string;sourceUrl:string;rosterObservedAt:string};reason:string;priority:number};
export type Watch = {players:WatchPlayer[];comparisons:{left:string;right:string;metric:string;label:string;gap:number;unit:string;scope:string}[];cutoff:string;qualification:string};
export type WatchSeason = {season:number;throughWeek:number;phase:string;scope:string;complete:boolean;source:string;teams:Record<string,{name:string;conferenceId:string|null;conferenceName:string|null}>;players:{id:string;espnId:string|null;name:string;teams:string[];categories:string[];values:Record<string,number|null>}[]};
type Connection = {connectionKind?:string;id:string;espnId:string;league:string;season:number;team:string;name:string;factType:string;fact:string;rosterObservedAt:string;rosterStatus:string;source:string;sourceUrl:string};
const metrics={passing_yards:{category:'QB',label:'Passing yards',unit:'yards'},passing_tds:{category:'QB',label:'Passing TDs',unit:'TDs'},rushing_yards:{category:'Rush',label:'Rushing yards',unit:'yards'},rushing_tds:{category:'Rush',label:'Rushing TDs',unit:'TDs'},receiving_yards:{category:'Rec',label:'Receiving yards',unit:'yards'},receiving_tds:{category:'Rec',label:'Receiving TDs',unit:'TDs'},tackles:{category:'Def',label:'Tackles',unit:'tackles'},def_sacks:{category:'Def',label:'Sacks',unit:'sacks'},def_tackles_for_loss:{category:'Def',label:'Tackles for loss',unit:'TFL'}};
/** Reported-value ranks only. Every eligible supplied athlete, including zeros,
 * participates; watch selection does not alter any Stats 2.0 calculation. */
export function createWatchSelector(snapshot:WatchSeason,refs:readonly Connection[]=[]){
 const ranks=new Map<string,{rank:number;population:number}[]>();
 const unique=new Set<string>(),conflicts=new Set<string>();for(const p of snapshot.players){if(unique.has(p.id))conflicts.add(p.id);unique.add(p.id);}
 const rows=snapshot.players.filter(p=>!conflicts.has(p.id));
 const refConflicts=new Set<string>();for(const ref of refs)if(refs.some(other=>other.id===ref.id&&other.season===ref.season&&other.team!==ref.team))refConflicts.add(ref.id);
 const conference=(p:WatchSeason['players'][number])=>p.teams.length===1?snapshot.teams[p.teams[0]]?.conferenceId??null:null;
 const ranking=(metric:string,conf:string|null)=>{
  const key=metric+':'+(conf??'all');if(ranks.has(key))return ranks.get(key)!;
  const def=metrics[metric as keyof typeof metrics];
  const candidates=rows.map((p,index)=>({p,index})).filter(({p})=>p.categories.includes(def.category)&&p.values[metric]!==null&&p.values[metric]!==undefined&&Number.isFinite(p.values[metric])&&(!conf||conference(p)===conf)).sort((a,b)=>b.p.values[metric]!-a.p.values[metric]!);
  const result:{rank:number;population:number}[]=[];let rank=0,prior:number|undefined;
  candidates.forEach(({p,index},i)=>{if(p.values[metric]!==prior)rank=i+1;prior=p.values[metric]!;result[index]={rank,population:candidates.length};});ranks.set(key,result);return result;
 };
 return (detail:GameDetails):Watch=>{
  const cutoff=`${snapshot.season} season through Week ${snapshot.throughWeek}`;
  const qualification=`${snapshot.source}. Positions cover supported reported totals, not certified complete ${detail.identity.league==='CFB'?'national':'NFL'} rankings. Roster or statistical evidence does not confirm game participation.`;
  const output:Watch={players:[],comparisons:[],cutoff,qualification};
  if(snapshot.season!==detail.identity.season||snapshot.phase!=='REG'||detail.week===null||detail.week<=snapshot.throughWeek)return output;
  const teams=[detail.identity.away,detail.identity.home],homeConf=snapshot.teams[teams[1]]?.conferenceId,awayConf=snapshot.teams[teams[0]]?.conferenceId;
  const shared=homeConf&&homeConf===awayConf?homeConf:null;
  const options:WatchPlayer[]=[];
  rows.forEach((p,index)=>{
   // A multi-team total remains in the league population but cannot be assigned
   // to one matchup or conference without a verified current-team observation.
   if(p.teams.length!==1||!teams.includes(p.teams[0]))return;
   const team=p.teams[0],conf=snapshot.teams[team]?.conferenceId??null;
   for(const [metric,definition] of Object.entries(metrics)){
    const value=p.values[metric];if(!p.categories.includes(definition.category)||typeof value!=='number'||!Number.isFinite(value)||value<=0)continue;
    const national=ranking(metric,null)[index],within=conf?ranking(metric,conf)[index]:null;if(!national)continue;
    const priority=shared&&within&&within.rank<=5?120-within.rank:national.rank<=10?100-national.rank:within&&within.rank<=3?80-within.rank:0;
    if(!priority)continue;
    const confName=snapshot.teams[team]?.conferenceName??null;
    const reason=within&&((shared&&within.rank<=5)||(within.rank<=3&&national.rank>10))?`No. ${within.rank} of ${within.population} reported ${confName??'conference'} totals`:`No. ${national.rank} of ${national.population} reported ${detail.identity.league==='CFB'?'FBS':'NFL'} totals`;
    options.push({id:p.id,name:p.name,team,stat:{metric,label:definition.label,value,rank:national.rank,population:national.population,conferenceRank:within?.rank??null,conferencePopulation:within?.population??null,conferenceName:confName},connection:null,reason,priority});
   }
  });
  // Comparable opponents share the same metric, period and ranked population.
  for(const [metric,definition] of Object.entries(metrics)){
   const left=options.filter(p=>p.team===teams[0]&&p.stat?.metric===metric).sort((a,b)=>b.priority-a.priority)[0],right=options.filter(p=>p.team===teams[1]&&p.stat?.metric===metric).sort((a,b)=>b.priority-a.priority)[0];
   if(!left?.stat||!right?.stat)continue;
   const gap=Math.abs(left.stat.value-right.stat.value),leftRank=shared?left.stat.conferenceRank??Infinity:left.stat.rank,rightRank=shared?right.stat.conferenceRank??Infinity:right.stat.rank;
   if(!meaningfulWatchComparison(metric,gap,Math.max(left.stat.value,right.stat.value),leftRank,rightRank,Boolean(shared)))continue;
   left.priority+=15;right.priority+=15;
   output.comparisons.push({left:left.id,right:right.id,metric,label:definition.label,gap,unit:definition.unit,scope:shared?`${left.stat.conferenceName} reported totals`:`reported ${detail.identity.league==='CFB'?'FBS':'NFL'} totals`});
  }
  for(const team of teams){
   const seen=new Set<string>();for(const option of options.filter(p=>p.team===team).sort((a,b)=>b.priority-a.priority||a.stat!.rank-b.stat!.rank||a.id.localeCompare(b.id))){if(seen.has(option.id))continue;seen.add(option.id);output.players.push(option);if(seen.size===2)break;}
  }
  output.comparisons=output.comparisons.filter(c=>output.players.some(p=>p.id===c.left&&p.stat?.metric===c.metric)&&output.players.some(p=>p.id===c.right&&p.stat?.metric===c.metric)).slice(0,2);
  for(const ref of refs){
   if(refConflicts.has(ref.id)||ref.league!==detail.identity.league||ref.season!==detail.identity.season||!teams.includes(ref.team)||ref.rosterStatus!=='active'||!/^espn:cfb:athlete:[1-9]\d*$/.test(ref.id)||ref.id.split(':').at(-1)!==ref.espnId||!detail.kickoff||Date.parse(ref.rosterObservedAt)>Date.parse(detail.kickoff)||!Number.isFinite(Date.parse(ref.rosterObservedAt)))continue;
   const duplicate=output.players.find(p=>p.id===ref.id);
   const fact={kind:ref.connectionKind??'International',factType:ref.factType,fact:ref.fact,source:ref.source,sourceUrl:ref.sourceUrl,rosterObservedAt:ref.rosterObservedAt};
   if(duplicate){if(duplicate.team===ref.team)duplicate.connection=fact;continue;}
   output.players.push({id:ref.id,name:ref.name,team:ref.team,stat:null,connection:fact,reason:'Verified 2026 roster connection; participation unconfirmed',priority:0});
  }
  return output;
 };
}
const selectors={NFL:createWatchSelector(seasons.NFL as WatchSeason,connections.connections),CFB:createWatchSelector(seasons.CFB as WatchSeason,connections.connections)};
export const gameWatch=(detail:GameDetails)=>selectors[detail.identity.league](detail);
