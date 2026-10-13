import { validExportPassword } from '../../../../lib/export-password';
import { reportFilters } from '../../../../lib/audience-report';
import { loadAudienceReport } from '../../../../lib/audience-report-store';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request) {
  // Independent handler protection: proxy/page protection alone is insufficient.
  if (!validExportPassword(request.headers.get('authorization'),process.env.EXPORT_STUDIO_PASSWORD))
    return Response.json({error:'Admin authentication required.'},{status:401,headers:{...headers,'WWW-Authenticate':'Basic realm="AAW Export Studio", charset="UTF-8"'}});
  let filters;
  try { filters=reportFilters(new URL(request.url).searchParams); }
  catch { return Response.json({error:'Invalid report filters.'},{status:400,headers}); }
  try { return Response.json(await loadAudienceReport(filters),{headers}); }
  catch { return Response.json({error:'Audience reporting is unavailable. Retry later; these are not zero results.'},{status:503,headers}); }
}
