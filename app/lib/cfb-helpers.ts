export type Game = {
  id: number;
  startDate: string;
  homeTeam: string;
  awayTeam: string;
  homeRecord: string | null;
  awayRecord: string | null;
  homeConferenceRecord: string | null;
  awayConferenceRecord: string | null;
  homePoints: number | null;
  awayPoints: number | null;
  homeRank: number | null;
  awayRank: number | null;
  completed: boolean;
  live: boolean;
  homeLogo?: string | null;
  awayLogo?: string | null;
  statusDetail?: string | null;
};

export type Milestone = {
  player: string;
  team: string;
  category: string;
  stat: string;
  value: number;
  gameId: number;
  opponent: string;
  message: string;
};

export type UpsetSignal = {
  gameId: number;
  rank: number;
  rankedTeam: string;
  opponent: string;
  result: string;
};

export type SeasonStat = {
  id: string;
  name: string;
  team: string;
  category: string;
  statType: string;
  stat: number;
  type: "individual" | "team";
};

export type PlayerStat = {
  playerId: number;
  player: string;
  team: string;
  category: "passing" | "rushing" | "receiving" | "defensive";
  stat:
    | "YDS"
    | "TD"
    | "INT"
    | "TOT"
    | "SACKS"
    | "TFL"
    | "PD"
    | "FF"
    | "FR";
  value: number;
  gameId: number;
  opponent: string;
};

export type Tier = "S" | "A" | "B" | "C" | "D";

export type Leader = {
  playerId: string;
  player: string;
  team: string;
  value: number;
};

export type BigPerformance = {
  id: string;
  playerId: number;
  player: string;
  team: string;
  reason: string;
  gameId: number;
  opponent: string;
  stats: PlayerStat[];
};

export type StatsMode = "season" | "weekly";

export type WeeklyCategory = {
  id: string;
  name: string;
};

export const tierInfo: Record<Tier, { name: string; emoji: string }> = {
  S: { name: "Must Watch", emoji: "🔥" },
  A: { name: "High Interest", emoji: "👀" },
  B: { name: "Worth Watching", emoji: "📺" },
  C: { name: "Background", emoji: "🟢" },
  D: { name: "Skip", emoji: "⚪" },
};

export const individualCategories = [
  { id: "passing", name: "Passing Yards" },
  { id: "passing-td", name: "Passing TDs" },
  { id: "rushing", name: "Rushing Yards" },
  { id: "rushing-td", name: "Rushing TDs" },
  { id: "receiving", name: "Receiving Yards" },
  { id: "receiving-td", name: "Receiving TDs" },
  { id: "tackles", name: "Tackles" },
  { id: "sacks", name: "Sacks" },
];

export const teamCategories = [
  { id: "total-offense", name: "Total Offense" },
  { id: "rushing-offense", name: "Rushing Offense" },
  { id: "passing-offense", name: "Passing Offense" },
  { id: "scoring-offense", name: "Scoring Offense" },
  { id: "total-defense", name: "Total Defense" },
  { id: "rushing-defense", name: "Rushing Defense" },
  { id: "passing-defense", name: "Passing Defense" },
  { id: "scoring-defense", name: "Scoring Defense" },
  { id: "sacks", name: "Sacks" },
  { id: "turnover-margin", name: "Turnover Margin" },
];

export const weeklyIndividualCategories: WeeklyCategory[] = [
  ...individualCategories,
  { id: "interceptions", name: "Interceptions" },
];

export const weeklyTeamCategories: WeeklyCategory[] = [
  { id: "total-offense", name: "Total Offense" },
  { id: "rushing-offense", name: "Rushing Offense" },
  { id: "passing-offense", name: "Passing Offense" },
  { id: "total-defense", name: "Total Defense" },
  { id: "sacks", name: "Sacks" },
];

export const defensiveCategories = new Set([
  "total-defense",
  "rushing-defense",
  "passing-defense",
  "scoring-defense",
]);

export function getGameStatus(game: Game) {
  if (game.completed) {
    return "FINAL";
  }

  return new Date() >= new Date(game.startDate)
    ? "LIVE"
    : "SCHEDULED";
}

