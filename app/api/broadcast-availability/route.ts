import { NextResponse } from "next/server";

import {
  loadCfbGamesForBroadcastDates,
  matchBroadcastRows,
  parseBroadcastCsv,
  type BroadcastAvailability,
} from "../../lib/broadcast-availability";

export const runtime = "nodejs";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

function isConfigured() {
  return Boolean(supabaseUrl && supabaseSecret);
}

function isAuthorised(request: Request) {
  const token = process.env.BROADCAST_IMPORT_TOKEN;
  return Boolean(token && request.headers.get("x-broadcast-import-token") === token);
}

export async function GET(request: Request) {
  if (!isConfigured()) return NextResponse.json({ error: "Broadcast storage is not configured." }, { status: 503 });

  const gameIds = new URL(request.url).searchParams.get("gameIds")
    ?.split(",")
    .map(Number)
    .filter(Number.isFinite) ?? [];
  if (!gameIds.length) return NextResponse.json({ availability: [] });

  const response = await fetch(
    `${supabaseUrl}/rest/v1/broadcast_availability?league=eq.CFB&event_id=in.(${gameIds.join(",")})&select=event_id,dazn,disney_plus`,
    { headers: { apikey: supabaseSecret!, Authorization: `Bearer ${supabaseSecret!}` }, cache: "no-store" },
  );
  if (!response.ok) return NextResponse.json({ error: "Unable to load broadcast availability." }, { status: 502 });

  const rows = await response.json() as { event_id: number; dazn: boolean; disney_plus: boolean }[];
  const availability: BroadcastAvailability[] = rows.map((row) => ({
    gameId: row.event_id,
    platforms: [row.dazn ? "DAZN" : null, row.disney_plus ? "Disney+" : null].filter((platform): platform is "DAZN" | "Disney+" => Boolean(platform)),
  }));
  return NextResponse.json({ availability });
}

export async function POST(request: Request) {
  if (!isConfigured()) return NextResponse.json({ error: "Set Supabase storage before importing." }, { status: 503 });
  if (!isAuthorised(request)) return NextResponse.json({ error: "Incorrect import password." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const mode = formData.get("mode");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Choose a CSV file." }, { status: 400 });
  }

  try {
    const rows = parseBroadcastCsv(await file.text());
    const games = await loadCfbGamesForBroadcastDates(rows.map((row) => row.date));
    const result = matchBroadcastRows(rows, games);

    if (mode !== "commit") {
      return NextResponse.json({ ...result, imported: false });
    }

    const payload = result.matched.map(({ row, game }) => ({
      league: "CFB",
      event_id: game.id,
      event_date: game.startDate,
      away_team: game.awayTeam,
      home_team: game.homeTeam,
      source_date: row.date,
      source_time: row.time,
      source_matchup: row.matchup,
      dazn: row.platforms.includes("DAZN"),
      disney_plus: row.platforms.includes("Disney+"),
    }));

    if (payload.length) {
      const response = await fetch(`${supabaseUrl}/rest/v1/broadcast_availability?on_conflict=league,event_id`, {
        method: "POST",
        headers: {
          apikey: supabaseSecret!,
          Authorization: `Bearer ${supabaseSecret!}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Supabase import failed (${response.status}).`);
    }

    return NextResponse.json({ ...result, imported: true, importedCount: payload.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import this CSV." }, { status: 400 });
  }
}
