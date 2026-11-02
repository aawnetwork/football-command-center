import { GuestPresetEditor } from "../../features/games/GuestPresetEditor";
export const dynamic = "force-dynamic";
export const metadata = { title: "AAW · Contributor Presets", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function ContributorPresetsPage() { return <GuestPresetEditor />; }
