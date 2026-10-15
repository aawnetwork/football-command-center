"use client";
import { useEffect, useMemo, useState } from "react";
import { type LogoTeam } from "../../lib/team-logos";
import { pollTeamLogo } from "./poll-team";
import { comparisonPoll, comparisonSource, comparisonSnapshots, latestPollWeek, parsePollWeek, pollKinds, pollLabel, pollMovement, pollTitles, pollWeekButtonLabel, pollWeekKey, pollWeekOptions, type PollKind, type PollMetadata, type PollResponse } from "./poll-model";

type Results = Partial<Record<PollKind, PollResponse>>;
export function CfbRankings({ teams, season }: { teams: LogoTeam[]; season?: number }) {
  const [selection, setSelection] = useState<string | null>(null);
  const [results, setResults] = useState<Results>({});
  const [catalog, setCatalog] = useState<PollMetadata[]>([]);
  const [errors, setErrors] = useState<Partial<Record<PollKind, string>>>({});
  const [loading, setLoading] = useState(true);
  // Keep a historical selection fixed across the existing five-minute refresh.
  // AP regular W(n+1) aligns with UKI W(n), without rewriting archive records.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let pending = false;
    async function load(initial = false) {
      if (pending) return;
      pending = true;
      if (initial) { setLoading(true); setResults({}); setErrors({}); }
      const chosen = parsePollWeek(selection);
      const settled = await Promise.all(pollKinds.map(async kind => {
        const params = new URLSearchParams({ league: "CFB", view: "polls", type: kind });
        const source = chosen && comparisonSource(catalog, kind, chosen);
        if (chosen && !source) return { kind, data: { kind, poll: null, availableSnapshots: catalog.filter(p => p.kind === kind) } as PollResponse };
        if (source) { params.set("season", String(source.season)); params.set("phase", source.phase); params.set("week", String(source.week)); }
        try {
          const response = await fetch(`/api/standings?${params}`, { cache: "no-store", signal: controller.signal });
          const data: PollResponse = await response.json();
          if (!response.ok || data.kind !== kind) throw Error(data.error ?? "Unable to load this poll. Please retry.");
          return { kind, data };
        } catch (reason) { return { kind, error: (reason as Error).message }; }
      }));
      if (!cancelled) {
        const next: Results = {}, failures: Partial<Record<PollKind,string>> = {};
        for (const item of settled) {
          if (item.data) next[item.kind] = item.data;
          else failures[item.kind] = item.error;
        }
        // Initial reads retain the complete history catalogue. If a source's
        // latest poll is in another season/phase, read the exact selected release
        // only when its archive says that identity exists; never fall back.
        if (!chosen) {
          const metadata = Object.values(next).flatMap(data => data.availableSnapshots);
          const target = latestPollWeek(comparisonSnapshots(metadata), season);
          if (target) await Promise.all(pollKinds.map(async kind => {
            const data = next[kind];
            const source = comparisonSource(metadata, kind, target);
            if (!data || comparisonPoll(data.poll, kind, target, metadata) || !source) return;
            try {
              const params = new URLSearchParams({ league: "CFB", view: "polls", type: kind, season: String(source.season), phase: source.phase, week: String(source.week) });
              const response = await fetch(`/api/standings?${params}`, { cache: "no-store", signal: controller.signal });
              const exact: PollResponse = await response.json();
              if (!response.ok || exact.kind !== kind) throw Error(exact.error ?? "Unable to load this poll. Please retry.");
              next[kind] = { ...exact, availableSnapshots: data.availableSnapshots };
            } catch (reason) { delete next[kind]; failures[kind] = (reason as Error).message; }
          }));
        }
        if (cancelled) return;
        setResults(next); setErrors(failures); setLoading(false);
        setCatalog(previous => {
          const metadata = new Map(previous.map(p => [p.id, p]));
          for (const data of Object.values(next)) for (const p of data.availableSnapshots) metadata.set(p.id, p);
          return [...metadata.values()];
        });
      }
      pending = false;
    }
    void load(true);
    const interval = window.setInterval(() => void load(), 300_000);
    return () => { cancelled = true; controller.abort(); window.clearInterval(interval); };
  }, [selection, season]);

  const alignedCatalog = comparisonSnapshots(catalog);
  const selected = parsePollWeek(selection) ?? latestPollWeek(alignedCatalog, season);
  const selectedSeason = selected?.season ?? season;
  const seasons = [...new Set([...catalog.map(p => p.season), ...(season ? [season] : [])])].sort((a,b) => b-a);
  const weeks = useMemo(() => selectedSeason === undefined ? [] : pollWeekOptions(comparisonSnapshots(catalog), selectedSeason), [catalog, selectedSeason]);
  return <div className="standings-panel__rankings">
    <div className="standings-panel__rankings-controls">
      <label className="standings-panel__week-switch">Season <select aria-label="Rankings season" value={selectedSeason ?? ""} disabled={!seasons.length} onChange={event => {
        const latest = latestPollWeek(alignedCatalog, Number(event.target.value));
        setSelection(latest ? pollWeekKey(latest) : null);
      }}>{!seasons.length && <option value="">No stored seasons</option>}{seasons.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
      <div className="standings-panel__week-switch cfb-polls__weeks" role="group" aria-label="Ranking week">
        {weeks.map(week => <button key={pollWeekKey(week)} type="button" aria-label={pollLabel({ ...week, kind: "ap" })} aria-pressed={selected !== null && pollWeekKey(selected) === pollWeekKey(week)} onClick={() => setSelection(pollWeekKey(week))}>{pollWeekButtonLabel(week)}</button>)}
      </div>
    </div>
    <p className="cfb-polls__context">{loading ? "Loading stored polls…" : selected ? selected.phase === "preseason" ? `${selected.season} · Preseason` : pollLabel({ ...selected, kind: "uki" }) : "No rankings archived for this season"} · AP source weeks run one ahead of UKI.</p>
    <div className="cfb-polls__grid" aria-busy={loading}>
      {pollKinds.map(kind => {
        const poll = comparisonPoll(results[kind]?.poll, kind, selected, catalog);
        const entries = poll?.entries.filter(entry => entry.rank >= 1 && entry.rank <= 25).sort((a,b) => a.rank-b.rank) ?? [];
        return <article key={kind} className="cfb-polls__card" aria-label={pollTitles[kind]}>
          <header><h3>{pollTitles[kind]}</h3>{poll && <p>{poll.phase === "preseason" ? "Preseason" : `Source week ${poll.week}`} · {poll.source} · {poll.publishedAt ? <time dateTime={poll.publishedAt}>{new Date(poll.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}</time> : "Release date unavailable"}</p>}</header>
          {loading ? <p className="cfb-polls__empty" role="status">Loading rankings…</p> : errors[kind] ? <p className="cfb-polls__empty" role="alert">{errors[kind]}</p> : !poll || !entries.length ? <p className="cfb-polls__empty">{kind === "cfp" && !catalog.some(p => p.kind === "cfp" && p.season === selectedSeason) ? "CFP rankings begin later in the season. No releases are archived for this season yet." : "No published poll is archived for this week."}</p> : <ol className="cfb-polls__rows" aria-label={`${pollTitles[kind]} rankings`}>
            {entries.map(entry => {
              const movement = pollMovement(entry), logo = pollTeamLogo(entry, teams);
              return <li key={entry.teamId || entry.abbreviation || entry.team} value={entry.rank}>
                <span className="cfb-polls__rank">{entry.rank}</span>
                <span className="cfb-polls__team"><PollLogo key={logo ?? entry.team} src={logo} /><span>{entry.team}</span></span>
                <span className={`cfb-polls__movement cfb-polls__movement--${movement.tone}`} aria-label={movement.label} title={movement.label}>{movement.text}</span>
              </li>;
            })}
          </ol>}
        </article>;
      })}
    </div>
  </div>;
}
function PollLogo({ src }: { src?: string }) {
  const [broken, setBroken] = useState(false);
  return <span className="cfb-polls__logo" aria-hidden="true">{src && !broken ? <img src={src} alt="" width="26" height="26" onError={() => setBroken(true)} /> : <span className="cfb-polls__logo-fallback">—</span>}</span>;
}
