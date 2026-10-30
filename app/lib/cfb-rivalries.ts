type Rivalry = { teams: readonly string[]; name: string; trophy: string | null };

// Strip only an explicit mascot suffix, then compare the entire school name.
// School qualifiers such as State, Tech, A&M and (OH) must survive normalization.
const mascotSuffix = /\s+(?:midshipmen|rainbow warriors|golden gophers|golden bears|golden hurricanes?|golden flashes|fighting irish|crimson tide|nittany lions|scarlet knights|black knights|blue devils|tar heels|yellow jackets|demon deacons|red raiders|red wolves|roadrunners|runnin rebels|mean green|ragin cajuns|thundering herd|mountain hawks|wildcats|buckeyes|wolverines|spartans|trojans|bruins|ducks|huskies|tigers|bulldogs|gators|longhorns|sooners|cowboys|aggies|volunteers|seminoles|hurricanes|hokies|panthers|orange|eagles|cardinals|cardinal|knights|owls|pirates|mountaineers|wolfpack|cavaliers|razorbacks|rebels|commodores|gamecocks|beavers|buffaloes|utes|cougars|broncos|jayhawks|cyclones|cornhuskers|hawkeyes|badgers|gophers|boilermakers|hoosiers|terrapins|bearcats|bears|falcons|rams|aztecs|lobos|wolf pack|warriors|redhawks|rockets|zips|bobcats|minutemen|huskies|hilltoppers|blazers|miners|dukes|flames|chanticleers|jaguars|bearkats|gamecocks)$/;

function schoolKey(name: string) {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[’ʻ']/g, "").replace(/\s+/g, " ").trim()
    .replace(mascotSuffix, "").replace(/[^a-z0-9]/g, "");
}

export function findCfbRivalry<T extends Rivalry>(game: { homeTeam: string; awayTeam: string }, catalogue: readonly T[]): T | undefined {
  const home = schoolKey(game.homeTeam), away = schoolKey(game.awayTeam);
  if (!home || !away || home === away) return undefined;
  return catalogue.find(({ teams }) => {
    const [first, second] = teams.map(schoolKey);
    return first && second && ((home === first && away === second) || (home === second && away === first));
  });
}
