import { DeckError, deckSlate, validateDraft } from "../../../lib/deck-validation";
import { deckGames } from "../../../lib/deck-store";
import { checkInvitationSlate, hashPresetToken, presetId, presetRevision, presetToken } from "../../../lib/preset-invitations";
import { presetBody, presetFailure, presetReply } from "../../../lib/preset-http";
import { presetRpc, type GuestView } from "../../../lib/preset-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const token = presetToken(request);
    const params = new URL(request.url).searchParams;
    const games = params.get("view") === "games";
    const data = await presetRpc("desk_guest_preset", { p_token_hash: hashPresetToken(token), p_action: games ? "games" : "read" }) as GuestView;
    if (!games) return presetReply(data);
    const { season, week } = deckSlate(params.has("season") ? Number(params.get("season")) : null, params.has("week") ? Number(params.get("week")) : null);
    checkInvitationSlate(data.invitation, season, week);
    return presetReply({ games: await deckGames(season, week) });
  } catch (error) { return presetFailure(error); }
}
export async function POST(request: Request) {
  try {
    const token = presetToken(request);
    const body = await presetBody(request);
    if (Object.keys(body).some((key) => !["action", "id", "revision", "draft"].includes(key)) || !["create", "save", "submit"].includes(body.action as string)) throw new DeckError("Guests can only save drafts or submit for review.", 403);
    if (body.action === "create") {
      if (body.id !== undefined || body.revision !== undefined) throw new DeckError("Invalid creation fields.");
    } else { presetId(body.id); presetRevision(body.revision); }
    if (body.action === "submit" && body.draft !== undefined) throw new DeckError("Save your draft before submitting.");
    const hash = hashPresetToken(token);
    const data = await presetRpc("desk_guest_preset", { p_token_hash: hash, p_action: "read" }) as GuestView;
    const current = body.action === "create" ? null : data.decks.find((deck) => deck.id === body.id);
    if (body.action !== "create" && !current) throw new DeckError("Preset not found.", 404);
    if (current && current.revision !== body.revision) throw new DeckError("This preset changed elsewhere. Reload before continuing.", 409);
    if (current && !["draft", "returned"].includes(current.review_state)) throw new DeckError("This preset is locked for admin review.", 409);
    const candidate = body.action === "submit" ? current!.draft : body.draft;
    const input = candidate as { season?: unknown; week?: unknown } | undefined;
    const { season, week } = deckSlate(input?.season, input?.week);
    checkInvitationSlate(data.invitation, season, week);
    const games = await deckGames(season, week);
    const draft = validateDraft(candidate, games.map((game) => game.id), body.action === "submit");
    return presetReply(await presetRpc("desk_guest_preset", {
      p_token_hash: hash, p_action: body.action, p_id: body.id ?? null, p_revision: body.revision ?? null,
      p_draft: body.action === "submit" ? null : draft,
    }), body.action === "create" ? 201 : 200);
  } catch (error) { return presetFailure(error); }
}
