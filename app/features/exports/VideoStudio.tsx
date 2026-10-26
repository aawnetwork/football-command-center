"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OverlayGame, OverlayTeam } from './game-overlay';
import { drawReelFrame, REEL_FPS, REEL_HEIGHT, REEL_SECONDS, REEL_WIDTH, type ReelImages, type ReelTreatment } from './reel-renderer';

type Stage = 'pregame' | 'final';
type Loaded = { key: string; awayLogo: ImageBitmap; homeLogo: ImageBitmap; wordmark: ImageBitmap };
type VideoResult = { url: string; filename: string; size: number };

async function bitmapFromUrl(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
  if (!response.ok) throw new Error('An export image could not be loaded.');
  const image = await response.blob();
  if (image.size > 8_000_000 || !image.type.startsWith('image/')) throw new Error('An export image is unavailable or too large.');
  return createImageBitmap(image);
}

async function teamBitmap(team: OverlayTeam, league: string, signal: AbortSignal) {
  const logo = team.logo ?? team.primarySurfaceLogo ?? team.darkLogo;
  if (!logo) throw new Error(`No logo is available for ${team.name}.`);
  try { return await bitmapFromUrl(logo, signal); }
  catch (error) {
    if (signal.aborted) throw error;
    if (league !== 'cfb' || !/^\d{1,10}$/.test(team.id)) throw error;
    return bitmapFromUrl(`/api/team-logo?id=${team.id}`, signal);
  }
}

