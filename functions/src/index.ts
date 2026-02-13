/**
 * Cloud Functions for Scorekinole
 * Handles tournament completion and user profile updates
 */

import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";

// Telegram secrets
const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
const telegramChatId = defineSecret("TELEGRAM_CHAT_ID");

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

    // Get pair members and add individual records (REGISTERED only)
    const pair = await getPairById(participant.pairId);
    if (pair) {
      // Member 1: Only process if REGISTERED
      if (pair.member1Type === "REGISTERED" && pair.member1UserId && !pair.member1UserId.startsWith("pair_")) {
        await addTournamentRecord(pair.member1UserId, tournamentRecord);
      }

      // Member 2: Only process if REGISTERED
      if (pair.member2Type === "REGISTERED" && pair.member2UserId && !pair.member2UserId.startsWith("pair_")) {
        await addTournamentRecord(pair.member2UserId, tournamentRecord);
      }
    }
    // Legacy pairs don't need userId updates in tournament (they use pairId)
    return result;
  }

  // DOUBLES: Process both members using their REAL names (REGISTERED only)
  // GUEST participants do NOT get entries in /users - their data stays in the tournament document
  if (tournament.gameType === "doubles" && participant.partner) {
    logger.info(`Processing doubles participant: ${participant.name} / ${participant.partner.name}` +
      (participant.teamName ? ` (team: ${participant.teamName})` : ""));

    // Member 1: Only process if REGISTERED
    if (participant.type === "REGISTERED" && participant.userId) {
      await addTournamentRecord(participant.userId, tournamentRecord);
    }

    // Member 2: Only process if REGISTERED
    if (participant.partner.type === "REGISTERED" && participant.partner.userId) {
      await addTournamentRecord(participant.partner.userId, tournamentRecord);
    }

    return result;
  }

  // SINGLES: Individual participant (REGISTERED only)
  // GUEST participants do NOT get entries in /users - their data stays in the tournament document
  // Skip if name looks like a pair team name (contains " / ")
  if (participant.name.includes(" / ")) {
    logger.warn(`Skipping participant "${participant.name}" - looks like a pair team name, not an individual player`);
    return result;
  }

  // Only process if REGISTERED
  if (participant.type === "REGISTERED" && participant.userId) {
    await addTournamentRecord(participant.userId, tournamentRecord);
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

/**
 * Send a Telegram message (helper function)
 */
async function sendTelegramMessage(message: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${telegramBotToken.value()}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId.value(),
          text: message,
          parse_mode: "Markdown",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Telegram API error:", errorText);
      return false;
    }
    return true;
  } catch (error) {
    logger.error("Error sending Telegram message:", error);
    return false;
  }
}

/**
 * Cloud Function: Notify admin via Telegram when a new user registers
 * Also checks for suspicious activity (duplicate IP/fingerprint)
 * Triggers when a new user document is created in Firestore
 */
