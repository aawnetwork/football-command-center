"use client";

import { useEffect, useMemo, useState } from "react";

type League = "CFB" | "NFL";

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

export function StandingsPanel({ sport }: { sport: League }) {
  const [sections, setSections] = useState<StandingSection[]>([]);
  const [selected, setSelected] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/standings?league=${sport}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load standings.");
        return data.sections ?? [];
      })
      .then((data) => {
        if (!cancelled) setSections(data);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sport]);

  const visibleSections = useMemo(() => selected === "All" ? sections : sections.filter((section) => section.name === selected), [sections, selected]);
  const groups = sport === "NFL" ? ["AFC", "NFC"] : ["CFB"];

  return (
    <section className="standings-panel">
      <header className="standings-panel__header">
        <h2>Standings</h2>
        <p>{sport === "NFL" ? "NFL division races and playoff seeding." : "FBS conference standings, updated from ESPN."}</p>
      </header>

      {sport === "CFB" && sections.length > 0 && (
        <div className="standings-panel__filters" aria-label="Conference filters">
          {["All", ...sections.map((section) => section.name)].map((name) => (
            <button key={name} type="button" aria-pressed={selected === name} onClick={() => setSelected(name)}>{name.replace(" Conference", "")}</button>
          ))}
        </div>
      )}

      {loading ? <div className="standings-panel__empty">Loading live standings…</div> : error ? <div className="standings-panel__empty">{error}</div> : (
        <div className="standings-panel__groups">
          {groups.map((group) => {
            const groupSections = sport === "NFL" ? visibleSections.filter((section) => section.conference === group) : visibleSections;
            if (!groupSections.length) return null;
            return <div className="standings-panel__conference" key={group}>
              {sport === "NFL" && <h3>{group}</h3>}
              <div className="standings-panel__grid">
                {groupSections.map((section) => <StandingTable key={section.name} section={section} sport={sport} />)}
              </div>
            </div>;
          })}
        </div>
      )}
    </section>
  );
}

function StandingTable({ section, sport }: { section: StandingSection; sport: League }) {
  return <article className="standings-panel__table-wrap">
    <h3>{section.name}</h3>
    <div className="standings-panel__scroll">
      <table>
        <thead>
          <tr>
            <th>Team</th>
            <th>Overall</th>
            <th>{sport === "NFL" ? "Div" : "Conf"}</th>
            <th>Pct</th>
            {sport === "NFL" && <th>Seed</th>}
            <th>Strk</th>
          </tr>
        </thead>
        <tbody>
          {section.teams.map((team) => <tr key={team.team}>
            <td><span className="standings-panel__team">{team.logo && <img src={team.logo} alt="" />}{team.team}</span></td>
            <td>{team.overall}</td>
            <td>{sport === "NFL" ? team.division : team.conference}</td>
            <td>{team.winPct}</td>
            {sport === "NFL" && <td>{team.seed}</td>}
            <td>{team.streak}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </article>;
}
