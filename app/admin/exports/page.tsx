import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { canUseExportStudio } from "../../lib/export-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "AAW Desk · Local Export Studio", robots: { index: false, follow: false } };

export default async function ExportPage() {
  if (!canUseExportStudio(process.env.NODE_ENV, (await headers()).get("host"))) notFound();
  const { ExportStudio } = await import("../../features/exports/ExportStudio");
  return <ExportStudio />;
}
