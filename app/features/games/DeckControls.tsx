"use client";

import { useState } from "react";
import { availableDecks, deckTiers, groupDeckGames, type CuratedDeck, type DeckGame, type DeckTier } from "../../lib/curated-decks";
import { createDeckPng } from "./deck-png";

type Props = {
  season: number;
  week: number;
  decks: readonly CuratedDeck[];
  games: DeckGame[];
  tiers: Record<number, DeckTier>;
  activeDeckId?: string;
  onLoad: (deck: CuratedDeck) => void;
  onRestore: () => void;
};

export function DeckControls({ season, week, decks, games, tiers, activeDeckId, onLoad, onRestore }: Props) {
  const [sharing, setSharing] = useState(false);
  const [included, setIncluded] = useState<DeckTier[]>(["S"]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const available = availableDecks(decks, season, week);
  const groups = groupDeckGames(games, tiers, included);
  const caption = `My CFB Week ${week} watchlist (${season}) — ${groups.map((group) => `${group.tier}: ${group.games.map((game) => `${game.awayTeam} @ ${game.homeTeam}`).join("; ")}`).join(" | ")}. Build yours: https://desk.aawnetwork.co.uk/cfb`;

  async function download() {
    setBusy(true);
    setMessage("");
    try {
      const blob = await createDeckPng(season, week, groups);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `aaw-cfb-${season}-week-${week}-my-deck.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("PNG downloaded.");
    } catch {
      setMessage("Could not create the PNG. Please try again.");
    } finally { setBusy(false); }
  }

  async function copyCaption() {
    try { await navigator.clipboard.writeText(caption); setMessage("Caption copied."); }
    catch { setMessage("Clipboard access unavailable. Copy the caption from the box below."); }
  }

  return <div className="deck-controls">
    <div className="deck-controls__actions">
      <label>Load a Deck <select value={activeDeckId ?? ""} disabled={!available.length} onChange={(event) => {
        const deck = available.find((item) => item.id === event.target.value);
        if (deck) onLoad(deck); else onRestore();
      }}>
        <option value="">{available.length ? "My selections" : "No prepared decks this week"}</option>
        {available.map((deck) => <option value={deck.id} key={deck.id}>{deck.name}</option>)}
      </select></label>
      {activeDeckId && <button type="button" onClick={onRestore}>Return to my selections</button>}
      <button type="button" aria-expanded={sharing} onClick={() => { setSharing(!sharing); setMessage(""); }}>Share My Deck</button>
    </div>
    {activeDeckId && <p>Editing a loaded deck for this session. Your saved personal selections are untouched; reloading returns to them.</p>}
    {sharing && <div className="deck-controls__share">
      <h3>Share your Week {week} deck</h3>
      <p>Include tiers below. Only your assigned games are shared, regardless of the conference/tier filter currently on screen.</p>
      <fieldset><legend>Include tiers</legend>{deckTiers.map((tier) => <label key={tier}>
        <input type="checkbox" checked={included.includes(tier)} onChange={(event) => {
          setIncluded(event.target.checked ? [...included, tier] : included.filter((item) => item !== tier)); setMessage("");
        }} /> {tier}{tier === "S" ? " · Must watch" : ""}
      </label>)}</fieldset>
      <p>{groups.reduce((sum, group) => sum + group.games.length, 0)} {groups.reduce((sum, group) => sum + group.games.length, 0) === 1 ? "game" : "games"} selected</p>
      {!groups.length && <p>Assign a game to an included tier to create your graphic.</p>}
      <div className="deck-controls__actions">
        <button type="button" disabled={busy || !groups.length} onClick={download}>{busy ? "Creating PNG…" : "Download PNG"}</button>
        <button type="button" disabled={!groups.length || busy} onClick={copyCaption}>Copy caption</button>
      </div>
      {groups.length > 0 && <textarea aria-label="Suggested social caption" readOnly value={caption} rows={3} />}
      <p role="status" aria-live="polite">{message}</p>
    </div>}
  </div>;
}
