import { dataCheckLabel, emptyDataCheck, type DataCheck } from "../lib/data-check";

export function DataCheckIndicator({ check, scope }: { check: DataCheck; scope: string }) {
  const visible = check.scope === scope ? check : emptyDataCheck;
  // Absolute time remains accurate when idle refreshes stop. No display timer/polling.
  return <small data-export-omit style={{ display: "block", color: "#94a3b8", fontSize: "12px", margin: "6px 0" }}
    title="Last successful Hub check, not the source publication time. Upstream update time is unavailable.">
    {dataCheckLabel(visible)}
  </small>;
}
