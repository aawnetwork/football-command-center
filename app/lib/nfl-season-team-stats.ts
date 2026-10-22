import { teamNumber, weeklyTeamCode } from './nfl-weekly-team-stats';

type Row = Record<string, string>;
const codes = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WAS'.split(' '));
/** Only existing nflverse count fields with established meanings are admitted.
 * Gross passing yards must never be labelled net team offense. No score reconstruction. */
export const seasonTeamCategories = {
  'total-offense': { field:null, meaning:'Net team offensive yards — unavailable: no verified net team total.', unit:'yards' },
  'passing-offense': { field:'passing_yards', meaning:'Reported gross passing yards (before sack-yard losses), season total.', unit:'yards' },
  'rushing-offense': { field:'rushing_yards', meaning:'Reported rushing yards, season total.', unit:'yards' },
  'scoring-offense': { field:null, meaning:'Team points — unavailable: no verified total; scoring components are not substituted.', unit:'points' },
  'total-defense': { field:null, meaning:'Net yards allowed — unavailable: tackles are not yards allowed.', unit:'yards' },
  'rushing-defense': { field:null, meaning:'Rushing yards allowed — unavailable: source field not verified.', unit:'yards' },
  'passing-defense': { field:null, meaning:'Net passing yards allowed — unavailable: source field and sack treatment not verified.', unit:'yards' },
  'scoring-defense': { field:null, meaning:'Points allowed — unavailable: source field not verified.', unit:'points' },
  sacks: { field:'def_sacks', meaning:'Reported defensive sacks, season total (including fractional sacks).', unit:'sacks' },
  'turnover-margin': { field:null, meaning:'Takeaways minus giveaways — unavailable: complete team turnover components not verified.', unit:'count' },
} as const;

/** Do not collapse weekly/game records into season totals or merge alias collisions.
 * Missing teams remain a coverage gap, never fabricated zero rows. */
export function projectSeasonTeams(rows:readonly Row[]) {
  const counts=new Map<string,number>();
  for(const row of rows){const code=weeklyTeamCode(row.team??'');if(codes.has(code))counts.set(code,(counts.get(code)??0)+1);}
  const stats:Row[]=[];const seen=new Set<string>();
  for(const row of rows){
    const team=weeklyTeamCode(row.team??'');if(!codes.has(team)||seen.has(team))continue;seen.add(team);
    const period=row.season==='2026'&&row.season_type==='REG'&&!row.week?.trim()&&!row.game_id?.trim();
    stats.push({...row,team,aaw_season_verified:counts.get(team)===1&&period?'1':'0'});
  }
  return {stats,coverage:`nflverse reported 2026 regular-season team snapshot: ${stats.length}/32 recognised teams; ${rows.length-stats.length} duplicate or unrecognised rows withheld. Only unique explicit season records support totals; weekly/game rows are not aggregated. Source cutoff and complete season-to-date coverage are unverified.`};
}
export function seasonTeamValue(row:Record<string,unknown>,category:string):number|null {
  if(row.aaw_season_verified!=='1'||row.season!=='2026'||row.season_type!=='REG'||!Object.hasOwn(seasonTeamCategories,category))return null;
  if(row.team_stat_source==='espn-team-boxscore-season') {
    const fields:Record<string,string>={'total-offense':'total_yards','passing-offense':'passing_yards','rushing-offense':'rushing_yards','total-defense':'def_total_yards','passing-defense':'def_passing_yards','rushing-defense':'def_rushing_yards','scoring-offense':'points','scoring-defense':'def_points',sacks:'def_sacks'};
    const field=fields[category],value=field?teamNumber(row[field]):null;
    return value===null||field==='def_sacks'&&(value<0||!Number.isSafeInteger(value*2))||field!=='def_sacks'&&!Number.isSafeInteger(value)?null:value;
  }
  const field=seasonTeamCategories[category as keyof typeof seasonTeamCategories].field;
  if(!field)return null;
  const n=teamNumber(row[field]);
  return n===null||field==='def_sacks'&&(n<0||!Number.isSafeInteger(n*2))||field!=='def_sacks'&&!Number.isSafeInteger(n)?null:n;
}
export function seasonTeamCoverage(rows:readonly Row[],category:string):string {
  const definition=seasonTeamCategories[category as keyof typeof seasonTeamCategories];
  if(!definition)return 'Category unavailable.';
  const supported=rows.filter(row=>seasonTeamValue(row,category)!==null).length;
  return `${definition.meaning} ${supported}/${rows.length} reported teams have supported values; unavailable observations have no rank. No per-game averages or rates are inferred.`;
}
