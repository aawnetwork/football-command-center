import { createHash, timingSafeEqual } from "node:crypto";

/** A dedicated read-only machine credential, unrelated to tester/admin access. */
export function validBasementToken(header: string | null, token: string | undefined) {
  if (!token || token.length < 32 || !header?.startsWith("Bearer ")) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(token));
}

export function recordEnvelope(content: unknown) {
  return { schemaVersion: 1, publicationId: createHash("sha256").update(JSON.stringify(content)).digest("hex"), generatedAt: new Date().toISOString(), content };
}
