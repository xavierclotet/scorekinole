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

  // ELO will be fetched when tournament starts via calculateTournamentExpectedPositions
  // For now, just use default
  const elo = 1500;

  const participant: any = {
    id: `participant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: participantData.type || 'GUEST',
    name: participantData.name || 'Participante',
    eloSnapshot: elo,
    currentElo: elo,
    expectedPosition: 0, // Will be calculated when tournament starts
    status: 'ACTIVE'
  };

  // Add optional fields only if they exist
  if (participantData.userId) participant.userId = participantData.userId;
  if (participantData.email) participant.email = participantData.email;
  if (participantData.partner) participant.partner = participantData.partner;

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

  // ELO will be fetched when tournament starts via calculateTournamentExpectedPositions
  // For now, just use default
  const elo = 1500;

  // Create all participant objects
  const newParticipants = participantsData.map(participantData => {
    const participant: any = {
      id: `participant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: participantData.type || 'GUEST',
      name: participantData.name || 'Participante',
      eloSnapshot: elo,
      currentElo: elo,
      expectedPosition: 0, // Will be calculated when tournament starts
      status: 'ACTIVE'
    };

    // Add optional fields only if they exist
    if (participantData.userId) participant.userId = participantData.userId;
    if (participantData.email) participant.email = participantData.email;
    if (participantData.partner) participant.partner = participantData.partner;

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
