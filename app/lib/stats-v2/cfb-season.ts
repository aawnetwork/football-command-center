import type { buildReportedCfbModel } from './cfb-reported-rankings';
import type { EspnEvent } from './nfl-source-types';
import { createHash } from 'node:crypto';
import history from './cfb-player-history.json';
import metadata from './cfb-season-metadata.json';
import reviewed from './cfb-week7-reviewed.json';
import teamDisplay from '../cfb-team-display-2026.json';
import { withCfbPlayerHistory } from './cfb-player-history';
import { NFL_METRICS, NFL_RATES, NFL_DERIVED, type Category, type Metric, type MetricKey } from './nfl-statlines';
import { CFB_CARD_METRICS, type CardMetricKey, type CfbMetrics } from './cfb-card-metrics';

type Row = [number, number, string, string, (number|null)[]];
type Dataset = { season:number; phase:string; columns:string[]; players:string[]; rows:Row[]; teams:Record<string,{name:string;logo:string|null;fbs:boolean}>; games:{id:string;week:number;kickoff:string;observedAt:string;home:string;away:string}[] };
type Metadata = { season:number; throughWeek:number; names:Record<string,string>; conferences:Record<string,string>; positions:Record<string,{position:string}> };
const unknown:Metric={state:'missing',value:null};
const missing = ():Metric => unknown;
const fields:Record<Category,MetricKey[]> = {
  QB:['passing_yards','completions','attempts','completion_pct','passing_tds','passing_interceptions','passing_yards_per_attempt'],
  Rush:['rushing_yards','carries','rushing_yards_per_carry','rushing_tds'],
  Rec:['receiving_yards','receptions','receiving_yards_per_reception','receiving_tds'],
  Def:['tackles','def_tackles_solo','def_sacks','def_tackles_for_loss','def_interceptions','def_pass_defended'],
};
/** A total is known only when every retained appearance has a reported value.
 * No absent category/athlete line becomes zero. INT totals are withheld separately:
 * positive interception-only rows cannot establish a season's zero observations. */
export function cfbSeasonTotals(rows:readonly Row[], columns:readonly string[]):CfbMetrics {
  const result=Object.fromEntries([...Object.keys(NFL_METRICS),...Object.keys(NFL_RATES),...Object.keys(NFL_DERIVED),...Object.keys(CFB_CARD_METRICS)].map(key=>[key,missing()])) as CfbMetrics;
  columns.forEach((key,index)=>{
    const cells=rows.map(row=>row[4][index]);
    if(!rows.length||key==='def_interceptions'||cells.some(value=>typeof value!=='number'||!Number.isFinite(value)))return;
    const values=cells as number[];
    const value=key==='rushing_long'||key==='receiving_long'?Math.max(...values):values.reduce((sum,n)=>sum+n,0);
    if(Number.isFinite(value))result[key as CardMetricKey]={state:'value',value};
  });
  for(const [key,[,,numerator,denominator,scale]] of Object.entries(NFL_RATES)){
    const a=result[numerator],b=result[denominator];
    result[key as keyof typeof NFL_RATES]=a.state!=='value'||b.state!=='value'||b.value<0||((key==='completion_pct'||key==='catch_pct')&&a.value>b.value)?missing():b.value===0?{state:'not-applicable',value:null}:{state:'value',value:a.value/b.value*scale};
  }
  return result;
}

/** Pure, bounded snapshot projection. Exact identities only; conflicting duplicates
 * are withheld, identical duplicates collapse. Conference filters select own-team stints. */
