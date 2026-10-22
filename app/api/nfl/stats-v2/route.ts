import { statsV2Access } from '../../../lib/stats-v2/release-access';
import { respondNflPollStatus } from '../../../lib/stats-v2/nfl-poll-status';
import { respondNflStatsV2 } from '../../../lib/stats-v2/nfl-server';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if(!statsV2Access())return new Response(null,{status:404});
  if (new URL(request.url).searchParams.get('view') === 'status') return respondNflPollStatus(request);
  return respondNflStatsV2(request);
}
