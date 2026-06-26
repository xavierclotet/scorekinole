import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { computeUserStats, type RawTournament } from './playerStatsCore';

/** Fetch the user's completed tournaments via the participantUserIds index, recompute, write. */
export async function recomputeUserStats(db: Firestore, userId: string): Promise<void> {
  if (!userId) return;
  const snap = await db
    .collection('tournaments')
    .where('status', '==', 'COMPLETED')
    .where('participantUserIds', 'array-contains', userId)
    .get();

  const tournaments = snap.docs.map((d) => ({ ...(d.data() as object), id: d.id })) as RawTournament[];
  const stats = computeUserStats(userId, tournaments);

  await db.collection('playerStats').doc(userId).set(
    { ...stats, lastUpdated: FieldValue.serverTimestamp() },
    { merge: false }
  );
}

/** Every userId (+partner) that appears in any completed, non-test tournament. */
export async function collectAllPlayerUserIds(db: Firestore): Promise<string[]> {
  const snap = await db.collection('tournaments').where('status', '==', 'COMPLETED').get();
  const ids = new Set<string>();
  for (const doc of snap.docs) {
    const t = doc.data() as { isTest?: boolean; participantUserIds?: string[] };
    if (t.isTest === true) continue;
    for (const id of t.participantUserIds ?? []) if (id) ids.add(id);
  }
  return Array.from(ids);
}
