'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { detailTabs, detailTabKey, groupedGamePlayers, scoringPeriodLabel, additionalGameContext, comparisonGap } from '../../lib/game-detail-tabs';
import type { GameContext } from '../../lib/game-context';
import { acceptGameDetail, detailInterval, type GameDetails as Detail, type DetailStage } from '../../lib/game-details';
import type { Preview } from '../../lib/game-details-preview';
import styles from './game-details.module.css';
type Payload=Detail&{preview:Preview|null};
const pending=new Map<string,Promise<Payload>>();
function requestDetail(url:string){
 const active=pending.get(url);if(active)return active;
 if(pending.size>=32)return Promise.reject(Error('Game details busy'));
 const operation=fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(async response=>{if(!response.ok)throw Error('Details unavailable');return await response.json() as Payload;}).finally(()=>pending.delete(url));pending.set(url,operation);return operation;
}
export function GameDetailsPanel({data,context,tab}:{data:Payload;context:string|null;tab:number}){
 const fmt=(n:number|null)=>n===null?'—':n.toLocaleString('en-GB',{maximumFractionDigits:1});
 const team=(id:string)=>data.teams.find(t=>t.id===id)?.name??'Team';
 const extraContext=additionalGameContext(context,data.context);
 const preview=data.stage==='scheduled',stats=preview?data.preview?.comparison??[]:data.stats;
 const useful=preview?stats:stats.filter(s=>s.home!==null||s.away!==null);
 if(tab===0)return <>
  {extraContext.length>0&&<p className={styles.context}>{extraContext.join(' · ')}</p>}
  {useful.length>0?<div className={styles.scroll}><table><caption>{preview?'Season matchup comparison':data.stage==='final'?'Final team comparison':'Live team comparison'}</caption><thead><tr><th scope="col">Statistic</th><th scope="col">{data.teams[0].name}</th><th scope="col">{data.teams[1].name}</th></tr></thead><tbody>{useful.map(s=><tr key={'key' in s?s.key:s.label}><th scope="row">{s.label}</th><td>{fmt(s.away)}{preview&&'awayCutoff'in s&&s.awayCutoff&&<small>{s.awayCutoff}</small>}</td><td>{fmt(s.home)}{preview&&'homeCutoff'in s&&s.homeCutoff&&<small>{s.homeCutoff}</small>}</td></tr>)}</tbody></table></div>:<p>{preview?'Season comparison unavailable for this matchup and cutoff.':'Team boxscore statistics have not been reported.'}</p>}
 </>;
 if(tab===1)return preview?<>
  {data.preview?.watch&&<p className={styles.muted}>{data.preview.watch.cutoff} · Supported reported totals</p>}
  {data.preview?.players.length?<div className={styles.teamPlayers}>{data.teams.map(t=><section key={t.id} aria-label={`${t.name} players`}><h4>{t.name}</h4><ul className={styles.players}>{data.preview!.players.filter(p=>p.team===t.id).map(p=><li key={p.id}><strong>{p.name}</strong>{p.stat&&<><b>{fmt(p.stat.value)} {p.stat.label.toLowerCase()}</b><span>{p.reason}</span>{p.stat.conferenceRank!==null&&<span>{p.reason.includes('FBS')||p.reason.includes('NFL')?`Conference: No. ${p.stat.conferenceRank} of ${p.stat.conferencePopulation} reported ${p.stat.conferenceName} totals`:`FBS: No. ${p.stat.rank} of ${p.stat.population} reported totals`}</span>}</>}{p.connection&&<div className={styles.connection}><b>{p.connection.kind} Connection</b><span>{({birthplace:'Listed birthplace',hometown:'Listed hometown',nationality:'Verified nationality',pathway:'Development pathway'} as Record<string,string>)[p.connection.factType]??'Verified connection'}: {p.connection.fact}</span><a href={p.connection.sourceUrl} target="_blank" rel="noreferrer">{p.connection.source}</a><span>Roster checked {new Date(p.connection.rosterObservedAt).toLocaleDateString('en-GB')} · participation unconfirmed</span></div>}</li>)}{!data.preview!.players.some(p=>p.team===t.id)&&<li>No supported player context for this team.</li>}</ul></section>)}</div>:<p>No sufficiently supported season-based player context for this matchup.</p>}
  {data.preview?.watch?.comparisons.map(c=>{const left=data.preview!.players.find(p=>p.id===c.left)!,right=data.preview!.players.find(p=>p.id===c.right)!;return <p className={styles.context} key={c.metric}>{left.name} and {right.name}: {comparisonGap(c.gap,c.unit)} separate their {c.label.toLowerCase().replace(/ yards$/,'')} totals ({c.scope}); ranked No. {left.stat!.conferenceName&&c.scope.startsWith(left.stat!.conferenceName)?left.stat!.conferenceRank:left.stat!.rank} and No. {right.stat!.conferenceName&&c.scope.startsWith(right.stat!.conferenceName)?right.stat!.conferenceRank:right.stat!.rank}, respectively. Positions may change as other players add to their totals.</p>;})}
  {data.preview?.watch&&<p className={styles.muted}>{data.preview.watch.qualification}</p>}
 </>:<>
  {data.players.length?<div className={styles.teamPlayers}>{groupedGamePlayers(data.teams,data.players).map(t=><section key={t.id} aria-label={`${t.name} players`}><h4>{t.name}</h4><ul className={styles.players}>{t.players.map(p=><li key={p.id}><strong>{p.name}</strong>{p.achievements.map(a=><span key={a.category+":"+a.line}>{a.category.charAt(0).toUpperCase()+a.category.slice(1)} · {a.line}</span>)}</li>)}{!t.players.length&&<li>Player statistics are not available for this team.</li>}</ul></section>)}</div>:<p>Individual player statistics are not available yet.</p>}
 </>;
 return preview?<>
  {data.preview?.form.map(f=><div key={f.team}><h4>{team(f.team)} <span className={styles.muted}>· {f.games.length}/5 retained results</span></h4>{f.games.length?<ul className={styles.form}>{f.games.map(g=><li key={g.id}><span>W{g.week} · {new Date(g.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})} · {g.opponent}</span><strong>{g.result}</strong></li>)}</ul>:<p>No earlier verified results retained.</p>}</div>)}
  <p className={styles.muted}>Actual completed games only. Fewer than five means retained coverage is limited; it does not imply the team played fewer games.</p>
 </>:<>
  {extraContext.length>0&&<p className={styles.context}>{extraContext.join(' · ')}</p>}
  {data.scoring.length?<ol className={styles.scoring}>{data.scoring.map(s=><li key={s.id}><span>{scoringPeriodLabel(s.period,s.clock,data.identity.league)} · {s.away}–{s.home}</span>{s.text}</li>)}</ol>:<p>Scoring plays are unavailable from this observation.</p>}{data.leadChanges!==null&&<p>{data.leadChanges} lead {data.leadChanges===1?'change':'changes'} in the reported scoring progression.</p>}
 </>;
}
export function GameDetailsContent({data,context}:{data:Payload;context:string|null}){
 const [tab,setTab]=useState(0),id=useId();
 const labels=detailTabs(data.stage);
 function keyboard(event:React.KeyboardEvent<HTMLButtonElement>,index:number){
  const next=detailTabKey(event.key,index);if(next===null)return;event.preventDefault();setTab(next);
  (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus();
 }
 return <>
  <h3 aria-live="polite">{data.stage==='scheduled'?'The Preview':data.stage==='live'?'Game Pulse':'The Breakdown'}</h3>
  <div className={styles.tabs} role="tablist" aria-label="Game detail sections">{labels.map((label,index)=><button key={index} id={`${id}-tab-${index}`} type="button" role="tab" aria-selected={tab===index} aria-controls={`${id}-panel`} tabIndex={tab===index?0:-1} onClick={()=>setTab(index)} onKeyDown={event=>keyboard(event,index)}>{label}</button>)}</div>
  <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0}><GameDetailsPanel data={data} context={context} tab={tab}/></div>
  <p className={styles.muted}>ESPN · Checked {new Date(data.observedAt).toLocaleTimeString('en-GB')} · {data.stage==='live'?'Provisional · checks every 30 seconds while open':data.stage==='final'?'Final · correction checks every five minutes while open':'Checks every five minutes while open; status changes trigger a check'}. A dash means unavailable.</p>
 </>;
}
export function GameDetails({context,status,matchupContext}:{context:GameContext|undefined;status:DetailStage;matchupContext?:string|null}){
 const latest=useRef<{url:string;value:Payload}|null>(null);
 const [open,setOpen]=useState(false),[data,setData]=useState<Payload|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);const id=useId();
 const url=context?.eventId&&context.homeTeamId&&context.awayTeamId&&context.season?'/api/game-details?'+new URLSearchParams({league:context.league,event:context.eventId,season:String(context.season),home:context.homeTeamId,away:context.awayTeamId,status}):null;
 const visible=data&&data.identity.league===context?.league&&data.identity.event===context?.eventId&&data.identity.season===context?.season&&data.identity.home===context?.homeTeamId&&data.identity.away===context?.awayTeamId?data:null;
 useEffect(()=>{
  if(!open||!url)return;let stopped=false,timer:ReturnType<typeof setTimeout>;let stage=status;
  async function refresh(){
   if(document.visibilityState==='hidden'){timer=setTimeout(refresh,detailInterval(stage));return;}
   try{
    const next=await requestDetail(url!);if(stopped)return;
    const previous=latest.current?.url===url?latest.current.value:null;
    const value=acceptGameDetail(previous,next,status);
    latest.current={url:url!,value};setData(value);stage=value.stage;setError(false);
   }catch{if(!stopped)setError(true);}
   if(!stopped)timer=setTimeout(refresh,detailInterval(stage));
  }
  void refresh();return()=>{stopped=true;clearTimeout(timer);};
 },[open,url,status,attempt]);
 return <div className={styles.root} data-export-omit>
  <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>Game Details <span aria-hidden="true">{open?'−':'+'}</span></button>
  {open&&<section id={id} aria-label="Game details" className={styles.content}>
   {!url?<p>Verified game identity unavailable.</p>:<>{!visible&&!error&&<p role="status">Loading game details…</p>}{error&&<p role="status">Details could not be updated.{visible?' Showing the last successful observation.':''} <button type="button" onClick={()=>setAttempt(v=>v+1)}>Try again</button></p>}{visible&&<GameDetailsContent key={`${visible.identity.league}:${visible.identity.season}:${visible.identity.event}:${visible.stage}`} data={visible} context={matchupContext??null}/>}</>}
  </section>}
 </div>;
}
