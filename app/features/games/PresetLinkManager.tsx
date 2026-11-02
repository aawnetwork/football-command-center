"use client";
import { useEffect, useState } from "react";
import type { PresetInvitation } from "../../lib/preset-invitations";
import "./preset-contributors.css";

async function linksApi(init?: RequestInit) {
  const response = await fetch("/api/admin/preset-links", { ...init, cache: "no-store" });
  const body = await response.json().catch(() => ({ error: "Admin access expired. Reload this page." }));
  if (!response.ok) throw new Error(body.error ?? "Unable to manage invitations.");
  return body;
}
function linkState(link: PresetInvitation) {
  return link.revoked_at ? "Revoked" : link.expires_at && Date.parse(link.expires_at) <= Date.now() ? "Expired" : link.consumed_at ? "Submitted" : "Active";
}
export function PresetLinkManager({ invitations: links, onInvitations }: { invitations: PresetInvitation[]; onInvitations: (links: PresetInvitation[]) => void }) {
  const [label, setLabel] = useState("");
  const [mode, setMode] = useState("one_time");
  const [expiry, setExpiry] = useState("");
  const [restricted, setRestricted] = useState(false);
  const [season, setSeason] = useState(new Date().getFullYear());
  const [week, setWeek] = useState(1);
  const [createdUrl, setCreatedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    linksApi().then((data) => { if (!cancelled) { onInvitations(data.invitations); } })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onInvitations]);
  async function refresh() {
    setBusy(true); setError("");
    try { const data = await linksApi(); onInvitations(data.invitations); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function create() {
    setBusy(true); setError(""); setCreatedUrl(""); setMessage("");
    try {
      const data = await linksApi({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "create", label, mode, expires_at: expiry ? new Date(expiry).toISOString() : null,
        season: restricted ? season : null, week: restricted ? week : null,
      }) });
      const next = [data.invitation, ...links]; onInvitations(next);
      setCreatedUrl(new URL(data.path, window.location.origin).href);
      setMessage("Invitation created. Copy the link now; it is shown only once.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function revoke(link: PresetInvitation) {
    if (!window.confirm(`Revoke access for ${link.label}? Saved presets will be retained.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await linksApi({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "revoke", id: link.id }) });
      const next = links.map((item) => item.id === link.id ? data.invitation : item); onInvitations(next);
      setCreatedUrl(""); setMessage("Link revoked. Further guest access is blocked, including open sessions. Saved and published presets are retained.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="preset-invitations" aria-labelledby="preset-invitations-title">
    <h2 id="preset-invitations-title">Contributor links</h2>
    <p>Create a separate link for each contributor. Anyone holding a link can use its access; the contributor name is your label, not a verified identity. Only admins can publish.</p>
    <div className="export-studio__controls">
      <label>Contributor name<input value={label} maxLength={100} disabled={busy} onChange={(e) => setLabel(e.target.value)} /></label>
      <label>Link type<select value={mode} disabled={busy} onChange={(e) => setMode(e.target.value)}><option value="one_time">One preset</option><option value="continuous">Continuous</option></select></label>
      <label>Expires at (your local time, optional)<input type="datetime-local" value={expiry} disabled={busy} onChange={(e) => setExpiry(e.target.value)} /></label>
      <label className="preset-checkbox"><input type="checkbox" checked={restricted} disabled={busy} onChange={(e) => setRestricted(e.target.checked)} />Restrict to a season and week</label>
      {restricted && <><label>Invitation season<input type="number" min={2000} max={new Date().getFullYear() + 1} value={season} disabled={busy} onChange={(e) => { const year = Number(e.target.value); setSeason(year); if (year !== 2026 && week === 0) setWeek(1); }} /></label>
        <label>Invitation week<select value={week} disabled={busy} onChange={(e) => setWeek(Number(e.target.value))}>{Array.from({ length: season === 2026 ? 17 : 16 }, (_, i) => season === 2026 ? i : i + 1).map((value) => <option key={value} value={value}>Week {value}</option>)}</select></label></>}
      <button disabled={busy || !label.trim()} onClick={create}>Generate contributor link</button>
      <p>One-preset links allow draft saves until submission. Returning that preset for changes reopens the same link for that preset. Continuous links allow further presets until revoked or expired.</p>
      {createdUrl && <div className="preset-created-link"><label>New contributor link<textarea readOnly rows={3} value={createdUrl} onFocus={(e) => e.target.select()} /></label><button onClick={async () => { try { await navigator.clipboard.writeText(createdUrl); setMessage("Contributor link copied."); } catch { setError("Copy the link from the field above."); } }}>Copy link</button></div>}
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    </div>
    <details><summary>Manage existing links ({links.length})</summary>
      <button disabled={busy || loading} onClick={refresh}>Refresh link status</button>
      {loading && <p role="status">Loading contributor links…</p>}
      <ul className="preset-link-list">{links.map((link) => <li key={link.id}><div><strong>{link.label}</strong> · {link.mode === "one_time" ? "One preset" : "Continuous"} · {linkState(link)}
        <p>{link.season !== null ? `${link.season} Week ${link.week}` : "Any supported season/week"} · {link.expires_at ? `Expires ${new Date(link.expires_at).toLocaleString("en-GB")}` : "No expiry"}</p></div>
        <button disabled={busy || !!link.revoked_at} onClick={() => revoke(link)} aria-label={`Revoke link for ${link.label}`}>Revoke</button></li>)}</ul>
    </details>
  </section>;
}
