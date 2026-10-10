import "server-only";
import { DeckError, validateDraft, type DeckDraft } from "./deck-validation";
import { GET as scoreboard } from "../api/scoreboard/route";

export type StoredDeck = { id: string; draft: DeckDraft; published: DeckDraft | null; revision: number; updated_at: string; published_at: string | null };
const fields = "id,draft,published,revision,updated_at,published_at";
export async function deckDb(query: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new DeckError("Deck database is not configured.", 503);
  const response = await fetch(`${url}/rest/v1/desk_curated_decks?${query}`, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  if (!response.ok) throw new DeckError("Deck database is unavailable. Your changes have not been saved.", 503);
  return response.json();
}
export async function deckGames(season: number, week: number) {
  const response = await scoreboard(new Request(`http://desk-internal/api/scoreboard?season=${season}&week=${week}`));
  if (!response.ok) throw new DeckError("Could not verify this season/week's games. Try again.", 503);
  const slate = await response.json();
  if (slate.season !== season || slate.week !== week || !slate.games?.length) throw new DeckError("No verified games are available for this season/week.");
  return slate.games as { id: number; awayTeam: string; homeTeam: string; startDate: string }[];
}
export async function saveDeck(action: "create" | "save" | "publish" | "unpublish", id: string | undefined, revision: number | undefined, draft: unknown) {
  let current: StoredDeck | undefined;
  if (action !== "create") {
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !Number.isSafeInteger(revision) || revision! < 1) throw new DeckError("Invalid deck ID or revision.");
    [current] = await deckDb(`select=${fields}&id=eq.${id}`) as StoredDeck[];
    if (!current || current.revision !== revision) throw new DeckError("This deck changed elsewhere. Reload it before saving.", 409);
  }
  let changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (action === "unpublish") changes = { ...changes, published: null, published_season: null, published_week: null, published_at: null };
  else {
    const candidate = action === "publish" ? current!.draft : draft;
    // Validate basic shape before requesting a slate.
    const input = candidate as DeckDraft;
    const { deckSlate } = await import("./deck-validation");
    if (!input) throw new DeckError("Invalid deck.");
    deckSlate(input.season, input.week);
    const games = await deckGames(input.season, input.week);
    const valid = validateDraft(candidate, games.map((game) => game.id), action === "publish");
    if (action === "publish") changes = { ...changes, published: valid, published_season: valid.season, published_week: valid.week, published_at: new Date().toISOString() };
    else changes.draft = valid;
  }
  if (current) changes.revision = revision! + 1;
  const rows = await deckDb(`select=${fields}${current ? `&id=eq.${id}&revision=eq.${revision}` : ""}`, { method: current ? "PATCH" : "POST", body: JSON.stringify(changes) }) as StoredDeck[];
  if (!rows.length) throw new DeckError("This deck changed elsewhere. Reload it before saving.", 409);
  return rows[0];
}
