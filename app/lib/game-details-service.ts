import { projectGameDetails, detailInterval, type DetailIdentity, type GameDetails, type DetailStage } from './game-details';
/** One operation per exact game. Bounded process cache; Next's fetch cache also
 * shares provider observations across server instances. Never used as a ledger. */
export function createGameDetailsService(request:typeof fetch=fetch,now=Date.now){
 const cache=new Map<string,{value:GameDetails;expires:number}>(),pending=new Map<string,Promise<GameDetails>>();
 return async(identity:DetailIdentity,expected?:DetailStage)=>{
  const key=JSON.stringify(identity),hit=cache.get(key);if(hit&&hit.expires>now()&&!(expected==='live'&&hit.value.stage==='scheduled'||expected==='final'&&hit.value.stage!=='final'))return hit.value;
  const active=pending.get(key);if(active)return active;
  if(pending.size>=32)throw Error('Game details busy');
  const operation=(async()=>{
   const sport=identity.league==='NFL'?'nfl':'college-football';
   const response=await request(`https://site.api.espn.com/apis/site/v2/sports/football/${sport}/summary?event=${identity.event}`,{next:{revalidate:30},signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('Game details unavailable');
   const declared=Number(response.headers.get('content-length'));if(declared>2_000_000)throw Error('Game details too large');
   const reader=response.body?.getReader();if(!reader)throw Error('Empty game details');let size=0;const chunks:Uint8Array[]=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw Error('Game details too large');chunks.push(value);}}finally{await reader.cancel();}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   const value=projectGameDetails(JSON.parse(new TextDecoder().decode(bytes)),identity,new Date(now()).toISOString());
   if(hit?.value.stage==='final'&&value.stage!=='final')throw Error('Final game status regressed');
   cache.delete(key);while(cache.size>=128)cache.delete(cache.keys().next().value!);
   cache.set(key,{value,expires:now()+detailInterval(value.stage)});return value;
  })();pending.set(key,operation);
  try{return await operation;}finally{pending.delete(key);}
 };
}
export const loadGameDetails=createGameDetailsService();
