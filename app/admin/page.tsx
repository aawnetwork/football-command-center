import { requireAdmin } from "../lib/require-admin";
import { AdminCentre } from "../components/AdminCentre";
export const dynamic = "force-dynamic";
export const metadata = { title: "AAW Hub · Admin Centre", robots: { index: false, follow: false } };
export default async function AdminPage() {
  await requireAdmin();
  return <AdminCentre current="/admin"><main className="hub-admin__intro">
    <h1>Admin Centre</h1><p>Manage prepared decks and create graphics from Hub’s existing data.</p>
    <div className="hub-admin__cards">
      <a href="/admin/decks"><h2>Presets</h2><p>Create, edit, save drafts, publish and unpublish curated CFB decks.</p></a>
      <a href="/admin/exports"><h2>Exports</h2><p>Preview and download branded PNGs from NFL and CFB cards and tables.</p></a>
      <a href="/admin/user-stats"><h2>User Stats</h2><p>Private participation, favourite-team and game-opinion reporting.</p></a>
      <a href="/admin/content"><h2>Content Intelligence</h2><p>Preserved private game and milestone research candidates.</p></a>
    </div>
  </main></AdminCentre>;
}
