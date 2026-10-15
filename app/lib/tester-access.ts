import { validExportPassword } from "./export-password";

/** Sharing tester access must never grant access to the private Admin Centre. */
export function testerGateEnabled(env: Record<string, string | undefined>) {
  return env.AAW_INVITED_TESTING_ENABLED === "true";
}
export function testerMachineRoute(path: string, method: string) {
  // These endpoints retain their existing server-side bearer/secret checks.
  return method === "GET" && ["/api/cron/all-time/cfb", "/api/cron/all-time/nfl"].includes(path)
    || method === "POST" && path === "/api/all-time/refresh";
}
export function validTesterPassword(header: string | null, env: Record<string, string | undefined>) {
  const password = env.AAW_TESTER_PASSWORD;
  return Boolean(password && password !== env.EXPORT_STUDIO_PASSWORD && validExportPassword(header, password));
}
