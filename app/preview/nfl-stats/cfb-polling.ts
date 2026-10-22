export type CfbGameStatus = { id: string; startDate: string; live: boolean; completed: boolean };
export type CfbGate = { state: 'idle' | 'approaching' | 'live' | 'cooldown' | 'recovering'; delay: number; heavy: boolean };

/** Per-mounted-view state; failed observations never become an empty/finished slate. */
export function createCfbGate() {
  let previous = new Map<string, CfbGameStatus>();
  let cooldownUntil = 0;
  let last: CfbGate = { state: 'idle', delay: 30_000, heavy: false };
  return (games: CfbGameStatus[] | null, now: number, currentWeek = true): CfbGate => {
    if (games === null) return { ...last, state: 'recovering', delay: 30_000 };
    if ([...previous.values()].some(game => game.live && !games.some(next => next.id === game.id))) return { ...last, state: 'recovering', delay: 30_000 };
    // A game disappearing from a response is not proof of completion.
    if (games.some(game => game.completed && ((previous.has(game.id) && !previous.get(game.id)!.completed) || (!previous.has(game.id) && currentWeek)))) cooldownUntil = now + 15 * 60_000;
    previous = new Map(games.map(game => [game.id, game]));
    const live = games.some(game => game.live);
    const approaching = games.some(game => !game.completed && !game.live && Date.parse(game.startDate) - now <= 15 * 60_000);
    const next = Math.min(...games.filter(game => !game.completed).map(game => Date.parse(game.startDate) - now - 15 * 60_000).filter(ms => ms > 0));
    const cooldown = now < cooldownUntil;
    last = { state: live ? 'live' : cooldown ? 'cooldown' : approaching ? 'approaching' : 'idle', heavy: live || cooldown, delay: live || cooldown || approaching ? 30_000 : Math.max(30_000, Math.min(300_000, next)) };
    return last;
  };
}

/** Initial statistics are unconditional. Only repeat work is gated; no UI selection state is owned here. */
export function startCfbPolling(options: {
  refresh: () => Promise<boolean | void>; status: () => Promise<CfbGameStatus[]>;
  report: (gate: CfbGate, checked: number | null) => void;
  historical: boolean; currentWeek: boolean;
  now?: () => number; schedule?: (run: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const now = options.now ?? Date.now, schedule = options.schedule ?? setTimeout, cancel = options.cancel ?? clearTimeout;
  const gate = createCfbGate(); let retryHeavy = false; let active = true, timer: ReturnType<typeof setTimeout> | undefined;
  async function check(initial = false) {
    let decision: CfbGate;
    try { const games = await options.status(); decision = gate(games, now(), options.currentWeek); if (active) options.report(decision, now()); }
    catch { decision = gate(null, now()); if (active) options.report(decision, null); }
    if (!active) return;
    if ((decision.heavy || retryHeavy) && !initial) retryHeavy = await options.refresh() === false;
    if (active) timer = schedule(() => { void check(); }, retryHeavy ? 30_000 : decision.delay);
  }
  void (async () => { retryHeavy = await options.refresh() === false; if (active && !options.historical) await check(true); })();
  return () => { active = false; if (timer !== undefined) cancel(timer); };
}
