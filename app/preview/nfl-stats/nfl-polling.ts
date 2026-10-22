import { createCfbGate, type CfbGameStatus, type CfbGate } from './cfb-polling';
export type NflPollStatus = {historical: boolean; games: CfbGameStatus[]};

/** Each invocation owns its own gate and timer. The CFB implementation is unchanged. */
export function startNflPolling(options: {
  refresh: () => Promise<boolean | void>; status: () => Promise<NflPollStatus>;
  report: (gate: CfbGate, checked: number | null, historical: boolean) => void;
  now?: () => number; schedule?: (run: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const now = options.now ?? Date.now, schedule = options.schedule ?? setTimeout, cancel = options.cancel ?? clearTimeout;
  const gate = createCfbGate(); let active = true, retryHeavy = false, timer: ReturnType<typeof setTimeout> | undefined;
  async function check(initial = false) {
    const started = now(); let decision: CfbGate;
    try {
      const status = await options.status();
      if (!active) return;
      if (status.historical) {
        options.report({state:'idle',heavy:false,delay:300_000},now(),true);
        if (retryHeavy && !initial) retryHeavy = await options.refresh() === false;
        if (active && retryHeavy) timer=schedule(()=>{void check();},30_000);
        return;
      }
      // NFL starts cooldown only after an observed transition, never from old finals on entry.
      decision = gate(status.games,now(),false); options.report(decision,now(),false);
    } catch { decision=gate(null,now(),false); if (active) options.report(decision,null,false); }
    if (!active) return;
    if (!initial && (decision.heavy || retryHeavy)) retryHeavy = await options.refresh() === false;
    if (active) timer=schedule(()=>{void check();},Math.max(0,(retryHeavy?30_000:decision.delay)-(now()-started)));
  }
  void (async()=>{retryHeavy=await options.refresh()===false;if(active)await check(true);})();
  return ()=>{active=false;if(timer!==undefined)cancel(timer);};
}
