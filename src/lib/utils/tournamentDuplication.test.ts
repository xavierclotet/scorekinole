import { describe, it, expect, vi } from 'vitest';
import { duplicateParticipants, type DuplicateParticipantsDeps } from './tournamentDuplication';
import type { TournamentParticipant } from '$lib/types/tournament';

function makeDeps(overrides: Partial<DuplicateParticipantsDeps> = {}): DuplicateParticipantsDeps {
	let nextId = 0;
	return {
		getProfile: vi.fn(async () => null),
		estimateRanking: vi.fn(() => 0),
		generateId: () => `new-id-${nextId++}`,
		...overrides
	};
}

function makeParticipant(overrides: Partial<TournamentParticipant> = {}): TournamentParticipant {
	return {
		id: 'orig-id',
		type: 'GUEST',
		name: 'Jugador',
		rankingSnapshot: 55,
		status: 'ACTIVE',
		...overrides
	};
}

describe('duplicateParticipants', () => {
	it('returns [] for undefined/null participants (legacy docs without the array)', async () => {
		expect(await duplicateParticipants(undefined, 'singles', makeDeps())).toEqual([]);
		expect(await duplicateParticipants(null, 'singles', makeDeps())).toEqual([]);
	});

	it('assigns new unique ids, never reusing the original ones', async () => {
		const result = await duplicateParticipants(
			[makeParticipant({ id: 'a' }), makeParticipant({ id: 'b', name: 'Otro' })],
			'singles',
			makeDeps()
		);
		const ids = result.map((p) => p.id);
		expect(ids).toEqual(['new-id-0', 'new-id-1']);
		expect(new Set(ids).size).toBe(2);
	});

	it('resets status to ACTIVE for withdrawn and disqualified players', async () => {
		const result = await duplicateParticipants(
			[
				makeParticipant({ status: 'WITHDRAWN', withdrawnAt: 123 }),
				makeParticipant({ status: 'DISQUALIFIED', disqualifiedAt: 456 })
			],
			'singles',
			makeDeps()
		);
		expect(result.every((p) => p.status === 'ACTIVE')).toBe(true);
		expect(result.some((p) => 'withdrawnAt' in p || 'disqualifiedAt' in p)).toBe(false);
	});

	it('does not carry over result fields (finalPosition*)', async () => {
		const [copy] = await duplicateParticipants(
			[makeParticipant({ finalPosition: 1, finalPositionStart: 1, finalPositionEnd: 2 })],
			'singles',
			makeDeps()
		);
		expect(copy.finalPosition).toBeUndefined();
		expect(copy.finalPositionStart).toBeUndefined();
		expect(copy.finalPositionEnd).toBeUndefined();
	});

	it('refreshes name, photo and ranking estimate from the profile for REGISTERED players', async () => {
		const deps = makeDeps({
			getProfile: vi.fn(async () => ({
				playerName: 'Nombre Nuevo',
				photoURL: 'https://new.photo',
				tournaments: [{}]
			})),
			estimateRanking: vi.fn(() => 77)
		});
		const [copy] = await duplicateParticipants(
			[
				makeParticipant({
					type: 'REGISTERED',
					userId: 'u1',
					name: 'Nombre Viejo',
					photoURL: 'https://old.photo'
				})
			],
			'singles',
			deps
		);
		expect(deps.getProfile).toHaveBeenCalledWith('u1');
		expect(copy.name).toBe('Nombre Nuevo');
		expect(copy.photoURL).toBe('https://new.photo');
		expect(copy.rankingSnapshot).toBe(77);
	});

	it('keeps original snapshot values when the profile no longer exists', async () => {
		const [copy] = await duplicateParticipants(
			[
				makeParticipant({
					type: 'REGISTERED',
					userId: 'deleted-user',
					name: 'Nombre Snapshot',
					photoURL: 'https://snapshot.photo'
				})
			],
			'singles',
			makeDeps() // getProfile resolves null
		);
		expect(copy.name).toBe('Nombre Snapshot');
		expect(copy.photoURL).toBe('https://snapshot.photo');
		expect(copy.rankingSnapshot).toBe(0);
	});

	it('survives a profile fetch that throws, keeping the row instead of failing the whole load', async () => {
		const deps = makeDeps({
			getProfile: vi.fn(async () => {
				throw new Error('permission-denied');
			})
		});
		const result = await duplicateParticipants(
			[makeParticipant({ type: 'REGISTERED', userId: 'u1', name: 'Resiliente' })],
			'singles',
			deps
		);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('Resiliente');
	});

	it('does not fetch profiles for GUEST players but preserves their userId', async () => {
		const deps = makeDeps();
		const [copy] = await duplicateParticipants(
			[makeParticipant({ type: 'GUEST', userId: 'guest-profile-id' })],
			'singles',
			deps
		);
		expect(deps.getProfile).not.toHaveBeenCalled();
		expect(copy.userId).toBe('guest-profile-id');
		expect(copy.rankingSnapshot).toBe(0);
	});

	it('preserves userKey, email and teamName (main and partner)', async () => {
		const [copy] = await duplicateParticipants(
			[
				makeParticipant({
					type: 'REGISTERED',
					userId: 'u1',
					userKey: 'ABC123',
					email: 'a@b.c',
					teamName: 'Los Invencibles',
					partner: {
						type: 'REGISTERED',
						userId: 'u2',
						userKey: 'DEF456',
						email: 'p@b.c',
						name: 'Pareja'
					}
				})
			],
			'doubles',
			makeDeps()
		);
		expect(copy.userKey).toBe('ABC123');
		expect(copy.email).toBe('a@b.c');
		expect(copy.teamName).toBe('Los Invencibles');
		expect(copy.partner?.userKey).toBe('DEF456');
		expect(copy.partner?.email).toBe('p@b.c');
	});

	it('refreshes partner name/photo/ranking from the partner profile', async () => {
		const profiles: Record<string, any> = {
			u2: { playerName: 'Pareja Nueva', photoURL: 'https://partner.photo', tournaments: [{}] }
		};
		const deps = makeDeps({
			getProfile: vi.fn(async (id: string) => profiles[id] ?? null),
			estimateRanking: vi.fn((t) => (t ? 33 : 0))
		});
		const [copy] = await duplicateParticipants(
			[
				makeParticipant({
					name: 'Principal',
					partner: { type: 'REGISTERED', userId: 'u2', name: 'Pareja Vieja' }
				})
			],
			'doubles',
			deps
		);
		expect(copy.partner?.name).toBe('Pareja Nueva');
		expect(copy.partner?.photoURL).toBe('https://partner.photo');
		expect(copy.partner?.rankingSnapshot).toBe(33);
	});

	describe('old doubles pair format migration ("P1 / P2" without partner)', () => {
		it('splits into main + GUEST partner with new id and ACTIVE status', async () => {
			const [copy] = await duplicateParticipants(
				[makeParticipant({ name: 'Ana / Luis', rankingSnapshot: 99, status: 'WITHDRAWN' })],
				'doubles',
				makeDeps()
			);
			expect(copy).toMatchObject({
				id: 'new-id-0',
				type: 'GUEST',
				name: 'Ana',
				partner: { type: 'GUEST', name: 'Luis' },
				rankingSnapshot: 0,
				status: 'ACTIVE'
			});
		});

		it('splits on the FIRST separator only, keeping the rest of the name intact', async () => {
			const [copy] = await duplicateParticipants(
				[makeParticipant({ name: 'Ana / Luis / Marc' })],
				'doubles',
				makeDeps()
			);
			expect(copy.name).toBe('Ana');
			expect(copy.partner?.name).toBe('Luis / Marc');
		});

		it('does not migrate singles names containing " / "', async () => {
			const [copy] = await duplicateParticipants(
				[makeParticipant({ name: 'Ana / Luis' })],
				'singles',
				makeDeps()
			);
			expect(copy.name).toBe('Ana / Luis');
			expect(copy.partner).toBeUndefined();
		});

		it('does not migrate doubles rows that already have a partner object', async () => {
			const [copy] = await duplicateParticipants(
				[
					makeParticipant({
						name: 'Equipo A / B',
						partner: { type: 'GUEST', name: 'Compi' }
					})
				],
				'doubles',
				makeDeps()
			);
			expect(copy.name).toBe('Equipo A / B');
			expect(copy.partner?.name).toBe('Compi');
		});
	});
});
