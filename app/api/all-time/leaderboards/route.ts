import { NextResponse } from "next/server";

import { getAllTimeLeaderboards, type AllTimeLeague } from "../../../lib/all-time-monitor";

export const runtime = "nodejs";

const isLeague = (value: string | null): value is AllTimeLeague =>
  value === "CFB" || value === "NFL";

export async function GET(request: Request) {
  const league = new URL(request.url).searchParams.get("league");
  if (!isLeague(league)) {
    return NextResponse.json({ error: "League must be CFB or NFL." }, { status: 400 });
  }

  try {
    return NextResponse.json({ league, leaderboards: await getAllTimeLeaderboards(league) });
  } catch (error) {
    console.error("All-time leaderboard read failed", error);
    return NextResponse.json({ error: "Unable to load all-time leaderboards." }, { status: 500 });
  }
}
