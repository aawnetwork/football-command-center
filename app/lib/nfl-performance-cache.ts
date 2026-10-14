/** Cache the processed response, not the oversized upstream CSV files.
 * A warm instance shares one calculation, including simultaneous requests;
 * Vercel's CDN shares the successful JSON across instances. Errors never persist.
 */
export function nflPerformanceCache(load: () => Promise<Response>, now = Date.now) {
  const lifetime = 300_000;
  type Entry = { body: string; headers: Headers; status: number; expires: number };
  let cached: Entry | undefined;
  let pending: Promise<Entry> | undefined;

  async function generate(): Promise<Entry> {
    const response = await load();
    const body = await response.text();
    const generated = now();
    const entry = { body, headers: new Headers(response.headers), status: response.status, expires: Math.min(generated + lifetime, Number(response.headers.get("X-AAW-Snapshot-Expires-At")) || Infinity) };
    entry.headers.delete("X-AAW-Snapshot-Expires-At");
    if (response.ok) {
      entry.headers.set("X-AAW-Performance-Generated-At", new Date(generated).toISOString());
      cached = entry;
    }
    return entry;
  }

  return async function response(): Promise<Response> {
    let entry = cached;
    if (!entry || now() >= entry.expires) {
      if (!pending) pending = generate().finally(() => { pending = undefined; });
      entry = await pending;
    }
    const headers = new Headers(entry.headers);
    if (entry.status >= 200 && entry.status < 300) {
      // Do not renew a warm instance's remaining lifetime for a new CDN fill.
      const remaining = Math.max(0, Math.floor((entry.expires - now()) / 1000));
      headers.set("Cache-Control", "public, max-age=0, must-revalidate");
      headers.set("Vercel-CDN-Cache-Control", `public, s-maxage=${remaining}`);
    } else {
      headers.set("Cache-Control", "no-store");
      headers.set("Vercel-CDN-Cache-Control", "no-store");
    }
    return new Response(entry.body, { status: entry.status, headers });
  };
}
