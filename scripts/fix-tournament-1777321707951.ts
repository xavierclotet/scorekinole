/**
 * One-shot fix for tournament tournament-1777321707951-hboxi866q.
 *
 * Quarterfinal Xavi Clotet vs Isis González was entered with the wrong
 * winner: the last round was attributed to Isis when Xavi actually won it.
 * Real winner: Xavi Clotet. System winner: Isis González.
 * Tournament is COMPLETED; ranking points already written by the
 * onTournamentComplete Cloud Function.
 *
 * The script:
 *   1. Flips pointsA↔pointsB and twentiesA↔twentiesB in the LAST round of
 *      the QF, recomputes the match aggregates, and sets winner=Xavi.
 *      Leaves participantA/participantB positions intact.
 *   2. Symmetrically swaps Isis↔Xavi in every OTHER bracket match
 *      (semifinals, final, consolation, silver, thirdPlace).
 *   3. Swaps positions in finalStandings.
 *   4. Swaps tournamentRecord positions in /users/{xavi} and /users/{isis}
 *      and recomputes any aggregate ranking field if present.
 *
 * Usage:
 *   npx tsx scripts/fix-tournament-1777321707951.ts --dry-run
 *   npx tsx scripts/fix-tournament-1777321707951.ts --apply
 *
 * After --apply succeeds, delete this script and the snapshot JSON.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// === Configuration ===
const TOURNAMENT_ID = 'tournament-1777321707951-hboxi866q';
const WRONG_WINNER_USER_ID = 'mkfa1f0m0QfDPDdzJSvgho0ZAzp1';   // Isis González
const RIGHT_WINNER_USER_ID = 'OrvBoj8jCLUp4RKZZe54JvqHM3K2';   // Xavi Clotet

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = resolve(__dirname, '../.firebase-keys/scorekinole-admin.json');
const SNAPSHOT_PATH = resolve(__dirname, `.fix-${TOURNAMENT_ID}.snapshot.json`);

// === Init firebase-admin ===
import { readFileSync } from 'fs';
const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// === Args ===
const args = new Set(process.argv.slice(2));
const isApply = args.has('--apply');
const isDryRun = !isApply;

if (WRONG_WINNER_USER_ID === RIGHT_WINNER_USER_ID) {
  console.error('Refusing to run: WRONG and RIGHT user IDs are identical.');
  process.exit(1);
}

// === Main (filled in by Tasks 12 + 13) ===
async function main() {
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Tournament: ${TOURNAMENT_ID}`);
  console.log(`Wrong winner: ${WRONG_WINNER_USER_ID}`);
  console.log(`Right winner: ${RIGHT_WINNER_USER_ID}`);
  console.log(`Service account: ${SERVICE_ACCOUNT_PATH}`);
  console.log(`Snapshot path (only used on --apply): ${SNAPSHOT_PATH}`);
  console.log('');
  console.log('(Read + diff phase to be added in Task 12)');
  console.log('(Apply phase to be added in Task 13)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
