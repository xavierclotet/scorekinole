/**
 * Tournament validation utilities
 */

import type { Tournament, TournamentParticipant, EloConfig } from '$lib/types/tournament';
import { isPowerOfTwo } from '$lib/algorithms/bracket';
import { validateRoundRobinGroupSize } from '$lib/algorithms/roundRobin';
import { validateSwissSystem } from '$lib/algorithms/swiss';
import { validateEloConfig } from '$lib/algorithms/elo';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate tournament configuration
 *
 * @param tournament Tournament to validate
 * @returns Validation result
 */
export function validateTournament(tournament: Partial<Tournament>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic info
  if (!tournament.name || tournament.name.trim() === '') {
    errors.push('El nombre del torneo es obligatorio');
  }

  // Game configuration
  if (!tournament.gameType) {
    errors.push('El tipo de juego es obligatorio');
  }

  if (!tournament.gameMode) {
    errors.push('El modo de juego es obligatorio');
  }

  if (tournament.gameMode === 'points' && (!tournament.pointsToWin || tournament.pointsToWin < 1)) {
    errors.push('Los puntos para ganar deben ser al menos 1');
  }

  if (tournament.gameMode === 'rounds' && (!tournament.roundsToPlay || tournament.roundsToPlay < 1)) {
    errors.push('El número de rondas debe ser al menos 1');
  }

  if (!tournament.matchesToWin || tournament.matchesToWin < 1) {
    errors.push('El número de partidos a ganar debe ser al menos 1');
  }

  // Tables
  if (!tournament.numTables || tournament.numTables < 1) {
    errors.push('Debe haber al menos 1 mesa');
  }

  // Phase configuration
  if (!tournament.phaseType) {
    errors.push('El tipo de fase es obligatorio');
  }

  if (tournament.phaseType === 'TWO_PHASE') {
    if (!tournament.groupStageType) {
      errors.push('El tipo de fase de grupos es obligatorio para torneos de 2 fases');
    }

    if (tournament.groupStageType === 'ROUND_ROBIN') {
      if (!tournament.numGroups || tournament.numGroups < 1) {
        errors.push('El número de grupos debe ser al menos 1');
      }
    }

    if (tournament.groupStageType === 'SWISS') {
      if (!tournament.numSwissRounds || tournament.numSwissRounds < 3) {
        errors.push('El sistema suizo requiere al menos 3 rondas');
      }
    }
  }

  // ELO configuration
  if (tournament.eloConfig) {
    if (!validateEloConfig(tournament.eloConfig)) {
      errors.push('Configuración de ELO inválida');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate participants
 *
 * @param participants Participants to validate
 * @param tournament Tournament configuration
 * @returns Validation result
 */
export function validateParticipants(
  participants: TournamentParticipant[],
  tournament: Partial<Tournament>
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Minimum participants
  if (participants.length < 4) {
    errors.push('Se requieren al menos 4 participantes');
  }

  // Check for duplicate names
  const names = participants.map(p => p.name.toLowerCase());
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) {
    warnings.push(`Hay nombres duplicados: ${[...new Set(duplicates)].join(', ')}`);
  }

  // Validate for Round Robin
  if (tournament.phaseType === 'TWO_PHASE' && tournament.groupStageType === 'ROUND_ROBIN') {
    const numGroups = tournament.numGroups || 1;
    const participantsPerGroup = Math.ceil(participants.length / numGroups);

    if (!validateRoundRobinGroupSize(participantsPerGroup)) {
      errors.push(`Cada grupo tendría ${participantsPerGroup} participantes (máximo recomendado: 20)`);
    }

    if (participants.length < numGroups * 2) {
      errors.push(`No hay suficientes participantes para ${numGroups} grupos (mínimo ${numGroups * 2})`);
    }
  }

  // Validate for Swiss
  if (tournament.phaseType === 'TWO_PHASE' && tournament.groupStageType === 'SWISS') {
    const numRounds = tournament.numSwissRounds || 3;
    if (!validateSwissSystem(participants.length, numRounds)) {
      errors.push(`Configuración de sistema suizo inválida (${participants.length} participantes, ${numRounds} rondas)`);
    }
  }

  // Validate for bracket
  if (tournament.phaseType === 'ONE_PHASE') {
    if (!isPowerOfTwo(participants.length)) {
      warnings.push(`El número de participantes (${participants.length}) no es potencia de 2. Se recomienda: ${getPowerOfTwoSuggestions(participants.length).join(', ')}`);
    }
  }

  // Doubles validation
  if (tournament.gameType === 'doubles') {
    const withoutPartner = participants.filter(p => !p.partner);
    if (withoutPartner.length > 0) {
      errors.push(`${withoutPartner.length} participantes no tienen pareja asignada`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate tournament can start
 *
 * @param tournament Tournament to validate
 * @returns Validation result
 */
export function validateTournamentStart(tournament: Tournament): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must be in DRAFT status
  if (tournament.status !== 'DRAFT') {
    errors.push('El torneo ya ha iniciado');
    return { valid: false, errors, warnings };
  }

  // Validate tournament config
  const configValidation = validateTournament(tournament);
  errors.push(...configValidation.errors);
  warnings.push(...configValidation.warnings);

  // Validate participants
  const participantsValidation = validateParticipants(tournament.participants, tournament);
  errors.push(...participantsValidation.errors);
  warnings.push(...participantsValidation.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get power of 2 suggestions for participant count
 *
 * @param count Current participant count
 * @returns Array of suggested counts
 */
export function getPowerOfTwoSuggestions(count: number): number[] {
  const suggestions: number[] = [];
  let power = 1;

  // Find closest powers of 2
  while (power < count * 2) {
    power *= 2;
    if (power >= count) {
      suggestions.push(power);
    }
    if (suggestions.length >= 2) break;
  }

  return suggestions;
}

/**
 * Validate table assignment
 *
 * @param tableNumber Table number
 * @param totalTables Total available tables
 * @param occupiedTables Currently occupied tables
 * @returns Validation result
 */
export function validateTableAssignment(
  tableNumber: number,
  totalTables: number,
  occupiedTables: number[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (tableNumber < 1 || tableNumber > totalTables) {
    errors.push(`Número de mesa inválido (debe estar entre 1 y ${totalTables})`);
  }

  if (occupiedTables.includes(tableNumber)) {
    warnings.push(`La mesa ${tableNumber} está actualmente ocupada`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
