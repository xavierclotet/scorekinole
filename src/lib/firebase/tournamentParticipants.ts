/**
 * Tournament participant management
 */

import { getTournament, updateTournament } from './tournaments';
import type { TournamentParticipant } from '$lib/types/tournament';

/**
 * Add participant to tournament
 *
 * @param tournamentId Tournament ID
 * @param participantData Participant data
 * @returns true if successful
 */
export async function addParticipant(
  tournamentId: string,
  participantData: Partial<TournamentParticipant>
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (tournament.status !== 'DRAFT') {
    console.error('Cannot add participants to tournament that is not in DRAFT status');
    return false;
  }

  // Ranking will be fetched when tournament starts via syncParticipantRankings
  // For now, just use default (0)
  const ranking = 0;

  // Preserve all fields from participantData, only override defaults
  const participant: TournamentParticipant = {
    ...participantData,
    id: participantData.id || `participant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    type: participantData.type || 'GUEST',
    name: participantData.name || 'Participante',
    rankingSnapshot: ranking,
    currentRanking: ranking,
    status: 'ACTIVE'
  } as TournamentParticipant;

  const updatedParticipants = [...tournament.participants, participant];

  return await updateTournament(tournamentId, {
    participants: updatedParticipants
  });
}

/**
 * Add multiple participants to tournament in a single operation
 *
 * @param tournamentId Tournament ID
 * @param participantsData Array of participant data
 * @returns true if successful
 */
export async function addParticipants(
  tournamentId: string,
  participantsData: Partial<TournamentParticipant>[]
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (tournament.status !== 'DRAFT') {
    console.error('Cannot add participants to tournament that is not in DRAFT status');
    return false;
  }

  // Ranking will be fetched when tournament starts via syncParticipantRankings
  // For now, just use default (0)
  const ranking = 0;

  // Create all participant objects, preserving all fields from participantData
  console.log('📥 addParticipants received:', participantsData.map(p => ({
    name: p.name,
    photoURL: p.photoURL,
    partnerPhotoURL: p.partnerPhotoURL,
    participantMode: p.participantMode,
    pairId: p.pairId
  })));

  const newParticipants = participantsData.map((participantData, index) => {
    const participant: TournamentParticipant = {
      ...participantData,
      id: participantData.id || `participant-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
      type: participantData.type || 'GUEST',
      name: participantData.name || 'Participante',
      rankingSnapshot: ranking,
      currentRanking: ranking,
      status: 'ACTIVE'
    } as TournamentParticipant;

    console.log('📤 Created participant:', {
      name: participant.name,
      photoURL: participant.photoURL,
      partnerPhotoURL: participant.partnerPhotoURL,
      participantMode: participant.participantMode
    });

    return participant;
  });

  const updatedParticipants = [...tournament.participants, ...newParticipants];

  return await updateTournament(tournamentId, {
    participants: updatedParticipants
  });
}

/**
 * Remove participant from tournament
 *
 * @param tournamentId Tournament ID
 * @param participantId Participant ID
 * @returns true if successful
 */
export async function removeParticipant(
  tournamentId: string,
  participantId: string
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  if (tournament.status !== 'DRAFT') {
    console.error('Cannot remove participants from tournament that is not in DRAFT status');
    return false;
  }

  const updatedParticipants = tournament.participants.filter(p => p.id !== participantId);

  return await updateTournament(tournamentId, {
    participants: updatedParticipants
  });
}

/**
 * Update participant
 *
 * @param tournamentId Tournament ID
 * @param participantId Participant ID
 * @param updates Partial participant data
 * @returns true if successful
 */
export async function updateParticipant(
  tournamentId: string,
  participantId: string,
  updates: Partial<TournamentParticipant>
): Promise<boolean> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    console.error('Tournament not found');
    return false;
  }

  const updatedParticipants = tournament.participants.map(p => {
    if (p.id === participantId) {
      return { ...p, ...updates };
    }
    return p;
  });

  return await updateTournament(tournamentId, {
    participants: updatedParticipants
  });
}

/**
 * Withdraw participant from tournament
 *
 * @param tournamentId Tournament ID
 * @param participantId Participant ID
 * @returns true if successful
 */
export async function withdrawParticipant(
  tournamentId: string,
  participantId: string
): Promise<boolean> {
  return await updateParticipant(tournamentId, participantId, {
    status: 'WITHDRAWN',
    withdrawnAt: Date.now()
  });
}

/**
 * Disqualify participant from tournament
 *
 * @param tournamentId Tournament ID
 * @param participantId Participant ID
 * @returns true if successful
 */
export async function disqualifyParticipant(
  tournamentId: string,
  participantId: string
): Promise<boolean> {
  return await updateParticipant(tournamentId, participantId, {
    status: 'DISQUALIFIED',
    disqualifiedAt: Date.now()
  });
}
