# Maintaining CFB decks

Edit `app/cfb/data/curated-decks.ts`. Add contributor-approved picks only; the shipped list is intentionally empty until picks are provided.

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

Commit/push the data-file change using the normal deployment process. There is no editor, database or automatic deck generator.

Loaded decks and edits are session-only overlays. Personal tiers remain in `cfb-game-tiers`; Return to my selections (or a reload) restores them. Switching weeks does not apply a deck to a different slate.

Share My Deck uses explicit assigned tiers, not automatic suggestions. Exports include all assigned games in the selected week, independent of current on-screen conference/tier filters. S is checked by default; empty tiers are omitted. PNG creation is client-side and does not upload selections.
