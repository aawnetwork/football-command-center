"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { PreferencesButton } from "../preferences/HubPreferences";
import type { Tab } from "../../lib/nfl-helpers";
import "../../nfl/nfl-centre.css";

/** The existing NFL Centre chrome, shared with the isolated Stats preview. */
export function NflCentreLayout({ activeTab, onTabChange, children }: {
  activeTab: Tab; onTabChange: (tab: Tab) => void; children: ReactNode;
}) {
  return (
    <main
      className="command-center command-center--nfl"
      style={{
        minHeight: "100vh",
        background: "var(--cc-canvas)",
        color: "var(--cc-text)",
        padding: "40px 24px",
      }}
    >
      <div
        className="command-center__container"
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <header className="nfl-hub-header">
          <div className="nfl-hub-header__bar">
            <Link href="/" className="nfl-hub-header__identity" aria-label="AAW Hub home">
              <span className="nfl-hub-header__logo" aria-hidden="true" />
              <span className="nfl-hub-header__label">HUB</span>
            </Link>
            <nav className="nfl-hub-header__links" aria-label="Hub navigation">
              <Link href="/">Overview</Link>
              <Link href="/cfb">CFB Centre</Link>
              <Link href="/nfl" aria-current="page">NFL Centre</Link>
            </nav>
            <PreferencesButton />
          </div>
          <div className="nfl-hub-header__intro">
            <div>
              <p>AAW HUB / NFL</p>
              <h1>NFL Centre<span>.</span></h1>
              <span>Games, numbers and context for your NFL week.</span>
            </div>
            <span className="nfl-hub-header__source">Live data powered by ESPN &amp; nflverse</span>
          </div>
        </header>

        <nav
          className="command-center__nav"
          aria-label="NFL sections"
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "32px",
            borderBottom:
              "1px solid var(--cc-border)",
            paddingBottom: "12px",
          }}
        >
          {(
            [
              ["games", "Games"],
["performances", "Performances"],
["stats", "Stats"],
["standings", "Standings"],
["all-time", "All-Time"],

            ] as [Tab, string][]
          ).map(
            ([tab, label]) => (
              <button
                key={tab}
                aria-pressed={activeTab === tab}
                onClick={() =>
                  onTabChange(tab)
                }
                style={{
                  padding:
                    "10px 18px",
                  borderRadius: "8px",
                  border:
                    "1px solid",
                  borderColor:
                    activeTab === tab
                      ? "#ef4444"
                      : "var(--cc-border-strong)",
                  background:
                    activeTab === tab
                      ? "#3f0d12"
                      : "var(--cc-surface)",
                  color:
                    activeTab === tab
                      ? "#fca5a5"
                      : "var(--cc-muted)",
                  fontWeight: 900,
                  cursor:
                    "pointer",
                }}
              >
                {label}
              </button>
            )
          )}
        </nav>

        {children}
      </div>
    </main>
  );
}
