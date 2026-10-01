"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Game as CfbGame } from "../../lib/cfb-helpers";
import {
  formatGameTime,
  getNflInternationalIndicator,
  getNflPrimeTimeIndicator,
  type NFLGame,
} from "../../lib/nfl-helpers";
import { rivalries } from "../../cfb/data/rivalries";

type ScoreboardResponse<T> = {
  games?: T[];
  week?: number | null;
};

type FeaturedGame = {
  id: number;
  awayTeam: string;
  homeTeam: string;
  time: string;
  label: string;
  tone: "cfb" | "nfl";
};

function teamKey(team: string) {
  return team
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function teamsMatch(team: string, reference: string) {
  const gameTeam = teamKey(team);
  const rivalryTeam = teamKey(reference);
  const matchingReferenceTeams = rivalries
    .flatMap((rivalry) => rivalry.teams)
    .map(teamKey)
    .filter((candidate) => gameTeam === candidate || gameTeam.startsWith(`${candidate} `));
  const mostSpecificMatch = Math.max(...matchingReferenceTeams.map((candidate) => candidate.length), 0);

  return (
    (gameTeam === rivalryTeam || gameTeam.startsWith(`${rivalryTeam} `)) &&
    rivalryTeam.length === mostSpecificMatch
  );
}

function getCfbFeature(game: CfbGame) {
  const rivalry = rivalries.find((entry) =>
    entry.teams.every((team) =>
      teamsMatch(game.homeTeam, team) || teamsMatch(game.awayTeam, team)
    )
  );

  if (game.homeRank && game.awayRank && game.homeRank <= 10 && game.awayRank <= 10) {
    return { label: "🔥 TOP-10 SHOWDOWN", priority: 3 };
  }

  if (rivalry) {
    return { label: `🏆 ${rivalry.name.toUpperCase()}`, priority: 2 };
  }

  if (game.homeRank && game.awayRank) {
    return { label: "📈 RANKED MATCHUP", priority: 1 };
  }

  return null;
}

function LeagueSnapshot({
  title,
  week,
  games,
  href,
  emptyMessage,
}: {
  title: string;
  week: number | null;
  games: FeaturedGame[];
  href: string;
  emptyMessage: string;
}) {
  return (
    <section className={`football-snapshot__league football-snapshot__league--${games[0]?.tone ?? href.slice(1)}`}>
      <div className="football-snapshot__league-heading">
        <div>
          <p>{week ? `WEEK ${week}` : "THIS WEEK"}</p>
          <h2>{title}</h2>
        </div>
        <Link href={href}>Open centre <span aria-hidden="true">→</span></Link>
      </div>

      {games.length > 0 ? (
        <div className="football-snapshot__game-list">
          {games.map((game) => (
            <article className="football-snapshot__game" key={game.id}>
              <div className="football-snapshot__game-flag">{game.label}</div>
              <strong>{game.awayTeam} <span>@</span> {game.homeTeam}</strong>
              <small>{game.time}</small>
            </article>
          ))}
        </div>
      ) : (
        <p className="football-snapshot__empty">{emptyMessage}</p>
      )}
    </section>
  );
}

export function FootballSnapshot() {
  const [cfb, setCfb] = useState<ScoreboardResponse<CfbGame>>({});
  const [nfl, setNfl] = useState<ScoreboardResponse<NFLGame>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      try {
        const [cfbResponse, nflResponse] = await Promise.all([
          fetch("/api/scoreboard"),
          fetch("/api/nfl/scoreboard"),
        ]);

        if (cancelled) return;

        if (cfbResponse.ok) setCfb(await cfbResponse.json());
        if (nflResponse.ok) setNfl(await nflResponse.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSnapshot();
    const interval = window.setInterval(loadSnapshot, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const cfbGames = useMemo(() =>
    (cfb.games ?? [])
      .map((game) => ({ game, feature: getCfbFeature(game) }))
      .filter((entry): entry is { game: CfbGame; feature: NonNullable<ReturnType<typeof getCfbFeature>> } => entry.feature !== null)
      .sort((left, right) => right.feature.priority - left.feature.priority || Date.parse(left.game.startDate) - Date.parse(right.game.startDate))
      .slice(0, 6)
      .map(({ game, feature }) => ({
        id: game.id,
        awayTeam: game.awayRank ? `#${game.awayRank} ${game.awayTeam}` : game.awayTeam,
        homeTeam: game.homeRank ? `#${game.homeRank} ${game.homeTeam}` : game.homeTeam,
        time: formatGameTime(game.startDate),
        label: feature.label,
        tone: "cfb" as const,
      })),
    [cfb.games]
  );

  const nflGames = useMemo(() =>
    (nfl.games ?? [])
      .map((game) => ({
        game,
        indicator: getNflInternationalIndicator(game) ?? getNflPrimeTimeIndicator(game),
      }))
      .filter((entry): entry is { game: NFLGame; indicator: NonNullable<ReturnType<typeof getNflInternationalIndicator>> } => entry.indicator !== null)
      .sort((left, right) => Date.parse(left.game.startDate) - Date.parse(right.game.startDate))
      .slice(0, 6)
      .map(({ game, indicator }) => ({
        id: game.id,
        awayTeam: game.awayTeam,
        homeTeam: game.homeTeam,
        time: formatGameTime(game.startDate),
        label: indicator.label,
        tone: "nfl" as const,
      })),
    [nfl.games]
  );

  return (
    <main className="football-snapshot">
      <div className="football-snapshot__container">
        <header className="football-snapshot__header">
          <div>
            <p className="football-snapshot__eyebrow">Live Updates, Stats and Content Filter</p>
            <h1>AAW NETWORK</h1>
            <p className="football-snapshot__subtitle">Your combined NFL and college football weekly snapshot.</p>
          </div>
          <div className="football-snapshot__brand" aria-label="AAW Network" />
        </header>

        <section className="football-snapshot__intro">
          <div>
            <p>THE WEEK AHEAD</p>
            <h2>Upcoming rivalry games and more.</h2>
          </div>
          <span>{loading ? "Refreshing live data…" : "Live data powered by ESPN"}</span>
        </section>

        <div className="football-snapshot__leagues">
          <LeagueSnapshot
            title="CFB"
            week={cfb.week ?? null}
            games={cfbGames}
            href="/cfb"
            emptyMessage="No featured CFB matchups are available right now. Open the CFB centre for the full slate."
          />
          <LeagueSnapshot
            title="NFL"
            week={nfl.week ?? null}
            games={nflGames}
            href="/nfl"
            emptyMessage="No international or primetime NFL games are available right now. Open the NFL centre for the full slate."
          />
        </div>

        <section className="football-snapshot__explore">
          <div>
            <p>GO DEEPER</p>
            <h2>In-depth stats, games and more by going to each league's hub.</h2>
          </div>
          <div>
            <Link href="/cfb" className="football-snapshot__explore-link football-snapshot__explore-link--cfb">CFB Centre <span>→</span></Link>
            <Link href="/nfl" className="football-snapshot__explore-link football-snapshot__explore-link--nfl">NFL Centre <span>→</span></Link>
          </div>
        </section>
      </div>
    </main>
  );
}
