"use client";
import { useEffect, useRef, useState } from 'react';
import StatsPreview from '../../preview/nfl-stats/stats-preview';
import { captureCard } from './capture-card';
import { readStatisticalSelection, statisticalExportRows, type StatisticalSelection } from './statistical-selection';
import './statistical-export.css';

type ImageResult = { dataUrl: string; width: number; height: number; name: string; key: string };
export function StatisticalStudio({ league }: { league: string }) {
  const source = useRef<HTMLDivElement>(null), artwork = useRef<HTMLElement>(null);
  const [selection, setSelection] = useState<StatisticalSelection | null>(null);
  const [limit, setLimit] = useState<5 | 10>(10), [theme, setTheme] = useState('dark');
  const [result, setResult] = useState<ImageResult | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('Choose the period, category and statistical column in the source view below.');
  const key = JSON.stringify([league, selection, limit, theme]);
  const currentKey = useRef(key);
  useEffect(() => { currentKey.current = key; }, [key]);
  const rows = selection ? statisticalExportRows(selection, limit) : [];
  useEffect(() => {
    const root = source.current!;
    const read = () => { const next = readStatisticalSelection(root); setSelection(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next); };
    const observer = new MutationObserver(read); observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true }); root.addEventListener('input', read); root.addEventListener('change', read); read();
    return () => { observer.disconnect(); root.removeEventListener('input', read); root.removeEventListener('change', read); };
  }, [league]);
  async function generate() {
    if (!artwork.current || !rows.length) return;
    if (rows.some(row => !row.logo)) { setMessage('A selected team logo is unavailable. Wait for the source logos to load, then generate again.'); return; }
    const capturedKey = key; setBusy(true); setResult(null); setMessage('Preparing fonts and team logos…');
    try {
      const image = await captureCard(artwork.current);
      if (currentKey.current !== capturedKey) throw Error('The statistical selection updated during capture. Generate again for the latest values.');
      setResult({ ...image, key: capturedKey, name: `aaw-${league}-top-${limit}-${selection!.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${theme}.png` });
      setMessage('PNG ready. Transparent edges, with no cropping needed.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Capture unavailable.'); }
    finally { setBusy(false); }
  }
  async function download() {
    if (!result || result.key !== key) return;
    try {
      const blob = await (await fetch(result.dataUrl)).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = result.name; document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { setMessage('Download unavailable. Please try again.'); }
  }
  return <>
    <section className="export-studio__controls" aria-label="Leaderboard export controls">
      <label>Entries<select value={limit} disabled={busy} onChange={e => setLimit(Number(e.target.value) as 5 | 10)}><option value={5}>Top 5</option><option value={10}>Top 10</option></select></label>
      <label>Publishing appearance<select value={theme} disabled={busy} onChange={e => setTheme(e.target.value)}><option value="dark">Dark navy</option><option value="light">Light cream</option></select></label>
      <button disabled={busy || !rows.length} onClick={generate}>{busy ? 'Capturing…' : 'Generate PNG'}</button>
      {result?.key === key && <button onClick={download}>Download PNG</button>}
      <p role="status">{message}</p>
    </section>
    {result?.key === key && <section className="export-studio__preview"><h2>PNG preview · {result.width} × {result.height}</h2><div><img src={result.dataUrl} alt="Statistical leaderboard PNG" /></div></section>}
    <h2>Compact leaderboard</h2>
    <div className="statistical-artboard">
      {rows.length ? <article ref={artwork} className={`statistical-graphic statistical-graphic--${theme}`} data-league={league}>
        <header><span>AAW NETWORK · {league.toUpperCase()}</span><h2>{selection!.title} <small>{rows.every(row => row.rank !== '—') ? `TOP ${rows.length}` : `${rows.length} REPORTED`}</small></h2><p>{selection!.period}</p></header>
        <div>{rows.map((row, i) => <div className="statistical-graphic__row" key={`${row.name}:${row.team}:${i}`}>
          <span className="statistical-graphic__rank">{row.rank}</span>
          <span className="statistical-graphic__logo">{row.logo && <img src={row.logo} alt={`${row.team} logo`} />}</span>
          <div className="statistical-graphic__identity"><strong>{row.name}</strong><small>{row.team}</small></div>
          <strong className="statistical-graphic__value">{row.value}</strong>
        </div>)}</div>
      </article> : <p>Select an available statistical column below. Unavailable values are never exported as zeros.</p>}
    </div>
    {selection && <details><summary>Coverage and source information</summary><p>{selection.coverage} · Rankings cover reported statistics only.</p>{selection.qualifications.map((text, i) => <p key={i}>{text}</p>)}</details>}
    <h2>Stats 2.0 source selection</h2><p>Choose a category, period, conference and column below. The PNG uses the same displayed values and ranks; search narrows the displayed selection.</p>
    <div ref={source} className="statistical-source"><StatsPreview key={league} league={league === 'nfl' ? 'NFL' : 'CFB'} /></div>
  </>;
}
