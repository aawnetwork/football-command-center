import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { canUseExportStudio } from "../../lib/export-access";
import { validExportPassword } from "../../lib/export-password";

export const dynamic = "force-dynamic";
export const metadata = { title: "AAW Desk · Export Studio", robots: { index: false, follow: false } };

export default async function ExportPage() {
  const requestHeaders = await headers();
  if (!canUseExportStudio(process.env.NODE_ENV, requestHeaders.get("host")) && !validExportPassword(requestHeaders.get("authorization"), process.env.EXPORT_STUDIO_PASSWORD)) notFound();
  const { ExportStudio } = await import("../../features/exports/ExportStudio");
  return <ExportStudio />;
}
