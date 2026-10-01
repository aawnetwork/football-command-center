"use client";

import { useEffect, useMemo, useState } from "react";

type League = "CFB" | "NFL";
type CfbView = "conferences" | "rankings";
type NflView = "divisions" | "playoffs";
type PollKind = "ap" | "cfp" | "uki";

type StandingTeam = {
  team: string;
  abbreviation: string;
  logo: string | null;
  overall: string;
  conference: string;
  division: string;
  winPct: string;
  streak: string;
  seed: string;
};

type StandingSection = {
  name: string;
  conference: string;
  teams: StandingTeam[];
};

type StandingResponse = {
  sections?: StandingSection[];
  playoffPictureAvailable?: boolean;
  error?: string;
};

type PollEntry = {
  rank: number;
  previousRank: number | null;
  team: string;
  abbreviation: string;
  logo: string | null;
  record: string;
  points: number | null;
  firstPlaceVotes: number | null;
};

type Poll = {
  kind: PollKind;
  available: boolean;
  week: number;
  publishedAt: string | null;
  entries: PollEntry[];
};

type PollResponse = {
  currentWeek: number;
  selectedWeek: number;
  availableWeeks: number[];
  polls: Poll[];
  error?: string;
};

type PlayoffTeam = StandingTeam & { divisionName: string };

const pollLabels: Record<PollKind, string> = {
  ap: "AP",
  cfp: "CFP",
  uki: "UK & Ireland",
};

