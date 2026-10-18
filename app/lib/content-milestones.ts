import type { AllTimeLeague, AllTimeSignal } from "./all-time-monitor";

/** One editorial item per achievement; a fall in rank is not an achievement. */
export function achievedMilestoneSignals(signals: readonly AllTimeSignal[], league: AllTimeLeague, now = Date.now()): AllTimeSignal[] {
  const chosen = new Map<string, AllTimeSignal>();
  const priority = { "record-holder": 3, "new-entry": 2, "rank-movement": 1 };
  for (const signal of signals) {
    const at = Date.parse(signal.createdAt);
    if (signal.league !== league || !signal.isActive || signal.audience !== "individual" || signal.period === "single-game" ||
        !Number.isFinite(at) || at > now || now - at >= 7 * 86400000 ||
        (signal.type === "rank-movement" && (signal.previousRank === undefined || signal.currentRank >= signal.previousRank))) continue;
    const key = JSON.stringify([signal.league, signal.period, signal.category, signal.player, signal.createdAt]);
    const prior = chosen.get(key);
    if (!prior || priority[signal.type] > priority[prior.type]) chosen.set(key, signal);
  }
  return [...chosen.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
