"use client";

import { useEffect, useMemo, useState } from "react";

import { rivalries } from "../../cfb/data/rivalries";
import { cfbAllTimeCareerProgram } from "../../cfb/data/cfb-all-time-program";
import { nflAllTimeCareerTeam } from "../../nfl/data/nfl-all-time-team";

type ContentPanelProps = { sport: "CFB" | "NFL" };
type Phase = "prepare" | "recap";

type Game = {
  id: number;
  startDate: string;
  homeTeam: string;
  awayTeam: string;
  homePoints: number | null;
  awayPoints: number | null;
  homeRank?: number | null;
  awayRank?: number | null;
  venueCity?: string | null;
  venueCountry?: string | null;
  completed: boolean;
};

type Leader = {
  rank: number;
  name: string;
  context: string;
  value: number;
  isActive: boolean;
};

type MonitorSignal = {
  league: "CFB" | "NFL";
  audience: "individual" | "team";
  period: "career" | "season" | "single-game";
  category: string;
  type: "new-entry" | "rank-movement" | "record-holder";
  player: string;
  isActive: boolean;
  previousRank?: number;
  currentRank: number;
  createdAt: string;
};

type ContentItem = { label: string; detail: string; kind: "game" | "milestone" | "alert" };

const potentialRiserCeilings: Record<string, number> = {
  "passing-yards": 500,
  "passing-td": 7,
  "rushing-yards": 300,
  "rushing-td": 6,
  "receiving-yards": 300,
  "receiving-td": 5,
  tackles: 25,
  sacks: 5,
  interceptions: 4,
  "total-offense-yards": 650,
  points: 40,
};

const unitForCategory = (category: string) => {
  if (category.includes("yards")) return "yards";
  if (category.endsWith("-td")) return "touchdowns";
  if (category === "sacks") return "sacks";
  if (category === "interceptions") return "interceptions";
  if (category === "tackles") return "tackles";
  if (category === "points") return "points";
  return "away";
};

