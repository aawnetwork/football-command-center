'use client';

import { startNflPolling } from './nfl-polling';

import { startCfbPolling, type CfbGate } from './cfb-polling';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { NFL_METRICS, NFL_RATES, NFL_DERIVED, type Category, type MetricKey, type PlayerLine, type Period } from '../../lib/stats-v2/nfl-statlines';
import styles from './stats-preview.module.css';
import { CFB_CARD_METRICS, type CardMetrics } from '../../lib/stats-v2/cfb-card-metrics';
import { playerCardMetrics } from './player-card-metrics';
import { RecentGames } from './RecentGames';
import { statsUpdateStatus, playerDetailCheckLabel } from './update-status';
import { StatsCoverage, cfbPeriodLabel, cfbMetricLimitation } from './StatsCoverage';
import { TeamLogo } from '../../components/TeamLogo';
import { useNflPreviewTeams } from './use-nfl-preview-teams';

type DetailLine = Omit<PlayerLine, 'metrics'> & {metrics:CardMetrics};
type Row = { id: string; name: string; teams: string[]; playingNow: boolean | null; values: (number | null)[]; notApplicable: string[] };
type Data = { independentNationalCertification?:boolean; liveWeek?:number; throughWeek?:number; collection?:{expectedGames:number;observedGames:number;missingGames:number;expectedTeamObservations:number;observedTeamObservations:number;missingCategoryTeamObservations:number;unverifiedMembershipPlayers:number;unresolvedPassers:number;validationWarnings:number;ambiguousPlayers:number}; rankScope?: 'reported-values'; sourceAttribution?:string; displayColumns?:MetricKey[]; scope?:string; coveredGames?:number; conferences?: {id:string;name:string}[]; teams?: Record<string, { name: string; logo: string | null }>; fixtureLabel?: string; snapshot: string; observationAt: string; period: Period; complete: boolean; confidence?: Partial<Record<MetricKey, { status: string; supportedPlayers?:number; candidatePlayers?:number; missingPlayers?:number; notApplicablePlayers?:number }>>; columns: MetricKey[]; lines: Row[]; logos: Record<string, string>; coverage: { warnings: string[] }; sources: { live: { status: string } } };
const columns: Record<Category, [MetricKey, string][]> = {
  QB: [['passing_yards', 'YDS'], ['completions', 'CMP'], ['attempts', 'ATT'], ['completion_pct', 'CMP%'], ['passing_tds', 'TD'], ['passing_interceptions', 'INT'], ['passing_yards_per_attempt', 'Y/A'], ['sacks_suffered', 'SACK']],
  Rush: [['rushing_yards', 'YDS'], ['carries', 'CAR'], ['rushing_yards_per_carry', 'Y/C'], ['rushing_tds', 'TD'], ['rushing_first_downs', '1D'], ['rushing_fumbles_lost', 'FUM L']],
  Rec: [['receiving_yards', 'YDS'], ['receptions', 'REC'], ['targets', 'TGT'], ['catch_pct', 'CATCH%'], ['receiving_yards_per_reception', 'Y/R'], ['receiving_tds', 'TD'], ['receiving_yards_after_catch', 'YAC']],
  Def: [['tackles', 'TKL'], ['def_tackles_solo', 'SOLO'], ['def_tackle_assists', 'AST'], ['def_sacks', 'SACK'], ['def_tackles_for_loss', 'TFL'], ['def_interceptions', 'INT'], ['def_pass_defended', 'PD'], ['def_fumbles_forced', 'FF']],
};
const labels = { ...NFL_METRICS, ...NFL_RATES, ...NFL_DERIVED, ...CFB_CARD_METRICS };
const display = (value: number | null | undefined, na = false) => value == null ? na ? 'N/A' : '—' : Number.isInteger(value) ? value.toLocaleString('en-GB') : value.toFixed(1);

