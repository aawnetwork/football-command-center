import "server-only";
import { DeckError } from "./deck-validation";
import type { DeckDraft } from "./deck-validation";
import type { PresetInvitation } from "./preset-invitations";

export type GuestDeck = {
  id: string; draft: DeckDraft; revision: number; review_state: "draft" | "submitted" | "returned" | "approved";
  review_note: string | null; submitted_at: string | null; updated_at: string;
};
export type GuestView = { invitation: PresetInvitation; decks: GuestDeck[] };
export async function presetDb(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new DeckError("Preset database is not configured.", 503);
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  if (!response.ok) throw new DeckError("Preset database is unavailable. Reload before retrying any save or submission.", 503);
  return response.json();
}
export async function presetRpc(name: "desk_guest_preset" | "desk_return_preset", args: Record<string, unknown>) {
  const data = await presetDb(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
  if (data.error) throw new DeckError(data.error, data.status ?? 400);
  return data;
}
