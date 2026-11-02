import { presetDb, presetRpc } from "../../../lib/preset-store";
import { invitationFields, newPresetToken, hashPresetToken, presetId, presetRevision, validateInvitation } from "../../../lib/preset-invitations";
import { presetAdmin, presetBody, presetFailure, presetReply } from "../../../lib/preset-http";
import { DeckError } from "../../../lib/deck-validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    presetAdmin(request);
    return presetReply({ invitations: await presetDb(`desk_preset_invitations?select=${invitationFields}&order=created_at.desc&limit=1000`) });
  } catch (error) { return presetFailure(error); }
}
export async function POST(request: Request) {
  try {
    presetAdmin(request);
    const body = await presetBody(request);
    if (body.action === "create") {
      const invitation = validateInvitation(body);
      const token = newPresetToken();
      const [link] = await presetDb(`desk_preset_invitations?select=${invitationFields}`, { method: "POST", body: JSON.stringify({ ...invitation, token_hash: hashPresetToken(token) }) });
      return presetReply({ invitation: link, path: `/contribute/presets#token=${token}` }, 201);
    }
    if (body.action === "revoke") {
      if (Object.keys(body).some((key) => !["action", "id"].includes(key))) throw new DeckError("Invalid revocation fields.");
      presetId(body.id);
      const [invitation] = await presetDb(`desk_preset_invitations?select=${invitationFields}&id=eq.${body.id}`, { method: "PATCH", body: JSON.stringify({ revoked_at: new Date().toISOString() }) });
      if (!invitation) throw new DeckError("Invitation not found.", 404);
      return presetReply({ invitation });
    }
    if (body.action === "return") {
      if (Object.keys(body).some((key) => !["action", "id", "revision", "note"].includes(key))) throw new DeckError("Invalid review fields.");
      presetId(body.id); presetRevision(body.revision);
      if (typeof body.note !== "string" || !body.note.trim() || body.note.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body.note)) throw new DeckError("Enter feedback of 1–1,000 characters.");
      return presetReply(await presetRpc("desk_return_preset", { p_id: body.id, p_revision: body.revision, p_note: body.note.trim() }));
    }
    throw new DeckError("Invalid invitation action.");
  } catch (error) { return presetFailure(error); }
}
