"use client";
import { useEffect, useState } from "react";
import { deckTiers, toggleDeckTier } from "../../lib/curated-decks";
import type { DeckDraft } from "../../lib/deck-validation";
import type { StoredDeck } from "../../lib/deck-store";
import "../exports/export-studio.css";
import { PresetLinkManager } from "./PresetLinkManager";
import type { PresetInvitation } from "../../lib/preset-invitations";
type Game = { id: number; awayTeam: string; homeTeam: string; startDate: string };
const empty = (): DeckDraft => ({ league: "CFB", name: "", season: new Date().getFullYear(), week: 1, assignments: {} });
async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json().catch(() => ({ error: "Admin access expired or the server is unavailable. Reload this page." }));
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body;
}
export function DeckManager() {
  const [decks, setDecks] = useState<StoredDeck[]>([]);
  const [invitations, setInvitations] = useState<PresetInvitation[]>([]);
  const [reviewFilter, setReviewFilter] = useState("all");
  const [reviewNote, setReviewNote] = useState("");
  const [selected, setSelected] = useState<StoredDeck | null>(null);
  const [draft, setDraft] = useState<DeckDraft>(empty);
  const [slate, setSlate] = useState<{ key: string; games: Game[]; error: string }>({ key: "", games: [], error: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const slateKey = `${draft.season}/${draft.week}`;
  const gamesLoading = slate.key !== slateKey;
  const games = gamesLoading ? [] : slate.games;
  const gamesError = gamesLoading ? "" : slate.error;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const contributor = invitations.find((link) => link.id === selected?.contributor_link_id);
  const visibleDecks = decks.filter((deck) => reviewFilter === "all" || (reviewFilter === "internal" ? !deck.contributor_link_id : deck.contributor_link_id && deck.review_state === reviewFilter));
  const dirty = !selected || JSON.stringify(draft) !== JSON.stringify(selected.draft);
  useEffect(() => {
    let cancelled = false;
    api("/api/admin/decks").then((data) => { if (!cancelled) setDecks(data.decks); })
      .catch((e) => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    api(`/api/admin/decks?view=games&season=${draft.season}&week=${draft.week}`)
      .then((data) => { if (!cancelled) setSlate({ key: `${draft.season}/${draft.week}`, games: data.games, error: "" }); })
      .catch((e) => { if (!cancelled) setSlate({ key: `${draft.season}/${draft.week}`, games: [], error: e.message }); });
    return () => { cancelled = true; };
  }, [draft.season, draft.week]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && (draft.name || Object.keys(draft.assignments).length)) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, draft]);
  function choose(deck: StoredDeck | null) {
    if (dirty && (draft.name || Object.keys(draft.assignments).length) && !window.confirm("Discard unsaved changes?")) return false;
    setSelected(deck); setDraft(deck?.draft ?? empty()); setReviewNote(""); setError(""); setMessage(""); return true;
  }
  async function reload() {
    setBusy(true); setError("");
    try {
      const data = await api("/api/admin/decks"); setDecks(data.decks);
      if (selected) { const latest = data.decks.find((d: StoredDeck) => d.id === selected.id); if (latest) { setSelected(latest); setDraft(latest.draft); } }
      setMessage("Latest saved decks loaded.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function act(action: "create" | "save" | "publish" | "unpublish") {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await api("/api/admin/decks", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(selected ? { id: selected.id, revision: selected.revision } : {}), ...(["save", "create"].includes(action) ? { draft } : {}) }) });
      setSelected(data.deck); setDraft(data.deck.draft); setReviewFilter("all");
      setDecks((current) => [data.deck, ...current.filter((deck) => deck.id !== data.deck.id)]);
      setMessage(action === "publish" ? "Published. Refresh public CFB Games to load this deck." : action === "unpublish" ? "Unpublished. Your draft is retained." : "Draft saved. The public version is unchanged.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function returnForChanges() {
    if (!selected || dirty) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await api("/api/admin/preset-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "return", id: selected.id, revision: selected.revision, note: reviewNote }) });
      setSelected(data.deck); setDraft(data.deck.draft); setReviewNote(""); setReviewFilter("all");
      setDecks((current) => [data.deck, ...current.filter((deck) => deck.id !== data.deck.id)]);
      setMessage("Returned for changes. The contributor can reopen their original link unless it is revoked or expired. Any existing public version is unchanged.");
      const links = await api("/api/admin/preset-links"); setInvitations(links.invitations);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="export-studio">
    <header><p>AAW · PRIVATE ADMIN</p><h1>CFB Deck Manager</h1><p>Save privately. Publish only when your selections are ready.</p>
      <a href="/admin/exports">Export Studio</a> · <a href="/cfb">Public CFB Desk</a></header>
    <PresetLinkManager invitations={invitations} onInvitations={setInvitations} />
    <section className="export-studio__controls" aria-label="Deck controls">
      <label>Show presets<select value={reviewFilter} disabled={busy} onChange={(e) => { if (choose(null)) setReviewFilter(e.target.value); }}>
        <option value="all">All presets</option><option value="submitted">Awaiting review</option><option value="draft">Contributor drafts</option><option value="returned">Changes requested</option><option value="approved">Approved contributor presets</option><option value="internal">AAW presets</option>
      </select></label>
      <label>Saved decks <select disabled={busy || loading} value={selected?.id ?? ""} onChange={(e) => choose(decks.find((deck) => deck.id === e.target.value) ?? null)}>
        <option value="">Create a new deck</option>{visibleDecks.map((deck) => <option key={deck.id} value={deck.id}>{deck.draft.name} · {deck.draft.season} W{deck.draft.week} · {deck.contributor_link_id ? `${deck.review_state} · ${invitations.find((link) => link.id === deck.contributor_link_id)?.label ?? "Contributor"}` : deck.published ? "Published" : "Draft"}</option>)}
      </select></label>
      <button disabled={busy || loading} onClick={() => choose(null)}>Create Deck</button>
      <button disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard unsaved changes and reload?")) void reload(); }}>Reload saved decks</button>
      {loading && <p role="status">Loading saved decks…</p>}
    </section>
    {selected?.contributor_link_id && <section className="export-studio__controls preset-review" aria-label="Contributor review">
      <h2>Contributor review</h2><p>Contributor: <strong>{contributor?.label ?? "Contributor"}</strong> · Status: <span className="preset-status">{selected.review_state}</span>{selected.submitted_at && ` · Submitted ${new Date(selected.submitted_at).toLocaleString("en-GB")}`}</p>
      {selected.review_note && <p>Previous feedback: {selected.review_note}</p>}
      {!["submitted", "approved"].includes(selected.review_state) && <p>The contributor must submit a version for review before you can publish it.</p>}
      {(selected.review_state === "submitted" || selected.review_state === "approved") && <>
        <label>Feedback for the contributor<textarea rows={3} value={reviewNote} maxLength={1000} disabled={busy} onChange={(e) => setReviewNote(e.target.value)} /></label>
        <button disabled={busy || dirty || !reviewNote.trim()} onClick={returnForChanges}>Return for changes</button>
        <p>Returning reopens the same preset for editing. Revoked and expired invitations stay closed. Save any admin edits first.</p>
      </>}
    </section>}
    <section className="export-studio__controls" aria-label="Deck editor">
      <label>Name <input value={draft.name} maxLength={100} disabled={busy} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Season <select value={draft.season} disabled={busy} onChange={(e) => {
        if (!Object.keys(draft.assignments).length || window.confirm("Changing season clears this draft's game assignments. Continue?")) setDraft({ ...draft, season: Number(e.target.value), week: draft.week === 0 ? 1 : draft.week, assignments: {} });
      }}>{Array.from({ length: new Date().getFullYear() - 1998 }, (_, i) => new Date().getFullYear() + 1 - i).map((year) => <option key={year}>{year}</option>)}</select></label>
      <label>Week <select value={draft.week} disabled={busy} onChange={(e) => {
        if (!Object.keys(draft.assignments).length || window.confirm("Changing week clears this draft's game assignments. Continue?")) setDraft({ ...draft, week: Number(e.target.value), assignments: {} });
      }}>{Array.from({ length: draft.season === 2026 ? 17 : 16 }, (_, i) => draft.season === 2026 ? i : i + 1).map((week) => <option key={week} value={week}>Week {week}</option>)}</select></label>
      <button disabled={busy || gamesLoading || !!gamesError || !draft.name.trim() || !dirty} onClick={() => act(selected ? "save" : "create")}>{busy ? "Working…" : "Save Draft"}</button>
      <button disabled={busy || dirty || !selected || gamesLoading || !!gamesError || !Object.keys(draft.assignments).length || !!selected?.contributor_link_id && !["submitted", "approved"].includes(selected.review_state)} onClick={() => act("publish")}>Publish</button>
      <button disabled={busy || !selected?.published} onClick={() => { if (!dirty || window.confirm("Unpublish now? Unsaved edits will be discarded; the saved draft is retained.")) void act("unpublish"); }}>Unpublish</button>
      <p>{selected?.published ? `Published: ${selected.published.name} · ${selected.published.season} Week ${selected.published.week}.` : "Not published."} {dirty ? "Unsaved changes — Save Draft before publishing." : "Draft saved."}</p>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    </section>
    <h2>Games · {Object.keys(draft.assignments).length} assigned</h2>
    {gamesLoading && <p role="status">Loading verified games…</p>}{gamesError && <p role="alert">{gamesError}</p>}
    <div className="deck-controls">{games.map((game) => <div key={game.id} className="deck-controls__actions" style={{ padding: "12px 0", borderBottom: "1px solid #334155" }}>
      <div style={{ flex: 1, minWidth: 260 }}>{game.awayTeam} @ {game.homeTeam}<div style={{ fontSize: 13, color: "#94a3b8" }}>{new Date(game.startDate).toLocaleString("en-GB", { timeZone: "Europe/London" })} UK</div></div>
      {deckTiers.map((tier) => <button key={tier} disabled={busy} aria-label={`${game.awayTeam} at ${game.homeTeam}: ${tier}`} aria-pressed={draft.assignments[game.id] === tier}
        style={draft.assignments[game.id] === tier ? { borderColor: "var(--cc-accent)", background: "var(--cc-accent-soft)" } : {}}
        onClick={() => setDraft({ ...draft, assignments: toggleDeckTier(draft.assignments, game.id, tier) })}>{tier}</button>)}
    </div>)}</div>
  </main>;
}
