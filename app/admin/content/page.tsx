import { requireAdmin } from "../../lib/require-admin";
import { AdminCentre } from "../../components/AdminCentre";
import { ContentPanel } from "../../features/content/ContentPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "AAW Hub · Private Content Intelligence", robots: { index: false, follow: false } };

export default async function ContentIntelligencePage() {
  await requireAdmin();
  return <AdminCentre current="/admin/content"><main className="command-center"><div className="command-center__container">
    <h1>Private content intelligence</h1>
    <p>Preserved research candidates. Check source freshness and current totals before editorial use.</p>
    <ContentPanel sport="CFB" />
    <ContentPanel sport="NFL" />
  </div></main></AdminCentre>;
}
