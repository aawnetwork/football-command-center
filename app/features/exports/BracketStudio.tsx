'use client';
/* eslint-disable @next/next/no-img-element -- The download preview shows the generated PNG itself. */
import {useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {type BracketFormat,bracketFormatDimensions} from './bracket-layout';
import {BracketOverlay} from './BracketOverlay';
import {captureCard} from './capture-card';
import {useFootballData} from '../football/useFootballData';
import {bracketSnapshotIssue,bracketSnapshotFilename,type BracketSnapshot,type BracketScope} from './bracket-snapshot';
type Result={dataUrl:string;width:number;height:number;name:string;key:string};
export function BracketStudio({league}:{league:string}){
 const selectedLeague=league==='nfl'?'NFL':'CFB',params=useSearchParams();
 const {data:clock}=useFootballData<{season:number}>(`/api/football/postseason?league=${selectedLeague}&view=status`);
 const [season,setSeason]=useState(()=>/^\d{4}$/.test(params.get('bracketSeason')??'')?params.get('bracketSeason')!:'');
 const [format,setFormat]=useState<BracketFormat>('wide');
 const [scope,setScope]=useState<BracketScope>('full'),[treatment,setTreatment]=useState<'dark'|'light'>('dark'),[background,setBackground]=useState<'panel'|'transparent'>('panel');
 const [champions,setChampions]=useState<Record<string,string>>(()=>Object.fromEntries(params.getAll('cfpChampion').filter(v=>/^(1|4|5|8):[1-9]\d*$/.test(v)).map(v=>v.split(':'))));
 const [snapshot,setSnapshot]=useState<BracketSnapshot|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),[result,setResult]=useState<Result|null>(null),[message,setMessage]=useState('Loading a bracket snapshot…');
 const artwork=useRef<HTMLDivElement>(null),requestId=useRef(0),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const overrides=selectedLeague==='CFB'?Object.entries(champions).sort().map(([c,t])=>`&champion=${encodeURIComponent(`${c}:${t}`)}`).join(''):'';
 useEffect(()=>{
  const controller=new AbortController(),id=++requestId.current;
  void(async()=>{
   await Promise.resolve();if(controller.signal.aborted)return;
   setLoading(true);setError('');setResult(null);setMessage('Loading a bracket snapshot…');
   try{
    const response=await fetch(`/api/football/bracket?league=${selectedLeague}${season?`&season=${season}`:''}${overrides}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)]),cache:'no-store'});
    const data=await response.json();if(!response.ok)throw Error(data.error??'The bracket is unavailable.');
    const issue=bracketSnapshotIssue(data,selectedLeague);if(issue)throw Error(issue);
    if(!controller.signal.aborted&&id===requestId.current){setSnapshot(structuredClone(data));setMessage('Snapshot loaded and frozen. Generate a PNG, or refresh to load a newer snapshot.');}
   }catch(reason){if(!controller.signal.aborted&&id===requestId.current){setSnapshot(null);setError((reason as Error).message);setMessage('No PNG has been generated. Refresh the snapshot to retry.');}}
   finally{if(!controller.signal.aborted&&id===requestId.current)setLoading(false);}
  })();return()=>controller.abort();
 },[selectedLeague,season,overrides,reload]);
 const effectiveScope=selectedLeague==='CFB'?'full':scope;
 const signature=JSON.stringify({snapshot,scope:effectiveScope,treatment,background,format});
 const currentSignature=useRef(signature);useEffect(()=>{currentSignature.current=signature;},[signature]);
 const visibleResult=result?.key===signature?result:null;
 function invalidate(){setResult(null);setMessage('Appearance changed. Generate a new PNG for this selection.');}
 async function generate(){
  if(!snapshot||loading||busy||!artwork.current?.firstElementChild)return;
  const key=signature;
  setBusy(true);setResult(null);setMessage('Preparing the bracket PNG with embedded team logos…');
  try{
   const image=await captureCard(artwork.current.firstElementChild as HTMLElement,format==='wide'?{}:{pixelRatio:1,padding:0});
   if(alive.current&&currentSignature.current===key){setResult({...image,key,name:bracketSnapshotFilename(snapshot,effectiveScope,`${treatment}-${background}-${format}`)});setMessage('PNG ready. Your selected layout is ready to download.');}
  }catch(reason){if(alive.current)setMessage((reason as Error).message??'The PNG could not be generated.');}
  finally{if(alive.current)setBusy(false);}
 }
 async function download(){if(!visibleResult)return;try{
  const blob=await(await fetch(visibleResult.dataUrl)).blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=visibleResult.name;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  setMessage('Download started. Your bracket snapshot is unchanged.');
 }catch{setMessage('The PNG could not download. Please try again.');}}
 const year=clock?.season??snapshot?.season??(season?+season:null);
 return <section className="bracket-snapshot" aria-label="Playoff bracket snapshots"><h2>Playoff bracket snapshot</h2><p>Download a frozen NFL or CFP bracket as a transparent PNG overlay. Choose the wide bracket, Instagram 4:5, or Stories 9:16. Portrait layouts use larger type and rearranged rounds.</p>
  <div className="export-studio__controls">
   <label>Layout<select value={format} disabled={busy} onChange={e=>{setFormat(e.target.value as BracketFormat);invalidate();}}><option value="wide">Wide bracket</option><option value="portrait">Instagram 4:5 · 1080 × 1350</option><option value="story">Stories 9:16 · 1080 × 1920</option></select></label>
   <label>Season<select value={season} disabled={busy||loading} onChange={e=>{setSeason(e.target.value);setChampions({});setResult(null);}}><option value="">Current football season</option>{year&&Array.from({length:Math.max(1,year-2024+1)},(_,i)=>year-i).map(y=><option key={y} value={y}>{y}</option>)}</select></label>
   {selectedLeague==='NFL'&&<label>Bracket<select value={scope} disabled={busy} onChange={e=>{setScope(e.target.value as BracketScope);invalidate();}}><option value="full">Full NFL · AFC, NFC and Super Bowl</option><option value="AFC">AFC only</option><option value="NFC">NFC only</option></select></label>}
   <label>Treatment<select value={treatment} disabled={busy} onChange={e=>{setTreatment(e.target.value as 'dark'|'light');invalidate();}}><option value="dark">Navy / light lettering</option><option value="light">Cream / navy lettering</option></select></label>
   <label>Background<select value={background} disabled={busy} onChange={e=>{setBackground(e.target.value as 'panel'|'transparent');invalidate();}}><option value="panel">Connected panel</option><option value="transparent">Transparent between matches</option></select></label>
   <button type="button" disabled={busy||loading} onClick={()=>setReload(n=>n+1)}>Refresh snapshot</button>
   <button type="button" disabled={busy||loading||!snapshot} onClick={generate}>{busy?'Capturing…':'Generate PNG'}</button>
   {visibleResult&&<button type="button" disabled={busy} onClick={download}>Download PNG</button>}
   <p role="status" aria-live="polite">{message}</p>
  </div>
  {error&&<p className="bracket-snapshot__notice" role="alert">{error}</p>}
  {snapshot&&selectedLeague==='CFB'&&snapshot.state==='projected'&&!!snapshot.championOptions?.length&&<details open className="bracket-snapshot__scenarios"><summary>Conference champion assumptions</summary><div className="export-studio__controls">{snapshot.championOptions.map(c=><label key={c.id}>{c.name}{c.confirmed?' · Confirmed':''}<select value={c.confirmed?c.selected:champions[c.id]??c.selected} disabled={busy||loading||c.confirmed} onChange={e=>{setChampions(old=>({...old,[c.id]:e.target.value}));setResult(null);}}>{c.teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>)}<button type="button" disabled={busy||loading} onClick={()=>setChampions({})}>Use current leaders</button></div></details>}
  {snapshot&&!loading&&<><div className="bracket-snapshot__source"><p>{snapshot.state==='confirmed'?'Confirmed bracket':'Projected bracket'} · {snapshot.season} season</p><p>Snapshot checked {new Date(snapshot.checkedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK</p></div>{snapshot.issues.map(issue=><p key={issue} className="bracket-snapshot__notice">{issue}</p>)}<h2>Artwork preview</h2><p>The checkerboard shows transparency and is not included in the download. This preview does not refresh automatically. {bracketFormatDimensions(format)?`Downloads at exactly ${bracketFormatDimensions(format)!.width} × ${bracketFormatDimensions(format)!.height} pixels.`:''}</p><div className="export-studio__artboard"><div ref={artwork}><BracketOverlay snapshot={snapshot} scope={effectiveScope} treatment={treatment} background={background} format={format}/></div></div></>}
  {visibleResult&&<section className="export-studio__preview"><h2>PNG preview · {visibleResult.width} × {visibleResult.height}</h2><div><img src={visibleResult.dataUrl} alt={`${snapshot?.season} ${selectedLeague} playoff bracket snapshot PNG`}/></div></section>}
 </section>;
}
