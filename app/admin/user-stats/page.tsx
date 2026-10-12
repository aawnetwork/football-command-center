import { requireAdmin } from "../../lib/require-admin";
import { AdminCentre } from "../../components/AdminCentre";
export const dynamic = "force-dynamic";
export const metadata = { title: "AAW Hub · User Stats", robots: { index: false, follow: false } };
export default async function UserStatsPage() {
  await requireAdmin();
  return <AdminCentre current="/admin/user-stats"><main className="hub-admin__intro"><h1>User Stats</h1><h2>Coming Later</h2><p>This section is reserved for future audience insights. No audience collection or reporting has been added.</p></main></AdminCentre>;
}
