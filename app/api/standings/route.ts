import { NextResponse } from "next/server";

import { nflDivisionByTeam } from "../../nfl/data/divisions";

export const revalidate = 30;

type League = "CFB" | "NFL";

const urls: Record<League, string> = {
  NFL: "https://site.api.espn.com/apis/v2/sports/football/nfl/standings",
  CFB: "https://site.api.espn.com/apis/v2/sports/football/college-football/standings?groups=80",
};

const stat = (stats: any[] = [], name: string) =>
  stats.find((item) => item.name === name)?.displayValue ?? "—";

const numericStat = (stats: any[] = [], name: string) =>
  Number(stats.find((item) => item.name === name)?.value ?? 0);

const normaliseEntry = (entry: any, league: League) => {
  const overall = stat(entry.stats, "overall");
  const suppliedWinPct = stat(entry.stats, "winPercent");
  const [wins = 0, losses = 0, ties = 0] = overall.split("-").map(Number);
  const calculatedWinPct = wins + losses + ties > 0
    ? ((wins + ties * 0.5) / (wins + losses + ties)).toFixed(3).replace(/^0/, "")
    : "—";

  return {
    team: entry.team?.displayName ?? "Unknown team",
    abbreviation: entry.team?.abbreviation ?? "",
    logo: entry.team?.logos?.[0]?.href ?? null,
    overall,
    conference: stat(entry.stats, "vs. Conf."),
    division: stat(entry.stats, "vs. Div."),
    winPct: suppliedWinPct === "—" ? calculatedWinPct : suppliedWinPct,
    streak: stat(entry.stats, "streak"),
    seed: stat(entry.stats, "playoffSeed"),
    wins: numericStat(entry.stats, "wins"),
  };
};

export async function GET(request: Request) {
  const league = new URL(request.url).searchParams.get("league");
  if (league !== "CFB" && league !== "NFL") {
    return NextResponse.json({ error: "League must be CFB or NFL." }, { status: 400 });
  }

  try {
    const response = await fetch(urls[league], { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ error: "ESPN standings request failed." }, { status: response.status });
    }

    const data = await response.json();
    const sections = (data.children ?? []).flatMap((group: any) => {
      const entries = group.standings?.entries ?? [];
      if (!entries.length) return [];

      if (league === "NFL") {
        const divisions = new Map<string, ReturnType<typeof normaliseEntry>[]>();
        for (const entry of entries.map((item: any) => normaliseEntry(item, league))) {
          const division = nflDivisionByTeam[entry.team] ?? "Other";
          divisions.set(division, [...(divisions.get(division) ?? []), entry]);
        }
        return [...divisions.entries()].map(([name, teams]) => ({
          name,
          conference: name.startsWith("AFC") ? "AFC" : "NFC",
          teams: teams.sort((left, right) => right.wins - left.wins || left.team.localeCompare(right.team)),
        }));
      }

      return [{
        name: group.name,
        conference: group.abbreviation ?? group.shortName ?? group.name,
        teams: entries.map((entry: any) => normaliseEntry(entry, league)),
      }];
    });

    return NextResponse.json({ league, season: data.season ?? null, sections });
  } catch (error) {
    console.error("ESPN standings error", error);
    return NextResponse.json({ error: "Unable to load standings." }, { status: 500 });
  }
}
