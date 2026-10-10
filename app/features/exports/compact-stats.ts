// Export-only presentation: the source table and its 25 rows remain untouched.
export async function compactStats(source: HTMLElement, clone: HTMLElement) {
  if (source.dataset.deskExport !== "stats") return;
  const rows = Array.from(source.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  if (!rows.length || rows[0].cells.length !== 4) return;
  const league = source.ownerDocument.location.pathname === "/nfl" ? "NFL" : "CFB";
  const response = await fetch(`/api/standings?league=${league}`);
  if (!response.ok) throw new Error("Team logos could not load. Please try again.");
  const data = await response.json() as { sections: { teams: { team: string; logo?: string }[] }[] };
  const logos = new Map(data.sections.flatMap((section) => section.teams.map((team) => [team.team, team.logo] as const)));
  if (rows.slice(0, 10).some((row) => !logos.get(row.cells[2].textContent?.trim() ?? ""))) {
    const week = source.dataset.exportLabel?.match(/Week (\d+)/)?.[1];
    const gamesResponse = await fetch(`${league === "NFL" ? "/api/nfl/scoreboard" : "/api/scoreboard"}${week ? `?week=${week}` : ""}`);
    if (gamesResponse.ok) {
      const games = await gamesResponse.json() as { games: { homeTeam: string; awayTeam: string; homeLogo?: string; awayLogo?: string }[] };
      for (const game of games.games) {
        if (game.homeLogo) logos.set(game.homeTeam.replace(/^#\d+\s+/, ""), game.homeLogo);
        if (game.awayLogo) logos.set(game.awayTeam.replace(/^#\d+\s+/, ""), game.awayLogo);
      }
    }
  }
  const title = source.querySelector("h2")?.textContent ?? "Leaders";
  const subtitle = source.querySelector("p")?.textContent ?? "";
  clone.replaceChildren();
  clone.style.cssText = `width:640px;background:#0B1F33;color:#f8fafc;border:1px solid #334155;border-radius:12px;overflow:hidden;font-family:${source.ownerDocument.defaultView!.getComputedStyle(source).fontFamily};`;
  const element = (tag: string, text: string, css: string) => {
    const node = document.createElement(tag); node.textContent = text; node.style.cssText = css; return node;
  };
  const header = element("div", "", "padding:18px 20px;border-bottom:1px solid #334155;");
  header.append(element("h2", title, "margin:0;font-size:23px;font-weight:700;"),
    element("p", `${subtitle} · Top 10`, "margin:5px 0 0;color:#94a3b8;font-size:14px;font-weight:400;"));
  clone.append(header);
  for (const row of rows.slice(0, 10)) {
    const [rank, player, team, stat] = Array.from(row.cells).map((cell) => cell.textContent?.trim() ?? "");
    const item = element("div", "", "display:flex;align-items:center;gap:14px;padding:12px 20px;border-bottom:1px solid #334155;");
    item.append(element("div", rank, "width:24px;flex-shrink:0;color:#94a3b8;font-size:18px;font-weight:600;"));
    const logo = logos.get(team);
    if (logo) {
      const image = document.createElement("img"); image.src = logo; image.alt = "";
      image.style.cssText = "width:38px;height:38px;object-fit:contain;flex-shrink:0;";
      item.append(image);
    } else item.append(element("div", "", "width:38px;flex-shrink:0;"));
    const name = element("div", "", "flex:1;min-width:0;");
    name.append(element("div", player, "font-size:19px;font-weight:700;line-height:1.3;"),
      element("div", team, "font-size:13px;font-weight:400;color:#94a3b8;line-height:1.4;margin-top:2px;"));
    const value = element("div", "", "text-align:right;flex-shrink:0;margin-left:8px;");
    const match = stat.match(/^([\d,.+−-]+)\s*(.*)$/);
    value.append(element("div", match?.[1] ?? stat, "font-size:23px;font-weight:800;line-height:1.25;"));
    if (match?.[2]) value.append(element("div", match[2], "font-size:13px;font-weight:400;color:#94a3b8;line-height:1.4;"));
    item.append(name, value); clone.append(item);
  }
  (clone.lastElementChild as HTMLElement).style.borderBottom = "none";
}
