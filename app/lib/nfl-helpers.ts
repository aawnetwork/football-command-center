import { nflTeamNameByAbbreviation } from "../nfl/data/divisions";

// Shared NFL types and pure helper functions.
// Extracted from app/nfl/page.tsx on [today's date].
// Nothing here touches React state — all pure functions.

export type NFLGame = {
  id: number;
  startDate: string;
  homeTeam: string;
  awayTeam: string;
  homePoints: number | null;
  awayPoints: number | null;
  homeRecord: string | null;
  awayRecord: string | null;
  broadcasts: string[];
  venue: string | null;
  venueCity: string | null;
  venueCountry: string | null;
  completed: boolean;
  status: string;

  importance?: "S" | "A" | "B" | "C";
  importanceReasons?: string[];
};

export type NFLPlayerStat = {
  player_id: string;
  player_display_name: string;
  recent_team: string;
  passing_yards: number;
  passing_tds: number;
  rushing_yards: number;
  rushing_tds: number;
  receiving_yards: number;
  receiving_tds: number;
  tackles: number;
  sacks: number;
  interceptions: number;
};

export type NFLPerformance = NFLPlayerStat & {
  week: number;
  opponent_team: string;
  game_id: string;
  result: string;
  game_score: string;
  team_record: string | null;
  opponent_record: string | null;
};

export type NFLTeamStat = Record<string, string>;

export type StatCategory =
  | "passing"
  | "passing-td"
  | "rushing"
  | "rushing-td"
  | "receiving"
  | "receiving-td"
  | "tackles"
  | "sacks"
  | "interceptions";

export type TeamStatCategory =
  | "total-offense"
  | "rushing-offense"
  | "passing-offense"
  | "scoring-offense"
  | "total-defense"
  | "rushing-defense"
  | "passing-defense"
  | "scoring-defense"
  | "sacks"
  | "turnover-margin";

export type StatsView = "players" | "teams";

export type Tab = "games" | "stats" | "performances" | "standings" | "all-time" | "content";

export type PerformanceWeek = number;

export type StatsMode = "weekly" | "season";

export type NFLTier = "S" | "A" | "B" | "C" | "D";

export const tierInfo: Record<NFLTier, { name: string; emoji: string }> = {
  S: { name: "Must Watch", emoji: "🔥" },
  A: { name: "High Interest", emoji: "👀" },
  B: { name: "Worth Watching", emoji: "📺" },
  C: { name: "Background", emoji: "🟢" },
  D: { name: "Skip", emoji: "⚪" },
};

// ----------------------------------------------------------------
// Pure helpers — copied verbatim from nfl/page.tsx
// ----------------------------------------------------------------

export function formatGameTime(date: string) {
  return new Date(date).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

export function getNflPrimeTimeIndicator(game: NFLGame) {
  const gameDay = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "America/New_York",
  }).format(new Date(game.startDate));

  const broadcasts = game.broadcasts.map((name) =>
    name.toLowerCase()
  );

  if (
    gameDay === "Thursday" &&
    broadcasts.some((name) => name.includes("prime video"))
  ) {
    return {
      label: "📺 THURSDAY NIGHT FOOTBALL",
      color: "#a78bfa",
    };
  }

  if (
    gameDay === "Sunday" &&
    broadcasts.some((name) => name.includes("nbc"))
  ) {
    return {
      label: "🌙 SUNDAY NIGHT FOOTBALL",
      color: "#60a5fa",
    };
  }

  if (
    gameDay === "Monday" &&
    broadcasts.some(
      (name) =>
        name.includes("espn") ||
        name.includes("abc")
    )
  ) {
    return {
      label: "🎙️ MONDAY NIGHT FOOTBALL",
      color: "#fb7185",
    };
  }

  return null;
}

export function getNflInternationalIndicator(game: NFLGame) {
  const country = game.venueCountry?.trim().toLowerCase();
  if (!country || ["united states", "usa", "us", "u.s."].includes(country)) {
    return null;
  }

  const location = [game.venueCity, game.venueCountry].filter(Boolean).join(", ");
  return {
    label: `🌍 INTERNATIONAL GAME${location ? ` · ${location.toUpperCase()}` : ""}`,
    color: "#34d399",
  };
}

export function getNflTeamName(team: string) {
  return nflTeamNameByAbbreviation[team] ?? team;
}

