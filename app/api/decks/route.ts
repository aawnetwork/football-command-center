import { deckDb } from "../../lib/deck-store";
import { deckSlate, DeckError } from "../../lib/deck-validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const { season, week } = deckSlate(params.has("season") ? Number(params.get("season")) : null, params.has("week") ? Number(params.get("week")) : null);
    const rows = await deckDb(`select=id,published&published=not.is.null&published_season=eq.${season}&published_week=eq.${week}&order=published_at.desc&limit=1000`) as { id: string; published: object }[];
    return Response.json({ decks: rows.map((row) => ({ ...row.published, id: row.id })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof DeckError ? error.message : "Published decks are temporarily unavailable." }, { status: error instanceof DeckError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
