export type PreviousHigh = {
 player_id: string; game_id: string; team_id: string; season: number; week: number;
 season_type: string; category: string; previous_high: number | null;
 complete: boolean; reason: string | null; revision: number; captured_at: string; source: string;
};
// Each exact identity resolves to one fact, or null if any duplicate exists.
// Do not include team/season/revision in the key: conflicting facts must still
// suppress the indicator, just as multiple matches in the original scan did.
export type CfbHistoryIndex = ReadonlyMap<string, ReadonlyMap<string, ReadonlyMap<string, PreviousHigh | null>>>;

export function indexCfbHistory(facts: PreviousHigh[]): CfbHistoryIndex {
 const games = new Map<string, Map<string, Map<string, PreviousHigh | null>>>();
 for (const fact of facts) {
  let players = games.get(fact.game_id);
  if (!players) { players = new Map(); games.set(fact.game_id, players); }
  let categories = players.get(fact.player_id);
  if (!categories) { categories = new Map(); players.set(fact.player_id, categories); }
  categories.set(fact.category, categories.has(fact.category) ? null : fact);
 }
 return games;
}

export function seasonHighEligible(stat: {playerId:number;gameId:number;category:string;stat:string;value:number}, facts: PreviousHigh[] | CfbHistoryIndex, completed: boolean, teamId: string): boolean {
 // Array callers remain supported; the player-stats route builds one index for
 // the entire response. No index survives a request, so corrections are fresh.
 const index = Array.isArray(facts) ? indexCfbHistory(facts) : facts;
 const r = index.get(String(stat.gameId))?.get(String(stat.playerId))?.get(stat.category);
 return Boolean(r && completed&&stat.stat==='YDS'&&Number.isSafeInteger(stat.value)&&r.season===2026&&r.season_type==='regular'&&r.team_id===teamId&&r.complete===true&&r.reason===null&&Number.isSafeInteger(r.previous_high)&&Number.isSafeInteger(r.revision)&&r.revision>0&&stat.value>r.previous_high!);
}
export async function loadCfbPreviousHighs(gameIds: string[]): Promise<PreviousHigh[]> {
 if(!gameIds.length||gameIds.length>200||gameIds.some(x=>!/^\d+$/.test(x)))return [];
 const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_POLL_READ_KEY;
 if(!url||!key||!url.startsWith('https://'))return [];
 if(!key.startsWith('sb_publishable_')){
  let role;try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role;}catch{return [];}
  if(role!=='anon')return [];
 }
 try{
  const r=await fetch(`${url}/rest/v1/rpc/ur_read_cfb_player_highs`,{method:'POST',body:JSON.stringify({p_game_ids:[...new Set(gameIds)]}),cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json',apikey:key,...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`}:{})},signal:AbortSignal.timeout(3000)});
  if(!r.ok)return [];const data=await r.json();
  if(!data||!Number.isSafeInteger(data.version)||data.version<1||!Array.isArray(data.records))return [];
  const allowed=['player_id','game_id','team_id','season','week','season_type','category','previous_high','complete','reason','revision','captured_at','source'];
  if(data.records.some((x:Record<string,unknown>)=>!x||Object.keys(x).sort().join()!==[...allowed].sort().join()||x.source!=='CFBD'||typeof x.captured_at!=='string'||!Number.isFinite(Date.parse(x.captured_at))))return [];
  if(data.records.some((x:PreviousHigh)=>!gameIds.includes(x.game_id)))return [];
  return data.records;
 }catch{return [];}// History availability must never break live ESPN statistics.
}
