"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useHubSection } from "../lib/useHubSection";
import Link from "next/link";
import "./cfb-centre.css";
import { PreferencesButton, useHubPreferences } from "../features/preferences/HubPreferences";
import { personalTierChange } from "../lib/audience-contributions";
import { TeamLogo } from "../components/TeamLogo";
import { useTeamLogos } from "../features/stats/useTeamLogos";
import { loadTeamDirectory, type LogoTeam } from "../lib/team-logos";
import { DataCheckIndicator } from "../components/DataCheckIndicator";
import { emptyDataCheck, recordDataCheck } from "../lib/data-check";
import { CfbAllTimePanel } from "../features/all-time/CfbAllTimePanel";
import { CfbGamesGrid } from "../features/games/CfbGamesGrid";
import { DeckControls } from "../features/games/DeckControls";
import { curatedDecks } from "./data/curated-decks";
import { validDeckAssignments, toggleDeckTier, type CuratedDeck } from "../lib/curated-decks";
import { StandingsPanel } from "../features/standings/StandingsPanel";
import {
  PerformancePositionControls,
  type PerformancePosition,
} from "../features/performances/PerformancePositionControls";
import { StatsPanelControls } from "../features/stats/StatsPanelControls";
import {
  buildBigPerformances,
  buildIndividualLeaders,
  buildTeamLeaders,
  buildWeeklyIndividualLeaders,
  buildWeeklyTeamLeaders,
  formatPlayerStat,
  formatStatValue,
  getGameStatus,
  getStatLabel,
  individualCategories,
  teamCategories,
  tierInfo,
  weeklyIndividualCategories,
  weeklyTeamCategories,
} from "../lib/cfb-helpers";
import type {
  BigPerformance,
  Game,
  Leader,
  Milestone,
  PlayerStat,
  SeasonStat,
  StatsMode,
  Tier,
  UpsetSignal,
} from "../lib/cfb-helpers";
import { findCfbRivalry } from "../lib/cfb-rivalries";
import { mergeLiveSeasonStats } from "../lib/cfb-live-season";
import { rivalries } from "./data/rivalries";
import type { BroadcastAvailability } from "../lib/broadcast-availability";
import { getScoreboardRefreshDelay } from "../lib/scoreboard-refresh";
import { withSeasonPlayingStatus } from "../lib/cfb-season-playing";
import { detectUpsets, isUpsetLoss } from "../lib/cfb-upsets";

