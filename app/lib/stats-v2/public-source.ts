/** Bounded, process-local snapshots for published metadata/final games only.
 * Live scoreboards and live summaries must bypass this store. */
export function createPublicSources(request: typeof fetch = (...args) => fetch(...args), now = Date.now) {
  const entries = new Map<string, { value: unknown; observedAt: number }>();
  const pending = new Map<string, Promise<{ value: unknown; observedAt: number }>>();
  let active = 0; const queue: (() => void)[] = [];
  async function get(url: string, published = false, project?: (input: unknown) => unknown, profile = 'raw') {
    const key = url + '#' + profile;
    const hit = entries.get(key);
    if (published && hit && now() - hit.observedAt >= 0 && now() - hit.observedAt < 300_000) return hit;
    let operation = pending.get(key);
    if (!operation) {
      if (pending.size >= 128) throw Error('Too many active public sources');
      operation = (async () => {
        if (active >= 6) await new Promise<void>(resolve => queue.push(resolve)); else active++;
        try {
        const response = await request(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw Error('Public source unavailable');
        const raw: unknown = await response.json(), value = project ? project(raw) : raw, result = { value, observedAt: now() };
        if (published) { while (entries.size >= 256) entries.delete(entries.keys().next().value!); entries.set(key, result); }
        return result;
        } finally { const next = queue.shift(); if (next) next(); else active--; }
      })().finally(() => pending.delete(key)); pending.set(key, operation);
    }
    return operation;
  }
  return get;
}
export const publicSource = createPublicSources();
export async function batches<T, R>(items: readonly T[], action: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = [];
  for (let i=0;i<items.length;i+=6) result.push(...await Promise.all(items.slice(i,i+6).map(action)));
  return result;
}
