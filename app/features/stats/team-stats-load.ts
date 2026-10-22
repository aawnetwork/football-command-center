import { cfbSeasonData, cfbWeeklyData, nflTeamData, teamColumns, type Group, type League, type Mode, type TeamData } from './team-stats-model';
import type { SeasonStat } from '../../lib/cfb-helpers';
export async function loadTeamStats(league:League,mode:Mode,week:string,group:Group,request:typeof fetch=fetch,signal?:AbortSignal):Promise<TeamData>{
 const columns=league==='CFB'&&mode==='season'?teamColumns(league,mode,group):(['Offense','Defense','Other'] as Group[]).flatMap(g=>teamColumns(league,mode,g));
 const json=async(url:string)=>{const response=await request(url,{cache:'no-store',signal});if(!response.ok)throw Error('Team statistics request failed');return response.json();};
 if(league==='NFL')return nflTeamData(await json(`/api/nfl/team-stats?mode=${mode}${mode==='weekly'&&week?`&week=${week}`:''}`),mode,week,columns);
 if(mode==='weekly')return cfbWeeklyData(await json(`/api/player-stats?view=teams${week?`&week=${week}`:''}`),week,columns);
 const records:SeasonStat[]=[],failed:string[]=[];
 // Existing category endpoints isolate failures. At most five requests, two at a time;
 // one table supplies all teams, never one request per team or column cell.
 for(let i=0;i<columns.length;i+=2){
  const batch=columns.slice(i,i+2);
  const results=await Promise.allSettled(batch.map(async c=>{const rows=await json(`/api/season-stats?view=team&category=${c.id}`);if(!Array.isArray(rows))throw Error('Invalid NCAA table');return rows.filter(row=>row.type==='team'&&row.category===c.id) as SeasonStat[];}));
  results.forEach((result,index)=>{if(result.status==='fulfilled')records.push(...result.value);else failed.push(batch[index].id);});
  if(signal?.aborted)throw Error('Selection cancelled');
 }
 if(failed.length===columns.length)throw Error('NCAA team tables unavailable');
 return cfbSeasonData(records,columns,failed);
}
/** Owns only Team UI checks. Player adaptive gates remain unchanged. */
export function startTeamChecks<T>(options:{load:()=>Promise<T>;clear:()=>void;success:(data:T,checked:number)=>void;failure:()=>void;checking:(active:boolean)=>void;setTimer?:typeof setInterval;clearTimer?:typeof clearInterval;now?:()=>number}){
 let active=true,pending=false;
 const refresh=async()=>{if(!active||pending)return;pending=true;options.checking(true);try{const data=await options.load();if(active)options.success(data,(options.now??Date.now)());}catch{if(active)options.failure();}finally{pending=false;if(active)options.checking(false);}};
 queueMicrotask(()=>{if(active){options.clear();void refresh();}});
 const timer=(options.setTimer??setInterval)(refresh,30_000);
 return ()=>{active=false;(options.clearTimer??clearInterval)(timer);};
}