export function formatGameTime(dateString: string) {
  return new Date(dateString).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

export function buildIndividualLeaders(
  stats: SeasonStat[],
  category: string
): Leader[] {
  const categoryMap: Record<
    string,
    { sourceCategory: string; statType: string }
  > = {
    rushing: { sourceCategory: "rushing", statType: "YDS" },
    "rushing-td": { sourceCategory: "rushing", statType: "TD" },
    passing: { sourceCategory: "passing", statType: "YDS" },
    "passing-td": { sourceCategory: "passing", statType: "TD" },
    receiving: { sourceCategory: "receiving", statType: "YDS" },
    "receiving-td": { sourceCategory: "receiving", statType: "TD" },
    tackles: { sourceCategory: "tackles", statType: "TACKLES" },
    sacks: { sourceCategory: "sacks", statType: "SACKS" },
  };

  const selected = categoryMap[category];

  if (!selected) {
    return [];
  }

  return stats
    .filter(
      (stat) =>
        stat.type === "individual" &&
        stat.category === selected.sourceCategory &&
        stat.statType === selected.statType
    )
    .map((stat) => ({
      playerId: String(stat.id),
      player: stat.name,
      team: stat.team,
      value: Number(stat.stat) || 0,
    }))
    .sort((a, b) => b.value - a.value);
}

export function buildTeamLeaders(
  stats: SeasonStat[],
  category: string
): Leader[] {
  const leaders = stats
    .filter((stat) => stat.type === "team" && stat.category === category)
    .map((stat) => ({
      playerId: String(stat.id ?? stat.team),
      player: stat.team,
      team: stat.team,
      value: Number(stat.stat) || 0,
    }));

  return leaders.sort((a, b) => {
    if (defensiveCategories.has(category)) {
      return a.value - b.value;
    }

    return b.value - a.value;
  });
}
export function buildWeeklyIndividualLeaders(
  stats: PlayerStat[],
  category: string
): Leader[] {
  const categoryMap: Record<
    string,
    { sourceCategory: PlayerStat["category"]; stat: PlayerStat["stat"] }
  > = {
    passing: { sourceCategory: "passing", stat: "YDS" },
    "passing-td": { sourceCategory: "passing", stat: "TD" },
    rushing: { sourceCategory: "rushing", stat: "YDS" },
    "rushing-td": { sourceCategory: "rushing", stat: "TD" },
    receiving: { sourceCategory: "receiving", stat: "YDS" },
    "receiving-td": { sourceCategory: "receiving", stat: "TD" },
    tackles: { sourceCategory: "defensive", stat: "TOT" },
    sacks: { sourceCategory: "defensive", stat: "SACKS" },
    interceptions: { sourceCategory: "defensive", stat: "INT" },
  };

  const selected = categoryMap[category];

  if (!selected) {
    return [];
  }

  return stats
    .filter(
      (stat) =>
        // The stats route also includes team defensive totals for the team
        // leaderboard. They have no player ID and must never appear as an
        // individual "leader" (for example, a team showing as 84 tackles).
        Number.isFinite(stat.playerId) &&
        stat.category === selected.sourceCategory &&
        stat.stat === selected.stat
    )
    .map((stat) => ({
      playerId: `${stat.playerId}-${stat.gameId}`,
      player: stat.player,
      team: stat.team,
      value: Number(stat.value) || 0,
    }))
    .sort((a, b) => b.value - a.value);
}

export function buildWeeklyTeamLeaders(
  stats: PlayerStat[],
  category: string
): Leader[] {
  const totals = new Map<string, number>();

  const defensiveStatMap: Record<string, string> = {
    "total-defense": "TOT",
    sacks: "SACKS",
    tfl: "TFL",
    "passes-defended": "PD",
    "defensive-td": "TD",
  };

  for (const stat of stats) {
    const isTeamAggregate = !Number.isFinite(stat.playerId);
    const isOffensive = [
      "total-offense",
      "rushing-offense",
      "passing-offense",
    ].includes(category);

    if (isOffensive) {
      // Offensive team totals are constructed from individual box-score lines.
      // There is no parallel aggregate source for these categories.
      if (isTeamAggregate) {
        continue;
      }

      const matchesTotalOffense =
        category === "total-offense" &&
        ["passing", "rushing"].includes(stat.category);
      const matchesRushingOffense =
        category === "rushing-offense" && stat.category === "rushing";
      const matchesPassingOffense =
        category === "passing-offense" && stat.category === "passing";

      if (
        stat.stat !== "YDS" ||
        !(
          matchesTotalOffense ||
          matchesRushingOffense ||
          matchesPassingOffense
        )
      ) {
        continue;
      }
    } else {
      // Defensive totals arrive directly from ESPN as team aggregates. Using
      // player rows as well would count the same sacks/tackles twice.
      if (!isTeamAggregate) {
        continue;
      }

      if (
        stat.category !== "defensive" ||
        stat.stat !== defensiveStatMap[category]
      ) {
        continue;
      }
    }

    totals.set(
      stat.team,
      (totals.get(stat.team) ?? 0) + Number(stat.value || 0)
    );
  }

  return Array.from(totals.entries())
    .map(([team, value]) => ({
      playerId: `weekly-${category}-${team}`,
      player: team,
      team,
      value,
    }))
    .sort((a, b) => b.value - a.value);
}
export function formatStatValue(category: string, value: number) {
  if (category === "scoring-offense" || category === "scoring-defense") {
    return `${value.toFixed(1)} PPG`;
  }

  if (category === "turnover-margin") {
    return value > 0 ? `+${value}` : String(value);
  }

  if (category === "sacks") {
    return `${value.toLocaleString()} sacks`;
  }

  if (category === "tackles" || category === "total-defense") {
    return `${value.toLocaleString()} tackles`;
  }

  if (category === "interceptions") {
    return `${value.toLocaleString()} INT`;
  }

  if (category === "tfl") {
    return `${value.toLocaleString()} TFL`;
  }

  if (category === "passes-defended") {
    return `${value.toLocaleString()} passes defended`;
  }

  if (category === "defensive-td") {
    return `${value.toLocaleString()} TD`;
  }

  if (
    category === "total-defense" ||
    category === "rushing-defense" ||
    category === "passing-defense"
  ) {
    return `${value.toLocaleString()} YPG`;
  }

  if (
    category === "rushing" ||
    category === "passing" ||
    category === "receiving" ||
    category === "total-offense" ||
    category === "rushing-offense" ||
    category === "passing-offense"
  ) {
    return `${value.toLocaleString()} yards`;
  }

  if (
    category === "rushing-td" ||
    category === "passing-td" ||
    category === "receiving-td"
  ) {
    return `${value.toLocaleString()} TD`;
  }

  return value.toLocaleString();
}

export function getBigPerformanceReason(stats: PlayerStat[]): string | null {
  const passingYards = stats.find(
    (stat) => stat.category === "passing" && stat.stat === "YDS"
  );

  const rushingYards = stats.find(
    (stat) => stat.category === "rushing" && stat.stat === "YDS"
  );

  const receivingYards = stats.find(
    (stat) => stat.category === "receiving" && stat.stat === "YDS"
  );

  const passingTDs = stats.find(
    (stat) => stat.category === "passing" && stat.stat === "TD"
  );

  const rushingTDs = stats.find(
    (stat) => stat.category === "rushing" && stat.stat === "TD"
  );

  const receivingTDs = stats.find(
    (stat) => stat.category === "receiving" && stat.stat === "TD"
  );

  const totalTackles = stats.find(
    (stat) => stat.category === "defensive" && stat.stat === "TOT"
  );

  const sacks = stats.find(
    (stat) => stat.category === "defensive" && stat.stat === "SACKS"
  );

  const tacklesForLoss = stats.find(
    (stat) => stat.category === "defensive" && stat.stat === "TFL"
  );

  const passesDefended = stats.find(
    (stat) => stat.category === "defensive" && stat.stat === "PD"
  );

  const interceptions = stats.find(
    (stat) => stat.category === "defensive" && stat.stat === "INT"
  );

  const forcedFumbles = stats.find(
    (stat) => stat.category === "defensive" && stat.stat === "FF"
  );

  const fumbleRecoveries = stats.find(
    (stat) => stat.category === "defensive" && stat.stat === "FR"
  );

  const defensiveTouchdowns = stats.find(
    (stat) => stat.category === "defensive" && stat.stat === "TD"
  );

  const totalTDs =
    (passingTDs?.value ?? 0) +
    (rushingTDs?.value ?? 0) +
    (receivingTDs?.value ?? 0);

  if ((passingYards?.value ?? 0) >= 400) {
    return `${passingYards?.value} passing yards`;
  }

  if ((rushingYards?.value ?? 0) >= 200) {
    return `${rushingYards?.value} rushing yards`;
  }

  if ((receivingYards?.value ?? 0) >= 200) {
    return `${receivingYards?.value} receiving yards`;
  }

  if (totalTDs >= 4) {
    return `${totalTDs} total touchdowns`;
  }

  if ((defensiveTouchdowns?.value ?? 0) >= 1) {
    return `${defensiveTouchdowns?.value} defensive touchdown`;
  }

  if ((interceptions?.value ?? 0) >= 2) {
    return `${interceptions?.value} interceptions`;
  }

  if ((forcedFumbles?.value ?? 0) >= 2) {
    return `${forcedFumbles?.value} forced fumbles`;
  }

  if ((fumbleRecoveries?.value ?? 0) >= 2) {
    return `${fumbleRecoveries?.value} fumble recoveries`;
  }

  if ((totalTackles?.value ?? 0) >= 10) {
    return `${totalTackles?.value} total tackles`;
  }

  if ((sacks?.value ?? 0) >= 2) {
    return `${sacks?.value} sacks`;
  }

  if ((tacklesForLoss?.value ?? 0) >= 4) {
    return `${tacklesForLoss?.value} tackles for loss`;
  }

  if ((passesDefended?.value ?? 0) >= 4) {
    return `${passesDefended?.value} passes defended`;
  }

  if (
    (totalTackles?.value ?? 0) >= 12 &&
    (tacklesForLoss?.value ?? 0) >= 2
  ) {
    return `${totalTackles?.value} tackles and ${tacklesForLoss?.value} TFL`;
  }

  if (
    (totalTackles?.value ?? 0) >= 10 &&
    (interceptions?.value ?? 0) >= 1
  ) {
    return `${totalTackles?.value} tackles and an interception`;
  }

  if (
    (sacks?.value ?? 0) >= 2 &&
    (tacklesForLoss?.value ?? 0) >= 2
  ) {
    return `${sacks?.value} sacks and ${tacklesForLoss?.value} TFL`;
  }

  if (
    (passesDefended?.value ?? 0) >= 3 &&
    (tacklesForLoss?.value ?? 0) >= 2
  ) {
    return `${passesDefended?.value} passes defended and ${tacklesForLoss?.value} TFL`;
  }

  return null;
}

export function buildBigPerformances(stats: PlayerStat[]): BigPerformance[] {
  const players = new Map<string, PlayerStat[]>();

  for (const stat of stats) {
    const key = `${stat.playerId}-${stat.player}-${stat.team}-${stat.gameId}`;

    if (!players.has(key)) {
      players.set(key, []);
    }

    players.get(key)!.push(stat);
  }

  return Array.from(players.entries())
    .map(([key, playerStats]) => {
      const reason = getBigPerformanceReason(playerStats);

      if (!reason) {
        return null;
      }

      const first = playerStats[0];

      return {
        id: key,
        playerId: first.playerId,
        player: first.player,
        team: first.team,
        reason,
        gameId: first.gameId,
        opponent: first.opponent,
        stats: playerStats,
      };
    })
    .filter(
      (performance): performance is BigPerformance => performance !== null
    );
}
export function formatPlayerStat(stat: PlayerStat) {
  if (stat.stat === "YDS") {
    return `${stat.value} yards`;
  }

  if (stat.stat === "TD") {
    return `${stat.value} TD`;
  }

  if (stat.stat === "INT") {
    return `${stat.value} INT`;
  }

  if (stat.stat === "TOT") {
    return `${stat.value} tackles`;
  }

  if (stat.stat === "SACKS") {
    return `${stat.value} sacks`;
  }

  if (stat.stat === "TFL") {
    return `${stat.value} TFL`;
  }

  if (stat.stat === "PD") {
    return `${stat.value} PD`;
  }

  if (stat.stat === "FF") {
    return `${stat.value} FF`;
  }

  if (stat.stat === "FR") {
    return `${stat.value} FR`;
  }

  return String(stat.value);
}

export function getStatLabel(stat: PlayerStat) {
  const category =
    stat.category.charAt(0).toUpperCase() + stat.category.slice(1);

  if (stat.stat === "YDS") {
    return `${category} Yards`;
  }

  if (stat.stat === "TD") {
    return `${category} TD`;
  }

  if (stat.stat === "INT") {
    return `${category} INT`;
  }

  if (stat.stat === "TOT") {
    return "Total Tackles";
  }

  if (stat.stat === "SACKS") {
    return "Sacks";
  }

  if (stat.stat === "TFL") {
    return "Tackles For Loss";
  }

  if (stat.stat === "PD") {
    return "Passes Defended";
  }

  if (stat.stat === "FF") {
    return "Forced Fumbles";
  }

  if (stat.stat === "FR") {
    return "Fumble Recoveries";
  }

  return `${category} ${stat.stat}`;
}