export function buildCfbSeason(data:Dataset, meta:Metadata, conference:string|null=null, cutoff=meta.throughWeek) {
  if(data.season!==2026||data.phase!=='REG'||meta.season!==2026||(!Number.isInteger(meta.throughWeek)||meta.throughWeek<7||meta.throughWeek>16))throw Error('Invalid season evidence');
  const facts=new Map<string,Row>(),conflicts=new Set<string>();
  for(const row of data.rows){
    const [player,gameIndex,team,opponent]=row,game=data.games[gameIndex],id=data.players[player];
    if(!game||game.week<1||game.week>cutoff)continue;
    const key=id+'|'+game.id;
    if(!/^espn:cfb:athlete:[1-9]\d*$/.test(id??'')||!data.teams[team]?.fbs||team===opponent||![game.home,game.away].includes(team)||![game.home,game.away].includes(opponent)||!/^espn:cfb:game:[1-9]\d*$/.test(game.id)||!Number.isFinite(Date.parse(game.kickoff))||!Number.isFinite(Date.parse(game.observedAt)))throw Error('Invalid retained identity');
    const old=facts.get(key);
    if(old&&JSON.stringify(old)!==JSON.stringify(row))conflicts.add(key);else facts.set(key,row);
  }
  const rejectedPlayers=new Set([...conflicts].map(key=>key.split('|')[0]));
  for(const [key,row] of facts)if(rejectedPlayers.has(data.players[row[0]]))facts.delete(key);
  const players=new Map<string,Row[]>();
  for(const row of facts.values()){
    if(conference&&meta.conferences[row[2]]!==conference)continue;
    const id=data.players[row[0]];if(!players.has(id))players.set(id,[]);players.get(id)!.push(row);
  }
  const index=(key:string)=>data.columns.indexOf(key);
  const reported=(rs:Row[],keys:string[])=>rs.some(row=>keys.some(key=>typeof row[4][index(key)]==='number'));
  let unresolvedPassers=0,nonQbPassers=0;
  const lines=[...players].map(([id,rs])=>{
    const teams=[...new Set(rs.map(row=>row[2]))];
    const categoryFor=(records:Row[]):Category[]=>{
      const categories:Category[]=[];
      const passing=records.filter(row=>row[4][index('attempts')]!=null);
      if(passing.length&&records.every(row=>meta.positions[id+'|'+row[2]]?.position==='QB'))categories.push('QB');
      if(reported(records,['carries','rushing_yards','rushing_tds']))categories.push('Rush');
      if(reported(records,['receptions','receiving_yards','receiving_tds']))categories.push('Rec');
      if(reported(records,['tackles','def_sacks','def_tackles_for_loss','def_interceptions','def_pass_defended','def_qb_hurries','def_tds']))categories.push('Def');
      return categories;
    };
    const categories=categoryFor(rs);
    if(reported(rs,['attempts'])&&!categories.includes('QB')){
      if(teams.some(team=>!meta.positions[id+'|'+team]))unresolvedPassers++;else nonQbPassers++;
    }
    const metrics=cfbSeasonTotals(rs,data.columns);
    return {id,identity:{key:id,espnId:id.split(':').at(-1),ncaaId:null},name:meta.names[id]??id,teams,categories,playingNow:false,
      metrics,games:[] as {gameId:string;week:number;team:string;opponent:string;metrics:CfbMetrics;kickoff:string;observedAt:string}[],
      stints:teams.map(team=>{const records=rs.filter(row=>row[2]===team);return {team,categories:categoryFor(records),metrics:teams.length===1?metrics:cfbSeasonTotals(records,data.columns),conferenceId:meta.conferences[team]??null};})};
  });
  return {lines,unresolvedPassers,nonQbPassers,conflictingAppearances:conflicts.size,appearances:[...players.values()].reduce((n,rs)=>n+rs.length,0)};
}

