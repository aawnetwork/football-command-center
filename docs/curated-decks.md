# Maintaining CFB decks

Open `/admin/decks` and sign in with the same credentials as Export Studio. Create Deck, enter a name, select season/week, assign S–D tiers, Save Draft, then Publish. Published decks appear in public CFB Games → Load a Deck after refresh. Unpublish removes the public option but retains the saved draft. Editing and saving a published deck does not update its public snapshot until Publish is selected again.

Saved drafts and published snapshots live in the server-only Supabase `desk_curated_decks` table. Client roles have no table grants and RLS denies client access. Private APIs independently enforce existing Export Studio authorization; writes require same-origin JSON requests and revision checks. A conflicting edit returns an error: reload before trying again. SQL is recorded in `supabase/desk-curated-decks.sql`.

The editor uses the existing scoreboard to verify game IDs against the selected season/week. Week 0 currently uses the existing 2026-specific slate split; other seasons support weeks 1–16. No extra polling is added.

File-based presets in `app/cfb/data/curated-decks.ts` remain a fallback if database loading fails. Add contributor-approved picks only; the shipped list is intentionally empty until picks are provided.

Example structure (IDs below are illustrative, not publishable picks):

```ts
export const curatedDecks: CuratedDeck[] = [{
  id: "fletch-2026-week-6",
  league: "CFB",
  season: 2026,
  week: 6,
  name: "Fletch's Deck",
  assignments: { "ESPN_EVENT_ID": "S", "ANOTHER_EVENT_ID": "A" },
}];
```

Use unique deck IDs and the numeric event IDs returned by `/api/scoreboard?week=6`. Week 0 is supported. Invalid tiers and IDs outside the selected slate are ignored. A deck with no valid selections cannot be loaded. Only the selected season/week's decks appear.

File-based changes require the normal commit/push deployment process; private manager publication does not. There is no automatic deck generator.

Loaded decks and edits are session-only overlays. Personal tiers remain in `cfb-game-tiers`; Return to my selections (or a reload) restores them. Switching weeks does not apply a deck to a different slate.

Share My Deck uses explicit assigned tiers, not automatic suggestions. Exports include all assigned games in the selected week, independent of current on-screen conference/tier filters. S is checked by default; empty tiers are omitted. PNG creation is client-side and does not upload selections.
