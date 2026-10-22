import nflTeams from '../../lib/nfl-team-display-2026.json';
import cfbTeams from '../../lib/cfb-team-display-2026.json';
import { weeklyTeamValue, weeklyTeamCode, teamNumber } from '../../lib/nfl-weekly-team-stats';
import { seasonTeamValue, seasonTeamCoverage, seasonTeamCategories } from '../../lib/nfl-season-team-stats';
import { cfbWeeklyTeamLeaders, type WeeklyTeams } from '../../lib/cfb-weekly-team-stats';
import { cfbSeasonTeamLeaders, ncaaTeamDefinitions } from '../../lib/cfb-season-team-stats';
import { nflTeamNameByAbbreviation } from '../../nfl/data/divisions';
import type { SeasonStat } from '../../lib/cfb-helpers';
export type League='NFL'|'CFB';
export type Mode='weekly'|'season';
export type Group='Offense'|'Defense'|'Other';
export type Column={id:string;label:string;unit:string;lower?:boolean;decimals?:number;explanation:string};
export type TeamRow={id:string;name:string;logo?:string|null;conferenceId?:string|null;aliases:string[];pending?:boolean;gamesPlayed?:number;values:Record<string,number|null>};
export type TeamData={rows:TeamRow[];week:number|null;availableWeeks:number[];coverage:Record<string,string>;cutoffs:Record<string,string[]>;warnings:string[];observedAt?:string;throughWeek?:number;snapshot?:boolean;passingBasis?:'net'|'gross';historical?:boolean};
export const conferences=Object.entries(cfbTeams.conferences).map(([id,name])=>({id,name}));
const teamMetadata=cfbTeams.teams as Record<string,{name:string;ncaa:string;conferenceId:string|null;logo:string|null}>;
const ncaaIds=new Map(Object.entries(teamMetadata).map(([id,t])=>[t.ncaa,id]));
const groups:Record<Group,string[]>={Offense:['total-offense','passing-offense','rushing-offense','scoring-offense'],Defense:['total-defense','passing-defense','rushing-defense','scoring-defense','sacks'],Other:['turnover-margin']};
export function teamColumns(league:League,mode:Mode,group:Group,passingBasis?:'net'|'gross'):Column[]{
 const ids=league==='CFB'&&mode==='weekly'&&group==='Defense'?['yards-allowed','passing-defense','rushing-defense','scoring-defense','total-defense','sacks']:groups[group];
 const selected=ids.filter(id=>mode==='season'||(league==='CFB'?['total-offense','passing-offense','rushing-offense','total-defense','sacks','yards-allowed','passing-defense','rushing-defense','scoring-defense'].includes(id):id!=='turnover-margin'));
 if(league==='NFL'&&mode==='season'&&(group==='Offense'||group==='Defense'))selected.splice(1,0,group==='Defense'?'total-defense-ypg':'total-offense-ypg');
 return selected.map(id=>{
  if(id==='total-defense-ypg'||id==='total-offense-ypg')return {id,label:id==='total-defense-ypg'?'ALLOWED YPG':'OFFENSE YPG',unit:'yards per game',lower:id==='total-defense-ypg',decimals:1,explanation:'Verified season yardage total divided by verified games played through the same cutoff. Rankings use unrounded YPG.'};
  const cfbWeek=league==='CFB'&&mode==='weekly',cfbSeason=league==='CFB'&&mode==='season';
  const label=({'total-offense':league==='NFL'&&mode==='season'?'TOTAL YDS':'TOTAL','passing-offense':'PASS','rushing-offense':'RUSH','scoring-offense':'POINTS','total-defense':cfbWeek?'TACKLES':league==='NFL'&&mode==='season'?'TOTAL YDS ALLOWED':'TOTAL ALLOWED','yards-allowed':'YDS ALLOWED','passing-defense':'PASS ALLOWED','rushing-defense':'RUSH ALLOWED','scoring-defense':'POINTS ALLOWED',sacks:'SACKS','turnover-margin':'MARGIN'} as Record<string,string>)[id];
  const unit=cfbSeason?ncaaTeamDefinitions[id as keyof typeof ncaaTeamDefinitions].unit:id==='sacks'?mode==='season'?'sacks total':'sacks':id==='turnover-margin'?'margin total':cfbWeek&&id==='passing-defense'?'net yards allowed':cfbWeek&&id==='total-defense'?'tackles':id.startsWith('scoring-')?mode==='season'?'points total':'points':league==='NFL'&&mode==='season'&&id==='passing-offense'?passingBasis==='net'?'net yards total':'gross yards total':mode==='season'?'yards total':id==='passing-offense'?'net yards':'yards';
  const explanation=league==='NFL'&&mode==='season'&&passingBasis==='net'?(id==='turnover-margin'?'Complete team turnover components are not retained.':`ESPN final team boxscores: ${id==='passing-offense'?'net passing yards after sack losses':id==='total-offense'?'official net team offense':id==='total-defense'?'opponent net team offense allowed':label.toLowerCase()}, summed through the stated week.`):league==='NFL'&&mode==='season'?seasonTeamCategories[id as keyof typeof seasonTeamCategories].meaning:cfbSeason?`NCAA ${ncaaTeamDefinitions[id as keyof typeof ncaaTeamDefinitions].field}: ${unit}. Source cutoff and reported-value safeguards apply.`:cfbWeek&&id==='total-defense'?'Reported team tackles, not yards allowed.':cfbWeek&&['yards-allowed','passing-defense','rushing-defense','scoring-defense'].includes(id)?'Completed games only: identified opponent team boxscore and final score. Passing uses ESPN netPassingYards as reported; no inferred sack adjustment.':'Reported team boxscore statistic only; unavailable fields are not reconstructed.';
  return {id,label,unit,lower:id==='yards-allowed'||id.endsWith('-defense')&&!(cfbWeek&&id==='total-defense'),explanation};
 });
}
export function defaultTeamColumn(league:League,mode:Mode,group:Group){
 const columns=teamColumns(league,mode,group);
 return columns.find(c=>league==='NFL'&&mode==='season'&&group==='Defense'&&c.id==='total-defense-ypg')??columns[0];
}
function nflSeasonMetric(raw:Record<string,unknown>,metric:string,throughWeek:number|null){
 const perGame=metric.endsWith('-ypg'),value=seasonTeamValue(raw,perGame?metric.slice(0,-4):metric);
 if(!perGame)return value;
 const games=teamNumber(raw.games_played);
 return throughWeek!==null&&raw.team_stat_source==='espn-team-boxscore-season'&&games!==null&&games>0&&games<=throughWeek&&Number.isSafeInteger(games)&&value!==null?value/games:null;
}
export function teamRefreshLabel(mode:Mode,week:string,data:TeamData|null,metric:string){
 if(mode==='season'){
  if(data?.throughWeek)return `Season snapshot · Through Week ${data.throughWeek}`;
  const cutoffs=data?.cutoffs[metric]??[];
  return cutoffs.length?`Season snapshot · ${cutoffs.map(s=>s.match(/Through games .+$/i)?.[0]??'cutoff unavailable').join(' · ')}`:'Season snapshot · Source cutoff unavailable';
 }
 return data?.snapshot||week&&data?.historical?'Historical week · Reported snapshot; display checked every 30 seconds':week?'Selected week · Automatic checks every 30 seconds':'Current Week · Automatic checks every 30 seconds';
}
const blank=(columns:Column[])=>Object.fromEntries(columns.map(c=>[c.id,null])) as Record<string,number|null>;
export function nflTeamData(body:{season:number;mode:string;week:number|null;stats:Record<string,string>[];coverage?:string;availableWeeks?:number[];throughWeek?:number;snapshot?:boolean;passingBasis?:'net'|'gross'},mode:Mode,week:string,columns:Column[]):TeamData{
 if(body.season!==2026||body.mode!==mode||mode==='weekly'&&(!Number.isInteger(body.week)||body.week!<1||body.week!>18||week!==''&&body.week!==Number(week))||mode==='season'&&body.week!==null)throw Error('NFL team period does not match selection');
 const source=body.stats??[],counts=new Map<string,number>();for(const row of source){const id=weeklyTeamCode(row.team??'');counts.set(id,(counts.get(id)??0)+1);}
 const seen=new Set<string>(),rows:TeamRow[]=[];
 for(const raw of source){const id=weeklyTeamCode(raw.team??'');if(!nflTeamNameByAbbreviation[id]||seen.has(id))continue;seen.add(id);const games=teamNumber(raw.games_played);rows.push({id,name:nflTeamNameByAbbreviation[id],logo:(nflTeams as Record<string,{logo:string|null}>)[id]?.logo,aliases:[id],gamesPlayed:games!==null&&Number.isSafeInteger(games)&&games>0?games:undefined,values:Object.fromEntries(columns.map(c=>[c.id,counts.get(id)!==1?null:mode==='season'?nflSeasonMetric(raw,c.id,body.snapshot===true&&Number.isSafeInteger(body.throughWeek)&&body.throughWeek!>0&&body.throughWeek!<=18?body.throughWeek!:null):weeklyTeamValue(raw,c.id)]))});}
 return {rows,week:body.week,availableWeeks:body.availableWeeks??[],snapshot:body.snapshot,throughWeek:body.throughWeek,passingBasis:body.passingBasis,coverage:Object.fromEntries(columns.map(c=>[c.id,mode==='season'&&body.passingBasis==='net'&&c.id==='turnover-margin'?'Complete team turnover figures are not retained.':body.coverage??(mode==='season'?seasonTeamCoverage(source,c.id):'ESPN reported team boxscores.')])),cutoffs:{},warnings:[]};
}
export function cfbWeeklyData(data:WeeklyTeams,week:string,columns:Column[]):TeamData{
 if(data.season!==2026||!Number.isInteger(data.week)||data.week<1||data.week>16||week!==''&&data.week!==Number(week))throw Error('CFB team period does not match selection');
 const unknown=new Set(data.rows.filter(row=>!row.teamId.startsWith('espn:cfb:team:')||!teamMetadata[row.teamId.slice('espn:cfb:team:'.length)]).map(row=>row.teamId));
 data={...data,rows:data.rows.filter(row=>!unknown.has(row.teamId)),unverifiedTeams:data.unverifiedTeams+unknown.size};
 const selected=new Map<string,TeamRow>();
 for(const raw of data.rows){const id=raw.teamId.replace(/^espn:cfb:team:/,'');const t=teamMetadata[id];if(!t||raw.teamId!=='espn:cfb:team:'+id)continue;if(!selected.has(id))selected.set(id,{id,name:t.name,logo:t.logo,conferenceId:t.conferenceId,aliases:[t.ncaa],pending:data.pendingTeams?.includes(raw.teamId),values:blank(columns)});}
 for(const column of columns)for(const leader of cfbWeeklyTeamLeaders(data,column.id)){const row=selected.get(leader.playerId.replace('espn:cfb:team:',''));if(row)row.values[column.id]=leader.value;}
 return {rows:[...selected.values()],week:data.week,availableWeeks:Array.from({length:16},(_,i)=>i+1),observedAt:data.observedAt,snapshot:data.snapshot,historical:data.rows.length>0&&data.rows.every(row=>data.completedTeams?.includes(row.teamId)),coverage:Object.fromEntries(columns.map(c=>[c.id,`${data.snapshot?'ESPN saved final boxscores':'ESPN team boxscores'} · ${data.games} fixtures tracked. Rankings cover reported FBS values only.${data.unverifiedTeams?' Teams with unverified membership are excluded.':''}`])),cutoffs:{},warnings:[]};
}
export function cfbSeasonData(records:SeasonStat[],columns:Column[],failed:string[]=[]):TeamData{
 const selected=new Map<string,TeamRow>(),coverage:Record<string,string>={},cutoffs:Record<string,string[]>={};
 for(const column of columns){
  const notes=[...new Set((records as (SeasonStat & {sourceCoverage?:string})[]).filter(r=>r.category===column.id).map(r=>r.sourceCoverage).filter(Boolean))];
  coverage[column.id]=failed.includes(column.id)?'This NCAA table could not be checked.':notes.join(' ')||'NCAA reported season figures. Rankings cover supported FBS values only.';
  cutoffs[column.id]=[...new Set(records.filter(r=>r.category===column.id&&r.type==='team').map(r=>r.sourceUpdated).filter((s):s is string=>Boolean(s)))];
  for(const leader of cfbSeasonTeamLeaders(records,column.id)){
   const id=ncaaIds.get(leader.team);if(!id)continue;const t=teamMetadata[id];
   if(!selected.has(id))selected.set(id,{id,name:t.name,logo:t.logo,conferenceId:t.conferenceId,aliases:[t.ncaa],values:blank(columns)});
   selected.get(id)!.values[column.id]=Number.isFinite(leader.value)&&leader.rank!==null?leader.value:null;
  }
 }
 return {rows:[...selected.values()],week:null,availableWeeks:[],coverage,cutoffs,warnings:failed.map(id=>`${columns.find(c=>c.id===id)?.label??id}: NCAA table unavailable; other reported statistics remain visible.`)};
}
/** Exact team identities already supplied by the existing adapters. No statistic derivation. */
export function rankTeamRows(rows:TeamRow[],metric:string,ascending:boolean,conference:string,search:string){
 const population=rows.filter(row=>!conference||row.conferenceId===conference);
 const ordered=[...population].sort((a,b)=>{const x=Number.isFinite(a.values[metric])?a.values[metric]:null,y=Number.isFinite(b.values[metric])?b.values[metric]:null;return x==null?y==null?a.id.localeCompare(b.id):1:y==null?-1:(ascending?x-y:y-x)||a.id.localeCompare(b.id);});
 const first=new Map<number,number>();
 const ranked=ordered.map((row,index)=>{const value=Number.isFinite(row.values[metric])?row.values[metric]:null;if(value!=null&&!first.has(value))first.set(value,index+1);return {...row,rank:value==null?null:first.get(value)!};});
 return {population,supported:population.filter(row=>Number.isFinite(row.values[metric])).length,rows:ranked.filter(row=>[row.name,...row.aliases].join(' ').toLowerCase().includes(search.toLowerCase().trim()))};
}
