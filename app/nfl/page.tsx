"use client";

import { Fragment, useEffect, useState } from "react";
import { GameCard } from "../components/GameCard";

type NFLGame = {
  id: number;
  startDate: string;
  homeTeam: string;
  awayTeam: string;
  homePoints: number | null;
  awayPoints: number | null;
  homeRecord: string | null;
  awayRecord: string | null;
  completed: boolean;
  status: string;

  importance?: "S" | "A" | "B" | "C";
  importanceReasons?: string[];
};

type NFLPlayerStat = {
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
};

type NFLPerformance = NFLPlayerStat & {
  week: number;
  opponent_team: string;
  game_id: string;
  result: string;
  game_score: string;
  team_record: string | null;
  opponent_record: string | null;
};

type NFLTeamStat = Record<string, string>;

type StatCategory =
  | "passing"
  | "passing-td"
  | "rushing"
  | "rushing-td"
  | "receiving"
  | "receiving-td"
  | "tackles"
  | "sacks";

type TeamStatCategory =
  | "total-offense"
  | "passing"
  | "rushing"
  | "points"
  | "defense"
  | "sacks"
  | "turnover-margin";

type StatsView = "players" | "teams";

type Tab =
  | "games"
  | "stats"
  | "performances"
  | "all-time";

type PerformanceWeek =
  | "all"
  | number;

type StatsMode = "weekly" | "season";

type NFLTier = "S" | "A" | "B" | "C" | "D";

