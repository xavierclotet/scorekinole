export interface NotificationPreferences {
	enabled: boolean;
	tournament_matchReady: boolean;
	tournament_phaseChange: boolean;
	tournament_ranking: boolean;
	friendly_inviteResponse: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
	enabled: true,
	tournament_matchReady: true,
	tournament_phaseChange: true,
	tournament_ranking: true,
	friendly_inviteResponse: true
};
