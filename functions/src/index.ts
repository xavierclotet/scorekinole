/**
 * Cloud Functions for Scorekinole
 * Handles tournament completion and user profile updates
 */

import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getAuth } from "firebase-admin/auth";
import { logger } from "firebase-functions";
import { shouldNotifyTournament, buildTournamentNotificationMessage } from "./notificationHelpers";
import { detectNewParticipants, detectNewWaitlistEntries, detectPromotedFromWaitlist } from "./registrationHelpers";
import { enforceRateLimit } from "./rateLimit";

// Telegram secrets
const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
const telegramChatId = defineSecret("TELEGRAM_CHAT_ID");

// Initialize Firebase Admin at module level (avoids race conditions with concurrent calls)
if (getApps().length === 0) {
  initializeApp();
}

function getDb(): Firestore {
  return getFirestore();
}

/** Convert a Firestore Timestamp or epoch number to epoch milliseconds */
function toEpochMs(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return Date.now();
}

// Types (mirrored from client for server-side use)
type TournamentTier = "SERIES_35" | "SERIES_25" | "SERIES_15";

/**
 * Normalize tier values (handles legacy CLUB/REGIONAL/NATIONAL/MAJOR from Firestore)
 */
function normalizeTier(tier: string | undefined): TournamentTier {
  const map: Record<string, TournamentTier> = {
    MAJOR: "SERIES_35", NATIONAL: "SERIES_25",
    REGIONAL: "SERIES_15", CLUB: "SERIES_15",
    SERIES_35: "SERIES_35", SERIES_25: "SERIES_25", SERIES_15: "SERIES_15",
  };
  return map[tier || ""] || "SERIES_15";
}

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
  rankingSnapshot?: number;        // Used for seeding (calculated at tournament start)
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
    rankingSnapshot?: number;      // Partner's ranking at tournament start
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
  isTest?: boolean;
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

// Series base points
const TIER_BASE_POINTS: Record<string, number> = {
  SERIES_35: 35, SERIES_25: 25, SERIES_15: 15,
  // Legacy support (pre-migration old tier names)
  SERIES_50: 35, SERIES_40: 25,
  MAJOR: 35, NATIONAL: 25, REGIONAL: 15, CLUB: 15,
};

/**
 * Natural threshold: participant count where drop curve reaches 1 pt for last place.
 */
function getNaturalThreshold(basePoints: number, mode: "singles" | "doubles"): number {
  if (mode === "singles") return basePoints - 5;
  // Doubles: higher threshold so doubles gives fewer points than singles for same N.
  // At threshold = basePoints, winner gets exactly N points (N = team count).
  return basePoints;
}

/**
 * Calculate ranking points with smart interpolation.
 */
