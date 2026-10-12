"use client";
import { useEffect, useRef, useState } from "react";
import { consentVersion, participationRefreshKey, withdrawalPendingKey, unavailableParticipation, type ParticipationState } from "../../lib/participation-contract";
export function useParticipation() {
  const [state,setState]=useState<ParticipationState>(unavailableParticipation);
  const [pending,setPending]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const withdrawing=useRef(false);
  const confirming=useRef(false);
  const activeRequest=useRef(false);
  async function check() {
    try {
      const response=await fetch('/api/audience/participation',{cache:'no-store'});
      if(!response.ok) throw Error('Participation service unavailable. Existing local preferences still work.');
      const value=await response.json();
      setState({available:value.available===true,active:value.active===true,consentVersion:value.consentVersion??null,grantedAt:value.grantedAt??null});
    } catch(e) {setState(previous=>({...previous,available:false}));setError(e instanceof Error?e.message:'Participation service unavailable.');}
  }
  useEffect(()=>{
    try {withdrawing.current=localStorage.getItem(withdrawalPendingKey)==='1';setPending(withdrawing.current);}catch{/* Memory fallback. */}
    void check();
    function sync(event:StorageEvent){
      if(event.key===withdrawalPendingKey){withdrawing.current=event.newValue==='1';setPending(withdrawing.current);}
      if(event.key===participationRefreshKey) void check();
    }
    window.addEventListener('storage',sync);
    return()=>window.removeEventListener('storage',sync);
  },[]);
  function announce(){try{localStorage.setItem(participationRefreshKey,String(Date.now()));}catch{/* No cross-tab persistence. */}}
  async function optIn(){
    if(activeRequest.current||withdrawing.current||!state.available)return;
    activeRequest.current=true;setBusy(true);setError('');
    try{
      for(const action of confirming.current?['confirm']:['prepare','confirm']){
        const response=await fetch('/api/audience/participation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,agree:true,consentVersion})});
        const value=await response.json();
        if(!response.ok){if(response.status===409)confirming.current=false;throw Error(value.error??'Opt-in could not be confirmed. Please retry.');}
        if(action==='prepare')confirming.current=true;
        if(value.active===true){setState(value);confirming.current=false;announce();break;}
      }
    }catch(e){setError(e instanceof Error?e.message:'Opt-in pending. Please retry.');}
    finally{activeRequest.current=false;setBusy(false);}
  }
  async function withdraw(){
    if(activeRequest.current)return;
    // This marker prevents future contribution code from using a still-present
    // cookie while server deletion is offline/pending. Never touches selections.
    withdrawing.current=true;setPending(true);setError('');
    try{localStorage.setItem(withdrawalPendingKey,'1');}catch{/* Memory fallback. */}
    activeRequest.current=true;setBusy(true);
    try{
      const response=await fetch('/api/audience/participation',{method:'DELETE'});
      const value=await response.json();
      if(!response.ok||value.deleted!==true)throw Error(value.error??'Deletion could not be confirmed.');
      setState({...state,active:false,consentVersion:null,grantedAt:null});
      withdrawing.current=false;confirming.current=false;setPending(false);
      try{localStorage.removeItem(withdrawalPendingKey);}catch{/* Memory fallback. */}
      announce();
    }catch{setError('Collection stopped in this browser; withdrawal/deletion remains pending. Your local preferences are unchanged. Retry when connected.');}
    finally{activeRequest.current=false;setBusy(false);}
  }
  return {...state,active:state.active&&!pending,pending,busy,error,optIn,withdraw};
}
