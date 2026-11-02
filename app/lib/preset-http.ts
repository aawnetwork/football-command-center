import { canUseExportStudio } from "./export-access";
import { validExportPassword } from "./export-password";
import { DeckError, sameDeckOrigin } from "./deck-validation";

export function presetReply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow",
    ...(status === 429 ? { "Retry-After": "60" } : {}),
  } });
}
export function presetFailure(error: unknown) {
  return presetReply({ error: error instanceof DeckError ? error.message : "Unable to complete this request. Try again." }, error instanceof DeckError ? error.status : 503);
}
export function presetAdmin(request: Request) {
  if (!canUseExportStudio(process.env.NODE_ENV, request.headers.get("host")) && !validExportPassword(request.headers.get("authorization"), process.env.EXPORT_STUDIO_PASSWORD)) throw new DeckError("Private admin authentication required.", 401);
}
export async function presetBody(request: Request): Promise<Record<string, unknown>> {
  if (!sameDeckOrigin(request)) throw new DeckError("Same-origin requests only.", 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new DeckError("JSON requests only.", 415);
  if (Number(request.headers.get("content-length")) > 20000) throw new DeckError("Preset request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DeckError("Missing request body.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 20000) { await reader.cancel(); throw new DeckError("Preset request is too large.", 413); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new DeckError("Invalid JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new DeckError("Invalid request.");
  return body;
}
