/**
 * Convert a "who starts" selection into hammer assignment.
 *
 * In Crokinole, the hammer (last shot advantage) goes to the player
 * who does NOT shoot first. So if team 1 starts, hammer goes to team 2.
 *
 * @param startingTeam - The team the user selected as the starter (1 or 2)
 * @returns hammerTeam - The team that should hold the hammer
 */
export function getHammerFromStarter(startingTeam: 1 | 2): 1 | 2 {
	return startingTeam === 1 ? 2 : 1;
}

/**
 * Resolve hammer assignment from play options.
 *
 * @param hammerTeam - The team holding the hammer (null = no hammer)
 * @returns Object with hasHammer flags for each team
 */
export function resolveHammerAssignment(hammerTeam: 1 | 2 | null): {
	team1HasHammer: boolean;
	team2HasHammer: boolean;
} {
	if (hammerTeam === null) {
		return { team1HasHammer: false, team2HasHammer: false };
	}
	return {
		team1HasHammer: hammerTeam === 1,
		team2HasHammer: hammerTeam === 2
	};
}

/**
 * Randomly pick which team starts (and therefore which gets the hammer).
 *
 * @returns The team that should hold the hammer (opposite of the random starter)
 */
export function randomizeHammerStart(): 1 | 2 {
	const randomStarter: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
	return getHammerFromStarter(randomStarter);
}
