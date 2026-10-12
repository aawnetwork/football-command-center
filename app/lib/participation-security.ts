import { createHash, randomBytes } from "node:crypto";
import { participationCookie } from "./participation-contract";
export const participationEnabled = (env: Record<string, string | undefined>) => env.AAW_AUDIENCE_PARTICIPATION_ENABLED === "true";
export const newParticipationToken = () => randomBytes(32).toString("hex");
export const hashParticipationToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function participationToken(request: Request): string | null {
  const values = (request.headers.get("cookie") ?? "").split(";").map((item) => item.trim()).filter((item) => item.startsWith(`${participationCookie}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(participationCookie.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function participationSetCookie(token: string, confirmed = false): string {
  return `${participationCookie}=${token}; Secure; HttpOnly; SameSite=Lax; Path=/${confirmed ? "; Max-Age=31536000" : ""}`;
}
export const clearParticipationCookie = `${participationCookie}=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
export function participationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  try { return Boolean(origin && new URL(origin).origin === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site"); }
  catch { return false; }
}
