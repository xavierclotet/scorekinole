"use strict";
/**
 * Cloud Functions for Scorekinole
 * Handles tournament completion and user profile updates
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.onTournamentComplete = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const core_1 = require("firebase-functions/v2/core");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
// Deferred initialization using onInit() to avoid deployment timeouts
let db = null;
(0, core_1.onInit)(() => {
    if ((0, app_1.getApps)().length === 0) {
        (0, app_1.initializeApp)();
    }
    db = (0, firestore_2.getFirestore)();
});
function getDb() {
    if (!db) {
        // Fallback in case onInit hasn't run yet
        if ((0, app_1.getApps)().length === 0) {
            (0, app_1.initializeApp)();
        }
        db = (0, firestore_2.getFirestore)();
    }
    return db;
}
// Tier base points
const TIER_BASE_POINTS = {
    CLUB: 15,
    REGIONAL: 25,
    NATIONAL: 40,
    MAJOR: 50,
};
/**
 * Calculate ranking points based on position and tier
 */
function calculateRankingPoints(position, tier) {
    const basePoints = TIER_BASE_POINTS[tier];
    if (position === 1)
        return basePoints;
    if (position === 2)
        return Math.round(basePoints * 0.9);
    if (position === 3)
        return Math.round(basePoints * 0.8);
    if (position === 4)
        return Math.round(basePoints * 0.7);
    const points = basePoints - (position + 2);
    return points > 1 ? points : 1;
}
/**
 * Get or create a user by name
 */
async function getOrCreateUserByName(name) {
    try {
        const usersRef = getDb().collection("users");
        const snapshot = await usersRef.where("playerName", "==", name).get();
        if (!snapshot.empty) {
            const existingDoc = snapshot.docs[0];
            firebase_functions_1.logger.info(`Found existing user "${name}" with ID: ${existingDoc.id}`);
            return { userId: existingDoc.id, created: false };
        }
        // Create new GUEST user
        const newUserData = {
            playerName: name,
            email: null,
            photoURL: null,
            authProvider: null,
            tournaments: [],
            createdAt: firestore_2.FieldValue.serverTimestamp(),
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        };
        const newDocRef = await usersRef.add(newUserData);
        firebase_functions_1.logger.info(`Created new GUEST user "${name}" with ID: ${newDocRef.id}`);
        return { userId: newDocRef.id, created: true };
    }
    catch (error) {
        firebase_functions_1.logger.error("Error in getOrCreateUserByName:", error);
        return null;
    }
}
/**
 * Add tournament record to user profile
 * Note: Ranking is calculated from tournaments, not stored separately
 */
async function addTournamentRecord(userId, record) {
    try {
        const userRef = getDb().collection("users").doc(userId);
        const userSnap = await userRef.get();
        // Check for duplicates
        if (userSnap.exists) {
            const profile = userSnap.data();
            const existingRecord = profile.tournaments?.find((t) => t.tournamentId === record.tournamentId);
            if (existingRecord) {
                firebase_functions_1.logger.info(`Tournament ${record.tournamentId} already in user ${userId} history - skipping`);
                return true;
            }
        }
        await userRef.set({
            tournaments: firestore_2.FieldValue.arrayUnion(record),
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        }, { merge: true });
        firebase_functions_1.logger.info(`Added tournament record for user ${userId}: +${record.rankingDelta} points`);
        return true;
    }
    catch (error) {
        firebase_functions_1.logger.error("Error adding tournament record:", error);
        return false;
    }
}
/**
 * Get pair by ID
 */
async function getPairById(pairId) {
    try {
        const pairRef = getDb().collection("pairs").doc(pairId);
        const pairSnap = await pairRef.get();
        if (pairSnap.exists) {
            return pairSnap.data();
        }
        return null;
    }
    catch (error) {
        firebase_functions_1.logger.error("Error getting pair:", error);
        return null;
    }
}
/**
 * Add tournament record to pair's history
 */
async function addPairTournamentRecord(pairId, record) {
    try {
        const pairRef = getDb().collection("pairs").doc(pairId);
        const pairSnap = await pairRef.get();
        // Check for duplicates
        if (pairSnap.exists) {
            const pair = pairSnap.data();
            const existingRecord = pair?.tournaments?.find((t) => t.tournamentId === record.tournamentId);
            if (existingRecord) {
                firebase_functions_1.logger.info(`Tournament ${record.tournamentId} already in pair ${pairId} history - skipping`);
                return true;
            }
        }
        await pairRef.set({
            tournaments: firestore_2.FieldValue.arrayUnion(record),
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        }, { merge: true });
        firebase_functions_1.logger.info(`Added tournament record to pair ${pairId}`);
        return true;
    }
    catch (error) {
        firebase_functions_1.logger.error("Error adding pair tournament record:", error);
        return false;
    }
}
/**
 * Process a single participant and add tournament record to their profile
 */
