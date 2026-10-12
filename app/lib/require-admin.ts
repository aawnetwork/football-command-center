import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { canUseExportStudio } from "./export-access";
import { validExportPassword } from "./export-password";
export async function requireAdmin() {
  const h = await headers();
  if (!canUseExportStudio(process.env.NODE_ENV, h.get("host")) &&
    !validExportPassword(h.get("authorization"), process.env.EXPORT_STUDIO_PASSWORD)) notFound();
}
