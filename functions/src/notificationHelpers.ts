/**
 * Pure helper functions for tournament Telegram notifications.
 * Extracted for testability — no Firebase dependencies.
 */

export interface TournamentNotificationData {
  name?: string;
  createdBy?: { userId: string; userName: string };
  ownerName?: string;
  gameType?: string;
  isImported?: boolean;
  isTest?: boolean;
  participants?: any[];
}

/** Patterns in tournament names that indicate a test tournament */
const TEST_NAME_PATTERNS = /^(test|tests|prueba|pruebas)[.\s_-]/i;

/**
 * Determine whether a Telegram notification should be sent for this tournament.
 * Skips if isTest flag is set OR if the name starts with test-like patterns.
 */
export function shouldNotifyTournament(data: TournamentNotificationData): boolean {
  if (!data) return false;
  if (data.isTest === true) return false;
  if (data.name && TEST_NAME_PATTERNS.test(data.name)) return false;
  return true;
}

/**
 * Resolve the creator display name from tournament data.
 * Priority: createdBy.userName > ownerName > "Desconocido"
 */
export function resolveCreatorName(data: TournamentNotificationData): string {
  return data.createdBy?.userName || data.ownerName || "Desconocido";
}

/**
 * Count participants reliably — handles arrays and edge cases.
 */
export function countParticipants(participants: unknown): number {
  if (Array.isArray(participants)) return participants.length;
  return 0;
}

/**
 * Build the Telegram notification message for a new tournament.
 */
export function buildTournamentNotificationMessage(data: TournamentNotificationData): string {
  const creatorName = resolveCreatorName(data);
  const participantCount = countParticipants(data.participants);
  const emoji = data.isImported ? "📥" : "🏆";
  const typeLabel = data.isImported ? "Importado" : "En vivo";

  let message =
    `${emoji} *Nuevo torneo ${typeLabel}*\n\n` +
    `📋 *Nombre:* ${data.name || "Sin nombre"}\n` +
    `👤 *Creado por:* ${creatorName}\n` +
    `🎮 *Tipo:* ${data.gameType === "doubles" ? "Dobles" : "Singles"}`;

  if (participantCount > 0) {
    message += `\n👥 *Participantes:* ${participantCount}`;
  }

  return message;
}
