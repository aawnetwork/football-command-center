"use client";

import Link from "next/link";
import { PreferencesButton } from "../preferences/HubPreferences";
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
    <div className="football-snapshot">
      <a className="football-snapshot__skip" href="#football-week">Skip to football snapshot</a>
      <div className="football-snapshot__container">
        <header className="football-snapshot__header">
          <Link href="/" className="football-snapshot__identity" aria-label="AAW Hub home">
            <span className="football-snapshot__brand" aria-hidden="true" />
            <span className="football-snapshot__hub-label">HUB</span>
          </Link>
          <nav className="football-snapshot__nav" aria-label="Hub navigation">
            <Link href="/" aria-current="page">Overview</Link>
            <Link href="/cfb">CFB Centre</Link>
            <Link href="/nfl">NFL Centre</Link>
          </nav>
          <PreferencesButton />
        </header>

        <main>
        <section className="football-snapshot__hero" aria-labelledby="hub-title">
          <div>
            <p className="football-snapshot__eyebrow">THE AAW FOOTBALL HUB</p>
            <h1 id="hub-title">Your week.<br /><span>Your football.</span></h1>
            <p className="football-snapshot__subtitle">NFL and college football, in focus. Find the games that matter, then explore the numbers behind them.</p>
          </div>
          <div className="football-snapshot__entry">
            <p>CHOOSE YOUR CENTRE</p>
            <Link href="/cfb" className="football-snapshot__centre football-snapshot__centre--cfb"><span><small>COLLEGE FOOTBALL</small><strong>CFB Centre</strong></span><span aria-hidden="true">↗</span></Link>
            <Link href="/nfl" className="football-snapshot__centre football-snapshot__centre--nfl"><span><small>NATIONAL FOOTBALL LEAGUE</small><strong>NFL Centre</strong></span><span aria-hidden="true">↗</span></Link>
            <span className="football-snapshot__entry-note">Games · Stats · Standings · Content</span>
          </div>
        </section>

        <section className="football-snapshot__week" id="football-week" aria-labelledby="week-title" tabIndex={-1}>
        <div className="football-snapshot__intro">
          <div>
            <p>THE WEEK AHEAD</p>
            <h2 id="week-title">The football snapshot.</h2>
          </div>
          <span>Rivalries, ranked matchups &amp; featured NFL games.<br />{loading ? "Refreshing live data…" : "ESPN data · Refreshes every minute"}</span>
        </div>

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

        </section>

        <section className="football-snapshot__network" aria-labelledby="network-title">
          <div>
            <p className="football-snapshot__eyebrow">BEYOND THE NUMBERS</p>
            <h2 id="network-title">American football.<br />British voices.</h2>
            <p>Independent coverage and conversations from across AAW Network.</p>
          </div>
          <div className="football-snapshot__network-links">
            <a href="https://aawnetwork.co.uk/"><span><small>READ</small><strong>AAW Network</strong><span>Stories, analysis and opinion</span></span><span aria-hidden="true">↗</span></a>
            <a href="https://aawnetwork.co.uk/podcasts/"><span><small>LISTEN</small><strong>Our podcasts</strong><span>Find your next football conversation</span></span><span aria-hidden="true">↗</span></a>
          </div>
        </section>
        </main>

        <footer className="football-snapshot__footer">
          <span>AAW NETWORK <span aria-hidden="true">/</span> FOOTBALL HUB</span>
          <nav aria-label="AAW social channels">
            <a href="https://www.instagram.com/aawnetwork/">Instagram</a>
            <a href="https://www.youtube.com/@aawnetwork">YouTube</a>
            <a href="https://x.com/aaw_network">X</a>
            <a href="https://www.tiktok.com/@aawnetwork">TikTok</a>
            <a href="https://www.facebook.com/aawnetwork">Facebook</a>
          </nav>
          <a href="https://aawnetwork.co.uk/privacy-policy-2/">Privacy</a>
        </footer>
      </div>
    </div>
  );
}
