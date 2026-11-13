import identities from "./cfb-school-identities.json" with { type: "json" };

type Rivalry = { teams: readonly string[]; name: string; trophy: string | null };
type TeamId = string | number | null;

function schoolKey(name: string) {
  return name.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const idsByName = new Map<string, string | null>();
for (const [id, names] of Object.entries(identities)) {
  for (const name of names) {
    const key = schoolKey(name);
    const existing = idsByName.get(key);
    idsByName.set(key, existing === undefined || existing === id ? id : null);
  }
}

function schoolIdentity(name: string, id?: TeamId) {
  if (id != null && String(id).trim()) return `espn:${id}`;
  const key = schoolKey(name);
  const known = idsByName.get(key);
  return known ? `espn:${known}` : key && known === undefined ? `name:${key}` : "";
}

export function findCfbRivalry<T extends Rivalry>(
  game: { homeTeam: string; awayTeam: string; homeTeamId?: TeamId; awayTeamId?: TeamId },
  catalogue: readonly T[],
): T | undefined {
  const home = schoolIdentity(game.homeTeam, game.homeTeamId);
  const away = schoolIdentity(game.awayTeam, game.awayTeamId);
  if (!home || !away || home === away) return undefined;

  return catalogue.find(({ teams }) => {
    const [first, second] = teams.map(name => schoolIdentity(name));
    return (home === first && away === second) || (home === second && away === first);
  });
}
