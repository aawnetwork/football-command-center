export const deckTiers = ["S", "A", "B", "C", "D"] as const;
export type DeckTier = (typeof deckTiers)[number];
export type CuratedDeck = {
  id: string;
  league: "CFB";
  season: number;
  week: number;
  name: string;
  assignments: Record<string, DeckTier>;
};

export function availableDecks(decks: readonly CuratedDeck[], season: number, week: number) {
  return decks.filter((deck) => deck.league === "CFB" && deck.season === season && deck.week === week && deck.name.trim());
}

export function validDeckAssignments(assignments: Record<string, unknown>, gameIds: readonly number[]): Record<number, DeckTier> {
  const knownIds = new Set(gameIds.map(String));
  return Object.fromEntries(Object.entries(assignments).filter(([id, tier]) => knownIds.has(id) && deckTiers.includes(tier as DeckTier)).map(([id, tier]) => [id, tier as DeckTier]));
}

export function toggleDeckTier(current: Record<number, DeckTier>, id: number, tier: DeckTier) {
  const next = { ...current };
  if (next[id] === tier) delete next[id];
  else next[id] = tier;
  return next;
}

export type DeckGame = { id: number; awayTeam: string; homeTeam: string };
export function groupDeckGames(games: readonly DeckGame[], assignments: Record<number, DeckTier>, included: readonly DeckTier[]) {
  return deckTiers.filter((tier) => included.includes(tier)).map((tier) => ({
    tier, games: games.filter((game) => assignments[game.id] === tier),
  })).filter((group) => group.games.length > 0);
}
