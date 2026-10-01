"use client";

import { useState } from "react";

type League = "CFB" | "NFL";

type Preview = {
  matched: { row: { matchup: string; platforms: string[] }; game: { id: number; awayTeam: string; homeTeam: string } }[];
  unmatched: { matchup: string; platforms: string[] }[];
  skipped: { matchup: string }[];
  imported?: boolean;
  importedCount?: number;
};

const leagueCopy: Record<League, { title: string; description: string }> = {
  CFB: {
    title: "CFB weekly CSV",
    description: "Upload this week’s confirmed UK TV and streaming availability for college football.",
  },
  NFL: {
    title: "NFL weekly CSV",
    description: "Upload this week’s confirmed UK TV and streaming availability for NFL games.",
  },
};

export default function BroadcastImportPage() {
  const [files, setFiles] = useState<Partial<Record<League, File>>>({});
  const [password, setPassword] = useState("");
  const [previews, setPreviews] = useState<Partial<Record<League, Preview>>>({});
  const [messages, setMessages] = useState<Partial<Record<League, string>>>({});
  const [loadingLeague, setLoadingLeague] = useState<League | null>(null);

  async function submit(league: League, mode: "preview" | "commit") {
    const file = files[league];
    if (!file) {
      setMessages((current) => ({ ...current, [league]: `Choose the ${league} CSV first.` }));
      return;
    }

    setLoadingLeague(league);
    setMessages((current) => ({ ...current, [league]: undefined }));
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("league", league);
      formData.set("mode", mode);
      const response = await fetch("/api/broadcast-availability", {
        method: "POST",
        headers: { "x-broadcast-import-token": password },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The import could not be completed.");

      setPreviews((current) => ({ ...current, [league]: result }));
      if (mode === "commit") {
        setMessages((current) => ({
          ...current,
          [league]: `${result.importedCount} ${league} game${result.importedCount === 1 ? "" : "s"} imported to the live cards.`,
        }));
      }
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [league]: error instanceof Error ? error.message : "The import could not be completed.",
      }));
    } finally {
      setLoadingLeague(null);
    }
  }

  function results(league: League) {
    const preview = previews[league];
    if (!preview) return null;

    return (
      <section className="broadcast-import__results">
        <div>
          <h2>Matched games <span>{preview.matched.length}</span></h2>
          {preview.matched.length ? <ul>{preview.matched.map(({ row, game }) => <li key={game.id}><strong>{row.matchup}</strong><small>→ {game.awayTeam} @ {game.homeTeam} · 📺 {row.platforms.join(" · ")}</small></li>)}</ul> : <p>No {league} games matched this file.</p>}
        </div>
        <div>
          <h2>Unmatched <span>{preview.unmatched.length}</span></h2>
          {preview.unmatched.length ? <ul>{preview.unmatched.map((row) => <li key={row.matchup}><strong>{row.matchup}</strong><small>Not found in the {league} schedule.</small></li>)}</ul> : <p>Every game row matched.</p>}
        </div>
        <div>
          <h2>Skipped <span>{preview.skipped.length}</span></h2>
          {preview.skipped.length ? <ul>{preview.skipped.map((row) => <li key={row.matchup}><strong>{row.matchup}</strong><small>Not a game row or no recognised UK broadcaster.</small></li>)}</ul> : <p>No rows were skipped.</p>}
        </div>
      </section>
    );
  }

  return (
    <main className="broadcast-import">
      <div className="broadcast-import__container">
        <header>
          <p>AAW FOOTBALL DESK</p>
          <h1>Broadcast availability</h1>
          <span>Keep the same four columns in both files: Date, Time, Matchup and Platform. Preview each league before publishing it to the game cards.</span>
        </header>

        <section className="broadcast-import__password">
          <label>
            Import password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Set in Vercel as BROADCAST_IMPORT_TOKEN" />
          </label>
        </section>

        <div className="broadcast-import__lanes">
          {(["CFB", "NFL"] as League[]).map((league) => {
            const preview = previews[league];
            const loading = loadingLeague === league;
            return (
              <section className="broadcast-import__form broadcast-import__lane" key={league}>
                <div>
                  <p className="broadcast-import__league">{league}</p>
                  <h2>{leagueCopy[league].title}</h2>
                  <span>{leagueCopy[league].description}</span>
                </div>
                <label>
                  {league} CSV
                  <input type="file" accept=".csv,text/csv" onChange={(event) => setFiles((current) => ({ ...current, [league]: event.target.files?.[0] }))} />
                </label>
                <div className="broadcast-import__actions">
                  <button type="button" onClick={() => submit(league, "preview")} disabled={loading}>{loading ? "Checking…" : "Preview matches"}</button>
                  <button type="button" onClick={() => submit(league, "commit")} disabled={loading || !preview?.matched.length}>Confirm import</button>
                </div>
                {messages[league] && <p className="broadcast-import__message">{messages[league]}</p>}
                {results(league)}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
