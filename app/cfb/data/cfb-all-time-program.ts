import type { CfbAllTimeRecord } from "./cfb-all-time-career";

export type CfbAllTimeProgramCategory = "wins" | "winning-percentage";

type ProgramRow = readonly [program: string, record: string, note: string, value: number];

const toProgramRecords = (rows: readonly ProgramRow[]): CfbAllTimeRecord[] =>
  rows.map(([player, team, years, value], index) => ({
    rank: index + 1,
    player,
    team,
    years,
    value,
  }));

// NCAA-recognized FBS program records through the 2024 season.
// Program history may include results from before a school's current FBS tenure.
export const cfbAllTimeCareerProgram: Record<CfbAllTimeProgramCategory, CfbAllTimeRecord[]> = {
  wins: toProgramRecords([
    ["Michigan", "1,021–362–36", "Through 2024", 1021],
    ["Ohio State", "990–337–53", "Through 2024", 990],
    ["Alabama", "985–345–43", "Through 2024", 985],
    ["Texas", "972–397–33", "Through 2024", 972],
    ["Notre Dame", "972–341–42", "Through 2024", 972],
    ["Oklahoma", "960–351–53", "Through 2024", 960],
    ["Penn State", "946–412–41", "Through 2024", 946],
    ["Nebraska", "927–430–40", "Through 2024", 927],
    ["Georgia", "895–432–54", "Through 2024", 895],
    ["USC", "886–375–54", "Through 2024", 886],
    ["Tennessee", "877–418–53", "Through 2024", 877],
    ["LSU", "818–438–47", "Through 2024", 818],
    ["Clemson", "809–478–45", "Through 2024", 809],
    ["Auburn", "807–478–47", "Through 2024", 807],
    ["Texas A&M", "789–509–48", "Through 2024", 789],
    ["West Virginia", "789–534–45", "Through 2024", 789],
    ["Washington", "783–474–50", "Through 2024", 783],
    ["Virginia Tech", "778–515–46", "Through 2024", 778],
    ["Pittsburgh", "770–567–42", "Through 2024", 770],
    ["Florida", "767–452–40", "Through 2024", 767],
    ["Georgia Tech", "766–546–43", "Through 2024", 766],
    ["Arkansas", "749–546–40", "Through 2024", 749],
    ["Wisconsin", "749–526–53", "Through 2024", 749],
    ["Minnesota", "743–549–44", "Through 2024", 743],
    ["Army", "740–548–51", "Through 2024", 740],
  ]),
  "winning-percentage": toProgramRecords([
    ["Ohio State", "990–337–53", "Through 2025", 73.7],
    ["Alabama", "985–345–43", "Through 2025", 73.3],
    ["Notre Dame", "972–341–42", "Through 2025", 73.3],
    ["Michigan", "1,021–362–36", "Through 2025", 73.2],
    ["Boise State", "511–194–2", "Through 2025", 72.4],
    ["Oklahoma", "960–351–53", "Through 2025", 72.3],
    ["Texas", "972–397–33", "Through 2025", 70.5],
    ["USC", "886–375–54", "Through 2025", 69.4],
    ["Penn State", "946–412–41", "Through 2025", 69.1],
    ["Nebraska", "927–430–40", "Through 2025", 67.8],
    ["Tennessee", "877–418–53", "Through 2025", 67.0],
    ["Georgia", "895–432–54", "Through 2025", 66.8],
    ["Florida State", "585–291–17", "Through 2025", 66.5],
    ["Appalachian State", "671–361–29", "Through 2025", 64.6],
    ["LSU", "818–438–47", "Through 2025", 64.6],
    ["Coastal Carolina", "173–98–0", "Through 2025", 63.8],
    ["Kennesaw State", "74–42–0", "Through 2025", 63.8],
    ["Miami (FL)", "676–391–19", "Through 2025", 63.1],
    ["James Madison", "379–226–4", "Through 2025", 62.6],
    ["Florida", "767–452–40", "Through 2025", 62.5],
    ["Clemson", "809–478–45", "Through 2025", 62.5],
    ["Auburn", "807–478–47", "Through 2025", 62.3],
    ["Georgia Southern", "427–260–10", "Through 2025", 62.0],
    ["Washington", "783–474–50", "Through 2025", 61.8],
    ["Texas A&M", "789–509–48", "Through 2025", 60.4],
  ]),
};
