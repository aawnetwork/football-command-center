'use client';
import { useEffect, useRef, useState } from 'react';
import { loadRaceSeries, RACE_METRICS, type RaceMetric, type RaceSeries } from './race-data';
import { drawRaceFrame, raceDuration, RACE_FPS } from './race-renderer';
import { loadRaceBranding } from './race-branding';
import './race-studio.css';

type Result = { url: string; filename: string };
export function VideoStudio() {
  const [league, setLeague] = useState<'CFB' | 'NFL'>('CFB');
  const [metric, setMetric] = useState<RaceMetric>('passing_yards');
  const [start, setStart] = useState(1), [end, setEnd] = useState(9);
  const [series, setSeries] = useState<RaceSeries | null>(null);
  const [moment, setMoment] = useState(0), [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('Choose the statistic and weeks, then load the season.');
  const [result, setResult] = useState<Result | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null), controller = useRef<AbortController | null>(null);
  const resultUrl = useRef<string | null>(null), logos = useRef(new Map<string, ImageBitmap>());
  const duration = series ? raceDuration(series) : 0;
  function clearResult() { if (resultUrl.current) URL.revokeObjectURL(resultUrl.current); resultUrl.current = null; setResult(null); setPlaying(false); }
  function resetSource() { clearResult(); setSeries(null); setMoment(0); }
  useEffect(() => () => {
    controller.current?.abort();
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    logos.current.forEach(image => image.close());
  }, []);
  useEffect(() => {
    if (!series || !canvas.current) return;
    canvas.current.style.fontFamily = getComputedStyle(canvas.current).fontFamily;
    const ctx = canvas.current.getContext('2d');
    if (ctx) drawRaceFrame(ctx, series, moment, { logos: logos.current });
  }, [series, moment]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const begins = performance.now() - moment * 1000;
    function tick(now: number) {
      const seconds = Math.min(duration, (now - begins) / 1000);
      setMoment(seconds);
      if (seconds >= duration) setPlaying(false); else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The start time is captured once when playback is toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration]);
  async function load() {
    clearResult(); setSeries(null); setBusy(true); setMoment(0); setMessage(`Loading Weeks 1–${end}…`);
    const abort = new AbortController(); controller.current = abort;
    try {
      const loaded = await loadRaceSeries(league, metric, start, end, abort.signal, week => setMessage(`Loading Week ${week} of ${end}…`));
      setMessage('Preparing Top 10 team colours and logos…');
      const next = await loadRaceBranding(loaded, abort.signal);
      if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      logos.current.forEach(image => image.close()); logos.current.clear();
      const urls = [...new Set(next.checkpoints.flatMap(point => [...point.entries].sort((a, b) => b.value - a.value).slice(0, 10).map(entry => entry.logo).filter((url): url is string => !!url)))];
      let missing = 0;
      // Bounded batches avoid opening hundreds of image requests simultaneously.
      for (let i = 0; i < urls.length; i += 8) {
        await Promise.all(urls.slice(i, i + 8).map(async url => {
          try {
            const response = await fetch(url, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10_000)]) });
            if (!response.ok) throw Error('Logo unavailable');
            const blob = await response.blob();
            if (blob.size > 8_000_000 || !blob.type.startsWith('image/')) throw Error('Invalid logo');
            const image = await createImageBitmap(blob);
            if (abort.signal.aborted) { image.close(); return; }
            logos.current.set(url, image);
          } catch { missing++; }
        }));
        if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      }
      if (missing) throw Error('Some Top 10 team logos could not be loaded. Retry before exporting.');
      setSeries(next);
      setMessage(`${next.checkpoints.length} checkpoints loaded. Review the race before exporting.`);
    } catch (error) { setMessage(abort.signal.aborted ? 'Loading cancelled.' : error instanceof Error ? error.message : 'Season loading failed.'); }
    finally { setBusy(false); }
  }
  async function generate() {
    if (!series) return;
    clearResult(); setBusy(true);
    const abort = new AbortController(); controller.current = abort;
    try {
      const exportCanvas = document.createElement('canvas'); exportCanvas.width = 1080; exportCanvas.height = 1920;
      exportCanvas.style.fontFamily = canvas.current ? getComputedStyle(canvas.current).fontFamily : 'Arial, sans-serif';
      const ctx = exportCanvas.getContext('2d'); if (!ctx) throw Error('Canvas unavailable.');
      await document.fonts.ready;
      const { renderMp4 } = await import('./render-mp4');
      const blob = await renderMp4(exportCanvas, time => drawRaceFrame(ctx, series, time, { logos: logos.current }),
        progress => setMessage(`Generating MP4… ${Math.round(progress * 100)}%`), abort.signal, { fps: RACE_FPS, seconds: duration });
      if (abort.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const url = URL.createObjectURL(blob); resultUrl.current = url;
      setResult({ url, filename: `aaw-${league.toLowerCase()}-${metric}-season-race-${series.season}-weeks-${start}-${end}.mp4` });
      setMessage('MP4 ready. Play the finished file below, then download.');
    } catch (error) { setMessage(abort.signal.aborted ? 'Export cancelled.' : error instanceof Error ? error.message : 'Export failed.'); }
    finally { setBusy(false); }
  }
  return <section className="race-studio" aria-label="Bar chart race studio">
    <header><h2>Bar chart races</h2><p>Top 10 season leaders, week by week. Team colours and logos, on AAW cream.</p></header>
    <div className="export-studio__controls">
      <label>League<select disabled={busy} value={league} onChange={event => { resetSource(); setLeague(event.target.value as 'CFB' | 'NFL'); }}><option value="CFB">College football</option><option value="NFL">NFL</option></select></label>
      <label>Statistic<select disabled={busy} value={metric} onChange={event => { resetSource(); setMetric(event.target.value as RaceMetric); }}>{Object.entries(RACE_METRICS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      <label>First displayed week<input disabled={busy} type="number" min={1} max={end} value={start} onChange={event => { resetSource(); setStart(Number(event.target.value)); }}/></label>
      <label>Through week<input disabled={busy} type="number" min={start} max={league === 'NFL' ? 18 : 16} value={end} onChange={event => { resetSource(); setEnd(Number(event.target.value)); }}/></label>
      <button disabled={busy || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > (league === 'NFL' ? 18 : 16)} onClick={load}>Load season</button>

    </div>
    <p role="status">{message}</p>
    {series?.reportedOnly && <p className="race-studio__coverage">These are <strong>reported season totals</strong>. Some weeks have incomplete source coverage. The video carries that qualification throughout; it is not labelled a complete national ranking.</p>}
    {series && <div className="race-studio__workspace">
      <div><canvas ref={canvas} width={540} height={960} aria-label={`Top 10 ${series.metric} season bar chart race preview`}/>
        <div className="race-studio__playback"><button disabled={busy} onClick={() => { if (!playing && moment >= duration) setMoment(0); setPlaying(value => !value); }}>{playing ? 'Pause' : 'Play preview'}</button>
          <button disabled={busy} onClick={() => { setPlaying(false); setMoment(0); }}>Restart</button>
          <label>Preview position<input aria-label="Preview position" type="range" min={0} max={duration} step={0.033} value={moment} disabled={busy || playing} onChange={event => setMoment(Number(event.target.value))}/></label></div>
      </div>
      <div><h3>Top 10 · {series.metric}</h3><p>{series.league} · {series.season} · Weeks {start}–{end}</p><p>{duration.toFixed(1)} seconds · 1080 × 1920 · MP4</p>
        <button disabled={busy} onClick={generate}>Generate MP4</button>
        {result && <div><h3>Finished video</h3><video src={result.url} controls playsInline preload="metadata"/><a href={result.url} download={result.filename}>Download MP4</a></div>}
      </div>
    </div>}
    {busy && <button onClick={() => controller.current?.abort()}>Cancel</button>}
  </section>;
}
