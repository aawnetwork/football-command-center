/** A server-side gate, not a browser hostname check or hidden navigation link. */
export function canUseExportStudio(environment: string | undefined, host: string | null) {
  if (environment !== "development" || !host) return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}
