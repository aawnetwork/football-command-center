'use client';
import { useEffect, useState } from 'react';
/** Key responses to their selection so switching players or periods cannot show stale data. */
export function useFootballData<T>(url:string|null,interval=0) {
  const [response,setResponse]=useState<{key:string;data:T|null;error:string}>({key:'',data:null,error:''});
  useEffect(()=>{
    if(!url)return;
    const controller=new AbortController();
    const load=async()=>{
      try {
        const result=await fetch(url,{signal:controller.signal});const data=await result.json();
        if(!result.ok)throw new Error(data.error??'Unable to load football data.');
        if(!controller.signal.aborted)setResponse({key:url,data,error:''});
      }catch(e){if(!controller.signal.aborted)setResponse(old=>({key:url,data:old.key===url?old.data:null,error:(e as Error).message}));}
    };
    void load();const timer=interval?window.setInterval(load,interval):null;
    return()=>{controller.abort();if(timer!==null)window.clearInterval(timer);};
  },[url,interval]);
  const selected=response.key===url;
  return {data:selected?response.data:null,previousData:response.data,previousUrl:response.key,error:selected?response.error:'',loading:!!url&&!selected};
}
