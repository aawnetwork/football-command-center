import retained from './retained-active-games.json';
import type { EspnEvent, EspnScoreboard, EspnSummary } from './nfl-source-types';
type League='CFB'|'NFL';
type Manifest={season:number;week:number;events:EspnEvent[]};
/** Deployment-contained schedule identities outlive transient current-scoreboard
 * responses and process restarts. This is not a claim of national completeness. */
export function stableGameDiscovery(board:EspnScoreboard,league:League,manifest:Manifest=retained[league]):EspnScoreboard {
 if(board.season?.year!==2026||board.season.type!==2||!Number.isInteger(board.week?.number)||!Array.isArray(board.events))throw Error('Unverified discovery period');
 const events=[...board.events],seen=new Set<string>();
 for(const e of events){if(!e.id||seen.has(e.id))throw Error('Duplicate discovery identity');seen.add(e.id);}
 if(manifest.season!==board.season.year||manifest.week!==board.week?.number)return board;
 const retainedIds=new Set<string>();
 for(const saved of manifest.events){
  if(!saved.id||retainedIds.has(saved.id)||saved.season?.year!==manifest.season||saved.season.type!==2||!Number.isFinite(Date.parse(saved.date??''))||saved.competitions?.[0]?.id!==saved.id||saved.competitions[0].competitors?.length!==2)throw Error('Invalid retained game manifest');
  retainedIds.add(saved.id);
  const current=events.find(e=>e.id===saved.id);
  if(current){
   const signature=(e:EspnEvent)=>JSON.stringify(e.competitions?.[0]?.competitors?.map(t=>[t.team?.id,t.homeAway]).sort());
   if(current.season?.year!==manifest.season||current.season.type!==2||signature(current)!==signature(saved))throw Error('Retained game identity conflict');
  }else events.push(structuredClone(saved));
 }
 return {...board,events};
}
/** A summary may update status (including final/corrections), never identity.
 * Validate before replacing the schedule observation, including for absent games. */
export function observedGame(event:EspnEvent,summary:EspnSummary,season:number,week:number):EspnEvent {
 const header=summary.header,c=header?.competitions?.[0],sourceWeek=typeof header?.week==='number'?header.week:header?.week?.number;
 if(!c)throw Error('Summary competition unavailable');
 if(header?.id!==event.id||c?.id!==event.id||header?.season?.year!==season||header.season.type!==2||sourceWeek!==week)throw Error('Summary period or identity conflict');
 const expected=event.competitions?.[0]?.competitors??[],actual=c.competitors??[];
 if(expected.length!==2||actual.length!==2||expected.some(t=>actual.filter(a=>a.team?.id===t.team?.id&&a.homeAway===t.homeAway).length!==1))throw Error('Summary team identity conflict');
 const state=c.status?.type;
 if(!state||!['pre','in','post'].includes(state.state??'')||state.completed!==(state.state==='post'))throw Error('Unverified summary status');
 return {...event,competitions:[{...event.competitions![0],status:c.status}]};
}
export function shouldReadGame(event:EspnEvent,now=Date.now()){
 return ['in','post'].includes(event.competitions?.[0]?.status?.type?.state??'')||Date.parse(event.date??'')<=now;
}
