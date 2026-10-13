"use client";
import { createContext, useContext, useEffect, useRef, useState, Suspense, type ReactNode } from "react";
import { favouriteKeys, invitationKey, parseFavourite, writeFavourite, validTeamId, shouldInvite, type PreferenceLeague } from "../../lib/local-preferences";
import { loadTeamDirectory, type LogoTeam } from "../../lib/team-logos";
import "./preferences.css";
import { useParticipation } from "./useParticipation";
import { consentText } from "../../lib/participation-contract";
import {analyticsWording,type AnalyticsConfig} from '../../lib/analytics-consent';
import {useAnalytics,AnalyticsNavigation} from './useAnalytics';

type Preferences = { favourites: Record<PreferenceLeague, string | null>; open: boolean; show: () => void; hide: () => void; change: (league: PreferenceLeague, id: string | null) => void; interact: () => void; storageWarning: boolean; audience: ReturnType<typeof useParticipation>; analytics:ReturnType<typeof useAnalytics> };
const Context = createContext<Preferences | null>(null);
export function useHubPreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("Hub preferences provider is missing.");
  return value;
}
export function HubPreferencesProvider({ children,analyticsConfig }: { children: ReactNode;analyticsConfig:AnalyticsConfig }) {
  const audience = useParticipation();
  const analytics=useAnalytics(analyticsConfig);
  const [favourites, setFavourites] = useState<Record<PreferenceLeague, string | null>>({ NFL: null, CFB: null });
  const [open, setOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [invitation, setInvitation] = useState(false);
  const seen = useRef(false);
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
    if(analytics.invite && analytics.choice==='unknown')return; // Never show competing invitations.
    if (!audience.available || audience.active || audience.pending || seen.current) return;
    try { seen.current = sessionStorage.getItem(invitationKey) === "1"; } catch { /* In-memory once-per-visit fallback. */ }
    if (!shouldInvite(audience.available, seen.current, true)) return;
    seen.current = true;
    try { sessionStorage.setItem(invitationKey, "1"); } catch { /* No identifier or remote record. */ }
    setInvitation(true);
  }
  function change(league: PreferenceLeague, id: string | null) {
    if ((id !== null && !validTeamId(id)) || favourites[league] === id) return;
    setFavourites((previous) => ({ ...previous, [league]: id }));
    try { if (!writeFavourite(localStorage, league, id)) setStorageWarning(true); } catch { setStorageWarning(true); }
    void audience.contribute({kind:"favourite",league,teamId:id});
    analytics.action('favourite_interaction');
    interact();
  }
  return <Context.Provider value={{ favourites, open, show: () => {analytics.action('preferences_open');setOpen(true);}, hide: () => setOpen(false), change, interact, storageWarning, audience,analytics }}>
    <Suspense fallback={null}><AnalyticsNavigation analytics={analytics}/></Suspense>
    {analytics.hydrated && analytics.eligible && analytics.available && analytics.invite && analytics.choice==='unknown' && !open && !audience.contributionWarning && <aside className="hub-analytics-invitation" aria-label="Optional website analytics">
      <p><strong>Optional website analytics</strong> · {analyticsWording}{!analytics.enabled && ' Measurement is currently disabled pending approval.'}</p>
      <div><button type="button" onClick={()=>analytics.choose('granted')}>Allow analytics</button><button type="button" onClick={()=>analytics.choose('denied')}>Decline</button><button type="button" onClick={()=>setOpen(true)}>Details in Preferences</button><button type="button" onClick={()=>analytics.choose('dismissed')} aria-label="Dismiss analytics invitation">Dismiss</button></div>
    </aside>}
    {children}
    {audience.contributionWarning && <aside className="hub-preferences-invitation" aria-label="Audience selection not saved" role="status"><p>{audience.contributionWarning}</p><button type="button" onClick={audience.dismissContributionWarning}>Dismiss</button></aside>}
    {open && <PreferencesPanel />}
    {invitation && audience.available && !audience.active && !audience.pending && !(analytics.invite && analytics.choice==='unknown') && <aside className="hub-preferences-invitation" aria-label="Voluntary audience participation">
      <strong>Optional audience participation</strong><p>Only new personal tier and favourite changes after opt-in can contribute. Existing selections are never uploaded.</p>
      <button type="button" onClick={() => { setInvitation(false); setOpen(true); }}>Learn more</button>
      <button type="button" onClick={() => setInvitation(false)}>Dismiss</button>
    </aside>}
  </Context.Provider>;
}
export function PreferencesButton() {
  const { show, open } = useHubPreferences();
  return <button type="button" className="hub-preferences-button" aria-haspopup="dialog" aria-expanded={open} onClick={show}>Preferences</button>;
}
function PreferencesPanel() {
  const { favourites, change, hide, storageWarning, audience,analytics } = useHubPreferences();
  const [agree,setAgree] = useState(false);
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
    <p>Make Hub yours. Favourites work locally whether or not you participate.</p>
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
    <section><h2>Audience participation</h2>
      <p>{consentText}</p>
      <p>A pseudonymous browser credential hash and consent version/time are stored—not your name or email. While collection is enabled, new or changed personal tiers and favourite-team IDs after consent may be stored centrally. Opting in sends no existing selections. Presets never contribute. Withdrawal deletes individual records and leaves local choices intact. This is browser-scoped participation, not a verified identity. The credential lasts up to one year; retention enforcement for confirmed season end plus 90 days must be approved before public collection launches. Clearing cookies loses access to this browser’s records and may prevent a deletion request.</p>
      {audience.pending ? <><strong>Withdrawal/deletion pending</strong><button type="button" disabled={audience.busy} onClick={audience.withdraw}>Retry deletion</button></> : audience.active ? <><strong>Participation consent active{!audience.available?' · Collection disabled':''}</strong><button type="button" disabled={audience.busy} onClick={audience.withdraw}>Withdraw and delete participation records</button></> : audience.available ? <>
        <label><input type="checkbox" checked={agree} onChange={(event)=>setAgree(event.target.checked)} /> I agree to this voluntary participation wording.</label>
        <button type="button" disabled={!agree||audience.busy} onClick={audience.optIn}>{audience.busy?'Confirming…':'Opt in voluntarily'}</button>
      </> : <strong>Unavailable pending privacy and launch approval</strong>}
      {audience.error && <p role="status">{audience.error}</p>}
    </section>
    <section><h2>Website analytics</h2><p>{analyticsWording}</p>
      <p>Choice: {analytics.choice==='granted'?'Allowed':analytics.choice==='denied'?'Declined':analytics.choice==='dismissed'?'Dismissed — not allowed':'Not chosen — not allowed'}. {!analytics.enabled && 'GA4 is not enabled; measurement is disabled pending configuration and privacy approval.'}</p>
      {!analytics.available && <p role="status">Consent storage is unavailable. Analytics stays disabled.</p>}
      <button type="button" onClick={()=>analytics.choose('granted')}>Allow analytics</button>{' '}
      <button type="button" onClick={()=>analytics.choose('denied')}>{analytics.choice==='granted'?'Withdraw analytics consent':'Decline analytics'}</button>
      <p>You can change this choice here at any time. Withdrawal stops future measurement and clears Hub’s accessible analytics cookies. It does not automatically erase information already sent to Google. Your tiers, favourites and audience participation are unaffected.</p>
    </section>
    <section id="hub-local-privacy"><h2>Privacy</h2><p>Without active participation and enabled collection, tiers and favourites stay local. Only deliberate new changes after opt-in can be submitted; loading or synchronising saved choices never submits them. Team lists come from Hub’s existing public metadata.</p><p>Removing a favourite leaves personal game tiers untouched. Clearing browser storage removes local preferences but is not server withdrawal. Different browsers and devices have independent favourites.</p></section>
  </dialog>;
}
