/**
 * Cloud Functions for Scorekinole
 * Handles tournament completion and user profile updates
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";

// Lazy initialization
let db: Firestore | null = null;

function getDb(): Firestore {
  if (!db) {
    if (getApps().length === 0) {
      initializeApp();
    }
    db = getFirestore();
  }
  return db;
}

// Types (mirrored from client for server-side use)
type TournamentTier = "CLUB" | "REGIONAL" | "NATIONAL" | "MAJOR";

interface TournamentRecord {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: number;
  finalPosition: number;
  totalParticipants: number;
  rankingBefore: number;
  rankingAfter: number;
  rankingDelta: number;
}

interface TournamentParticipant {
  id: string;
  type: "REGISTERED" | "GUEST";
  userId?: string;
  name: string;                    // Player 1's REAL name (always)
  teamName?: string;               // Optional artistic team name for display
  status: "ACTIVE" | "WITHDRAWN" | "DISQUALIFIED";
  rankingSnapshot?: number;
  currentRanking?: number;
  finalPosition?: number;
  // Legacy pair mode fields (deprecated - use partner instead)
  participantMode?: "individual" | "pair";
  pairId?: string;
  pairTeamName?: string;
  // Partner field for doubles
  partner?: {
    type: "REGISTERED" | "GUEST";
    userId?: string;
    name: string;                  // Player 2's REAL name (always)
  };
}

interface Pair {
  id: string;
  teamName?: string;
  member1UserId: string;
  member2UserId: string;
  member1Name: string;
  member2Name: string;
  member1Type: "REGISTERED" | "GUEST";
  member2Type: "REGISTERED" | "GUEST";
}

interface PairTournamentRecord {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: number;
  finalPosition: number;
  totalParticipants: number;
  rankingDelta: number;
}

interface Tournament {
  id: string;
  name: string;
  status: string;
  gameType: "singles" | "doubles";
  rankingConfig?: {
    enabled: boolean;
    tier?: TournamentTier;
  };
  participants: TournamentParticipant[];
  completedAt?: number;
}

interface UserProfile {
  playerName: string;
  tournaments?: TournamentRecord[];
}

// Tier base points
const TIER_BASE_POINTS: Record<TournamentTier, number> = {
  CLUB: 15,
  REGIONAL: 25,
  NATIONAL: 40,
  MAJOR: 50,
};

/**
 * Calculate ranking points based on position and tier
 */
function calculateRankingPoints(position: number, tier: TournamentTier): number {
  const basePoints = TIER_BASE_POINTS[tier];

  if (position === 1) return basePoints;
  if (position === 2) return Math.round(basePoints * 0.9);
  if (position === 3) return Math.round(basePoints * 0.8);
  if (position === 4) return Math.round(basePoints * 0.7);

  const points = basePoints - (position + 2);
  return points > 1 ? points : 1;
}

/**
 * Get or create a user by name
 */
