/**
 * One-off backfill: populate `participantUserIds` on COMPLETED tournaments.
 *
 * The player-profile match query (`_fetchTournamentMatchesForUser`) was changed
 * from "download every COMPLETED tournament and filter client-side" to a
 * targeted `where('participantUserIds', 'array-contains', userId)`. New
 * tournaments get the field from the onTournamentComplete Cloud Function, but
 * pre-existing COMPLETED tournaments have no such field and would silently drop
 * out of profiles until backfilled. This script flattens every participant +
 * partner userId into `participantUserIds` for each COMPLETED tournament.
 *
 * SAFE BY DEFAULT: runs as a DRY RUN unless you pass --commit.
 * Idempotent: re-running skips tournaments whose index already matches.
 *
 * Usage (from the functions/ directory):
 *   # 1. point at your project's credentials (service account JSON)
 *   #    or run `gcloud auth application-default login` first
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   export GCLOUD_PROJECT=scorekinole          # your project id
 *
 *   node scripts/backfillParticipantUserIds.mjs           # dry run — shows what WOULD change
 *   node scripts/backfillParticipantUserIds.mjs --commit  # actually writes
 *
 * ⚠️ Deploy order: deploy the composite index (status + participantUserIds) and
 *    run this backfill BEFORE shipping the client query change, otherwise
 *    profiles render empty for tournaments missing the field.
 * ⚠️ Take a Firestore backup first (/admin/tools/backup or `gcloud firestore export`).
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const COMMIT = process.argv.includes("--commit");

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

/** Flatten participant + partner userIds (de-duped, empties skipped). */
function collectParticipantUserIds(participants) {
  const ids = new Set();
  for (const p of participants ?? []) {
    if (p?.userId) ids.add(p.userId);
    if (p?.partner?.userId) ids.add(p.partner.userId);
  }
  return Array.from(ids);
}

/** Order-independent equality for two id lists. */
function sameSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

async function main() {
  console.log(COMMIT ? "🟢 COMMIT mode — writing changes" : "🟡 DRY RUN — no writes (pass --commit to apply)");

  const snap = await db.collection("tournaments").where("status", "==", "COMPLETED").get();
  console.log(`Scanning ${snap.size} COMPLETED tournament docs...`);

  let updated = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const next = collectParticipantUserIds(data.participants);
    const current = data.participantUserIds;

    if (sameSet(current, next)) {
      skipped++;
      continue;
    }

    console.log(
      `${COMMIT ? "→" : "would"} set ${docSnap.id} ` +
        `("${data.name ?? "?"}") → ${next.length} userId(s)`
    );

    if (COMMIT) {
      await docSnap.ref.update({ participantUserIds: next });
    }
    updated++;
  }

  console.log(`\nDone. ${updated} ${COMMIT ? "updated" : "to update"}, ${skipped} already current.`);
  if (!COMMIT && updated > 0) console.log("Re-run with --commit to apply.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  }
);
