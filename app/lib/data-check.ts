export type DataCheck = { at: number | null; failed: boolean; scope: string };
export const emptyDataCheck: DataCheck = { at: null, failed: false, scope: "" };

// A successful fetch is NOT evidence of upstream publication or a data change.
export function recordDataCheck(previous: DataCheck, scope: string, success: boolean, now: number): DataCheck {
  const at = previous.scope === scope ? previous.at : null;
  return { scope, at: success && Number.isFinite(now) ? now : at, failed: !success };
}

export function dataCheckLabel(check: DataCheck): string {
  const time = check.at === null || !Number.isFinite(check.at) ? null : new Date(check.at).toLocaleTimeString("en-GB", {
    timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  return `${check.failed ? "Check failed · " : ""}${time ? `Last checked at ${time} UK` : "Last checked: unavailable"}`;
}

