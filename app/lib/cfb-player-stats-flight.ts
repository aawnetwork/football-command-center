type ResponseSnapshot = {
  body: string;
  status: number;
  statusText: string;
  headers: Headers;
};

/** Share only active public CFB builds within this module instance, never results
 * from a completed build. No caller owns the shared response's body stream. */
export function createCfbPlayerStatsFlights(maxEntries = 32) {
  const pending = new Map<string, Promise<ResponseSnapshot>>();

  return async function share(request: Request, load: () => Promise<Response>): Promise<Response> {
    const parameters = new URL(request.url).searchParams;
    // The route consumes only the first week value, and treats empty as absent.
    const week = parameters.get("week");
    parameters.delete("week");
    if (week) parameters.set("week", week);
    // Retain every other parameter (including repeated values in their original
    // order). Different seasons/modes must stay isolated even if ignored today.
    parameters.sort();
    const key = parameters.toString();
    if (key.length > 2048) return load();

    let operation = pending.get(key);
    if (!operation) {
      // At capacity, do independent work rather than evict an active operation
      // or change the route's response. Existing keys can still join their work.
      if (pending.size >= maxEntries) return load();
      operation = (async () => {
        const response = await load();
        return {
          body: await response.text(),
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers),
        };
      })().finally(() => pending.delete(key));
      pending.set(key, operation);
    }

    const snapshot = await operation;
    return new Response(snapshot.body, {
      status: snapshot.status,
      statusText: snapshot.statusText,
      headers: snapshot.headers,
    });
  };
}
