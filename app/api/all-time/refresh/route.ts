import { NextResponse } from "next/server";

import {
  getAllTimeMonitorStatus,
  refreshAllTimeMonitor,
  resetAllTimeMonitor,
  type AllTimeLeague,
} from "../../../lib/all-time-monitor";

export const runtime = "nodejs";

const validLeague = (value: string | null): value is AllTimeLeague =>
  value === "CFB" || value === "NFL";

const isAuthorized = (request: Request) => {
  const secret = process.env.ALL_TIME_REFRESH_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
};

export async function GET() {
  return NextResponse.json(await getAllTimeMonitorStatus());
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized refresh request." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedLeague = searchParams.get("league");
  if (requestedLeague && !validLeague(requestedLeague)) {
    return NextResponse.json({ error: "League must be CFB or NFL." }, { status: 400 });
  }
  const league = validLeague(requestedLeague) ? requestedLeague : undefined;

  if (searchParams.get("reset") === "1") {
    await resetAllTimeMonitor();
    return NextResponse.json({ reset: true });
  }

  try {
    return NextResponse.json(await refreshAllTimeMonitor(league));
  } catch (error) {
    console.error("All-time monitor refresh failed", error);
    return NextResponse.json({ error: "Unable to refresh all-time monitor." }, { status: 500 });
  }
}
