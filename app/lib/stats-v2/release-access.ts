/** Both release switches must be explicitly enabled. Local preview access cannot
 * open a Vercel deployment. No environment/configuration is changed by this code. */
export function statsV2Access(){
 const environment=process.env;
 return environment.AAW_STATS_V2_RELEASE==='1'&&environment.NEXT_PUBLIC_AAW_STATS_V2_RELEASE==='1'||environment.AAW_STATS_V2_LOCAL_PREVIEW==='1'&&!environment.VERCEL;
}
