'use client';
import { useEffect, useMemo, useState } from 'react';
import { TeamLogo } from '../../components/TeamLogo';
import shared from '../../preview/nfl-stats/stats-preview.module.css';
import styles from './team-stats.module.css';
import { conferences, rankTeamRows, teamColumns, defaultTeamColumn, teamRefreshLabel, type Group, type League, type Mode, type TeamData, type Column } from './team-stats-model';
import { loadTeamStats, startTeamChecks } from './team-stats-load';
const format=(value:number|null,decimals=3)=>value===null||!Number.isFinite(value)?'—':value.toLocaleString('en-GB',{maximumFractionDigits:decimals});
export default function TeamStats({league}:{league:League}){
 const [mode,setMode]=useState<Mode>('weekly'),[week,setWeek]=useState(''),[group,setGroup]=useState<Group>('Offense');
 const [metric,setMetric]=useState('total-offense'),[ascending,setAscending]=useState(false),[conference,setConference]=useState(''),[search,setSearch]=useState('');
 const [data,setData]=useState<TeamData|null>(null),[checked,setChecked]=useState<number|null>(null),[checking,setChecking]=useState(false),[failed,setFailed]=useState(false),[count,setCount]=useState(25);
 const columns=useMemo(()=>teamColumns(league,mode,group,data?.passingBasis),[league,mode,group,data?.passingBasis]);
 const sourceGroup=league==='CFB'&&mode==='season'?group:'Offense';
 useEffect(()=>{
  const controller=new AbortController();
  const stop=startTeamChecks({load:()=>loadTeamStats(league,mode,week,sourceGroup,fetch,controller.signal),clear:()=>{setData(null);setChecked(null);setFailed(false);},checking:setChecking,success:(value,time)=>{setData(value);setChecked(time);setFailed(false);},failure:()=>setFailed(true)});
  return ()=>{stop();controller.abort();};
 },[league,mode,week,sourceGroup]);
 const ranked=rankTeamRows(data?.rows??[],metric,ascending,conference,search);
 const selected=columns.find(c=>c.id===metric)??columns[0];
 const groups=(['Offense','Defense','Other'] as Group[]).filter(g=>teamColumns(league,mode,g).length);
 function changeGroup(value:Group){setGroup(value);const column=defaultTeamColumn(league,mode,value);setMetric(column.id);setAscending(Boolean(column.lower));setCount(25);}
 function changeMode(value:Mode){setMode(value);const next=teamColumns(league,value,group);if(!next.length){setGroup('Offense');setMetric('total-offense');setAscending(false);}else{const column=league==='NFL'&&value==='season'&&group==='Defense'?defaultTeamColumn(league,value,group):next.find(c=>c.id===metric)??next[0];setMetric(column.id);setAscending(Boolean(column.lower));}setCount(25);}
 const available=data?.availableWeeks.length?data.availableWeeks:Array.from({length:league==='NFL'?18:16},(_,i)=>i+1);
 const weeks=[...new Set([...available,...(week?[Number(week)]:[])])].filter(value=>Number.isInteger(value)&&value>=1&&value<=(league==='NFL'?18:16)).sort((a,b)=>a-b);
 const status=[checking?'Checking…':failed?'Check failed':null,checked===null?null:`Last checked ${new Date(checked).toLocaleTimeString('en-GB')}`].filter(Boolean).join(' · ')||'Loading…';
 const cutoff=data?.cutoffs[metric]??[];
 const pending=ranked.population.filter(row=>row.pending).length;
 const missing=ranked.population.filter(row=>!row.pending&&!Number.isFinite(row.values[metric])).length;
 const through=cutoff.map(value=>value.match(/Through games .+$/i)?.[0]??'Source cutoff unavailable.');
 return <section className={shared.studio} data-league={league} aria-label={`${league} team statistics`}>
  <div className={shared.sectionTitle}><h2>Stats</h2><span className={shared.status} role="status">{status}</span></div>
  <div className={shared.tabs} aria-label="Team statistical category">{groups.map(value=><button key={value} aria-pressed={group===value} onClick={()=>changeGroup(value)}>{value}</button>)}</div>
  <div className={shared.controls}>
   <label>Period<select value={mode} onChange={event=>changeMode(event.target.value as Mode)}><option value="weekly">Week</option><option value="season">Season</option></select></label>
   {mode==='weekly'&&<label>Week<select value={week} onChange={event=>{setWeek(event.target.value);setCount(25);}}><option value="">Current Week</option>{weeks.map(value=><option key={value} value={value}>Week {value}</option>)}</select></label>}
   {league==='CFB'&&<label>Conference<select value={conference} onChange={event=>{setConference(event.target.value);setCount(25);}}><option value="">All conferences</option>{conferences.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
   <label className={shared.search}>Find a team<input value={search} placeholder="Team name" onChange={event=>{setSearch(event.target.value);setCount(25);}} /></label>
  </div>
  <div className={shared.context}><strong>{mode==='season'?`2026 regular season${data?.throughWeek?` · Through Week ${data.throughWeek}`:''}`:week?`Week ${week}`:`Current Week${data?.week?` · Week ${data.week}`:''}`} <span>/ {league} Teams</span></strong><span>{teamRefreshLabel(mode,week,data,metric)}</span></div>
  {failed&&<p className={shared.warning} role="alert">Team statistics could not be checked. {data?'Displayed figures are from the last successful check for this selection.':'No previous-period figures are displayed.'}</p>}
  {data&&<p className={shared.note}>{ranked.supported?`${ranked.supported} teams ranked by ${selected.label.toLowerCase()} (${selected.unit}).`:`No ${selected.label.toLowerCase()} figures available.`} {pending>0?`${pending} teams have not played yet. `:''}{missing>0&&ranked.supported>0?`${missing} teams have no reported value.`:''}</p>}
  {data&&<p className={shared.note}>{data.coverage[metric]}</p>}
  {mode==='season'&&league==='CFB'&&<p className={shared.note} title={cutoff.join(' · ')}>{through.length?through.join(' · '):'NCAA through-games date unavailable; rankings withheld.'}</p>}
  {data?.warnings.map(warning=><p key={warning} className={shared.warning}>{warning}</p>)}
  <TeamStatsTable data={data} ranked={ranked} columns={columns} metric={metric} ascending={ascending} count={count} sort={column=>{setMetric(column.id);setAscending(metric===column.id?!ascending:Boolean(column.lower));}} teamLogo={()=>undefined} emptyMessage={!data?failed?'Team statistics are unavailable for this selection.':'Loading team statistics…':!data.rows.length?`Team statistics are not available for this selection. ${selected.explanation}`:!ranked.population.length||!ranked.rows.length?'No teams match this selection.':`No ${selected.label.toLowerCase()} figures are available for this selection. ${metric==='turnover-margin'&&league==='NFL'?'Complete team turnover figures have not been verified.':league==='CFB'&&mode==='season'?'The NCAA table needs valid values and a confirmed 2026 through-games date.':selected.explanation} Choose another heading or period.`} />
  {data&&ranked.supported>0&&count<ranked.rows.length&&<button className={shared.more} onClick={()=>setCount(count+25)}>Show 25 more teams</button>}
  <div className={shared.notes}><span>— Not reported</span><span>Select a column to sort.</span></div>
 </section>;
}

export function TeamStatsTable({data,ranked,columns,metric,ascending,count,sort,teamLogo,emptyMessage}:{data:TeamData|null;ranked:ReturnType<typeof rankTeamRows>;columns:Column[];metric:string;ascending:boolean;count:number;sort:(column:Column)=>void;teamLogo:(id:string)=>string|null|undefined;emptyMessage:string}){
 const showGames=Boolean(data?.rows.some(row=>row.gamesPlayed!==undefined));
 return (
  <div className={`${shared.tableWrap} ${styles.table}`} tabIndex={0} aria-label="Scrollable team statistics"><table>
   <thead><tr><th scope="col">#</th><th scope="col" className={`${shared.player} ${styles.team}`}>TEAM</th>{showGames&&<th scope="col" title="Games included in these season totals">G</th>}{columns.map(c=><th key={c.id} scope="col" aria-sort={metric===c.id?ascending?'ascending':'descending':'none'}><button title={[c.explanation,...(data?.cutoffs[c.id]??[])].join(' ')} onClick={()=>sort(c)}>{c.label}{metric===c.id?ascending?' ↑':' ↓':''}{/PPG|YPG|net|gross/.test(c.unit)&&<span className={styles.unit}>{c.unit}</span>}</button></th>)}</tr></thead>
   <tbody>{data&&ranked.supported>0&&ranked.rows.slice(0,count).map(row=><tr key={row.id}><td>{row.rank??'—'}</td><th scope="row" className={`${shared.player} ${styles.team}`}><div className={styles.identity}>{(row.logo||teamLogo(row.id))&&<span className={shared.teamLogo}><TeamLogo src={row.logo||teamLogo(row.id)||undefined} /></span>}<strong>{row.name}</strong></div></th>{showGames&&<td>{row.gamesPlayed??'—'}</td>}{columns.map(c=><td key={c.id} className={metric===c.id?shared.selected:undefined}>{format(row.values[c.id]??null,c.decimals)}</td>)}</tr>)}
   {(!data||ranked.supported===0||!ranked.rows.length)&&<tr><td colSpan={columns.length+2+(showGames?1:0)} className={styles.empty} role="status">{emptyMessage}</td></tr>}
   </tbody></table></div>
 );
}