export function StandingsPanel({ sport }: { sport: League }) {
  const [sections, setSections] = useState<StandingSection[]>([]);
  const [selectedConference, setSelectedConference] = useState("All");
  const [cfbView, setCfbView] = useState<CfbView>("conferences");
  const [nflView, setNflView] = useState<NflView>("divisions");
  const [playoffPictureAvailable, setPlayoffPictureAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadStandings = (initial = false) => {
      if (initial) {
        setLoading(true);
        setError(null);
      }
      return fetch(`/api/standings?league=${sport}`)
      .then(async (response) => {
        const data: StandingResponse = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load standings.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setSections(data.sections ?? []);
        setPlayoffPictureAvailable(Boolean(data.playoffPictureAvailable));
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    };

    void loadStandings(true);
    const interval = window.setInterval(() => void loadStandings(), 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sport]);

  const visibleSections = useMemo(
    () => selectedConference === "All" ? sections : sections.filter((section) => section.name === selectedConference),
    [sections, selectedConference],
  );

  return <section className="standings-panel">
    <header className="standings-panel__header">
      <h2>Standings</h2>
      <p>{sport === "NFL" ? "NFL division races, updated from ESPN." : "FBS conference standings and national rankings."}</p>
    </header>
    {sport === "CFB" ? <CfbStandings
      view={cfbView}
      onViewChange={setCfbView}
      sections={visibleSections}
      allSections={sections}
      selectedConference={selectedConference}
      onConferenceChange={setSelectedConference}
      loading={loading}
      error={error}
    /> : <NflStandings
      view={nflView}
      onViewChange={setNflView}
      playoffPictureAvailable={playoffPictureAvailable}
      sections={visibleSections}
      loading={loading}
      error={error}
    />}
  </section>;
}

function CfbStandings({ view, onViewChange, sections, allSections, selectedConference, onConferenceChange, loading, error }: {
  view: CfbView;
  onViewChange: (view: CfbView) => void;
  sections: StandingSection[];
  allSections: StandingSection[];
  selectedConference: string;
  onConferenceChange: (conference: string) => void;
  loading: boolean;
  error: string | null;
}) {
  return <>
    <div className="standings-panel__mode-switch" aria-label="College football standings view">
      <button type="button" aria-pressed={view === "conferences"} onClick={() => onViewChange("conferences")}>Conferences</button>
      <button type="button" aria-pressed={view === "rankings"} onClick={() => onViewChange("rankings")}>Rankings</button>
    </div>
    {view === "conferences" ? <>
      {allSections.length > 0 && <div className="standings-panel__filters" aria-label="Conference filters">
        {["All", ...allSections.map((section) => section.name)].map((name) => <button key={name} type="button" aria-pressed={selectedConference === name} onClick={() => onConferenceChange(name)}>{name.replace(" Conference", "")}</button>)}
      </div>}
      <StandingsContent sport="CFB" sections={sections} loading={loading} error={error} />
    </> : <CfbRankings />}
  </>;
}

function NflStandings({ view, onViewChange, playoffPictureAvailable, sections, loading, error }: {
  view: NflView;
  onViewChange: (view: NflView) => void;
  playoffPictureAvailable: boolean;
  sections: StandingSection[];
  loading: boolean;
  error: string | null;
}) {
  const playoffTeams = useMemo<PlayoffTeam[]>(() => sections.flatMap((section) => section.teams.map((team) => ({ ...team, divisionName: section.name }))), [sections]);
  return <>
    <div className="standings-panel__mode-switch" aria-label="NFL standings view">
      <button type="button" aria-pressed={view === "divisions"} onClick={() => onViewChange("divisions")}>Divisions</button>
      {playoffPictureAvailable && <button type="button" aria-pressed={view === "playoffs"} onClick={() => onViewChange("playoffs")}>Playoff Picture</button>}
    </div>
    {view === "playoffs" && playoffPictureAvailable ? <NflPlayoffPicture teams={playoffTeams} /> : <StandingsContent sport="NFL" sections={sections} loading={loading} error={error} />}
  </>;
}

function CfbRankings() {
  const [pollKind, setPollKind] = useState<PollKind>("ap");
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [data, setData] = useState<PollResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const weekParam = selectedWeek ? `&week=${selectedWeek}` : "";
    const loadRankings = (initial = false) => {
      if (initial) {
        setLoading(true);
        setError(null);
      }
      return fetch(`/api/standings?league=CFB&view=polls${weekParam}`)
      .then(async (response) => {
        const payload: PollResponse = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load rankings.");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        if (selectedWeek === null) setSelectedWeek(payload.selectedWeek);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    };

    void loadRankings(true);
    const interval = window.setInterval(() => void loadRankings(), 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedWeek]);

  const poll = data?.polls.find((item) => item.kind === pollKind);
  const isCurrentWeek = data?.selectedWeek === data?.currentWeek;
  return <div className="standings-panel__rankings">
    <div className="standings-panel__rankings-controls">
      <div className="standings-panel__mode-switch" aria-label="Ranking source">
        {(Object.keys(pollLabels) as PollKind[]).map((kind) => <button key={kind} type="button" aria-pressed={pollKind === kind} onClick={() => setPollKind(kind)}>{pollLabels[kind]}</button>)}
      </div>
      {data && <div className="standings-panel__week-switch" aria-label="Poll week">
        {data.availableWeeks.map((week) => <button key={week} type="button" aria-pressed={data.selectedWeek === week} onClick={() => setSelectedWeek(week)}>Week {week}</button>)}
      </div>}
    </div>
    {loading ? <div className="standings-panel__empty">Loading rankings…</div> : error ? <div className="standings-panel__empty">{error}</div> : poll?.available ? <PollTable entries={poll.entries} /> : <div className="standings-panel__empty">
      {pollKind === "cfp" ? "CFP rankings will appear here once the committee releases its first poll." : pollKind === "uki" ? "UK & Ireland rankings will appear here once this week’s list is added." : isCurrentWeek ? "No AP poll is available right now." : "That week has not been captured yet. Future polls will be stored here week by week."}
    </div>}
  </div>;
}

function StandingsContent({ sport, sections, loading, error }: { sport: League; sections: StandingSection[]; loading: boolean; error: string | null }) {
  const groups = sport === "NFL" ? ["AFC", "NFC"] : ["CFB"];
  if (loading) return <div className="standings-panel__empty">Loading live standings…</div>;
  if (error) return <div className="standings-panel__empty">{error}</div>;
  return <div className="standings-panel__groups">
    {groups.map((group) => {
      const groupSections = sport === "NFL" ? sections.filter((section) => section.conference === group) : sections;
      if (!groupSections.length) return null;
      return <div className="standings-panel__conference" key={group}>
        {sport === "NFL" && <h3>{group}</h3>}
        <div className="standings-panel__grid">{groupSections.map((section) => <StandingTable key={section.name} section={section} sport={sport} />)}</div>
      </div>;
    })}
  </div>;
}

function NflPlayoffPicture({ teams }: { teams: PlayoffTeam[] }) {
  return <div className="standings-panel__groups">
    {["AFC", "NFC"].map((conference) => {
      const relevantTeams = teams.filter((team) => team.seed !== "—" && team.divisionName.startsWith(conference)).sort((left, right) => Number(left.seed) - Number(right.seed));
      return <article className="standings-panel__table-wrap" key={conference}>
        <h3>{conference} Playoff Picture</h3>
        <div className="standings-panel__scroll"><table>
          <thead><tr><th>Seed</th><th>Team</th><th>Overall</th><th>Division</th><th>Strk</th></tr></thead>
          <tbody>{relevantTeams.map((team) => <tr key={team.team}><td>{team.seed}</td><td><span className="standings-panel__team">{team.logo && <img src={team.logo} alt="" />}{team.team}</span></td><td>{team.overall}</td><td>{team.divisionName}</td><td>{team.streak}</td></tr>)}</tbody>
        </table></div>
      </article>;
    })}
  </div>;
}

function StandingTable({ section, sport }: { section: StandingSection; sport: League }) {
  return <article className="standings-panel__table-wrap">
    <h3>{section.name}</h3>
    <div className="standings-panel__scroll"><table>
      <thead><tr><th>Team</th><th>Overall</th><th>{sport === "NFL" ? "Div" : "Conf"}</th><th>Pct</th><th>Strk</th></tr></thead>
      <tbody>{section.teams.map((team) => <tr key={team.team}><td><span className="standings-panel__team">{team.logo && <img src={team.logo} alt="" />}{team.team}</span></td><td>{team.overall}</td><td>{sport === "NFL" ? team.division : team.conference}</td><td>{team.winPct}</td><td>{team.streak}</td></tr>)}</tbody>
    </table></div>
  </article>;
}

function PollTable({ entries }: { entries: PollEntry[] }) {
  return <article className="standings-panel__table-wrap"><div className="standings-panel__scroll"><table>
    <thead><tr><th>Rank</th><th>Team</th><th>Record</th><th>Last week</th><th>Points</th></tr></thead>
    <tbody>{entries.map((entry) => <tr key={entry.abbreviation || entry.team}><td>{entry.rank}</td><td><span className="standings-panel__team">{entry.logo && <img src={entry.logo} alt="" />}{entry.team}</span></td><td>{entry.record}</td><td>{entry.previousRank ?? "NR"}</td><td>{entry.points?.toLocaleString() ?? "—"}</td></tr>)}</tbody>
  </table></div></article>;
}
