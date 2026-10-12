export const participationCookie = "__Host-aaw_participation";
export const consentVersion = "stage28-v1";
export const consentText = "I voluntarily agree to browser-scoped AAW Hub audience participation. Future new or changed personal game tiers and favourite-team choices may contribute to aggregate audience insights after those features launch. Opting in now sends no existing selections and collects no ratings or favourites. I can withdraw and request deletion at any time without losing local preferences. Analytics permission is separate.";
export const withdrawalPendingKey = "aaw-hub-withdrawal-pending-v1";
export const participationRefreshKey = "aaw-hub-participation-refresh-v1";
export type ParticipationState = { available: boolean; active: boolean; consentVersion: string | null; grantedAt: string | null };
export const unavailableParticipation: ParticipationState = { available: false, active: false, consentVersion: null, grantedAt: null };
