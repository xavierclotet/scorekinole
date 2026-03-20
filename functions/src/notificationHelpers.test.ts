import { describe, it, expect } from 'vitest';
import {
  shouldNotifyTournament,
  resolveCreatorName,
  countParticipants,
  buildTournamentNotificationMessage,
  type TournamentNotificationData
} from './notificationHelpers';

// ─── shouldNotifyTournament ─────────────────────────────────────────────────

describe('shouldNotifyTournament', () => {
  it('returns false for test tournaments', () => {
    expect(shouldNotifyTournament({ isTest: true, name: 'Test torneo' })).toBe(false);
  });

  it('returns true for non-test tournaments', () => {
    expect(shouldNotifyTournament({ isTest: false, name: 'Real torneo' })).toBe(true);
  });

  it('returns true when isTest is undefined', () => {
    expect(shouldNotifyTournament({ name: 'Torneo sin flag' })).toBe(true);
  });

  it('returns false for null/undefined data', () => {
    expect(shouldNotifyTournament(null as any)).toBe(false);
    expect(shouldNotifyTournament(undefined as any)).toBe(false);
  });

  it('returns true for imported non-test tournaments', () => {
    expect(shouldNotifyTournament({ isImported: true, isTest: false })).toBe(true);
  });

  it('returns false for imported test tournaments', () => {
    expect(shouldNotifyTournament({ isImported: true, isTest: true })).toBe(false);
  });

  // Name-based test detection
  it('returns false for names starting with "TEST."', () => {
    expect(shouldNotifyTournament({ name: 'TEST.Open de Catalunya' })).toBe(false);
  });

  it('returns false for names starting with "TESTS."', () => {
    expect(shouldNotifyTournament({ name: 'TESTS.Open de Catalunya de Crokinole 2026 - Dobles' })).toBe(false);
  });

  it('returns false for names starting with "test "', () => {
    expect(shouldNotifyTournament({ name: 'test torneo de prueba' })).toBe(false);
  });

  it('returns false for names starting with "Prueba "', () => {
    expect(shouldNotifyTournament({ name: 'Prueba torneo nuevo' })).toBe(false);
  });

  it('returns false for names starting with "pruebas-"', () => {
    expect(shouldNotifyTournament({ name: 'pruebas-dobles' })).toBe(false);
  });

  it('returns true for names containing "test" mid-word (e.g. "Contest")', () => {
    expect(shouldNotifyTournament({ name: 'Contest de Crokinole 2026' })).toBe(true);
  });

  it('returns true for names containing "test" in the middle', () => {
    expect(shouldNotifyTournament({ name: 'Open test edition' })).toBe(true);
  });
});

// ─── resolveCreatorName ─────────────────────────────────────────────────────

describe('resolveCreatorName', () => {
  it('reads createdBy.userName (the actual field from Firestore)', () => {
    const data: TournamentNotificationData = {
      createdBy: { userId: 'u1', userName: 'Xavi' }
    };
    expect(resolveCreatorName(data)).toBe('Xavi');
  });

  it('falls back to ownerName when createdBy is missing', () => {
    const data: TournamentNotificationData = {
      ownerName: 'Joan'
    };
    expect(resolveCreatorName(data)).toBe('Joan');
  });

  it('falls back to ownerName when createdBy.userName is empty', () => {
    const data: TournamentNotificationData = {
      createdBy: { userId: 'u1', userName: '' },
      ownerName: 'Joan'
    };
    expect(resolveCreatorName(data)).toBe('Joan');
  });

  it('returns Desconocido when no name fields exist', () => {
    expect(resolveCreatorName({})).toBe('Desconocido');
  });

  it('returns Desconocido when createdBy exists without userName', () => {
    const data = { createdBy: { userId: 'u1' } } as any;
    expect(resolveCreatorName(data)).toBe('Desconocido');
  });

  it('prefers createdBy.userName over ownerName', () => {
    const data: TournamentNotificationData = {
      createdBy: { userId: 'u1', userName: 'Xavi' },
      ownerName: 'Joan'
    };
    expect(resolveCreatorName(data)).toBe('Xavi');
  });
});

// ─── countParticipants ──────────────────────────────────────────────────────

describe('countParticipants', () => {
  it('counts array participants', () => {
    expect(countParticipants([{ id: '1' }, { id: '2' }, { id: '3' }])).toBe(3);
  });

  it('returns 0 for empty array', () => {
    expect(countParticipants([])).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(countParticipants(undefined)).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(countParticipants(null)).toBe(0);
  });

  it('returns 0 for non-array (object)', () => {
    expect(countParticipants({ a: 1, b: 2 })).toBe(0);
  });

  it('returns 0 for string', () => {
    expect(countParticipants('hello')).toBe(0);
  });
});

