import type { buildCfbStatlines } from './cfb-statlines';
import { NFL_METRICS, NFL_RATES, NFL_DERIVED, type Category, type MetricKey } from './nfl-statlines';
import { validateNflRankingSelection } from './nfl-export';
/** This certifies the supplied-game projection only, never FBS-wide completeness. */
export function cfbCoveredConfidence(model: ReturnType<typeof buildCfbStatlines>, expectedGames: number, receivedGames: number | Record<Category,number>) {
  const result:Record<Category,Partial<Record<MetricKey,{status:string;scope:'supplied-games'}>>>={QB:{},Rush:{},Rec:{},Def:{}};
  const critical=model.issues.filter(issue=>issue!=='Passing player without a verified QB position excluded from QB');
  for(const category of ['QB','Rush','Rec','Def'] as Category[])for(const metric of [...Object.keys(NFL_METRICS),...Object.keys(NFL_RATES),...Object.keys(NFL_DERIVED)] as MetricKey[]) {
    try{validateNflRankingSelection({category,statistic:metric});}catch{continue;}
    const lines=model.lines.filter(line=>line.categories.includes(category));
    const valid=expectedGames>0&&(typeof receivedGames==='number'?receivedGames:receivedGames[category])===expectedGames&&!critical.length&&lines.length>0&&!(category==='QB'&&model.issues.length)&&lines.every(line=>line.metrics[metric].state!=='missing');
    result[category][metric]={status:valid?'verified':'unverified',scope:'supplied-games'};
  }return result;
}
