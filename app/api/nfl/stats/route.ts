import { NextResponse } from "next/server";
import { loadLiveNflStats } from "../live-stats";

const DATA_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv";

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function parse(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (const character of line) {
    if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { values.push(value); value = ""; }
    else value += character;
  }
  values.push(value);
  return values;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") === "season" ? "season" : "weekly";
    const requestedWeek = number(searchParams.get("week"));
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "NFL player stats request failed." }, { status: response.status });

    const lines = (await response.text()).split(/\r?\n/).filter(Boolean);
    const headers = parse(lines[0] ?? "");
    const rows = lines.slice(1).map((line) => headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = parse(line)[index] ?? "";
      return row;
    }, {})).filter((row) => number(row.season) === 2026 && row.season_type === "REG");
    const staticAvailableWeeks = [...new Set(rows.map((row) => number(row.week)).filter(Boolean))];
    const live = mode === "weekly"
      ? await loadLiveNflStats().catch(() => null)
      : null;
    const availableWeeks = [...new Set([
      ...staticAvailableWeeks,
      ...(live?.week ? [live.week] : []),
    ])].sort((a, b) => a - b);
    const selectedWeek = mode === "weekly"
      ? requestedWeek || live?.week || availableWeeks.at(-1) || null
      : null;
    const source = mode === "weekly"
      ? rows.filter((row) => number(row.week) === selectedWeek)
      : rows;

    if (mode === "weekly" && live && live.week === selectedWeek) {
      return NextResponse.json({ season: 2026, mode, week: selectedWeek, availableWeeks, stats: live.players });
    }

    const players = new Map<string, Record<string, string | number>>();

    for (const row of source) {
      if (!row.player_id) continue;
      const player = players.get(row.player_id) ?? {
        player_id: row.player_id, player_display_name: row.player_display_name || row.player_name || "",
        recent_team: row.recent_team || row.team || "", passing_yards: 0, passing_tds: 0,
        rushing_yards: 0, rushing_tds: 0, receiving_yards: 0, receiving_tds: 0,
        tackles: 0, sacks: 0, interceptions: 0,
      };
      for (const field of ["passing_yards", "passing_tds", "rushing_yards", "rushing_tds", "receiving_yards", "receiving_tds"] as const) player[field] = number(player[field]) + number(row[field]);
      player.tackles = number(player.tackles) + number(row.def_tackles_solo) + number(row.def_tackle_assists);
      player.sacks = number(player.sacks) + number(row.def_sacks);
      player.interceptions = number(player.interceptions) + number(row.def_interceptions);
      players.set(row.player_id, player);
    }

    return NextResponse.json({ season: 2026, mode, week: selectedWeek, availableWeeks, stats: [...players.values()] });
  } catch (error) {
    console.error("NFL player stats error:", error);
    return NextResponse.json({ error: "Unable to load NFL player stats." }, { status: 500 });
  }
}
