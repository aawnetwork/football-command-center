// Labels come only from the existing approved UK availability response.
// This presentation has no service-count limit and does not infer subscriptions.
export function NflUkBroadcasts({platforms}:{platforms:readonly string[]}) {
 const destinations=[...new Set(platforms.map(value=>value.trim()).filter(Boolean))];
 if(!destinations.length)return null;
 return <div className="game-card__broadcast nfl-uk-broadcasts" data-export-omit role="list" aria-label="Confirmed UK viewing destinations"><span aria-hidden="true">📺</span>{destinations.map(platform=><span role="listitem" key={platform}>{platform}</span>)}</div>;
}
