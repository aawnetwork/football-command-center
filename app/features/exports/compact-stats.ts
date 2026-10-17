// Export-only presentation: the source table and its 25 rows remain untouched.
import { loadTeamDirectory, resolveTeamLogo } from "../../lib/team-logos";
export async function compactStats(source: HTMLElement, clone: HTMLElement) {
  if (source.dataset.deskExport !== "stats") return;
  const rows = Array.from(source.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  if (!rows.length || ![3, 4].includes(rows[0].cells.length)) return;
  const individual = rows[0].cells.length === 4;
  const teamCell = individual ? 2 : 1;
  const league = source.ownerDocument.location.pathname === "/nfl" ? "NFL" : "CFB";
  // Keep compact top-ten exports in the same cream/navy Hub visual system.
  const data = await loadTeamDirectory(league).catch(() => ({ sections: [] }));
  const teams = data.sections.flatMap((section) => section.teams);
  const cellText = (cell: Element) => {
    const copy = cell.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("[data-export-omit], [data-export-playing], .all-time-record-row__active").forEach((node) => node.remove());
    return copy.textContent?.trim() ?? "";
  };
  const logos = new Map(rows.map((row) => {
    const team = cellText(row.cells[teamCell]);
    const image = row.cells[teamCell].querySelector<HTMLImageElement>("img[data-team-logo]");
    return [team, resolveTeamLogo(team, teams, "light") || (image && !image.hidden ? image.src : undefined)] as const;
  }));
  if (rows.slice(0, 10).some((row) => !logos.get(cellText(row.cells[teamCell])))) {
    const week = source.dataset.exportLabel?.match(/Week (\d+)/)?.[1];
    const gamesResponse = await fetch(`${league === "NFL" ? "/api/nfl/scoreboard" : "/api/scoreboard"}${week ? `?week=${week}` : ""}`);
    if (gamesResponse.ok) {
      const games = await gamesResponse.json() as { games: { homeTeam: string; awayTeam: string; homeLogo?: string; awayLogo?: string }[] };
      for (const game of games.games) {
        if (game.homeLogo && !logos.get(game.homeTeam.replace(/^#\d+\s+/, ""))) logos.set(game.homeTeam.replace(/^#\d+\s+/, ""), game.homeLogo);
        if (game.awayLogo && !logos.get(game.awayTeam.replace(/^#\d+\s+/, ""))) logos.set(game.awayTeam.replace(/^#\d+\s+/, ""), game.awayLogo);
      }
    }
  }
  const title = source.querySelector("h2")?.textContent ?? "Leaders";
  const subtitle = source.querySelector("p")?.textContent ?? "";
  clone.replaceChildren();
  clone.style.cssText = `width:640px;background:#fffdf7;color:#0b1f33;border:1px solid #d8d6cd;border-radius:12px;overflow:hidden;font-family:${source.ownerDocument.defaultView!.getComputedStyle(source).fontFamily};`;
  const element = (tag: string, text: string, css: string) => {
    const node = document.createElement(tag); node.textContent = text; node.style.cssText = css; return node;
  };
  const brand = element("div", "", "padding:18px 20px;background:#0b1f33;color:#fffdf7;border-bottom:4px solid #ffc720;");
  const wordmark = element("div", "The HUB", "font-size:32px;font-weight:800;line-height:1.1;");
  wordmark.append(element("span", ".", "color:#ff6b00;"));
  brand.append(wordmark); clone.append(brand);
  const header = element("div", "", "padding:18px 20px;border-bottom:1px solid #d8d6cd;");
  header.append(element("h2", title, "margin:0;font-size:23px;font-weight:700;"),
    element("p", `${subtitle} · Top 10`, "margin:5px 0 0;color:#52606a;font-size:14px;font-weight:400;"));
  clone.append(header);
  for (const row of rows.slice(0, 10)) {
    const playing = Boolean(row.querySelector("[data-export-playing]")) || row.classList.contains("weekly-leader--playing");
    const values = Array.from(row.cells).map(cellText);
    const [rank, player] = values;
    const team = individual ? values[2] : player;
    const stat = values[individual ? 3 : 2];
    const item = element("div", "", "display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid #d8d6cd;");
    item.append(element("div", rank, "width:24px;flex-shrink:0;color:#52606a;font-size:18px;font-weight:600;"));
    const logo = logos.get(team);
    if (logo) {
      const image = document.createElement("img"); image.src = logo; image.alt = "";
      image.style.cssText = "width:38px;height:38px;object-fit:contain;flex-shrink:0;";
      item.append(image);
    } else item.append(element("div", "", "width:38px;flex-shrink:0;"));
    const name = element("div", "", "flex:1;min-width:0;");
    name.append(element("div", player, "font-size:19px;font-weight:700;line-height:1.3;"),
      element("div", team, "font-size:13px;font-weight:400;color:#52606a;line-height:1.4;margin-top:2px;"));
    if (playing) name.append(element("div", "PLAYING NOW", "display:inline-block;margin-top:5px;padding:3px 6px;border-radius:4px;background:#fff0e2;color:#9b3a00;font-size:10px;font-weight:800;letter-spacing:.04em;"));
    if (!individual) name.children[1]?.remove();
    const value = element("div", "", "text-align:right;flex-shrink:0;margin-left:8px;");
    const match = stat.match(/^([\d,.+−-]+)\s*(.*)$/);
    value.append(element("div", match?.[1] ?? stat, "font-size:23px;font-weight:800;line-height:1.25;"));
    if (match?.[2]) value.append(element("div", match[2], "font-size:13px;font-weight:400;color:#52606a;line-height:1.4;"));
    item.append(name, value); clone.append(item);
  }
  (clone.lastElementChild as HTMLElement).style.borderBottom = "none";
  clone.append(element("div", "hub.aawnetwork.co.uk", "padding:14px 20px;background:#f3f0e7;border-top:1px solid #d8d6cd;text-align:right;color:#0b1f33;font-size:14px;font-weight:700;"));
}
