import membership from './cfb-team-membership-2026.json';
import type { Leader } from './cfb-helpers';
export const weeklyTeamFields = {'total-offense':'totalYards','passing-offense':'netPassingYards','rushing-offense':'rushingYards','total-defense':'TOT',sacks:'SACKS','yards-allowed':'totalYards','passing-defense':'netPassingYards','rushing-defense':'rushingYards','scoring-defense':'score'} as const;
type Category=keyof typeof weeklyTeamFields;
type Team={id?:string;displayName?:string};
type Competition={id?:string;status?:{type?:{state?:string;completed?:boolean}};competitors?:{team?:Team;homeAway?:string;score?:unknown}[]};
type Event={id?:string;date?:string;season?:{year?:number;type?:number};week?:{number?:number};competitions?:Competition[]};
type Summary={header?:{id?:string;season?:{year?:number;type?:number};week?:number;competitions?:Competition[]};boxscore?:{teams?:{team?:Team;statistics?:{name?:string;displayValue?:unknown}[]}[];players?:{team?:Team;statistics?:{name?:string;labels?:string[];totals?:unknown[]}[]}[]}};
export type TeamGame={teamId:string;team:string;gameId:string;values:Record<Category,number|null>};
export type WeeklyTeams={season:2026;week:number;games:number;observedAt:string;rows:TeamGame[];excludedNonFbs:number;unverifiedTeams:number;complete:false;pendingTeams?:string[];completedTeams?:string[];snapshot?:boolean};
const teams=membership.teams as Record<string,{name:string;fbs:boolean}>;
export function cfbTeamNumber(raw:unknown):number|null {
 if(typeof raw!=='number'&&typeof raw!=='string')return null;
 if(typeof raw==='string'&&!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw.trim()))return null;
 const n=Number(typeof raw==='string'?raw.trim().replaceAll(',',''):raw);return Number.isFinite(n)?n:null;
}
/** Team boxscores only. The retained membership establishes eligibility, never full-week coverage. */
export function projectCfbWeeklyTeams(board:{season?:{year?:number;type?:number};leagues?:{season?:{year?:number;type?:{type?:number}}}[];week?:{number?:number};events?:Event[]},summaries:(Summary|null)[],requestedWeek:number|null,now=Date.now()):WeeklyTeams {
 const season=board.season??{year:board.leagues?.[0]?.season?.year,type:board.leagues?.[0]?.season?.type?.type},week=board.week?.number;
 if(season.year!==2026||season.type!==2||!Number.isSafeInteger(week)||week!<1||week!>16||(requestedWeek!==null&&requestedWeek!==week))throw Error('CFB team season/week is unverified');
 const events=board.events??[],counts=new Map<string,number>();for(const e of events)if(e.id)counts.set(e.id,(counts.get(e.id)??0)+1);
 const pending=new Set<string>(),completed=new Set<string>();
 const rows:TeamGame[]=[],excluded=new Set<string>(),unknown=new Set<string>(),seen=new Set<string>();
 events.forEach((event,index)=>{
  const competition=event.competitions?.[0],participants=competition?.competitors??[],summary=summaries[index],actual=summary?.header?.competitions?.[0],state=competition?.status?.type;
  if(event.season?.year!==2026||event.season.type!==2||event.week?.number!==week||!event.id||participants.length!==2||new Set(participants.map(p=>p.team?.id)).size!==2)throw Error('CFB team participants are unverified');
  const valid=counts.get(event.id)===1&&event.season?.year===2026&&event.season.type===2&&event.week?.number===week&&competition?.id===event.id&&Number.isFinite(Date.parse(event.date??''))&&Date.parse(event.date!)<=now&&summary?.header?.id===event.id&&summary.header.season?.year===2026&&summary.header.season.type===2&&summary.header.week===week&&actual?.id===event.id&&actual.competitors?.length===2&&participants.every(p=>/^[1-9]\d*$/.test(p.team?.id??'')&&actual.competitors?.filter(a=>a.team?.id===p.team?.id&&a.homeAway===p.homeAway).length===1)&&['in','post'].includes(state?.state??'')&&state?.state===actual.status?.type?.state&&state?.completed===actual.status?.type?.completed&&(state?.state==='post'?state.completed===true:state?.completed!==true);
  for(const participant of participants){
   const id=participant.team?.id;if(!id)throw Error('CFB team identity is absent');
   if(!teams[id]){unknown.add(id);continue;}if(!teams[id].fbs){excluded.add(id);continue;}
   if(state?.state==='pre')pending.add('espn:cfb:team:'+id);
   if(state?.state==='post'&&state.completed===true)completed.add('espn:cfb:team:'+id);
   const key=event.id+':'+id;if(seen.has(key))continue;seen.add(key);
   const row:TeamGame={teamId:'espn:cfb:team:'+id,team:teams[id].name,gameId:'espn:cfb:game:'+event.id,values:Object.fromEntries(Object.keys(weeklyTeamFields).map(k=>[k,null])) as TeamGame['values']};rows.push(row);
   if(!valid)continue;
   const boxes=summary?.boxscore?.teams??[];
   const own=boxes.filter(b=>b.team?.id===id);
   if(boxes.length===2&&new Set(boxes.map(b=>b.team?.id)).size===2&&boxes.every(b=>participants.some(p=>p.team?.id===b.team?.id))&&own.length===1){
    const field=(name:string)=>{const values=own[0].statistics?.filter(s=>s.name===name)??[];return values.length===1?cfbTeamNumber(values[0].displayValue):null;};
    const total=field('totalYards'),pass=field('netPassingYards'),rush=field('rushingYards');
    row.values['total-offense']=total!==null&&(pass===null||rush===null||total===pass+rush)?total:null;
    row.values['passing-offense']=pass;row.values['rushing-offense']=rush;
    // Allowed values come only from the identified opponent's team boxscore.
    // Preserve ESPN's netPassingYards definition; never infer a sack adjustment.
    if(state?.state==='post'&&state.completed===true){
     const opponent=boxes.find(b=>b.team?.id!==id)!;
     const against=(name:string)=>{const entries=opponent.statistics?.filter(s=>s.name===name)??[];return entries.length===1?cfbTeamNumber(entries[0].displayValue):null;};
     const allowed=against('totalYards'),passing=against('netPassingYards'),rushing=against('rushingYards');
     row.values['yards-allowed']=allowed!==null&&(passing===null||rushing===null||allowed===passing+rushing)?allowed:null;
     row.values['passing-defense']=passing;row.values['rushing-defense']=rushing;
    }

   }
   if(state?.state==='post'&&state.completed===true){
    const score=cfbTeamNumber(actual?.competitors?.find(p=>p.team?.id!==id)?.score);
    row.values['scoring-defense']=score!==null&&score>=0&&Number.isSafeInteger(score)?score:null;
   }
   const defense=summary?.boxscore?.players?.filter(b=>b.team?.id===id).flatMap(b=>b.statistics?.filter(g=>g.name==='defensive')??[])??[];
   for(const category of ['total-defense','sacks'] as const){
    const group=defense.length===1?defense[0]:null,key=weeklyTeamFields[category],index=group?.labels?.indexOf(key)??-1;
    const value=index>=0&&group?.labels?.filter(label=>label===key).length===1?cfbTeamNumber(group.totals?.[index]):null;
    row.values[category]=value!==null&&value>=0?value:null;
   }
  }
 });
 return {season:2026,week:week!,games:events.length,observedAt:new Date(now).toISOString(),rows,excludedNonFbs:excluded.size,unverifiedTeams:unknown.size,complete:false,pendingTeams:[...pending],completedTeams:[...completed]};
}
export function cfbWeeklyTeamLeaders(data:WeeklyTeams|null,category:string):(Leader & {rank:number})[] {
 if(!data||!Object.hasOwn(weeklyTeamFields,category))return [];
 const grouped=new Map<string,TeamGame[]>();for(const row of data.rows){const items=grouped.get(row.teamId)??[];items.push(row);grouped.set(row.teamId,items);}
 const leaders = [...grouped].flatMap(([id,rows])=>{
  if(new Set(rows.map(row=>row.gameId)).size!==rows.length)return [];
  const values=rows.map(row=>row.values[category as Category]);
  if(values.some(n=>n===null||!Number.isFinite(n)))return [];
  return [{playerId:id,player:rows[0].team,team:rows[0].team,value:values.reduce<number>((sum,n)=>sum+n!,0)}];
 }).sort((a,b)=>(['yards-allowed','passing-defense','rushing-defense','scoring-defense'].includes(category)?a.value-b.value:b.value-a.value)||a.playerId.localeCompare(b.playerId));
 return leaders.map(row=>({...row,rank:leaders.findIndex(other=>other.value===row.value)+1}));
}
export function cfbWeeklyTeamCoverage(data:WeeklyTeams|null,category:string):string {
 if(!data)return 'Weekly team observations are unavailable.';
 const population=new Set(data.rows.map(row=>row.teamId)).size,supported=cfbWeeklyTeamLeaders(data,category).length;
 return `${supported}/${population} FBS teams in the supplied ${data.games} games report this statistic. Ranks cover reported values only; complete FBS week coverage is unverified. ${data.excludedNonFbs} non-FBS teams excluded; ${data.unverifiedTeams} teams have unverified membership.`;
}
