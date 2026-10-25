"use client";
/* eslint-disable @next/next/no-img-element -- PNG previews use the same native pixels as the download. */
import {useEffect,useRef,useState} from 'react';
import {GameOverlay} from './GameOverlay';
import {captureCard} from './capture-card';
import type {OverlayGame} from './game-overlay';
import {pregameTeamAppearance} from './game-overlay';
type Result={dataUrl:string;width:number;height:number;name:string};
export function OverlayStudio({league,stage}:{league:string;stage:'pregame'|'live'|'final'}){
 const [week,setWeek]=useState(''),[games,setGames]=useState<OverlayGame[]>([]),[selected,setSelected]=useState(''),[treatment,setTreatment]=useState<'dark'|'light'>('dark');
 const [result,setResult]=useState<Result|null>(null),[message,setMessage]=useState('Loading scheduled and completed games…'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const artwork=useRef<HTMLDivElement>(null),requestId=useRef(0);
 useEffect(()=>{
  const controller=new AbortController(),id=++requestId.current;
  const params=new URLSearchParams({league:league.toUpperCase(),...(week?{week}: {})});
  void(async()=>{try{
   const response=await fetch(`/api/admin/export-games?${params}`,{signal:controller.signal});const body=await response.json();
   if(!response.ok||!Array.isArray(body.games))throw Error(body.error||'Schedule unavailable.');
   const rows:OverlayGame[]=body.games.filter((game:OverlayGame)=>game.stage===stage);
   let broadcastFailed=false;
   if(league==='cfb'&&stage!=='final'&&rows.length){try{
    const broadcast=await fetch(`/api/broadcast-availability?${new URLSearchParams({league:league.toUpperCase(),gameIds:rows.map(game=>game.id).join(',')})}`,{signal:controller.signal});
    if(!broadcast.ok)throw Error();const data=await broadcast.json();
    for(const game of rows){const match=data.availability?.find((row:{gameId:number})=>String(row.gameId)===game.id);game.platforms=match?.platforms??[];}
   }catch{broadcastFailed=true;}}
   if(controller.signal.aborted||id!==requestId.current)return;
   setGames(rows);setSelected(rows[0]?.id??'');setMessage(rows.length?`Choose a game and check its details before exporting.${broadcastFailed?' UK broadcast listings unavailable; broadcaster omitted.':''}`:'No eligible games returned for this selection. Choose another week.');
  }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Schedule unavailable.');}
  finally{if(!controller.signal.aborted&&id===requestId.current)setLoading(false);}})();
  return()=>controller.abort();
 },[league,stage,week,reload]);
 function clearSelection(){setGames([]);setSelected('');setResult(null);setLoading(true);setMessage('Loading scheduled and completed games…');}
 const game=games.find(item=>item.id===selected);
 async function generate(){if(!artwork.current?.firstElementChild||!game)return;
  if([game.away,game.home].some(team=>!(stage==='pregame'?pregameTeamAppearance(team).logo:team.primarySurfaceLogo??team.darkLogo??team.logo))){setResult(null);setMessage('A team logo is unavailable. Refresh games before exporting.');return;}
  setBusy(true);setResult(null);setMessage('Preparing transparent PNG with embedded logos…');try{
  const image=await captureCard(artwork.current.firstElementChild as HTMLElement);
  setResult({...image,name:`aaw-${league}-${stage}-${game.id}-${treatment}.png`});setMessage('PNG ready. Download and place over your photograph in Canva.');
 }catch(error){setMessage(error instanceof Error?error.message:'Capture failed.');}finally{setBusy(false);}}
 async function download(){if(!result)return;try{const blob=await(await fetch(result.dataUrl)).blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=result.name;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60_000);setMessage('Download started. Your transparent PNG is ready for Canva.');}catch{setMessage('The PNG could not download. Please try again.');}}
 return <section aria-label="Game overlay controls">
  <div className="export-studio__controls"><label>Week<select value={week} disabled={busy} onChange={e=>{clearSelection();setWeek(e.target.value);}}><option value="">Current Week</option>{Array.from({length:league==='cfb'?16:18},(_,i)=><option value={i+1} key={i}>{`Week ${i+1}`}</option>)}</select></label>
   <label>Game<select value={selected} disabled={busy||loading||!games.length} onChange={e=>{setSelected(e.target.value);setResult(null);}}>{!games.length&&<option value="">No eligible games</option>}{games.map(item=><option key={item.id} value={item.id}>{item.away.name} {item.neutral?'vs':'@'} {item.home.name}</option>)}</select></label>
   <label>Treatment<select value={treatment} disabled={busy} onChange={e=>{setTreatment(e.target.value as 'dark'|'light');setResult(null);}}><option value="dark">Navy / light lettering</option><option value="light">Cream / navy lettering</option></select></label>
   <button disabled={busy||loading} onClick={()=>{clearSelection();setReload(value=>value+1);}}>Refresh games</button><button disabled={busy||loading||!game} onClick={generate}>{busy?'Capturing…':'Generate PNG'}</button>{result&&<button onClick={download}>Download PNG</button>}<p role="status">{message}</p>
  </div>
  {game&&<><p>Source checked {new Date(game.observedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK. Refresh games to check for changes.</p><h2>{result?`Export preview · ${result.width} × ${result.height}`:'Overlay preview'}</h2><p>The checkerboard is transparent. No photograph is uploaded or included.</p><div className="export-studio__artboard"><div ref={artwork}><GameOverlay game={game} treatment={treatment}/></div></div>{result&&<div className="export-studio__preview"><div><img src={result.dataUrl} alt="Generated game overlay PNG"/></div></div>}</>}

 </section>;
}
