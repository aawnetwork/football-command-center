"use client";
import { useSearchParams } from "next/navigation";
import { hubSection, hubSectionUrl } from "./hub-sections";
export function useHubSection() {
  const params = useSearchParams();
  const active = hubSection(params);
  function select(section: string) {
    const url = hubSectionUrl(window.location.href, section);
    if (url) window.history.pushState(null, "", url);
  }
  return [active, select] as const;
}
