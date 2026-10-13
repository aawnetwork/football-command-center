import { hubSection } from './hub-sections';
export const analyticsConsentKey='aaw-hub-analytics-consent';
export const analyticsConsentVersion='stage33-v1';
export type AnalyticsChoice='granted'|'denied'|'dismissed'|'unknown';
export type AnalyticsConfig={enabled:boolean;measurementId:string|null;invite:boolean};
export const analyticsWording='Optional Google Analytics helps AAW understand visits, NFL/CFB sections and feature usage. Google receives a browser analytics identifier and usage information. We do not send your chosen team, game tiers or audience participation identity. This is separate from audience participation.';
export function analyticsConfig(env:Record<string,string|undefined>):AnalyticsConfig {
  const id=env.GA4_MEASUREMENT_ID;
  const measurementId=id && /^G-[A-Z0-9]{6,20}$/.test(id)?id:null;
  // Both release approval and verified manual-only stream settings are required.
  const enabled=env.AAW_ANALYTICS_ENABLED==='true' && env.AAW_GA4_STREAM_APPROVED==='true' && measurementId!==null;
  return {enabled,measurementId,invite:enabled||env.NODE_ENV==='development'};
}
export function parseAnalyticsConsent(raw:string|null):AnalyticsChoice {
  if (!raw) return 'unknown';
  try { const record=JSON.parse(raw);return record?.version===analyticsConsentVersion && Object.keys(record).length===2 && ['granted','denied','dismissed'].includes(record.choice)?record.choice:'unknown'; } catch { return 'unknown'; }
}
export function readAnalyticsConsent(storage:Pick<Storage,'getItem'|'setItem'>):{choice:AnalyticsChoice;available:boolean} {
  try {
    const raw=storage.getItem(analyticsConsentKey);
    // A previously granted record is not trusted when storage can no longer persist withdrawal.
    if(raw!==null)storage.setItem(analyticsConsentKey,raw);
    return {choice:parseAnalyticsConsent(raw),available:true};
  } catch { return {choice:'unknown',available:false}; }
}
export function writeAnalyticsConsent(storage:Pick<Storage,'getItem'|'setItem'>,choice:Exclude<AnalyticsChoice,'unknown'>):boolean {
  try { const raw=JSON.stringify({version:analyticsConsentVersion,choice});storage.setItem(analyticsConsentKey,raw);return storage.getItem(analyticsConsentKey)===raw; } catch { return false; }
}
export function analyticsRoute(href:string,embedded=false) {
  try {
    const url=new URL(href);
    if(embedded || !['http:','https:'].includes(url.protocol) || !['/','/nfl','/cfb'].includes(url.pathname) || ['embed','export','preview'].some(key=>url.searchParams.has(key)))return null;
    const league=url.pathname==='/nfl'?'NFL':url.pathname==='/cfb'?'CFB':'Football';
    const section=league==='Football'?'home':hubSection(url.searchParams);
    const path=url.pathname+(section==='home'?'':`?section=${section}`);
    return {league,section,path,location:url.origin+path,title:`AAW Hub · ${league} · ${section}`};
  }catch{return null;}
}
export type AnalyticsAction='tier_interaction'|'favourite_interaction'|'preferences_open'|'feature_navigation';
export function ownedAnalyticsCookie(name:string) {return /^aaw_hub_(?:ga|gid|gat)(?:_|$)/.test(name);}
