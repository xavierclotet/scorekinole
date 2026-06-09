/**
 * Derivation of hammer state from the recorded round history.
 *
 * `hasHammer` and `currentGameStartHammer` only live in localStorage, so when
 * a tournament match is resumed on a different device — or reloaded after a
 * game ended and the context auto-advanced to the next game — they are stale
 * or default and the hammer indicator was simply lost.
 *
 * Both values are fully derivable from the rounds, because the rules are
 * deterministic:
 * - within a game, the hammer rotates after EVERY completed round
 *   (TeamCard.finalizeRound → rotateHammer)
 * - between games, the starting hammer alternates
 *   (TeamCard.resetForNextGame)
 * - each recorded round stores who held the hammer DURING that round
 */

export interface HammerRound {
	gameNumber: number;
	hammerTeam: 1 | 2 | null;
}

export interface DerivedHammerState {
	/** Team that holds the hammer right now (for the next round), or null if underivable */
	currentHolder: 1 | 2 | null;
	/** Team that started the current game with the hammer, or null if underivable */
	gameStartHammer: 1 | 2 | null;
}

function opposite(team: 1 | 2): 1 | 2 {
	return team === 1 ? 2 : 1;
}

/**
 * Starting hammer of a game from any of its rounds with hammer data.
 * The holder during round (i+1) is the start hammer rotated i times.
 */
function gameStartFromRounds(gameRounds: HammerRound[]): 1 | 2 | null {
	const idx = gameRounds.findIndex(r => r.hammerTeam === 1 || r.hammerTeam === 2);
	if (idx === -1) return null;
	const holder = gameRounds[idx].hammerTeam as 1 | 2;
	return idx % 2 === 0 ? holder : opposite(holder);
}

export function deriveHammerState(
	rounds: HammerRound[],
	currentGameNumber: number
): DerivedHammerState {
	const currentGameRounds = rounds.filter(r => r.gameNumber === currentGameNumber);

	if (currentGameRounds.length > 0) {
		const start = gameStartFromRounds(currentGameRounds);
		if (!start) return { currentHolder: null, gameStartHammer: null };
		// After N completed rounds the hammer has rotated N times
		const currentHolder =
			currentGameRounds.length % 2 === 0 ? start : opposite(start);
		return { currentHolder, gameStartHammer: start };
	}

	// Current game not started yet: alternate from the latest previous game
	// with hammer data (the starting hammer flips on every game change).
	const previousGameNumbers = [
		...new Set(
			rounds.filter(r => r.gameNumber < currentGameNumber).map(r => r.gameNumber)
		)
	].sort((a, b) => b - a);

	for (const gameNumber of previousGameNumbers) {
		const prevStart = gameStartFromRounds(rounds.filter(r => r.gameNumber === gameNumber));
		if (prevStart) {
			const gamesBetween = currentGameNumber - gameNumber;
			const start = gamesBetween % 2 === 1 ? opposite(prevStart) : prevStart;
			return { currentHolder: start, gameStartHammer: start };
		}
	}

	return { currentHolder: null, gameStartHammer: null };
}
