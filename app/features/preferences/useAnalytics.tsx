"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import {HubAnalytics} from '../../lib/analytics-runtime';
import {analyticsConsentKey,analyticsRoute,type AnalyticsConfig,type AnalyticsChoice,type AnalyticsAction} from '../../lib/analytics-consent';
export function useAnalytics(config:AnalyticsConfig) {
  const runtime=useRef<HubAnalytics|null>(null);
  const [state,setState]=useState<{choice:AnalyticsChoice;available:boolean;hydrated:boolean;eligible:boolean}>({choice:'unknown',available:true,hydrated:false,eligible:false});
  useEffect(()=>{
    const engine=new HubAnalytics(config,window,(choice,available)=>setState(s=>({...s,choice,available,hydrated:true})));runtime.current=engine;
    const sync=(e:StorageEvent)=>{if(e.key===analyticsConsentKey||e.key===null)engine.sync();};
    const visible=()=>{if(document.visibilityState==='visible')engine.sync();};
    const click=(event:MouseEvent)=>{
      const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;
      if(anchor instanceof HTMLAnchorElement && anchor.origin===window.location.origin && analyticsRoute(anchor.href))engine.action('feature_navigation');
    };
    window.addEventListener('storage',sync);document.addEventListener('visibilitychange',visible);
    document.addEventListener('click',click);
    return()=>{window.removeEventListener('storage',sync);document.removeEventListener('visibilitychange',visible);document.removeEventListener('click',click);engine.stop();runtime.current=null;};
  },[config]);
  const navigate=useCallback((href:string)=>{
    let embedded=true;try{embedded=window.self!==window.top;}catch{/* fail closed */}
    runtime.current?.navigate(href,embedded);
    setState(s=>{const eligible=analyticsRoute(href,embedded)!==null;return s.eligible===eligible?s:{...s,eligible};});
  },[]);
  return {...state,enabled:config.enabled,invite:config.invite,
    choose:useCallback((choice:Exclude<AnalyticsChoice,'unknown'>)=>runtime.current?.choose(choice),[]),
    action:useCallback((name:AnalyticsAction)=>runtime.current?.action(name),[]),navigate};
}
export function AnalyticsNavigation({analytics}:{analytics:ReturnType<typeof useAnalytics>}) {
  const pathname=usePathname(),params=useSearchParams();
  useEffect(()=>{if(analytics.hydrated)analytics.navigate(window.location.href);},[pathname,params,analytics.hydrated,analytics.navigate]);
  return null;
}