export function VideoStudio() {
  const [league, setLeague] = useState<'cfb' | 'nfl'>('cfb');
  const [stage, setStage] = useState<Stage>('final');
  const [week, setWeek] = useState('');
  const [reload, setReload] = useState(0);
  const [games, setGames] = useState<OverlayGame[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [treatment, setTreatment] = useState<ReelTreatment>('dark');
  const [size, setSize] = useState<1080 | 720>(1080);
  const [file, setFile] = useState<File | null>(null);
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Loading game selections…');
  const [playing, setPlaying] = useState(false);
  const [moment, setMoment] = useState(4);
  const [result, setResult] = useState<VideoResult | null>(null);
  const resultUrl = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = games.find(row => row.id === selected);
  const gameKey = game ? `${league}:${game.id}` : '';
  const images: ReelImages | null = useMemo(() => game && loaded?.key === gameKey
    ? { awayLogo: loaded.awayLogo, homeLogo: loaded.homeLogo, wordmark: loaded.wordmark, photo }
    : null, [game, gameKey, loaded, photo]);

  const clearResult = useCallback(() => {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = null;
    setResult(null);
    setPlaying(false);
  }, []);

  useEffect(() => () => {
    controller.current?.abort();
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams({ league: league.toUpperCase(), ...(week ? { week } : {}) });
    void (async () => {
      try {
        const response = await fetch(`/api/admin/export-games?${params}`, { signal: abort.signal });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.games)) throw new Error(data.error ?? 'Game list unavailable.');
        const rows: OverlayGame[] = data.games.filter((row: OverlayGame) => row.stage === stage);
        if (abort.signal.aborted) return;
        setGames(rows);
        setSelected(rows[0]?.id ?? '');
        setMessage(rows.length ? 'Choose a game, review the source scores, and preview your video.' : 'No games in this category for the chosen week. Try another week.');
      } catch (error) {
        if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : 'Game list unavailable.');
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [league, week, stage, reload]);

  useEffect(() => {
    const abort = new AbortController();
    if (!game) return;
    const created: ImageBitmap[] = [];
    const keep = (image: ImageBitmap) => {
      if (abort.signal.aborted) { image.close(); throw new Error('Cancelled image load.'); }
      created.push(image);
      return image;
    };
    void (async () => {
      try {
        const awayLogo = keep(await teamBitmap(game.away, league, abort.signal));
        const homeLogo = keep(await teamBitmap(game.home, league, abort.signal));
        const wordmark = keep(await bitmapFromUrl('/exports/aaw-network-wordmark.png', abort.signal));
        if (abort.signal.aborted) return;
        setLoaded({ key: gameKey, awayLogo, homeLogo, wordmark });
      } catch (error) {
        if (!abort.signal.aborted) {
          const detail = error instanceof Error ? error.message : 'The team logos could not load.';
          setImageError(detail);
          setMessage(detail);
        }
      }
    })();
    return () => { abort.abort(); created.forEach(image => image.close()); };
  }, [game, gameKey, league]);

  useEffect(() => () => photo?.close(), [photo]);

  useEffect(() => {
    let cancelled = false;
    if (!file) return;
    void createImageBitmap(file).then(image => {
      if (cancelled) image.close();
      else setPhoto(image);
    }).catch(() => { if (!cancelled) { setMessage('The background photo could not be decoded. Try JPEG, PNG or WebP.'); setFile(null); } });
    return () => { cancelled = true; };
  }, [file]);

  const paint = useCallback((canvas: HTMLCanvasElement, time: number) => {
    if (!game || !images) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sans = getComputedStyle(document.body).fontFamily || 'Arial, sans-serif';
    const display = getComputedStyle(document.querySelector('.export-studio h1') ?? document.body).fontFamily || sans;
    drawReelFrame(ctx, { game, images, treatment, time, sans, display });
  }, [game, images, treatment]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !images) return;
    if (!playing) { paint(canvas, moment); return; }
    const started = performance.now() - moment * 1000;
    let frameId = 0;
    const tick = () => {
      const elapsed = (performance.now() - started) / 1000;
      paint(canvas, Math.min(elapsed, REEL_SECONDS));
      if (elapsed >= REEL_SECONDS) { setPlaying(false); setMoment(0); }
      else frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [paint, images, playing, moment]);

  async function generate() {
    if (!game || !images || busy) return;
    clearResult();
    setBusy(true);
    setProgress(0);
    setMessage('Encoding H.264 frames on this computer…');
    const abort = new AbortController();
    controller.current = abort;
    try {
      await document.fonts.ready;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = Math.round(size * REEL_HEIGHT / REEL_WIDTH);
      const { renderMp4 } = await import('./render-mp4');
      const blob = await renderMp4(canvas, seconds => paint(canvas, seconds), setProgress, abort.signal);
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const filename = `aaw-${league}-${stage}-${game.id}-${treatment}-${size}x${canvas.height}.mp4`;
      resultUrl.current = url;
      setResult({ url, filename, size: blob.size });
      setMessage('MP4 ready. Check the playable preview, then download your file.');
    } catch (error) {
      setMessage(abort.signal.aborted ? 'MP4 export cancelled. Your game and settings are unchanged.' : error instanceof Error ? error.message : 'MP4 export failed.');
    } finally {
      if (controller.current === abort) controller.current = null;
      setBusy(false);
    }
  }

  const changeSelection = (change: () => void, reloadSource = true) => {
    clearResult();
    setLoaded(null);
    setImageError(null);
    if (reloadSource) { setLoading(true); setGames([]); setSelected(''); setMessage('Loading games…'); }
    change();
  };

  return <section className="reel-studio" aria-label="Video reel studio">
    <div className="reel-studio__intro">
      <div><strong>VERTICAL VIDEO · REAL MP4</strong><h2>Motion Reel Studio</h2><p>Photo-led, animated football Reels. H.264 MP4, 30 fps, nine seconds. All rendering stays on this computer.</p></div>
      <span>9:16</span>
    </div>
    <div className="export-studio__controls reel-studio__controls">
      <label>League<select disabled={busy} value={league} onChange={event => changeSelection(() => { setLeague(event.target.value as 'cfb' | 'nfl'); setWeek(''); })}><option value="cfb">College football</option><option value="nfl">NFL</option></select></label>
      <label>Video<select disabled={busy} value={stage} onChange={event => changeSelection(() => setStage(event.target.value as Stage))}><option value="final">Final score Reel</option><option value="pregame">Pregame Reel</option></select></label>
      <label>Week<select disabled={busy} value={week} onChange={event => changeSelection(() => setWeek(event.target.value))}><option value="">Current week</option>{Array.from({ length: league === 'cfb' ? 16 : 18 }, (_, i) => <option key={i} value={i + 1}>Week {i + 1}</option>)}</select></label>
      <label>Game<select disabled={busy || loading || !games.length} value={selected} onChange={event => changeSelection(() => setSelected(event.target.value), false)}>{!games.length && <option value="">No eligible games</option>}{games.map(row => <option key={row.id} value={row.id}>{row.away.name} {row.neutral ? 'vs' : '@'} {row.home.name}</option>)}</select></label>
      <label>Colour treatment<select disabled={busy} value={treatment} onChange={event => { clearResult(); setTreatment(event.target.value as ReelTreatment); }}><option value="dark">Navy / light typography</option><option value="light">Cream / navy typography</option></select></label>
      <label>Output size<select disabled={busy} value={size} onChange={event => { clearResult(); setSize(Number(event.target.value) as 1080 | 720); }}><option value={1080}>1080 × 1920 · Full HD</option><option value={720}>720 × 1280 · Faster on older computers</option></select></label>
      <label className="reel-studio__photo">Background photo (optional)<input disabled={busy} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
        const next = event.target.files?.[0] ?? null;
        if (next && (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > 20_000_000)) { setMessage('Choose a JPEG, PNG or WebP image smaller than 20 MB.'); event.target.value = ''; return; }
        clearResult(); setPhoto(null); setFile(next);
      }}/></label>
      <button disabled={busy || loading} type="button" onClick={() => changeSelection(() => setReload(i => i + 1))}>Refresh games</button>
      <p className="reel-studio__note">Photos stay in your browser. Without one, the Reel uses an AAW-coloured background. Music can be added when you publish.</p>
    </div>
    {game && <div className="reel-studio__workspace">
      <div className="reel-studio__preview-panel">
        <h3>Motion preview</h3>
        {images ? <canvas ref={canvasRef} width={540} height={960} aria-label={`Video preview of ${game.away.name} versus ${game.home.name}`}/> : <div className="reel-studio__waiting">{imageError ?? 'Loading official logos…'}</div>}
        <div className="reel-studio__playback"><button type="button" disabled={!images || busy} onClick={() => { setMoment(0); setPlaying(value => !value); }}>{playing ? 'Stop preview' : 'Play preview'}</button><label>Preview point<input type="range" disabled={!images || busy || playing} value={moment} min="0" max={REEL_SECONDS} step="0.1" onChange={event => setMoment(Number(event.target.value))}/></label></div>
        <p>Preview is silent; the download has the same frames at your selected resolution.</p>
      </div>
      <div className="reel-studio__details">
        <h3>Source check</h3>
        <p><strong>{game.away.name}</strong>{stage === 'final' ? ` ${game.away.score}` : ''} {game.neutral ? 'vs' : 'at'} <strong>{game.home.name}</strong>{stage === 'final' ? ` ${game.home.score}` : ''}</p>
        <p>{stage === 'final' ? game.finalLabel : 'Scheduled'} · {game.league} · source checked {new Date(game.observedAt).toLocaleString('en-GB', { timeZone: 'Europe/London' })} UK</p>
        <p>Always check the scores and team names against the intended fixture before publishing.</p>
        <button type="button" disabled={!images || busy} onClick={generate}>{busy ? `Encoding… ${Math.floor(progress * 100)}%` : `Generate ${size === 1080 ? 'Full HD ' : ''}MP4`}</button>
        {busy && <button className="reel-studio__cancel" type="button" onClick={() => controller.current?.abort()}>Cancel export</button>}
        {busy && <progress value={progress} max={1} aria-label="MP4 encoding progress"/>}
        <p role="status" aria-live="polite">{message}</p>
        {result && <div className="reel-studio__result"><h3>Playable MP4 · {(result.size / 1_048_576).toFixed(1)} MB</h3><video src={result.url} controls playsInline preload="metadata" aria-label="Completed MP4 preview"/><a className="reel-studio__download" href={result.url} download={result.filename}>Download MP4</a></div>}
      </div>
    </div>}
    {!game && <p role="status" aria-live="polite">{message}</p>}
    <p className="reel-studio__technical">MP4 (H.264) · {REEL_FPS} fps · {REEL_SECONDS} seconds · no upload or server-side rendering. Video encoding requires browser H.264 support.</p>
  </section>;
}
