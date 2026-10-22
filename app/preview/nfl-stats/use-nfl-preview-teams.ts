'use client';

import { useEffect, useState } from 'react';
import { loadTeamDirectory, resolveTeam, type LogoTeam } from '../../lib/team-logos';
import { nflTeamNameByAbbreviation } from '../../nfl/data/divisions';

/** Reuse the Hub's one-per-page directory, outside the live refresh loop. */
export function useNflPreviewTeams(enabled = true) {
  const [teams, setTeams] = useState<LogoTeam[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadTeamDirectory('NFL').then(directory => {
      if (active) setTeams(directory.sections.flatMap(section => section.teams));
    }).catch(() => { /* Full team names remain available without logo metadata. */ });
    return () => { active = false; };
  }, [enabled]);
  return (code: string) => {
    const name = nflTeamNameByAbbreviation[code] ?? code;
    const metadata = resolveTeam(name, teams);
    return { name: metadata?.team ?? name, logo: metadata?.logo ?? undefined };
  };
}