function calculateRankingPoints(
  position: number,
  tier: TournamentTier,
  participantsCount: number = 16,
  mode: "singles" | "doubles" = "singles"
): number {
  const basePoints = TIER_BASE_POINTS[tier];
  const threshold = getNaturalThreshold(basePoints, mode);
  const winnerPoints = Math.round(basePoints * Math.min(1, participantsCount / threshold));

  if (position === 1) return winnerPoints;
  if (position > participantsCount) return 0;
  if (winnerPoints <= 1) return 1;

  const standardDrops: number[] = [];
  for (let i = 2; i <= participantsCount; i++) {
    if (mode === "singles") {
      if (i === 2) standardDrops.push(3);
      else if (i <= 5) standardDrops.push(2);
      else standardDrops.push(1);
    } else {
      if (i === 2) standardDrops.push(5);
      else if (i === 3) standardDrops.push(4);
      else standardDrops.push(2);
    }
  }

  // Always interpolate: spread points from winnerPoints to 1
  // (At threshold, standard drops sum exactly to winnerPoints-1, so interpolation = raw drops)
  const targetDrop = winnerPoints - 1;
  const totalStandardDrop = standardDrops.reduce((acc, val) => acc + val, 0);

  let actualDrops: number[];

  if (totalStandardDrop > targetDrop) {
    // Hamilton (largest remainder): reduce drops proportionally
    const scale = targetDrop / totalStandardDrop;
    const idealDrops = standardDrops.map((d) => d * scale);
    const floorDrops = idealDrops.map((d) => Math.floor(d));
    let remaining = targetDrop - floorDrops.reduce((acc, val) => acc + val, 0);

    const remainders = idealDrops.map((d, i) => ({ i, rem: d - Math.floor(d) }));
    remainders.sort((a, b) => b.rem - a.rem || a.i - b.i);

    actualDrops = [...floorDrops];
    for (let r = 0; r < remaining; r++) {
      actualDrops[remainders[r].i]++;
    }
  } else {
    // Level fill: increase smallest drops first (left to right within same level)
    actualDrops = [...standardDrops];
    let total = totalStandardDrop;

    while (total < targetDrop) {
      const minDrop = Math.min(...actualDrops);
      for (let i = 0; i < actualDrops.length && total < targetDrop; i++) {
        if (actualDrops[i] === minDrop) {
          actualDrops[i]++;
          total++;
        }
      }
    }
  }

  let cumDrop = 0;
  for (let i = 0; i < position - 1; i++) cumDrop += actualDrops[i];
  return Math.max(1, winnerPoints - cumDrop);
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

    // Use transaction to ensure atomic duplicate check + write
    await getDb().runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);

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
          return;
        }
      }

      transaction.set(
        userRef,
        {
          tournaments: FieldValue.arrayUnion(record),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

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
  const pointsEarned = rankingEnabled ? calculateRankingPoints(position, tier, totalParticipants, tournament.gameType) : 0;
  const rankingBefore = participant.rankingSnapshot || 0;
  const rankingAfter = rankingBefore + pointsEarned;

  const tournamentRecord: TournamentRecord = {
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    tournamentDate: toEpochMs(tournament.completedAt),
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
      tournamentDate: toEpochMs(tournament.completedAt),
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

  // DOUBLES: Process both members using their REAL names with their OWN ranking values
  // Both REGISTERED and GUEST participants with userId get entries in /users
  if (tournament.gameType === "doubles" && participant.partner) {
    logger.info(`Processing doubles participant: ${participant.name} / ${participant.partner.name}` +
      (participant.teamName ? ` (team: ${participant.teamName})` : ""));

    // Member 1: Process if has userId (REGISTERED or persistent GUEST)
    if (participant.userId) {
      await addTournamentRecord(participant.userId, tournamentRecord);
    }

    // Member 2: Build separate record with partner's own ranking
    if (participant.partner.userId) {
      const partnerRankingBefore = participant.partner.rankingSnapshot || 0;
      const partnerRankingAfter = partnerRankingBefore + pointsEarned;
      const partnerRecord: TournamentRecord = {
        ...tournamentRecord,
        rankingBefore: partnerRankingBefore,
        rankingAfter: partnerRankingAfter,
      };
      await addTournamentRecord(participant.partner.userId, partnerRecord);
    }

    return result;
  }

  // SINGLES: Individual participant (all participants with userId)
  // Skip if name looks like a pair team name (contains " / ")
  if (participant.name.includes(" / ")) {
    logger.warn(`Skipping participant "${participant.name}" - looks like a pair team name, not an individual player`);
    return result;
  }

  // Process if has userId (REGISTERED or persistent GUEST)
  if (participant.userId) {
    await addTournamentRecord(participant.userId, tournamentRecord);
  }

  return result;
}

/**
 * Sync a single guest user's name from tournament participant data back to their /users profile.
 * Only updates if the user is a guest (authProvider === null) and not merged.
 */
async function syncSingleGuestName(userId: string, tournamentName: string): Promise<boolean> {
  try {
    const userRef = getDb().collection("users").doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) return false;

    const data = userSnap.data()!;

    // Only update guest users (not Google-authenticated)
    if (data.authProvider !== null && data.authProvider !== undefined) return false;

    // Skip merged guests — the canonical profile is the merge target
    if (data.mergedTo) return false;

    // Skip if name is already the same
    if (data.playerName === tournamentName) return false;

    await userRef.update({
      playerName: tournamentName,
      playerNameLower: tournamentName.toLowerCase(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Synced guest name: "${data.playerName}" → "${tournamentName}" for user ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Error syncing guest name for user ${userId}:`, error);
    return false;
  }
}

/**
 * Sync all guest participant names from tournament data back to their /users profiles.
 * Handles both singles and doubles (including partners).
 */
async function syncGuestNames(
  participants: TournamentParticipant[],
  gameType: "singles" | "doubles"
): Promise<number> {
  const syncPromises: Promise<boolean>[] = [];

  for (const p of participants) {
    // Main participant
    if (p.userId && p.type === "GUEST") {
      syncPromises.push(syncSingleGuestName(p.userId, p.name));
    }

    // Partner in doubles
    if (gameType === "doubles" && p.partner?.userId && p.partner.type === "GUEST") {
      syncPromises.push(syncSingleGuestName(p.partner.userId, p.partner.name));
    }
  }

  if (syncPromises.length === 0) return 0;

  const results = await Promise.allSettled(syncPromises);
  return results.filter((r) => r.status === "fulfilled" && r.value === true).length;
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

    // Skip push notifications for test tournaments
    const isTest = afterData.isTest === true;

    logger.info(`Tournament ${tournamentId} (${afterData.name}) just completed - processing participant results${isTest ? " [TEST]" : ""}`);

    // Sync guest user names back to /users profiles (before ranking guard so it runs even without ranking)
    try {
      const syncCount = await syncGuestNames(afterData.participants, afterData.gameType);
      if (syncCount > 0) {
        logger.info(`Synced ${syncCount} guest name(s) for tournament ${tournamentId}`);
      }
    } catch (error) {
      logger.error("Error syncing guest names:", error);
      // Non-blocking — ranking processing continues regardless
    }

    const rankingEnabled = afterData.rankingConfig?.enabled ?? false;

    // If ranking is disabled, skip all processing
    if (!rankingEnabled) {
      logger.info(`Ranking disabled for tournament ${tournamentId} - skipping participant ranking updates`);
      return;
    }

    const tier: TournamentTier = normalizeTier(afterData.rankingConfig?.tier);

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

        // Note: Points earned can be calculated anytime with calculateRankingPoints(finalPosition, tier)
        // No need to store currentRanking - it's redundant

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

    // Send ranking push notifications to all participants with userId
    // Skip for test tournaments — no need to spam players with test results
    if (!isTest) try {
      // Collect unique userIds with their ranking data
      const userNotifications = new Map<string, { position: number; points: number }>();

      for (const p of activeParticipants) {
        const position = p.finalPosition || 0;
        const points = calculateRankingPoints(position, tier, totalParticipants, afterData.gameType);
        if (points <= 0) continue;

        if (p.userId) {
          userNotifications.set(p.userId, { position, points });
        }
        // Doubles: also notify partner
        if (afterData.gameType === "doubles" && p.partner?.userId) {
          userNotifications.set(p.partner.userId, { position, points });
        }
      }

      if (userNotifications.size > 0) {
        const pushPromises: Promise<void>[] = [];

        for (const [userId, { position, points }] of userNotifications) {
          pushPromises.push(
            (async () => {
              const userData = await getUserPushData(userId);
              const ord = formatOrdinal(position, userData.lang);
              await sendPushToUser(
                userId,
                {
                  title: afterData.name,
                  body: `${ord} ${nt(userData.lang, "place")} · +${points} pts ranking`,
                  url: `/tournaments/${tournamentId}`,
                  tag: "ranking-completed",
                },
                "tournament_ranking",
                userData.prefs
              );
            })()
          );
        }

        await Promise.allSettled(pushPromises);
        logger.info(`Ranking notifications sent to ${userNotifications.size} user(s) for tournament ${tournamentId}`);
      }
    } catch (error) {
      logger.error("Error sending ranking notifications:", error);
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

    // Skip test tournaments
    if (!shouldNotifyTournament(tournamentData)) {
      logger.info(`Skipping notification for test tournament: ${tournamentData.name}`);
      return;
    }

    const tournamentType = tournamentData.isImported ? "IMPORTED" : "LIVE";
    const message = buildTournamentNotificationMessage(tournamentData);

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
        logger.info(`Telegram notification sent for new ${tournamentType} tournament: ${tournamentData.name}`);
      }
    } catch (error) {
      logger.error("Error sending Telegram notification:", error);
    }
  }
);

// ─── Push Notification Helpers ───────────────────────────────────────────────

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Fetch user data needed for push notifications (language + preferences).
 * Single Firestore read per user to avoid duplicate reads.
 */
async function getUserPushData(userId: string): Promise<{
  lang: string;
  prefs: any;
}> {
  const db = getDb();
  const userSnap = await db.collection("users").doc(userId).get();
  const data = userSnap.data();
  const lang = data?.language;
  return {
    lang: lang && ["es", "ca", "en"].includes(lang) ? lang : "es",
    prefs: data?.notificationPreferences,
  };
}

/**
 * Send a push notification to a user across all their registered devices.
 * Automatically cleans up invalid tokens.
 *
 * @param userId Firestore user ID
 * @param notification Push payload
 * @param preferenceKey Which notification preference to check (skipped if undefined)
 * @param prefsOverride Pre-fetched preferences (avoids extra Firestore read)
 * @returns Number of notifications successfully sent
 */
async function sendPushToUser(
  userId: string,
  notification: PushPayload,
  preferenceKey?: string,
  prefsOverride?: any
): Promise<number> {
  const db = getDb();
  const tokensSnap = await db
    .collection("users")
    .doc(userId)
    .collection("fcmTokens")
    .get();

  if (tokensSnap.empty) return 0;

  // Check user notification preferences
  if (preferenceKey) {
    const prefs = prefsOverride !== undefined
      ? prefsOverride
      : (await db.collection("users").doc(userId).get()).data()?.notificationPreferences;

    if (!prefs || !prefs.enabled) {
      logger.info(`Push skipped for ${userId}: notifications disabled or no preferences`);
      return 0;
    }
    if ((prefs as any)[preferenceKey] === false) {
      logger.info(`Push skipped for ${userId}: preference "${preferenceKey}" explicitly disabled`);
      return 0;
    }
  }

  let sent = 0;
  const staleTokenRefs: FirebaseFirestore.DocumentReference[] = [];

  for (const tokenDoc of tokensSnap.docs) {
    try {
      await getMessaging().send({
        token: tokenDoc.data().token,
        data: {
          title: notification.title,
          body: notification.body,
          url: notification.url || "/",
          tag: notification.tag || "",
        },
        webpush: {
          headers: { TTL: "3600" },
        },
      });
      sent++;
    } catch (error: any) {
      if (
        error.code === "messaging/registration-token-not-registered" ||
        error.code === "messaging/invalid-registration-token"
      ) {
        staleTokenRefs.push(tokenDoc.ref);
      } else {
        logger.error(`Error sending push to user ${userId}:`, error);
      }
    }
  }

  // Clean up stale tokens in parallel
  if (staleTokenRefs.length > 0) {
    await Promise.all(staleTokenRefs.map((ref) => ref.delete()));
    logger.info(`Deleted ${staleTokenRefs.length} invalid FCM token(s) for user ${userId}`);
  }

  return sent;
}

// ─── Notification i18n ──────────────────────────────────────────────────────

const notificationStrings: Record<string, Record<string, string>> = {
  es: {
    groupPhase: "Fase de Grupos",
    finalPhase: "Fase Final",
    consolation: "Consolación",
    round: "Ronda",
    table: "Mesa",
    youVs: "Tú vs.",
    youAndPartnerVs: "Tú y {partner} vs.",
    thirdPlace: "3er/4to puesto",
    place: "puesto",
    inviteAccepted: "Invitación aceptada",
    inviteDeclined: "Invitación rechazada",
    acceptedYourInvite: "ha aceptado tu invitación",
    declinedYourInvite: "ha rechazado tu invitación",
  },
  ca: {
    groupPhase: "Fase de Grups",
    finalPhase: "Fase Final",
    consolation: "Consolació",
    round: "Ronda",
    table: "Taula",
    youVs: "Tu vs.",
    youAndPartnerVs: "Tu i {partner} vs.",
    thirdPlace: "3r/4t lloc",
    place: "lloc",
    inviteAccepted: "Invitació acceptada",
    inviteDeclined: "Invitació rebutjada",
    acceptedYourInvite: "ha acceptat la teva invitació",
    declinedYourInvite: "ha rebutjat la teva invitació",
  },
  en: {
    groupPhase: "Group Stage",
    finalPhase: "Finals",
    consolation: "Consolation",
    round: "Round",
    table: "Table",
    youVs: "You vs.",
    youAndPartnerVs: "You & {partner} vs.",
    thirdPlace: "3rd/4th place",
    place: "place",
    inviteAccepted: "Invite accepted",
    inviteDeclined: "Invite declined",
    acceptedYourInvite: "accepted your invitation",
    declinedYourInvite: "declined your invitation",
  },
};

/**
 * Format a position number as an ordinal string per language.
 * es: 1º, 2º, 3º  |  ca: 1r, 2n, 3r, 4t, 5è  |  en: 1st, 2nd, 3rd, 4th
 */
function formatOrdinal(n: number, lang: string): string {
  if (lang === "en") {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  if (lang === "ca") {
    if (n === 1) return "1r";
    if (n === 2) return "2n";
    if (n === 3) return "3r";
    if (n === 4) return "4t";
    return n + "è";
  }
  // es (default)
  return n + "º";
}

function nt(lang: string, key: string): string {
  return notificationStrings[lang]?.[key] || notificationStrings["es"][key] || key;
}

// ─── Match structures for diffing ───────────────────────────────────────────

interface MatchLike {
  id: string;
  participantA?: string;
  participantB?: string;
  tableNumber?: number;
  status: string;
  // Notification context
  phase: "GROUP" | "FINAL" | "CONSOLATION";
  groupId?: string;
  groupName?: string;
  roundNumber?: number;
  roundName?: string;
  bracketLabel?: string;
  isThirdPlace?: boolean;
}

/**
 * Extract all matches from a tournament document (groups + brackets)
 * with notification context metadata (phase, group, round, bracket).
 */
function extractAllMatches(data: any): MatchLike[] {
  const matches: MatchLike[] = [];
  const multipleGroups = (data.groupStage?.groups?.length || 0) > 1;

  // Pick only the fields we need from a match object
  function pickMatchFields(m: any): Pick<MatchLike, "id" | "participantA" | "participantB" | "tableNumber" | "status"> {
    return {
      id: m.id,
      participantA: m.participantA,
      participantB: m.participantB,
      tableNumber: m.tableNumber,
      status: m.status,
    };
  }

  // Group stage matches
  if (data.groupStage?.groups) {
    for (const group of data.groupStage.groups) {
      for (const round of [...(group.schedule || []), ...(group.pairings || [])]) {
        for (const match of round.matches || []) {
          matches.push({
            ...pickMatchFields(match),
            phase: "GROUP",
            groupId: group.id,
            groupName: multipleGroups ? group.name : undefined,
            roundNumber: round.roundNumber,
          });
        }
      }
    }
  }

  // Helper to extract matches from a BracketWithConfig
  function extractBracket(
    bracket: any,
    phase: "FINAL" | "CONSOLATION",
    bracketLabel?: string
  ) {
    if (!bracket) return;
    for (const round of bracket.rounds || []) {
      for (const match of round.matches || []) {
        matches.push({
          ...pickMatchFields(match),
          phase,
          roundName: round.name,
          bracketLabel,
        });
      }
    }
    if (bracket.thirdPlaceMatch) {
      matches.push({
        ...pickMatchFields(bracket.thirdPlaceMatch),
        phase,
        isThirdPlace: true,
        bracketLabel,
      });
    }
    // Consolation brackets nested inside this bracket
    if (bracket.consolationBrackets) {
      for (const cb of bracket.consolationBrackets) {
        extractBracket(cb, "CONSOLATION", bracketLabel);
      }
    }
  }

  // Final stage - Gold bracket (always present)
  if (data.finalStage?.goldBracket) {
    extractBracket(data.finalStage.goldBracket, "FINAL");
  }

  // Final stage - Silver bracket (SPLIT_DIVISIONS mode)
  if (data.finalStage?.silverBracket) {
    extractBracket(data.finalStage.silverBracket, "FINAL", "Plata");
  }

  // Final stage - Parallel brackets (A/B/C Finals)
  if (data.finalStage?.parallelBrackets) {
    for (const nb of data.finalStage.parallelBrackets) {
      extractBracket(nb.bracket, "FINAL", nb.name);
    }
  }

  return matches;
}

/**
 * Cloud Function: Send push notification when a table is assigned to a match.
 * Detects new table assignments by comparing before/after tournament data.
 */
export const onTournamentMatchEvent = onDocumentUpdated(
  {
    document: "tournaments/{tournamentId}",
    region: "europe-west1",
  },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

    // Skip push notifications for test tournaments
    if (afterData.isTest === true) return;

    // Only process during active tournament phases
    const activeStatuses = ["GROUP_STAGE", "FINAL_STAGE", "TRANSITION"];
    if (!activeStatuses.includes(afterData.status)) return;

    // --- Detect new table assignments ---
    const beforeMatches = extractAllMatches(beforeData);
    const afterMatches = extractAllMatches(afterData);

    // Build map of before-state for quick lookup
    const beforeMap = new Map<string, MatchLike>();
    for (const m of beforeMatches) {
      beforeMap.set(m.id, m);
    }

    // Find PENDING matches where tableNumber was just assigned (undefined → number)
    // Skip BYE matches — participants advance automatically without playing
    const newlyAssigned: MatchLike[] = [];
    for (const after of afterMatches) {
      if (!after.tableNumber) continue;
      if (after.status !== "PENDING") continue;
      if (after.participantA === "BYE" || after.participantB === "BYE") continue;
      const before = beforeMap.get(after.id);
      if (before && before.tableNumber) continue;
      newlyAssigned.push(after);
    }

    // --- For Round Robin, only notify for matches in the current playable round ---
    // A round is playable if all matches in the previous round are COMPLETED or WALKOVER.
    // Two cases trigger notifications:
    //   1) Table just assigned to a match in the current playable round
    //   2) A round just became unlocked (last match of previous round completed),
    //      so we notify all PENDING matches in that newly playable round that already have tables
    const isRoundRobin = afterData.status === "GROUP_STAGE" &&
      afterData.groupStage?.type === "ROUND_ROBIN";

    // For non-RR tournaments, early exit if no new table assignments
    if (!isRoundRobin && newlyAssigned.length === 0) return;

    // Helper: find the first round with incomplete matches for each group
    function getPlayableRounds(data: any): Map<string, number> {
      const result = new Map<string, number>();
      if (!data.groupStage?.groups) return result;
      for (const group of data.groupStage.groups) {
        if (!group.schedule) continue;
        const sortedRounds = [...group.schedule].sort(
          (a: any, b: any) => (a.roundNumber || 0) - (b.roundNumber || 0)
        );
        for (const round of sortedRounds) {
          const matches = Array.isArray(round.matches) ? round.matches : Object.values(round.matches || {});
          const hasIncomplete = matches.some(
            (m: any) => m.status !== "COMPLETED" && m.status !== "WALKOVER"
          );
          if (hasIncomplete) {
            result.set(group.id, round.roundNumber);
            break;
          }
        }
      }
      return result;
    }

    let matchesToNotify: MatchLike[] = [];

    if (isRoundRobin) {
      const beforePlayable = getPlayableRounds(beforeData);
      const afterPlayable = getPlayableRounds(afterData);

      // Case 1: newly assigned matches in the current playable round
      for (const m of newlyAssigned) {
        if (m.phase !== "GROUP") {
          matchesToNotify.push(m);
          continue;
        }
        const currentRound = afterPlayable.get(m.groupId || "");
        if (currentRound === undefined || m.roundNumber === currentRound) {
          matchesToNotify.push(m);
        }
      }

      // Case 2: a round just became unlocked (playable round advanced)
      // Find groups where the playable round changed
      for (const [groupId, afterRound] of afterPlayable) {
        const beforeRound = beforePlayable.get(groupId);
        if (beforeRound !== undefined && afterRound > beforeRound) {
          // Round advanced! Notify all PENDING matches in the new playable round
          // that already have table assignments (they were assigned earlier but not notified)
          for (const m of afterMatches) {
            if (m.phase !== "GROUP" || m.groupId !== groupId) continue;
            if (m.roundNumber !== afterRound) continue;
            if (m.status !== "PENDING") continue;
            if (!m.tableNumber) continue;
            if (m.participantA === "BYE" || m.participantB === "BYE") continue;
            // Don't duplicate if already in matchesToNotify (from case 1)
            if (matchesToNotify.some((n) => n.id === m.id)) continue;
            matchesToNotify.push(m);
          }
          logger.info(
            `RR round unlocked: group ${groupId} advanced from round ${beforeRound} → ${afterRound}`
          );
        }
      }

      if (matchesToNotify.length !== newlyAssigned.length) {
        logger.info(
          `RR round filter: ${newlyAssigned.length} newly assigned → ${matchesToNotify.length} to notify`
        );
      }
    } else {
      matchesToNotify = newlyAssigned;
    }

    if (matchesToNotify.length === 0) return;

    // Build participant lookup (including partner info for doubles)
    const participants = afterData.participants || [];
    const participantMap = new Map<
      string,
      {
        name: string;
        userId?: string;
        displayName: string;
        teamName?: string;
        partner?: { name: string; userId?: string };
      }
    >();
    for (const p of participants) {
      const hasPartner = p.partner && p.partner.name;
      participantMap.set(p.id, {
        name: p.name,
        userId: p.userId,
        displayName: hasPartner
          ? p.teamName || `${p.name} / ${p.partner.name}`
          : p.name,
        teamName: hasPartner ? p.teamName : undefined,
        partner: hasPartner
          ? { name: p.partner.name, userId: p.partner.userId }
          : undefined,
      });
    }

    const tournamentKey = afterData.key || event.params.tournamentId;

    // Build localized notification for a specific user language
    // teamInfo: for doubles, provides teamName or partnerName for "your side" label
    function buildNotification(
      match: MatchLike,
      lang: string,
      opponentName: string,
      teamInfo?: { teamName?: string; partnerName?: string }
    ) {
      let title: string;
      if (match.phase === "GROUP") {
        const parts = [nt(lang, "groupPhase")];
        if (match.groupName) parts.push(match.groupName);
        parts.push(`${nt(lang, "round")} ${match.roundNumber}`);
        title = parts.join(" · ");
      } else if (match.phase === "CONSOLATION") {
        const parts = [nt(lang, "consolation")];
        if (match.isThirdPlace) {
          parts.push(nt(lang, "thirdPlace"));
        } else if (match.roundName) {
          parts.push(match.roundName);
        }
        title = parts.join(" · ");
      } else {
        // FINAL
        const parts = [nt(lang, "finalPhase")];
        if (match.bracketLabel) parts.push(match.bracketLabel);
        if (match.isThirdPlace) {
          parts.push(nt(lang, "thirdPlace"));
        } else if (match.roundName) {
          parts.push(match.roundName);
        }
        title = parts.join(" · ");
      }

      // Doubles: "{TeamName} vs. Opponent" or "Tú y Partner vs. Opponent"
      // Singles: "Tú vs. Opponent"
      let yourSide: string;
      if (teamInfo?.teamName) {
        yourSide = teamInfo.teamName;
      } else if (teamInfo?.partnerName) {
        yourSide = nt(lang, "youAndPartnerVs").replace("{partner}", teamInfo.partnerName);
      } else {
        yourSide = nt(lang, "youVs");
      }

      const body = teamInfo?.teamName
        ? `${nt(lang, "table")} ${match.tableNumber}: ${yourSide} vs. ${opponentName}`
        : `${nt(lang, "table")} ${match.tableNumber}: ${yourSide} ${opponentName}`;

      return {
        title,
        body,
        url: `/game?key=${tournamentKey}`,
        tag: `match-ready-${match.id}`,
      };
    }

    // Send push notifications for all newly assigned matches in parallel
    const sendPromises: Promise<void>[] = [];

    for (const match of matchesToNotify) {
      const pA = participantMap.get(match.participantA || "");
      const pB = participantMap.get(match.participantB || "");

      if (!pA || !pB) {
        logger.warn(
          `Match ${match.id}: participant not found in map — ` +
          `A="${match.participantA}" (${pA ? "ok" : "MISSING"}), ` +
          `B="${match.participantB}" (${pB ? "ok" : "MISSING"})`
        );
        continue;
      }

      sendPromises.push(
        (async () => {
          // Collect all userIds to notify (primary + partners for doubles)
          const teamA: { userId: string; role: string }[] = [];
          if (pA.userId) teamA.push({ userId: pA.userId, role: "primary" });
          if (pA.partner?.userId)
            teamA.push({ userId: pA.partner.userId, role: "partner" });

          const teamB: { userId: string; role: string }[] = [];
          if (pB.userId) teamB.push({ userId: pB.userId, role: "primary" });
          if (pB.partner?.userId)
            teamB.push({ userId: pB.partner.userId, role: "partner" });

          // Fetch user data for all players in parallel
          const allUserIds = [...teamA, ...teamB].map((u) => u.userId);
          const userDataResults = await Promise.all(
            allUserIds.map((uid) => getUserPushData(uid))
          );
          const userDataMap = new Map<
            string,
            { lang: string; prefs: any } | null
          >();
          allUserIds.forEach((uid, i) => userDataMap.set(uid, userDataResults[i]));

          // Build team info for doubles notifications
          const teamInfoA = pA.partner
            ? { teamName: pA.teamName, partnerName: pA.partner.name }
            : undefined;
          const teamInfoB = pB.partner
            ? { teamName: pB.teamName, partnerName: pB.partner.name }
            : undefined;

          // Send pushes in parallel — use displayName for opponent
          const pushes: Promise<number>[] = [];
          for (const member of teamA) {
            const data = userDataMap.get(member.userId);
            if (data) {
              // For the partner, swap partnerName to show the primary player's name
              const info = teamInfoA
                ? {
                    teamName: teamInfoA.teamName,
                    partnerName:
                      member.role === "partner" ? pA.name : teamInfoA.partnerName,
                  }
                : undefined;
              pushes.push(
                sendPushToUser(
                  member.userId,
                  buildNotification(match, data.lang, pB.displayName, info),
                  "tournament_matchReady",
                  data.prefs
                )
              );
            }
          }
          for (const member of teamB) {
            const data = userDataMap.get(member.userId);
            if (data) {
              const info = teamInfoB
                ? {
                    teamName: teamInfoB.teamName,
                    partnerName:
                      member.role === "partner" ? pB.name : teamInfoB.partnerName,
                  }
                : undefined;
              pushes.push(
                sendPushToUser(
                  member.userId,
                  buildNotification(match, data.lang, pA.displayName, info),
                  "tournament_matchReady",
                  data.prefs
                )
              );
            }
          }
          await Promise.all(pushes);

          const sampleNotif = buildNotification(match, "es", "opponent");
          logger.info(
            `Push sent for match ${match.id} (${match.phase}): ` +
            `${pA.displayName} vs ${pB.displayName} at table ${match.tableNumber} — ` +
            `title="${sampleNotif.title}", body="${sampleNotif.body}"`
          );
        })()
      );
    }

    await Promise.all(sendPromises);
  }
);

// ─── Tournament Registration Notifications ──────────────────────────────────

export const onTournamentRegistration = onDocumentUpdated(
  { document: "tournaments/{tournamentId}", region: "europe-west1" },
  async (event) => {
    const beforeData = event.data?.before.data() as Record<string, any> | undefined;
    const afterData = event.data?.after.data() as Record<string, any> | undefined;
    if (!beforeData || !afterData) return;

    // Only process if registration notifications are enabled
    if (!afterData.registration?.notifyOnRegistration) return;

    // Only process DRAFT tournaments
    if (afterData.status !== "DRAFT") return;

    const tournamentId = event.params.tournamentId;
    const tournamentName: string = afterData.name || "Tournament";

    const beforeParticipants: any[] = beforeData.participants || [];
    const afterParticipants: any[] = afterData.participants || [];
    const beforeWaitlist: any[] = beforeData.waitlist || [];
    const afterWaitlist: any[] = afterData.waitlist || [];

    const adminIds: string[] = [
      afterData.ownerId,
      ...(afterData.adminIds || [])
    ].filter(Boolean) as string[];

    // New participant registered (direct self-registration)
    const newDirectParticipants = detectNewParticipants(beforeParticipants, afterParticipants)
      .filter(p => !detectPromotedFromWaitlist(beforeParticipants, afterParticipants, beforeWaitlist).some(pr => pr.id === p.id));

    if (newDirectParticipants.length > 0) {
      const newParticipant = newDirectParticipants[0];
      const playerName: string = (newParticipant?.name as string) || "Jugador";
      const countDisplay = afterData.registration?.maxParticipants
        ? `${afterParticipants.length}/${afterData.registration.maxParticipants}`
        : `${afterParticipants.length}`;

      for (const adminId of adminIds) {
        await sendPushToUser(adminId, {
          title: tournamentName,
          body: `Nuevo inscrito: ${playerName} (${countDisplay})`,
          url: `/admin/tournaments/${tournamentId}`,
        });
      }
    }

    // New waitlist entry
    const newWaitlistEntries = detectNewWaitlistEntries(beforeWaitlist, afterWaitlist);
    if (newWaitlistEntries.length > 0) {
      const newEntry = newWaitlistEntries[0];
      const entryName: string = (newEntry?.userName as string) || "Jugador";

      for (const adminId of adminIds) {
        await sendPushToUser(adminId, {
          title: tournamentName,
          body: `Lista de espera: ${entryName}`,
          url: `/admin/tournaments/${tournamentId}`,
        });
      }
    }

    // User promoted from waitlist (unregister + auto-promote) — notify the promoted user
    const promotedParticipants = detectPromotedFromWaitlist(beforeParticipants, afterParticipants, beforeWaitlist);
    for (const promoted of promotedParticipants) {
      if (promoted.userId) {
        await sendPushToUser(promoted.userId as string, {
          title: `¡Tu plaza está confirmada en ${tournamentName}!`,
          body: `Has sido promovido de la lista de espera. ¡Nos vemos en el torneo!`,
          url: `/tournaments/${afterData.key || tournamentId}`,
          tag: `registration-promoted-${tournamentId}`,
        });
      }
    }
  }
);

// ─── Friendly Match Invite Response Notification ────────────────────────────

/**
 * Cloud Function: Send push notification when a friendly match invite is accepted or declined.
 * Triggers on matchInvites/{inviteId} document updates.
 * Notifies the HOST when the guest responds to their invitation.
 */
export const onInviteResponse = onDocumentUpdated(
  {
    document: "matchInvites/{inviteId}",
    region: "europe-west1",
  },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

    // Only trigger when status changes from 'pending' to 'accepted' or 'declined'
    if (beforeData.status !== "pending") return;
    if (afterData.status !== "accepted" && afterData.status !== "declined") return;

    const hostUserId = afterData.hostUserId as string;
    const guestName = (afterData.guestUserName as string) || "?";
    const accepted = afterData.status === "accepted";

    logger.info(
      `Invite ${event.params.inviteId} ${afterData.status} by ${guestName} — notifying host ${hostUserId}`
    );

    try {
      const userData = await getUserPushData(hostUserId);
      const titleKey = accepted ? "inviteAccepted" : "inviteDeclined";
      const bodyKey = accepted ? "acceptedYourInvite" : "declinedYourInvite";

      await sendPushToUser(
        hostUserId,
        {
          title: nt(userData.lang, titleKey),
          body: `${guestName} ${nt(userData.lang, bodyKey)}`,
          url: "/game",
          tag: `invite-response-${event.params.inviteId}`,
        },
        "friendly_inviteResponse",
        userData.prefs
      );
    } catch (error) {
      logger.error("Error sending invite response notification:", error);
    }
  }
);

/**
 * Weekly cleanup of expired matchInvites.
 * Runs every Sunday at 4:00 AM (Europe/Madrid).
 * Deletes all invites whose expiresAt has passed.
 */
export const cleanupExpiredInvites = onSchedule(
  { schedule: "0 4 * * 0", timeZone: "Europe/Madrid" },
  async () => {
    const db = getDb();
    const now = Timestamp.now();

    const expiredSnap = await db
      .collection("matchInvites")
      .where("expiresAt", "<", now)
      .get();

    if (expiredSnap.empty) {
      logger.info("No expired invites to clean up");
      return;
    }

    // Firestore batches support max 500 operations
    const batches: FirebaseFirestore.WriteBatch[] = [];
    let batch = db.batch();
    let count = 0;

    for (const doc of expiredSnap.docs) {
      batch.delete(doc.ref);
      count++;
      if (count % 500 === 0) {
        batches.push(batch);
        batch = db.batch();
      }
    }
    batches.push(batch);

    await Promise.all(batches.map((b) => b.commit()));
    logger.info(`Cleaned up ${count} expired matchInvites`);
  }
);

/**
 * Disable a user account (admin only).
 * Disables Firebase Auth + marks Firestore profile as disabled.
 * Revokes refresh tokens for immediate session invalidation.
 */
export const disableUser = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const callerUid = request.auth.uid;
    const { userId } = request.data as { userId: string };

    if (!userId || typeof userId !== "string") {
      throw new HttpsError("invalid-argument", "userId is required");
    }

    if (userId === callerUid) {
      throw new HttpsError("invalid-argument", "Cannot disable your own account");
    }

    // Validate caller is super admin
    const db = getDb();
    const callerDoc = await db.collection("users").doc(callerUid).get();
    if (!callerDoc.exists || !callerDoc.data()?.isSuperAdmin) {
      throw new HttpsError("permission-denied", "Super admin access required");
    }

    // Rate limit: protects against a compromised super-admin mass-disabling users
    await enforceRateLimit(db, callerUid, "disableUser");

    // Verify target user has a Firestore profile
    const targetDoc = await db.collection("users").doc(userId).get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "User profile not found");
    }

    // Idempotency guard: no-op if already disabled (prevents audit-trail overwrite)
    if (targetDoc.data()?.disabled) {
      return { success: true };
    }

    try {
      const auth = getAuth();
      await auth.updateUser(userId, { disabled: true });
      // Revoke refresh tokens so existing sessions are immediately invalidated
      await auth.revokeRefreshTokens(userId);

      // Mark in Firestore
      await db.collection("users").doc(userId).update({
        disabled: true,
        disabledAt: FieldValue.serverTimestamp(),
        disabledBy: callerUid,
      });

      logger.info(`User ${userId} disabled by admin ${callerUid}`);
      return { success: true };
    } catch (error: any) {
      logger.error(`Failed to disable user ${userId}:`, error);
      if (error?.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "User not found in Firebase Auth");
      }
      throw new HttpsError("internal", "Failed to disable user");
    }
  }
);

/**
 * Re-enable a previously disabled user account (admin only).
 */
export const enableUser = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const callerUid = request.auth.uid;
    const { userId } = request.data as { userId: string };

    if (!userId || typeof userId !== "string") {
      throw new HttpsError("invalid-argument", "userId is required");
    }

    // Validate caller is super admin
    const db = getDb();
    const callerDoc = await db.collection("users").doc(callerUid).get();
    if (!callerDoc.exists || !callerDoc.data()?.isSuperAdmin) {
      throw new HttpsError("permission-denied", "Super admin access required");
    }

    // Rate limit: symmetrical with disableUser to cap bulk account state changes
    await enforceRateLimit(db, callerUid, "enableUser");

    // Idempotency guard: verify target exists and is actually disabled
    const targetDoc = await db.collection("users").doc(userId).get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "User profile not found");
    }
    if (!targetDoc.data()?.disabled) {
      return { success: true }; // Already enabled — idempotent no-op
    }

    try {
      const auth = getAuth();
      await auth.updateUser(userId, { disabled: false });
      // No revokeRefreshTokens needed — tokens were already revoked when the account was disabled.

      // Clear disabled flags in Firestore
      await db.collection("users").doc(userId).update({
        disabled: false,
        disabledAt: FieldValue.delete(),
        disabledBy: FieldValue.delete(),
      });

      logger.info(`User ${userId} re-enabled by admin ${callerUid}`);
      return { success: true };
    } catch (error: any) {
      logger.error(`Failed to enable user ${userId}:`, error);
      if (error?.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "User not found in Firebase Auth");
      }
      throw new HttpsError("internal", "Failed to enable user");
    }
  }
);

