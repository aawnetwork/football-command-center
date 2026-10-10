"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureCard } from "./capture-card";
import "./export-studio.css";

type Card = { id: string; label: string; kind: string; node: HTMLElement };
type Export = { id: string; dataUrl: string; width: number; height: number; name: string };
const kinds: Record<string, string> = { game: "Game", performance: "Performance", stats: "Stats", standings: "Standings", "all-time": "All-Time" };

export function ExportStudio() {
  const [league, setLeague] = useState("cfb");
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<Export | null>(null);
  const [busy, setBusy] = useState(false);
  const [recordPeriod, setRecordPeriod] = useState("Career");
  const [hasSingleGame, setHasSingleGame] = useState(false);
  const [message, setMessage] = useState("Choose a tab in the Desk view below, then choose one card to export.");
  const frame = useRef<HTMLIFrameElement>(null);
  const visibleResult = result?.id === selected ? result : null;
  const inspectFrame = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const periodButton = Array.from(doc.querySelectorAll<HTMLButtonElement>(".all-time-panel__controls button[aria-pressed='true']")).find((button) => ["Career", "Season", "Single Game"].includes(button.textContent?.trim() ?? ""));
    if (periodButton) setRecordPeriod(periodButton.textContent!.trim());
    setHasSingleGame(Boolean(doc.querySelector(".all-time-panel__controls")?.textContent?.includes("Single Game")));
    const sourceLeague = new URL(doc.URL).pathname.slice(1);
    if ((sourceLeague === "cfb" || sourceLeague === "nfl") && sourceLeague !== league) {
      setCards([]); setSelected(""); setResult(null); setLeague(sourceLeague);
      return;
    }
      const next = Array.from(doc!.querySelectorAll<HTMLElement>("main [data-desk-export]")).filter((node) => {
        if (!node.getBoundingClientRect().width) return false;
        return node.dataset.deskExport !== "stats" || Boolean(node.querySelector("tbody tr"));
      }).map((node, index) => {
        const kind = node.dataset.deskExport!;
        const label = node.dataset.exportLabel || `Card ${index + 1}`;
        return { id: `${kind}:${label}:${index}`, kind, label, node };
      });
      setCards(next);
      setSelected((current) => next.some((card) => card.id === current) ? current : next[0]?.id ?? "");
  }, [league]);

  useEffect(() => {
    // Also handles a cached iframe loading before React attaches its onLoad.
    const timer = window.setInterval(inspectFrame, 1500);
    return () => window.clearInterval(timer);
  }, [inspectFrame, league]);

  async function generate() {
    const card = cards.find((item) => item.id === selected);
    if (!card) return;
    setBusy(true); setResult(null); setMessage("Capturing the full card, including fonts and logos…");
    try {
      const image = await captureCard(card.node);
      const name = `aaw-${league}-${card.kind}-${card.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}.png`;
      setResult({ ...image, id: card.id, name });
      setMessage("PNG ready. Check the preview, then download it for Canva.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Capture failed. Please try again."); }
    finally { setBusy(false); }
  }

  async function download() {
    if (!visibleResult) return;
    try {
      const blob = await (await fetch(visibleResult.dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = visibleResult.name; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("Download started. Your PNG is ready for Canva.");
    } catch { setMessage("The PNG could not download. Please try again."); }
  }

  return <main className="export-studio">
    <header><p>AAW · PRIVATE EXPORTS</p><h1>Export Studio</h1><p>One real Desk card or table per transparent PNG. Nothing is uploaded or published.</p><a href="/admin/decks">Deck Manager</a></header>
    <section className="export-studio__controls" aria-label="Export controls">
      <label>League <select value={league} disabled={busy} onChange={(event) => {
        setCards([]); setSelected(""); setResult(null); setLeague(event.target.value);
      }}><option value="cfb">College football</option><option value="nfl">NFL</option></select></label>
      <label>Card or table <select value={selected} disabled={busy || !cards.length} onChange={(event) => { setSelected(event.target.value); setResult(null); }}>
        {!cards.length && <option value="">No eligible cards in this view yet</option>}
        {cards.map((card) => <option key={card.id} value={card.id}>{kinds[card.kind]} · {card.label}</option>)}
      </select></label>
      {cards.some((card) => card.kind === "all-time") && <label>Record period <select value={recordPeriod} disabled={busy} onChange={(event) => {
        const button = Array.from(frame.current?.contentDocument?.querySelectorAll<HTMLButtonElement>(".all-time-panel__controls button") ?? []).find((item) => item.textContent?.trim() === event.target.value);
        if (button) { setResult(null); setCards([]); setSelected(""); setRecordPeriod(event.target.value); button.click(); }
      }}>
        <option>Career</option><option>Season</option>
        {hasSingleGame && <option>Single Game</option>}
      </select></label>}
      <button type="button" onClick={generate} disabled={busy || !selected}>{busy ? "Capturing…" : "Generate PNG"}</button>
      {visibleResult && <button type="button" onClick={download}>Download PNG</button>}
      <p role="status" aria-live="polite">{!visibleResult && (message.startsWith("PNG ready") || message.startsWith("Download started")) ? "Choose a card and Generate PNG to capture the current view." : message}</p>
    </section>
    {visibleResult && <section className="export-studio__preview"><h2>Export preview · {visibleResult.width} × {visibleResult.height}</h2><p>The checkerboard is the transparent area, not part of the image.</p><div><img src={visibleResult.dataUrl} alt="Captured Desk card preview" /></div></section>}
    <h2>Desk source view</h2><p>Use its existing tabs, weeks and filters. Captures omit game tier/date footers, performance opponent lines and content angles.</p>
    <div className="export-studio__source"><iframe key={league} ref={frame} src={`/${league}`} title={`${league.toUpperCase()} Desk source`} onLoad={inspectFrame} /></div>
  </main>;
}
