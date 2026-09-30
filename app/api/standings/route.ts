import { NextResponse } from "next/server";

import { cfbPollSnapshots, type PollEntry, type PollKind } from "../../cfb/data/cfb-poll-snapshots";
import { nflDivisionByTeam } from "../../nfl/data/divisions";

export const revalidate = 30;

type League = "CFB" | "NFL";

const urls: Record<League, string> = {
  NFL: "https://site.api.espn.com/apis/v2/sports/football/nfl/standings",
  CFB: "https://site.api.espn.com/apis/v2/sports/football/college-football/standings?groups=80",
};

const rankingsUrl = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings";

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

const normalisePollEntry = (rank: any): PollEntry => ({
  rank: Number(rank.current),
  previousRank: Number(rank.previous) > 0 ? Number(rank.previous) : null,
  team: rank.team?.displayName ?? `${rank.team?.location ?? ""} ${rank.team?.name ?? ""}`.trim(),
  abbreviation: rank.team?.abbreviation ?? "",
  logo: rank.team?.logos?.[0]?.href ?? rank.team?.logo ?? null,
  record: rank.recordSummary ?? rank.team?.record?.summary ?? "—",
  points: Number.isFinite(Number(rank.points)) ? Number(rank.points) : null,
  firstPlaceVotes: Number.isFinite(Number(rank.firstPlaceVotes)) ? Number(rank.firstPlaceVotes) : null,
});

const getPollKind = (ranking: any): PollKind | null => {
  const name = `${ranking.name ?? ""} ${ranking.shortName ?? ""}`.toLowerCase();
  if (ranking.type === "ap" || name.includes("ap top 25") || name.includes("ap poll")) return "ap";
  if (ranking.type === "cfp" || name.includes("college football playoff")) return "cfp";
  return null;
};

async function getCfbPolls(request: Request) {
  const requestedWeek = Number(new URL(request.url).searchParams.get("week"));
  const response = await fetch(rankingsUrl, { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json({ error: "ESPN rankings request failed." }, { status: response.status });
  }

  const data = await response.json();
  const livePolls = new Map<PollKind, any>();
  for (const ranking of data.rankings ?? []) {
    const kind = getPollKind(ranking);
    if (kind) livePolls.set(kind, ranking);
  }

  const apWeek = Number(livePolls.get("ap")?.occurrence?.number ?? data.latestWeek?.number ?? 1);
  const currentWeek = Number.isFinite(apWeek) && apWeek > 0 ? apWeek : 1;
  const week = Number.isFinite(requestedWeek) && requestedWeek > 0 && requestedWeek <= currentWeek
    ? requestedWeek
    : currentWeek;
  const isCurrentWeek = week === currentWeek;

  const polls = (["ap", "cfp", "uki"] as PollKind[]).map((kind) => {
    const livePoll = livePolls.get(kind);
    const snapshot = cfbPollSnapshots[kind]?.[week];
    const entries = isCurrentWeek && livePoll
      ? (livePoll.ranks ?? []).map(normalisePollEntry)
      : snapshot?.entries ?? [];

    return {
      kind,
      available: entries.length > 0,
      week,
      publishedAt: isCurrentWeek && livePoll ? livePoll.date ?? null : snapshot?.publishedAt ?? null,
      entries,
    };
  });

  return NextResponse.json({
    league: "CFB",
    currentWeek,
    selectedWeek: week,
    availableWeeks: Array.from({ length: currentWeek }, (_, index) => index + 1),
    polls,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league");
  if (league !== "CFB" && league !== "NFL") {
    return NextResponse.json({ error: "League must be CFB or NFL." }, { status: 400 });
  }

  if (league === "CFB" && url.searchParams.get("view") === "polls") {
    try {
      return await getCfbPolls(request);
    } catch (error) {
      console.error("ESPN rankings error", error);
      return NextResponse.json({ error: "Unable to load rankings." }, { status: 500 });
    }
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

    const teams: ReturnType<typeof normaliseEntry>[] = sections.flatMap((section: { teams: ReturnType<typeof normaliseEntry>[] }) => section.teams);
    const maxGamesPlayed = teams.reduce((maximum, team) => {
      const [wins = 0, losses = 0, ties = 0] = team.overall.split("-").map(Number);
      return Math.max(maximum, wins + losses + ties);
    }, 0);
    const playoffPictureAvailable = league === "NFL"
      && maxGamesPlayed >= 10
      && teams.some((team) => team.seed !== "—");

    return NextResponse.json({ league, season: data.season ?? null, sections, playoffPictureAvailable });
  } catch (error) {
    console.error("ESPN standings error", error);
    return NextResponse.json({ error: "Unable to load standings." }, { status: 500 });
  }
}
