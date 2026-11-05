'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { GameCard } from '../../components/GameCard';
import { GameDetails } from '../games/GameDetails';
import { GameTierControls } from '../games/GameTierControls';
import { PlayoffBracket } from './PlayoffBracket';
import { NflUkBroadcasts } from '../games/NflUkBroadcasts';
import { useHubPreferences } from '../preferences/HubPreferences';
import { favouriteSides } from '../../lib/local-preferences';
import { tierInfo, type NFLTier } from '../../lib/nfl-helpers';
import type { GameContext } from '../../lib/game-context';
import { roundNames, type PostRound } from '../../lib/postseason-model';
import { seasonGameSelection, seasonGameUrl, postseasonTime, postseasonDay, nflPostRounds, cfbPostRounds } from '../../lib/season-game-selection';
import type { PostGame } from '../../lib/postseason-service';
import type { BroadcastAvailability } from '../../lib/broadcast-availability';
import styles from './football.module.css';
import { useFootballData } from './useFootballData';
type League='NFL'|'CFB';
type Schedule={season:number;games:PostGame[];issues:string[];checkedAt:string};
type Props={league:League;children:ReactNode;tiers:Record<number,NFLTier>;onSetTier:(id:number,tier:NFLTier,context?:GameContext)=>void};
export function SeasonGames({league,children,tiers={},onSetTier}:Props) {
  const params=useSearchParams();
  const {data:clock,error:clockError}=useFootballData<{season:number;phase:number}>(`/api/football/postseason?league=${league}&view=status`,300000);
  const {phase,season,round}=seasonGameSelection(params,league,clock);
  const {data:schedule,error,loading}=useFootballData<Schedule>(phase!=='regular'&&season?`/api/football/postseason?league=${league}&season=${season}`:null,30000);
  const playoffView=params.get('postView')==='bracket'?'bracket':'games';
  useEffect(()=>{
    if(!schedule||!window.location.hash.startsWith('#postseason-game-'))return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({block:'center'});
  },[schedule]);
  const [tierFilter,setTierFilter]=useState<string>('all');
  const {favourites,interact}=useHubPreferences();
  const phaseGames=(schedule?.games??[]).filter(g=>phase==='bowls'?!g.playoff:g.playoff);
  const games=phaseGames.filter(g=>(round==='all'||g.round===round)&&(tierFilter==='all'||tiers[Number(g.id)]===tierFilter));
  const rounds=league==='NFL'?nflPostRounds:cfbPostRounds;
  const gameIds=phaseGames.map(g=>g.id).sort().join(',');
  const {data:broadcasts}=useFootballData<{availability:BroadcastAvailability[]}>(gameIds?`/api/broadcast-availability?league=${league}&gameIds=${gameIds}`:null,60000);
  const choose=(change:Parameters<typeof seasonGameUrl>[1])=>{setTierFilter('all');window.history.pushState(null,'',seasonGameUrl(window.location.href,change));};
  const groups:{key:string;label:string;games:PostGame[]}[]=phase==='playoffs'?(round==='all'?[...rounds,'other' as PostRound]:[round as PostRound]).map(r=>({key:r,label:roundNames[r],games:games.filter(g=>g.round===r)})).filter(g=>g.games.length):[...new Set(games.map(g=>postseasonDay(g.date,g.timeTbd)))].map(day=>({key:day,label:day,games:games.filter(g=>postseasonDay(g.date,g.timeTbd)===day)}));
  return <>
    <nav className="centre-secondary-nav" aria-label={`${league} game season phase`}>
      <button type="button" aria-pressed={phase==='regular'} onClick={()=>choose({phase:'regular'})}>Regular season</button>
      {league==='CFB'&&<button type="button" aria-pressed={phase==='bowls'} onClick={()=>choose({phase:'bowls'})}>Bowls</button>}
      <button type="button" aria-pressed={phase==='playoffs'} onClick={()=>choose({phase:'playoffs'})}>{league==='CFB'?'CFP Playoffs':'Playoffs'}</button>
    </nav>
    {phase==='regular'?children:<>
      <header className={`${styles.header} centre-section-header`}><div><h2>{league==='NFL'?'NFL Playoffs':phase==='bowls'?'Bowl Games':'College Football Playoff'}</h2><p className={styles.muted}>{season?`${season} season · `:''}{phase==='bowls'?'Non-CFP bowl games, in date order.':'Every playoff round, from the opening matchups to the championship.'}</p></div>
        {(clock||season)&&<label className={styles.controls}>Season<select aria-label="Postseason football season" value={season??''} onChange={e=>choose({season:+e.target.value})}>{Array.from({length:Math.max(1,(clock?.season??season!)-2024+1)},(_,i)=>(clock?.season??season!)-i).map(s=><option key={s} value={s}>{s}</option>)}</select></label>}
      </header>
      {phase==='playoffs'&&<div className="centre-category-controls" role="group" aria-label="Playoff display"><button type="button" aria-pressed={playoffView==='games'} onClick={()=>{const url=new URL(window.location.href);url.searchParams.delete('postView');window.history.pushState(null,'',`${url.pathname}${url.search}${url.hash}`);}}>Games</button><button type="button" aria-pressed={playoffView==='bracket'} onClick={()=>{const url=new URL(window.location.href);url.searchParams.set('postView','bracket');window.history.pushState(null,'',`${url.pathname}${url.search}${url.hash}`);}}>Bracket</button></div>}
      {phase==='playoffs'&&playoffView==='bracket'?<PlayoffBracket league={league} season={season}/>:<>
      {phase==='playoffs'&&<div className="centre-category-controls" role="group" aria-label="Playoff round"><button type="button" aria-pressed={round==='all'} onClick={()=>choose({round:'all'})}>All rounds</button>{rounds.map(r=><button type="button" key={r} aria-pressed={round===r} onClick={()=>choose({round:r})}>{roundNames[r]}</button>)}{phaseGames.some(g=>g.round==='other')&&<button type="button" aria-pressed={round==='other'} onClick={()=>choose({round:'other'})}>Other postseason</button>}</div>}
      {phaseGames.length>0&&<div className="centre-filter-controls" role="group" aria-label="Postseason game tier filters"><button type="button" aria-pressed={tierFilter==='all'} onClick={()=>setTierFilter('all')}>All games</button>{(Object.keys(tierInfo) as NFLTier[]).map(t=><button type="button" key={t} aria-pressed={tierFilter===t} onClick={()=>setTierFilter(t)}>{tierInfo[t].emoji} {t}</button>)}</div>}
      <div aria-live="polite">{(loading||!season&&!clockError)&&<p role="status" className={styles.muted}>Loading postseason games…</p>}{(error||!season&&clockError)&&<p role="alert" className={styles.error}>{error||clockError} We’ll retry automatically.</p>}{schedule?.issues.map(issue=><p key={issue} className={styles.notice}>{issue}</p>)}</div>
      {schedule&&!loading&&!error&&games.length===0&&<p className={styles.empty}>{tierFilter!=='all'?'No games match this tier. Choose All games to see the full schedule.':phaseGames.length>0?'No matchups have been published for this round yet.':`${phase==='bowls'?'Bowl':'Playoff'} matchups have not been published for this season yet.`} {tierFilter==='all'?'Published matchups will appear here automatically.':''}</p>}
      {groups.map(group=><section key={group.key} className={styles.scheduleGroup} aria-label={group.label}><h3>{group.label} <span className={styles.muted}>· {group.games.length} {group.games.length===1?'game':'games'}</span></h3><div className="command-center__game-grid">{group.games.map(g=>{
        const home=g.teams[0],away=g.teams[1],id=Number(g.id);
        const platforms=broadcasts?.availability.find(row=>row.gameId===id)?.platforms??[];
        const suggested:NFLTier=g.playoff?'S':'B';
        const meta=(t:PostGame['teams'][number]|undefined)=>[t?.record,t?.seed?`No. ${t.seed}`:null].filter(Boolean).join(' · ');
        return <div key={g.id} id={`postseason-game-${g.id}`}><GameCard favourite={Object.values(favouriteSides(g.context,league,favourites[league])).some(Boolean)} status={g.statusLabel} statusKind={g.completed?'final':g.live?'live':'scheduled'} statusDetail={g.live||g.completed||g.statusLabel!=='SCHEDULED'?g.status:g.timeTbd?'Kickoff time TBA':null} awayTeam={away?.name??'To be determined'} homeTeam={home?.name??'To be determined'} awayLogo={away?.logo} homeLogo={home?.logo} awayMeta={meta(away)} homeMeta={meta(home)} awayScore={g.live||g.completed?numericScore(away?.score):null} homeScore={g.live||g.completed?numericScore(home?.score):null} time={postseasonTime(g.date,g.timeTbd)} indicator={{label:g.label,color:'var(--cc-accent-text)'}} headerRight={platforms.length?<NflUkBroadcasts platforms={platforms}/>:null} footer={<GameTierControls tier={tiers[id]} suggestedTier={suggested} tiers={tierInfo} onSelect={tier=>{onSetTier(id,tier,g.context);interact();}}/>} details={g.context.verified?<GameDetails context={g.context} status={g.completed?'final':g.live?'live':'scheduled'} matchupContext={g.label}/>:<p className={styles.muted} data-export-omit>{!g.context.homeTeamId||!g.context.awayTeamId?'Matchup to be confirmed.':'Game details will appear once the schedule is confirmed.'}</p>}/></div>;
      })}</div></section>)}
      {schedule&&<p className={styles.muted}>{games.length} {games.length===1?'game':'games'} shown · ESPN · Checked {new Date(schedule.checkedAt).toLocaleTimeString('en-GB',{timeZone:'Europe/London'})} UK · Refreshes every 30 seconds. January and February games stay in the preceding football season.</p>}
      </>}
    </>}
  </>;
}
function numericScore(score:string|null|undefined){return score!=null&&score.trim()!==''&&Number.isFinite(Number(score))?Number(score):null;}