// ─── buildTournamentNotificationMessage ─────────────────────────────────────

describe('buildTournamentNotificationMessage', () => {
  it('builds correct message for LIVE singles tournament with creator name', () => {
    const data: TournamentNotificationData = {
      name: 'Open de Catalunya 2026',
      createdBy: { userId: 'u1', userName: 'Xavi' },
      gameType: 'singles',
      isImported: false,
      participants: []
    };
    const msg = buildTournamentNotificationMessage(data);
    expect(msg).toContain('🏆 *Nuevo torneo En vivo*');
    expect(msg).toContain('📋 *Nombre:* Open de Catalunya 2026');
    expect(msg).toContain('👤 *Creado por:* Xavi');
    expect(msg).toContain('🎮 *Tipo:* Singles');
    // No participant line for 0 participants
    expect(msg).not.toContain('Participantes');
  });

  it('builds correct message for LIVE doubles tournament', () => {
    const data: TournamentNotificationData = {
      name: 'Open Dobles 2026',
      createdBy: { userId: 'u1', userName: 'Joan' },
      gameType: 'doubles',
      isImported: false,
      participants: []
    };
    const msg = buildTournamentNotificationMessage(data);
    expect(msg).toContain('🏆 *Nuevo torneo En vivo*');
    expect(msg).toContain('🎮 *Tipo:* Dobles');
    expect(msg).toContain('👤 *Creado por:* Joan');
  });

  it('builds correct message for imported tournament with participants', () => {
    const data: TournamentNotificationData = {
      name: 'Histórico 2024',
      createdBy: { userId: 'u1', userName: 'Xavi' },
      gameType: 'singles',
      isImported: true,
      participants: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }]
    };
    const msg = buildTournamentNotificationMessage(data);
    expect(msg).toContain('📥 *Nuevo torneo Importado*');
    expect(msg).toContain('👥 *Participantes:* 5');
    expect(msg).toContain('👤 *Creado por:* Xavi');
  });

  it('does NOT show participant count when 0', () => {
    const data: TournamentNotificationData = {
      name: 'Torneo nuevo',
      createdBy: { userId: 'u1', userName: 'Test' },
      gameType: 'singles',
      participants: []
    };
    const msg = buildTournamentNotificationMessage(data);
    expect(msg).not.toContain('Participantes');
  });

  it('shows participant count when > 0', () => {
    const data: TournamentNotificationData = {
      name: 'Torneo con gente',
      createdBy: { userId: 'u1', userName: 'Test' },
      gameType: 'singles',
      participants: [{ id: '1' }, { id: '2' }]
    };
    const msg = buildTournamentNotificationMessage(data);
    expect(msg).toContain('👥 *Participantes:* 2');
  });

  it('uses "Sin nombre" for missing tournament name', () => {
    const msg = buildTournamentNotificationMessage({});
    expect(msg).toContain('📋 *Nombre:* Sin nombre');
  });

  it('uses "Desconocido" when no creator info exists (the OLD bug)', () => {
    // This was the original bug: createdByName doesn't exist,
    // but createdBy.userName does
    const data = {
      name: 'Torneo',
      gameType: 'singles'
      // Note: NO createdBy, NO ownerName — just like the broken field
    };
    const msg = buildTournamentNotificationMessage(data);
    expect(msg).toContain('👤 *Creado por:* Desconocido');
  });

  it('reads createdBy.userName correctly (the FIX)', () => {
    // This is the actual data structure from Firestore
    const data: TournamentNotificationData = {
      name: 'Open de Catalunya de Crokinole 2026 - Dobles',
      createdBy: { userId: 'abc123', userName: 'Xavi Carrillo' },
      gameType: 'doubles',
      isImported: false,
      participants: []
    };
    const msg = buildTournamentNotificationMessage(data);
    expect(msg).toContain('👤 *Creado por:* Xavi Carrillo');
    expect(msg).not.toContain('Desconocido');
  });

  it('falls back to ownerName when createdBy is missing', () => {
    const data: TournamentNotificationData = {
      name: 'Torneo legacy',
      ownerName: 'Admin',
      gameType: 'singles'
    };
    const msg = buildTournamentNotificationMessage(data);
    expect(msg).toContain('👤 *Creado por:* Admin');
  });
});
