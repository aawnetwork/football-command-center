/** Fixed ESPN PNG paths only; this is not a general-purpose image proxy. */
export async function GET(request:Request){
 const path=new URL(request.url).searchParams.get('path');
 if(!path||!/^\/(?:i\/teamlogos\/(?:ncaa|nfl)\/(?:500|500-dark)\/[a-z0-9]+|guid\/[a-f0-9-]{36}\/logos\/[a-z0-9_-]+)\.png$/i.test(path))return new Response('Invalid team logo',{status:400});
 try{
  const response=await fetch(`https://a.espncdn.com${path}`,{redirect:'error',next:{revalidate:86400},signal:AbortSignal.timeout(12000)});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/png'))throw Error();
  const bytes=await response.arrayBuffer(),signature=new Uint8Array(bytes,0,Math.min(bytes.byteLength,8));
  if(bytes.byteLength>2_000_000||signature.length!==8||![137,80,78,71,13,10,26,10].every((b,i)=>signature[i]===b))throw Error();
  return new Response(bytes,{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=86400','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('Team logo temporarily unavailable',{status:502});}
}
