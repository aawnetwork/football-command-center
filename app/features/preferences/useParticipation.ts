"use client";
import { useEffect, useRef, useState } from "react";
import { consentVersion, participationRefreshKey, withdrawalPendingKey, unavailableParticipation, type ParticipationState } from "../../lib/participation-contract";
import { reserveContributionRevision, type ContributionChange } from "../../lib/audience-contributions";
export function useParticipation() {
  const [state,setState]=useState<ParticipationState>(unavailableParticipation);
  const [pending,setPending]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [contributionWarning,setContributionWarning]=useState("");
  const stateRef=useRef<ParticipationState>(unavailableParticipation);
  const checks=useRef(0);
  const submissions=useRef(new Set<AbortController>());
  const withdrawing=useRef(false);
  const confirming=useRef(false);
  const activeRequest=useRef(false);
  function update(value:ParticipationState){stateRef.current=value;setState(value);}
  function stopSubmissions(){for(const controller of submissions.current)controller.abort();submissions.current.clear();}
  async function check() {
    const generation=++checks.current;
    try {
      const response=await fetch('/api/audience/participation',{cache:'no-store'});
      if(!response.ok) throw Error('Participation service unavailable. Existing local preferences still work.');
      const value=await response.json();
      if(generation!==checks.current)return;
      update({available:value.available===true,active:value.active===true,consentVersion:value.consentVersion??null,grantedAt:value.grantedAt??null,consentReceipt:value.consentReceipt??null});
    } catch(e) {if(generation!==checks.current)return;update({...stateRef.current,available:false});setError(e instanceof Error?e.message:'Participation service unavailable.');}
  }
  useEffect(()=>{
    try {withdrawing.current=localStorage.getItem(withdrawalPendingKey)==='1';setPending(withdrawing.current);}catch{/* Memory fallback. */}
    void check();
    function sync(event:StorageEvent){
      if(event.key===withdrawalPendingKey){withdrawing.current=event.newValue==='1';setPending(withdrawing.current);if(withdrawing.current)stopSubmissions();}
      if(event.key===participationRefreshKey){stopSubmissions();update({...stateRef.current,active:false});void check();}
    }
    window.addEventListener('storage',sync);
    return()=>{++checks.current;stopSubmissions();window.removeEventListener('storage',sync);};
  },[]);
  function announce(){try{localStorage.setItem(participationRefreshKey,String(Date.now()));}catch{/* No cross-tab persistence. */}}
  async function optIn(){
    if(activeRequest.current||withdrawing.current||!state.available)return;
    ++checks.current;activeRequest.current=true;setBusy(true);setError('');
    try{
      for(const action of confirming.current?['confirm']:['prepare','confirm']){
        const response=await fetch('/api/audience/participation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,agree:true,consentVersion})});
        const value=await response.json();
        if(!response.ok){if(response.status===409)confirming.current=false;throw Error(value.error??'Opt-in could not be confirmed. Please retry.');}
        if(action==='prepare')confirming.current=true;
        if(value.active===true){update(value);confirming.current=false;announce();break;}
      }
    }catch(e){setError(e instanceof Error?e.message:'Opt-in pending. Please retry.');}
    finally{activeRequest.current=false;setBusy(false);}
  }
  async function withdraw(){
    if(activeRequest.current)return;
    // This marker prevents future contribution code from using a still-present
    // cookie while server deletion is offline/pending. Never touches selections.
    ++checks.current;withdrawing.current=true;stopSubmissions();setPending(true);setError('');setContributionWarning('');
    try{localStorage.setItem(withdrawalPendingKey,'1');}catch{/* Memory fallback. */}
    activeRequest.current=true;setBusy(true);
    try{
      const response=await fetch('/api/audience/participation',{method:'DELETE'});
      const value=await response.json();
      if(!response.ok||value.deleted!==true)throw Error(value.error??'Deletion could not be confirmed.');
      update({...stateRef.current,active:false,consentVersion:null,grantedAt:null,consentReceipt:null});
      withdrawing.current=false;confirming.current=false;setPending(false);
      try{localStorage.removeItem(withdrawalPendingKey);}catch{/* Memory fallback. */}
      announce();
    }catch{setError('Collection stopped in this browser; withdrawal/deletion remains pending. Your local preferences are unchanged. Retry when connected.');}
    finally{activeRequest.current=false;setBusy(false);}
  }
  function eligible(grantedAt:string|null,receipt:string|null){
    try{if(localStorage.getItem(withdrawalPendingKey)==='1')return false;}catch{return false;}
    return !withdrawing.current&&stateRef.current.available&&stateRef.current.active&&stateRef.current.grantedAt===grantedAt&&grantedAt!==null&&receipt!==null&&stateRef.current.consentReceipt===receipt;
  }
  async function contribute(change:ContributionChange|null){
    const grantedAt=stateRef.current.grantedAt;
    const receipt=stateRef.current.consentReceipt;
    if(stateRef.current.available&&stateRef.current.active&&!withdrawing.current){
      try{localStorage.getItem(withdrawalPendingKey);}catch{setContributionWarning('Your local choice still works; audience collection is unavailable because browser storage cannot safely track withdrawal and selection order.');return;}
    }
    if(!eligible(grantedAt,receipt))return;
    if(!change){setContributionWarning('Local selection saved; game identity could not be verified for audience collection.');return;}
    const controller=new AbortController();submissions.current.add(controller);
    try{
      const revision=await reserveContributionRevision();
      if(controller.signal.aborted||!eligible(grantedAt,receipt))return;
      const response=await fetch('/api/audience/contributions',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,
        body:JSON.stringify({...change,revision,consentGrantedAt:grantedAt,consentReceipt:receipt})});
      const value=await response.json();
      if(!response.ok||value.saved!==true)throw Error('Not saved centrally.');
    }catch{
      if(!controller.signal.aborted&&eligible(grantedAt,receipt))setContributionWarning('Your local choice still works, but an audience change could not be saved. Make the selection again to try; nothing is uploaded retrospectively.');
    }finally{submissions.current.delete(controller);}
  }
  return {...state,active:state.active&&!pending,pending,busy,error,optIn,withdraw,contribute,contributionWarning,dismissContributionWarning:()=>setContributionWarning('')};
}
