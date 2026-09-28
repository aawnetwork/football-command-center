export type Game = {
  id: number;
  startDate: string;
  homeTeam: string;
  awayTeam: string;
  homePoints: number | null;
  awayPoints: number | null;
  homeRank: number | null;
  awayRank: number | null;
  completed: boolean;
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
  stat: "YDS" | "TD" | "INT" | "TOT" | "SACKS" | "TFL" | "PD";
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
  { id: "rushing", name: "Rushing Yards" },
  { id: "rushing-td", name: "Rushing TDs" },
  { id: "passing", name: "Passing Yards" },
  { id: "passing-td", name: "Passing TDs" },
  { id: "receiving", name: "Receiving Yards" },
  { id: "receiving-td", name: "Receiving TDs" },
  { id: "tackles", name: "Total Tackles" },
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
  { id: "rushing", name: "Rushing" },
  { id: "passing", name: "Passing" },
  { id: "receiving", name: "Receiving" },
];

export const weeklyTeamCategories: WeeklyCategory[] = [
  { id: "rushing", name: "Rushing Yards" },
  { id: "passing", name: "Passing Yards" },
  { id: "receiving", name: "Receiving Yards" },
  { id: "tackles", name: "Total Tackles" },
  { id: "sacks", name: "Sacks" },
  { id: "tfl", name: "Tackles For Loss" },
  { id: "passes-defended", name: "Passes Defended" },
  { id: "defensive-td", name: "Defensive TDs" },
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
  return new Date(dateString).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
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
  return stats
    .filter(
      (stat) => stat.category === category && stat.stat === "YDS"
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
    tackles: "TOT",
    sacks: "SACKS",
    tfl: "TFL",
    "passes-defended": "PD",
    "defensive-td": "TD",
  };

  for (const stat of stats) {
    const isOffensive =
      category === "rushing" ||
      category === "passing" ||
      category === "receiving";

    if (isOffensive) {
      if (stat.category !== category || stat.stat !== "YDS") {
        continue;
      }
    } else {
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

  if (category === "tackles") {
    return `${value.toLocaleString()} tackles`;
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

  return `${category} ${stat.stat}`;
}
export function isRivalryGame(game: Game) {
  const normalizeTeam = (team: string) =>
    team
      .toLowerCase()
      .replace(
        /\b(wildcats|buckeyes|wolverines|spartans|fighting irish|trojans|bruins|ducks|huskies|tigers|bulldogs|gators|crimson tide|longhorns|sooners|cowboys|aggies|volunteers|seminoles|hurricanes|tar heels|blue devils|hokies|panthers|orange|eagles|cardinals|knights|owls|pirates|mountaineers|wolfpack|cavaliers|razorbacks|rebels|commodores|volunteers|gamecocks|golden bears|cardinal|beavers|buffaloes|utes|cougars|broncos|bulldogs|red raiders|jayhawks|cyclones|cornhuskers|hawkeyes|badgers|gophers|boilermakers|hoosiers|terrapins|nittany lions)\b/g,
        ""
      )
      .trim();

  const home = normalizeTeam(game.homeTeam);
  const away = normalizeTeam(game.awayTeam);

  return rivalries.find((rivalry) => {
    const [teamA, teamB] = rivalry.teams;

    const a = normalizeTeam(teamA);
    const b = normalizeTeam(teamB);

    return (
      (home === a && away === b) ||
      (home === b && away === a)
    );
  });
}