export const onUserCreated = onDocumentCreated(
  {
    document: "users/{userId}",
    region: "europe-west1",
    secrets: [telegramBotToken, telegramChatId],
  },
  async (event) => {
    const userData = event.data?.data();
    const userId = event.params.userId;

    if (!userData) {
      logger.warn("No user data in creation event");
      return;
    }

    const { playerName, email, authProvider, registrationIP, deviceFingerprint } = userData;

    // Only process Google sign-ups (not GUEST users created by system)
    if (authProvider !== "google") {
      logger.info(`Skipping notification for non-Google user: ${playerName}`);
      return;
    }

    // Send new user notification
    const message =
      `🆕 *Nuevo usuario en Scorekinole*\n\n` +
      `👤 *Nombre:* ${playerName || "Sin nombre"}\n` +
      `📧 *Email:* ${email || "Sin email"}`;

    await sendTelegramMessage(message);
    logger.info(`Telegram notification sent for new user: ${email}`);

    // Check for suspicious activity (duplicate IP or fingerprint)
    if (registrationIP && registrationIP !== "unknown") {
      try {
        const sameIPUsers = await getDb()
          .collection("users")
          .where("registrationIP", "==", registrationIP)
          .where("authProvider", "==", "google")
          .get();

        if (sameIPUsers.size > 1) {
          const otherUsers = sameIPUsers.docs
            .filter((doc) => doc.id !== userId)
            .map((doc) => doc.data().playerName || doc.data().email || doc.id)
            .slice(0, 5); // Max 5 users in alert

          const alertMessage =
            `⚠️ *Posibles cuentas duplicadas*\n\n` +
            `🔴 *Misma IP:* ${registrationIP}\n` +
            `👤 *Nuevo:* ${playerName}\n` +
            `👥 *Existentes:* ${otherUsers.join(", ")}\n` +
            `📊 *Total cuentas:* ${sameIPUsers.size}`;

          await sendTelegramMessage(alertMessage);
          logger.warn(`Duplicate IP detected: ${registrationIP} (${sameIPUsers.size} accounts)`);
        }
      } catch (error) {
        logger.error("Error checking for duplicate IPs:", error);
      }
    }

    if (deviceFingerprint && deviceFingerprint !== "server") {
      try {
        const sameFingerprintUsers = await getDb()
          .collection("users")
          .where("deviceFingerprint", "==", deviceFingerprint)
          .where("authProvider", "==", "google")
          .get();

        if (sameFingerprintUsers.size > 1) {
          const otherUsers = sameFingerprintUsers.docs
            .filter((doc) => doc.id !== userId)
            .map((doc) => doc.data().playerName || doc.data().email || doc.id)
            .slice(0, 5);

          const alertMessage =
            `⚠️ *Posible mismo dispositivo*\n\n` +
            `🔴 *Fingerprint:* ${deviceFingerprint.slice(0, 8)}...\n` +
            `👤 *Nuevo:* ${playerName}\n` +
            `👥 *Existentes:* ${otherUsers.join(", ")}\n` +
            `📊 *Total cuentas:* ${sameFingerprintUsers.size}`;

          await sendTelegramMessage(alertMessage);
          logger.warn(`Duplicate fingerprint detected: ${deviceFingerprint} (${sameFingerprintUsers.size} accounts)`);
        }
      } catch (error) {
        logger.error("Error checking for duplicate fingerprints:", error);
      }
    }
  }
);

/**
 * Cloud Function: Notify admin via Telegram when a tournament is created
 * Triggers when a new tournament document is created in Firestore
 */
export const onTournamentCreated = onDocumentCreated(
  {
    document: "tournaments/{tournamentId}",
    region: "europe-west1",
    secrets: [telegramBotToken, telegramChatId],
  },
  async (event) => {
    const tournamentData = event.data?.data();
    if (!tournamentData) {
      logger.warn("No tournament data in creation event");
      return;
    }

    const { name, createdByName, gameType, isImported, participants } = tournamentData;
    const participantCount = participants?.length || 0;
    const tournamentType = isImported ? "IMPORTED" : "LIVE";
    const emoji = isImported ? "📥" : "🏆";
    const typeLabel = isImported ? "Importado" : "En vivo";

    const message =
      `${emoji} *Nuevo torneo ${typeLabel}*\n\n` +
      `📋 *Nombre:* ${name || "Sin nombre"}\n` +
      `👤 *Creado por:* ${createdByName || "Desconocido"}\n` +
      `🎮 *Tipo:* ${gameType === "doubles" ? "Dobles" : "Singles"}\n` +
      `👥 *Participantes:* ${participantCount}`;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${telegramBotToken.value()}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId.value(),
            text: message,
            parse_mode: "Markdown",
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Telegram API error:", errorText);
      } else {
        logger.info(`Telegram notification sent for new ${tournamentType} tournament: ${name}`);
      }
    } catch (error) {
      logger.error("Error sending Telegram notification:", error);
    }
  }
);
