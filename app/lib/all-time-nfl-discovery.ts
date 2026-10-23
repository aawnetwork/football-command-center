import type {NflAllTimeCategory} from '../nfl/data/nfl-all-time-career';

export type CareerDiscoveryCoverage = {
  status:'covered-range'|'insufficient-range'|'source-unavailable';
  sourceMetric:string; threshold:number; lastReportedValue:number|null; entries:number;
};
export type CareerDiscovery = {
  checkedAt:string;
  sourceUrl:string;
  coverage:Record<NflAllTimeCategory,CareerDiscoveryCoverage>;
  checked:Record<string,string>;
};
// Total (non-passing) TDs upper-bound receiving TDs. They are discovery only,
// never published as receiving/rushing statistics.
const fields:Record<NflAllTimeCategory,string> = {
  'passing-yards':'passingYards','passing-td':'passingTouchdowns',
  'rushing-yards':'rushingYards','rushing-td':'rushingTouchdowns',
  'receiving-yards':'receptions','receiving-td':'totalTouchdowns',
  tackles:'totalTackles',sacks:'sacks',interceptions:'interceptions',
};
type Leader = {value:number;athlete:{$ref:string}};
type LeaderFeed = {id:string;type:string;categories:{name:string;leaders:Leader[]}[]};
export const nflDiscoveryUrl = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/leaders/0?limit=100';

export function parseNflCareerDiscovery(input:unknown,thresholds:Record<NflAllTimeCategory,number>,rosterIds:ReadonlySet<string>) {
  const feed=input as LeaderFeed;
  if(feed?.id!=='0'||feed.type!=='total'||!Array.isArray(feed.categories)||!feed.categories.length)throw new Error('Invalid NFL career discovery feed.');
  const candidateIds=new Set<string>();
  const requiredCategories=new Map<string,Set<NflAllTimeCategory>>();
  const coverage={} as Record<NflAllTimeCategory,CareerDiscoveryCoverage>;
  for(const [category,sourceMetric] of Object.entries(fields) as [NflAllTimeCategory,string][]) {
    const threshold=thresholds[category];
    if(!Number.isFinite(threshold)||threshold<=0)throw new Error('Invalid career discovery threshold.');
    const matches=feed.categories.filter(row=>row.name===sourceMetric);
    if(matches.length>1)throw new Error('Ambiguous career discovery metric.');
    const rows=matches[0]?.leaders??[];
    if(!Array.isArray(rows))throw new Error('Invalid career discovery leaders.');
    const ids=new Set<string>();let previous=Infinity;
    for(const row of rows) {
      const reference=row?.athlete?.$ref;
      const id=typeof reference==='string'?/^https?:\/\/sports\.core\.api\.espn\.com\/v2\/sports\/football\/leagues\/nfl\/athletes\/(\d+)(?:\?|$)/.exec(reference)?.[1]:undefined;
      if(!id||ids.has(id)||typeof row.value!=='number'||!Number.isFinite(row.value)||row.value<0||row.value>previous)throw new Error('Unordered, duplicate or invalid career discovery observation.');
      ids.add(id);previous=row.value;
      // Receptions cannot certify receiving-yard coverage. Every roster athlete
      // returned there is a candidate; no reception-to-yard conversion is made.
      if(rosterIds.has(id)&&(category==='receiving-yards'||row.value>=threshold*.9)) {
        candidateIds.add(id);
        // Direct leader metrics must exist in the verified career response.
        // A TD upper bound alone does not establish receiving activity.
        if(category!=='receiving-td') {
          if(!requiredCategories.has(id))requiredCategories.set(id,new Set());
          requiredCategories.get(id)!.add(category);
        }
      }
    }
    const last=rows.at(-1)?.value??null;
    coverage[category]={sourceMetric,threshold,lastReportedValue:last,entries:rows.length,
      status:!rows.length?'source-unavailable':category==='receiving-yards'||(last!==null&&last>=threshold)?'insufficient-range':'covered-range'};
  }
  return {candidateIds,coverage,requiredCategories};
}
