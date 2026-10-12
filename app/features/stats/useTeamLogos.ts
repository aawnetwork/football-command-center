"use client";
import { useEffect, useState } from "react";
import { loadTeamDirectory, resolveTeamLogo, type LogoTeam } from "../../lib/team-logos";
export function useTeamLogos(league: "NFL" | "CFB") {
  const [teams, setTeams] = useState<LogoTeam[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadTeamDirectory(league).then((data) => {
      if (!cancelled) setTeams(data.sections.flatMap((section) => section.teams));
    }).catch(() => { /* Names/statistics remain usable if logo metadata fails. */ });
    return () => { cancelled = true; };
  }, [league]);
  return (name: string) => resolveTeamLogo(name, teams);
}
