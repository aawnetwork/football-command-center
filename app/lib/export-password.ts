import { createHash, timingSafeEqual } from "node:crypto";

export function validExportPassword(header: string | null, password: string | undefined) {
  if (!password || password.length < 16 || !header?.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0 || decoded.slice(0, separator) !== "aaw") return false;
    const hash = (value: string) => createHash("sha256").update(value).digest();
    return timingSafeEqual(hash(decoded.slice(separator + 1)), hash(password));
  } catch { return false; }
}
