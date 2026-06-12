/**
 * One-off backfill: move PII off the world-readable user doc.
 *
 * For every /users/{uid} that still has email / registrationIP /
 * deviceFingerprint / deviceInfo on the PUBLIC doc, this copies them into the
 * owner-only /users/{uid}/private/meta subdoc (plus a duplicated authProvider so
 * the Cloud Function duplicate-account check works), then removes them from the
 * public doc. The private doc is marked `_backfill: true` so the
 * onUserPrivateMetaCreated trigger skips it (no notification/alert storm).
 *
 * SAFE BY DEFAULT: runs as a DRY RUN unless you pass --commit.
 * Idempotent: re-running skips docs that no longer have the public fields.
 *
 * Usage (from the functions/ directory):
 *   # 1. point at your project's credentials (service account JSON)
 *   #    or run `gcloud auth application-default login` first
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   export GCLOUD_PROJECT=scorekinole          # your project id
 *
 *   node scripts/backfillPrivatePii.mjs           # dry run — shows what WOULD change
 *   node scripts/backfillPrivatePii.mjs --commit  # actually writes
 *
 * ⚠️ Take a Firestore backup first (/admin/tools/backup or `gcloud firestore export`).
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const COMMIT = process.argv.includes("--commit");
const PII_FIELDS = ["email", "registrationIP", "deviceFingerprint", "deviceInfo"];

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

async function main() {
  console.log(COMMIT ? "🟢 COMMIT mode — writing changes" : "🟡 DRY RUN — no writes (pass --commit to apply)");

  const snap = await db.collection("users").get();
  console.log(`Scanning ${snap.size} user docs...`);

  let migrated = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const hasPii = PII_FIELDS.some((f) => data[f] !== undefined);
    if (!hasPii) {
      skipped++;
      continue;
    }

    const privatePayload = { authProvider: data.authProvider ?? null, _backfill: true };
    for (const f of PII_FIELDS) {
      if (data[f] !== undefined) privatePayload[f] = data[f];
    }

    console.log(
      `${COMMIT ? "→" : "would"} migrate ${docSnap.id} ` +
        `(${PII_FIELDS.filter((f) => data[f] !== undefined).join(", ")})`
    );

    if (COMMIT) {
      // 1. write the private meta doc
      await db.doc(`users/${docSnap.id}/private/meta`).set(privatePayload, { merge: true });
      // 2. strip the PII from the public doc
      const removal = {};
      for (const f of PII_FIELDS) {
        if (data[f] !== undefined) removal[f] = FieldValue.delete();
      }
      await docSnap.ref.update(removal);
    }
    migrated++;
  }

  console.log(`\nDone. ${migrated} ${COMMIT ? "migrated" : "to migrate"}, ${skipped} already clean.`);
  if (!COMMIT && migrated > 0) console.log("Re-run with --commit to apply.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  }
);
