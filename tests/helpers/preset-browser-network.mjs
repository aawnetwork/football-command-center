// Used only by the standalone browser test. All game data is a deterministic
// fixture; no external requests or production database connections are allowed.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === 'https://site.api.espn.com' && url.pathname.endsWith('/college-football/scoreboard')) {
    const year = Number(url.searchParams.get('year') || 2026), week = Number(url.searchParams.get('week') || 1);
    const status = { state: 'post', name: 'STATUS_FINAL', completed: true };
    return Response.json({ season: { year, type: 2 }, week: { number: week }, events: [{
      id: '123', date: `${year}-10-10T17:00:00Z`, season: { year, type: 2 }, week: { number: week }, status: { type: status },
      competitions: [{ status: { type: status }, competitors: [
        { homeAway: 'away', team: { id: '1', displayName: 'Away Team' }, score: '21' },
        { homeAway: 'home', team: { id: '2', displayName: 'Home Team' }, score: '28' },
      ] }],
    }] });
  }
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return originalFetch(input, init);
  throw new Error(`External fetch blocked by preset browser test: ${url.origin}`);
};