export default function CfbPage() {
  return <Suspense fallback={<main className="command-center command-center--cfb" role="status">Loading CFB Hub…</main>}><Home /></Suspense>;
}
function Home() {
  const { audience, analytics } = useHubPreferences();
  const teamLogo = useTeamLogos("CFB");
  const [gamesCheck, setGamesCheck] = useState(emptyDataCheck);
  const [statsCheck, setStatsCheck] = useState(emptyDataCheck);
  const [activeTab, setActiveTab] = useHubSection();

  const [games, setGames] = useState<Game[]>([]);
  const [upsets, setUpsets] = useState<UpsetSignal[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [rivalryGames, setRivalryGames] = useState<
    {
      game: Game;
      rivalry: (typeof rivalries)[number];
    }[]
  >([]);
  const [gamesLoading, setGamesLoading] =
    useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [broadcastAvailability, setBroadcastAvailability] = useState<Record<number, BroadcastAvailability["platforms"]>>({});
  const gameIds = games.map((game) => game.id).join(",");

  const [tiers, setTiers] =
    useState<Record<number, Tier>>({});
  const personalTiers = useRef(tiers);
  personalTiers.current = tiers;
  const [tiersLoaded, setTiersLoaded] =
    useState(false);
  const [selectedTier, setSelectedTier] =
    useState("ALL");
  const [selectedConference, setSelectedConference] = useState("ALL");
  const [seasonGames, setSeasonGames] = useState<Game[]>([]);
  const [teamDirectory, setTeamDirectory] = useState<LogoTeam[]>([]);
  const [conferenceTeams, setConferenceTeams] = useState<{ name: string; teams: string[] }[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadTeamDirectory("CFB")
      .then((data) => {
        if (!cancelled) setTeamDirectory(data.sections.flatMap((section) => section.teams));
        if (!cancelled) setConferenceTeams((data.sections ?? []).map((section: { name: string; teams: { team: string }[] }) => ({ name: section.name, teams: section.teams.map((team) => team.team) })));
      })
      .catch((error) => console.warn(error));
    return () => { cancelled = true; };
  }, []);

    const [allTimeView, setAllTimeView] = useState<"individual" | "team">(
  "individual"
);

const [allTimePeriod, setAllTimePeriod] = useState<"season" | "career" | "single-game">(
  "career"
);

  const [statsMode, setStatsMode] =
    useState<StatsMode>("weekly");

  const [selectedWeek, setSelectedWeek] =
    useState<number | null>(null);
  const [gameSeason, setGameSeason] = useState<number | null>(null);
  const [activeDeck, setActiveDeck] = useState<{ id: string; season: number; week: number; assignments: Record<number, Tier> } | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [deckResponse, setDeckResponse] = useState<{ key: string; decks: CuratedDeck[]; error: string | null }>({ key: "", decks: [], error: null });
  const deckKey = `${gameSeason}/${selectedWeek}`;
  const decksLoading = gameSeason !== null && selectedWeek !== null && deckResponse.key !== deckKey;
  const publishedDecks = deckResponse.key === deckKey ? deckResponse.decks : [];
  const deckLoadError = deckResponse.key === deckKey ? deckResponse.error : null;
  useEffect(() => {
    if (gameSeason === null || selectedWeek === null || activeTab !== "games") return;
    let cancelled = false;
    fetch(`/api/decks?season=${gameSeason}&week=${selectedWeek}`, { cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Published decks are temporarily unavailable. Personal selections and prepared presets still work."); return response.json(); })
      .then((data) => { if (!cancelled) setDeckResponse({ key: `${gameSeason}/${selectedWeek}`, decks: data.decks, error: null }); })
      .catch((error) => { if (!cancelled) setDeckResponse({ key: `${gameSeason}/${selectedWeek}`, decks: [], error: error.message }); });
    return () => { cancelled = true; };
  }, [gameSeason, selectedWeek, activeTab]);
  const availableCuratedDecks = [...curatedDecks.filter((preset) => !publishedDecks.some((deck) => deck.id === preset.id)), ...publishedDecks];
  const loadedDeck = activeDeck?.season === gameSeason && activeDeck?.week === selectedWeek ? activeDeck : null;
  const effectiveTiers = loadedDeck?.assignments ?? tiers;

  const [currentWeek, setCurrentWeek] =
    useState<number | null>(null);

  const [statsView, setStatsView] =
    useState<"individual" | "team">(
      "individual"
    );
  const seasonIndicators = activeTab === "stats" && statsMode === "season";


  const [selectedCategory, setSelectedCategory] =
    useState("rushing");
  const [performancePosition, setPerformancePosition] =
    useState<PerformancePosition>("all");

  const [seasonStatsError, setSeasonStatsError] = useState<string | null>(null);
  const [seasonPlayerStats, setSeasonPlayerStats] = useState<PlayerStat[]>([]);
  const [seasonStats, setSeasonStats] =
    useState<SeasonStat[]>([]);
  const [seasonStatsLoading, setSeasonStatsLoading] =
    useState(true);

  const [playerStats, setPlayerStats] =
    useState<PlayerStat[]>([]);
  const [playerStatsLoading, setPlayerStatsLoading] =
    useState(true);

  const isRivalryGame = (game: Game) => findCfbRivalry(game, rivalries);

  function detectMilestones(
    playerStats: PlayerStat[]
  ) {
    return playerStats
      .filter((stat) => {
        if (stat.stat === "YDS") {
          return (
            (stat.category === "rushing" &&
              stat.value >= 200) ||
            (stat.category === "receiving" &&
              stat.value >= 200) ||
            (stat.category === "passing" &&
              stat.value >= 400)
          );
        }

        if (stat.stat === "TD") {
          return stat.value >= 4;
        }

        return false;
      })
      .map((stat) => {
        let message = "";

        if (
          stat.category === "rushing" &&
          stat.stat === "YDS"
        ) {
          message = `${stat.value} rushing yards`;
        } else if (
          stat.category === "receiving" &&
          stat.stat === "YDS"
        ) {
          message = `${stat.value} receiving yards`;
        } else if (
          stat.category === "passing" &&
          stat.stat === "YDS"
        ) {
          message = `${stat.value} passing yards`;
        } else if (stat.stat === "TD") {
          message = `${stat.value} total touchdowns`;
        }

        return {
          player: stat.player,
          team: stat.team,
          category: stat.category,
          stat: stat.stat,
          value: stat.value,
          gameId: stat.gameId,
          opponent: stat.opponent,
          message,
        };
      });
  }

  useEffect(() => {
    let restored: Record<number, Tier> = {};
    try {
      const savedTiers = localStorage.getItem("cfb-game-tiers");
      if (savedTiers) {
        const parsedTiers: unknown = JSON.parse(savedTiers);
        if (parsedTiers && typeof parsedTiers === "object" && !Array.isArray(parsedTiers)) {
          const assignments = parsedTiers as Record<string, unknown>;
          restored = validDeckAssignments(assignments, Object.keys(assignments).map(Number));
        }
      }
    } catch {
      // Storage can be unavailable; tiers still work for this session.
    }
    const restoreTimer = window.setTimeout(() => {
      setTiers(restored);
      setTiersLoaded(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!tiersLoaded) {
      return;
    }

    try { localStorage.setItem("cfb-game-tiers", JSON.stringify(tiers)); }
    catch { console.warn("Personal tiers could not be saved on this browser."); }
  }, [tiers, tiersLoaded]);

  useEffect(() => {
    if (!games.length) {
      setBroadcastAvailability({});
      return;
    }

    let cancelled = false;
    fetch(`/api/broadcast-availability?league=CFB&gameIds=${gameIds}`)
      .then((response) => response.ok ? response.json() : { availability: [] })
      .then((data: { availability?: BroadcastAvailability[] }) => {
        if (cancelled) return;
        setBroadcastAvailability(Object.fromEntries((data.availability ?? []).map((entry) => [entry.gameId, entry.platforms])));
      })
      .catch(() => {
        if (!cancelled) setBroadcastAvailability({});
      });

    return () => {
      cancelled = true;
    };
  }, [gameIds]);

  useEffect(() => {
    // Direct Stats/Performances links still need the initial week/game context
    // that previously came from visiting Games first. Season player indicators
    // share this refresh loop; other off-Games views still load context once.
    if (!seasonIndicators && activeTab !== "games" && (!gamesLoading || !["stats", "performances"].includes(activeTab))) {
      return;
    }

    let cancelled = false;
    let refreshTimer: number | undefined;

    function scheduleRefresh(gamesData: Game[]) {
      if (activeTab !== "games" && !seasonIndicators) return;
      const delay = getScoreboardRefreshDelay(gamesData);

      if (delay !== null) {
        refreshTimer = window.setTimeout(() => {
          void loadGames(false);
        }, delay);
      }
    }

    async function loadGames(initialLoad: boolean) {
      if (initialLoad) {
        setGamesLoading(true);
        if (seasonIndicators) setSeasonGames([]);
      }

      setGamesError(null);

      try {
        const response = await fetch(
          seasonIndicators || selectedWeek === null
            ? "/api/scoreboard"
            : `/api/scoreboard?week=${selectedWeek}`,
          seasonIndicators ? { cache: "no-store", signal: AbortSignal.timeout(15_000) } : undefined
        );

        if (!response.ok) {
          throw new Error(
            "Failed to load games"
          );
        }

        const data = await response.json();

        const gamesData = Array.isArray(data)
          ? data
          : data.games ?? [];

        if (cancelled) {
          return;
        }

        if (seasonIndicators) {
          setSeasonGames(gamesData);
          scheduleRefresh(gamesData);
          return;
        }

        if (
          !Array.isArray(data) &&
          data.week != null &&
          selectedWeek === null
        ) {
          setCurrentWeek(data.week);
          setSelectedWeek(data.week);
        }

        setGames(gamesData);
        setGamesCheck((previous) => recordDataCheck(previous, String(data.week ?? selectedWeek ?? "latest"), true, Date.now()));
        setGameSeason(Array.isArray(data) ? null : data.season ?? null);

        setRivalryGames(
          gamesData
            .map((game: Game): {
  game: Game;
  rivalry: (typeof rivalries)[number];
} | null => {

  const rivalry =

    isRivalryGame(game);

              if (!rivalry) {
                return null;
              }

              return {
                game,
                rivalry,
              };
            })
            .filter(
  (
    item: {
      game: Game;
      rivalry: (typeof rivalries)[number];
    } | null
  ): item is {
    game: Game;
    rivalry: (typeof rivalries)[number];
  } => item !== null
)
        );

        setUpsets(detectUpsets(gamesData));
        scheduleRefresh(gamesData);
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          if (seasonIndicators) setSeasonGames([]);
          setGamesError(
            "Live college football games are temporarily unavailable. We’ll retry automatically."
          );
          setGamesCheck((previous) => recordDataCheck(previous, String(selectedWeek ?? "latest"), false, Date.now()));
          refreshTimer = window.setTimeout(() => {
            void loadGames(false);
          }, 60_000);
        }
      } finally {
        if (!cancelled && initialLoad) {
          setGamesLoading(false);
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
  }, [activeTab, selectedWeek, seasonIndicators]);

  useEffect(() => {
    if (activeTab !== "stats" || statsMode !== "season") return;
    let cancelled = false, baselinePending = false, livePending = false;
    setSeasonStatsLoading(true);
    setSeasonStatsError(null);
    async function loadBaseline() {
      if (baselinePending) return;
      baselinePending = true;
      try {
        const response = await fetch(`/api/season-stats?view=${statsView}&category=${selectedCategory}`, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error("Season baseline refresh failed");
        const data = await response.json();
        if (!Array.isArray(data) || !data.length) throw new Error("Season stats returned no records");
        if (!cancelled) { setSeasonStats(data); setSeasonStatsError(null); }
      } catch (error) { if (!cancelled) setSeasonStatsError("Season stats could not load. Retrying automatically…"); console.error(error); }
      finally { baselinePending = false; if (!cancelled) setSeasonStatsLoading(false); }
    }
    async function loadLive() {
      if (livePending) return;
      livePending = true;
      try {
        const response = await fetch("/api/player-stats", { cache: "no-store", signal: AbortSignal.timeout(25_000) });
        if (!response.ok) throw new Error("Live season refresh failed");
        const data = await response.json();
        if (!cancelled) { setSeasonPlayerStats(data); setStatsCheck((previous) => recordDataCheck(previous, "season", true, Date.now())); }
      } catch (error) { if (!cancelled) setStatsCheck((previous) => recordDataCheck(previous, "season", false, Date.now())); console.error(error); }
      finally { livePending = false; }
    }
    loadBaseline(); loadLive();
    const baselineInterval = window.setInterval(loadBaseline, 30_000);
    const liveInterval = window.setInterval(loadLive, 30_000);
    return () => { cancelled = true; window.clearInterval(baselineInterval); window.clearInterval(liveInterval); };
  }, [activeTab, statsMode, statsView, selectedCategory]);

  useEffect(() => {
    const needsPlayerStats =
      activeTab === "performances" ||
      (activeTab === "stats" &&
        statsMode === "weekly");

    if (!needsPlayerStats || gamesLoading) {
      return;
    }

    let checkCancelled = false;
    async function loadPlayerStats() {
      try {
        const response = await fetch(
          selectedWeek === null
            ? "/api/player-stats"
            : `/api/player-stats?week=${selectedWeek === 0 ? 1 : selectedWeek}`
        );

        if (!response.ok) {
          throw new Error(
            "Failed to load player stats"
          );
        }

        const data = await response.json();

        if (!checkCancelled) setStatsCheck((previous) => recordDataCheck(previous, String(selectedWeek ?? "latest"), true, Date.now()));

        setPlayerStats(data);
        setMilestones(
          detectMilestones(data)
        );
      } catch (error) {
        if (!checkCancelled) setStatsCheck((previous) => recordDataCheck(previous, String(selectedWeek ?? "latest"), false, Date.now()));
        console.error(error);
      } finally {
        setPlayerStatsLoading(false);
      }
    }

    loadPlayerStats();

    const interval = setInterval(
      loadPlayerStats,
      30000
    );

    return () => {
      checkCancelled = true;
      clearInterval(interval);
    };
  }, [
    activeTab,
    statsMode,
    selectedWeek,
    gamesLoading,
  ]);

  const gamesWithSignals = useMemo(() => {
    return games.map((game) => {
      const homeLost =
        game.completed &&
        game.homePoints !== null &&
        game.awayPoints !== null &&
        game.homePoints < game.awayPoints;

      const awayLost =
        game.completed &&
        game.homePoints !== null &&
        game.awayPoints !== null &&
        game.awayPoints < game.homePoints;

      const rankedTeamLost =
        (homeLost &&
          isUpsetLoss(
            game.homeRank,
            game.awayRank
          )) ||
        (awayLost &&
          isUpsetLoss(
            game.awayRank,
            game.homeRank
          ));

      const rankedMatchup =
        game.homeRank !== null &&
        game.awayRank !== null;

      const top10Matchup =
        game.homeRank !== null &&
        game.awayRank !== null &&
        game.homeRank <= 10 &&
        game.awayRank <= 10;

      const rankedTeam =
        game.homeRank !== null ||
        game.awayRank !== null;

      let suggestedTier: Tier = "D";

      if (rankedTeamLost) {
        suggestedTier = "S";
      } else if (top10Matchup) {
        suggestedTier = "S";
      } else if (rankedMatchup) {
        suggestedTier = "A";
      } else if (rankedTeam) {
        suggestedTier = "B";
      }

      return {
        ...game,
        tier: effectiveTiers[game.id] ?? null,
        suggestedTier,
        rankedTeamLost,
        rankedMatchup,
        top10Matchup,
      };
    });
  }, [games, effectiveTiers]);

  const filteredGames = useMemo(() => {
    const tierFilteredGames =
      selectedTier === "ALL"
        ? gamesWithSignals
        : gamesWithSignals.filter(
            (game) => game.tier === selectedTier
          );

    // Preserve the scoreboard's normal order, but keep completed games out
    // of the middle of an active slate.
    const members = conferenceTeams.find((conference) => conference.name === selectedConference)?.teams;
    const conferenceFilteredGames = selectedConference === "ALL" ? tierFilteredGames
      : tierFilteredGames.filter((game) => members?.includes(game.homeTeam) || members?.includes(game.awayTeam));
    return [...conferenceFilteredGames].sort(
      (left, right) => Number(left.completed) - Number(right.completed)
    );
  }, [
    gamesWithSignals,
    selectedTier,
    selectedConference,
    conferenceTeams,
  ]);

  const leaders = useMemo(() => {
    if (statsMode === "weekly") {
      if (statsView === "team") {
        return buildWeeklyTeamLeaders(
          playerStats,
          selectedCategory
        );
      }

      return buildWeeklyIndividualLeaders(
        playerStats,
        selectedCategory
      );
    }

    const currentSeasonStats = mergeLiveSeasonStats(seasonStats, seasonPlayerStats, seasonGames, teamDirectory);
    if (statsView === "team") {
      return buildTeamLeaders(
        currentSeasonStats,
        selectedCategory
      );
    }

    return withSeasonPlayingStatus(
      buildIndividualLeaders(currentSeasonStats, selectedCategory),
      seasonIndicators ? seasonGames : [],
      teamDirectory
    );
  }, [
    seasonStats,
    seasonPlayerStats,
    seasonIndicators,
    seasonGames,
    teamDirectory,
    playerStats,
    statsMode,
    statsView,
    selectedCategory,
  ]);

  const bigPerformances = useMemo(() => {
    return buildBigPerformances(
      playerStats
    );
  }, [playerStats]);

  const filteredBigPerformances = useMemo(() => {
    if (performancePosition === "all") {
      return bigPerformances;
    }

    return bigPerformances.filter((performance) => {
      const hasOffensiveStats = performance.stats.some((stat) =>
        ["passing", "rushing", "receiving"].includes(stat.category)
      );

      const rushingYards = performance.stats.find(
        (stat) => stat.category === "rushing" && stat.stat === "YDS"
      )?.value ?? 0;

      const passingYards = performance.stats.find(
        (stat) => stat.category === "passing" && stat.stat === "YDS"
      )?.value ?? 0;

      const receivingYards = performance.stats.find(
        (stat) => stat.category === "receiving" && stat.stat === "YDS"
      )?.value ?? 0;

      if (performancePosition === "def") {
        return (
          !hasOffensiveStats &&
          performance.stats.some(
            (stat) => stat.category === "defensive"
          )
        );
      }

      // A flagged performance can contain several small stat lines. Position
      // views should only show the player when they cleared that position's
      // own headline yardage threshold, rather than simply recording a stat
      // in that category.
      if (performancePosition === "qb") return passingYards >= 400;
      if (performancePosition === "rb") return rushingYards >= 200;
      return receivingYards >= 200;
    });
  }, [bigPerformances, performancePosition]);

  const currentCategories =
    statsMode === "weekly"
      ? statsView === "team"
        ? weeklyTeamCategories
        : weeklyIndividualCategories
      : statsView === "team"
        ? teamCategories
        : individualCategories;

  function setGameTier(
    gameId: number,
    tier: Tier
  ) {
    analytics.action('tier_interaction');
    if (loadedDeck) {
      setActiveDeck({ ...loadedDeck, assignments: toggleDeckTier(loadedDeck.assignments, gameId, tier) });
      return;
    }
    const next = { ...personalTiers.current };
    const chosen = next[gameId] === tier ? null : tier;
    if (chosen === null) delete next[gameId]; else next[gameId] = chosen;
    personalTiers.current = next;
    setTiers(next);
    void audience.contribute(personalTierChange(games.find(game => game.id === gameId)?.context, "CFB", chosen));
  }

  function clearGameTiers() {
    if (loadedDeck) setActiveDeck({ ...loadedDeck, assignments: {} });
    else {
      if (Object.keys(personalTiers.current).length) void audience.contribute({kind:"clearTiers",league:"CFB"});
      personalTiers.current = {};
      setTiers({});
    }
    setSelectedTier("ALL");
  }

  function loadDeck(deck: CuratedDeck) {
    const assignments = validDeckAssignments(deck.assignments, games.map((game) => game.id));
    if (!Object.keys(assignments).length) {
      setDeckError("This deck has no valid games in the selected week.");
      return;
    }
    setDeckError(null);
    setActiveDeck({ id: deck.id, season: deck.season, week: deck.week, assignments });
    setSelectedTier("ALL");
  }

  function getPerformanceResult(
    performance: BigPerformance
  ) {
    const game = games.find(
      (candidate) =>
        candidate.id === performance.gameId
    );

    if (!game) {
      return "Game status unavailable";
    }

    if (!game.completed) {
      return "Game in progress";
    }

    if (
      game.homePoints === null ||
      game.awayPoints === null
    ) {
      return "FINAL";
    }

    const normalize = (name: string) =>
      name
        .toLowerCase()
        .replace(
          /\b(tigers|wildcats|bulldogs|hoosiers|nittany lions|fighting illini|crimson tide|buckeyes|wolverines|trojans|gators|longhorns|volunteers|hurricanes|seminoles|cardinals|tar heels|blue devils|demon deacons|huskies|ducks|beavers|bruins|knights|cougars|mustangs|raiders|red raiders|owls|eagles|bears|horned frogs|cowboys|sooners|jayhawks|cyclones|mountaineers|hokies|cavaliers|orange|wolfpack|razorbacks|rebels|commodores|aggies|gamecocks|spartans|terrapins)\b/g,
          ""
        )
        .replace(/[^a-z0-9]/g, "");

    const performanceTeam =
      normalize(performance.team);

    const homeTeam =
      normalize(game.homeTeam);

    const awayTeam =
      normalize(game.awayTeam);

    const teamIsHome =
      homeTeam.includes(performanceTeam) ||
      performanceTeam.includes(homeTeam);

    const teamIsAway =
      awayTeam.includes(performanceTeam) ||
      performanceTeam.includes(awayTeam);

    if (!teamIsHome && !teamIsAway) {
      return "Result unavailable";
    }

    const teamScore = teamIsHome
      ? game.homePoints
      : game.awayPoints;

    const opponentScore = teamIsHome
      ? game.awayPoints
      : game.homePoints;

    if (teamScore > opponentScore) {
      return `WIN ${teamScore}-${opponentScore}`;
    }

    if (teamScore < opponentScore) {
      return `LOSS ${teamScore}-${opponentScore}`;
    }

    return `TIE ${teamScore}-${opponentScore}`;
  }

  function changeStatsView(
    view: "individual" | "team"
  ) {
    setStatsView(view);

    if (statsMode === "weekly") {
      setSelectedCategory(
        view === "team"
          ? "total-offense"
          : "passing"
      );
      return;
    }

    setSelectedCategory(
      view === "team"
        ? "total-offense"
        : "passing"
    );
  }

  function changeStatsMode(
    mode: StatsMode
  ) {
    setStatsMode(mode);

    if (mode === "weekly") {
      setSelectedCategory(
        statsView === "team" ? "total-offense" : "passing"
      );
    } else {
      setSelectedCategory(
        statsView === "team"
          ? "total-offense"
          : "passing"
      );
    }
  }

  const weeklyUnavailable = false;
  const showMilestones = false;

  return (
    <main
      className="command-center command-center--cfb"
      style={{
        minHeight: "100vh",
        background: "var(--cc-canvas)",
        color: "var(--cc-text)",
        padding: "32px",
      }}
    >
      <div
        className="command-center__container"
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        <header className="cfb-hub-header">
          <div className="cfb-hub-header__bar">
            <Link href="/" className="cfb-hub-header__identity" aria-label="AAW Hub home">
              <span className="cfb-hub-header__logo" aria-hidden="true" />
              <span className="cfb-hub-header__label">HUB</span>
            </Link>
            <nav className="cfb-hub-header__links" aria-label="Hub navigation">
              <Link href="/">Overview</Link>
              <Link href="/cfb" aria-current="page">CFB Centre</Link>
              <Link href="/nfl">NFL Centre</Link>
            </nav>
            <PreferencesButton />
          </div>
          <div className="cfb-hub-header__intro">
            <div>
              <p>AAW HUB / COLLEGE FOOTBALL</p>
              <h1>CFB Centre<span>.</span></h1>
              <span>Games, numbers and context for your football Saturday.</span>
            </div>
            <span className="cfb-hub-header__source">Live data powered by ESPN</span>
          </div>
        </header>

        <nav
          className="command-center__nav"
          aria-label="CFB sections"
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "24px",
          }}
        >
          {[
  ["games", "Games"],
  ["performances", "Performances"],
  ["stats", "Stats"],
  ["standings", "Standings"],
  ["all-time", "All-Time"],

].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={activeTab === id}
              onClick={() =>
                setActiveTab(id)
              }
              style={{
                border:
                  "1px solid var(--cc-border-strong)",
                background:
                  activeTab === id
                    ? "var(--cc-border)"
                    : "var(--cc-surface)",
                color: "var(--cc-text)",
                padding:
                  "10px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        {activeTab === "games" && (
          <section className="cfb-games-section" aria-label="CFB games">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
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
                    margin: "6px 0 0",
                    color: "var(--cc-muted)",
                  }}
                >
                  Live college football scoreboard
                </p>
              </div>

              <div
                style={{
                  color: "var(--cc-muted)",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                Updates every 30 seconds
                <DataCheckIndicator check={gamesCheck} scope={String(selectedWeek ?? "latest")} />
              </div>
            </div>

            <div className="cfb-games-tools" aria-label="Game filters and decks">
        {currentWeek !== null && (
          <div
            className="cc-week-controls"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "20px",
            }}
          >
            <label
              id="cfb-week-label"
              style={{
                fontWeight: 700,
                color: "var(--cc-text)",
              }}
            >
              Week:
            </label>

            <div className="cc-week-strip"
              role="group" aria-labelledby="cfb-week-label"
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {Array.from(
                { length: currentWeek + 1 },
                (_, week) => (
                  <button
                    key={week}
                    type="button"
                    aria-pressed={(selectedWeek ?? currentWeek) === week}
                    onClick={() => setSelectedWeek(week)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "1px solid",
                      borderColor:
                        (selectedWeek ?? currentWeek) === week
                          ? "var(--cc-accent)"
                          : "var(--cc-border-strong)",
                      background:
                        (selectedWeek ?? currentWeek) === week
                          ? "var(--cc-accent-soft)"
                          : "var(--cc-surface)",
                      color:
                        (selectedWeek ?? currentWeek) === week
                          ? "var(--cc-text)"
                          : "var(--cc-muted)",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Week {week}
                  </button>
                )
              )}
            </div>
          </div>
        )}
            <div className="cc-tier-filters"
              role="group" aria-label="Game tier filters"
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                marginBottom: "20px",
              }}
            >
              <button
                aria-pressed={selectedTier === "ALL"}
                onClick={() =>
                  setSelectedTier("ALL")
                }
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border:
                    "1px solid var(--cc-border-strong)",
                  background:
                    selectedTier ===
                    "ALL"
                      ? "var(--cc-border-strong)"
                      : "var(--cc-surface)",
                  color: "var(--cc-text)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                All Games
              </button>

              {(
                Object.keys(
                  tierInfo
                ) as Tier[]
              ).map((tier) => (
                <button
                  key={tier}
                  aria-pressed={selectedTier === tier}
                  onClick={() =>
                    setSelectedTier(tier)
                  }
                  style={{
                    padding:
                      "8px 14px",
                    borderRadius:
                      "8px",
                    border:
                      "1px solid var(--cc-border-strong)",
                    background:
                      selectedTier === tier
                        ? tier === "S"
                          ? "#7f1d1d"
                          : tier === "A"
                            ? "#78350f"
                            : tier === "B"
                              ? "#1e3a8a"
                              : tier === "C"
                                ? "#14532d"
                                : "var(--cc-border-strong)"
                        : "var(--cc-surface)",
                    color: "var(--cc-text)",
                    cursor:
                      "pointer",
                    fontWeight:
                      700,
                  }}
                >
                  {
                    tierInfo[tier]
                      .emoji
                  }{" "}
                  {tier}
                </button>
              ))}
              <button
                onClick={clearGameTiers}
                disabled={Object.keys(effectiveTiers).length === 0}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--cc-border-strong)",
                  background: "transparent",
                  color: Object.keys(effectiveTiers).length === 0 ? "var(--cc-muted)" : "var(--cc-muted)",
                  cursor: Object.keys(effectiveTiers).length === 0 ? "not-allowed" : "pointer",
                  fontWeight: 700,
                }}
              >
                Clear selections
              </button>
            </div>

            {!gamesLoading && !gamesError && gameSeason !== null && selectedWeek !== null && <DeckControls
              key={`${gameSeason}:${selectedWeek}:${loadedDeck?.id ?? "personal"}`}
              season={gameSeason} week={selectedWeek} decks={availableCuratedDecks} games={games}
              tiers={effectiveTiers} activeDeckId={loadedDeck?.id} onLoad={loadDeck}
              onRestore={() => { setActiveDeck(null); setDeckError(null); setSelectedTier("ALL"); }}
            />}
            {deckError && <p role="status">{deckError}</p>}
            {decksLoading && <p role="status">Loading published decks…</p>}
            {deckLoadError && <p role="status">{deckLoadError}</p>}
            {conferenceTeams.length > 0 && <label className="games-conference-filter">
              Conference
              <select value={selectedConference} onChange={(event) => setSelectedConference(event.target.value)}>
                <option value="ALL">All Conferences</option>
                {conferenceTeams.map((conference) => <option key={conference.name} value={conference.name}>{conference.name}</option>)}
              </select>
            </label>}
            </div>
            {!gamesLoading && !gamesError && filteredGames.length === 0 && <p>No games match these filters.</p>}
            {gamesError ? (
              <div className="cfb-state cfb-state--error" role="alert"
                style={{
                  padding: "32px",
                  borderRadius: "16px",
                  background: "var(--cc-surface)",
                  border: "1px solid #7f1d1d",
                  color: "#fca5a5",
                }}
              >
                {gamesError}
              </div>
            ) : gamesLoading ? (
              <p
                style={{
                  color:
                    "var(--cc-muted)",
                }}
              >
                Loading games...
              </p>
            ) : (
              <CfbGamesGrid
                games={filteredGames}
                upsets={upsets}
                rivalryGames={rivalryGames}
                broadcastAvailability={broadcastAvailability}
                onSetTier={setGameTier}
                getStatus={getGameStatus}
              />
            )}

          </section>
        )}

        {activeTab === "performances" && (
          <section className="cfb-performances-section">
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
            Player Performances
          </h2>

          <p
            style={{
              margin: "6px 0 0",
              color: "var(--cc-muted)",
            }}
          >
            Notable individual performances from the current CFB season.
          </p>
        </div>

        {currentWeek !== null && (
          <div
            className="cc-week-strip"
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              marginBottom: "28px",
            }}
          >
              {Array.from(
                { length: currentWeek + 1 },
                (_, week) => (
                  <button
                    key={week}
                    type="button"
                    aria-pressed={(selectedWeek ?? currentWeek) === week}
                    onClick={() => setSelectedWeek(week)}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "1px solid",
                      borderColor:
                        (selectedWeek ?? currentWeek) === week
                          ? "var(--cc-accent)"
                          : "var(--cc-border-strong)",
                      background:
                        (selectedWeek ?? currentWeek) === week
                          ? "var(--cc-accent-soft)"
                          : "var(--cc-surface)",
                      color:
                        (selectedWeek ?? currentWeek) === week
                          ? "var(--cc-text)"
                          : "var(--cc-muted)",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Week {week}
                  </button>
                )
              )}
          </div>
        )}
        <PerformancePositionControls
          value={performancePosition}
          onChange={setPerformancePosition}
        />
            <div>
              {showMilestones && milestones.length > 0 && (
                <div
                  style={{
                    marginBottom:
                      "16px",
                    padding:
                      "14px 16px",
                    borderRadius:
                      "10px",
                    border:
                      "1px solid var(--cc-accent)",
                    background:
                      "var(--cc-accent-soft)",
                  }}
                >
                  <div
                    style={{
                      color:
                        "var(--cc-accent-text)",
                      fontWeight:
                        900,
                      fontSize:
                        "14px",
                      marginBottom:
                        "8px",
                    }}
                  >
                    🏆 STATISTICAL
                    MILESTONES
                  </div>

                  {milestones.map(
                    (
                      milestone
                    ) => (
                      <div
                        key={`${milestone.player}-${milestone.gameId}-${milestone.stat}`}
                        style={{
                          color:
                            "var(--cc-text)",
                          fontWeight:
                            700,
                          marginTop:
                            "6px",
                        }}
                      >
                        {
                          milestone.player
                        }{" "}
                        ·{" "}
                        {
                          milestone.team
                        }{" "}
                        —{" "}
                        {
                          milestone.message
                        }{" "}
                        vs.{" "}
                        {
                          milestone.opponent
                        }
                      </div>
                    )
                  )}
                </div>
              )}

              {playerStatsLoading ? (
                <p
                  style={{
                    color:
                      "var(--cc-muted)",
                  }}
                >
                  Loading player
                  performances...
                </p>
              ) : filteredBigPerformances.length ===
                0 ? (
                <p
                  style={{
                    color:
                      "var(--cc-muted)",
                  }}
                >
                  No monster
                  performances
                  detected yet.
                </p>
              ) : (
                <div
                  style={{
                    display:
                      "grid",
                    gap:
                      "12px",
                  }}
                >
                  {filteredBigPerformances.map(
                    (
                      performance
                    ) => (
                      <div
                        className="cfb-performance-card" data-desk-export="performance" data-export-label={performance.player ? `${performance.player} · ${performance.team}` : performance.team}
                        key={
                          performance.id
                        }
                        style={{
                          padding:
                            "18px",
                          border:
                            "1px solid var(--cc-border-strong)",
                          borderRadius:
                            "10px",
                          background:
                            "var(--cc-canvas)",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            justifyContent:
                              "space-between",
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
                                  "20px",
                                fontWeight:
                                  800,
                              }}
                            >
                              🔥{" "}
                              {
                                performance.player
                              }{" "}
                              ·{" "}
                              {
                                performance.team
                              }
                            </div>

                            <div
                              data-export-omit
                              style={{
                                color:
                                  "var(--cc-muted)",
                                marginTop:
                                  "6px",
                              }}
                            >
                              vs.{" "}
                              {
                                performance.opponent
                              }
                            </div>
                          </div>

                          <div
                            style={{
                              color:
                                "var(--cc-accent-text)",
                              fontWeight:
                                800,
                              fontSize:
                                "16px",
                            }}
                          >
                            {
                              getPerformanceResult(
                                performance
                              )
                            }
                          </div>
                        </div>

                        <div
                          style={{
                            display:
                              "flex",
                            gap:
                              "10px",
                            flexWrap:
                              "wrap",
                            marginTop:
                              "16px",
                          }}
                        >
                          {performance.stats
                            .filter((stat) => stat.value > 0)
                            .map(
                            (stat, index) => (
                              <div
                                key={`${stat.category}-${stat.stat}-${index}`}
                                style={{
                                  padding:
                                    "10px 14px",
                                  borderRadius:
                                    "8px",
                                  background:
                                    "var(--cc-surface)",
                                  border:
                                    "1px solid var(--cc-border)",
                                  minWidth:
                                    "110px",
                                }}
                              >
                                <div
                                  style={{
                                    color:
                                      "var(--cc-muted)",
                                    fontSize:
                                      "11px",
                                    textTransform:
                                      "uppercase",
                                    fontWeight:
                                      700,
                                    letterSpacing:
                                      "0.04em",
                                  }}
                                >
                                  {
                                    getStatLabel(
                                      stat
                                    )
                                  }
                                  {stat.seasonHigh && <span data-export-omit className="all-time-record-row__active"> SEASON HIGH</span>}
                                </div>

                                <div
                                  style={{
                                    fontSize:
                                      "18px",
                                    fontWeight:
                                      800,
                                    marginTop:
                                      "4px",
                                  }}
                                >
                                  {
                                    formatPlayerStat(
                                      stat
                                    )
                                  }
                                </div>
                              </div>
                            )
                          )}
                        </div>

                        <div
                          data-export-omit
                          style={{
                            marginTop:
                              "16px",
                            padding:
                              "12px 14px",
                            borderRadius:
                              "8px",
                            background:
                              "var(--cc-surface-raised)",
                            border:
                              "1px solid var(--cc-border-strong)",
                          }}
                        >
                          <div
                            style={{
                              color:
                                "var(--cc-accent-text)",
                              fontSize:
                                "11px",
                              fontWeight:
                                900,
                              letterSpacing:
                                "0.05em",
                              marginBottom:
                                "6px",
                            }}
                          >
                            📣 CONTENT ANGLE
                          </div>

                          <div
                            style={{
                              color:
                                "var(--cc-text)",
                              fontWeight:
                                700,
                              lineHeight:
                                1.5,
                            }}
                          >
                            {
                              performance.player
                            }{" "}
                            just put up{" "}
                            {
                              performance.reason
                            }{" "}
                            against{" "}
                            {
                              performance.opponent
                            }{" "}
                            —{" "}
                            {getPerformanceResult(
                              performance
                            )}
                            .
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "stats" && (
          <section>
          <DataCheckIndicator check={statsCheck} scope={statsMode === "season" ? "season" : String(selectedWeek ?? "latest")} />
          <StatsPanelControls
            title="Stats"
            description={statsMode === "weekly" ? `Week ${selectedWeek ?? "latest"} leaders · live updates every 30 seconds` : "2026 season leaders · live updates every 30 seconds"}
            mode={statsMode}
            modes={[
              { value: "weekly", label: "Weekly" },
              { value: "season", label: "Season" },
            ]}
            onModeChange={changeStatsMode}
            view={statsView}
            views={[
              { value: "individual", label: "Players" },
              { value: "team", label: "Teams" },
            ]}
            onViewChange={changeStatsView}
            categories={currentCategories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            weekSelector={
              statsMode === "weekly" && currentWeek !== null ? (
                <div className="stats-panel-week-selector">
                  <span>Week</span>
                  {Array.from({ length: currentWeek + 1 }, (_, week) => {
                    return (
                      <button
                        key={week}
                        aria-pressed={(selectedWeek ?? currentWeek) === week}
                    onClick={() => setSelectedWeek(week)}
                      >
                        {week}
                      </button>
                    );
                  })}
                </div>
              ) : undefined
            }
          />
            <div
              data-desk-export="stats" data-export-label={`${statsView === "team" ? "Team" : "Individual"} ${currentCategories.find((category) => category.id === selectedCategory)?.name ?? "Stats"} · ${statsMode === "season" ? "2026 season" : `Week ${selectedWeek ?? "—"}`}`}
              style={{
                background:
                  "var(--cc-surface)",
                border:
                  "1px solid var(--cc-border)",
                borderRadius:
                  "12px",
                overflow:
                  "hidden",
              }}
            >
              <div
                style={{
                  padding:
                    "18px",
                  borderBottom:
                    "1px solid var(--cc-border)",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize:
                      "22px",
                  }}
                >
                  {statsView ===
                  "team"
                    ? "Team"
                    : "Individual"}{" "}
                  {
                    currentCategories.find(
                      (
                        category
                      ) =>
                        category.id ===
                        selectedCategory
                    )?.name ??
                    ""
                  }
                </h2>

                <p
                  style={{
                    color:
                      "var(--cc-muted)",
                    marginBottom:
                      0,
                  }}
                >
                  {statsMode ===
                  "season"
                    ? "2026 season leaders · live updates every 30 seconds"
                    : `Week ${selectedWeek ?? "—"} leaders`}
                </p>
              </div>

              {statsMode === "season" && seasonStatsError && leaders.length > 0 && <p role="alert" style={{ padding: "0 20px", color: "var(--cc-muted)" }}>{seasonStatsError}</p>}
              {statsMode ===
                "weekly" &&
              playerStatsLoading ? (
                <p
                  style={{
                    padding:
                      "20px",
                    color:
                      "var(--cc-muted)",
                  }}
                >
                  Loading weekly
                  stats...
                </p>
              ) : statsMode ===
                  "season" &&
                seasonStatsLoading ? (
                <p
                  style={{
                    padding:
                      "20px",
                    color:
                      "var(--cc-muted)",
                  }}
                >
                  Loading season
                  stats...
                </p>
              ) : statsMode === "season" && leaders.length === 0 && seasonStatsError ? (
                <p role="alert" style={{ padding: "20px", color: "var(--cc-muted)" }}>{seasonStatsError}</p>
              ) : weeklyUnavailable ? (
                <p
                  style={{
                    padding:
                      "20px",
                    color:
                      "var(--cc-muted)",
                  }}
                >
                  That weekly team
                  category isn't
                  available from the
                  current ESPN player
                  box-score feed.
                </p>
              ) : (
                <div
                  style={{
                    overflowX:
                      "auto",
                  }}
                >
                    <table
                      style={{
                        width:
                          "100%",
                        borderCollapse:
                          "collapse",
                        tableLayout:
                          "fixed",
                      }}
                    >
                    <colgroup>
                      {statsView === "individual" ? (
                        <>
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "32%" }} />
                          <col style={{ width: "36%" }} />
                          <col style={{ width: "20%" }} />
                        </>
                      ) : (
                        <>
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "60%" }} />
                          <col style={{ width: "24%" }} />
                        </>
                      )}
                    </colgroup>
                    <thead>
                      <tr>
                        <th
                          style={
                            thStyle
                          }
                        >
                          Rank
                        </th>

                        <th
                          style={
                            thStyle
                          }
                        >
                          {statsView ===
                          "team"
                            ? "Team"
                            : "Player"}
                        </th>

                        {statsView ===
                          "individual" && (
                          <th
                            style={
                              thStyle
                            }
                          >
                            Team
                          </th>
                        )}

                        <th
                          style={
                            thStyle
                          }
                        >
                          Value
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {leaders
                        .slice(
                          0,
                          25
                        )
                        .map(
                          (
                            leader,
                            index
                          ) => (
                            <tr
                              className={statsView === "individual" && leader.playingNow ? "weekly-leader--playing" : undefined}
                              key={
                                leader.playerId
                              }
                            >
                              <td
                                style={
                                  tdStyle
                                }
                              >
                                {index +
                                  1}
                              </td>

                              <td
                                style={{
                                  ...tdStyle,
                                  fontWeight:
                                    700,
                                }}
                              >
                                {statsView === "team" ? <TeamLogo src={teamLogo(leader.team || leader.player)} name={leader.player} /> : leader.player}
                                {statsView === "individual" && leader.playingNow && <span data-export-playing className="all-time-record-row__active">PLAYING NOW</span>}
                              </td>

                              {statsView ===
                                "individual" && (
                                <td
                                  style={
                                    tdStyle
                                  }
                                >
                                  <TeamLogo src={teamLogo(leader.team)} name={leader.team} />
                                </td>
                              )}

                              <td
                                style={{
                                  ...tdStyle,
                                  fontWeight:
                                    800,
                                }}
                              >
                                {statsMode ===
  "season" &&
statsView ===
  "team"
  ? selectedCategory === "total-defense" ||
selectedCategory === "rushing-defense" ||
selectedCategory === "passing-defense"
  ? `${leader.value.toLocaleString()} YPG`
  : formatStatValue(
      selectedCategory,
      leader.value
    )
  : statsMode ===
    "season" &&
  statsView ===
    "individual" &&
  selectedCategory.endsWith(
    "-td"
  )
  ? `${leader.value.toLocaleString()} TD`
  : statsMode ===
      "season" &&
    statsView ===
      "individual" &&
    selectedCategory === "tackles"
    ? `${leader.value.toLocaleString()} tackles`
    : statsMode ===
        "season" &&
      statsView ===
        "individual" &&
      selectedCategory === "sacks"
  ? `${leader.value.toLocaleString()} sacks`
      : formatStatValue(
          selectedCategory,
          leader.value
        )}
                              </td>
                            </tr>
                          )
                        )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "all-time" && (
          <CfbAllTimePanel
            view={allTimeView}
            period={allTimePeriod}
            onViewChange={setAllTimeView}
            onPeriodChange={setAllTimePeriod}
          />
        )}

        {activeTab === "standings" && <StandingsPanel sport="CFB" />}

      </div>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 18px",
  color: "var(--cc-muted)",
  fontSize: "13px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  borderBottom:
    "1px solid var(--cc-border)",
};

const tdStyle: React.CSSProperties = {
  padding: "14px 18px",
  borderBottom:
    "1px solid var(--cc-border)",
};