const tierInfo: Record<NFLTier, { name: string; emoji: string }> = {
  S: { name: "Must Watch", emoji: "🔥" },
  A: { name: "High Interest", emoji: "👀" },
  B: { name: "Worth Watching", emoji: "📺" },
  C: { name: "Background", emoji: "🟢" },
  D: { name: "Skip", emoji: "⚪" },
};

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

  const [statsLoading, setStatsLoading] =
    useState(false);

  const [performancesLoading, setPerformancesLoading] =
    useState(false);

  const [activeTab, setActiveTab] =
    useState<Tab>("games");

  const [gameTiers, setGameTiers] = useState<Record<number, NFLTier>>({});
  const [gameTiersLoaded, setGameTiersLoaded] = useState(false);

  const [performanceWeek, setPerformanceWeek] =
    useState<PerformanceWeek>("all");

  const latestPerformanceWeek =
    Math.max(
      1,
      ...performances.map(
        (performance) => performance.week
      )
    );

  const [statsView, setStatsView] =
    useState<StatsView>("players");

  const [statsMode, setStatsMode] = useState<StatsMode>("weekly");
  const [statsWeek, setStatsWeek] = useState<number | null>(null);

  const [statCategory, setStatCategory] =
    useState<StatCategory>("passing");

  const [teamStatCategory, setTeamStatCategory] =
    useState<TeamStatCategory>(
      "total-offense"
    );

  useEffect(() => {
    const savedTiers = localStorage.getItem("nfl-game-tiers");

    if (savedTiers) {
      setGameTiers(JSON.parse(savedTiers));
    }

    setGameTiersLoaded(true);
  }, []);

  useEffect(() => {
    if (!gameTiersLoaded) {
      return;
    }

    localStorage.setItem("nfl-game-tiers", JSON.stringify(gameTiers));
  }, [gameTiers, gameTiersLoaded]);

  useEffect(() => {
    async function loadGames() {
      try {
        const response = await fetch(
          window.location.origin + "/api/nfl/scoreboard"
        );

        if (!response.ok) {
          throw new Error(
            "Failed to load NFL games"
          );
        }

        const data =
          await response.json();
          console.log("NFL DATA FROM PAGE:", data);

        setGames(
  data.map((game: NFLGame) => {
    const importance = getGameImportance(game);

    return {
      ...game,
      importance: importance.importance,
      importanceReasons: importance.reasons,
    };
  })
);
      } catch (error) {
        console.error(
          "NFL games error:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadGames();

    const interval = setInterval(
      loadGames,
      30000
    );

    return () =>
      clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true);

      try {
        const playerResponse =
          await fetch(
            `/api/nfl/stats?mode=${statsMode}`
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
        setStatsWeek(playerData.week ?? null);

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
  }, [activeTab, statsMode]);

  useEffect(() => {
    async function loadPerformances() {
      setPerformancesLoading(true);

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
      loadPerformances();
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

      default:
        return "";
    }
  }

  function getTeamName(
    team: NFLTeamStat
  ) {
    return team.team ?? "Team";
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

      case "passing":
        return Number(
          team.passing_yards ?? 0
        );

      case "rushing":
        return Number(
          team.rushing_yards ?? 0
        );

      case "points": {
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

      case "defense":
        return (
          Number(
            team.def_tackles_solo ??
              0
          ) +
          Number(
            team.def_tackle_assists ??
              0
          )
        );

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

      case "passing":
        return "Passing Yards";

      case "rushing":
        return "Rushing Yards";

      case "points":
        return "Points";

      case "defense":
        return "Total Tackles";

      case "sacks":
        return "Sacks";

      case "turnover-margin":
        return "Turnover Margin";

      default:
        return "Team Stat";
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
        (a, b) =>
          getTeamStatValue(b) -
          getTeamStatValue(a)
      )
      .slice(0, 10);

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
          performanceWeek ===
            "all" ||
          performance.week ===
            performanceWeek
      )
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
        fontFamily:
          "Arial, sans-serif",
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
              FOOTBALL COMMAND CENTER
            </div>
            <h1 className="command-center__title">NFL</h1>
            <p className="command-center__subtitle">
              Sunday football intelligence.
            </p>
          </div>
          <div className="command-center__source">
            Live data powered by ESPN & nflverse
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
["all-time", "🏆 All-Time"],
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

            {loading ? (
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
                Loading NFL games... {games.length}
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
            ) : (
              <div
                className="command-center__game-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(300px, 1fr))",
                  gap: "16px",
                }}
              >
                {games.map((game) => {
                  const tier = gameTiers[game.id];
                  const suggestedTier = game.importance ?? "C";

                  return (
                    <Fragment key={game.id}>
                    <div className="legacy-game-card">
                    <article
                      key={game.id}
                      style={{
                        padding: "24px",
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
                          color:
                            "#64748b",
                          fontSize:
                            "12px",
                          fontWeight:
                            800,
                          marginBottom:
                            "20px",
                        }}
                      >
                        {game.completed
                          ? "FINAL"
                          : game.status.toUpperCase()}
                      </div>

                      <div
                        style={{
                          display:
                            "grid",
                          gap: "14px",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            justifyContent:
                              "space-between",
                            alignItems:
                              "center",
                            gap: "16px",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontWeight:
                                  900,
                                fontSize:
                                  "18px",
                              }}
                            >
                              {
                                game.awayTeam
                              }
                            </div>

                            {game.awayRecord && (
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
                                  game.awayRecord
                                }
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              fontSize:
                                "28px",
                              fontWeight:
                                900,
                            }}
                          >
                            {
                              game.awayPoints ??
                              "—"
                            }
                          </div>
                        </div>

                        <div
                          style={{
                            height:
                              "1px",
                            background:
                              "#1e293b",
                          }}
                        />

                        <div
                          style={{
                            display:
                              "flex",
                            justifyContent:
                              "space-between",
                            alignItems:
                              "center",
                            gap: "16px",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontWeight:
                                  900,
                                fontSize:
                                  "18px",
                              }}
                            >
                              {
                                game.homeTeam
                              }
                            </div>

                            {game.homeRecord && (
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
                                  game.homeRecord
                                }
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              fontSize:
                                "28px",
                              fontWeight:
                                900,
                            }}
                          >
                            {
                              game.homePoints ??
                              "—"
                            }
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop:
                            "20px",
                          paddingTop:
                            "14px",
                          borderTop:
                            "1px solid #1e293b",
                          color:
                            "#64748b",
                          fontSize:
                            "12px",
                        }}
                      >
                        <div>{formatGameTime(game.startDate)}</div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px",
                            flexWrap: "wrap",
                            marginTop: "12px",
                          }}
                        >
                          <div
                            style={{
                              color: tier ? "#f8fafc" : "#94a3b8",
                              fontWeight: 800,
                            }}
                          >
                            {tier
                              ? `${tierInfo[tier].emoji} ${tier} · ${tierInfo[tier].name}`
                              : `Suggested: ${suggestedTier} · ${tierInfo[suggestedTier].name}`}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              flexWrap: "wrap",
                            }}
                          >
                            {(Object.keys(tierInfo) as NFLTier[]).map((tierOption) => (
                              <button
                                key={tierOption}
                                aria-pressed={tier === tierOption}
                                onClick={() => setGameTier(game.id, tierOption)}
                                style={{
                                  minWidth: "32px",
                                  padding: "5px 8px",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                }}
                              >
                                {tierOption}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </article>
                    </div>
                    <GameCard
                      status={game.completed ? "FINAL" : game.status.toUpperCase()}
                      awayTeam={game.awayTeam}
                      awayMeta={game.awayRecord ?? "No record available"}
                      awayScore={game.awayPoints}
                      homeTeam={game.homeTeam}
                      homeMeta={game.homeRecord ?? "No record available"}
                      homeScore={game.homePoints}
                      time={formatGameTime(game.startDate)}
                      footer={
                        <div className="game-card__tier-controls">
                          <div className="game-card__tier-label">
                            {tier
                              ? `${tierInfo[tier].emoji} ${tier} · ${tierInfo[tier].name}`
                              : `Suggested: ${suggestedTier} · ${tierInfo[suggestedTier].name}`}
                          </div>
                          <div className="game-card__tier-buttons">
                            {(Object.keys(tierInfo) as NFLTier[]).map((tierOption) => (
                              <button
                                key={tierOption}
                                aria-pressed={tier === tierOption}
                                onClick={() => setGameTier(game.id, tierOption)}
                              >
                                {tierOption}
                              </button>
                            ))}
                          </div>
                        </div>
                      }
                    />
                    </Fragment>
                  );
                })}
              </div>
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
              {[
                ["all", "ALL"],
                ...Array.from(
                  {
                    length:
                      latestPerformanceWeek,
                  },
                  (_, index) => {
                    const week =
                      latestPerformanceWeek -
                      index;

                    return [
                      week,
                      `WEEK ${week}`,
                    ] as [
                      PerformanceWeek,
                      string
                    ];
                  }
                ),
              ].map(
                ([week, label]) => (
                  <button
                    key={String(week)}
                    onClick={() =>
  setPerformanceWeek(
    week === "all" ? "all" : Number(week)
  )
}
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
                          ? "#ef4444"
                          : "#334155",
                      background:
                        performanceWeek ===
                        week
                          ? "#3f0d12"
                          : "#0f172a",
                      color:
                        performanceWeek ===
                        week
                          ? "#fca5a5"
                          : "#94a3b8",
                      fontWeight:
                        900,
                      cursor:
                        "pointer",
                    }}
                  >
                    {label}
                  </button>
                )
              )}
            </div>

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
                    (week) =>
                      performanceWeek ===
                        "all" ||
                      performanceWeek ===
                        week
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
                                "flex",
                              alignItems:
                                "center",
                              gap: "12px",
                              marginBottom:
                                "14px",
                            }}
                          >
                            <h3
                              style={{
                                margin:
                                  0,
                                fontSize:
                                  "20px",
                                fontWeight:
                                  900,
                              }}
                            >
                              WEEK{" "}
                              {week}
                            </h3>

                            <div
                              style={{
                                height:
                                  "1px",
                                flex: 1,
                                background:
                                  "#1e293b",
                              }}
                            />
                          </div>

                          <div
                            style={{
                              display:
                                "grid",
                              gap:
                                "16px",
                            }}
                          >
                            {weekPerformances.map(
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
          <section>
            <div
              style={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: "12px",
                padding: "24px",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "8px" }}>🏆 All-Time</h2>
              <p style={{ color: "#94a3b8", marginTop: 0, lineHeight: 1.6 }}>
                NFL career leaders from the official NFL Record &amp; Fact Book. This is a historical
                record-book snapshot, separate from the live and 2026 season stats above.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginTop: "20px" }}>
                {[
                  { title: "🏈 Career Passing Yards", rows: [["Tom Brady", "New England / Tampa Bay", 89214], ["Drew Brees", "San Diego / New Orleans", 80358], ["Peyton Manning", "Indianapolis / Denver", 71940]] },
                  { title: "🏃 Career Rushing Yards", rows: [["Emmitt Smith", "Dallas / Arizona", 18355], ["Walter Payton", "Chicago", 16726], ["Frank Gore", "San Francisco / Indianapolis / Miami / Buffalo / NY Jets", 16000]] },
                  { title: "🙌 Career Receptions", rows: [["Jerry Rice", "San Francisco / Oakland / Seattle", 1549], ["Larry Fitzgerald", "Arizona", 1432], ["Tony Gonzalez", "Kansas City / Atlanta", 1325]] },
                  { title: "🔥 Career Touchdowns", rows: [["Jerry Rice", "San Francisco / Oakland / Seattle", 208], ["Emmitt Smith", "Dallas / Arizona", 175], ["LaDainian Tomlinson", "San Diego / NY Jets", 162]] },
                  { title: "🎯 Career Points", rows: [["Adam Vinatieri", "New England / Indianapolis", 2673], ["Morten Andersen", "New Orleans / Atlanta / NY Giants / Kansas City / Minnesota", 2544], ["Gary Anderson", "Pittsburgh / Philadelphia / San Francisco / Minnesota / Tennessee", 2434]] },
                ].map((record) => (
                  <div key={record.title} style={{ background: "#111827", border: "1px solid #334155", borderRadius: "10px", padding: "18px" }}>
                    <div style={{ fontSize: "16px", fontWeight: 800, marginBottom: "14px" }}>{record.title}</div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {record.rows.map(([player, team, value], index) => (
                        <div key={`${record.title}-${player}`} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: "10px", alignItems: "center", padding: "10px 0", borderTop: index === 0 ? "none" : "1px solid #1e293b" }}>
                          <span style={{ color: "#64748b", fontWeight: 800 }}>{index + 1}</span>
                          <div>
                            <div style={{ fontWeight: 800 }}>{player}</div>
                            <div style={{ color: "#64748b", fontSize: "12px", marginTop: "2px" }}>{team}</div>
                          </div>
                          <strong>{Number(value).toLocaleString()}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "20px", padding: "14px 16px", background: "#111827", border: "1px solid #334155", borderRadius: "10px", color: "#cbd5e1", lineHeight: 1.6, fontSize: "13px" }}>
                <strong style={{ color: "#f8fafc" }}>Historical source:</strong>{" "}
                NFL 2024 Record &amp; Fact Book, compiled by the Elias Sports Bureau. The book states that its records reflect available official NFL information from the league's formation in 1920, including applicable AFL records from 1960–69.
              </div>
            </div>
          </section>
        )}

        {activeTab === "stats" && (
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
                  Stats
                </h2>

                <p
                  style={{
                    margin:
                      "6px 0 0",
                    color:
                      "#64748b",
                  }}
                >
                  {statsMode === "weekly"
                    ? `NFL leaders — Week ${statsWeek ?? "latest"}`
                    : "NFL season leaders"}
                  {statsMode === "weekly" && " · Live updates every 30 seconds"}
                </p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                marginBottom:
                  "20px",
              }}
            >
              <button
                aria-pressed={statsMode === "weekly"}
                onClick={() => setStatsMode("weekly")}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                }}
              >
                Weekly
              </button>

              <button
                aria-pressed={statsMode === "season"}
                onClick={() => setStatsMode("season")}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                }}
              >
                Season
              </button>

              <button
                aria-pressed={statsView === "players"}
                onClick={() =>
                  setStatsView(
                    "players"
                  )
                }
                style={{
                  padding:
                    "10px 16px",
                  borderRadius:
                    "8px",
                  border:
                    "1px solid",
                  borderColor:
                    statsView ===
                    "players"
                      ? "#ef4444"
                      : "#334155",
                  background:
                    statsView ===
                    "players"
                      ? "#3f0d12"
                      : "#0f172a",
                  color:
                    statsView ===
                    "players"
                      ? "#fca5a5"
                      : "#94a3b8",
                  fontWeight:
                    900,
                  cursor:
                    "pointer",
                }}
              >
                👤 Player Leaders
              </button>

              <button
                aria-pressed={statsView === "teams"}
                onClick={() =>
                  setStatsView(
                    "teams"
                  )
                }
                style={{
                  padding:
                    "10px 16px",
                  borderRadius:
                    "8px",
                  border:
                    "1px solid",
                  borderColor:
                    statsView === "teams"
                      ? "#ef4444"
                      : "#334155",
                  background:
                    statsView === "teams"
                      ? "#3f0d12"
                      : "#0f172a",
                  color:
                    statsView === "teams"
                      ? "#fca5a5"
                      : "#94a3b8",
                  fontWeight:
                    900,
                  cursor:
                    "pointer",
                }}
              >
                🏈 Team Leaders
              </button>
            </div>

            {statsView ===
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

            {statsView ===
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
                        "passing",
                        "Passing",
                      ],
                      [
                        "rushing",
                        "Rushing",
                      ],
                      [
                        "points",
                        "Points",
                      ],
                      [
                        "defense",
                        "Defense",
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
