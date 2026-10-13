export const participationCookie = "__Host-aaw_participation";
export const consentVersion = "stage35-v1";
export const consentText = "I voluntarily allow AAW to collect future game-tier ratings and favourite-team selections I deliberately make for private audience statistics. Existing saved selections are never uploaded when I opt in, refresh or load a preset. Participation lasts 365 days from consent. I can withdraw and delete my contributions without losing my personal saved choices. Analytics permission is separate.";
export const withdrawalPendingKey = "aaw-hub-withdrawal-pending-v1";
export const participationRefreshKey = "aaw-hub-participation-refresh-v1";
export type ParticipationState = { available: boolean; active: boolean; consentVersion: string | null; grantedAt: string | null; consentReceipt: string | null };
export const unavailableParticipation: ParticipationState = { available: false, active: false, consentVersion: null, grantedAt: null, consentReceipt: null };