const retainedBases=new WeakMap<Dataset,Map<string,ReturnType<typeof buildCfbSeason>>>();
type CurrentModel=ReturnType<typeof buildReportedCfbModel>&{events:readonly EspnEvent[]};
/** Rebuild from immutable base plus cumulative current-game observations, never increments. */
export function withCfbSeasonLive(data:Dataset, meta:Metadata, current:CurrentModel, conference:string|null=null){
 const week=current.period.week;
 if(current.period.season!==2026||current.period.phase!=='REG'||week===null||week>meta.throughWeek+1)throw Error('Season base needs the intervening completed weeks before this current week can be included');
 let bases=retainedBases.get(data);if(!bases){bases=new Map();retainedBases.set(data,bases);}
 const baseKey=conference??'all';let base=bases.get(baseKey);if(!base){base=buildCfbSeason(data,meta,conference);if(bases.size>=16)bases.delete(bases.keys().next().value!);bases.set(baseKey,base);}
 const affected=new Set(current.lines.map(line=>line.id));
 const prior=data.rows.filter(row=>affected.has(data.players[row[0]]));
 const combined:Dataset={...data,players:[...data.players],games:[...data.games],rows:prior,teams:{...data.teams}};
 const evidence:Metadata={...meta,names:{...meta.names},positions:{...meta.positions},conferences:{...meta.conferences}};
 for(const line of current.lines)for(const game of line.games){
  if(game.week<=meta.throughWeek)continue;
  const event=current.events.find(e=>'espn:cfb:game:'+e.id===game.gameId),participants=event?.competitions?.[0]?.competitors??[];
  const home=participants.find(p=>p.homeAway==='home')?.team?.id,away=participants.find(p=>p.homeAway==='away')?.team?.id;
  if(!home||!away||home===away||![home,away].includes(game.team)||![home,away].includes(game.opponent))throw Error('Current season game identity unavailable');
  let player=combined.players.indexOf(line.id);if(player<0){player=combined.players.length;combined.players.push(line.id);}
  let index=combined.games.findIndex(g=>g.id===game.gameId);
  if(index<0){index=combined.games.length;combined.games.push({id:game.gameId,week:game.week,kickoff:game.kickoff,observedAt:game.observedAt,home,away});}
  else if(combined.games[index].week!==game.week||combined.games[index].home!==home||combined.games[index].away!==away)throw Error('Conflicting current season game');
  const team=current.teams[game.team];combined.teams[game.team]={name:team.name,logo:team.logo,fbs:true};
  evidence.names[line.id]=line.name;if(team.conferenceId)evidence.conferences[game.team]=team.conferenceId;
  // Conflicting or unresolved positions cannot borrow eligibility from passing activity.
  const key=line.id+'|'+game.team,prior=evidence.positions[key]?.position;
  if(game.position&&(!prior||prior===game.position))evidence.positions[key]={position:game.position};
  else delete evidence.positions[key];
  combined.rows=combined.rows.filter(row=>!(combined.players[row[0]]===line.id&&combined.games[row[1]].id===game.gameId));
  combined.rows.push([player,index,game.team,game.opponent,combined.columns.map(k=>game.metrics[k as CardMetricKey]?.value??null)]);
 }
 const before=buildCfbSeason({...data,rows:prior},meta,conference);
 const model=buildCfbSeason(combined,evidence,conference,Math.max(meta.throughWeek,week));
 const updates=new Map(model.lines.map(line=>[line.id,line]));
 model.appearances=base.appearances-before.appearances+model.appearances;
 model.unresolvedPassers=base.unresolvedPassers-before.unresolvedPassers+model.unresolvedPassers;
 model.nonQbPassers=base.nonQbPassers-before.nonQbPassers+model.nonQbPassers;
 model.conflictingAppearances=base.conflictingAppearances-before.conflictingAppearances+model.conflictingAppearances;
 model.lines=[...base.lines.filter(line=>!affected.has(line.id)),...updates.values()];
 const liveById=new Map(current.lines.map(line=>[line.id,line]));
 const unavailableTeams=new Set<string>();
 for(const event of current.events){const c=event.competitions?.[0],status=c?.status?.type;if(status?.state==='pre'&&Date.parse(event.date??'')>Date.parse(current.checkedAt))continue;
  for(const participant of c?.competitors??[]){const team=participant.team?.id;if(team&&!current.lines.some(l=>l.games.some(g=>g.gameId==='espn:cfb:game:'+event.id&&g.team===team)))unavailableTeams.add(team);}
 }
 model.lines=model.lines.map(line=>{const live=liveById.get(line.id),games=live?.games.filter(g=>line.teams.includes(g.team))??[];
  if(line.teams.some(team=>unavailableTeams.has(team))){const absent=Object.fromEntries(Object.keys(line.metrics).map(k=>[k,missing()])) as CfbMetrics;return {...line,metrics:absent,stints:line.stints.map(stint=>({...stint,metrics:absent})),playingNow:false,games};}
  return {...line,playingNow:games.some(g=>g.playingNow),games};
 });
 return model;
}
/** Reuse exact, already reviewed season/team/player position evidence. */
export function retainedCfbPositions(){
 if(!validHistory)throw Error('Retained position evidence fingerprint mismatch');
 return Object.entries(metadata.positions).map(([key,row])=>{const [player,teamId]=key.split('|');return {season:2026,teamId,athleteId:player.split(':').at(-1)!,position:row.position};});
}
const liveObservations=new Map<string,{model:ReturnType<typeof buildCfbSeason>;conference:string|null;week:number;observedAt:string}>();
const dataset=history as unknown as Dataset, meta=metadata as Metadata;
// History deliberately retains nullable display assets. Reuse the verified
// season-specific directory by exact ESPN team ID, without touching source facts.
const displayDirectory=teamDisplay.teams as Record<string,{logo:string|null}>;
const seasonTeams=Object.fromEntries(Object.entries(history.teams).map(([id,team])=>[
  id,{...team,logo:team.logo??displayDirectory[id]?.logo??null},
]));
// Tie supplemental names/positions/conferences to the exact full history, not a five-game slice.
const validHistory=createHash('sha256').update(JSON.stringify(history)+'\n').digest('hex')===metadata.historySha256;
const models=new Map<string,ReturnType<typeof buildCfbSeason>>();
const conferences=Object.entries(reviewed.conferences).map(([id,name])=>({id,name}));
const observed=history.games.map(game=>game.observedAt).sort();
const observationAt=observed.at(-1)!;
const revision=createHash('sha256').update(JSON.stringify(metadata)).digest('hex');
const headers={'Cache-Control':'no-store'};
export function cfbSeasonResponse(params:URLSearchParams,view:string,category:Category,conference:string|null,current?:CurrentModel):Response {
  if(!validHistory)return Response.json({error:'Season history fingerprint mismatch'},{status:503,headers});
  if(params.has('week')||conference&&!conferences.some(c=>c.id===conference))return Response.json({error:'Invalid season selection'},{status:400,headers});
  if(view==='export')return Response.json({error:'Season national ranking certification is not established'},{status:409,headers});
  if(view==='status')return Response.json({error:`Fixed Season snapshot through Week ${meta.throughWeek}; no live status checks`},{status:409,headers});
  const saved=liveObservations.get(params.get('snapshot')??'');
  if(view==='details'&&saved){
    const ids=params.get('players')?.split(',')??[];
    if(saved.conference!==conference||!ids.length||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!saved.model.lines.some(line=>line.id===id)))return Response.json({error:'Invalid player selection'},{status:400,headers});
    return Response.json({snapshot:params.get('snapshot'),period:{season:2026,phase:'REG',week:null},observationAt:saved.observedAt,lines:saved.model.lines.filter(l=>ids.includes(l.id)).map(l=>withCfbPlayerHistory(l,{season:2026,phase:'REG',week:saved.week}))},{headers});
  }
  const key=conference??'all';
  let model=models.get(key);
  if(current)model=withCfbSeasonLive(dataset,meta,current,conference);
  if(!model){model=buildCfbSeason(dataset,meta,conference);if(models.size>=16)models.delete(models.keys().next().value!);models.set(key,model);}
  const snapshot=current?crypto.randomUUID():`cfb-season-week${meta.throughWeek}-${revision}:${key}`;
  if(current){while(liveObservations.size>=4)liveObservations.delete(liveObservations.keys().next().value!);liveObservations.set(snapshot,{model,conference,week:current.period.week!,observedAt:current.checkedAt});}
  const period={season:2026,phase:'REG' as const,week:null};
  if(view==='details'){
    const ids=params.get('players')?.split(',')??[];
    if(params.get('snapshot')!==snapshot||!ids.length||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!model!.lines.some(line=>line.id===id)))return Response.json({error:'Invalid player selection'},{status:400,headers});
    return Response.json({snapshot,period,observationAt,throughWeek:meta.throughWeek,lines:model.lines.filter(line=>ids.includes(line.id)).map(line=>withCfbPlayerHistory(line,{...period,week:meta.throughWeek}))},{headers});
  }
  if(!Object.hasOwn(fields,category)||params.has('snapshot')||params.has('players'))return Response.json({error:'Invalid category'},{status:400,headers});
  const candidates=model.lines.filter(line=>line.categories.includes(category)),columns=fields[category];
  const confidence=Object.fromEntries(columns.map(metric=>{
    const supportedPlayers=candidates.filter(line=>line.metrics[metric].state==='value').length,notApplicablePlayers=candidates.filter(line=>line.metrics[metric].state==='not-applicable').length;
    return [metric,{status:supportedPlayers?'reported-values':'unverified',supportedPlayers,candidatePlayers:candidates.length,missingPlayers:candidates.length-supportedPlayers-notApplicablePlayers,notApplicablePlayers}];
  }));
  const warnings=[`Totals require a reported value in every retained player appearance; missing game lines are not zeros. This is not national leaderboard certification.`,`${model.unresolvedPassers} observed passers have unverified positions; ${model.nonQbPassers} are verified non-QBs and excluded from QB rankings. Position evidence is season-qualified, not archived game-time evidence.`,`Defensive interception season totals are unavailable: absent interception rows do not establish zero. Targets, assisted tackles and unsupported breakdowns remain unavailable.`];
  return Response.json({version:1,snapshot,period,throughWeek:meta.throughWeek,liveWeek:current?.period.week,observationAt:current?.checkedAt??observationAt,observationRange:{from:observed[0],through:current?.checkedAt??observationAt},scope:'retained-espn-season',complete:false,rankScope:'reported-values',independentNationalCertification:false,
    sourceAttribution:current?`ESPN retained season base through Week ${meta.throughWeek} + reported Week ${current.period.week} observations (in-progress games provisional; collection may be incomplete)`:`ESPN retained appearances · Season snapshot through Week ${meta.throughWeek} · ${history.games.length} completed games (Weeks 1–${meta.throughWeek})`,
    coveredGames:history.games.length+(current&&current.period.week!>meta.throughWeek?current.collection.observedGames:0),currentCollection:current?.collection,retainedAppearances:model.appearances,confidence,columns,displayColumns:columns,teams:seasonTeams,conferences,logos:Object.fromEntries(Object.entries(seasonTeams).map(([id,team])=>[id,team.logo])),coverage:{warnings},sources:{live:{status:current?'partial':'completed-snapshot'}},
    lines:candidates.map(line=>({id:line.id,name:line.name,teams:line.teams,playingNow:line.playingNow,values:columns.map(metric=>line.metrics[metric].value),notApplicable:columns.filter(metric=>line.metrics[metric].state==='not-applicable')}))},{headers});
}
