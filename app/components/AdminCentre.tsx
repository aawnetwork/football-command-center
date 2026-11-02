import type { ReactNode } from "react";
import "./admin-centre.css";
const sections = [["/admin", "Admin Centre"], ["/admin/decks", "Presets"], ["/admin/exports", "Exports"], ["/admin/user-stats", "User Stats"]] as const;
export function AdminCentre({ current, children }: { current: string; children: ReactNode }) {
  const visibleSections = process.env.BASEMENT_MILESTONES_MOVED === "true" ? sections : [...sections, ["/admin/content", "Content Intelligence"] as const];
  return <div className="hub-admin">
    <header className="hub-admin__header"><span>AAW · PRIVATE ADMIN</span>
      <nav aria-label="Admin sections">{visibleSections.map(([href, name]) => <a key={href} href={href} aria-current={current === href ? "page" : undefined}>{name}</a>)}</nav>
      <a href="/">Return to Hub</a>
    </header>
    {children}
  </div>;
}
