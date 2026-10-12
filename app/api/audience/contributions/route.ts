import { parseContribution } from "../../../lib/audience-contributions";
import { validateContribution } from "../../../lib/audience-validation";
import { participationEnabled, participationOrigin, participationToken, hashParticipationToken } from "../../../lib/participation-security";
import { participationRpc, ParticipationError } from "../../../lib/participation-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  if (!participationOrigin(request)) return reply({ error: "Same-origin requests only." }, 403);
  if (!participationEnabled(process.env)) return reply({ error: "Audience collection is not enabled." }, 503);
  const token = participationToken(request);
  if (!token) return reply({ error: "Active participation is required." }, 401);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply({ error: "JSON requests only." }, 415);
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Missing selection." }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return reply({ error: "Request too large." }, 413); }
      chunks.push(value);
    }
    let value;
    try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reply({ error: "Invalid JSON." }, 400); }
    const change = parseContribution(value);
    if (!change) return reply({ error: "Invalid selection." }, 400);
    const hash = hashParticipationToken(token);
    const gate = await participationRpc("hub_audience_contribution_gate", { p_hash: hash, p_granted_at: change.consentGrantedAt, p_receipt: change.consentReceipt });
    if (gate === "inactive") return reply({ error: "Active participation is required." }, 401);
    if (gate !== "ready") return reply({ error: "Too many selections. Please wait before making another change." }, 429);
    const verified = await validateContribution(change);
    // Recheck the launch boundary and consent inside the write transaction after any feed wait.
    if (!participationEnabled(process.env)) return reply({ error: "Audience collection is not enabled." }, 503);
    const result = await participationRpc("hub_audience_write_selection", {
      p_hash: hash, p_granted_at: change.consentGrantedAt, p_receipt: change.consentReceipt, p_kind: change.kind, p_league: change.league,
      p_season: change.kind === "tier" ? change.season : verified.season,
      p_event_id: change.kind === "tier" ? change.eventId : null,
      p_value: change.kind === "tier" ? change.tier : change.kind === "favourite" ? change.teamId : null,
      p_season_type: verified.seasonType, p_revision: change.revision,
    });
    if (result === "inactive") return reply({ error: "Participation ended; selection was not collected." }, 401);
    if (result !== "saved") return reply({ error: "Selection superseded or conflicted with a newer change." }, 409);
    return reply({ saved: true });
  } catch (error) {
    return reply({ error: error instanceof ParticipationError ? error.message : "Central selection could not be saved. Your local selection still works." }, error instanceof ParticipationError ? error.status : 503);
  }
}
