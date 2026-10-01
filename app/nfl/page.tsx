"use client";

import { useEffect, useMemo, useState } from "react";
import { NflAllTimePanel } from "../features/all-time/NflAllTimePanel";
import { ContentPanel } from "../features/content/ContentPanel";
import { NflGamesGrid } from "../features/games/NflGamesGrid";
import { StandingsPanel } from "../features/standings/StandingsPanel";
import { NflPerformanceCard } from "../features/performances/NflPerformanceCard";
import {
  PerformancePositionControls,
  type PerformancePosition,
} from "../features/performances/PerformancePositionControls";
import { StatsLeaderboardTable } from "../features/stats/StatsLeaderboardTable";
import { StatsPanelControls } from "../features/stats/StatsPanelControls";
import type { BroadcastAvailability } from "../lib/broadcast-availability";
import { getScoreboardRefreshDelay } from "../lib/scoreboard-refresh";

import {
  tierInfo,
  getTeamName,
  getContentAngle,
  getNflTeamName,
  getPerformanceScore,
  getRecordWinPercentage,
  isStatementWin,
} from "../lib/nfl-helpers";
import type {
  NFLGame,
  NFLPlayerStat,
  NFLPerformance,
  NFLTeamStat,
  StatCategory,
  TeamStatCategory,
  StatsView,
  Tab,
  PerformanceWeek,
  StatsMode,
  NFLTier,
} from "../lib/nfl-helpers";

