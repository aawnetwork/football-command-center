/** Narrow, read-only adapter for ESPN's public football feeds. */
export type FootballLeague = 'NFL' | 'CFB';
export const footballSport = (league: FootballLeague) => league === 'NFL' ? 'nfl' : 'college-football';
// ESPN payloads differ by endpoint; validate identities and periods at each boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EspnData = Record<string, any>;
export async function espnFootball(url: string, seconds = 60): Promise<EspnData> {
  const response = await fetch(url, { next: { revalidate: seconds }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('ESPN is temporarily unavailable. Please try again.');
  return response.json();
}
export function footballSelection(request: Request) {
  const p = new URL(request.url).searchParams;
  const league = p.get('league');
  if (league !== 'NFL' && league !== 'CFB') throw new Error('Choose NFL or College Football.');
  const raw = p.get('season');
  if (raw !== null && (!/^\d{4}$/.test(raw) || +raw < 2024 || +raw > new Date().getUTCFullYear() + 1)) throw new Error('Invalid football season.');
  return { p, league: league as FootballLeague, season: raw === null ? null : +raw };
}
export async function footballClock(league: FootballLeague) {
  const d = await espnFootball(`https://site.api.espn.com/apis/site/v2/sports/football/${footballSport(league)}/scoreboard?limit=100${league === 'CFB' ? '&groups=80' : ''}`);
  const season = d.season?.year ?? d.leagues?.[0]?.season?.year;
  const phase = d.season?.type ?? d.leagues?.[0]?.season?.type?.type;
  if (!Number.isInteger(season)) throw new Error('The current football season is unavailable.');
  return { season: season as number, phase: Number(phase), week: Number(d.week?.number) || null };
}
export function espnImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const u = new URL(value); return u.protocol === 'https:' && (u.hostname === 'a.espncdn.com' || u.hostname.endsWith('.espncdn.com')) ? value : null; } catch { return null; }
}
export function standingEntries(group: EspnData): EspnData[] {
  return [...(group.standings?.entries ?? []), ...(group.children ?? []).flatMap(standingEntries)];
}
export function standingStat(entry: EspnData, name: string) {
  return (entry.stats ?? []).find((s: EspnData) => s.type === name || s.name === name);
}
export async function footballTeams(league: FootballLeague, season: number) {
  const d = await espnFootball(`https://site.api.espn.com/apis/v2/sports/football/${footballSport(league)}/standings?season=${season}${league === 'CFB' ? '&groups=80' : ''}`, 300);
  if (d.season?.year !== season) throw new Error('Standings for this season are unavailable.');
  return { raw: d, teams: (d.children ?? []).flatMap((g: EspnData) => standingEntries(g).map(e => ({ id: String(e.team.id), name: String(e.team.displayName), conference: String(g.name), conferenceId: String(g.id), logo: espnImage(e.team.logos?.[0]?.href), entry: e }))) as { id: string; name: string; conference: string; conferenceId: string; logo: string | null; entry: EspnData }[] };
}
