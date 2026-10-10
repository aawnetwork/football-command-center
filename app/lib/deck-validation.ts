export type DeckDraft = { league: "CFB"; name: string; season: number; week: number; assignments: Record<string, "S" | "A" | "B" | "C" | "D"> };
export class DeckError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function deckSlate(season: unknown, week: unknown) {
  if (!Number.isInteger(season) || (season as number) < 2000 || (season as number) > new Date().getUTCFullYear() + 1 ||
    !Number.isInteger(week) || (week as number) < 0 || (week as number) > 16 || (week === 0 && season !== 2026)) {
    throw new DeckError("Choose a valid season and regular-season week (Week 0 is supported for 2026 only).");
  }
  return { season: season as number, week: week as number };
}
export function validateDraft(value: unknown, gameIds: readonly number[], publishing = false): DeckDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DeckError("Invalid deck.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["league", "name", "season", "week", "assignments"].includes(key)) || input.league !== "CFB") throw new DeckError("Only CFB decks are supported.");
  const slate = deckSlate(input.season, input.week);
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 100 || /[\x00-\x1f]/.test(input.name)) throw new DeckError("Enter a deck name of 1–100 characters.");
  if (!input.assignments || typeof input.assignments !== "object" || Array.isArray(input.assignments)) throw new DeckError("Invalid game assignments.");
  const entries = Object.entries(input.assignments);
  if (entries.length > 200) throw new DeckError("Too many game assignments.");
  const ids = new Set(gameIds.map(String));
  if (entries.some(([id, tier]) => !/^\d+$/.test(id) || !ids.has(id) || typeof tier !== "string" || !["S", "A", "B", "C", "D"].includes(tier))) throw new DeckError("A game or tier does not belong to this season/week. Reload the game list.");
  if (publishing && !entries.length) throw new DeckError("Assign at least one game before publishing.");
  return { league: "CFB", name: input.name.trim(), ...slate, assignments: Object.fromEntries(entries) as DeckDraft["assignments"] };
}
export function sameDeckOrigin(request: Request) {
  const origin = request.headers.get("origin");
  try { return Boolean(origin && new URL(origin).origin === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site"); }
  catch { return false; }
}
