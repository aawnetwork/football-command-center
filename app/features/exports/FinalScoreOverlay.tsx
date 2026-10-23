/* eslint-disable @next/next/no-img-element -- Native brand and team images are embedded by the existing PNG engine. */
import type {CSSProperties} from 'react';
import {overlaySurfaceInk,type OverlayGame,type OverlayTeam} from './game-overlay';
export function FinalScoreOverlay({game,treatment}:{game:OverlayGame;treatment:'dark'|'light'}){
 function team(t:OverlayTeam,opponent:OverlayTeam,side:'away'|'home'){
  const winner=game.stage==='final'&&t.score!==null&&opponent.score!==null&&t.score>opponent.score;
  const style=t.color&&/^#[0-9a-f]{6}$/i.test(t.color)?{'--team-ink':t.color} as CSSProperties:undefined;
  return <div className={`game-overlay__team game-overlay__team--${side}${winner?' game-overlay__team--winner':''}`} style={style}>
   <div className="scorebug__identity">
    {(t.primarySurfaceLogo??t.darkLogo??t.logo)&&<span className="game-overlay__logo-slot"><img src={t.primarySurfaceLogo??(overlaySurfaceInk(t.color??'#0b1f33')==='#fffaf0'?t.darkLogo:null)??t.logo!} alt="" className="game-overlay__logo"/></span>}
    <div className="game-overlay__identity"><div className="scorebug__details">{t.rank!==null&&<span className="game-overlay__rank">#{t.rank}</span>}{t.record&&<span className="scorebug__record">{t.record}</span>}</div><h2>{t.name}</h2></div>
   </div>
   <strong aria-label={`${t.name} ${game.stage==='live'?'live':'final'} score`} className={`game-overlay__score${t.score!==null&&String(t.score).length>2?' game-overlay__score--wide':''}`}>{t.score}</strong>
  </div>;
 }
 return <article className={`game-overlay game-overlay--${treatment} game-overlay--scorebug game-overlay--${game.stage}`} data-league={game.league} aria-label={game.stage==='live'?'Live score overlay':'Final score overlay'}>
  <div className="game-overlay__panel">
   <header><img className="game-overlay__network-logo" src="/exports/aaw-network-wordmark.png" alt="AAW Network"/><strong className="game-overlay__status">{game.stage==='live'?game.liveLabel??'LIVE':game.finalLabel}</strong>{game.context&&<span className="scorebug__context">{game.context}</span>}</header>
   <div className="game-overlay__matchup">{team(game.away,game.home,'away')}{team(game.home,game.away,'home')}</div>
  {game.stage==='live'&&Boolean(game.platforms?.length)&&<footer><span className="game-overlay__broadcast">WATCH · {game.platforms!.join(' · ')}</span></footer>}
  </div><span className="scorebug__footing" aria-hidden="true"/>
 </article>;
}