export default function StatsPreview({ development = false, initialFixture = false, league = 'NFL' }: { development?: boolean; initialFixture?: boolean; league?: 'NFL' | 'CFB' }) {
  const [conference, setConference] = useState('');
  const [fixture, setFixture] = useState(initialFixture);
  const nflTeams = useNflPreviewTeams(league === 'NFL');
  const endpoint = fixture ? '/preview/nfl-stats/data' : league === 'NFL' ? '/api/nfl/stats-v2' : '/api/cfb/stats-v2';
  const [category, setCategory] = useState<Category>('QB'), [mode, setMode] = useState('weekly'), [week, setWeek] = useState(league === 'CFB' ? '7' : '');
  const [metric, setMetric] = useState<MetricKey>('passing_yards'), [ascending, setAscending] = useState(false), [search, setSearch] = useState('');
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]), [details, setDetails] = useState<Record<string, DetailLine>>({}), [detailError, setDetailError] = useState('');
  const teamMetadata = (code: string) => league === 'NFL' ? nflTeams(code) : { name: data?.teams?.[code]?.name ?? `Team ${code}`, logo: data?.teams?.[code]?.logo ?? undefined };
  const teamName = (code: string) => teamMetadata(code).name;
  const [nflGate, setNflGate] = useState<CfbGate | null>(null), [nflStatusChecked, setNflStatusChecked] = useState<number | null>(null), [nflHistorical, setNflHistorical] = useState(false);
  const [cfbGate, setCfbGate] = useState<CfbGate | null>(null), [statusChecked, setStatusChecked] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [detailChecked, setDetailChecked] = useState<number | null>(null);
  const [count, setCount] = useState(25);
  const expandedRef = useRef(expanded), current = useRef(0), detailSequence = useRef(0);
  const [order, setOrder] = useState<string[]>([]);
  const query = useCallback(() => new URLSearchParams({ mode, ...(mode === 'weekly' && week ? { week } : {}), ...(league === 'CFB' && conference ? {conference} : {}) }), [mode, week, league, conference]);
  const loadDetails = useCallback(async (snapshot: string, ids: string[], generation: number) => {
    if (!ids.length) return;
    const sequence = ++detailSequence.current;
    const params = query(); params.set('view', 'details'); params.set('snapshot', snapshot); params.set('players', ids.join(','));
    try {
      const response = await fetch(endpoint + '?' + params, { cache: 'no-store' });
      const body = await response.json(); if (!response.ok) throw Error(body.error);
      if (current.current === generation && detailSequence.current === sequence) { setDetails(Object.fromEntries(body.lines.map((line: DetailLine) => [line.id, line]))); setDetailChecked(Date.now()); setDetailError(''); }
    } catch { if (current.current === generation && detailSequence.current === sequence) { setDetailError('Player details are temporarily unavailable. We’ll retry with the next update.'); } }
  }, [query, endpoint]);
  useEffect(() => {
    const generation = ++current.current; let active = true, running = false;
    expandedRef.current = [];
    queueMicrotask(() => { if (active) { setData(null); setNflGate(null); setNflStatusChecked(null); setNflHistorical(false); setCfbGate(null); setStatusChecked(null); setLastChecked(null); setDetailChecked(null); setError(''); setDetails({}); setExpanded([]); setOrder([]); } });
    async function refresh() {
      if (running) return; running = true; setRefreshing(true);
      try {
        const params = query(); params.set('view', 'leaders'); params.set('category', category);
        const response = await fetch(endpoint + '?' + params, { cache: 'no-store' }); const body = await response.json();
        if (!response.ok && response.status === 409) {
          if (active) { setData(null); setError(typeof body.error === 'string' ? body.error : 'Statistics are unavailable for this selection.'); }
          return false;
        }
        if (!response.ok) throw Error(body.error);
        if (active) { setData(body); setLastChecked(Date.now()); setError(''); await loadDetails(body.snapshot, expandedRef.current.filter(id => body.lines.some((row: Row) => row.id === id)), generation); }
        return true;
      } catch { if (active) setError('Live refresh unavailable. Displayed figures may be out of date; live indicators are paused.'); return false; }
      finally { running = false; if (active) setRefreshing(false); }
    }
    if (league === 'CFB' && !fixture) {
      const stop = startCfbPolling({ refresh, historical: mode === 'weekly' && week === '7', currentWeek: mode === 'season' || !week,
        status: async () => {
          const params = query(); params.set('view', 'status');
          const response = await fetch(endpoint + '?' + params, {cache:'no-store'});
          const body = await response.json(); if (!response.ok || !Array.isArray(body.games)) throw Error('Status unavailable');
          return body.games;
        },
        report: (gate, checked) => { if (active) { setCfbGate(gate); if (checked !== null) setStatusChecked(checked); } },
      });
      return () => { active = false; stop(); };
    }
    if (league === 'NFL' && !fixture) {
      const stop = startNflPolling({refresh,
        status: async () => {
          const params = query(); params.set('view','status');
          const response = await fetch(endpoint + '?' + params,{cache:'no-store'});
          const body = await response.json();
          if (!response.ok || !Array.isArray(body.games) || typeof body.historical !== 'boolean') throw Error('Status unavailable');
          return body;
        },
        report: (gate,checked,historical) => { if (active) { setNflGate(gate); setNflHistorical(historical); if (checked !== null) setNflStatusChecked(checked); } },
      });
      return () => { active=false; stop(); };
    }
    queueMicrotask(() => { if (active) void refresh(); }); const timer = setInterval(refresh, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [category, query, loadDetails, endpoint, league, fixture, week, mode]);
  // Foundation.complete validates supplied records; it does not certify league-wide coverage.
  // Until category/game coverage is verified, ordinal ranks require independent category/metric coverage.
  const rankingAvailable = Boolean(data?.lines.length && !error && (fixture ? data.complete : (data.confidence?.[metric]?.status === 'verified' || (league === 'CFB' && ((data.scope === 'reviewed-espn-week' && data.confidence?.[metric]?.status === 'reviewed') || (['reviewed-espn-week','supplied-games','retained-espn-season'].includes(data.scope ?? '') && data.rankScope === 'reported-values' && data.confidence?.[metric]?.status === 'reported-values'))))));
  const visibleColumns = columns[category].filter(([key]) => !data?.displayColumns || data.displayColumns.includes(key));
  const value = (row: Row, key: MetricKey) => row.values[data?.columns.indexOf(key) ?? -1] ?? null;
  const ranked = [...(data?.lines ?? [])].sort((a, b) => {
    const x = value(a, metric), y = value(b, metric);
    return x === null ? y === null ? a.id.localeCompare(b.id) : 1 : y === null ? -1 : (ascending ? x - y : y - x) || a.id.localeCompare(b.id);
  });
  const rankByValue = new Map<number, string>();
  const ranks = new Map(ranked.map((row, index) => {
    const n = value(row, metric); if (n !== null && !rankByValue.has(n)) rankByValue.set(n, String(index + 1));
    return [row.id, n === null ? '—' : rankByValue.get(n)!];
  }));
  const positions = new Map(order.map((id, index) => [id, index]));
  const visible = (expanded.length && order.length ? [...ranked].sort((a, b) => (positions.get(a.id) ?? 1e6) - (positions.get(b.id) ?? 1e6)) : ranked)
    .filter(row => `${row.name} ${row.teams.map(teamName).join(' ')} ${row.teams.join(' ')}`.toLowerCase().includes(search.toLowerCase())).slice(0, count);
  function toggle(row: Row) {
    const ids = expanded.includes(row.id) ? expanded.filter(id => id !== row.id) : [...expanded, row.id];
    if (ids.length > 20) { setDetailError('Close a card before opening another (20 open cards maximum).'); return; }
    if (!expanded.length && ids.length) setOrder(ranked.map(row => row.id));
    setExpanded(ids); expandedRef.current = ids;
    if (data) void loadDetails(data.snapshot, ids, current.current);
  }
  const updateStatus = statsUpdateStatus(data, lastChecked, refreshing, Boolean(error));
  if (league === 'CFB' && cfbGate) {
    updateStatus.cadence = cfbGate.state === 'recovering' ? 'Game-status check unavailable · retrying every 30 seconds' : cfbGate.heavy ? `${cfbGate.state === 'live' && !error ? 'LIVE' : 'Statistics checks'} · updates every 30 seconds` : `Game-status monitoring · ${cfbGate.delay === 30_000 ? 'every 30 seconds' : 'up to every 5 minutes'}`;
    if (statusChecked !== null) updateStatus.heading += ` · Status checked ${new Date(statusChecked).toLocaleTimeString('en-GB')}`;
  }
  if (league === 'NFL' && nflGate) {
    updateStatus.cadence = nflHistorical ? 'Historical week · loaded statistics' : nflGate.state === 'recovering' ? 'Game-status check unavailable · retrying every 30 seconds' : nflGate.heavy ? `${nflGate.state === 'live' && !error ? 'LIVE' : 'Statistics checks'} · every 30 seconds` : `Game-status monitoring · ${nflGate.delay === 30_000 ? 'every 30 seconds' : 'up to every 5 minutes'}`;
    if (nflStatusChecked !== null) updateStatus.heading += ` · Status checked ${new Date(nflStatusChecked).toLocaleTimeString('en-GB')}`;
  }
  return <section className={styles.studio} data-league={league} data-statistics-source={data?.sourceAttribution} data-statistics-observed-at={data?.observationAt} aria-label={`${league} player statistics`} style={league === 'CFB' ? { '--accent': '#FF6B00' } as React.CSSProperties : undefined}>
    {development && <aside className={styles.development} aria-label="Development tools"><strong>Development tools</strong><button onClick={() => setFixture(!fixture)}>{fixture ? 'Show real data' : 'Show fixture data'}</button>{fixture && <p>Fictional players and simulated live indicators. Not actual NFL data.</p>}<details><summary>Data diagnostics</summary><ul>{data?.coverage.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details></aside>}
    <div className={styles.sectionTitle}><h2>Stats</h2><span className={styles.status} role="status">{updateStatus.heading}</span></div>
      <div className={styles.tabs} aria-label="Statistical category">{(['QB', 'Rush', 'Rec', 'Def'] as Category[]).map(cat => <button key={cat} aria-pressed={category === cat} onClick={() => { setCategory(cat); setMetric(columns[cat][0][0]); setAscending(false); setCount(25); }}>{cat} <small>{({ QB: 'Quarterbacks', Rush: 'Rushing', Rec: 'Receiving', Def: 'Defence' })[cat]}</small></button>)}</div>
      <div className={styles.controls}><label>Period<select value={mode} onChange={e => setMode(e.target.value)}><option value="weekly">Week</option><option value="season">Season</option></select></label>{mode === 'weekly' && <label>Week<select value={week} onChange={e => setWeek(e.target.value)}><option value="">Current Week</option>{Array.from({ length: league === 'NFL' ? 18 : 16 }, (_, i) => <option key={i} value={i + 1}>Week {i + 1}</option>)}</select></label>}{league === 'CFB' && <label>Conference<select value={conference} onChange={e=>setConference(e.target.value)} disabled={!data?.conferences?.length}><option value="">All conferences</option>{data?.conferences?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<label className={styles.search}>Find a player or team<input value={search} placeholder="Player or team" onChange={e => setSearch(e.target.value)} /></label></div>
      <div className={styles.context} data-statistics-period><strong>{league === 'CFB' ? cfbPeriodLabel(data,mode,week) : mode === 'season' ? `Season totals${data?.throughWeek ? ` through Week ${data.throughWeek}${data.liveWeek ? ` + Week ${data.liveWeek} observations` : ''}` : ''}` : `Week ${data?.period.week ?? (week || '—')}`} <span>/ {league}{league === 'NFL' ? ` · ${data?.period.season ?? '—'}` : ''}</span></strong><span>{updateStatus.cadence}</span></div>
      {data && <StatsCoverage data={data} league={league} metric={metric} metricLabel={labels[metric][0]} category={category} rankingAvailable={rankingAvailable} snapshot={updateStatus.snapshot} historical={mode === 'weekly' && (league === 'NFL' ? nflHistorical : data.scope === 'reviewed-espn-week')} failed={Boolean(error)} />}
      {error && <p className={styles.warning} role="alert">{error}</p>}
      <div className={styles.tableWrap} tabIndex={0} aria-label="Scrollable player statistics"><table><thead><tr><th scope="col">#</th><th scope="col" className={styles.player}>PLAYER / TEAM</th>{visibleColumns.map(([key, label]) => <th key={key} scope="col" aria-sort={metric === key ? ascending ? 'ascending' : 'descending' : 'none'}><button data-statistic-label={labels[key][0]} title={(league==='CFB'&&cfbMetricLimitation(data,key,labels[key][0]))||labels[key][0]} aria-label={(league==='CFB'&&cfbMetricLimitation(data,key,labels[key][0]))||labels[key][0]} onClick={() => { setMetric(key); setAscending(metric === key ? !ascending : false); setOrder([]); }}>{label}{metric === key ? ascending ? ' ↑' : ' ↓' : ''}</button></th>)}</tr></thead><tbody>{visible.map(row => <Fragment key={row.id}><tr className={expanded.includes(row.id) ? styles.openRow : ''}><td>{rankingAvailable ? ranks.get(row.id) : '—'}</td><th scope="row" className={styles.player}><button aria-expanded={expanded.includes(row.id)} aria-controls={`file-${row.id}`} onClick={() => toggle(row)}>{(data?.logos[row.teams[0]] || teamMetadata(row.teams[0]).logo) && <span className={styles.teamLogo}><TeamLogo src={data?.logos[row.teams[0]] || teamMetadata(row.teams[0]).logo} /></span>}<span className={styles.playerIdentity}><span className={styles.nameLine}><strong>{row.name}</strong>{row.playingNow && !error && <span className={styles.playing}>● PLAYING NOW</span>}</span><small>{row.teams.map(teamName).join(' / ')}{row.teams.length > 1 ? ' · combined totals' : ''}</small></span><span className={styles.plus}>{expanded.includes(row.id) ? '−' : '+'}</span></button></th>{visibleColumns.map(([key]) => <td key={key} className={metric === key ? styles.selected : ''}>{display(value(row, key), row.notApplicable.includes(key))}</td>)}</tr>{expanded.includes(row.id) && <tr><td id={`file-${row.id}`} colSpan={visibleColumns.length + 2} className={styles.detail}><div><h3>{row.name}</h3>{details[row.id] && <p className={styles.note}>{playerDetailCheckLabel(detailChecked, refreshing, Boolean(detailError))}{updateStatus.snapshot ? ` · ${updateStatus.snapshot}` : ''}</p>}{details[row.id] ? <><div className={styles.metricGrid}>{playerCardMetrics(category, details[row.id].metrics, league).map(key => <div key={key}><span>{labels[key][0]}</span><strong>{display(details[row.id].metrics[key]?.value)}</strong></div>)}</div>{!playerCardMetrics(category, details[row.id].metrics, league).length && <p className={styles.note}>Additional statistics are unavailable.</p>}<h4>Recent Games</h4><RecentGames games={details[row.id].games} category={category} teamName={teamName} className={styles.gameLog} /><p className={styles.note}>{details[row.id].stints.length > 1 ? 'Totals include all teams shown.' : mode === 'weekly' ? `Latest available games through Week ${data?.period.week ?? week}.` : data?.throughWeek ? `Latest available games through Week ${data.liveWeek??data.throughWeek}.` : 'Most recent games available for this season.'}</p></> : <p role="status">{detailError || 'Loading player details…'}</p>}</div></td></tr>}</Fragment>)}</tbody></table></div>
      {!visible.length && <p className={styles.empty}>{data ? data.coveredGames === 0 ? 'No player statistics are available for this selection yet.' : category === 'QB' && league === 'CFB' && !data.lines.length ? 'No verified quarterback positions are available for these games. Existing Stats remains available.' : 'No players match this selection.' : error ? 'Statistics are currently unavailable.' : 'Loading player statistics…'}</p>}
      {count < ranked.filter(row => `${row.name} ${row.teams.map(teamName).join(' ')} ${row.teams.join(' ')}`.toLowerCase().includes(search.toLowerCase())).length && <button className={styles.more} onClick={() => setCount(count + 25)}>Show 25 more players</button>}
      {detailError && <p className={styles.warning} role="status">{detailError}</p>}<div className={styles.notes}><span>— Unavailable · N/A Not applicable</span><span>{data?.scope === 'retained-espn-season' && !data.liveWeek ? 'Historical snapshot · no live checks.' : expanded.length ? 'Automatic checks continue while player details stay open.' : 'Select a column to sort. Select a player for more.'}</span></div>
  </section>;
}
