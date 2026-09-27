import { NextResponse } from "next/server";
import { loadLiveNflStats } from "../live-stats";

const BASE_URL = "https://github.com/nflverse/nflverse-data/releases/download/stats_team";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") === "season" ? "season" : "weekly";
    if (mode === "weekly") {
      const live = await loadLiveNflStats();
      return NextResponse.json({ season: 2026, mode, week: live.week, availableWeeks: live.week ? [live.week] : [], stats: live.teams });
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