async function processParticipant(participant, tournament, tier, totalParticipants, rankingEnabled) {
    const position = participant.finalPosition || 0;
    const pointsEarned = rankingEnabled ? calculateRankingPoints(position, tier) : 0;
    const rankingBefore = participant.rankingSnapshot || 0;
    const rankingAfter = rankingBefore + pointsEarned;
    const tournamentRecord = {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        tournamentDate: tournament.completedAt || Date.now(),
        finalPosition: position,
        totalParticipants,
        rankingBefore,
        rankingAfter,
        rankingDelta: pointsEarned,
    };
    // NEW: Handle pair participants
    if (participant.participantMode === "pair" && participant.pairId) {
        firebase_functions_1.logger.info(`Processing pair participant: ${participant.pairId}`);
        // Add record to pair's history
        const pairRecord = {
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
            let member1UserId = null;
            if (pair.member1Type === "REGISTERED" && pair.member1UserId && !pair.member1UserId.startsWith("pair_")) {
                member1UserId = pair.member1UserId;
            }
            else {
                const result = await getOrCreateUserByName(pair.member1Name);
                if (result) {
                    member1UserId = result.userId;
                }
            }
            if (member1UserId) {
                await addTournamentRecord(member1UserId, tournamentRecord);
            }
            // Member 2
            let member2UserId = null;
            if (pair.member2Type === "REGISTERED" && pair.member2UserId && !pair.member2UserId.startsWith("pair_")) {
                member2UserId = pair.member2UserId;
            }
            else {
                const result = await getOrCreateUserByName(pair.member2Name);
                if (result) {
                    member2UserId = result.userId;
                }
            }
            if (member2UserId) {
                await addTournamentRecord(member2UserId, tournamentRecord);
            }
        }
        return;
    }
    // DOUBLES: Process both members using their REAL names
    // participant.name = Player 1's real name (always)
    // participant.partner.name = Player 2's real name (always)
    // participant.teamName = Optional artistic name (ignored for ranking)
    if (tournament.gameType === "doubles" && participant.partner) {
        firebase_functions_1.logger.info(`Processing doubles participant: ${participant.name} / ${participant.partner.name}` +
            (participant.teamName ? ` (team: ${participant.teamName})` : ""));
        // Member 1: Use userId if REGISTERED, otherwise use real name
        let member1UserId = null;
        if (participant.type === "REGISTERED" && participant.userId) {
            member1UserId = participant.userId;
        }
        else {
            // participant.name always contains the real name now
            const result = await getOrCreateUserByName(participant.name);
            if (result) {
                member1UserId = result.userId;
            }
        }
        if (member1UserId) {
            await addTournamentRecord(member1UserId, tournamentRecord);
        }
        // Member 2: Use userId if REGISTERED, otherwise use real name
        let member2UserId = null;
        if (participant.partner.type === "REGISTERED" && participant.partner.userId) {
            member2UserId = participant.partner.userId;
        }
        else {
            // partner.name always contains the real name
            const result = await getOrCreateUserByName(participant.partner.name);
            if (result) {
                member2UserId = result.userId;
            }
        }
        if (member2UserId) {
            await addTournamentRecord(member2UserId, tournamentRecord);
        }
        return;
    }
    // SINGLES: Individual participant
    // Skip if name looks like a pair team name (contains " / ")
    if (participant.name.includes(" / ")) {
        firebase_functions_1.logger.warn(`Skipping participant "${participant.name}" - looks like a pair team name, not an individual player`);
        return;
    }
    let userId = null;
    if (participant.type === "REGISTERED" && participant.userId) {
        userId = participant.userId;
    }
    else {
        const result = await getOrCreateUserByName(participant.name);
        if (result) {
            userId = result.userId;
        }
    }
    if (userId) {
        await addTournamentRecord(userId, tournamentRecord);
    }
}
/**
 * Cloud Function: Trigger when tournament status changes to COMPLETED
 */
exports.onTournamentComplete = (0, firestore_1.onDocumentUpdated)({
    document: "tournaments/{tournamentId}",
    region: "europe-west1",
}, async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const tournamentId = event.params.tournamentId;
    if (!beforeData || !afterData) {
        firebase_functions_1.logger.warn("Missing data in tournament update event");
        return;
    }
    // Only trigger when status changes TO COMPLETED
    if (beforeData.status === "COMPLETED" || afterData.status !== "COMPLETED") {
        return;
    }
    firebase_functions_1.logger.info(`Tournament ${tournamentId} (${afterData.name}) just completed - processing participant results`);
    const rankingEnabled = afterData.rankingConfig?.enabled ?? false;
    // If ranking is disabled, skip all processing
    if (!rankingEnabled) {
        firebase_functions_1.logger.info(`Ranking disabled for tournament ${tournamentId} - skipping participant ranking updates`);
        return;
    }
    const tier = afterData.rankingConfig?.tier || "CLUB";
    const activeParticipants = afterData.participants.filter((p) => p.status === "ACTIVE" && p.finalPosition);
    const totalParticipants = afterData.participants.filter((p) => p.status === "ACTIVE").length;
    firebase_functions_1.logger.info(`Processing ${activeParticipants.length} participants with final positions (tier: ${tier})`);
    // Add tournamentId to the tournament object (not included in document data)
    const tournamentWithId = { ...afterData, id: tournamentId };
    // Process all participants (only runs if ranking is enabled)
    const results = await Promise.allSettled(activeParticipants.map((p) => processParticipant(p, tournamentWithId, tier, totalParticipants, true)));
    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    firebase_functions_1.logger.info(`Tournament ${tournamentId} processing complete: ${successful} successful, ${failed} failed`);
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
        await getDb().collection("tournaments").doc(tournamentId).update({
            participants: updatedParticipants,
        });
        firebase_functions_1.logger.info(`Updated participant rankings in tournament ${tournamentId}`);
    }
    catch (error) {
        firebase_functions_1.logger.error("Error updating tournament participants:", error);
    }
});
//# sourceMappingURL=index.js.map