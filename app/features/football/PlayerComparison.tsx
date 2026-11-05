'use client';
import { useState, Fragment } from 'react';
import type { ComparisonMetric } from '../../lib/player-comparison';
import styles from './football.module.css';
import { useFootballData } from './useFootballData';
type League='NFL'|'CFB';
type Team={id:string;name:string};
type Player={id:string;name:string;position:string;headshot:string|null;team:string;jersey?:string};
type Result=Player&{metrics:ComparisonMetric[];gamesPlayed:number;message:string|null;opponents:string[];lastGameAt:string|null;error?:string};
function PlayerPicker({index,league,season,teams,player,onChange}:{index:number;league:League;season:number;teams:Team[];player:Player|null;onChange:(p:Player|null)=>void}) {
  const [team,setTeam]=useState(''),[query,setQuery]=useState('');
  const {data,error,loading}=useFootballData<{players:Player[]}>(team?`/api/football/players?league=${league}&season=${season}&team=${team}`:null);
  const players=data?.players??[];
  const visible=players.filter(p=>`${p.name} ${p.position}`.toLowerCase().includes(query.toLowerCase()));
  return <div className={styles.picker}>
    <strong>Player {index+1}</strong>
    <label>Team<select value={team} onChange={e=>{setTeam(e.target.value);setQuery('');onChange(null);}}><option value="">Choose a team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>Find a player<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name or position" disabled={!team}/></label>
    <label>Player<select value={player?.id??''} disabled={!team||loading} onChange={e=>onChange(players.find(p=>p.id===e.target.value)??null)}><option value="">{loading?'Loading roster…':'Choose a player'}</option>{visible.map(p=><option key={p.id} value={p.id}>{p.name} · {p.position}{p.jersey?` · #${p.jersey}`:''}</option>)}</select></label>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {team&&!loading&&!error&&visible.length===0&&<p className={styles.muted}>No roster players match this search.</p>}
    {player&&<div className={styles.person}><Headshot key={player.id} player={player}/><div><strong>{player.name}</strong><div className={styles.muted}>{player.position} · {player.team}</div></div></div>}
  </div>;
}
function Headshot({player}:{player:Player}) {const[failed,setFailed]=useState(false);return player.headshot&&!failed?<img className={styles.portrait} src={player.headshot} alt={player.name} onError={()=>setFailed(true)}/>:<span className={styles.fallback} aria-label="Headshot unavailable">{player.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span>;}
export function PlayerComparison({league}:{league:League}) {
  return <Comparison league={league}/>;
}
function Comparison({league}:{league:League}) {
  const {data:directory,error:directoryError}=useFootballData<{season:number;teams:Team[]}>(`/api/football/players?league=${league}`);
  const season=directory?.season??null,teams=directory?.teams??[];
  const[players,setPlayers]=useState<[Player|null,Player|null]>([null,null]),[mode,setMode]=useState('season'),[phase,setPhase]=useState('2'),[week,setWeek]=useState('1');
  const ids=players.map(p=>p?.id??'').join(',');
  const same=!!players[0]&&players[0].id===players[1]?.id;
  const url=season&&players[0]&&players[1]&&!same?`/api/football/comparison?league=${league}&season=${season}&players=${ids}&phase=${phase}${mode==='weekly'?`&week=${week}`:''}`:null;
  const {data:comparison,error:requestError,loading}=useFootballData<{players:Result[]}>(url,60000);
  const results=comparison?.players??[],error=same?'Choose two different players.':requestError;
  const metrics=[...new Map(results.flatMap(r=>r.metrics??[]).map(m=>[m.key,m])).values()];
  const categories=[...new Set(metrics.map(m=>m.category))];
  return <section className={styles.panel} aria-label={`${league} player comparison`}>
    <div className={styles.header}><div><h2>Player comparison</h2><p className={styles.muted}>{league==='CFB'?'College Football':league} · {season??'Current season'} · ESPN player statistics</p></div><span className={styles.badge}>Head to head</span></div>
    {directoryError&&<p role="alert" className={styles.error}>{directoryError}</p>}
    {season&&<div className={styles.pickers}>{[0,1].map(i=><PlayerPicker key={`${league}:${season}:${i}`} index={i} league={league} season={season} teams={teams} player={players[i]} onChange={p=>setPlayers(old=>i===0?[p,old[1]]:[old[0],p])}/>)}</div>}
    <div className={styles.controls}><button aria-pressed={mode==='weekly'} onClick={()=>setMode('weekly')}>Week</button><button aria-pressed={mode==='season'} onClick={()=>setMode('season')}>Season</button><label>Phase<select value={phase} onChange={e=>{setPhase(e.target.value);setWeek('1');}}><option value="2">Regular season</option><option value="3">Postseason</option></select></label>{mode==='weekly'&&<label>{phase==='3'?'Postseason feed week':'Week'}<select value={week} onChange={e=>setWeek(e.target.value)}>{Array.from({length:phase==='3'?league==='NFL'?5:1:league==='NFL'?18:16},(_,i)=>i+1).map(w=><option key={w} value={w}>{w}</option>)}</select></label>}</div>
    {phase==='3'&&league==='CFB'&&<p className={styles.muted}>ESPN groups college postseason player games into one postseason feed week. Season shows the complete reported postseason total.</p>}
    <div aria-live="polite">{loading&&<p className={styles.muted}>Loading comparison…</p>}{error&&<p className={styles.error}>{error}</p>}{results.map((r,i)=>(r.error||r.message)&&<p key={r.id} className={styles.notice}>{players[i]?.name}: {r.error??r.message}</p>)}</div>
    {results.length===2&&!loading&&<><div className={styles.scroll}><table className={styles.table}><caption className={styles.muted}>{season} · {phase==='2'?'Regular season':'Postseason'} · {mode==='weekly'?`Week ${week}`:'Season to date'}</caption><thead><tr><th scope="col">Statistic</th>{players.map((p,i)=><th scope="col" key={i}>{p?.name}</th>)}</tr></thead><tbody><tr><th scope="row">Games with reported player stats</th>{results.map(r=><td key={r.id}>{r.error?'—':r.gamesPlayed}</td>)}</tr>{categories.map(category=><Fragment key={category}><tr className={styles.category}><th colSpan={3}>{category}</th></tr>{metrics.filter(m=>m.category===category).map(m=><tr key={m.key}><th scope="row">{m.label}</th>{results.map(r=><td key={r.id}>{r.metrics?.find(v=>v.key===m.key)?.value??'—'}</td>)}</tr>)}</Fragment>)}</tbody></table></div><p className={styles.muted}>— means unavailable, not zero. Season totals are ESPN’s reported totals at this check; the players may have played different numbers of games. Updates every minute.</p></>}
    {!players[0]||!players[1]?<p className={styles.empty}>Select two players to compare their statistics.</p>:null}
  </section>;
}
