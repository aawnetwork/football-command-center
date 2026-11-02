"use client";
import { useEffect, useRef, useState } from "react";
import { deckTiers, toggleDeckTier } from "../../lib/curated-decks";
import type { DeckDraft } from "../../lib/deck-validation";
import type { PresetInvitation } from "../../lib/preset-invitations";
import type { GuestDeck } from "../../lib/preset-store";
import "../exports/export-studio.css";
import "./preset-contributors.css";

type Game = { id: number; awayTeam: string; homeTeam: string; startDate: string };
const sessionKey = "aaw-preset-invitation";
const empty = (link?: PresetInvitation): DeckDraft => ({ league: "CFB", name: "", season: link?.season ?? new Date().getFullYear(), week: link?.week ?? 1, assignments: {} });
class GuestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function guestApi(token: string, suffix = "", body?: unknown) {
  const response = await fetch(`/api/contributor/presets${suffix}`, {
    cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({ error: "Contributor access is unavailable. Try again." }));
  if (!response.ok) throw new GuestError(data.error ?? "Request failed.", response.status);
  return data;
}
export function GuestPresetEditor() {
  const [token, setToken] = useState("");
  const credentialRef = useRef("");
  const unsavedRef = useRef(false);
  const [invitation, setInvitation] = useState<PresetInvitation | null>(null);
  const [decks, setDecks] = useState<GuestDeck[]>([]);
  const [selected, setSelected] = useState<GuestDeck | null>(null);
  const [draft, setDraft] = useState<DeckDraft>(() => empty());
  const [slate, setSlate] = useState<{ key: string; games: Game[]; error: string }>({ key: "", games: [], error: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = !selected || JSON.stringify(draft) !== JSON.stringify(selected.draft);
  const slateKey = `${draft.season}/${draft.week}`;
  const gamesLoading = slate.key !== slateKey;
  const locked = !!selected && !["draft", "returned"].includes(selected.review_state);
  const disabled = busy || blocked || completed || locked;
  const canCreate = invitation?.mode === "continuous" || decks.length === 0;
  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    async function open() {
      const current = ++generation;
      try {
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const explicitToken = fragment.has("token");
        let credential = explicitToken ? fragment.get("token") ?? "" : credentialRef.current;
        // Remove the secret before any API requests or navigation. Fragment tokens
        // never reach the web server or its URL logs; storage is per-tab only.
        if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
        if (!explicitToken && !credential) { try { credential = sessionStorage.getItem(sessionKey) ?? ""; } catch { /* Storage may be disabled. */ } }
        if (!/^[a-f0-9]{64}$/.test(credential)) throw new Error("Open the full contributor link AAW sent you.");
        credentialRef.current = credential;
        try { sessionStorage.setItem(sessionKey, credential); } catch { /* Storage may be disabled. */ }
        const data = await guestApi(credential);
        if (cancelled || current !== generation) return;
        setToken(credential); setInvitation(data.invitation); setDecks(data.decks);
        const first = data.decks[0] ?? null; setSelected(first); setDraft(first?.draft ?? empty(data.invitation));
      } catch (e) { if (!cancelled && current === generation) { setError((e as Error).message); setBlocked(true); } }
      finally { if (!cancelled && current === generation) setLoading(false); }
    }
    function reopen() {
      if (!window.location.hash) return;
      if (unsavedRef.current && !window.confirm("Discard unsaved changes and open this invitation?")) {
        window.history.replaceState(null, "", window.location.pathname); return;
      }
      setLoading(true); setCompleted(false); setBlocked(false); setError(""); setMessage("");
      setToken(""); setInvitation(null); setDecks([]); setSelected(null); setDraft(empty());
      setSlate({ key: "", games: [], error: "" }); credentialRef.current = "";
      try { sessionStorage.removeItem(sessionKey); } catch { /* Optional storage. */ }
      void open();
    }
    void open();
    window.addEventListener("hashchange", reopen);
    return () => { cancelled = true; window.removeEventListener("hashchange", reopen); };
  }, []);
  useEffect(() => {
    if (!token || blocked || completed) return;
    let cancelled = false;
    guestApi(token, `?view=games&season=${draft.season}&week=${draft.week}`)
      .then((data) => { if (!cancelled) setSlate({ key: slateKey, games: data.games, error: "" }); })
      .catch((e) => { if (!cancelled) { setSlate({ key: slateKey, games: [], error: e.message }); if (e.status === 403 || e.status === 410) { setBlocked(true); setError(e.message); } } });
    return () => { cancelled = true; };
  }, [token, draft.season, draft.week, slateKey, blocked, completed]);
  useEffect(() => {
    unsavedRef.current = !!(!completed && dirty && (draft.name || Object.keys(draft.assignments).length));
    const warn = (event: BeforeUnloadEvent) => { if (unsavedRef.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, draft, completed]);
  function choose(deck: GuestDeck | null) {
    if (dirty && (draft.name || Object.keys(draft.assignments).length) && !window.confirm("Discard unsaved changes?")) return;
    setSelected(deck); setDraft(deck?.draft ?? empty(invitation!)); setError(""); setMessage("");
  }
  async function reload() {
    if (dirty && (draft.name || Object.keys(draft.assignments).length) && !window.confirm("Discard unsaved changes and reload?")) return;
    setBusy(true); setError("");
    try {
      const data = await guestApi(token); setInvitation(data.invitation); setDecks(data.decks);
      const latest = data.decks.find((deck: GuestDeck) => deck.id === selected?.id) ?? data.decks[0] ?? null;
      setSelected(latest); setDraft(latest?.draft ?? empty(data.invitation)); setMessage("Latest saved presets loaded.");
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }
  function handleError(e: unknown) {
    setError((e as Error).message);
    if (e instanceof GuestError && [401, 403, 410].includes(e.status)) setBlocked(true);
  }
  async function act(action: "create" | "save" | "submit") {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await guestApi(token, "", { action, ...(selected ? { id: selected.id, revision: selected.revision } : {}), ...(action !== "submit" ? { draft } : {}) });
      setSelected(data.deck); setDraft(data.deck.draft); setDecks((current) => [data.deck, ...current.filter((deck) => deck.id !== data.deck.id)]);
      if (data.consumed) { setCompleted(true); setToken(""); credentialRef.current = ""; try { sessionStorage.removeItem(sessionKey); } catch { /* Optional storage. */ } }
      setMessage(action === "submit" ? "Submitted to AAW for review. Your preset will appear publicly only if an admin publishes it." : "Draft saved privately. When ready, submit it to AAW for review.");
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }
  function changeSlate(season: number, week: number) {
    if (!Object.keys(draft.assignments).length || window.confirm("Changing season or week clears this draft's game assignments. Continue?")) setDraft({ ...draft, season, week, assignments: {} });
  }
  return <main className="export-studio guest-presets">
    <header><p>AAW · CONTRIBUTOR PRESETS</p><h1>Create your CFB preset</h1><p>Save your selections privately, then submit them to AAW. An admin reviews and publishes approved presets.</p></header>
    {loading && <p role="status">Checking your invitation…</p>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {completed && <p>Your one-preset invitation is now closed. If AAW returns this preset for changes, you can reopen your original link.</p>}
    {invitation && !blocked && !completed && <>
      <p>Contributor: <strong>{invitation.label}</strong> · {invitation.mode === "one_time" ? "One preset; draft saves are allowed until submission." : "Continuous access; AAW can revoke this link."}{invitation.expires_at && ` Expires ${new Date(invitation.expires_at).toLocaleString("en-GB")}.`}</p>
      <section className="export-studio__controls" aria-label="Your presets">
        <label>Your saved presets<select disabled={busy} value={selected?.id ?? ""} onChange={(e) => choose(decks.find((deck) => deck.id === e.target.value) ?? null)}>
          {canCreate && <option value="">Create a new preset</option>}{decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.draft.name} · {deck.draft.season} W{deck.draft.week} · {deck.review_state}</option>)}
        </select></label>
        {canCreate && <button disabled={busy} onClick={() => choose(null)}>New preset</button>}
        <button disabled={busy} onClick={reload}>Reload saved presets</button>
        {selected && <p className="preset-status">Status: {selected.review_state === "returned" ? "Changes requested" : selected.review_state}</p>}
        {selected?.review_note && <p>AAW feedback: {selected.review_note}</p>}
        {locked && <p>This submitted version is locked. AAW can return it if changes are needed.</p>}
      </section>
      <section className="export-studio__controls" aria-label="Preset editor">
        <label>Preset name<input maxLength={100} value={draft.name} disabled={disabled} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Season<select value={draft.season} disabled={disabled || invitation.season !== null} onChange={(e) => { const season = Number(e.target.value); changeSlate(season, draft.week === 0 && season !== 2026 ? 1 : draft.week); }}>{Array.from({ length: new Date().getFullYear() - 1998 }, (_, i) => new Date().getFullYear() + 1 - i).map((year) => <option key={year}>{year}</option>)}</select></label>
        <label>Week<select value={draft.week} disabled={disabled || invitation.week !== null} onChange={(e) => changeSlate(draft.season, Number(e.target.value))}>{Array.from({ length: draft.season === 2026 ? 17 : 16 }, (_, i) => draft.season === 2026 ? i : i + 1).map((week) => <option key={week} value={week}>Week {week}</option>)}</select></label>
        <button disabled={disabled || gamesLoading || !!slate.error || !draft.name.trim() || !dirty} onClick={() => act(selected ? "save" : "create")}>{busy ? "Working…" : "Save Draft"}</button>
        <button disabled={disabled || dirty || !selected || gamesLoading || !!slate.error || !Object.keys(draft.assignments).length} onClick={() => act("submit")}>Submit for Review</button>
        <p>{dirty ? "You have unsaved changes. Save your draft before submitting." : "Your draft is saved."} Submission locks this version for review.</p>
      </section>
      <h2>Games · {Object.keys(draft.assignments).length} assigned</h2>
      {gamesLoading && <p role="status">Loading verified games…</p>}{!gamesLoading && slate.error && <p role="alert">{slate.error}</p>}
      {!gamesLoading && slate.games.map((game) => <div className="preset-game" key={game.id}>
        <div>{game.awayTeam} @ {game.homeTeam}<time dateTime={game.startDate}>{new Date(game.startDate).toLocaleString("en-GB", { timeZone: "Europe/London" })} UK</time></div>
        <div className="preset-tiers">{deckTiers.map((tier) => <button key={tier} disabled={disabled} aria-label={`${game.awayTeam} at ${game.homeTeam}: ${tier}`} aria-pressed={draft.assignments[game.id] === tier} onClick={() => setDraft({ ...draft, assignments: toggleDeckTier(draft.assignments, game.id, tier) })}>{tier}</button>)}</div>
      </div>)}
    </>}
  </main>;
}
