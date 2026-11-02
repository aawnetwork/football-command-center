import { createHash, randomBytes } from "node:crypto";
import { DeckError, deckSlate } from "./deck-validation";

export type PresetInvitation = {
  id: string; label: string; mode: "one_time" | "continuous";
  season: number | null; week: number | null; expires_at: string | null;
  revoked_at: string | null; consumed_at: string | null; created_at: string;
};
export const invitationFields = "id,label,mode,season,week,expires_at,revoked_at,consumed_at,created_at";
export const newPresetToken = () => randomBytes(32).toString("hex");
export const hashPresetToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function presetToken(request: Request) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new DeckError("Open your contributor invitation link to continue.", 401);
  return match[1];
}
export function presetId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new DeckError("Invalid preset or invitation ID.");
}
export function presetRevision(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new DeckError("Invalid preset revision.");
}
export function validateInvitation(input: Record<string, unknown>, now = Date.now()) {
  if (Object.keys(input).some((key) => !["action", "label", "mode", "season", "week", "expires_at"].includes(key))) throw new DeckError("Invalid invitation fields.");
  if (typeof input.label !== "string" || !input.label.trim() || input.label.trim().length > 100 || /[\x00-\x1f]/.test(input.label)) throw new DeckError("Enter a contributor name of 1–100 characters.");
  if (input.mode !== "one_time" && input.mode !== "continuous") throw new DeckError("Choose a one-time or continuous link.");
  let season: number | null = null; let week: number | null = null;
  if (input.season != null || input.week != null) ({ season, week } = deckSlate(input.season, input.week));
  let expires_at: string | null = null;
  if (input.expires_at != null) {
    if (typeof input.expires_at !== "string" || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(input.expires_at)) throw new DeckError("Choose a valid expiry date.");
    const time = Date.parse(input.expires_at);
    if (!Number.isFinite(time) || time <= now) throw new DeckError("Expiry must be in the future.");
    expires_at = new Date(time).toISOString();
  }
  return { label: input.label.trim(), mode: input.mode, season, week, expires_at };
}
export function checkInvitationSlate(invitation: Pick<PresetInvitation, "season" | "week">, season: number, week: number) {
  if (invitation.season !== null && (invitation.season !== season || invitation.week !== week)) throw new DeckError("This invitation is restricted to its selected season and week.", 403);
}
