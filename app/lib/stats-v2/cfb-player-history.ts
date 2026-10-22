import history from './cfb-player-history.json';
import { NFL_METRICS, NFL_RATES, NFL_DERIVED, type Metric, type Period } from './nfl-statlines';
import { CFB_CARD_METRICS, type CardMetricKey, type CfbMetrics } from './cfb-card-metrics';

type Game = { gameId:string; week:number; team:string; opponent:string; metrics:unknown; kickoff?:string; observedAt?:string };
type Row = [number,number,string,string,(number|null)[]];
const rows = history.rows as Row[];
const byPlayer = new Map<string,Row[]>();
for (const row of rows) {
  const id=history.players[row[0]];
  if (!byPlayer.has(id)) byPlayer.set(id,[]);
  byPlayer.get(id)!.push(row);
}
export const cfbHistoryTeams = history.teams;
const missing = ():Metric => ({state:'missing',value:null});
function metricsFor(row:Row):CfbMetrics {
  const metrics=Object.fromEntries([...Object.keys(NFL_METRICS),...Object.keys(NFL_RATES),...Object.keys(NFL_DERIVED),...Object.keys(CFB_CARD_METRICS)].map(key=>[key,missing()])) as CfbMetrics;
  history.columns.forEach((key,index)=>{const value=row[4][index];metrics[key as CardMetricKey]=value===null?missing():{state:'value',value};});
  for(const [key,[,,numerator,denominator,scale]] of Object.entries(NFL_RATES)){
    const a=metrics[numerator],b=metrics[denominator];
    metrics[key as keyof typeof NFL_RATES]=a.state!=='value'||b.state!=='value'?missing():b.value===0?{state:'not-applicable',value:null}:{state:'value',value:a.value/b.value*scale};
  }
  return metrics;
}

/** Merge only exact athlete/game/team observations. A conflicting game identity is withheld. */
export function mergeCfbGameLogs(retained:readonly Game[],supplied:readonly Game[],cutoff:number) {
  const selected=new Map<string,Game>(),rejected=new Set<string>();
  for(const game of [...retained,...supplied]){
    if(game.week>cutoff||rejected.has(game.gameId))continue;
    const old=selected.get(game.gameId);
    if(old&&(old.team!==game.team||old.opponent!==game.opponent)){selected.delete(game.gameId);rejected.add(game.gameId);continue;}
    if(old&&Date.parse(old.observedAt??'')>Date.parse(game.observedAt??''))continue;
    selected.set(game.gameId,{...old,...game,kickoff:game.kickoff??old?.kickoff});
  }
  return [...selected.values()].sort((a,b)=>b.week-a.week || (Date.parse(b.kickoff??'')||0)-(Date.parse(a.kickoff??'')||0) || b.gameId.localeCompare(a.gameId)).slice(0,5);
}

/** Indexed, deployment-contained evidence only. Never aggregates history into selected-period tiles. */
export function withCfbPlayerHistory<T extends {id:string;games:Game[]}>(line:T,period:Period):T {
  if(period.season!==history.season||period.phase!==history.phase||period.week===null)return line;
  const retained:Game[]=(byPlayer.get(line.id)??[]).filter(row=>history.games[row[1]].week<=period.week!).map(row=>{
    const game=history.games[row[1]];
    return {gameId:game.id,week:game.week,team:row[2],opponent:row[3],metrics:metricsFor(row),kickoff:game.kickoff,observedAt:game.observedAt,source:'ESPN',sourceHash:game.summarySha256};
  });
  return {...line,games:mergeCfbGameLogs(retained,line.games,period.week)};
}