async function getOrCreateUserByName(name: string): Promise<{ userId: string; created: boolean } | null> {
  try {
    const usersRef = getDb().collection("users");
    const snapshot = await usersRef.where("playerName", "==", name).get();

    if (!snapshot.empty) {
      const existingDoc = snapshot.docs[0];
      logger.info(`Found existing user "${name}" with ID: ${existingDoc.id}`);
      return { userId: existingDoc.id, created: false };
    }

    // Create new GUEST user
    const newUserData = {
      playerName: name,
      email: null,
      photoURL: null,
      authProvider: null,
      tournaments: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const newDocRef = await usersRef.add(newUserData);
    logger.info(`Created new GUEST user "${name}" with ID: ${newDocRef.id}`);
    return { userId: newDocRef.id, created: true };
  } catch (error) {
    logger.error("Error in getOrCreateUserByName:", error);
    return null;
  }
}

/**
 * Add tournament record to user profile
 * Note: Ranking is calculated from tournaments, not stored separately
 */
async function addTournamentRecord(
  userId: string,
  record: TournamentRecord
): Promise<boolean> {
  try {
    const userRef = getDb().collection("users").doc(userId);
    const userSnap = await userRef.get();

    // Check for duplicates
    if (userSnap.exists) {
      const profile = userSnap.data() as UserProfile;
      const existingRecord = profile.tournaments?.find(
        (t) => t.tournamentId === record.tournamentId
      );
      if (existingRecord) {
        logger.info(
          `Tournament ${record.tournamentId} already in user ${userId} history - skipping`
        );
        return true;
      }
    }

    await userRef.set(
      {
        tournaments: FieldValue.arrayUnion(record),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logger.info(
      `Added tournament record for user ${userId}: +${record.rankingDelta} points`
    );
    return true;
  } catch (error) {
    logger.error("Error adding tournament record:", error);
    return false;
  }
}

/**
 * Get pair by ID
 */
async function getPairById(pairId: string): Promise<Pair | null> {
  try {
    const pairRef = getDb().collection("pairs").doc(pairId);
    const pairSnap = await pairRef.get();

    if (pairSnap.exists) {
      return pairSnap.data() as Pair;
    }
    return null;
  } catch (error) {
    logger.error("Error getting pair:", error);
    return null;
  }
}

/**
 * Add tournament record to pair's history
 */
async function addPairTournamentRecord(
  pairId: string,
  record: PairTournamentRecord
): Promise<boolean> {
  try {
    const pairRef = getDb().collection("pairs").doc(pairId);
    const pairSnap = await pairRef.get();

    // Check for duplicates
    if (pairSnap.exists) {
      const pair = pairSnap.data();
      const existingRecord = pair?.tournaments?.find(
        (t: PairTournamentRecord) => t.tournamentId === record.tournamentId
      );
      if (existingRecord) {
        logger.info(
          `Tournament ${record.tournamentId} already in pair ${pairId} history - skipping`
        );
        return true;
      }
    }

    await pairRef.set(
      {
        tournaments: FieldValue.arrayUnion(record),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logger.info(`Added tournament record to pair ${pairId}`);
    return true;
  } catch (error) {
    logger.error("Error adding pair tournament record:", error);
    return false;
  }
}

/**
 * Result of processing a participant, includes userId updates needed
 */
interface ParticipantProcessResult {
  participantId: string;
  userId?: string;        // If main participant needs userId update
  partnerUserId?: string; // If partner needs userId update (doubles)
}

/**
 * Process a single participant and add tournament record to their profile
 * Returns info about userId updates needed for the participant
 */
async function processParticipant(
  participant: TournamentParticipant,
  tournament: Tournament,
  tier: TournamentTier,
  totalParticipants: number,
  rankingEnabled: boolean
): Promise<ParticipantProcessResult> {
  const result: ParticipantProcessResult = { participantId: participant.id };
  const position = participant.finalPosition || 0;
  const pointsEarned = rankingEnabled ? calculateRankingPoints(position, tier) : 0;
  const rankingBefore = participant.rankingSnapshot || 0;
  const rankingAfter = rankingBefore + pointsEarned;

  const tournamentRecord: TournamentRecord = {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    tournamentDate: tournament.completedAt || Date.now(),
    finalPosition: position,
    totalParticipants,
    rankingBefore,
    rankingAfter,
    rankingDelta: pointsEarned,
  };

  // LEGACY: Handle pair participants (deprecated - use partner field instead)
  if (participant.participantMode === "pair" && participant.pairId) {
    logger.info(`Processing pair participant: ${participant.pairId}`);

    // Add record to pair's history
    const pairRecord: PairTournamentRecord = {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentDate: tournament.completedAt || Date.now(),
      finalPosition: position,
      totalParticipants,
      rankingDelta: pointsEarned,
    };
    await addPairTournamentRecord(participant.pairId, pairRecord);

    // Get pair members and add individual records
    const pair = await getPairById(participant.pairId);
    if (pair) {
      // Member 1
      let member1UserId: string | null = null;
      if (pair.member1Type === "REGISTERED" && pair.member1UserId && !pair.member1UserId.startsWith("pair_")) {
        member1UserId = pair.member1UserId;
      } else {
        const userResult = await getOrCreateUserByName(pair.member1Name);
        if (userResult) {
          member1UserId = userResult.userId;
        }
      }
      if (member1UserId) {
        await addTournamentRecord(member1UserId, tournamentRecord);
      }

      // Member 2
      let member2UserId: string | null = null;
      if (pair.member2Type === "REGISTERED" && pair.member2UserId && !pair.member2UserId.startsWith("pair_")) {
        member2UserId = pair.member2UserId;
      } else {
        const userResult = await getOrCreateUserByName(pair.member2Name);
        if (userResult) {
          member2UserId = userResult.userId;
        }
      }
      if (member2UserId) {
        await addTournamentRecord(member2UserId, tournamentRecord);
      }
    }
    // Legacy pairs don't need userId updates in tournament (they use pairId)
    return result;
  }

  // DOUBLES: Process both members using their REAL names
  // participant.name = Player 1's real name (always)
  // participant.partner.name = Player 2's real name (always)
  // participant.teamName = Optional artistic name (ignored for ranking)
  if (tournament.gameType === "doubles" && participant.partner) {
    logger.info(`Processing doubles participant: ${participant.name} / ${participant.partner.name}` +
      (participant.teamName ? ` (team: ${participant.teamName})` : ""));

    // Member 1: Use userId if REGISTERED, otherwise use real name
    let member1UserId: string | null = null;
    if (participant.type === "REGISTERED" && participant.userId) {
      member1UserId = participant.userId;
    } else {
      // participant.name always contains the real name now
      const userResult = await getOrCreateUserByName(participant.name);
      if (userResult) {
        member1UserId = userResult.userId;
        // Track that we need to update this participant's userId
        result.userId = userResult.userId;
      }
    }
    if (member1UserId) {
      await addTournamentRecord(member1UserId, tournamentRecord);
    }

    // Member 2: Use userId if REGISTERED, otherwise use real name
    let member2UserId: string | null = null;
    if (participant.partner.type === "REGISTERED" && participant.partner.userId) {
      member2UserId = participant.partner.userId;
    } else {
      // partner.name always contains the real name
      const userResult = await getOrCreateUserByName(participant.partner.name);
      if (userResult) {
        member2UserId = userResult.userId;
        // Track that we need to update the partner's userId
        result.partnerUserId = userResult.userId;
      }
    }
    if (member2UserId) {
      await addTournamentRecord(member2UserId, tournamentRecord);
    }

    return result;
  }

  // SINGLES: Individual participant
  // Skip if name looks like a pair team name (contains " / ")
  if (participant.name.includes(" / ")) {
    logger.warn(`Skipping participant "${participant.name}" - looks like a pair team name, not an individual player`);
    return result;
  }

  let userId: string | null = null;
  if (participant.type === "REGISTERED" && participant.userId) {
    userId = participant.userId;
  } else {
    const userResult = await getOrCreateUserByName(participant.name);
    if (userResult) {
      userId = userResult.userId;
      // Track that we need to update this participant's userId
      result.userId = userResult.userId;
    }
  }

  if (userId) {
    await addTournamentRecord(userId, tournamentRecord);
  }

  return result;
}

/**
 * Cloud Function: Trigger when tournament status changes to COMPLETED
 */
export const onTournamentComplete = onDocumentUpdated(
  {
    document: "tournaments/{tournamentId}",
    region: "europe-west1",
  },
  async (event) => {
    const beforeData = event.data?.before.data() as Tournament | undefined;
    const afterData = event.data?.after.data() as Tournament | undefined;
    const tournamentId = event.params.tournamentId;

    if (!beforeData || !afterData) {
      logger.warn("Missing data in tournament update event");
      return;
    }

    // Only trigger when status changes TO COMPLETED
    if (beforeData.status === "COMPLETED" || afterData.status !== "COMPLETED") {
      return;
    }

    logger.info(`Tournament ${tournamentId} (${afterData.name}) just completed - processing participant results`);

    const rankingEnabled = afterData.rankingConfig?.enabled ?? false;

    // If ranking is disabled, skip all processing
    if (!rankingEnabled) {
      logger.info(`Ranking disabled for tournament ${tournamentId} - skipping participant ranking updates`);
      return;
    }

    const tier: TournamentTier = afterData.rankingConfig?.tier || "CLUB";

    // Filter for ACTIVE participants (treat missing status as ACTIVE for legacy data)
    // DISQUALIFIED and WITHDRAWN participants should NOT receive ranking points
    const activeParticipants = afterData.participants.filter(
      (p) => (p.status === "ACTIVE" || !p.status) && p.finalPosition
    );

    const totalParticipants = afterData.participants.filter(
      (p) => p.status === "ACTIVE" || !p.status
    ).length;

    logger.info(`Processing ${activeParticipants.length} participants with final positions (tier: ${tier})`);

    // Add tournamentId to the tournament object (not included in document data)
    const tournamentWithId: Tournament = { ...afterData, id: tournamentId };

    // Process all participants (only runs if ranking is enabled)
    const results = await Promise.allSettled(
      activeParticipants.map((p) =>
        processParticipant(p, tournamentWithId, tier, totalParticipants, true)
      )
    );

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    logger.info(
      `Tournament ${tournamentId} processing complete: ${successful} successful, ${failed} failed`
    );

    // Collect userId updates from process results
    const userIdUpdates = new Map<string, { userId?: string; partnerUserId?: string }>();
    results.forEach((r) => {
      if (r.status === "fulfilled" && r.value) {
        const { participantId, userId, partnerUserId } = r.value;
        if (userId || partnerUserId) {
          userIdUpdates.set(participantId, { userId, partnerUserId });
        }
      }
    });

    if (userIdUpdates.size > 0) {
      logger.info(`Found ${userIdUpdates.size} participant(s) needing userId updates`);
    }

    // Update tournament to mark ranking updates as applied AND update userIds
    try {
      const updatedParticipants = afterData.participants.map((p) => {
        let updated = { ...p };

        // Apply ranking updates (treat missing status as ACTIVE for legacy data)
        // DISQUALIFIED participants should NOT receive ranking points
        if ((p.status === "ACTIVE" || !p.status) && p.finalPosition) {
          const pointsEarned = calculateRankingPoints(p.finalPosition, tier);
          updated.currentRanking = (p.rankingSnapshot || 0) + pointsEarned;
        }

        // Apply userId updates (for GUEST participants that were created/found)
        const userIdUpdate = userIdUpdates.get(p.id);
        if (userIdUpdate) {
          if (userIdUpdate.userId && !p.userId) {
            updated.userId = userIdUpdate.userId;
            logger.info(`Updated participant ${p.id} (${p.name}) with userId: ${userIdUpdate.userId}`);
          }
          if (userIdUpdate.partnerUserId && p.partner && !p.partner.userId) {
            updated.partner = {
              ...p.partner,
              userId: userIdUpdate.partnerUserId,
            };
            logger.info(`Updated partner of ${p.id} (${p.partner.name}) with userId: ${userIdUpdate.partnerUserId}`);
          }
        }

        return updated;
      });

      await getDb().collection("tournaments").doc(tournamentId).update({
        participants: updatedParticipants,
      });

      logger.info(`Updated participant rankings and userIds in tournament ${tournamentId}`);
    } catch (error) {
      logger.error("Error updating tournament participants:", error);
    }
  }
);
