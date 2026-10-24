/* eslint-disable @next/next/no-img-element -- Embedded by the approved PNG capture engine. */
import type {CSSProperties} from 'react';
import {pregameTeamAppearance,pregameJoinInk,type OverlayGame,type OverlayTeam} from './game-overlay';
import type {MultiMode} from './multi-game-selection';
function ukDate(value:string){return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short'}).format(new Date(value));}
function ukTime(value:string){return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));}
export function MultiGameGraphic({games,mode,treatment='dark'}:{games:OverlayGame[];mode:MultiMode;treatment?:'dark'|'light'}){
 function team(t:OverlayTeam,side:'away'|'home',winner=false){
  const appearance=pregameTeamAppearance(t);
  return <div className={`multi-graphic__team multi-graphic__team--${side}${winner?' multi-graphic__team--winner':''}`} style={{'--team-text':appearance.ink,'--team-primary':appearance.primary} as CSSProperties}>
   {appearance.logo&&<img className="multi-graphic__logo" src={appearance.logo} alt=""/>}
   <div className="multi-graphic__identity"><div className="multi-graphic__team-meta">{t.rank!==null&&<b>#{t.rank}</b>}{t.record&&<span>{t.record}</span>}</div><h3>{t.name}</h3></div>
  </div>;
 }
 return <article className={`multi-graphic multi-graphic--${mode} multi-graphic--${treatment}`} data-league={games[0]?.league} data-count={games.length} aria-label={mode==='pregame'?'Weekend Watchlist graphic':'Results Roundup graphic'}>
  <div className="multi-graphic__panel"><header className="multi-graphic__header"><img src="/exports/aaw-network-wordmark.png" alt="AAW Network"/><div><span>{mode==='pregame'?'YOUR WEEKEND, LINED UP':'THE SCORES THAT MATTER'}</span><h2>{mode==='pregame'?'Weekend Watchlist':'Results Roundup'}</h2></div></header>
  <div className="multi-graphic__games">{games.map((game,index)=>{
   const away=pregameTeamAppearance(game.away),home=pregameTeamAppearance(game.home);
   const colours={'--away-surface':away.surface,'--home-surface':home.surface,'--join-ink':pregameJoinInk(away.surface,home.surface)} as CSSProperties;
   const awayWins=mode==='final'&&game.away.score!==null&&game.home.score!==null&&game.away.score>game.home.score;
   const homeWins=mode==='final'&&game.away.score!==null&&game.home.score!==null&&game.home.score>game.away.score;
   return <section key={`${game.league}:${game.id}`} className="multi-graphic__game" data-game-id={game.id} aria-label={`${game.away.name} ${game.neutral?'versus':'at'} ${game.home.name}`} style={colours}>
    {mode==='final'&&<div className="multi-graphic__result-label"><strong>{game.finalLabel}</strong>{game.context&&<span>{game.context}</span>}</div>}
    <div className="multi-graphic__matchup">{team(game.away,'away',awayWins)}{mode==='pregame'?<span className="multi-graphic__versus">{game.neutral?'vs':'@'}</span>:<div className={`multi-graphic__scores${String(game.away.score).length>2||String(game.home.score).length>2?' multi-graphic__scores--wide':''}`} aria-label="Final scores"><strong className={awayWins?'is-winner':''}>{game.away.score}</strong><span aria-hidden="true">–</span><strong className={homeWins?'is-winner':''}>{game.home.score}</strong></div>}{team(game.home,'home',homeWins)}</div>
    {mode==='pregame'&&<footer className="multi-graphic__fixture-meta"><span className="multi-graphic__order">{String(index+1).padStart(2,'0')}</span><time dateTime={game.kickoff}>{ukDate(game.kickoff)} <b>{ukTime(game.kickoff)} · UK</b></time><div>{game.context&&<span className="multi-graphic__qualifier">{game.context}</span>}{Boolean(game.platforms?.length)&&<strong>WATCH · {game.platforms!.join(' · ')}</strong>}</div></footer>}
   </section>;
  })}</div></div>
 </article>;
}