export default function NFLPage() {
  const [games, setGames] =
    useState<NFLGame[]>([]);

  const [stats, setStats] =
    useState<NFLPlayerStat[]>([]);

  const [performances, setPerformances] =
    useState<NFLPerformance[]>([]);

  const [teamStats, setTeamStats] =
    useState<NFLTeamStat[]>([]);

  const [loading, setLoading] =
    useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [broadcastAvailability, setBroadcastAvailability] = useState<Record<number, BroadcastAvailability["platforms"]>>({});
  const gameIds = games.map((game) => game.id).join(",");

  const [statsLoading, setStatsLoading] =
    useState(false);

  const [performancesLoading, setPerformancesLoading] =
    useState(false);

  const [activeTab, setActiveTab] =
    useState<Tab>("games");

  const [gameTiers, setGameTiers] = useState<Record<number, NFLTier>>({});
  const [gameTiersLoaded, setGameTiersLoaded] = useState(false);
  const [selectedGameTier, setSelectedGameTier] = useState<"ALL" | NFLTier>(
    "ALL"
  );
  const [selectedGameWeek, setSelectedGameWeek] = useState<number | null>(
    null
  );
  const [currentGameWeek, setCurrentGameWeek] = useState<number | null>(
    null
  );

  const [performanceWeek, setPerformanceWeek] =
    useState<PerformanceWeek>(1);
  const [performancePosition, setPerformancePosition] =
    useState<PerformancePosition>("all");

  const latestPerformanceWeek =
    Math.max(
      1,
      ...performances.map(
        (performance) => performance.week
      )
    );

  useEffect(() => {
    if (performances.length > 0) {
      setPerformanceWeek(latestPerformanceWeek);
    }
  }, [latestPerformanceWeek, performances.length]);

  const [statsView, setStatsView] =
    useState<StatsView>("players");

  const [statsMode, setStatsMode] = useState<StatsMode>("weekly");
  const [statsWeek, setStatsWeek] = useState<number | null>(null);
  const [availableStatsWeeks, setAvailableStatsWeeks] = useState<number[]>([]);

  const [statCategory, setStatCategory] =
    useState<StatCategory>("passing");

  const [teamStatCategory, setTeamStatCategory] =
    useState<TeamStatCategory>(
      "total-offense"
    );

  function changeStatsMode(mode: StatsMode) {
    setStatsMode(mode);

    if (mode === "weekly" && statsView === "teams") {
      setTeamStatCategory("total-offense");
    }
  }

  function changeStatsView(view: StatsView) {
    setStatsView(view);

    if (view === "teams") {
      setTeamStatCategory("total-offense");
    }
  }

  const [allTimeView, setAllTimeView] = useState<"individual" | "team">(
    "individual"
  );
  const [allTimePeriod, setAllTimePeriod] = useState<
    "career" | "season" | "single-game"
  >("career");

  useEffect(() => {
    const savedTiers = localStorage.getItem("nfl-game-tiers");
    let restoreTimer: number | undefined;

    if (savedTiers) {
      try {
        const parsedTiers: unknown = JSON.parse(savedTiers);

        if (parsedTiers && typeof parsedTiers === "object") {
          restoreTimer = window.setTimeout(() => {
            setGameTiers(parsedTiers as Record<number, NFLTier>);
          }, 0);
        }
      } catch {
        localStorage.removeItem("nfl-game-tiers");
      }
    }

    setGameTiersLoaded(true);

    return () => {
      if (restoreTimer !== undefined) {
        window.clearTimeout(restoreTimer);
      }
    };
  }, []);

  useEffect(() => {
    if (!gameTiersLoaded) {
      return;
    }

    localStorage.setItem("nfl-game-tiers", JSON.stringify(gameTiers));
  }, [gameTiers, gameTiersLoaded]);

  useEffect(() => {
    if (activeTab !== "games") {
      return;
    }

    let cancelled = false;
    let refreshTimer: number | undefined;

    function scheduleRefresh(gamesData: NFLGame[]) {
      const delay = getScoreboardRefreshDelay(gamesData);

      if (delay !== null) {
        refreshTimer = window.setTimeout(() => {
          void loadGames(false);
        }, delay);
      }
    }

    async function loadGames(initialLoad: boolean) {
      if (initialLoad) {
        setLoading(true);
      }

      setGamesError(null);

      try {
        const response = await fetch(
          selectedGameWeek === null
            ? "/api/nfl/scoreboard"
            : `/api/nfl/scoreboard?week=${selectedGameWeek}`
        );

        if (!response.ok) {
          throw new Error(
            "Failed to load NFL games"
          );
        }

        const data = await response.json();
        const gamesData = Array.isArray(data) ? data : data.games ?? [];

        if (cancelled) {
          return;
        }

        if (
          !Array.isArray(data) &&
          data.week != null &&
          selectedGameWeek === null
        ) {
          setCurrentGameWeek(data.week);
          setSelectedGameWeek(data.week);
        }

        const preparedGames = gamesData.map((game: NFLGame) => {
          const importance = getGameImportance(game);

          return {
            ...game,
            importance: importance.importance,
            importanceReasons: importance.reasons,
          };
        });

        setGames(preparedGames);
        scheduleRefresh(preparedGames);
      } catch (error) {
        if (!cancelled) {
          console.error(
            "NFL games error:",
            error
          );
          setGamesError(
            "Live NFL games are temporarily unavailable. We’ll retry automatically."
          );
          refreshTimer = window.setTimeout(() => {
            void loadGames(false);
          }, 60_000);
        }
      } finally {
        if (!cancelled && initialLoad) {
          setLoading(false);
        }
      }
    }

    void loadGames(true);

    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer);
      }
    };
  }, [activeTab, selectedGameWeek]);

  useEffect(() => {
    if (!games.length) {
      setBroadcastAvailability({});
      return;
    }

    let cancelled = false;
    fetch(`/api/broadcast-availability?league=NFL&gameIds=${gameIds}`)
      .then((response) => response.ok ? response.json() : { availability: [] })
      .then((data: { availability?: BroadcastAvailability[] }) => {
        if (!cancelled) {
          setBroadcastAvailability(Object.fromEntries((data.availability ?? []).map((entry) => [entry.gameId, entry.platforms])));
        }
      })
      .catch(() => {
        if (!cancelled) setBroadcastAvailability({});
      });

    return () => {
      cancelled = true;
    };
  }, [gameIds]);

  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true);

      try {
        const playerResponse =
          await fetch(
            `/api/nfl/stats?mode=${statsMode}${
              statsMode === "weekly" && statsWeek ? `&week=${statsWeek}` : ""
            }`
          );

        if (!playerResponse.ok) {
          throw new Error(
            "Failed to load NFL player stats"
          );
        }

        const playerData =
          await playerResponse.json();

        setStats(
          playerData.stats ?? []
        );
        setAvailableStatsWeeks(playerData.availableWeeks ?? []);
        setStatsWeek((currentWeek) => {
          if (statsMode !== "weekly") {
            return null;
          }

          const weeks = playerData.availableWeeks ?? [];
          if (currentWeek && weeks.includes(currentWeek)) {
            return currentWeek;
          }

          return playerData.week ?? weeks.at(-1) ?? null;
        });

        const teamResponse =
          await fetch(
            `/api/nfl/team-stats?mode=${statsMode}${playerData.week ? `&week=${playerData.week}` : ""}`
          );

        if (!teamResponse.ok) {
          throw new Error(
            "Failed to load NFL team stats"
          );
        }

        const teamData =
          await teamResponse.json();

        setTeamStats(
          teamData.stats ?? []
        );
      } catch (error) {
        console.error(
          "NFL stats error:",
          error
        );
      } finally {
        setStatsLoading(false);
      }
    }

    if (activeTab !== "stats") {
      return;
    }

    loadStats();

    const interval = setInterval(loadStats, 30000);

    return () => clearInterval(interval);
  }, [activeTab, statsMode, statsWeek]);

  useEffect(() => {
    async function loadPerformances() {
      try {
        const response =
          await fetch(
            "/api/nfl/performances"
          );

        if (!response.ok) {
          throw new Error(
            "Failed to load NFL performances"
          );
        }

        const data =
          await response.json();

        setPerformances(
          data.performances ?? []
        );

      } catch (error) {
        console.error(
          "NFL performances error:",
          error
        );
      } finally {
        setPerformancesLoading(false);
      }
    }

    if (
      activeTab ===
      "performances"
    ) {
      setPerformancesLoading(true);
      loadPerformances();
      const interval = window.setInterval(loadPerformances, 30_000);
      return () => window.clearInterval(interval);
    }
  }, [activeTab]);

  function formatGameTime(
    date: string
  ) {
    return new Date(
      date
    ).toLocaleString(
      "en-GB",
      {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  }

  function setGameTier(gameId: number, tier: NFLTier) {
    setGameTiers((current) => {
      const next = { ...current };

      if (next[gameId] === tier) {
        delete next[gameId];
      } else {
        next[gameId] = tier;
      }

      return next;
    });
  }

  function clearGameTiers() {
    setGameTiers({});
    setSelectedGameTier("ALL");
  }

  const filteredGames = useMemo(() => {
    if (selectedGameTier === "ALL") {
      return games;
    }

    return games.filter((game) => gameTiers[game.id] === selectedGameTier);
  }, [games, gameTiers, selectedGameTier]);

  function getStatValue(
    player: NFLPlayerStat
  ) {
    switch (statCategory) {
      case "passing":
        return player.passing_yards;

      case "passing-td":
        return player.passing_tds;

      case "rushing":
        return player.rushing_yards;

      case "rushing-td":
        return player.rushing_tds;

      case "receiving":
        return player.receiving_yards;

      case "receiving-td":
        return player.receiving_tds;

      case "tackles":
        return player.tackles;

      case "sacks":
        return player.sacks;

      case "interceptions":
        return player.interceptions;

      default:
        return 0;
    }
  }

  function getStatLabel() {
    switch (statCategory) {
      case "passing":
        return "Passing Yards";

      case "passing-td":
        return "Passing TDs";

      case "rushing":
        return "Rushing Yards";

      case "rushing-td":
        return "Rushing TDs";

      case "receiving":
        return "Receiving Yards";

      case "receiving-td":
        return "Receiving TDs";

      case "tackles":
        return "Tackles";

      case "sacks":
        return "Sacks";

      case "interceptions":
        return "Interceptions";

      default:
        return "";
    }
  }

  function getTeamName(
    team: NFLTeamStat
  ) {
    return getNflTeamName(team.team ?? "Team");
  }

  function getTeamStatValue(
    team: NFLTeamStat
  ) {
    switch (teamStatCategory) {
      case "total-offense":
        return (
          Number(
            team.passing_yards ?? 0
          ) +
          Number(
            team.rushing_yards ?? 0
          )
        );

      case "passing-offense":
        return Number(
          team.passing_yards ?? 0
        );

      case "rushing-offense":
        return Number(
          team.rushing_yards ?? 0
        );

      case "scoring-offense": {
        if (team.points !== undefined) {
          return Number(team.points);
        }

        const passingTds =
          Number(
            team.passing_tds ?? 0
          );

        const rushingTds =
          Number(
            team.rushing_tds ?? 0
          );

        const specialTeamsTds =
          Number(
            team.special_teams_tds ??
              0
          );

        const defensiveTds =
          Number(
            team.def_tds ?? 0
          );

        const fumbleRecoveryTds =
          Number(
            team.fumble_recovery_tds ??
              0
          );

        const passingTwoPoint =
          Number(
            team.passing_2pt_conversions ??
              0
          );

        const rushingTwoPoint =
          Number(
            team.rushing_2pt_conversions ??
              0
          );

        const defensiveTwoPoint =
          Number(
            team.def_2pt_made ?? 0
          );

        const patMade =
          Number(
            team.pat_made ?? 0
          );

        const fieldGoals =
          Number(
            team.fg_made ?? 0
          );

        return (
          (passingTds +
            rushingTds +
            specialTeamsTds +
            defensiveTds +
            fumbleRecoveryTds) *
            6 +
          (passingTwoPoint +
            rushingTwoPoint +
            defensiveTwoPoint) *
            2 +
          patMade +
          fieldGoals * 3
        );
      }

      case "total-defense": {
        const passingDefense = Number(team.def_passing_yards ?? 0);
        const rushingDefense = Number(team.def_rushing_yards ?? 0);

        return passingDefense || rushingDefense
          ? passingDefense + rushingDefense
          : Number(team.def_tackles_solo ?? 0) + Number(team.def_tackle_assists ?? 0);
      }

      case "rushing-defense":
        return Number(team.def_rushing_yards ?? 0);

      case "passing-defense":
        return Number(team.def_passing_yards ?? 0);

      case "scoring-defense":
        return Number(team.def_points ?? 0);

      case "sacks":
        return Number(
          team.def_sacks ?? 0
        );

      case "turnover-margin": {
        const takeaways =
          Number(
            team.def_interceptions ??
              0
          ) +
          Number(
            team.fumble_recovery_opp ??
              0
          );

        const giveaways =
          Number(
            team.passing_interceptions ??
              0
          ) +
          Number(
            team.fumbles_lost_total ??
              0
          );

        return (
          takeaways -
          giveaways
        );
      }

      default:
        return 0;
    }
  }

  function getTeamStatLabel() {
    switch (teamStatCategory) {
      case "total-offense":
        return "Total Yards";

      case "passing-offense":
        return "Passing Yards";

      case "rushing-offense":
        return "Rushing Yards";

      case "scoring-offense":
        return "Points";

      case "total-defense":
        return "Total Yards Allowed";

      case "rushing-defense":
        return "Rushing Yards Allowed";

      case "passing-defense":
        return "Passing Yards Allowed";

      case "scoring-defense":
        return "Points Allowed";

      case "sacks":
        return "Sacks";

      case "turnover-margin":
        return "Turnover Margin";

      default:
        return "Team Stat";
    }
  }

  function getTeamCategoryName() {
    switch (teamStatCategory) {
      case "total-offense":
        return "Total Offense";
      case "rushing-offense":
        return "Rushing Offense";
      case "passing-offense":
        return "Passing Offense";
      case "scoring-offense":
        return "Scoring Offense";
      case "total-defense":
        return "Total Defense";
      case "rushing-defense":
        return "Rushing Defense";
      case "passing-defense":
        return "Passing Defense";
      case "scoring-defense":
        return "Scoring Defense";
      case "sacks":
        return "Sacks";
      case "turnover-margin":
        return "Turnover Margin";
    }
  }
function getGameImportance(game: NFLGame) {
  const reasons: string[] = [];
  let score = 0;

  const homeWins = Number(
    game.homeRecord?.split("-")[0] ?? 0
  );
  const homeLosses = Number(
    game.homeRecord?.split("-")[1] ?? 0
  );

  const awayWins = Number(
    game.awayRecord?.split("-")[0] ?? 0
  );
  const awayLosses = Number(
    game.awayRecord?.split("-")[1] ?? 0
  );

  const homeGames = homeWins + homeLosses;
  const awayGames = awayWins + awayLosses;

  const homeWinPct =
    homeGames > 0 ? homeWins / homeGames : 0;

  const awayWinPct =
    awayGames > 0 ? awayWins / awayGames : 0;

  // Undefeated team
  if (
    (homeGames > 0 && homeWinPct === 1) ||
    (awayGames > 0 && awayWinPct === 1)
  ) {
    score += 35;
    reasons.push("Undefeated team");
  }

  // Team with a strong record
  if (
    homeWinPct >= 0.75 ||
    awayWinPct >= 0.75
  ) {
    score += 25;
    reasons.push("Strong record");
  }

  // Two teams with winning records
  if (
    homeWinPct > 0.5 &&
    awayWinPct > 0.5
  ) {
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
    return {
      importance: "S" as const,
      reasons,
    };
  }

  if (score >= 30) {
    return {
      importance: "A" as const,
      reasons,
    };
  }

  if (score >= 15) {
    return {
      importance: "B" as const,
      reasons,
    };
  }

  return {
    importance: "C" as const,
    reasons,
  };
}
function getPerformanceReason(
  performance: NFLPerformance
) {
  const reasons: string[] = [];

  const totalTds =
    performance.passing_tds +
    performance.rushing_tds +
    performance.receiving_tds;

  if (performance.passing_yards >= 400) {
    reasons.push(
      `${performance.passing_yards.toLocaleString()} passing yards`
    );
  }

  if (performance.rushing_yards >= 150) {
    reasons.push(
      `${performance.rushing_yards.toLocaleString()} rushing yards`
    );
  }

  if (performance.receiving_yards >= 150) {
    reasons.push(
      `${performance.receiving_yards.toLocaleString()} receiving yards`
    );
  }

  if (totalTds >= 3) {
    reasons.push(`${totalTds} total TDs`);
  }

  if (performance.tackles >= 12) {
    reasons.push(`${performance.tackles} tackles`);
  }

  if (performance.sacks >= 2) {
    reasons.push(`${performance.sacks} sacks`);
  }

  return reasons.join(" • ");
}
  function getContentAngle(
    performance: NFLPerformance
  ) {
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

    if (
      performance.rushing_yards >= 150
    ) {
      return "150+ rushing yards — standout rushing performance.";
    }

    if (
      performance.receiving_yards >= 150
    ) {
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

  function getPerformanceScore(
    performance: NFLPerformance
  ) {
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

  function getRecordWinPercentage(
    record: string | null
  ) {
    if (!record) {
      return null;
    }

    const parts =
      record
        .split("-")
        .map((part) =>
          Number(part)
        );

    if (
      parts.length < 2 ||
      parts.some(
        (part) =>
          !Number.isFinite(part)
      )
    ) {
      return null;
    }

    const wins = parts[0];
    const losses = parts[1];
    const ties = parts[2] ?? 0;

    const games =
      wins +
      losses +
      ties;

    if (games === 0) {
      return null;
    }

    return (
      (wins + ties * 0.5) /
      games
    );
  }

  function isStatementWin(
    performance: NFLPerformance
  ) {
    if (
      performance.result !==
      "W"
    ) {
      return false;
    }

    const teamWinPercentage =
      getRecordWinPercentage(
        performance.team_record
      );

    const opponentWinPercentage =
      getRecordWinPercentage(
        performance.opponent_record
      );

    if (
      teamWinPercentage ===
        null ||
      opponentWinPercentage ===
        null
    ) {
      return false;
    }

    return (
      opponentWinPercentage >
      teamWinPercentage
    );
  }

  const sortedStats = [...stats]
    .filter(
      (player) =>
        getStatValue(player) > 0
    )
    .sort(
      (a, b) =>
        getStatValue(b) -
        getStatValue(a)
    )
    .slice(0, 10);

  const sortedTeamStats =
    [...teamStats]
      .filter((team) => {
        const value =
          getTeamStatValue(team);

        return Number.isFinite(
          value
        );
      })
      .sort(
        (a, b) => {
          const ascendingCategories: TeamStatCategory[] = [
            "total-defense",
            "rushing-defense",
            "passing-defense",
            "scoring-defense",
          ];

          return ascendingCategories.includes(teamStatCategory)
            ? getTeamStatValue(a) - getTeamStatValue(b)
            : getTeamStatValue(b) - getTeamStatValue(a);
        }
      )
      .slice(0, 10);

  const statsLeaderboardRows =
    statsView === "players"
      ? sortedStats.map((player) => {
          const value = getStatValue(player);
          const valueLabel =
            statCategory.endsWith("-td")
              ? `${value} TD`
              : statCategory === "tackles"
                ? `${value} tackles`
              : statCategory === "sacks"
                ? `${value} sacks`
                : statCategory === "interceptions"
                  ? `${value} INT`
                : `${value.toLocaleString()} yards`;

          return {
            id: player.player_id,
            name: player.player_display_name,
            team: getNflTeamName(player.recent_team),
            value: valueLabel,
          };
        })
      : sortedTeamStats.map((team) => {
          const value = getTeamStatValue(team);
          const valueLabel =
        teamStatCategory === "scoring-offense" ||
        teamStatCategory === "scoring-defense"
              ? String(value)
              : teamStatCategory === "sacks"
                ? `${value} sacks`
                : teamStatCategory === "turnover-margin"
                  ? value > 0
                    ? `+${value}`
                    : String(value)
                  : `${value.toLocaleString()} yards`;

          return {
            id: getTeamName(team),
            name: getTeamName(team),
            value: valueLabel,
          };
        });

  const filteredPerformances =
    [...performances]
      .filter(
        (performance) =>
          performance.week >= 1 &&
          performance.week <= latestPerformanceWeek
      )
      .filter(
        (performance) =>
          getPerformanceReason(
            performance
          ).length > 0
      )
      .filter(
        (performance) =>
          performance.week ===
            performanceWeek
      )
      .filter((performance) => {
        if (performancePosition === "all") {
          return true;
        }

        if (performancePosition === "qb") {
          return (
            performance.passing_yards > 0 ||
            performance.passing_tds > 0
          );
        }

        if (performancePosition === "rb") {
          return (
            performance.rushing_yards > 0 ||
            performance.rushing_tds > 0
          );
        }

        if (performancePosition === "wr") {
          return (
            performance.receiving_yards > 0 ||
            performance.receiving_tds > 0
          );
        }

        const hasOffensiveStats =
          performance.passing_yards > 0 ||
          performance.passing_tds > 0 ||
          performance.rushing_yards > 0 ||
          performance.rushing_tds > 0 ||
          performance.receiving_yards > 0 ||
          performance.receiving_tds > 0;

        return (
          !hasOffensiveStats &&
          (performance.tackles > 0 ||
            performance.sacks > 0)
        );
      })
      .sort((a, b) => {
        if (
          a.week !==
          b.week
        ) {
          return b.week - a.week;
        }

        return (
          getPerformanceScore(
            b
          ) -
          getPerformanceScore(
            a
          )
        );
      });

  return (
    <main
      className="command-center command-center--nfl"
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#f8fafc",
        padding: "40px 24px",
      }}
    >
      <div
        className="command-center__container"
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <header
          className="command-center__header"
          style={{
            marginBottom: "32px",
          }}
        >
          <div>
            <div className="command-center__eyebrow">
              FOOTBALL DESK
            </div>
            <h1 className="command-center__title">NFL</h1>
            <p className="command-center__subtitle">
              Sunday football intelligence.
            </p>
          </div>
          <div className="command-center__header-brand">
            <div
              className="command-center__brand-logo"
              role="img"
              aria-label="AAW Network"
            />
            <div className="command-center__source">
              Live data powered by ESPN & nflverse
            </div>
          </div>
        </header>

        <nav
          className="command-center__nav"
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "32px",
            borderBottom:
              "1px solid #1e293b",
            paddingBottom: "12px",
          }}
        >
          {(
            [
              ["games", "🏈 Games"],
["performances", "🔥 Performances"],
["stats", "📊 Stats"],
["standings", "📋 Standings"],
["all-time", "🏆 All-Time"],
["content", "🚨 Content"],
            ] as [Tab, string][]
          ).map(
            ([tab, label]) => (
              <button
                key={tab}
                aria-pressed={activeTab === tab}
                onClick={() =>
                  setActiveTab(tab)
                }
                style={{
                  padding:
                    "10px 18px",
                  borderRadius: "8px",
                  border:
                    "1px solid",
                  borderColor:
                    activeTab === tab
                      ? "#ef4444"
                      : "#334155",
                  background:
                    activeTab === tab
                      ? "#3f0d12"
                      : "#0f172a",
                  color:
                    activeTab === tab
                      ? "#fca5a5"
                      : "#94a3b8",
                  fontWeight: 900,
                  cursor:
                    "pointer",
                }}
              >
                {label}
              </button>
            )
          )}
        </nav>

        {activeTab === "games" && (
          <section>
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems: "center",
                marginBottom: "20px",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "28px",
                    fontWeight: 900,
                  }}
                >
                  Games
                </h2>

                <p
                  style={{
                    margin:
                      "6px 0 0",
                    color: "#64748b",
                  }}
                >
                  Live NFL scoreboard
                </p>
              </div>

              <div
                style={{
                  color: "#64748b",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                Updates every 30 seconds
              </div>
            </div>

            {currentGameWeek !== null && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "20px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    color: "#f8fafc",
                  }}
                >
                  Week:
                </span>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  {Array.from({ length: currentGameWeek }, (_, index) => {
                    const week = index + 1;

                    return (
                      <button
                        key={week}
                        type="button"
                        onClick={() => setSelectedGameWeek(week)}
                        style={{
                          padding: "10px 16px",
                          borderRadius: "8px",
                          border: "1px solid",
                          borderColor:
                            selectedGameWeek === week
                              ? "#ffc720"
                              : "#334155",
                          background:
                            selectedGameWeek === week
                              ? "#ffc7202e"
                              : "#0f172a",
                          color:
                            selectedGameWeek === week
                              ? "#ffffff"
                              : "#94a3b8",
                          fontWeight: 900,
                          cursor: "pointer",
                        }}
                      >
                        Week {week}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                marginBottom: "20px",
              }}
            >
              <button
                aria-pressed={selectedGameTier === "ALL"}
                onClick={() => setSelectedGameTier("ALL")}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #334155",
                  background:
                    selectedGameTier === "ALL" ? "#334155" : "#0f172a",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                All Games
              </button>

              {(Object.keys(tierInfo) as NFLTier[]).map((tier) => (
                <button
                  key={tier}
                  aria-pressed={selectedGameTier === tier}
                  onClick={() => setSelectedGameTier(tier)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid #334155",
                    background:
                      selectedGameTier === tier
                        ? tier === "S"
                          ? "#7f1d1d"
                          : tier === "A"
                            ? "#78350f"
                            : tier === "B"
                              ? "#1e3a8a"
                              : tier === "C"
                                ? "#14532d"
                                : "#334155"
                        : "#0f172a",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {tierInfo[tier].emoji} {tier}
                </button>
              ))}
              <button
                onClick={clearGameTiers}
                disabled={Object.keys(gameTiers).length === 0}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #475569",
                  background: "transparent",
                  color: Object.keys(gameTiers).length === 0 ? "#64748b" : "#cbd5e1",
                  cursor: Object.keys(gameTiers).length === 0 ? "not-allowed" : "pointer",
                  fontWeight: 700,
                }}
              >
                Clear selections
              </button>
            </div>

            {gamesError ? (
              <div
                style={{
                  padding: "32px",
                  borderRadius: "16px",
                  background: "#0f172a",
                  border: "1px solid #7f1d1d",
                  color: "#fca5a5",
                }}
              >
                {gamesError}
              </div>
            ) : loading ? (
              <div
                style={{
                  padding: "32px",
                  borderRadius: "16px",
                  background:
                    "#0f172a",
                  border:
                    "1px solid #334155",
                  color:
                    "#94a3b8",
                }}
              >
                Loading NFL games...
              </div>
            ) : games.length ===
              0 ? (
              <div
                style={{
                  padding: "32px",
                  borderRadius: "16px",
                  background:
                    "#0f172a",
                  border:
                    "1px solid #334155",
                  color:
                    "#94a3b8",
                }}
              >
                No NFL games found.
              </div>
            ) : filteredGames.length === 0 ? (
              <div
                style={{
                  padding: "24px",
                  borderRadius: "12px",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  color: "#94a3b8",
                }}
              >
                No games have been marked {selectedGameTier} yet.
              </div>
            ) : (
              <NflGamesGrid
                games={filteredGames}
                gameTiers={gameTiers}
                broadcastAvailability={broadcastAvailability}
                onSetTier={setGameTier}
              />
            )}
          </section>
        )}

        {activeTab === "performances" && (
          <section>
            <div
              style={{
                marginBottom:
                  "24px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "28px",
                  fontWeight: 900,
                }}
              >
                Player Performances
              </h2>

              <p
                style={{
                  margin:
                    "6px 0 0",
                  color:
                    "#64748b",
                }}
              >
                Notable individual performances from the current NFL season.
              </p>
            </div>

            <div
              style={{
                display:
                  "flex",
                gap: "8px",
                flexWrap:
                  "wrap",
                marginBottom:
                  "28px",
              }}
            >
              {Array.from(
                { length: latestPerformanceWeek },
                (_, index) => index + 1
              ).map(
                (week) => (
                  <button
                    key={String(week)}
                    onClick={() => setPerformanceWeek(week)}
                    style={{
                      padding:
                        "10px 16px",
                      borderRadius:
                        "8px",
                      border:
                        "1px solid",
                      borderColor:
                        performanceWeek ===
                        week
                          ? "#ffc720"
                          : "#334155",
                      background:
                        performanceWeek ===
                        week
                          ? "#ffc7202e"
                          : "#0f172a",
                      color:
                        performanceWeek ===
                        week
                          ? "#ffffff"
                          : "#94a3b8",
                      fontWeight:
                        900,
                      cursor:
                        "pointer",
                    }}
                  >
                    Week {week}
                  </button>
                )
              )}
            </div>

            <PerformancePositionControls
              value={performancePosition}
              onChange={setPerformancePosition}
            />

            {performancesLoading ? (
              <div
                style={{
                  padding: "32px",
                  borderRadius: "16px",
                  background:
                    "#0f172a",
                  border:
                    "1px solid #334155",
                  color:
                    "#94a3b8",
                }}
              >
                Loading NFL performances...
              </div>
            ) : filteredPerformances.length ===
              0 ? (
              <div
                style={{
                  padding: "32px",
                  borderRadius: "16px",
                  background:
                    "#0f172a",
                  border:
                    "1px solid #334155",
                  color:
                    "#94a3b8",
                }}
              >
                No notable performances found for this week.
              </div>
            ) : (
              <div
                style={{
                  display:
                    "grid",
                  gap: "28px",
                }}
              >
                {Array.from(
                  {
                    length:
                      latestPerformanceWeek,
                  },
                  (_, index) =>
                    latestPerformanceWeek -
                    index
                )
                  .filter(
                    (week) => performanceWeek === week
                  )
                  .map(
                    (week) => {
                      const weekPerformances =
                        filteredPerformances.filter(
                          (
                            performance
                          ) =>
                            performance.week ===
                            week
                        );

                      if (
                        weekPerformances.length ===
                        0
                      ) {
                        return null;
                      }

                      return (
                        <section
                          key={week}
                        >
                          <div
                            style={{
                              display:
                                "grid",
                              gap:
                                "16px",
                            }}
                          >
                            {weekPerformances.map(
                              (performance, index) => (
                                <NflPerformanceCard
                                  key={`${performance.player_id}-${performance.week}-${index}`}
                                  performance={performance}
                                  contentAngle={getContentAngle(performance)}
                                />
                              )
                            )}

                            {false && weekPerformances.map(
                              (
                                performance,
                                index
                              ) => (
                                <article
                                  key={`${performance.player_id}-${performance.week}-${index}`}
                                  style={{
                                    padding:
                                      "24px",
                                    borderRadius:
                                      "16px",
                                    background:
                                      "#0f172a",
                                    border:
                                      "1px solid #334155",
                                  }}
                                >
                                  <div
                                    style={{
                                      display:
                                        "flex",
                                      justifyContent:
                                        "space-between",
                                      alignItems:
                                        "flex-start",
                                      gap:
                                        "16px",
                                      flexWrap:
                                        "wrap",
                                    }}
                                  >
                                    <div>
                                      <div
                                        style={{
                                          fontSize:
                                            "22px",
                                          fontWeight:
                                            900,
                                        }}
                                      >
                                        {
                                          performance.player_display_name
                                        }
                                      </div>

                                      {isStatementWin(
                                        performance
                                      ) && (
                                        <div
                                          style={{
                                            display:
                                              "inline-block",
                                            marginTop:
                                              "8px",
                                            padding:
                                              "5px 9px",
                                            borderRadius:
                                              "999px",
                                            background:
                                              "#7c2d12",
                                            color:
                                              "#fed7aa",
                                            fontSize:
                                              "11px",
                                            fontWeight:
                                              900,
                                            letterSpacing:
                                              "0.05em",
                                          }}
                                        >
                                          🔥 STATEMENT WIN
                                        </div>
                                      )}

                                      <div
                                        style={{
                                          color:
                                            "#64748b",
                                          fontSize:
                                            "13px",
                                          marginTop:
                                            "4px",
                                        }}
                                      >
                                        {
                                          performance.recent_team
                                        }
                                      </div>
                                    </div>

                                    <div
                                      style={{
                                        padding:
                                          "8px 12px",
                                        borderRadius:
                                          "999px",
                                        background:
                                          "#3f0d12",
                                        color:
                                          "#fca5a5",
                                        fontSize:
                                          "12px",
                                        fontWeight:
                                          900,
                                      }}
                                    >
                                      🔥 BIG GAME
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      display:
                                        "grid",
                                      gridTemplateColumns:
                                        "repeat(auto-fit, minmax(130px, 1fr))",
                                      gap:
                                        "10px",
                                      marginTop:
                                        "22px",
                                    }}
                                  >
                                    {performance.passing_yards >
                                      0 && (
                                      <div
                                        style={{
                                          padding:
                                            "14px",
                                          borderRadius:
                                            "10px",
                                          background:
                                            "#020617",
                                          border:
                                            "1px solid #1e293b",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize:
                                              "20px",
                                            fontWeight:
                                              900,
                                          }}
                                        >
                                          {performance.passing_yards.toLocaleString()}
                                        </div>

                                        <div
                                          style={{
                                            color:
                                              "#64748b",
                                            fontSize:
                                              "11px",
                                          }}
                                        >
                                          PASS YDS
                                        </div>
                                      </div>
                                    )}

                                    {performance.rushing_yards >
                                      0 && (
                                      <div
                                        style={{
                                          padding:
                                            "14px",
                                          borderRadius:
                                            "10px",
                                          background:
                                            "#020617",
                                          border:
                                            "1px solid #1e293b",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize:
                                              "20px",
                                            fontWeight:
                                              900,
                                          }}
                                        >
                                          {performance.rushing_yards.toLocaleString()}
                                        </div>

                                        <div
                                          style={{
                                            color:
                                              "#64748b",
                                            fontSize:
                                              "11px",
                                          }}
                                        >
                                          RUSH YDS
                                        </div>
                                      </div>
                                    )}

                                    {performance.receiving_yards >
                                      0 && (
                                      <div
                                        style={{
                                          padding:
                                            "14px",
                                          borderRadius:
                                            "10px",
                                          background:
                                            "#020617",
                                          border:
                                            "1px solid #1e293b",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize:
                                              "20px",
                                            fontWeight:
                                              900,
                                          }}
                                        >
                                          {performance.receiving_yards.toLocaleString()}
                                        </div>

                                        <div
                                          style={{
                                            color:
                                              "#64748b",
                                            fontSize:
                                              "11px",
                                          }}
                                        >
                                          REC YDS
                                        </div>
                                      </div>
                                    )}

                                    {performance.passing_tds >
                                      0 && (
                                      <div
                                        style={{
                                          padding:
                                            "14px",
                                          borderRadius:
                                            "10px",
                                          background:
                                            "#020617",
                                          border:
                                            "1px solid #1e293b",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize:
                                              "20px",
                                            fontWeight:
                                              900,
                                          }}
                                        >
                                          {
                                            performance.passing_tds
                                          }
                                        </div>

                                        <div
                                          style={{
                                            color:
                                              "#64748b",
                                            fontSize:
                                              "11px",
                                          }}
                                        >
                                          PASS TD
                                        </div>
                                      </div>
                                    )}

                                    {performance.rushing_tds >
                                      0 && (
                                      <div
                                        style={{
                                          padding:
                                            "14px",
                                          borderRadius:
                                            "10px",
                                          background:
                                            "#020617",
                                          border:
                                            "1px solid #1e293b",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize:
                                              "20px",
                                            fontWeight:
                                              900,
                                          }}
                                        >
                                          {
                                            performance.rushing_tds
                                          }
                                        </div>

                                        <div
                                          style={{
                                            color:
                                              "#64748b",
                                            fontSize:
                                              "11px",
                                          }}
                                        >
                                          RUSH TD
                                        </div>
                                      </div>
                                    )}

                                    {performance.receiving_tds >
                                      0 && (
                                      <div
                                        style={{
                                          padding:
                                            "14px",
                                          borderRadius:
                                            "10px",
                                          background:
                                            "#020617",
                                          border:
                                            "1px solid #1e293b",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize:
                                              "20px",
                                            fontWeight:
                                              900,
                                          }}
                                        >
                                          {
                                            performance.receiving_tds
                                          }
                                        </div>

                                        <div
                                          style={{
                                            color:
                                              "#64748b",
                                            fontSize:
                                              "11px",
                                          }}
                                        >
                                          REC TD
                                        </div>
                                      </div>
                                    )}

                                    {performance.tackles >
                                      0 && (
                                      <div
                                        style={{
                                          padding:
                                            "14px",
                                          borderRadius:
                                            "10px",
                                          background:
                                            "#020617",
                                          border:
                                            "1px solid #1e293b",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize:
                                              "20px",
                                            fontWeight:
                                              900,
                                          }}
                                        >
                                          {
                                            performance.tackles
                                          }
                                        </div>

                                        <div
                                          style={{
                                            color:
                                              "#64748b",
                                            fontSize:
                                              "11px",
                                          }}
                                        >
                                          TACKLES
                                        </div>
                                      </div>
                                    )}

                                    {performance.sacks >
                                      0 && (
                                      <div
                                        style={{
                                          padding:
                                            "14px",
                                          borderRadius:
                                            "10px",
                                          background:
                                            "#020617",
                                          border:
                                            "1px solid #1e293b",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize:
                                              "20px",
                                            fontWeight:
                                              900,
                                          }}
                                        >
                                          {
                                            performance.sacks
                                          }
                                        </div>

                                        <div
                                          style={{
                                            color:
                                              "#64748b",
                                            fontSize:
                                              "11px",
                                          }}
                                        >
                                          SACKS
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div
                                    style={{
                                      marginTop:
                                        "18px",
                                      padding:
                                        "14px 16px",
                                      borderRadius:
                                        "10px",
                                      background:
                                        "#020617",
                                      border:
                                        "1px solid #1e293b",
                                    }}
                                  >
                                    <div
                                      style={{
                                        color:
                                          "#ef4444",
                                        fontSize:
                                          "11px",
                                        fontWeight:
                                          900,
                                        letterSpacing:
                                          "0.08em",
                                        marginBottom:
                                          "6px",
                                      }}
                                    >
                                      📣 CONTENT ANGLE
                                    </div>

                                    <div
                                      style={{
                                        color:
                                          "#cbd5e1",
                                        fontSize:
                                          "14px",
                                        lineHeight:
                                          1.5,
                                      }}
                                    >
                                      {getContentAngle(
                                        performance
                                      )}
                                    </div>

                                    <div
                                      style={{
                                        marginTop:
                                          "8px",
                                        color:
                                          "#94a3b8",
                                        fontSize:
                                          "13px",
                                        fontWeight:
                                          800,
                                      }}
                                    >
                                      {performance.opponent_team
                                        ? `VS ${performance.opponent_team}`
                                        : ""}

                                      {performance.game_score
                                        ? ` • ${performance.game_score}`
                                        : ""}
                                    </div>
                                  </div>
                                </article>
                              )
                            )}
                          </div>
                        </section>
                      );
                    }
                  )}
              </div>
            )}
          </section>
                )}

        {/* Story Signals retired. The former UI is intentionally retained here only as an inactive JSX comment for one transition. 
          <section>
            {whatMattersToday.length > 0 && (
  <div
    style={{
      marginBottom: "28px",
      padding: "20px",
      borderRadius: "14px",
      background: "#0f172a",
      border: "1px solid #334155",
    }}
  >
    <div
      style={{
        marginBottom: "16px",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "24px",
          fontWeight: 900,
        }}
      >
        🧠 What Matters Today
      </h2>

      <p
        style={{
          margin: "6px 0 0",
          color: "#94a3b8",
        }}
      >
        The NFL stories most worth paying attention to right now.
      </p>
    </div>

    <div
      style={{
        display: "grid",
        gap: "10px",
      }}
    >
      {whatMattersToday
        .slice(0, 5)
        .map((item) => (
          <article
            key={`${item.type}-${item.gameId ?? item.playerId ?? item.title}`}
            style={{
              padding: "14px",
              borderRadius: "10px",
              background: "#111827",
              border: "1px solid #1f2937",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: 800,
              }}
            >
              <span>{item.emoji}</span>
              <span>{item.title}</span>
            </div>

            {item.subtitle && (
              <div
                style={{
                  marginTop: "5px",
                  color: "#94a3b8",
                  fontSize: "13px",
                }}
              >
                {item.subtitle}
              </div>
            )}

            <div
              style={{
                marginTop: "8px",
                color: "#cbd5e1",
                fontSize: "14px",
                lineHeight: 1.45,
              }}
            >
              {item.reason}
            </div>
          </article>
        ))}
    </div>
  </div>
)}
            <div
              style={{
                marginBottom: "24px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "28px",
                  fontWeight: 900,
                }}
              >
                🚨 Story Signals
              </h2>

              <p
                style={{
                  margin: "6px 0 0",
                  color: "#64748b",
                }}
              >
                NFL moments that could turn into social content.
              </p>
            </div>

            {storySignals.length === 0 ? (
              <div
                style={{
                  padding: "24px",
                  borderRadius: "12px",
                  background: "#111827",
                  border: "1px solid #1f2937",
                  color: "#94a3b8",
                }}
              >
                No story signals yet.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "14px",
                }}
              >
                {storySignals.map(
                  (signal, index) => (
                    <article
                      key={`${signal.type}-${signal.gameId ?? signal.playerId ?? index}`}
                      style={{
                        padding: "18px",
                        borderRadius: "12px",
                        background: "#111827",
                        border: "1px solid #1f2937",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginBottom: "8px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "22px",
                          }}
                        >
                          {signal.emoji}
                        </span>

                        <strong
                          style={{
                            fontSize: "16px",
                          }}
                        >
                          {signal.label}
                        </strong>
                      </div>

                      <div
                        style={{
                          color: "#cbd5e1",
                          lineHeight: 1.5,
                        }}
                      >
                        {signal.reason}
                      </div>

                      {signal.kind === "player" &&
                        signal.player && (
                          <div
                            style={{
                              marginTop: "10px",
                              color: "#94a3b8",
                              fontSize: "13px",
                            }}
                          >
                            {signal.player}
                            {signal.team
                              ? ` • ${signal.team}`
                              : ""}
                            {signal.opponent
                              ? ` • vs ${signal.opponent}`
                              : ""}
                          </div>
                        )}

                      {signal.kind === "game" && (
                        <div
                          style={{
                            marginTop: "10px",
                            color: "#94a3b8",
                            fontSize: "13px",
                          }}
                        >
                          {signal.awayTeam} @{" "}
                          {signal.homeTeam}
                          {signal.awayPoints !== null &&
                          signal.homePoints !== null
                            ? ` • ${signal.awayPoints}-${signal.homePoints}`
                            : ""}
                        </div>
                      )}
                    </article>
                  )
                )}
              </div>
            )}
          </section>
        )} */}


        {activeTab === "all-time" && (
          <NflAllTimePanel
            view={allTimeView}
            period={allTimePeriod}
            onViewChange={setAllTimeView}
            onPeriodChange={setAllTimePeriod}
          />
        )}

        {activeTab === "standings" && <StandingsPanel sport="NFL" />}

        {activeTab === "content" && <ContentPanel sport="NFL" />}

        {activeTab === "stats" && (
          <section>
            <StatsPanelControls
              title="Stats"
              description={
                statsMode === "weekly"
                  ? `NFL leaders — Week ${statsWeek ?? "latest"} · live updates every 30 seconds`
                  : "NFL season leaders"
              }
              mode={statsMode}
              modes={[
                { value: "weekly", label: "Weekly" },
                { value: "season", label: "Season" },
              ]}
              onModeChange={changeStatsMode}
              view={statsView}
              views={[
                { value: "players", label: "Players" },
                { value: "teams", label: "Teams" },
              ]}
              onViewChange={changeStatsView}
              categories={
                statsView === "players"
                  ? [
                      { value: "passing", label: "Passing Yards" },
                      { value: "passing-td", label: "Passing TDs" },
                      { value: "rushing", label: "Rushing Yards" },
                      { value: "rushing-td", label: "Rushing TDs" },
                      { value: "receiving", label: "Receiving Yards" },
                      { value: "receiving-td", label: "Receiving TDs" },
                      { value: "tackles", label: "Tackles" },
                      { value: "sacks", label: "Sacks" },
                      { value: "interceptions", label: "Interceptions" },
                    ]
                  : statsMode === "weekly"
                    ? [
                        { value: "total-offense", label: "Total Offense" },
                        { value: "rushing-offense", label: "Rushing Offense" },
                        { value: "passing-offense", label: "Passing Offense" },
                        { value: "total-defense", label: "Total Defense" },
                        { value: "sacks", label: "Sacks" },
                      ]
                    : [
                        { value: "total-offense", label: "Total Offense" },
                        { value: "rushing-offense", label: "Rushing Offense" },
                        { value: "passing-offense", label: "Passing Offense" },
                        { value: "scoring-offense", label: "Scoring Offense" },
                        { value: "total-defense", label: "Total Defense" },
                        { value: "rushing-defense", label: "Rushing Defense" },
                        { value: "passing-defense", label: "Passing Defense" },
                        { value: "scoring-defense", label: "Scoring Defense" },
                        { value: "sacks", label: "Sacks" },
                        { value: "turnover-margin", label: "Turnover Margin" },
                      ]
              }
              selectedCategory={
                statsView === "players" ? statCategory : teamStatCategory
              }
              onCategoryChange={(category) => {
                if (statsView === "players") {
                  setStatCategory(category as StatCategory);
                } else {
                  setTeamStatCategory(category as TeamStatCategory);
                }
              }}
              weekSelector={
                statsMode === "weekly" && availableStatsWeeks.length > 0 ? (
                  <div className="stats-panel-week-selector">
                    <span>Week</span>
                    {availableStatsWeeks.map((week) => (
                      <button
                        key={week}
                        aria-pressed={statsWeek === week}
                        onClick={() => setStatsWeek(week)}
                      >
                        {week}
                      </button>
                    ))}
                  </div>
                ) : undefined
              }
            />

            {statsLoading ? (
              <div
                style={{
                  padding: "32px",
                  borderRadius: "12px",
                  background: "#0f172a",
                  border: "1px solid #1e293b",
                  color: "#94a3b8",
                }}
              >
                Loading NFL stats...
              </div>
            ) : (
              <StatsLeaderboardTable
                title={`${
                  statsView === "players" ? "Individual" : "Team"
                } ${
                  statsView === "players"
                    ? getStatLabel()
                    : getTeamCategoryName()
                }`}
                subtitle={
                  statsMode === "weekly"
                    ? `Week ${statsWeek ?? "latest"} leaders`
                    : "2026 season leaders"
                }
                rows={statsLeaderboardRows}
                showTeam={statsView === "players"}
              />
            )}

            {false && statsView ===
              "players" && (
              <>
                <div
                  style={{
                    display:
                      "flex",
                    gap: "8px",
                    flexWrap:
                      "wrap",
                    marginBottom:
                      "20px",
                  }}
                >
                  {(
                    [
                      [
                        "passing",
                        "Passing Yards",
                      ],
                      [
                        "passing-td",
                        "Passing TDs",
                      ],
                      [
                        "rushing",
                        "Rushing Yards",
                      ],
                      [
                        "rushing-td",
                        "Rushing TDs",
                      ],
                      [
                        "receiving",
                        "Receiving Yards",
                      ],
                      [
                        "receiving-td",
                        "Receiving TDs",
                      ],
                      [
                        "tackles",
                        "Tackles",
                      ],
                      [
                        "sacks",
                        "Sacks",
                      ],
                    ] as [
                      StatCategory,
                      string
                    ][]
                  ).map(
                    ([
                      category,
                      label,
                    ]) => (
                      <button
                        key={
                          category
                        }
                        aria-pressed={statCategory === category}
                        onClick={() =>
                          setStatCategory(
                            category
                          )
                        }
                        style={{
                          padding:
                            "9px 14px",
                          borderRadius:
                            "8px",
                          border:
                            "1px solid",
                          borderColor:
                            statCategory ===
                            category
                              ? "#ef4444"
                              : "#334155",
                          background:
                            statCategory ===
                            category
                              ? "#3f0d12"
                              : "#0f172a",
                          color:
                            statCategory ===
                            category
                              ? "#fca5a5"
                              : "#94a3b8",
                          fontWeight:
                            800,
                          cursor:
                            "pointer",
                        }}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>

                {statsLoading ? (
                  <div
                    style={{
                      padding:
                        "32px",
                      borderRadius:
                        "16px",
                      background:
                        "#0f172a",
                      border:
                        "1px solid #334155",
                      color:
                        "#94a3b8",
                    }}
                  >
                    Loading NFL stats...
                  </div>
                ) : (
                  <div
                    style={{
                      display:
                        "grid",
                      gap:
                        "12px",
                    }}
                  >
                    {sortedStats.map(
                      (
                        player,
                        index
                      ) => (
                        <article
                          key={`${player.player_id}-${statCategory}-${index}`}
                          style={{
                            display:
                              "grid",
                            gridTemplateColumns:
                              "48px 1fr auto",
                            alignItems:
                              "center",
                            gap: "16px",
                            padding:
                              "18px 20px",
                            borderRadius:
                              "12px",
                            background:
                              "#0f172a",
                            border:
                              "1px solid #334155",
                          }}
                        >
                          <div
                            style={{
                              fontSize:
                                "20px",
                              fontWeight:
                                900,
                              color:
                                "#64748b",
                            }}
                          >
                            {index +
                              1}
                          </div>

                          <div>
                            <div
                              style={{
                                fontWeight:
                                  900,
                                fontSize:
                                  "17px",
                              }}
                            >
                              {
                                player.player_display_name
                              }
                            </div>

                            <div
                              style={{
                                color:
                                  "#64748b",
                                fontSize:
                                  "12px",
                                marginTop:
                                  "4px",
                              }}
                            >
                              {
                                player.recent_team
                              }
                            </div>
                          </div>

                          <div
                            style={{
                              textAlign:
                                "right",
                            }}
                          >
                            <div
                              style={{
                                fontSize:
                                  "24px",
                                fontWeight:
                                  900,
                              }}
                            >
                              {getStatValue(
                                player
                              ).toLocaleString()}
                            </div>

                            <div
                              style={{
                                color:
                                  "#64748b",
                                fontSize:
                                  "11px",
                                fontWeight:
                                  700,
                              }}
                            >
                              {getStatLabel()}
                            </div>
                          </div>
                        </article>
                      )
                    )}
                  </div>
                )}
              </>
            )}

            {false && statsView ===
              "teams" && (
              <>
                <div
                  style={{
                    display:
                      "flex",
                    gap: "8px",
                    flexWrap:
                      "wrap",
                    marginBottom:
                      "20px",
                  }}
                >
                  {(
                    [
                      [
                        "total-offense",
                        "Total Offense",
                      ],
                      [
                        "rushing-offense",
                        "Rushing Offense",
                      ],
                      [
                        "passing-offense",
                        "Passing Offense",
                      ],
                      [
                        "scoring-offense",
                        "Scoring Offense",
                      ],
                      [
                        "total-defense",
                        "Total Defense",
                      ],
                      [
                        "rushing-defense",
                        "Rushing Defense",
                      ],
                      [
                        "passing-defense",
                        "Passing Defense",
                      ],
                      [
                        "scoring-defense",
                        "Scoring Defense",
                      ],
                      [
                        "sacks",
                        "Sacks",
                      ],
                      [
                        "turnover-margin",
                        "Turnover Margin",
                      ],
                    ] as [
                      TeamStatCategory,
                      string
                    ][]
                  ).map(
                    ([
                      category,
                      label,
                    ]) => (
                      <button
                        key={
                          category
                        }
                        aria-pressed={teamStatCategory === category}
                        onClick={() =>
                          setTeamStatCategory(
                            category
                          )
                        }
                        style={{
                          padding:
                            "9px 14px",
                          borderRadius:
                            "8px",
                          border:
                            "1px solid",
                          borderColor:
                            teamStatCategory ===
                            category
                              ? "#ef4444"
                              : "#334155",
                          background:
                            teamStatCategory ===
                            category
                              ? "#3f0d12"
                              : "#0f172a",
                          color:
                            teamStatCategory ===
                            category
                              ? "#fca5a5"
                              : "#94a3b8",
                          fontWeight:
                            800,
                          cursor:
                            "pointer",
                        }}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>

                <div
                  style={{
                    padding:
                      "18px 20px",
                    marginBottom:
                      "16px",
                    borderRadius:
                      "12px",
                    background:
                      "#0f172a",
                    border:
                      "1px solid #334155",
                    color:
                      "#94a3b8",
                    fontSize:
                      "13px",
                    lineHeight:
                      1.5,
                  }}
                >
                  NFL team leaders from
                  nflverse.
                </div>

                {statsLoading ? (
                  <div
                    style={{
                      padding:
                        "32px",
                      borderRadius:
                        "16px",
                      background:
                        "#0f172a",
                      border:
                        "1px solid #334155",
                      color:
                        "#94a3b8",
                    }}
                  >
                    Loading NFL team stats...
                  </div>
                ) : (
                  <div
                    style={{
                      display:
                        "grid",
                      gap:
                        "12px",
                    }}
                  >
                    {sortedTeamStats.map(
                      (
                        team,
                        index
                      ) => (
                        <article
                          key={`${getTeamName(team)}-${teamStatCategory}`}
                          style={{
                            display:
                              "grid",
                            gridTemplateColumns:
                              "48px 1fr auto",
                            alignItems:
                              "center",
                            gap:
                              "16px",
                            padding:
                              "18px 20px",
                            borderRadius:
                              "12px",
                            background:
                              "#0f172a",
                            border:
                              "1px solid #334155",
                          }}
                        >
                          <div
                            style={{
                              fontSize:
                                "20px",
                              fontWeight:
                                900,
                              color:
                                "#64748b",
                            }}
                          >
                            {index +
                              1}
                          </div>

                          <div
                            style={{
                              fontWeight:
                                900,
                              fontSize:
                                "17px",
                            }}
                          >
                            {getTeamName(
                              team
                            )}
                          </div>

                          <div
                            style={{
                              textAlign:
                                "right",
                            }}
                          >
                            <div
                              style={{
                                fontSize:
                                  "24px",
                                fontWeight:
                                  900,
                              }}
                            >
                              {getTeamStatValue(
                                team
                              ).toLocaleString()}
                            </div>

                            <div
                              style={{
                                color:
                                  "#64748b",
                                fontSize:
                                  "11px",
                                fontWeight:
                                  700,
                              }}
                            >
                              {getTeamStatLabel()}
                            </div>
                          </div>
                        </article>
                      )
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
