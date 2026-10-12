import "server-only";
export class ParticipationError extends Error { constructor(message: string, public status = 503) { super(message); } }
export async function participationRpc(name: "hub_audience_state" | "hub_audience_prepare" | "hub_audience_grant" | "hub_audience_withdraw" | "hub_audience_limit" | "hub_audience_contribution_gate" | "hub_audience_write_selection" | "hub_audience_write_phase_selection" | "hub_audience_confirm_season_end" | "hub_audience_retention_status", params: Record<string, unknown>) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new ParticipationError("Participation service unavailable.");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify(params) });
  if (!response.ok) throw new ParticipationError("Participation service unavailable. Please retry.");
  return response.json();
}
