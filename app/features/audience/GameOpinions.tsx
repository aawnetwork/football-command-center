'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { percentage, type Sample } from '../../lib/audience-report';
import { countRatings, leadingTier, loadOpinionSeason, opinionMinimum, opinionTiers, sortOpinionRows, weeklyRows, weeklySnapshot, type OpinionGame, type OpinionRow, type OpinionSort, type ScheduleGame } from './game-opinions-model';

const title=(row:OpinionRow)=>row.game?`${row.game.awayTeam} @ ${row.game.homeTeam}`:row.opinion?.matchup??'Matchup unavailable';
const ukTime=(value?:string|null)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Kickoff unavailable';
function TeamLogo({src}:{src?:string|null}){const[broken,setBroken]=useState(false);return <span className="opinions-logo">{src&&!broken?<img src={src} alt="" width="25" height="25" onError={()=>setBroken(true)}/>:<span aria-hidden="true">—</span>}</span>;}
export function OpinionDistribution({sample,detail=false}:{sample?:Sample;detail?:boolean}){
  const n=sample?.count??0;
  return <div className="opinions-distribution"><div className="opinions-bar" role="img" aria-label={n?opinionTiers.map(t=>`${t}: ${sample?.tiers[t]??0} (${percentage(sample?.tiers[t]??0,n)})`).join(', '):'No ratings'}>
    {opinionTiers.map(t=><span key={t} className={`opinions-tier--${t}`} style={{width:`${n?100*(sample?.tiers[t]??0)/n:0}%`}}/>)}</div>
    {detail&&<><p>{n} rating{n===1?'':'s'} · {n<opinionMinimum?'Small sample':'25+ browser sample'}</p><dl className="opinions-counts">{opinionTiers.map(t=><div key={t}><dt>{t}</dt><dd>{sample?.tiers[t]??0} <small>{percentage(sample?.tiers[t]??0,n)}</small></dd></div>)}</dl></>}
  </div>;
}
export function OpinionSnapshot({rows}:{rows:OpinionRow[]}){
  const summary=weeklySnapshot(rows);
  return <><div className="opinions-snapshot">{([['Most S-tier votes',summary.s,'S votes'],['Most A-tier votes',summary.a,'A votes'],['Most-rated game',summary.rated,'ratings'],['Most divisive',summary.divisive,'tier spread']] as const).map(([label,item,unit])=><article key={label}><h3>{label}</h3>{item?<><strong>{title(item.row)}</strong><p>{unit==='tier spread'?item.value.toFixed(2):item.value} {unit}{unit!=='ratings'?` · ${countRatings(item.row)} ratings`:''}{item.ties>1?` · tied with ${item.ties-1} other game${item.ties>2?'s':''}`:''}</p></>:<p>No qualifying game yet</p>}</article>)}</div>
    <dl className="opinions-totals"><div><dt>Games rated</dt><dd>{summary.games} / {rows.length}</dd></div><div><dt>Total current ratings</dt><dd>{summary.total}</dd></div><div><dt>Participating browsers · range</dt><dd>{summary.browserMinimum===summary.browserMaximum?summary.browserMinimum:`${summary.browserMinimum}–${summary.browserMaximum}`}</dd></div></dl>
    <p className="opinions-note">Highlights require {opinionMinimum}+ current ratings per game. Divisiveness measures response spread (0–2 tiers), not game quality. Browser totals cannot be deduplicated across games using this report; the range is the largest game sample to the sum of samples.</p></>;
}
export function OpinionDetails({row}:{row:OpinionRow}){return <div className="opinions-detail"><h3>{title(row)}</h3><div className="opinions-phases">{(['current','pregame','live','postgame'] as const).map(phase=><div key={phase}><h4>{phase==='current'?'Current selections':phase==='pregame'?'Pregame':phase==='live'?'Live':'Postgame'}</h4><OpinionDistribution sample={row.opinion?.samples[phase]} detail/></div>)}</div><p>Each phase has its own sample; these are not necessarily the same respondents. Phase samples are not added to current ratings.</p><details><summary>Technical identity</summary><code>{row.id}</code></details></div>;}
export default function GameOpinions({initialLeague='NFL',initialSeason,seasons}:{initialLeague?:'NFL'|'CFB';initialSeason:number;seasons:number[]}){
  const[league,setLeague]=useState(initialLeague),[season,setSeason]=useState(initialSeason),[week,setWeek]=useState(''),[sort,setSort]=useState<OpinionSort>('kickoff');
  const[opinions,setOpinions]=useState<OpinionGame[]>([]),[schedule,setSchedule]=useState<ScheduleGame[]>([]),[resolvedWeek,setResolvedWeek]=useState<number|'postseason'|null>(null);
  const[reportLoading,setReportLoading]=useState(true),[scheduleLoading,setScheduleLoading]=useState(true),[reportError,setReportError]=useState(''),[scheduleError,setScheduleError]=useState('');
  const[refresh,setRefresh]=useState(0),[open,setOpen]=useState<string|null>(null);
  const cache=useRef(new Map<string,{at:number;games:ScheduleGame[];week:number|'postseason'}>());
  useEffect(()=>{
    const controller=new AbortController();setReportLoading(true);setReportError('');setOpinions([]);
    void loadOpinionSeason(league,season,async offset=>{
      const params=new URLSearchParams({league,season:String(season),view:'current',offset:String(offset)});
      const r=await fetch(`/api/admin/audience/report?${params}`,{cache:'no-store',signal:controller.signal});
      if(!r.ok)throw Error('Audience report unavailable. These are not zero results.');return r.json();
    }).then(rows=>{if(!controller.signal.aborted)setOpinions(rows);}).catch(e=>{if(!controller.signal.aborted)setReportError(e.message);}).finally(()=>{if(!controller.signal.aborted)setReportLoading(false);});
    return()=>controller.abort();
  },[league,season,refresh]);
  useEffect(()=>{
    const controller=new AbortController(),key=`${league}:${season}:${week}`;setScheduleLoading(true);setScheduleError('');setSchedule([]);setResolvedWeek(null);setOpen(null);
    async function load(){
      const saved=cache.current.get(key);
      if(saved&&Date.now()-saved.at<300_000){setSchedule(saved.games);setResolvedWeek(saved.week);setScheduleLoading(false);return;}
      const params=new URLSearchParams({season:String(season),seasontype:week==='postseason'?'3':'2'});if(week&&week!=='postseason')params.set('week',week);
      const response=await fetch(`${league==='NFL'?'/api/nfl/scoreboard':'/api/scoreboard'}?${params}`,{signal:controller.signal});
      if(!response.ok)throw Error('Schedule unavailable. Ratings are preserved; no weekly totals can be verified.');
      const data=await response.json(),selected=week==='postseason'?'postseason':week?Number(week):data.week;
      if(data.season!==season||!Array.isArray(data.games)||selected===null||selected===undefined)throw Error('Schedule season/week could not be verified.');
      if(controller.signal.aborted)return;
      if(cache.current.size>=8)cache.current.delete(cache.current.keys().next().value!);
      cache.current.set(key,{at:Date.now(),games:data.games,week:selected});setSchedule(data.games);setResolvedWeek(selected);
    }
    void load().catch(e=>{if(!controller.signal.aborted)setScheduleError(e.message);}).finally(()=>{if(!controller.signal.aborted)setScheduleLoading(false);});
    return()=>controller.abort();
  },[league,season,week,refresh]);
  const rows=useMemo(()=>resolvedWeek===null?[]:weeklyRows(schedule,opinions,league,season,resolvedWeek),[schedule,opinions,league,season,resolvedWeek]);
  const sorted=useMemo(()=>sortOpinionRows(rows,sort),[rows,sort]);
  const ids=new Set(rows.map(r=>r.id)),other=opinions.filter(g=>!ids.has(g.gameId));
  const loading=reportLoading||scheduleLoading,failed=reportError||scheduleError;
  const minWeek=league==='CFB'&&season===2026?0:1,maxWeek=league==='NFL'?18:16;
  return <section className="game-opinions" aria-labelledby="games"><h2 id="games">Game opinions</h2><p>Weekly audience snapshot · current selections, with phase detail for each game.</p>
    <div className="audience-filters"><label>League<select aria-label="Game opinions league" value={league} onChange={e=>{setLeague(e.target.value as 'NFL'|'CFB');setWeek('');}}><option>NFL</option><option>CFB</option></select></label>
      <label>Season<select aria-label="Game opinions season" value={season} onChange={e=>{setSeason(Number(e.target.value));setWeek('');}}>{[...new Set([...seasons,initialSeason,season])].sort((a,b)=>b-a).map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Week<select aria-label="Game opinions week" value={week} onChange={e=>setWeek(e.target.value)}><option value="">Current feed week{resolvedWeek!==null&&week===''?` (${resolvedWeek})`:''}</option>{Array.from({length:maxWeek-minWeek+1},(_,i)=>i+minWeek).map(w=><option key={w} value={w}>Week {w}</option>)}<option value="postseason">Postseason</option></select></label>
      <label>Sort by<select aria-label="Game opinions sort" value={sort} onChange={e=>setSort(e.target.value as OpinionSort)}><option value="kickoff">Kickoff</option><option value="rated">Most rated</option><option value="s">Most S-tier votes</option><option value="divisive">Most divisive (25+)</option></select></label>
      <button type="button" disabled={loading} onClick={()=>{cache.current.clear();setRefresh(n=>n+1);}}>Refresh opinions</button>
    </div>
    {loading?<p role="status">Loading weekly schedule and audience ratings…</p>:failed?<p role="alert">{failed} Use Refresh opinions to retry.</p>:<>
      <h3>{league} · {season} · {resolvedWeek==='postseason'?'Postseason':`Week ${resolvedWeek}`}</h3><OpinionSnapshot rows={rows}/>
      <div className="opinions-legend" aria-label="Tier colours">{opinionTiers.map(t=><span key={t}><i className={`opinions-tier--${t}`}/>{t}</span>)}</div>
      {!rows.length?<p>No verified games in this feed selection. No schedule or ratings have been invented.</p>:<div className="audience-table opinions-table" tabIndex={0} role="region" aria-label="Weekly game opinions"><table><thead><tr><th>Game · UK kickoff</th><th>Status</th><th>Ratings</th><th>S / A / B / C / D</th><th>Leading tier</th></tr></thead><tbody>{sorted.map(row=>{const sample=row.opinion?.samples.current,leader=leadingTier(sample),expanded=open===row.id;return <Fragment key={row.id}><tr><td><button className="opinions-matchup" aria-expanded={expanded} aria-controls={`detail-${row.id}`} onClick={()=>setOpen(expanded?null:row.id)}>
        <span><TeamLogo key={row.game?.awayLogo} src={row.game?.awayLogo}/>{row.game?.awayTeam}</span><span><TeamLogo key={row.game?.homeLogo} src={row.game?.homeLogo}/><small>@</small> {row.game?.homeTeam}</span></button><time dateTime={row.game?.context.kickoffAt??undefined}>{ukTime(row.game?.context.kickoffAt)} UK</time></td>
        <td><span className={`opinions-status opinions-status--${row.game?.context.status}`}>{row.game?.context.status??'Unverified'}</span></td><td>{countRatings(row)}{countRatings(row)>0&&countRatings(row)<opinionMinimum&&<small className="opinions-small">Small sample</small>}</td><td><OpinionDistribution sample={sample}/><span className="opinions-inline-counts">{opinionTiers.map(t=>sample?.tiers[t]??0).join(' / ')}</span></td><td>{leader?<strong>{leader} · {percentage(sample!.tiers[leader],sample!.count)}</strong>:countRatings(row)<opinionMinimum?'—': 'Tied'}</td></tr>
        {expanded&&<tr id={`detail-${row.id}`}><td colSpan={5}><OpinionDetails row={row}/></td></tr>}</Fragment>;})}</tbody></table></div>}
      {schedule.length>rows.length&&<p className="opinions-note">{schedule.length-rows.length} feed entries excluded because season/week identity could not be verified.</p>}
      {other.length>0&&<details><summary>Other season ratings / week not matched ({other.length} games)</summary><p>These may belong to another week or be missing from the schedule. They are retained below but excluded from this week’s totals.</p>{other.map(opinion=><details key={opinion.gameId}><summary>{opinion.matchup??'Matchup unavailable'} · {opinion.samples.current?.count??0} ratings · <small>{opinion.gameId}</small></summary><OpinionDetails row={{id:opinion.gameId,opinion}}/></details>)}</details>}
      <p className="opinions-note">No automatic polling. Counts reflect the last report load; schedule metadata is reused for up to five minutes. Refresh opinions checks both again.</p>
    </>}
  </section>;
}
