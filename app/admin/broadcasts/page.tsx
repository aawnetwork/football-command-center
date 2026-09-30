"use client";

import { useState } from "react";

type Preview = {
  matched: { row: { matchup: string; platforms: string[] }; game: { id: number; awayTeam: string; homeTeam: string } }[];
  unmatched: { matchup: string; platforms: string[] }[];
  skipped: { matchup: string }[];
  imported?: boolean;
  importedCount?: number;
};

export default function BroadcastImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(mode: "preview" | "commit") {
    if (!file) {
      setMessage("Choose your weekly CSV first.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("mode", mode);
      const response = await fetch("/api/broadcast-availability", {
        method: "POST",
        headers: { "x-broadcast-import-token": password },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The import could not be completed.");
      setPreview(result);
      if (mode === "commit") setMessage(`${result.importedCount} game${result.importedCount === 1 ? "" : "s"} imported to the live CFB cards.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The import could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="broadcast-import">
      <div className="broadcast-import__container">
        <header>
          <p>AAW FOOTBALL COMMAND CENTRE</p>
          <h1>Broadcast availability</h1>
          <span>Upload the weekly CFB CSV. Preview the matches first, then publish availability to the game cards.</span>
        </header>

        <section className="broadcast-import__form">
          <label>
            Weekly CSV
            <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <label>
            Import password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Set in Vercel as BROADCAST_IMPORT_TOKEN" />
          </label>
          <div className="broadcast-import__actions">
            <button type="button" onClick={() => submit("preview")} disabled={loading}>{loading ? "Checking…" : "Preview matches"}</button>
            <button type="button" onClick={() => submit("commit")} disabled={loading || !preview?.matched.length}>Confirm import</button>
          </div>
          {message && <p className="broadcast-import__message">{message}</p>}
        </section>

        {preview && <section className="broadcast-import__results">
          <div>
            <h2>Matched games <span>{preview.matched.length}</span></h2>
            {preview.matched.length ? <ul>{preview.matched.map(({ row, game }) => <li key={game.id}><strong>{row.matchup}</strong><small>→ {game.awayTeam} @ {game.homeTeam} · 📺 {row.platforms.join(" · ")}</small></li>)}</ul> : <p>No CFB games matched this file.</p>}
          </div>
          <div>
            <h2>Unmatched <span>{preview.unmatched.length}</span></h2>
            {preview.unmatched.length ? <ul>{preview.unmatched.map((row) => <li key={row.matchup}><strong>{row.matchup}</strong><small>Not found in the FBS schedule.</small></li>)}</ul> : <p>Every game row matched.</p>}
          </div>
          <div>
            <h2>Skipped <span>{preview.skipped.length}</span></h2>
            {preview.skipped.length ? <ul>{preview.skipped.map((row) => <li key={row.matchup}><strong>{row.matchup}</strong><small>Not a game row or no supported platform.</small></li>)}</ul> : <p>No rows were skipped.</p>}
          </div>
        </section>}
      </div>
    </main>
  );
}
