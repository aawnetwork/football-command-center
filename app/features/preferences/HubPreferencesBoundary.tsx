"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { AnalyticsConfig } from "../../lib/analytics-consent";
import { HubPreferencesProvider } from "./HubPreferences";

export function HubPreferencesBoundary({ children, analyticsConfig }: { children: ReactNode; analyticsConfig: AnalyticsConfig }) {
  const pathname = usePathname();
  // The contributor editor is self-contained: do not request the tester-gated
  // audience services or load Hub preference/analytics state for invitees.
  if (pathname === "/contribute/presets") return children;
  return <HubPreferencesProvider analyticsConfig={analyticsConfig}>{children}</HubPreferencesProvider>;
}
