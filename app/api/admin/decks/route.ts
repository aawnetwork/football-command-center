import { canUseExportStudio } from "../../../lib/export-access";
import { validExportPassword } from "../../../lib/export-password";
import { deckDb, deckGames, saveDeck } from "../../../lib/deck-store";
import { DeckError, deckSlate, sameDeckOrigin } from "../../../lib/deck-validation";

export const dynamic = "force-dynamic";
function reply(body: unknown, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } }); }
function authorized(request: Request) {
  return canUseExportStudio(process.env.NODE_ENV, request.headers.get("host")) || validExportPassword(request.headers.get("authorization"), process.env.EXPORT_STUDIO_PASSWORD);
}
function failure(error: unknown) { return reply({ error: error instanceof DeckError ? error.message : "Unable to complete this request. Try again." }, error instanceof DeckError ? error.status : 503); }
export async function GET(request: Request) {
  if (!authorized(request)) return reply({ error: "Private admin authentication required." }, 401);
  try {
    const params = new URL(request.url).searchParams;
    if (params.get("view") === "games") {
      const { season, week } = deckSlate(params.has("season") ? Number(params.get("season")) : null, params.has("week") ? Number(params.get("week")) : null);
      return reply({ games: await deckGames(season, week) });
    }
    return reply({ decks: await deckDb("select=id,draft,published,revision,updated_at,published_at&order=updated_at.desc&limit=1000") });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!authorized(request)) return reply({ error: "Private admin authentication required." }, 401);
  if (!sameDeckOrigin(request)) return reply({ error: "Same-origin requests only." }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply({ error: "JSON requests only." }, 415);
  try {
    if (Number(request.headers.get("content-length")) > 20000) return reply({ error: "Deck request is too large." }, 413);
    const reader = request.body?.getReader();
    if (!reader) throw new DeckError("Missing request body.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 20000) { await reader.cancel(); return reply({ error: "Deck request is too large." }, 413); }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    let body;
    try { body = JSON.parse(text); } catch { throw new DeckError("Invalid JSON."); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["action", "id", "revision", "draft"].includes(key)) || !["create", "save", "publish", "unpublish"].includes(body.action)) throw new DeckError("Invalid deck action.");
    if ((body.action === "create" && (body.id !== undefined || body.revision !== undefined)) || (["publish", "unpublish"].includes(body.action) && body.draft !== undefined)) throw new DeckError("Invalid fields for this action.");
    return reply({ deck: await saveDeck(body.action, body.id, body.revision, body.draft) });
  } catch (error) { return failure(error); }
}
