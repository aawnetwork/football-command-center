import { NextResponse } from "next/server";

import { refreshAllTimeMonitor, type AllTimeLeague } from "./all-time-monitor";

export async function runAllTimeCron(request: Request, league: AllTimeLeague) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const result = await refreshAllTimeMonitor(league);
    // A partial publication is retained, but must not report a fully successful job.
    return NextResponse.json(result,{status:result.failures.team || result.failures.individual ? 503 : 200});
  } catch (error) {
    console.error(`All-time ${league} cron failed`, error);
    return NextResponse.json({ error: `Unable to refresh ${league} all-time monitor.` }, { status: 500 });
  }
}
