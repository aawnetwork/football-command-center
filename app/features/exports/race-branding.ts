import cfbColours from './cfb-overlay-logo-variants.json';
import nflColours from './nfl-overlay-logo-variants.json';
import { resolveTeam, type LogoTeam } from '../../lib/team-logos';
import { nflTeamNameByAbbreviation } from '../../nfl/data/divisions';
import type { RaceSeries } from './race-data';

type TeamBrand = { color: string; logo: string };
/** Use the Hub's existing verified team IDs, official colours and directory logos.
 * No generic orange bars or silently missing badges are allowed in the Top 10. */
export function brandRaceSeries(series: RaceSeries, teams: LogoTeam[]): RaceSeries {
  const retained = (series.league === 'CFB' ? cfbColours : nflColours).teams as Record<string, TeamBrand>;
  return { ...series, checkpoints: series.checkpoints.map(point => {
    if (point.entries.length < 10) throw Error(`Week ${point.week} has fewer than ten reported competitors. A Top 10 race needs ten at every checkpoint.`);
    const leaders = new Set([...point.entries].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)).slice(0, 10).map(entry => entry.id));
    return { ...point, entries: point.entries.map(entry => {
      const key = entry.teamId ?? entry.team;
      const directory = teams.find(team => team.id === key) ?? resolveTeam(series.league === 'NFL' ? nflTeamNameByAbbreviation[key] ?? entry.team : entry.team, teams);
      const id = directory?.id ?? (/^\d+$/.test(key) ? key : '');
      const brand = retained[id];
      const color = series.league === 'CFB' && id === '2294' ? '#000000' : brand?.color;
      // Light-surface marks sit on a cream badge within the team-coloured bar.
      const logo = directory?.logo ?? entry.logo;
      if (leaders.has(entry.id) && (!color || !/^#[a-f\d]{6}$/i.test(color) || !logo)) throw Error(`Team colour or logo unavailable for ${entry.name}. Refresh the season before exporting.`);
      return { ...entry, team: directory?.team ?? entry.team, teamId: id || key, color, logo: logo ?? undefined };
    }) };
  }) };
}
export async function loadRaceBranding(series: RaceSeries, signal: AbortSignal): Promise<RaceSeries> {
  const response = await fetch(`/api/standings?league=${series.league}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
  if (!response.ok) throw Error('Team colours and logos are unavailable. Retry loading the season.');
  const directory = await response.json() as { sections: { teams: LogoTeam[] }[] };
  if (!Array.isArray(directory.sections)) throw Error('Invalid team directory.');
  return brandRaceSeries(series, directory.sections.flatMap(section => section.teams));
}
