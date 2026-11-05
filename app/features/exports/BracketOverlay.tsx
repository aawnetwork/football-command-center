/* eslint-disable @next/next/no-img-element -- Logos are embedded into the downloaded PNG by captureCard. */
import type {CSSProperties} from 'react';
import {bracketWinner} from '../../lib/playoff-bracket';
import {postseasonTime} from '../../lib/season-game-selection';
import {bracketSnapshotLabel,bracketLogoUrl,type BracketSnapshot,type BracketScope} from './bracket-snapshot';
import {bracketOverlayLayout,bracketFormatDimensions,type BracketFormat} from './bracket-layout';
import './bracket-overlay.css';
export function BracketOverlay({snapshot,scope='full',treatment='dark',background='panel',format='wide'}:{snapshot:BracketSnapshot;scope?:BracketScope;treatment?:'dark'|'light';background?:'panel'|'transparent';format?:BracketFormat}){
 const composition=bracketOverlayLayout(snapshot,scope,format),dimensions=bracketFormatDimensions(format);
 const title=snapshot.league==='CFB'?'COLLEGE FOOTBALL PLAYOFF':scope==='full'?'NFL PLAYOFF BRACKET':`${scope} PLAYOFF BRACKET`;
 return <article className={`bracket-overlay bracket-overlay--${treatment}`} data-league={snapshot.league} data-background={background} data-format={format} style={dimensions?{width:dimensions.width,height:dimensions.height}:undefined} aria-label={`${snapshot.season} ${title} snapshot`}>
  <div className="bracket-overlay__panel"><header className="bracket-overlay__header"><img src="/exports/aaw-network-wordmark.png" alt="AAW Network" style={{objectFit:'contain'}}/><div><p>{snapshot.season} SEASON · {scope==='full'?'FULL BRACKET':scope}</p><h2>{format!=='wide'&&snapshot.league==='CFB'?'CFP PLAYOFF BRACKET':title}</h2></div><strong>{format==='wide'?bracketSnapshotLabel(snapshot):snapshot.state==='confirmed'?'CONFIRMED BRACKET':'PROJECTED BRACKET'}</strong></header>
  <div className="bracket-overlay__body" style={{height:composition.height,width:composition.width}}>
    <svg className="bracket-overlay__lines" width={composition.width} height={composition.height} viewBox={`0 0 ${composition.width} ${composition.height}`} aria-hidden="true">{composition.edges.map((edge,i)=>{const middle=(edge.from[0]+edge.to[0])/2,middleY=(edge.from[1]+edge.to[1])/2;return <path key={i} d={edge.vertical?`M ${edge.from[0]} ${edge.from[1]} V ${middleY} H ${edge.to[0]} V ${edge.to[1]}`:`M ${edge.from[0]} ${edge.from[1]} H ${middle} V ${edge.to[1]} H ${edge.to[0]}`} fill="none" stroke="currentColor" strokeWidth="2"/>;})}</svg>
    {composition.headings.map((h,i)=><h3 className="bracket-overlay__round" style={{left:h.x,top:h.y,width:h.width}} key={i}>{h.name}</h3>)}
    {composition.cards.map(({slot,x,y,width})=>{const game=slot.game,winner=bracketWinner(slot);return <section className="bracket-overlay__match" key={slot.key} style={{left:x,top:y-composition.cardHeight/2,width,height:composition.cardHeight,'--match-width':`${width}px`} as CSSProperties}>
      {slot.teams.map((team,i)=>typeof team==='string'?<div className="bracket-overlay__team bracket-overlay__placeholder" key={i}><span>{team.replace(" seed's quarterfinal",' quarterfinal')}</span></div>:<div key={team.id} className={`bracket-overlay__team${winner?.id===team.id?' bracket-overlay__team--winner':''}${game?.completed&&winner&&winner.id!==team.id?' bracket-overlay__team--out':''}`}>
        <b className="bracket-overlay__seed">{team.seed?team.seed:'?'}</b>{team.logo&&<img src={bracketLogoUrl(team.logo)} alt="" style={{objectFit:'contain'}}/>}<span>{team.name}</span>{game&&(game.completed||game.live)&&<strong>{game.teams.find(t=>t.id===team.id)?.score??'—'}{winner?.id===team.id?' ✓':''}</strong>}
      </div>)}
      <footer>{game?game.completed?'FINAL':game.live?'LIVE':postseasonTime(game.date,game.timeTbd):format==='wide'?slot.label:slot.key.startsWith('first-')?`Winner → No. ${[1,4,2,3][Number(slot.key.slice(-1))]} quarterfinal`:slot.key.startsWith('quarter-')?'First-round bye':slot.key.includes('wild-')?'Wild Card':slot.key.includes('div-')?'Reseeded matchup':slot.label.includes('Fixed CFP')?'Fixed bracket':slot.key.includes('cfp-final')?'National Championship':slot.key.includes('super-bowl')?'Super Bowl':'Conference Championship'}</footer>
    </section>;})}
  </div></div>
 </article>;
}
