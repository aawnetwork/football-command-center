import { consentVersion, consentText } from "../../../lib/participation-contract";
import { participationEnabled, participationToken, participationOrigin, newParticipationToken, hashParticipationToken, participationSetCookie, clearParticipationCookie } from "../../../lib/participation-security";
import { participationRpc, ParticipationError } from "../../../lib/participation-store";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200, cookie?: string) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
const failure = (error: unknown) => reply({ error: error instanceof ParticipationError ? error.message : "Participation request failed. Please retry." }, error instanceof ParticipationError ? error.status : 503);
async function limit(scope: string, maximum: number) {
  if (!await participationRpc("hub_audience_limit", { p_scope: scope, p_maximum: maximum })) throw new ParticipationError("Too many requests. Please wait a minute and retry.", 429);
}
export async function GET(request: Request) {
  const enabled = participationEnabled(process.env), token = participationToken(request);
  if (!enabled && !token) return reply({ available: false, active: false, consentVersion: null, grantedAt: null });
  try {
    const state = await participationRpc("hub_audience_state", { p_hash: token ? hashParticipationToken(token) : null });
    return reply({ available: enabled, active: state.active === true, consentVersion: state.consentVersion ?? null, grantedAt: state.grantedAt ?? null });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!participationOrigin(request)) return reply({ error: "Same-origin requests only." }, 403);
  if (!participationEnabled(process.env)) return reply({ error: "Participation is not enabled." }, 503);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply({ error: "JSON requests only." }, 415);
  try {
    const reader = request.body?.getReader(); if (!reader) return reply({ error: "Missing consent." }, 400);
    let text = "", size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1024) { await reader.cancel(); return reply({ error: "Request too large." }, 413); } text += new TextDecoder().decode(value); }
    let body; try { body = JSON.parse(text); } catch { return reply({ error: "Invalid JSON." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["action", "consentVersion", "agree"].includes(key)) || !["prepare", "confirm"].includes(body.action) || body.agree !== true || body.consentVersion !== consentVersion) return reply({ error: "Explicit consent to the current wording is required." }, 400);
    const token = participationToken(request);
    await limit(body.action, 60);
    if (token) {
      const state = await participationRpc("hub_audience_state", { p_hash: hashParticipationToken(token) });
      if (state.active === true) return reply({ available: true, active: true, consentVersion: state.consentVersion, grantedAt: state.grantedAt });
      if (body.action === "prepare" && state.prepared === true) return reply({ prepared: true });
    }
    if (body.action === "prepare") {
      const prepared = newParticipationToken();
      await participationRpc("hub_audience_prepare", { p_hash: hashParticipationToken(prepared) });
      return reply({ prepared: true }, 200, participationSetCookie(prepared));
    }
    if (!token) return reply({ error: "A secure participation cookie is required. Check browser settings and retry." }, 409);
    const state = await participationRpc("hub_audience_grant", { p_hash: hashParticipationToken(token), p_version: consentVersion, p_text_hash: hashParticipationToken(consentText) });
    if (!state.active) return reply({ error: "This participation credential has expired. Start a new opt-in." }, 409);
    return reply({ available: true, active: true, consentVersion: state.consentVersion, grantedAt: state.grantedAt }, 200, participationSetCookie(token, true));
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  if (!participationOrigin(request)) return reply({ error: "Same-origin requests only." }, 403);
  const token = participationToken(request);
  if (!token) return reply({ active: false, deleted: false, noCredential: true, error: "No participation credential is available. Deletion of earlier records cannot be confirmed." }, 200, clearParticipationCookie);
  try {
    const deleted = await participationRpc("hub_audience_withdraw", { p_hash: hashParticipationToken(token) });
    if (deleted !== true) throw new ParticipationError("Too many repeated deletion requests. Please wait a minute and retry.", 429);
    return reply({ active: false, deleted: true }, 200, clearParticipationCookie);
  } catch (error) { return failure(error); }
}
