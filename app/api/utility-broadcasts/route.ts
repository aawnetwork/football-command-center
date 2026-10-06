import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { validatePublication } from '../../lib/utility-broadcasts';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function POST(request: Request) {
  const expected = process.env.BROADCAST_IMPORT_TOKEN;
  const supplied = request.headers.get('x-broadcast-import-token') || '';
  if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return NextResponse.json({error:'Broadcast delivery authorization required.'},{status:401});
  if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({error:'JSON publication required.'},{status:415});
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({error:'Broadcast storage unavailable.'},{status:503});
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 1_000_000) return NextResponse.json({error:'Publication exceeds 1 MB.'},{status:413});
    const p = validatePublication(JSON.parse(raw));
    const response = await fetch(url+'/rest/v1/rpc/ur_publish_desk_broadcasts',{
      method:'POST',headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},
      body:JSON.stringify({p_league:p.league,p_feed_id:p.feed_id,p_version:p.version,p_rows:p.records}),signal:AbortSignal.timeout(25000),cache:'no-store',
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({error:data.message || 'Broadcast delivery failed.'},{status:data.code==='22023'?409:502});
    return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    return NextResponse.json({error:error instanceof Error ? error.message : 'Invalid broadcast publication.'},{status:400});
  }
}
