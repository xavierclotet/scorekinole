export interface NotificationPreferences {
	enabled: boolean;
	tournament_matchReady: boolean;
	tournament_phaseChange: boolean;
	tournament_ranking: boolean;
	friendly_inviteResponse: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
	enabled: false,
	tournament_matchReady: false,
	tournament_phaseChange: false,
	tournament_ranking: false,
	friendly_inviteResponse: false
};