export function getTeamName(team: NFLTeamStat) {
  return team.team ?? "Team";
}

export function getGameImportance(game: NFLGame) {
  const reasons: string[] = [];
  let score = 0;

  const homeWins = Number(game.homeRecord?.split("-")[0] ?? 0);
  const homeLosses = Number(game.homeRecord?.split("-")[1] ?? 0);

  const awayWins = Number(game.awayRecord?.split("-")[0] ?? 0);
  const awayLosses = Number(game.awayRecord?.split("-")[1] ?? 0);

  const homeGames = homeWins + homeLosses;
  const awayGames = awayWins + awayLosses;

  const homeWinPct = homeGames > 0 ? homeWins / homeGames : 0;
  const awayWinPct = awayGames > 0 ? awayWins / awayGames : 0;

  // Undefeated team
  if (
    (homeGames > 0 && homeWinPct === 1) ||
    (awayGames > 0 && awayWinPct === 1)
  ) {
    score += 35;
    reasons.push("Undefeated team");
  }

  // Team with a strong record
  if (homeWinPct >= 0.75 || awayWinPct >= 0.75) {
    score += 25;
    reasons.push("Strong record");
  }

  // Two teams with winning records
  if (homeWinPct > 0.5 && awayWinPct > 0.5) {
    score += 25;
    reasons.push("Winning teams");
  }

  // Two teams with similar records
  if (
    homeGames > 0 &&
    awayGames > 0 &&
    Math.abs(homeWinPct - awayWinPct) <= 0.25
  ) {
    score += 15;
    reasons.push("Competitive matchup");
  }

  if (score >= 50) {
    return { importance: "S" as const, reasons };
  }

  if (score >= 30) {
    return { importance: "A" as const, reasons };
  }

  if (score >= 15) {
    return { importance: "B" as const, reasons };
  }

  return { importance: "C" as const, reasons };
}

export function getContentAngle(performance: NFLPerformance) {
  const totalTds =
    performance.passing_tds +
    performance.rushing_tds +
    performance.receiving_tds;

  if (totalTds >= 5) {
    return "Five-touchdown explosion — major fantasy and highlight content.";
  }

  if (totalTds >= 4) {
    return "Four-touchdown performance — strong highlight and reaction content.";
  }

  if (performance.passing_yards >= 400) {
    return "400+ passing yards — headline quarterback performance.";
  }

  if (performance.rushing_yards >= 200) {
    return "200+ rushing yards — massive ground-game performance.";
  }

  if (performance.receiving_yards >= 200) {
    return "200+ receiving yards — huge receiving performance.";
  }

  if (performance.rushing_yards >= 150) {
    return "150+ rushing yards — standout rushing performance.";
  }

  if (performance.receiving_yards >= 150) {
    return "150+ receiving yards — standout receiving performance.";
  }

  if (performance.tackles >= 15) {
    return "15+ tackles — defensive workhorse performance.";
  }

  if (performance.tackles >= 12) {
    return "12+ tackles — major defensive impact.";
  }

  if (performance.sacks >= 3) {
    return "Three-sack game — dominant pass-rush performance.";
  }

  if (performance.sacks >= 2) {
    return "Multi-sack game — strong defensive highlight.";
  }

  return "Notable individual NFL performance.";
}

export function getPerformanceScore(performance: NFLPerformance) {
  return (
    performance.passing_yards +
    performance.rushing_yards +
    performance.receiving_yards +
    (performance.passing_tds +
      performance.rushing_tds +
      performance.receiving_tds) *
      50 +
    performance.tackles * 10 +
    performance.sacks * 25
  );
}

export function getRecordWinPercentage(record: string | null) {
  if (!record) {
    return null;
  }

  const parts = record.split("-").map((part) => Number(part));

  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const wins = parts[0];
  const losses = parts[1];
  const ties = parts[2] ?? 0;

  const games = wins + losses + ties;

  if (games === 0) {
    return null;
  }

  return (wins + ties * 0.5) / games;
}

export function isStatementWin(performance: NFLPerformance) {
  if (performance.result !== "W") {
    return false;
  }

  const teamWinPercentage = getRecordWinPercentage(performance.team_record);
  const opponentWinPercentage = getRecordWinPercentage(
    performance.opponent_record
  );

  if (teamWinPercentage === null || opponentWinPercentage === null) {
    return false;
  }

  return opponentWinPercentage > teamWinPercentage;
}
