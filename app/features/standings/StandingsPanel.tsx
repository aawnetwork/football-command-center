"use client";

import { useEffect, useMemo, useState } from "react";

type League = "CFB" | "NFL";
type CfbView = "conferences" | "rankings";
type NflView = "divisions" | "playoffs";
import { CfbRankings } from "./CfbRankings";

type StandingTeam = {
  id?: string;
  shortName?: string;
  location?: string;
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
  season?: number | { year?: number };
  sections?: StandingSection[];
  playoffPictureAvailable?: boolean;
  error?: string;
};

type PlayoffTeam = StandingTeam & { divisionName: string };

export function StandingsPanel({ sport }: { sport: League }) {
  const [season, setSeason] = useState<number>();
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
        const year = typeof data.season === "number" ? data.season : data.season?.year;
        if (Number.isInteger(year)) setSeason(year);
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
      season={season}
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

function CfbStandings({ view, onViewChange, sections, allSections, selectedConference, onConferenceChange, loading, error, season }: {
  season?: number;
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
    </> : <CfbRankings teams={allSections.flatMap(section => section.teams)} season={season} />}
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
  return <article className="standings-panel__table-wrap" data-desk-export="standings" data-export-label={section.name}>
    <h3>{section.name}</h3>
    <div className="standings-panel__scroll"><table>
      <thead><tr><th>Team</th><th>Overall</th><th>{sport === "NFL" ? "Div" : "Conf"}</th><th>Pct</th><th>Strk</th></tr></thead>
      <tbody>{section.teams.map((team) => <tr key={team.team}><td><span className="standings-panel__team">{team.logo && <img src={team.logo} alt="" />}{team.team}</span></td><td>{team.overall}</td><td>{sport === "NFL" ? team.division : team.conference}</td><td>{team.winPct}</td><td>{team.streak}</td></tr>)}</tbody>
    </table></div>
  </article>;
}
