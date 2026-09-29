import { NextResponse } from "next/server";
import { loadLiveNflStats } from "../live-stats";

const BASE_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_team";
const PLAYER_DATA_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

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
    if (mode === "weekly") {
      const requestedWeek = number(searchParams.get("week"));
      const [live, response] = await Promise.all([
        loadLiveNflStats().catch(() => null),
        fetch(PLAYER_DATA_URL, { cache: "no-store" }),
      ]);
      if (!response.ok) return NextResponse.json({ error: "NFL weekly team stats request failed." }, { status: response.status });

      const lines = (await response.text()).split(/\r?\n/).filter(Boolean);
      const headers = parse(lines[0] ?? "");
      const rows = lines.slice(1).map((line) => headers.reduce<Record<string, string>>((row, header, index) => {
        row[header] = parse(line)[index] ?? "";
        return row;
      }, {})).filter((row) => number(row.season) === 2026 && row.season_type === "REG");
      const staticAvailableWeeks = [...new Set(rows.map((row) => number(row.week)).filter(Boolean))];
      const availableWeeks = [...new Set([
        ...staticAvailableWeeks,
        ...(live?.week ? [live.week] : []),
      ])].sort((a, b) => a - b);
      const week = requestedWeek || live?.week || availableWeeks.at(-1) || null;

      if (live && live.week === week) {
        return NextResponse.json({ season: 2026, mode, week, availableWeeks, stats: live.teams });
      }

      const teams = new Map<string, Record<string, string | number>>();
      for (const row of rows.filter((entry) => number(entry.week) === week)) {
        const teamName = row.recent_team || row.team;
        if (!teamName) continue;
        const team = teams.get(teamName) ?? {
          team: teamName,
          passing_yards: 0,
          rushing_yards: 0,
          passing_tds: 0,
          rushing_tds: 0,
          receiving_yards: 0,
          receiving_tds: 0,
          def_tackles_solo: 0,
          def_tackle_assists: 0,
          def_sacks: 0,
          def_interceptions: 0,
        };
        for (const field of Object.keys(team)) {
          if (field !== "team") {
            team[field] = number(team[field]) + number(row[field]);
          }
        }
        teams.set(teamName, team);
      }

      return NextResponse.json({ season: 2026, mode, week, availableWeeks, stats: [...teams.values()] });
    }
    const response = await fetch(`${BASE_URL}/stats_team_reg_2026.csv`, { cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "NFL team stats request failed." }, { status: response.status });

    const lines = (await response.text()).split(/\r?\n/).filter(Boolean);
    const headers = (lines[0] ?? "").split(",");
    const rows = lines.slice(1).map((line) => headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = line.split(",")[index]?.trim() ?? "";
      return row;
    }, {}));
    const availableWeeks: number[] = [];

    return NextResponse.json({ season: 2026, mode, week: null, availableWeeks, stats: rows });
  } catch (error) {
    console.error("NFL team stats error:", error);
    return NextResponse.json({ error: "Unable to load NFL team stats." }, { status: 500 });
  }
}
