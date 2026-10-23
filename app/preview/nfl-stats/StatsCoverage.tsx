import type { MetricKey } from '../../lib/stats-v2/nfl-statlines';
import styles from './stats-preview.module.css';
type Confidence = {status:string;supportedPlayers?:number;candidatePlayers?:number;missingPlayers?:number;notApplicablePlayers?:number};
export type CoverageData = {lines?:readonly {playingNow:boolean|null}[];period:{season:number;week:number|null};throughWeek?:number;liveWeek?:number;scope?:string;rankScope?:string;coveredGames?:number;independentNationalCertification?:boolean;sourceAttribution?:string;confidence?:Partial<Record<MetricKey,Confidence>>;coverage:{warnings:string[]};collection?:{expectedGames:number;observedGames:number;missingGames:number;expectedTeamObservations:number;observedTeamObservations:number;missingCategoryTeamObservations:number;unverifiedMembershipPlayers:number;unresolvedPassers:number;validationWarnings:number;ambiguousPlayers:number}};
const number=(n:number)=>n.toLocaleString('en-GB');
export function cfbPeriodLabel(data:CoverageData|null,mode:string,selectedWeek:string){
 const season=data?.period.season===undefined?'':`${data.period.season} `;
 if(mode!=='season')return `${season}Week ${data?.period.week??(selectedWeek||'—')}`;
 const base=data?.throughWeek;
 return `${season}Season${base===undefined?' — cutoff unavailable':` — through Week ${base}`}${data?.liveWeek===undefined?'':base!==undefined&&data.liveWeek<=base?` · Week ${data.liveWeek} observations refreshed`:` + available Week ${data.liveWeek} updates`}`;
}
export function cfbMetricLimitation(data:CoverageData|null,key:MetricKey,label:string){
 const c=data?.confidence?.[key];if(!c)return '';
 if(c.supportedPlayers===0)return `${label} unavailable for this selection. Missing observations are not zero.`;
 if(typeof c.missingPlayers==='number'&&c.missingPlayers>0)return `${label}: ${number(c.missingPlayers)} observed players have no reported value.`;
 return '';
}
export function StatsCoverage({data,metric,metricLabel,category,rankingAvailable,snapshot,league='CFB',historical=false,failed=false}:{data:CoverageData;metric:MetricKey;metricLabel:string;category:string;rankingAvailable:boolean;snapshot?:string|null;league?:string;historical?:boolean;failed?:boolean}){
 const c=data.confidence?.[metric],collection=data.collection;
 const incomplete=(c?.missingPlayers??0)>0||(collection?.missingGames??0)>0||(collection?.missingCategoryTeamObservations??0)>0||(collection?.ambiguousPlayers??0)>0||(collection?.validationWarnings??0)>0||(collection?.unverifiedMembershipPlayers??0)>0||(category==='QB'&&(collection?.unresolvedPassers??0)>0);
 const certified=data.independentNationalCertification===true&&c?.status==='verified';
 const fixed=historical||data.scope==='reviewed-espn-week'||(data.scope==='retained-espn-season'&&data.liveWeek===undefined);
 const live=!fixed&&!failed&&data.lines?.some(row=>row.playingNow===true);
 const limitation=cfbMetricLimitation(data,metric,metricLabel);
 const interceptionGap=category==='Def'&&metric!=='def_interceptions'&&data.confidence?.def_interceptions?.supportedPlayers===0;
 return <aside className={styles.coverage} aria-label="Statistics coverage">
  <div className={styles.coverageSummary}><strong className={styles.coverageBadge}>{incomplete?'Partial coverage':certified?'Verified scope':'Reported data'}</strong><span>{live?'In-progress statistics are provisional. ':''}{certified&&!incomplete?'Rankings cover the verified statistical scope.':'Rankings reflect reported statistics only and may not include every eligible player.'}</span></div>

  {!rankingAvailable&&<p className={styles.coverageImportant}>Numerical rankings are unavailable for this selection; displayed observations are not a complete leaderboard.</p>}
  {c?.supportedPlayers===0&&limitation&&<p className={styles.coverageImportant}>{limitation}</p>}

  {interceptionGap&&<p className={styles.coverageImportant}>Defensive interceptions are unavailable for this selection; absent observations are not zero.</p>}
  {snapshot&&<p className={styles.note}>{snapshot}</p>}
  <details className={styles.methodology}><summary>Coverage and methodology</summary>
  <p className={styles.coverageCounts}>{typeof c?.supportedPlayers==='number'&&typeof c.candidatePlayers==='number'?`${number(c.supportedPlayers)}/${number(c.candidatePlayers)} observed ${category==='Def'?'defenders':'players'} have reported ${metricLabel.toLowerCase()}.`:'Player coverage has not been verified.'}{typeof data.coveredGames==='number'?` ${number(data.coveredGames)} ${data.coveredGames===1?'game':'games'} observed.`:''}{collection?` Games: ${number(collection.observedGames)}/${number(collection.expectedGames)} started or overdue; FBS team observations: ${number(collection.observedTeamObservations)}/${number(collection.expectedTeamObservations)}.`:''}{category==='QB'?' Only position-verified quarterbacks are ranked.':''}</p>
  {collection&&(collection.validationWarnings>0||collection.ambiguousPlayers>0)&&<p className={styles.coverageImportant}>Some source observations failed validation; {number(collection.ambiguousPlayers)} conflicting player {collection.ambiguousPlayers===1?'identity is':'identities are'} withheld.</p>}
   {data.sourceAttribution&&<p>{data.sourceAttribution}</p>}
   {typeof c?.missingPlayers==='number'&&<p>{number(c.missingPlayers)} missing values{typeof c.notApplicablePlayers==='number'?`; ${number(c.notApplicablePlayers)} not applicable`:''} for {metricLabel.toLowerCase()}. Missing values are never treated as zero.</p>}
   {collection&&<p>Category data absent for {number(collection.missingCategoryTeamObservations)} team observations. {number(collection.unverifiedMembershipPlayers)} players have unverified FBS membership; {number(collection.unresolvedPassers)} passers have unverified positions; {number(collection.validationWarnings)} source validation warnings. {number(collection.ambiguousPlayers)} conflicting player identities withheld. Full-week FBS coverage is unverified.</p>}
   <ul>{data.coverage.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>
   {!data.sourceAttribution&&<p>{league} player observations only; full-period statistical coverage has not been independently verified.</p>}
  </details>
 </aside>;
}
