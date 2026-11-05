'use client';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { BracketTeam } from '../../lib/postseason-model';
import type { PostGame } from '../../lib/postseason-service';
import { cfpBracket, nflBracket, superBowl, bracketWinner, type BracketSlot, type BracketPath } from '../../lib/playoff-bracket';
import { postseasonTime } from '../../lib/season-game-selection';
import styles from './football.module.css';
import { useFootballData } from './useFootballData';
type League='NFL'|'CFB';
type Conference={name:string;teams:BracketTeam[];contenders?:BracketTeam[]};
type Bracket={season:number;state:'confirmed'|'projected'|'unavailable';conferences:Conference[];games:PostGame[];assumptions:string[];issues:string[];checkedAt:string;rankingDate?:string;championOptions?:{id:string;name:string;selected:string;confirmed?:boolean;teams:{id:string;name:string}[]}[]};
function Match({slot,league,season}:{slot:BracketSlot;league:League;season:number}) {
  const game=slot.game,winner=bracketWinner(slot);
  return <div className={`${styles.slot} ${game?.live?styles.liveSlot:''}`}>
    {slot.teams.map((team,i)=>typeof team==='string'?<div className={styles.team} key={`${i}:${team}`}><span className={styles.muted}>{team}</span></div>:<div key={team.id} className={`${styles.team} ${winner?.id===team.id?styles.winner:''} ${game?.completed&&winner&&winner.id!==team.id?styles.eliminated:''}`}>
      <span className={styles.seed}>{team.seed>0?`#${team.seed}`:''}</span>
      {team.logo&&<img src={team.logo} alt="" width={28} height={28} loading="lazy"/>}
      <span>{team.name}</span>
      {game&&(game.completed||game.live)&&<strong>{game.teams.find(t=>t.id===team.id)?.score??'—'}{winner?.id===team.id?<span aria-label="Winner"> ✓</span>:null}</strong>}
    </div>)}
    <div className={styles.muted}>{game?<><span className={styles.badge}>{game.completed?'Final':game.live?'Live':'Scheduled'}</span><div>{game.label}</div>{!game.completed&&!game.live&&<div>{postseasonTime(game.date,game.timeTbd)}</div>}</>:slot.label}</div>
    {game&&<Link className={styles.matchLink} href={`/${league==='NFL'?'nfl':'cfb'}?section=games&gamePhase=playoffs&postSeason=${season}&postRound=${game.round}#postseason-game-${game.id}`}>View gamecard →</Link>}
  </div>;
}
function Path({path,league,season,name}:{path:BracketPath;league:League;season:number;name:string}) {
  return <section aria-label={`${name} bracket`} className={styles.bracketSection}><h3>{name}</h3><div className={styles.scroll} tabIndex={0} aria-label={`Scroll horizontally through ${name} playoff rounds`}><div className={styles.bracketGrid} style={{gridTemplateColumns:`repeat(${path.columns.length},minmax(245px,1fr))`}}>
    {path.columns.map(column=><div key={column.key} className={styles.bracketColumn}><h4>{column.name}</h4>{column.slots.map((slot,i)=><div className={styles.bracketCell} key={slot.key} style={{gridRow:`${2+i*(12/column.slots.length)} / span ${12/column.slots.length}`}}><Match slot={slot} league={league} season={season}/></div>)}</div>)}
  </div></div>{league==='CFB'&&path.champion&&<div className={styles.champion}><span aria-hidden="true">🏆</span><div><span className={styles.muted}>National champion</span><strong>{path.champion.name}</strong></div></div>}</section>;
}
function Qualification({data,league}:{data:Bracket;league:League}) {
  return <details><summary className={styles.button}>{league==='CFB'?'Why each team qualifies':'Playoff field and qualification'}</summary><div className={styles.scroll}><table className={styles.table}><thead><tr><th scope="col">Seed</th><th scope="col">Team</th><th scope="col">{league==='CFB'?'CFP rank':'Record'}</th><th scope="col">Qualification</th></tr></thead><tbody>{data.conferences.flatMap(c=>c.teams.map(t=><tr key={`${c.name}:${t.id}`}><td>{t.seed||t.possibleSeeds?.join(' / ')||'TBA'}</td><th scope="row">{t.name}{league==='NFL'?` · ${c.name}`:''}</th><td>{league==='CFB'?t.rank??(data.state==='confirmed'?'—':'Outside top 25'):t.record??'—'}</td><td>{league==='CFB'?t.reason??'Confirmed CFP selection':`${t.seed<=4?(data.state==='confirmed'?'Division winner':'Division leader'):'Wild card'}${t.seed===1?' · First-round bye':''}`}</td></tr>))}</tbody></table></div>
    {league==='NFL'&&data.state==='projected'&&data.conferences.some(c=>c.contenders?.length)&&<div className={styles.contenders}>{data.conferences.map(c=><div key={c.name}><strong>{c.name} next in line</strong><p className={styles.muted}>{c.contenders?.map(t=>`${t.seed}. ${t.name} (${t.record??'—'})`).join(' · ')||'No additional seeds supplied.'}</p></div>)}</div>}
  </details>;
}
export function PlayoffBracket({league,season=null}:{league:League;season?:number|null}) {
  const params=useSearchParams();
  const overrides=league==='CFB'?params.getAll('cfpChampion').filter(value=>/^(1|4|5|8):[1-9]\d*$/.test(value)):[];
  const champions=Object.fromEntries(overrides.map(value=>value.split(':')));
  const query=overrides.slice().sort().map(value=>`&champion=${encodeURIComponent(value)}`).join('');
  const url=`/api/football/bracket?league=${league}${season?`&season=${season}`:''}${query}`;
  const {data:current,previousData,previousUrl,error,loading}=useFootballData<Bracket>(url,60000);
  const priorParams=previousUrl?new URL(previousUrl,'http://local').searchParams:null;
  const samePeriod=priorParams?.get('league')===league&&(priorParams?.get('season')??'')===(season?String(season):'');
  const data=current??(samePeriod?previousData:null);
  const changeChampion=(conference:string|null,team?:string)=>{
    const next=new URL(window.location.href);const values=next.searchParams.getAll('cfpChampion').filter(v=>conference!==null&&!v.startsWith(`${conference}:`));
    next.searchParams.delete('cfpChampion');for(const value of values)next.searchParams.append('cfpChampion',value);
    if(conference&&team)next.searchParams.append('cfpChampion',`${conference}:${team}`);
    window.history.pushState(null,'',`${next.pathname}${next.search}${next.hash}`);
  };
  const title=data?.state==='confirmed'?'Confirmed field and published matchups':data?.state==='unavailable'?'Awaiting confirmed selections':overrides.length?'Your conference-winner scenario':'If the season ended today';
  const nflFinal=data&&league==='NFL'?superBowl(data.conferences,data.games):null;
  const winner=nflFinal?bracketWinner(nflFinal):null;
  return <section className={styles.panel} aria-label={`${league} playoff bracket`} aria-busy={loading}>
    <header className={styles.header}><div><h2>{league==='CFB'?'CFP':'NFL'} Playoff Bracket</h2><p className={styles.muted}>{data?.season??season??'Current season'} · {title}</p></div>{data&&<span className={styles.badge}>{loading?'Updating…':data.state==='confirmed'?'Confirmed':data.state==='projected'?overrides.length?'Custom projection':'As it stands':'Awaiting selection'}</span>}</header>
    <div aria-live="polite">{loading&&<p className={styles.muted}>{data?'Updating the projection…':'Loading bracket…'}</p>}{error&&<p role="alert" className={styles.notice}>{error} {data?'The previous bracket is shown below. ':''}We’ll retry automatically.</p>}</div>
    {data&&<>
      {process.env.NODE_ENV==='development'&&data.state!=='unavailable'&&<p><Link className={styles.button} href={`/admin/exports?output=bracket&league=${league.toLowerCase()}&bracketSeason=${data.season}${overrides.map(v=>`&cfpChampion=${encodeURIComponent(v)}`).join('')}`}>Export bracket snapshot →</Link></p>}
      <div className={styles.assumptions}>{data.assumptions.map(a=><p key={a}>{a}</p>)}</div>
      {data.rankingDate&&<p className={styles.muted}>CFP rankings published {new Date(data.rankingDate).toLocaleDateString('en-GB')}</p>}
      {!!data.championOptions?.length&&<details className={styles.championControls}><summary className={styles.button}>Conference champion assumptions</summary><div className={styles.controls}>{data.championOptions.map(c=><label key={c.id}>{c.name}{c.confirmed?' · Confirmed champion':''}<select disabled={c.confirmed} value={c.confirmed?c.selected:champions[c.id]??c.selected} onChange={e=>changeChampion(c.id,e.target.value)}>{c.teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>)}<button type="button" onClick={()=>changeChampion(null)}>Use current leaders</button></div><p className={styles.muted}>Changing a winner recalculates automatic places, at-large places, seeds and first-round byes. Your scenario stays in the page link.</p></details>}
      {data.issues.map(issue=><p className={styles.notice} key={issue}>{issue}</p>)}
      <div className={loading?styles.updating:undefined}>{data.conferences.map(c=><Path key={c.name} name={c.name} league={league} season={data.season} path={league==='CFB'?cfpBracket(c.teams,data.games):nflBracket(c.teams,data.games,c.name)}/>)}
      {nflFinal&&data.conferences.length>0&&<section className={styles.superBowl} aria-label="Super Bowl"><h3>Super Bowl</h3><Match slot={nflFinal} league={league} season={data.season}/>{winner&&<div className={styles.champion}><span aria-hidden="true">🏆</span><div><span className={styles.muted}>Super Bowl champion</span><strong>{winner.name}</strong></div></div>}</section>}</div>
      {data.conferences.length>0&&<Qualification data={data} league={league}/>}
      <p className={styles.muted}>ESPN · Checked {new Date(data.checkedAt).toLocaleTimeString('en-GB',{timeZone:'Europe/London'})} UK · Refreshes every minute.{league==='CFB'&&data.state==='projected'?<> · <a href="https://collegefootballplayoff.com/sports/2024/5/29/12-team-format" target="_blank" rel="noreferrer">2026 CFP selection rules</a></>:null}</p>
    </>}
  </section>;
}
