import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { canUseExportStudio } from "../../lib/export-access";
import { validExportPassword } from "../../lib/export-password";
import { DeckManager } from "../../features/games/DeckManager";
export const dynamic = "force-dynamic";
export const metadata = { title: "AAW Desk · Private Deck Manager", robots: { index: false, follow: false } };
export default async function DeckPage() {
  const h = await headers();
  if (!canUseExportStudio(process.env.NODE_ENV, h.get("host")) && !validExportPassword(h.get("authorization"), process.env.EXPORT_STUDIO_PASSWORD)) notFound();
  return <DeckManager />;
}
