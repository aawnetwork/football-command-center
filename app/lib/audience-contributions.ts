import type { GameContext, League } from "./game-context";

export type ContributionChange =
  | { kind: "tier"; league: League; season: number; eventId: string; identity: string; tier: "S" | "A" | "B" | "C" | "D" | null }
  | { kind: "clearTiers"; league: League }
  | { kind: "favourite"; league: League; teamId: string | null };
export type ContributionRequest = ContributionChange & { revision: number; consentGrantedAt: string; consentReceipt: string };
const id = (value: unknown): value is string => typeof value === "string" && /^[1-9]\d{0,11}$/.test(value);

export function parseContribution(value: unknown): ContributionRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const fields = v.kind === "tier" ? ["season", "eventId", "identity", "tier"] : v.kind === "favourite" ? ["teamId"] : v.kind === "clearTiers" ? [] : null;
  if (!fields || Object.keys(v).some(key => !["kind", "league", "revision", "consentGrantedAt", "consentReceipt", ...fields].includes(key)) ||
      !["NFL", "CFB"].includes(v.league as string) || !Number.isSafeInteger(v.revision) || Number(v.revision) < 1 ||
      typeof v.consentReceipt !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.consentReceipt) ||
      typeof v.consentGrantedAt !== "string" || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v.consentGrantedAt) || !Number.isFinite(Date.parse(v.consentGrantedAt))) return null;
  if (v.kind === "tier" && (!Number.isInteger(v.season) || Number(v.season) < 2000 || Number(v.season) > 2100 || !id(v.eventId) ||
      v.identity !== `${v.league}:${v.season}:${v.eventId}` || !(v.tier === null || ["S", "A", "B", "C", "D"].includes(v.tier as string)))) return null;
  if (v.kind === "favourite" && v.teamId !== null && !id(v.teamId)) return null;
  return v as ContributionRequest;
}

// Called only by deliberate controls, never hydration, defaults or curated overlays.
export function personalTierChange(context: GameContext | undefined, league: League, tier: "S" | "A" | "B" | "C" | "D" | null): ContributionChange | null {
  if (!context?.verified || context.league !== league || context.season === null || !context.eventId || context.identity !== `${league}:${context.season}:${context.eventId}`) return null;
  return { kind: "tier", league, season: context.season, eventId: context.eventId, identity: context.identity, tier };
}

export const contributionRevisionKey = "aaw-hub-contribution-revision-v1";
export function advanceRevision(previous: string | null, now: number): number {
  const saved = Number(previous);
  const next = Math.max(now * 1000, Number.isSafeInteger(saved) && saved >= 0 ? saved + 1 : 0);
  if (!Number.isSafeInteger(next) || next < 1 || next > now * 1000 + 60_000_000) throw Error("Selection ordering unavailable.");
  return next;
}

// A browser-local ordering counter, not an identity or a selection backlog.
// Fail safely if cross-tab ordering cannot be guaranteed; local controls still work.
export async function reserveContributionRevision(): Promise<number> {
  if (!navigator.locks) throw Error("Secure cross-tab ordering unavailable.");
  return navigator.locks.request(contributionRevisionKey, () => {
    const next = advanceRevision(localStorage.getItem(contributionRevisionKey), Date.now());
    localStorage.setItem(contributionRevisionKey, String(next));
    return next;
  });
}
