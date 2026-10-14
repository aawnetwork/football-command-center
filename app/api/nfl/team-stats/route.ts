import {deriveNflverseRows,loadNflverseSnapshot,parseWeeklyPlayers,parseSeasonTeams} from '../../../lib/nflverse-snapshots';
import { NextResponse } from "next/server";
import { loadLiveNflStats } from "../live-stats";

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") === "season" ? "season" : "weekly";
    if (mode === "weekly") {
      const requestedWeek = number(searchParams.get("week"));
      const [live, response] = await Promise.all([
        loadLiveNflStats().catch(() => null),
        loadNflverseSnapshot('player','weekly',parseWeeklyPlayers),
      ]);
      if (!response.ok) return NextResponse.json({ error: "NFL weekly team stats request failed." }, { status: response.status });

      const rows = response.rows;
      const staticAvailableWeeks = [...new Set(rows.map((row) => number(row.week)).filter(Boolean))];
      const availableWeeks = [...new Set([
        ...staticAvailableWeeks,
        ...(live?.week ? [live.week] : []),
      ])].sort((a, b) => a - b);
      const week = requestedWeek || live?.week || availableWeeks.at(-1) || null;

      if (live && live.week === week) {
        return NextResponse.json({ season: 2026, mode, week, availableWeeks, stats: live.teams });
      }

      const stats = deriveNflverseRows(rows,`teams:${week}`,()=>{
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

      return [...teams.values()];
      });
      return NextResponse.json({ season: 2026, mode, week, availableWeeks, stats });
    }
    const response = await loadNflverseSnapshot('team','team',parseSeasonTeams);
    if (!response.ok) return NextResponse.json({ error: "NFL team stats request failed." }, { status: response.status });

    const rows = response.rows;
    const availableWeeks: number[] = [];

    return NextResponse.json({ season: 2026, mode, week: null, availableWeeks, stats: rows });
  } catch (error) {
    console.error("NFL team stats error:", error);
    return NextResponse.json({ error: "Unable to load NFL team stats." }, { status: 500 });
  }
}
