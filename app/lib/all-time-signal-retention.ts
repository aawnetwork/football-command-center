import type { AllTimeSignal } from "./all-time-monitor";

// Refreshing snapshots must not erase the events produced by earlier refreshes.
// Keep the existing storage bound; Content applies its own seven-day window.
export function retainAllTimeSignals(
  existing: readonly AllTimeSignal[],
  generated: readonly AllTimeSignal[],
): AllTimeSignal[] {
  const unique = new Map<string, AllTimeSignal>();
  for (const signal of [...generated, ...existing]) {
    if (!unique.has(signal.id)) unique.set(signal.id, signal);
  }
  return [...unique.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 250);
}
