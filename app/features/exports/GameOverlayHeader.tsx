/* eslint-disable @next/next/no-img-element -- Reuses the supplied official brand pixels. */
export function GameOverlayHeader({status,context}:{status:string;context:string|null}){
 return <header><strong className="game-overlay__status">{status}</strong><span className="scorebug__branding"><span className="scorebug__brand-artwork"><img className="game-overlay__network-logo" src="/exports/aaw-network-navy.png" alt="AAW Network"/></span></span>{context&&<span className="scorebug__context">{context}</span>}</header>;
}
