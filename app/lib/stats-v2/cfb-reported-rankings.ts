import membership from '../cfb-team-membership-2026.json';
import { buildCfbStatlines } from './cfb-statlines';
import { NFL_METRICS, NFL_RATES, NFL_DERIVED, type Category, type MetricKey } from './nfl-statlines';
import { validateNflRankingSelection } from './nfl-export';
import type { EspnSummary } from './nfl-source-types';
const teams=membership.teams as Record<string,{fbs:boolean}>;
export const isVerifiedCfbFbsTeam=(id:string|undefined,season=2026)=>season===membership.season&&Boolean(id&&teams[id]?.fbs);

/** Keep valid supplied FBS observations; missing games and opposing FCS athletes never become zeroes. */
export function buildReportedCfbModel(input:Parameters<typeof buildCfbStatlines>[0]) {
 const excluded=new Set<string>(),unknown=new Set<string>(),ambiguous=new Set<string>();
 let expectedGames=0,observedGames=0,expectedTeamObservations=0,observedTeamObservations=0;
 const teamGroups:Record<Category,number>={QB:0,Rush:0,Rec:0,Def:0};
 const gameCounts=new Map<string,number>();for(const event of input.events)if(event.id)gameCounts.set(event.id,(gameCounts.get(event.id)??0)+1);
 const summaries=input.events.map((event,index)=>{
  const competition=event.competitions?.[0],participants=competition?.competitors??[],status=competition?.status?.type;
  const expected=!(status?.state==='pre'&&!status.completed&&Date.parse(event.date??'')>Date.parse(input.observedAt));
  if(expected){expectedGames++;expectedTeamObservations+=participants.filter(p=>isVerifiedCfbFbsTeam(p.team?.id,input.period.season)).length;}
  const raw=input.summaries[index],header=raw?.header as EspnSummary['header']&{season?:{year?:number;type?:number};week?:number};
  const actual=header?.competitions?.[0];
  const periodMatches=(!header?.season||(header.season.year===input.period.season&&header.season.type===(input.period.phase==='REG'?2:3)))&&(header?.week===undefined||header.week===input.period.week);
  const valid=expected&&event.id&&gameCounts.get(event.id)===1&&event.season?.year===input.period.season&&event.season.type===(input.period.phase==='REG'?2:3)&&(event as typeof event & {week?:{number?:number}}).week?.number===input.period.week&&Number.isFinite(Date.parse(event.date??''))&&Date.parse(event.date!)<=Date.parse(input.observedAt)&&raw&&header?.id===event.id&&actual?.id===event.id&&periodMatches&&participants.length===2&&new Set(participants.map(p=>p.team?.id)).size===2&&actual?.competitors?.length===2&&participants.every(p=>actual?.competitors?.filter(a=>a.team?.id===p.team?.id&&a.homeAway===p.homeAway).length===1)&&['in','post'].includes(status?.state??'')&&status?.state===actual?.status?.type?.state&&status?.completed===actual?.status?.type?.completed&&(status?.state!=='post'||status.completed===true);
  const boxes=valid?raw.boxscore?.players??[]:[];
  const owners=new Map<string,Set<string>>();
  for(const box of boxes)if(participants.some(p=>p.team?.id===box.team?.id))for(const group of box.statistics??[])for(const row of group.athletes??[])if(/^[1-9]\d*$/.test(row.athlete?.id??'')){const id=row.athlete!.id!,set=owners.get(id)??new Set<string>();set.add(box.team!.id!);owners.set(id,set);}
  const conflicts=new Set([...owners].filter(([,owners])=>owners.size>1).map(([id])=>id));for(const id of conflicts)ambiguous.add(`${event.id}:${id}`);
  const accepted=boxes.filter(box=>{
   const id=box.team?.id;
   if(!id||participants.filter(p=>p.team?.id===id).length!==1||boxes.filter(b=>b.team?.id===id).length!==1)return false;
   if(!isVerifiedCfbFbsTeam(id,input.period.season)){
    for(const group of box.statistics??[])for(const row of group.athletes??[])if(/^[1-9]\d*$/.test(row.athlete?.id??''))(teams[id]?.fbs===false?excluded:unknown).add(`${id}:${row.athlete!.id}`);
    return false;
   }
   return true;
  });
  const safeBoxes=accepted.map(box=>({...box,statistics:box.statistics?.map(group=>({...group,athletes:group.athletes?.filter(row=>!conflicts.has(row.athlete?.id??''))}))}));
  if(accepted.length){observedGames++;observedTeamObservations+=accepted.length;}
  for(const box of accepted)for(const category of ['QB','Rush','Rec','Def'] as Category[]){const names=category==='Def'?['defensive','interceptions']:[{QB:'passing',Rush:'rushing',Rec:'receiving'}[category]];if(box.statistics?.some(group=>names.includes(group.name??'')))teamGroups[category]++;}
  return valid?{...raw,boxscore:{...raw.boxscore,players:safeBoxes}}:null;
 });
 const model=buildCfbStatlines({...input,summaries});
 const unresolved=new Set<string>(),nonQbs=new Set<string>();
 for(const [index,summary] of summaries.entries())for(const box of summary?.boxscore?.players??[])for(const group of box.statistics??[])if(group.name==='passing')for(const row of group.athletes??[]){
  if(!/^[1-9]\d*$/.test(row.athlete?.id??''))continue;
  const key=`${box.team?.id}:${row.athlete!.id}`,line=model.lines.find(line=>line.id===`espn:cfb:athlete:${row.athlete!.id}`),game=line?.games.find(game=>game.gameId===`espn:cfb:game:${input.events[index].id}`&&game.team===box.team?.id);
  if(!game?.position)unresolved.add(key);else if(game.position!=='QB')nonQbs.add(key);
 }
 // A mixed/uncertain passing stint cannot borrow QB eligibility from another team/game.
 for(const line of model.lines)if(line.categories.includes('QB')&&line.games.some(game=>(unresolved.has(`${game.team}:${line.identity.espnId}`)||nonQbs.has(`${game.team}:${line.identity.espnId}`)))){line.categories=line.categories.filter(category=>category!=='QB');for(const game of line.games)game.categories=game.categories.filter(category=>category!=='QB');for(const stint of line.stints)stint.categories=stint.categories.filter(category=>category!=='QB');}
 return {...model,coveredGames:expectedGames,collection:{expectedGames,observedGames,missingGames:expectedGames-observedGames,expectedTeamObservations,observedTeamObservations,missingTeamObservations:expectedTeamObservations-observedTeamObservations,teamGroups,excludedNonFbsPlayers:excluded.size,unverifiedMembershipPlayers:unknown.size,unresolvedPassers:unresolved.size,nonQbPassers:nonQbs.size,validationWarnings:model.issues.length,ambiguousPlayers:ambiguous.size}};
}
export function cfbReportedConfidence(model:Pick<ReturnType<typeof buildReportedCfbModel>,'lines'>,category:Category) {
 const lines=model.lines.filter(line=>line.categories.includes(category));
 const result:Partial<Record<MetricKey,{status:'reported-values'|'unverified';supportedPlayers:number;candidatePlayers:number;missingPlayers:number;notApplicablePlayers:number}>>={};
 for(const key of [...Object.keys(NFL_METRICS),...Object.keys(NFL_RATES),...Object.keys(NFL_DERIVED)] as MetricKey[]){
  try{validateNflRankingSelection({category,statistic:key});}catch{continue;}
  const supportedPlayers=lines.filter(line=>line.metrics[key]?.state==='value'&&Number.isFinite(line.metrics[key].value)).length;
  const notApplicablePlayers=lines.filter(line=>line.metrics[key]?.state==='not-applicable').length;
  result[key]={status:supportedPlayers?'reported-values':'unverified',supportedPlayers,candidatePlayers:lines.length,missingPlayers:lines.length-supportedPlayers-notApplicablePlayers,notApplicablePlayers};
 }
 return result;
}
