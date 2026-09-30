import { NextResponse } from "next/server";

import {
  loadGamesForBroadcastDates,
  matchBroadcastRows,
  parseBroadcastCsv,
  type BroadcastAvailability,
  type BroadcastLeague,
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

function parseLeague(value: string | null): BroadcastLeague | null {
  return value === "CFB" || value === "NFL" ? value : null;
}

export async function GET(request: Request) {
  if (!isConfigured()) return NextResponse.json({ error: "Broadcast storage is not configured." }, { status: 503 });

  const url = new URL(request.url);
  const league = parseLeague(url.searchParams.get("league")) ?? "CFB";
  const gameIds = url.searchParams.get("gameIds")
    ?.split(",")
    .map(Number)
    .filter(Number.isFinite) ?? [];
  if (!gameIds.length) return NextResponse.json({ availability: [] });

  const response = await fetch(
    `${supabaseUrl}/rest/v1/broadcast_availability?league=eq.${league}&event_id=in.(${gameIds.join(",")})&select=event_id,dazn,disney_plus,sky_sports,channel_5`,
    { headers: { apikey: supabaseSecret!, Authorization: `Bearer ${supabaseSecret!}` }, cache: "no-store" },
  );
  if (!response.ok) return NextResponse.json({ error: "Unable to load broadcast availability." }, { status: 502 });

  const rows = await response.json() as { event_id: number; dazn: boolean; disney_plus: boolean; sky_sports: boolean; channel_5: boolean }[];
  const availability: BroadcastAvailability[] = rows.map((row) => ({
    gameId: row.event_id,
    platforms: [
      row.dazn ? "DAZN" : null,
      row.disney_plus ? "Disney+" : null,
      row.sky_sports ? "Sky Sports" : null,
      row.channel_5 ? "Channel 5" : null,
    ].filter((platform): platform is BroadcastAvailability["platforms"][number] => Boolean(platform)),
  }));
  return NextResponse.json({ availability });
}

export async function POST(request: Request) {
  if (!isConfigured()) return NextResponse.json({ error: "Set Supabase storage before importing." }, { status: 503 });
  if (!isAuthorised(request)) return NextResponse.json({ error: "Incorrect import password." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const mode = formData.get("mode");
  const league = parseLeague(formData.get("league")?.toString() ?? null);
  if (!league) return NextResponse.json({ error: "Choose CFB or NFL." }, { status: 400 });
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "Choose a CSV file." }, { status: 400 });
  }

  try {
    const rows = parseBroadcastCsv(await file.text());
    const games = await loadGamesForBroadcastDates(league, rows.map((row) => row.date));
    const result = matchBroadcastRows(rows, games);

    if (mode !== "commit") {
      return NextResponse.json({ ...result, imported: false });
    }

    const payload = result.matched.map(({ row, game }) => ({
      league,
      event_id: game.id,
      event_date: game.startDate,
      away_team: game.awayTeam,
      home_team: game.homeTeam,
      source_date: row.date,
      source_time: row.time,
      source_matchup: row.matchup,
      dazn: row.platforms.includes("DAZN"),
      disney_plus: row.platforms.includes("Disney+"),
      sky_sports: row.platforms.includes("Sky Sports"),
      channel_5: row.platforms.includes("Channel 5"),
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
