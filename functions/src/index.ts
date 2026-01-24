/**
 * Cloud Functions for Scorekinole
 * Handles tournament completion and user profile updates
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

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
  name: string;
  status: "ACTIVE" | "WITHDRAWN" | "DISQUALIFIED";
  rankingSnapshot?: number;
  finalPosition?: number;
  partner?: {
    type: "REGISTERED" | "GUEST";
    userId?: string;
    name: string;
  };
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
  ranking?: number;
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
    const usersRef = db.collection("users");
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
      ranking: 0,
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
 */
async function addTournamentRecord(
  userId: string,
  record: TournamentRecord,
  newRanking: number
): Promise<boolean> {
  try {
    const userRef = db.collection("users").doc(userId);
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
        ranking: newRanking,
        tournaments: FieldValue.arrayUnion(record),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logger.info(
      `Added tournament record for user ${userId}: Ranking ${record.rankingBefore} -> ${newRanking} (+${record.rankingDelta})`
    );
    return true;
  } catch (error) {
    logger.error("Error adding tournament record:", error);
    return false;
  }
}

/**
 * Process a single participant and add tournament record to their profile
 */
async function processParticipant(
  participant: TournamentParticipant,
  tournament: Tournament,
  tier: TournamentTier,
  totalParticipants: number,
  rankingEnabled: boolean
): Promise<void> {
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

  // Main participant
  let userId: string | null = null;
  if (participant.type === "REGISTERED" && participant.userId) {
    userId = participant.userId;
  } else {
    const result = await getOrCreateUserByName(participant.name);
    if (result) {
      userId = result.userId;
    }
  }

  if (userId) {
    await addTournamentRecord(userId, tournamentRecord, rankingAfter);
  }

  // Partner (for doubles)
  if (tournament.gameType === "doubles" && participant.partner) {
    let partnerUserId: string | null = null;
    if (participant.partner.type === "REGISTERED" && participant.partner.userId) {
      partnerUserId = participant.partner.userId;
    } else {
      const result = await getOrCreateUserByName(participant.partner.name);
      if (result) {
        partnerUserId = result.userId;
      }
    }

    if (partnerUserId) {
      await addTournamentRecord(partnerUserId, tournamentRecord, rankingAfter);
    }
  }
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

    const activeParticipants = afterData.participants.filter(
      (p) => p.status === "ACTIVE" && p.finalPosition
    );

    const totalParticipants = afterData.participants.filter(
      (p) => p.status === "ACTIVE"
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

    // Update tournament to mark ranking updates as applied
    try {
      const updatedParticipants = afterData.participants.map((p) => {
        if (p.status === "ACTIVE" && p.finalPosition) {
          const pointsEarned = calculateRankingPoints(p.finalPosition, tier);
          return {
            ...p,
            currentRanking: (p.rankingSnapshot || 0) + pointsEarned,
          };
        }
        return p;
      });

      await db.collection("tournaments").doc(tournamentId).update({
        participants: updatedParticipants,
      });

      logger.info(`Updated participant rankings in tournament ${tournamentId}`);
    } catch (error) {
      logger.error("Error updating tournament participants:", error);
    }
  }
);
