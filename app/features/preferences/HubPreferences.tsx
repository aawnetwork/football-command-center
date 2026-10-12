"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { favouriteKeys, invitationKey, parseFavourite, writeFavourite, validTeamId, shouldInvite, type PreferenceLeague } from "../../lib/local-preferences";
import { loadTeamDirectory, type LogoTeam } from "../../lib/team-logos";
import "./preferences.css";

type Preferences = { favourites: Record<PreferenceLeague, string | null>; open: boolean; show: () => void; hide: () => void; change: (league: PreferenceLeague, id: string | null) => void; interact: () => void; storageWarning: boolean };
const Context = createContext<Preferences | null>(null);
export function useHubPreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("Hub preferences provider is missing.");
  return value;
}
export function HubPreferencesProvider({ children }: { children: ReactNode }) {
  const [favourites, setFavourites] = useState<Record<PreferenceLeague, string | null>>({ NFL: null, CFB: null });
  const [open, setOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [invitation, setInvitation] = useState(false);
  const seen = useRef(false);
  const previewEnabled = process.env.NEXT_PUBLIC_AAW_PARTICIPATION_PREVIEW === "true";
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try { setFavourites({ NFL: parseFavourite(localStorage.getItem(favouriteKeys.NFL)), CFB: parseFavourite(localStorage.getItem(favouriteKeys.CFB)) }); }
      catch { setStorageWarning(true); }
    });
    function sync(event: StorageEvent) {
      try { if (event.storageArea !== window.localStorage) return; } catch { setStorageWarning(true); return; }
      if (event.key === null) setFavourites({ NFL: null, CFB: null });
      for (const league of ["NFL", "CFB"] as const) if (event.key === favouriteKeys[league]) setFavourites((previous) => ({ ...previous, [league]: parseFavourite(event.newValue) }));
    }
    window.addEventListener("storage", sync);
    return () => { cancelled = true; window.removeEventListener("storage", sync); };
  }, []);
  function interact() {
    if (!previewEnabled || seen.current) return;
    try { seen.current = sessionStorage.getItem(invitationKey) === "1"; } catch { /* In-memory once-per-visit fallback. */ }
    if (!shouldInvite(previewEnabled, seen.current, true)) return;
    seen.current = true;
    try { sessionStorage.setItem(invitationKey, "1"); } catch { /* No identifier or remote record. */ }
    setInvitation(true);
  }
  function change(league: PreferenceLeague, id: string | null) {
    if ((id !== null && !validTeamId(id)) || favourites[league] === id) return;
    setFavourites((previous) => ({ ...previous, [league]: id }));
    try { if (!writeFavourite(localStorage, league, id)) setStorageWarning(true); } catch { setStorageWarning(true); }
    interact();
  }
  return <Context.Provider value={{ favourites, open, show: () => setOpen(true), hide: () => setOpen(false), change, interact, storageWarning }}>
    {children}
    {open && <PreferencesPanel />}
    {invitation && <aside className="hub-preferences-invitation" aria-label="Audience participation preview">
      <strong>Participation preview · Coming Soon</strong><p>In future, you’ll be able to choose to contribute new ratings to AAW audience statistics. Nothing is being collected now.</p>
      <button type="button" onClick={() => setInvitation(false)}>Dismiss</button>
    </aside>}
  </Context.Provider>;
}
export function PreferencesButton() {
  const { show, open } = useHubPreferences();
  return <button type="button" className="hub-preferences-button" aria-haspopup="dialog" aria-expanded={open} onClick={show}>Preferences</button>;
}
function PreferencesPanel() {
  const { favourites, change, hide, storageWarning } = useHubPreferences();
  const dialog = useRef<HTMLDialogElement>(null);
  const [teams, setTeams] = useState<Record<PreferenceLeague, LogoTeam[]>>({ NFL: [], CFB: [] });
  const [errors, setErrors] = useState<Partial<Record<PreferenceLeague, string>>>({});
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    let cancelled = false;
    for (const league of ["NFL", "CFB"] as const) loadTeamDirectory(league).then((data) => {
      if (cancelled) return;
      const unique = new Map(data.sections.flatMap((section) => section.teams).filter((team) => validTeamId(team.id)).map((team) => [team.id, team]));
      setTeams((current) => ({ ...current, [league]: [...unique.values()].sort((a,b) => a.team.localeCompare(b.team)) }));
    }).catch(() => { if (!cancelled) setErrors((current) => ({ ...current, [league]: "Team list unavailable. Close and reopen to retry." })); });
    return () => { cancelled = true; element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="hub-preferences-dialog" aria-labelledby="hub-preferences-title" onCancel={(event) => { event.preventDefault(); hide(); }}>
    <header><h1 id="hub-preferences-title">Preferences</h1><button type="button" onClick={hide} autoFocus aria-label="Close Preferences">Close</button></header>
    <p>Make Hub yours. Favourites are saved only in this browser.</p>
    {(["NFL", "CFB"] as const).map((league) => <section key={league}>
      <label htmlFor={`favourite-${league}`}>Favourite {league} team</label>
      <select id={`favourite-${league}`} value={favourites[league] ?? ""} disabled={!teams[league].length} onChange={(event) => change(league, event.target.value || null)}>
        <option value="">No favourite team</option>
        {favourites[league] && !teams[league].some((team) => team.id === favourites[league]) && <option value={favourites[league]!}>Saved team unavailable in this list</option>}
        {teams[league].map((team) => <option key={team.id} value={team.id}>{team.team}</option>)}
      </select>
      {favourites[league] && <button type="button" onClick={() => change(league, null)}>Remove {league} favourite</button>}
      {!teams[league].length && <small role="status">{errors[league] ?? "Loading teams…"}</small>}
    </section>)}
    {storageWarning && <p role="status">Browser storage is unavailable. Changes work for this visit but may not survive a refresh.</p>}
    <section><h2>Audience participation</h2><strong>Coming Soon · Unavailable</strong><p>No ratings or favourite choices are submitted. Voluntary participation will have its own separate control.</p></section>
    <section><h2>Analytics permission</h2><strong>Coming Soon · Unavailable</strong><p>GA4 is not enabled. No analytics permission is requested or recorded here.</p></section>
    <section id="hub-local-privacy"><h2>Privacy</h2><p>Your two favourite-team IDs stay in browser storage. They are not sent to AAW. Team lists come from Hub’s existing public metadata; your choices are not included in those requests.</p><p>Removing a favourite leaves personal game tiers untouched. Clearing browser storage removes local preferences. Different browsers and devices have independent favourites.</p></section>
  </dialog>;
}
