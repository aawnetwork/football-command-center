/* eslint-disable @next/next/no-img-element -- Native brand and team images are embedded by the existing PNG engine. */
import type {CSSProperties} from 'react';
import type {OverlayGame,OverlayTeam} from './game-overlay';
import {ukKickoff,pregameTeamAppearance,pregameJoinInk,pregameJoinColour} from './game-overlay';
import {FinalScoreOverlay} from './FinalScoreOverlay';
export function GameOverlay({game,treatment='dark'}:{game:OverlayGame;treatment?:'dark'|'light'}){
 if(game.stage==='final')return <FinalScoreOverlay game={game} treatment={treatment}/>;
 const date=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(game.kickoff));
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(game.kickoff));
 const away=pregameTeamAppearance(game.away),home=pregameTeamAppearance(game.home);
 const colours={'--away-colour':away.surface,'--home-colour':home.surface,'--versus-ink':pregameJoinInk(away.surface,home.surface),'--join-colour':pregameJoinColour(away.surface,home.surface)} as CSSProperties;
 function team(t:OverlayTeam,side:'away'|'home'){
  const appearance=side==='away'?away:home;
  return <div className={`game-overlay__team game-overlay__team--${side}`} style={{'--team-ink':appearance.primary,'--team-surface':appearance.surface,'--team-text':appearance.ink} as CSSProperties}>
   <div className="scorebug__identity">
    {appearance.logo&&<span className="game-overlay__logo-slot"><img src={appearance.logo} alt="" className="game-overlay__logo"/></span>}
    <div className="game-overlay__identity"><div className="scorebug__details">{t.rank!==null&&<span className="game-overlay__rank">#{t.rank}</span>}{t.record&&<span className="scorebug__record">{t.record}</span>}</div><h2>{t.name}</h2></div>
   </div>
  </div>;
 }
 return <article className={`game-overlay game-overlay--${treatment} game-overlay--scorebug game-overlay--pregame`} data-league={game.league} aria-label="Pregame matchup overlay" style={colours}>
  <div className="game-overlay__panel">
   <header><img className="game-overlay__network-logo" src="/exports/aaw-network-wordmark.png" alt="AAW Network"/><strong className="game-overlay__status">PREGAME</strong>{game.context&&<span className="scorebug__context">{game.context}</span>}</header>
   <div className="game-overlay__matchup">{team(game.away,'away')}<span className="game-overlay__versus">{game.neutral?'vs':'@'}</span>{team(game.home,'home')}</div>
   <footer aria-label={ukKickoff(game.kickoff)??undefined}><time dateTime={game.kickoff}>{date}</time><span>{time} · UK</span>{Boolean(game.platforms?.length)&&<span className="game-overlay__broadcast">WATCH · {game.platforms!.join(' · ')}</span>}</footer>
  </div>
 </article>;
}
