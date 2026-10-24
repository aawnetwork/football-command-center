'use client';
/* eslint-disable @next/next/no-img-element -- Download preview is the actual PNG. */
import {useEffect,useRef,useState} from 'react';
import {captureCard} from './capture-card';
import {pregameTeamAppearance,type OverlayGame} from './game-overlay';
import {addSelected,moveSelected,reconcileSelected,selectionIssue,collectionIssue,MULTI_GAME_LIMIT,type MultiMode,type SelectedGame} from './multi-game-selection';
import {MultiGameGraphic} from './MultiGameGraphic';
import './multi-game.css';
type Result={dataUrl:string;width:number;height:number;name:string;key:string};
type League='CFB'|'NFL';
function localDay(game:OverlayGame){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(game.kickoff));}
async function loadPage(league:League,week:string,signal:AbortSignal){
 const response=await fetch(`/api/admin/export-games?${new URLSearchParams({league,...(week?{week}:{})})}`,{signal});
 const body=await response.json();if(!response.ok||!Array.isArray(body.games))throw Error(body.error??'Schedule unavailable.');
 const games:OverlayGame[]=body.games.filter((game:OverlayGame)=>game.league===league);
 let broadcastFailed=false;
 const scheduled=games.filter(game=>game.stage==='pregame');
 if(scheduled.length){try{
  const broadcast=await fetch(`/api/broadcast-availability?${new URLSearchParams({league,gameIds:scheduled.map(game=>game.id).join(',')})}`,{signal});
  if(!broadcast.ok)throw Error();const data=await broadcast.json();
  for(const game of scheduled)game.platforms=data.availability?.find((row:{gameId:number})=>String(row.gameId)===game.id)?.platforms??[];
 }catch{if(signal.aborted)throw Error('Request cancelled.');broadcastFailed=true;for(const game of scheduled)game.platforms=[];}}
 return {games,broadcastFailed};
}
export function MultiGameStudio({league}:{league:string}){
 const selectedLeague:League=league.toUpperCase()==='NFL'?'NFL':'CFB';
 const [collections,setCollections]=useState<Record<League,SelectedGame[]>>({CFB:[],NFL:[]});
 const [mode,setMode]=useState<MultiMode>('pregame'),[week,setWeek]=useState(''),[date,setDate]=useState(''),[search,setSearch]=useState('');
 const [games,setGames]=useState<OverlayGame[]>([]),[treatment,setTreatment]=useState<'dark'|'light'>('dark');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[result,setResult]=useState<Result|null>(null),[message,setMessage]=useState('Loading games…');
 const artwork=useRef<HTMLDivElement>(null),collectionsRef=useRef(collections);
 useEffect(()=>{collectionsRef.current=collections;},[collections]);
 useEffect(()=>{
  const controller=new AbortController();let stopped=false;
  const weeks=[...new Set([week,...collectionsRef.current[selectedLeague].map(row=>row.week)])];
  void(async()=>{
   await Promise.resolve();if(stopped)return;setLoading(true);setGames([]);setMessage('Refreshing schedule and selected games…');
   const pages=new Map<string,OverlayGame[]|null>();let displayed:OverlayGame[]=[],failed=false,broadcastFailed=false;
   for(const sourceWeek of weeks){
    try{const page=await loadPage(selectedLeague,sourceWeek,AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]));pages.set(sourceWeek,page.games);if(sourceWeek===week)displayed=page.games;broadcastFailed ||= page.broadcastFailed;}
    catch{if(controller.signal.aborted)return;pages.set(sourceWeek,null);failed=true;}
   }
   if(stopped)return;
   setGames(displayed);setCollections(previous=>({...previous,[selectedLeague]:reconcileSelected(previous[selectedLeague],pages)}));
   setMessage(failed?'Some games could not refresh. Your collection and order are retained; marked games cannot export.':`Schedule refreshed. Your collection order is unchanged.${broadcastFailed?' Broadcaster unavailable; viewing details omitted.':''}`);setLoading(false);
  })();
  return()=>{stopped=true;controller.abort();};
 },[selectedLeague,week,reload]);
 const selected=collections[selectedLeague],issue=collectionIssue(selected,mode);
 const signature=JSON.stringify({selected,selectedLeague,mode,treatment});
 const currentSignature=useRef(signature);
 useEffect(()=>{currentSignature.current=signature;},[signature]);
 const visibleResult=result?.key===signature?result:null;
 function update(rows:SelectedGame[]){setCollections(previous=>({...previous,[selectedLeague]:rows}));setResult(null);}
 function add(game:OverlayGame){
  if(selected.some(row=>row.game.id===game.id)){setMessage('That game is already selected.');return;}
  if(selected.length>=MULTI_GAME_LIMIT){setMessage('This edition supports up to four games. Remove one before adding another.');return;}
  update(addSelected(selected,game,week));setMessage('Game added at the end. Use Move Up or Move Down to set your publication order.');
 }
 async function generate(){
  if(busy||loading||issue||!artwork.current?.firstElementChild)return;
  if(selected.some(row=>[row.game.away,row.game.home].some(team=>!pregameTeamAppearance(team).logo))){setMessage('A selected team logo is unavailable. Refresh or remove that game before exporting.');return;}
  const key=signature,name=`aaw-${league}-${mode==='pregame'?'weekend-watchlist':'results-roundup'}-${selected.map(row=>row.game.id).join('-')}-${treatment}.png`;
  setBusy(true);setResult(null);setMessage('Preparing transparent PNG with embedded logos…');
  try{const image=await captureCard(artwork.current.firstElementChild as HTMLElement);if(currentSignature.current===key){setResult({...image,name,key});setMessage('PNG ready in your chosen order. Download and place over your photograph if desired.');}}
  catch(error){if(currentSignature.current===key)setMessage(error instanceof Error?error.message:'Capture failed. Your collection has been retained.');}
  finally{setBusy(false);}
 }
 async function download(){if(!visibleResult)return;try{
  const blob=await(await fetch(visibleResult.dataUrl)).blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=visibleResult.name;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage('Download started. Your collection is unchanged.');
 }catch{setMessage('Download failed. Your PNG and collection are retained; try downloading again.');}}
 const displayed=games.filter(game=>game.league===selectedLeague&&(!date||localDay(game)===date)&&`${game.away.name} ${game.home.name}`.toLowerCase().includes(search.trim().toLowerCase()));
 return <section className="multi-studio" aria-label="Multi-game publishing">
  <h2>Multi-game publishing</h2><p>Choose two to four games. Arrange them in your publication order; keep the same collection for the results later.</p>
  <div className="export-studio__controls"><label>Graphic<select value={mode} disabled={busy} onChange={event=>{setMode(event.target.value as MultiMode);setResult(null);}}><option value="pregame">Pregame — Weekend Watchlist</option><option value="final">Final — Results Roundup</option></select></label>
   <label>Week<select value={week} disabled={busy||loading} onChange={event=>{setWeek(event.target.value);setDate('');}}><option value="">Current Week</option>{Array.from({length:selectedLeague==='CFB'?16:18},(_,i)=><option key={i+1} value={i+1}>Week {i+1}</option>)}</select></label>
   <label>UK date<select value={date} disabled={busy||loading} onChange={event=>setDate(event.target.value)}><option value="">All dates</option>{[...new Set(games.map(localDay))].sort().map(day=><option key={day} value={day}>{day}</option>)}</select></label>
   <label>Find a team<input type="search" value={search} disabled={busy} onChange={event=>setSearch(event.target.value)} placeholder="Team name"/></label>
   <label>Treatment<select value={treatment} disabled={busy} onChange={event=>{setTreatment(event.target.value as 'dark'|'light');setResult(null);}}><option value="dark">Navy / light lettering</option><option value="light">Cream / navy lettering</option></select></label>
   <button disabled={busy||loading} onClick={()=>setReload(value=>value+1)}>Refresh games</button>
  </div>
  <div className="multi-studio__workspace"><section aria-label="Available games"><h2>Find games</h2><ul className="multi-studio__games">{displayed.map(game=><li key={game.id}><div><strong>{game.away.name} {game.neutral?'vs':'@'} {game.home.name}</strong><small>{localDay(game)} · {game.stage==='pregame'?'Scheduled':game.stage==='final'?game.finalLabel:'Live'}</small></div><button disabled={busy||loading||selected.some(row=>row.game.id===game.id)||selected.length>=MULTI_GAME_LIMIT} onClick={()=>add(game)} aria-label={`Add ${game.away.name} at ${game.home.name}`}>{selected.some(row=>row.game.id===game.id)?'Added':'Add'}</button></li>)}</ul>{!displayed.length&&<p>{loading?'Loading games…':'No games match these filters.'}</p>}</section>
   <section aria-label="Selected collection"><h2>Publication order <small>({selected.length}/{MULTI_GAME_LIMIT})</small></h2><ol className="multi-studio__collection">{selected.map((row,index)=><li key={row.game.id}><strong>{index+1}. {row.game.away.name} {row.game.neutral?'vs':'@'} {row.game.home.name}</strong><small className={selectionIssue(row,mode)?'multi-studio__issue':undefined}>{selectionIssue(row,mode)??(mode==='pregame'?'Scheduled — ready':'Confirmed final — ready')}</small><div className="multi-studio__actions"><button disabled={busy||loading||index===0} aria-label={`Move ${row.game.away.name} up`} onClick={()=>update(moveSelected(selected,index,-1))}>Move Up</button><button disabled={busy||loading||index===selected.length-1} aria-label={`Move ${row.game.away.name} down`} onClick={()=>update(moveSelected(selected,index,1))}>Move Down</button><button disabled={busy||loading} aria-label={`Remove ${row.game.away.name}`} onClick={()=>update(selected.filter((_,i)=>i!==index))}>Remove</button></div></li>)}</ol>{!selected.length&&<p>Add games from the schedule. They stay in the order you choose.</p>}</section></div>
  <div className="export-studio__controls"><button disabled={busy||loading||Boolean(issue)} onClick={generate}>{busy?'Capturing…':'Generate PNG'}</button>{visibleResult&&<button onClick={download}>Download PNG</button>}{issue&&<p className="multi-studio__issue">{issue}</p>}<p role="status">{message}</p></div>
  {!issue&&<><h2>Artwork preview</h2><p>The checkerboard is transparent. No photograph is included.</p><div className="export-studio__artboard"><div ref={artwork}><MultiGameGraphic games={selected.map(row=>row.game)} mode={mode} treatment={treatment}/></div></div></>}
  {visibleResult&&<div className="multi-studio__download"><h2>PNG preview · {visibleResult.width} × {visibleResult.height}</h2><div className="export-studio__preview"><div><img src={visibleResult.dataUrl} alt="Generated multi-game PNG in your publication order"/></div></div></div>}
 </section>;
}
