import { parseDetailIdentity, type DetailStage } from '../../lib/game-details';
import { loadGameDetails } from '../../lib/game-details-service';
import { gamePreview } from '../../lib/game-details-preview';
export async function GET(request:Request){
 let identity;try{identity=parseDetailIdentity(new URL(request.url).searchParams);}catch{return Response.json({error:'Invalid game identity'},{status:400});}
 try{const detail=await loadGameDetails(identity,new URL(request.url).searchParams.get('status') as DetailStage|null??undefined);return Response.json({...detail,preview:detail.stage==='scheduled'?gamePreview(detail):null},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Game details are temporarily unavailable. Please try again.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
