import { validExportPassword } from "../../../../lib/export-password";
import { participationOrigin } from "../../../../lib/participation-security";
import { seasonEndConfirmation } from "../../../../lib/audience-season-end";
import { participationRpc } from "../../../../lib/participation-store";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
// No localhost bypass for a confirmation that can authorise central deletion.
const authorized = (r: Request) => validExportPassword(r.headers.get("authorization"), process.env.EXPORT_STUDIO_PASSWORD);
export async function GET(request: Request) {
  if (!authorized(request)) return reply({ error: "Private admin authentication required." }, 401);
  try { return reply(await participationRpc("hub_audience_retention_status", {})); }
  catch { return reply({ error: "Retention status unavailable." }, 503); }
}
export async function POST(request: Request) {
  if (!authorized(request)) return reply({ error: "Private admin authentication required." }, 401);
  if (!participationOrigin(request)) return reply({ error: "Same-origin requests only." }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply({ error: "JSON requests only." }, 415);
  let end;
  try {
    const reader = request.body?.getReader(); if (!reader) return reply({ error: "Missing confirmation." }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2048) { await reader.cancel(); return reply({ error: "Request too large." }, 413); } chunks.push(value); }
    end = seasonEndConfirmation(JSON.parse(Buffer.concat(chunks).toString("utf8")), new Date().toISOString());
  } catch { return reply({ error: "Confirm an ended postseason, its actual season-end timestamp and an official HTTPS reference." }, 400); }
  try {
    const result = await participationRpc("hub_audience_confirm_season_end", { p_league: end.league, p_season: end.season, p_ended_at: end.endedAt, p_reference: end.reference, p_postseason_complete: true });
    if (result === "conflict") return reply({ error: "This season already has a different confirmation. Review it before any controlled correction." }, 409);
    return reply({ confirmed: true, league: end.league, season: end.season, endedAt: end.endedAt, expiresAt: end.expiresAt });
  } catch { return reply({ error: "Season confirmation could not be saved." }, 503); }
}