const categoryName = (category: string) =>
  category
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const compactTeamName = (team: string) =>
  team
    .toLowerCase()
    .replace(/\b(crimson tide|bulldogs|tigers|wildcats|eagles|knights|cougars|huskies|buckeyes|wolverines|spartans|hoosiers|boilermakers|fighting irish|golden gophers|nittany lions|badgers|cornhuskers|hawkeyes|bearcats|bearcats|cardinals|cardinal|blue devils|tar heels|wolfpack|yellow jackets|hurricanes|seminoles|gators|volunteers|rebels|razorbacks|aggies|longhorns|soon ers|soon ers|cowboys|red raiders|bears|cyclones|jayhawks|mountaineers|terrapins|scarlet knights|rams|falcons|saints|seahawks|packers|bills|chiefs|chargers|raiders|broncos|patriots|steelers|bengals|browns|ravens|colts|titans|texans|jaguars|dolphins|jets|giants|commanders|lions|vikings|panthers|buccaneers|49ers)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

const isRivalry = (game: Game) => {
  const home = compactTeamName(game.homeTeam);
  const away = compactTeamName(game.awayTeam);
  return rivalries.some(({ teams }) => {
    const [first, second] = teams.map(compactTeamName);
    return (home === first && away === second) || (home === second && away === first);
  });
};

const gameTime = (date: string) =>
  new Date(date).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

const rankedName = (name: string, rank?: number | null) => (rank ? `#${rank} ${name}` : name);

const isUpset = (game: Game) => {
  if (!game.completed || game.homePoints === game.awayPoints) return false;
  const winnerIsHome = (game.homePoints ?? 0) > (game.awayPoints ?? 0);
  const rankedLoser = winnerIsHome ? game.awayRank : game.homeRank;
  const winnerRank = winnerIsHome ? game.homeRank : game.awayRank;
  return Boolean(rankedLoser && rankedLoser <= 25 && (!winnerRank || winnerRank > rankedLoser));
};

const teamKey = (team: string) => compactTeamName(team);

const parseRecord = (record: string) => {
  const values = record.match(/(\d[\d,]*)[–-](\d[\d,]*)/);
  return values ? { wins: Number(values[1].replace(/,/g, "")), losses: Number(values[2].replace(/,/g, "")) } : null;
};

function ContentSection({ title, items, empty }: { title: string; items: ContentItem[]; empty: string }) {
  return (
    <section className="content-panel__section">
      <h3>{title}</h3>
      {items.length ? (
        <div className="content-panel__items">
          {items.map((item) => (
            <article className={`content-panel__item content-panel__item--${item.kind}`} key={`${item.label}-${item.detail}`}>
              <p>{item.label}</p>
              <strong>{item.detail}</strong>
            </article>
          ))}
        </div>
      ) : <p className="content-panel__section-empty">{empty}</p>}
    </section>
  );
}

export function ContentPanel({ sport }: ContentPanelProps) {
  const [phase, setPhase] = useState<Phase>("prepare");
  const [games, setGames] = useState<Game[]>([]);
  const [leaderboards, setLeaderboards] = useState<Record<string, Leader[]>>({});
  const [signals, setSignals] = useState<MonitorSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [scoreboard, allTime, monitor] = await Promise.all([
          fetch(sport === "CFB" ? "/api/scoreboard" : "/api/nfl/scoreboard").then((response) => response.json()),
          fetch(`/api/all-time/leaderboards?league=${sport}`).then((response) => response.json()),
          fetch("/api/all-time/refresh").then((response) => response.json()),
        ]);
        if (cancelled) return;
        setGames(scoreboard.games ?? []);
        setLeaderboards(allTime.leaderboards ?? {});
        setSignals(monitor.recentSignals ?? []);
      } catch {
        if (!cancelled) {
          setGames([]);
          setLeaderboards({});
          setSignals([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [sport]);

  const preparedGames = useMemo<ContentItem[]>(() => games
    .filter((game) => !game.completed)
    .flatMap((game) => {
      if (sport === "NFL") {
        const country = game.venueCountry?.trim().toLowerCase();
        if (!country || ["united states", "usa", "us", "u.s."].includes(country)) return [];
        const location = [game.venueCity, game.venueCountry].filter(Boolean).join(", ");
        return [{
          kind: "game",
          label: `${gameTime(game.startDate)} · 🌍 INTERNATIONAL GAME${location ? ` · ${location.toUpperCase()}` : ""}`,
          detail: `${game.awayTeam} @ ${game.homeTeam}`,
        }];
      }

      const labels = [
        isRivalry(game) ? "🏆 RIVALRY" : null,
        game.homeRank && game.awayRank && game.homeRank <= 10 && game.awayRank <= 10 ? "🔥 TOP-10 SHOWDOWN" : null,
        game.homeRank && game.awayRank ? "📈 RANKED MATCHUP" : null,
      ].filter(Boolean);
      if (!labels.length) return [];
      return [{
        kind: "game",
        label: `${gameTime(game.startDate)} · ${labels.join(" · ")}`,
        detail: `${rankedName(game.awayTeam, game.awayRank)} @ ${rankedName(game.homeTeam, game.homeRank)}`,
      }];
    }), [games, sport]);

  const recapGames = useMemo<ContentItem[]>(() => sport === "CFB" ? games
    .filter((game) => game.completed)
    .flatMap((game) => {
      const labels = [
        isUpset(game) ? "🚨 UPSET" : null,
        isRivalry(game) ? "🏆 RIVALRY RESULT" : null,
        game.homeRank && game.awayRank && game.homeRank <= 10 && game.awayRank <= 10 ? "🔥 TOP-10 SHOWDOWN" : null,
      ].filter(Boolean);
      if (!labels.length) return [];
      return [{
        kind: "alert",
        label: labels.join(" · "),
        detail: `${rankedName(game.awayTeam, game.awayRank)} ${game.awayPoints ?? 0} @ ${rankedName(game.homeTeam, game.homeRank)} ${game.homePoints ?? 0}`,
      }];
    }) : [], [games, sport]);

  const potentialRisers = useMemo<ContentItem[]>(() => Object.entries(leaderboards).flatMap(([id, entries]) => {
    const [, audience, period, category] = id.split(":");
    if (audience !== "individual" || !["career", "season"].includes(period)) return [];
    const ceiling = potentialRiserCeilings[category];
    if (!ceiling) return [];
    return entries.flatMap((entry) => {
      if (!entry.isActive || entry.rank <= 1) return [];
      const playerAhead = entries.find((candidate) => candidate.rank === entry.rank - 1);
      const gap = playerAhead ? playerAhead.value - entry.value : 0;
      if (!playerAhead || gap <= 0 || gap > ceiling) return [];
      return [{
        kind: "milestone" as const,
        label: `📈 POTENTIAL RISER · ${period === "career" ? "Career" : "Single Season"} ${categoryName(category)}`,
        detail: `${entry.name} is ${gap.toLocaleString()} ${unitForCategory(category)} from #${playerAhead.rank} all-time.`,
      }];
    });
  }), [leaderboards]);

  const teamMilestones = useMemo<ContentItem[]>(() => {
    const scheduledTeams = new Set(games.filter((game) => !game.completed).flatMap((game) => [teamKey(game.homeTeam), teamKey(game.awayTeam)]));
    const records = sport === "CFB" ? cfbAllTimeCareerProgram : nflAllTimeCareerTeam;
    const milestones = new Set([10, 25, 50, 100, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000]);
    const wins = records.wins.flatMap((record) => scheduledTeams.has(teamKey(record.player)) && milestones.has(record.value + 1)
      ? [{ kind: "milestone" as const, label: "🏆 WIN MILESTONE WATCH", detail: `${record.player} can reach ${record.value + 1} all-time wins this week.` }]
      : []);
    const percentage = records["winning-percentage"].flatMap((record) => {
      if (!scheduledTeams.has(teamKey(record.player))) return [];
      const parsed = parseRecord(record.team);
      if (!parsed || Math.abs(parsed.wins - parsed.losses) > 1) return [];
      if (parsed.wins <= parsed.losses) return [{ kind: "milestone" as const, label: "📊 .500 WATCH", detail: `A ${record.player} win would lift them to or above .500 all-time.` }];
      return [{ kind: "milestone" as const, label: "📊 .500 WATCH", detail: `A ${record.player} loss would drop them to or below .500 all-time.` }];
    });
    return [...wins, ...percentage];
  }, [games, sport]);

  const achievedMilestones = useMemo<ContentItem[]>(() => signals
    .filter((signal) => signal.league === sport && signal.isActive && signal.audience === "individual" && signal.period !== "single-game")
    .filter((signal) => Date.now() - new Date(signal.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000)
    .map((signal) => ({
      kind: "milestone" as const,
      label: `🏆 MILESTONE ACHIEVED · ${categoryName(signal.category)}`,
      detail: signal.type === "record-holder"
        ? `${signal.player} is the new all-time record holder.`
        : signal.type === "new-entry"
          ? `${signal.player} entered the all-time Top 25.`
          : `${signal.player} rose from #${signal.previousRank} to #${signal.currentRank} all-time.`,
    })), [signals, sport]);

  return (
    <section className="content-panel">
      <div className="content-panel__header">
        <h2>🚨 Content</h2>
        <p>{phase === "prepare" ? `What to plan for across this ${sport} slate.` : `What actually happened and is worth carrying forward.`}</p>
      </div>
      <div className="content-panel__phase-controls" role="tablist" aria-label="Content phase">
        <button type="button" role="tab" aria-selected={phase === "prepare"} onClick={() => setPhase("prepare")}>Prepare</button>
        <button type="button" role="tab" aria-selected={phase === "recap"} onClick={() => setPhase("recap")}>Recap</button>
      </div>

      {loading ? <div className="content-panel__empty">Loading the editorial queue…</div> : (
        <div className="content-panel__sections">
          {phase === "prepare" ? <>
            <ContentSection title="Games to plan for" items={preparedGames} empty="No flagged upcoming games in the current slate." />
            <ContentSection title="Milestone watch" items={[...potentialRisers, ...teamMilestones]} empty="No realistic all-time milestones to watch this week." />
          </> : <>
            <ContentSection title="Game stories" items={recapGames} empty="No completed game stories are in the recap queue yet." />
            <ContentSection title="Milestones achieved" items={achievedMilestones} empty="No confirmed all-time milestones have landed in this week’s recap." />
          </>}
        </div>
      )}
    </section>
  );
}
