/**
 * Firestore security rules test suite.
 *
 * Requires the Firebase emulator:
 *   firebase emulators:start --only firestore
 *
 * Run with:
 *   npm run test:rules
 */

import {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment,
	type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
	doc,
	getDoc,
	setDoc,
	updateDoc,
	deleteDoc,
	collection,
	Timestamp
} from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

// -------------------------------------------------------------------------
// Environment setup
// -------------------------------------------------------------------------

let testEnv: RulesTestEnvironment;

const RULES_PATH = resolve(process.cwd(), 'firestore.rules');
const PROJECT_ID = 'scorekinole-rules-test';
const EMULATOR_HOST = 'localhost';
const EMULATOR_PORT = 8080;

beforeAll(async () => {
	testEnv = await initializeTestEnvironment({
		projectId: PROJECT_ID,
		firestore: {
			rules: readFileSync(RULES_PATH, 'utf8'),
			host: EMULATOR_HOST,
			port: EMULATOR_PORT
		}
	});
});

afterAll(async () => {
	await testEnv.cleanup();
});

beforeEach(async () => {
	await testEnv.clearFirestore();
});

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function anonCtx() {
	return testEnv.unauthenticatedContext();
}

function userCtx(uid: string, emailVerified = true) {
	return testEnv.authenticatedContext(uid, { email_verified: emailVerified });
}

/** Write a user doc bypassing rules (test setup). */
async function setupUser(
	uid: string,
	data: Record<string, unknown> = {}
) {
	await testEnv.withSecurityRulesDisabled(async (ctx) => {
		await setDoc(doc(ctx.firestore(), 'users', uid), {
			displayName: 'Test User',
			isAdmin: false,
			isSuperAdmin: false,
			tournaments: [],
			disabled: false,
			...data
		});
	});
}

/** Write a tournament doc bypassing rules (test setup). */
async function setupTournament(
	id: string,
	data: Record<string, unknown> = {}
) {
	await testEnv.withSecurityRulesDisabled(async (ctx) => {
		await setDoc(doc(ctx.firestore(), 'tournaments', id), {
			name: 'Test Tournament',
			key: 'ABC123',
			ownerId: 'owner-uid',
			adminIds: [],
			status: 'DRAFT',
			participants: [],
			rankingConfig: { tier: 'LOCAL' },
			isTest: false,
			...data
		});
	});
}

// -------------------------------------------------------------------------
// Tournaments
// -------------------------------------------------------------------------

describe('Tournaments', () => {
	// ------ READ ------
	describe('read', () => {
		it('T1 — anónimo puede leer un torneo', async () => {
			await setupTournament('t1');
			const ctx = anonCtx();
			await assertSucceeds(getDoc(doc(ctx.firestore(), 'tournaments', 't1')));
		});

		it('T1b — usuario autenticado puede leer un torneo', async () => {
			await setupTournament('t1');
			const ctx = userCtx('user1');
			await assertSucceeds(getDoc(doc(ctx.firestore(), 'tournaments', 't1')));
		});
	});

	// ------ UPDATE — denied ------
	describe('update — DENIED', () => {
		it('T2 — anónimo NO puede actualizar un torneo', async () => {
			await setupTournament('t2');
			const ctx = anonCtx();
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't2'), { name: 'Hacked' })
			);
		});

		it('T3 — usuario autenticado sin relación NO puede actualizar', async () => {
			await setupTournament('t3', { ownerId: 'owner-uid', adminIds: [] });
			const ctx = userCtx('other-user');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't3'), { name: 'Hacked' })
			);
		});

		it('T7 — participante NO puede cambiar status a COMPLETED', async () => {
			await setupTournament('t7', {
				status: 'GROUP_STAGE',
				participants: [{ userId: 'player1' }]
			});
			const ctx = userCtx('player1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't7'), { status: 'COMPLETED' })
			);
		});

		it('T8 — participante NO puede cambiar participants[]', async () => {
			await setupTournament('t8', {
				status: 'GROUP_STAGE',
				participants: [{ userId: 'player1', playerName: 'Alice' }]
			});
			const ctx = userCtx('player1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't8'), {
					participants: [
						{ userId: 'player1', playerName: 'Alice' },
						{ userId: 'fake-winner', playerName: 'Cheater', finalPosition: 1 }
					]
				})
			);
		});

		it('T9 — participante NO puede cambiar ownerId', async () => {
			await setupTournament('t9', {
				status: 'GROUP_STAGE',
				participants: [{ userId: 'player1' }]
			});
			const ctx = userCtx('player1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't9'), { ownerId: 'player1' })
			);
		});

		it('T10 — participante NO puede cambiar adminIds', async () => {
			await setupTournament('t10', {
				status: 'GROUP_STAGE',
				participants: [{ userId: 'player1' }]
			});
			const ctx = userCtx('player1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't10'), { adminIds: ['player1'] })
			);
		});

		it('T11 — participante NO puede cambiar isTest', async () => {
			await setupTournament('t11', {
				status: 'GROUP_STAGE',
				participants: [{ userId: 'player1' }]
			});
			const ctx = userCtx('player1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't11'), { isTest: true })
			);
		});

		it('T12 — participante NO puede cambiar rankingConfig.tier', async () => {
			await setupTournament('t12', {
				status: 'GROUP_STAGE',
				rankingConfig: { tier: 'LOCAL' },
				participants: [{ userId: 'player1' }]
			});
			const ctx = userCtx('player1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't12'), {
					rankingConfig: { tier: 'SERIES_35' }
				})
			);
		});

		it('T13 — participante NO puede cambiar la key', async () => {
			await setupTournament('t13', {
				status: 'GROUP_STAGE',
				participants: [{ userId: 'player1' }]
			});
			const ctx = userCtx('player1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't13'), { key: 'NEWKEY' })
			);
		});

		it('T14 — usuario NO autenticado NO puede actualizar scores', async () => {
			await setupTournament('t14', {
				status: 'GROUP_STAGE',
				participants: [{ userId: 'player1' }]
			});
			// Any authenticated user may score (scorer is whoever holds the device).
			// Anonymous users are always blocked.
			const ctx = anonCtx();
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't14'), {
					groupStage: { rounds: [{ matches: [{ score: [10, 5] }] }] }
				})
			);
		});
	});

	// ------ UPDATE — allowed ------
	describe('update — ALLOWED', () => {
		it('T4 — owner puede actualizar cualquier campo', async () => {
			await setupTournament('t4', { ownerId: 'owner-uid', status: 'DRAFT' });
			const ctx = userCtx('owner-uid');
			await assertSucceeds(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't4'), { name: 'Updated Name' })
			);
		});

		it('T4b — owner puede cambiar status', async () => {
			await setupTournament('t4b', { ownerId: 'owner-uid', status: 'DRAFT' });
			const ctx = userCtx('owner-uid');
			await assertSucceeds(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't4b'), { status: 'GROUP_STAGE' })
			);
		});

		it('T5 — admin del torneo puede actualizar campos estructurales', async () => {
			await setupTournament('t5', {
				ownerId: 'owner-uid',
				adminIds: ['admin-uid'],
				status: 'GROUP_STAGE'
			});
			const ctx = userCtx('admin-uid');
			await assertSucceeds(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't5'), {
					groupStage: { test: true }
				})
			);
		});

		it('T6 — participante puede actualizar groupStage (scoring) sin tocar campos estructurales', async () => {
			await setupTournament('t6', {
				status: 'GROUP_STAGE',
				ownerId: 'owner-uid',
				adminIds: [],
				participants: [{ userId: 'player1' }],
				rankingConfig: { tier: 'LOCAL' },
				isTest: false,
				key: 'ABC123'
			});
			const ctx = userCtx('player1');
			await assertSucceeds(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't6'), {
					groupStage: { rounds: [{ match: { scoreA: 15, scoreB: 10 } }] }
				})
			);
		});

		it('T6b — participante puede actualizar finalStage (scoring)', async () => {
			await setupTournament('t6b', {
				status: 'FINAL_STAGE',
				ownerId: 'owner-uid',
				adminIds: [],
				participants: [{ userId: 'player1' }],
				rankingConfig: { tier: 'LOCAL' },
				isTest: false,
				key: 'ABC123'
			});
			const ctx = userCtx('player1');
			await assertSucceeds(
				updateDoc(doc(ctx.firestore(), 'tournaments', 't6b'), {
					finalStage: { bracket: [{ scoreA: 20, scoreB: 15 }] }
				})
			);
		});

		it('REG — usuario autenticado puede registrarse (cambiar participants) en torneo DRAFT', async () => {
			await setupTournament('reg1', {
				status: 'DRAFT',
				ownerId: 'owner-uid',
				adminIds: [],
				participants: [],
				key: 'ABC123',
				rankingConfig: { tier: 'LOCAL' },
				isTest: false
			});
			const ctx = userCtx('new-player');
			await assertSucceeds(
				updateDoc(doc(ctx.firestore(), 'tournaments', 'reg1'), {
					participants: [{ userId: 'new-player', playerName: 'Alice' }]
				})
			);
		});

		it('REG2 — usuario autenticado NO puede registrarse en torneo GROUP_STAGE', async () => {
			await setupTournament('reg2', {
				status: 'GROUP_STAGE',
				ownerId: 'owner-uid',
				adminIds: [],
				participants: [],
				key: 'ABC123',
				rankingConfig: { tier: 'LOCAL' },
				isTest: false
			});
			const ctx = userCtx('new-player');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'tournaments', 'reg2'), {
					participants: [{ userId: 'new-player', playerName: 'Alice' }]
				})
			);
		});
	});

	// ------ CREATE ------
	describe('create', () => {
		it('T15 — anónimo NO puede crear torneos', async () => {
			await setupUser('admin-uid', { isAdmin: true });
			const ctx = anonCtx();
			await assertFails(
				setDoc(doc(ctx.firestore(), 'tournaments', 'new-t'), {
					name: 'Hack', key: 'XXXXXX', ownerId: 'anon', status: 'DRAFT'
				})
			);
		});

		it('T16 — admin de plataforma SÍ puede crear torneos', async () => {
			await setupUser('admin-uid', { isAdmin: true });
			const ctx = userCtx('admin-uid');
			await assertSucceeds(
				setDoc(doc(ctx.firestore(), 'tournaments', 'new-t2'), {
					name: 'Test', key: 'XXXXXX', ownerId: 'admin-uid',
					status: 'DRAFT', adminIds: [], participants: [],
					rankingConfig: { tier: 'LOCAL' }, isTest: false
				})
			);
		});

		it('T17 — usuario no-admin NO puede crear torneos', async () => {
			await setupUser('regular-uid', { isAdmin: false });
			const ctx = userCtx('regular-uid');
			await assertFails(
				setDoc(doc(ctx.firestore(), 'tournaments', 'new-t3'), {
					name: 'Test', key: 'XXXXXX', ownerId: 'regular-uid', status: 'DRAFT'
				})
			);
		});
	});

	// ------ DELETE ------
	describe('delete', () => {
		it('T18 — owner puede eliminar su torneo', async () => {
			await setupTournament('del1', { ownerId: 'owner-uid' });
			const ctx = userCtx('owner-uid');
			await assertSucceeds(deleteDoc(doc(ctx.firestore(), 'tournaments', 'del1')));
		});

		it('T19 — admin de plataforma puede eliminar cualquier torneo', async () => {
			await setupUser('admin-uid', { isAdmin: true });
			await setupTournament('del2', { ownerId: 'other-uid' });
			const ctx = userCtx('admin-uid');
			await assertSucceeds(deleteDoc(doc(ctx.firestore(), 'tournaments', 'del2')));
		});

		it('T20 — usuario normal NO puede eliminar un torneo ajeno', async () => {
			await setupTournament('del3', { ownerId: 'owner-uid' });
			const ctx = userCtx('random-user');
			await assertFails(deleteDoc(doc(ctx.firestore(), 'tournaments', 'del3')));
		});
	});
});

// -------------------------------------------------------------------------
// Users
// -------------------------------------------------------------------------

describe('Users', () => {
	describe('read', () => {
		it('U1 — anónimo puede leer un perfil (nombres/ranking públicos)', async () => {
			await setupUser('user1');
			const ctx = anonCtx();
			await assertSucceeds(getDoc(doc(ctx.firestore(), 'users', 'user1')));
		});

		it('U2 — anónimo NO puede leer /users/{uid}/private/meta', async () => {
			const ctx = anonCtx();
			await assertFails(
				getDoc(doc(ctx.firestore(), 'users', 'user1', 'private', 'meta'))
			);
		});

		it('U3 — el propio usuario puede leer su /private/meta', async () => {
			await testEnv.withSecurityRulesDisabled(async (ctx) => {
				await setDoc(
					doc(ctx.firestore(), 'users', 'user1', 'private', 'meta'),
					{ email: 'user@test.com', registrationIP: '1.2.3.4' }
				);
			});
			const ctx = userCtx('user1');
			await assertSucceeds(
				getDoc(doc(ctx.firestore(), 'users', 'user1', 'private', 'meta'))
			);
		});

		it('U4 — admin puede leer /private/meta de cualquier usuario', async () => {
			await setupUser('admin-uid', { isAdmin: true });
			await testEnv.withSecurityRulesDisabled(async (ctx) => {
				await setDoc(
					doc(ctx.firestore(), 'users', 'target-uid', 'private', 'meta'),
					{ email: 'victim@test.com' }
				);
			});
			const ctx = userCtx('admin-uid');
			await assertSucceeds(
				getDoc(doc(ctx.firestore(), 'users', 'target-uid', 'private', 'meta'))
			);
		});
	});

	describe('update', () => {
		it('U5 — usuario puede actualizar displayName y photoURL propios', async () => {
			await setupUser('user1');
			const ctx = userCtx('user1');
			await assertSucceeds(
				updateDoc(doc(ctx.firestore(), 'users', 'user1'), {
					displayName: 'New Name',
					photoURL: 'https://example.com/photo.jpg'
				})
			);
		});

		it('U6 — usuario NO puede autopromocionar a isAdmin', async () => {
			await setupUser('user1', { isAdmin: false });
			const ctx = userCtx('user1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'user1'), { isAdmin: true })
			);
		});

		it('U7 — usuario NO puede autopromocionar a isSuperAdmin', async () => {
			await setupUser('user1', { isSuperAdmin: false });
			const ctx = userCtx('user1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'user1'), { isSuperAdmin: true })
			);
		});

		it('U8 — usuario NO puede inflar su propio tournaments[]', async () => {
			await setupUser('user1', { tournaments: [] });
			const ctx = userCtx('user1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'user1'), {
					tournaments: [{ tournamentId: 'fake', rankingDelta: 9999, finalPosition: 1 }]
				})
			);
		});

		it('U9 — usuario NO puede cambiar registrationIP', async () => {
			await setupUser('user1', { registrationIP: '1.2.3.4' });
			const ctx = userCtx('user1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'user1'), { registrationIP: '9.9.9.9' })
			);
		});

		it('U10 — usuario NO puede cambiar deviceFingerprint', async () => {
			await setupUser('user1', { deviceFingerprint: 'abc123' });
			const ctx = userCtx('user1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'user1'), { deviceFingerprint: 'hacked' })
			);
		});

		it('U11 — usuario NO puede cambiar authProvider', async () => {
			await setupUser('user1', { authProvider: 'google' });
			const ctx = userCtx('user1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'user1'), { authProvider: 'email' })
			);
		});

		it('U12 — usuario NO puede cambiar mergedTo', async () => {
			await setupUser('user1', { mergedTo: null });
			const ctx = userCtx('user1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'user1'), { mergedTo: 'other-uid' })
			);
		});

		it('U13 — usuario NO puede cambiar disabled', async () => {
			await setupUser('user1', { disabled: false });
			const ctx = userCtx('user1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'user1'), { disabled: true })
			);
		});

		it('U14 — usuario NO puede cambiar rankingSnapshot', async () => {
			await setupUser('user1', { rankingSnapshot: null });
			const ctx = userCtx('user1');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'user1'), {
					rankingSnapshot: { rank: 1, points: 9999 }
				})
			);
		});

		it('U15 — admin de plataforma puede actualizar cualquier usuario', async () => {
			await setupUser('admin-uid', { isAdmin: true });
			await setupUser('target-uid');
			const ctx = userCtx('admin-uid');
			await assertSucceeds(
				updateDoc(doc(ctx.firestore(), 'users', 'target-uid'), {
					displayName: 'Updated By Admin'
				})
			);
		});

		it('U16 — usuario A NO puede actualizar perfil de usuario B', async () => {
			await setupUser('user-a');
			await setupUser('user-b');
			const ctx = userCtx('user-a');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'user-b'), { displayName: 'Hacked' })
			);
		});

		it('U17 — admin (no super) NO puede promocionar otro usuario a isAdmin', async () => {
			await setupUser('admin-uid', { isAdmin: true, isSuperAdmin: false });
			await setupUser('target-uid', { isAdmin: false });
			const ctx = userCtx('admin-uid');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'target-uid'), { isAdmin: true })
			);
		});

		it('U18 — admin (no super) NO puede promocionar otro usuario a isSuperAdmin', async () => {
			await setupUser('admin-uid', { isAdmin: true, isSuperAdmin: false });
			await setupUser('target-uid', { isSuperAdmin: false });
			const ctx = userCtx('admin-uid');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'target-uid'), { isSuperAdmin: true })
			);
		});

		it('U19 — admin (no super) NO puede autopromocionarse a isSuperAdmin', async () => {
			await setupUser('admin-uid', { isAdmin: true, isSuperAdmin: false });
			const ctx = userCtx('admin-uid');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'admin-uid'), { isSuperAdmin: true })
			);
		});

		it('U20 — admin (no super) NO puede cambiar disabled en otro usuario', async () => {
			await setupUser('admin-uid', { isAdmin: true, isSuperAdmin: false });
			await setupUser('target-uid', { disabled: false });
			const ctx = userCtx('admin-uid');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'target-uid'), { disabled: true })
			);
		});

		it('U21 — admin (no super) NO puede revocar isAdmin de otro admin', async () => {
			await setupUser('admin-uid', { isAdmin: true, isSuperAdmin: false });
			await setupUser('target-admin', { isAdmin: true });
			const ctx = userCtx('admin-uid');
			await assertFails(
				updateDoc(doc(ctx.firestore(), 'users', 'target-admin'), { isAdmin: false })
			);
		});

		it('U22 — super-admin SÍ puede promocionar usuario a isAdmin', async () => {
			await setupUser('super-uid', { isAdmin: true, isSuperAdmin: true });
			await setupUser('target-uid', { isAdmin: false });
			const ctx = userCtx('super-uid');
			await assertSucceeds(
				updateDoc(doc(ctx.firestore(), 'users', 'target-uid'), { isAdmin: true })
			);
		});

		it('U23 — admin (no super) SÍ puede editar campos no-sensibles de otro usuario', async () => {
			await setupUser('admin-uid', { isAdmin: true, isSuperAdmin: false });
			await setupUser('target-uid', { canAutofill: false });
			const ctx = userCtx('admin-uid');
			await assertSucceeds(
				updateDoc(doc(ctx.firestore(), 'users', 'target-uid'), {
					displayName: 'New Name',
					canAutofill: true
				})
			);
		});
	});

	describe('create', () => {
		it('U24 — admin (no super) NO puede crear usuario con isAdmin: true', async () => {
			await setupUser('admin-uid', { isAdmin: true, isSuperAdmin: false });
			const ctx = userCtx('admin-uid');
			await assertFails(
				setDoc(doc(ctx.firestore(), 'users', 'new-guest'), {
					displayName: 'Evil Guest',
					isAdmin: true
				})
			);
		});

		it('U25 — admin (no super) NO puede crear usuario con isSuperAdmin: true', async () => {
			await setupUser('admin-uid', { isAdmin: true, isSuperAdmin: false });
			const ctx = userCtx('admin-uid');
			await assertFails(
				setDoc(doc(ctx.firestore(), 'users', 'new-guest'), {
					displayName: 'Evil Guest',
					isSuperAdmin: true
				})
			);
		});

		it('U26 — admin (no super) SÍ puede crear usuario normal (sin flags)', async () => {
			await setupUser('admin-uid', { isAdmin: true, isSuperAdmin: false });
			const ctx = userCtx('admin-uid');
			await assertSucceeds(
				setDoc(doc(ctx.firestore(), 'users', 'new-guest'), {
					displayName: 'Guest Player'
				})
			);
		});

		it('U27 — super-admin SÍ puede crear usuario con isAdmin: true', async () => {
			await setupUser('super-uid', { isAdmin: true, isSuperAdmin: true });
			const ctx = userCtx('super-uid');
			await assertSucceeds(
				setDoc(doc(ctx.firestore(), 'users', 'new-admin'), {
					displayName: 'New Admin',
					isAdmin: true
				})
			);
		});
	});
});

// -------------------------------------------------------------------------
// MatchInvites
// -------------------------------------------------------------------------

describe('MatchInvites', () => {
	const validInvite = () => ({
		hostUserId: 'host-uid',
		hostUserName: 'Alice',
		guestUserId: 'guest-uid',
		guestUserName: 'Bob',
		status: 'pending',
		expiresAt: Timestamp.fromDate(new Date(Date.now() + 1000 * 60 * 60 * 12)) // 12h from now
	});

	it('MI1 — usuario verificado puede crear invite válida', async () => {
		const ctx = userCtx('host-uid');
		await assertSucceeds(
			setDoc(doc(ctx.firestore(), 'matchInvites', 'invite1'), validInvite())
		);
	});

	it('MI2 — usuario NO verificado NO puede crear invite', async () => {
		const ctx = userCtx('host-uid', false); // email_verified = false
		await assertFails(
			setDoc(doc(ctx.firestore(), 'matchInvites', 'invite2'), validInvite())
		);
	});

	it('MI3 — NO puede crear invite con hostUserId ajeno', async () => {
		const ctx = userCtx('other-uid');
		await assertFails(
			setDoc(doc(ctx.firestore(), 'matchInvites', 'invite3'), {
				...validInvite(),
				hostUserId: 'host-uid' // != other-uid
			})
		);
	});

	it('MI4 — NO puede crear invite con status != pending', async () => {
		const ctx = userCtx('host-uid');
		await assertFails(
			setDoc(doc(ctx.firestore(), 'matchInvites', 'invite4'), {
				...validInvite(),
				status: 'accepted'
			})
		);
	});

	it('MI5 — NO puede crear invite con expiresAt a 48h', async () => {
		const ctx = userCtx('host-uid');
		await assertFails(
			setDoc(doc(ctx.firestore(), 'matchInvites', 'invite5'), {
				...validInvite(),
				expiresAt: Timestamp.fromDate(new Date(Date.now() + 1000 * 60 * 60 * 48))
			})
		);
	});

	it('MI6 — NO puede crear invite con guestUserId vacío', async () => {
		const ctx = userCtx('host-uid');
		await assertFails(
			setDoc(doc(ctx.firestore(), 'matchInvites', 'invite6'), {
				...validInvite(),
				guestUserId: ''
			})
		);
	});

	it('MI7 — NO puede crear invite con guestUserId de 500 chars', async () => {
		const ctx = userCtx('host-uid');
		await assertFails(
			setDoc(doc(ctx.firestore(), 'matchInvites', 'invite7'), {
				...validInvite(),
				guestUserId: 'a'.repeat(500)
			})
		);
	});

	it('MI8 — NO puede crear invite con guestUserName de 500 chars', async () => {
		const ctx = userCtx('host-uid');
		await assertFails(
			setDoc(doc(ctx.firestore(), 'matchInvites', 'invite8'), {
				...validInvite(),
				guestUserName: 'a'.repeat(500)
			})
		);
	});
});

// -------------------------------------------------------------------------
// PageViewStats
// -------------------------------------------------------------------------

describe('PageViewStats', () => {
	it('PS1 — usuario normal NO puede escribir pageViewStats', async () => {
		const ctx = userCtx('regular-user');
		await assertFails(
			setDoc(doc(ctx.firestore(), 'pageViewStats', '2026-04-16'), { totalViews: 9999 })
		);
	});

	it('PS2 — admin puede escribir pageViewStats', async () => {
		await setupUser('admin-uid', { isAdmin: true });
		const ctx = userCtx('admin-uid');
		await assertSucceeds(
			setDoc(doc(ctx.firestore(), 'pageViewStats', '2026-04-16'), { totalViews: 1 })
		);
	});

	it('PS3 — anónimo NO puede escribir pageViewStats', async () => {
		const ctx = anonCtx();
		await assertFails(
			setDoc(doc(ctx.firestore(), 'pageViewStats', '2026-04-16'), { totalViews: 0 })
		);
	});
});

// -------------------------------------------------------------------------
// PageViews (individual analytics events)
// -------------------------------------------------------------------------

describe('PageViews', () => {
	it('PV1 — usuario autenticado puede crear pageView con payload válido', async () => {
		const ctx = userCtx('user1');
		await assertSucceeds(
			setDoc(doc(ctx.firestore(), 'pageViews', 'view1'), {
				userId: 'user1',
				path: '/tournament/abc',
				referrer: 'https://google.com',
				userAgent: 'Mozilla/5.0'
			})
		);
	});

	it('PV2 — NO puede crear pageView con path de 1000 chars', async () => {
		const ctx = userCtx('user1');
		await assertFails(
			setDoc(doc(ctx.firestore(), 'pageViews', 'view2'), {
				userId: 'user1',
				path: '/t/' + 'x'.repeat(1000)
			})
		);
	});

	it('PV3 — NO puede crear pageView con userAgent de 1000 chars', async () => {
		const ctx = userCtx('user1');
		await assertFails(
			setDoc(doc(ctx.firestore(), 'pageViews', 'view3'), {
				userId: 'user1',
				userAgent: 'A'.repeat(1000)
			})
		);
	});
});

// -------------------------------------------------------------------------
// Venues
// -------------------------------------------------------------------------

describe('Venues', () => {
	async function setupVenue(id: string, ownerId: string) {
		await testEnv.withSecurityRulesDisabled(async (ctx) => {
			await setDoc(doc(ctx.firestore(), 'venues', id), {
				name: 'Test Venue',
				ownerId,
				address: 'Calle Test 1'
			});
		});
	}

	it('V1 — super-admin puede leer cualquier venue', async () => {
		await setupUser('superadmin-uid', { isAdmin: true, isSuperAdmin: true });
		await setupVenue('v1', 'other-uid');
		const ctx = userCtx('superadmin-uid');
		await assertSucceeds(getDoc(doc(ctx.firestore(), 'venues', 'v1')));
	});

	it('V2 — admin normal NO puede leer venue de otro owner', async () => {
		await setupUser('admin-uid', { isAdmin: true, isSuperAdmin: false });
		await setupVenue('v2', 'other-uid');
		const ctx = userCtx('admin-uid');
		await assertFails(getDoc(doc(ctx.firestore(), 'venues', 'v2')));
	});

	it('V3 — admin puede leer venue propio', async () => {
		await setupUser('admin-uid', { isAdmin: true, isSuperAdmin: false });
		await setupVenue('v3', 'admin-uid');
		const ctx = userCtx('admin-uid');
		await assertSucceeds(getDoc(doc(ctx.firestore(), 'venues', 'v3')));
	});

	it('V4 — usuario no-admin NO puede leer venues', async () => {
		await setupUser('user1', { isAdmin: false });
		await setupVenue('v4', 'user1');
		const ctx = userCtx('user1');
		await assertFails(getDoc(doc(ctx.firestore(), 'venues', 'v4')));
	});
});

// -------------------------------------------------------------------------
// Critical attack vector regression tests
// -------------------------------------------------------------------------

describe('Attack vectors — deben fallar siempre', () => {
	it('ATTACK1 — anónimo NO puede forzar status COMPLETED para obtener ranking', async () => {
		await setupTournament('attack1', {
			status: 'FINAL_STAGE',
			ownerId: 'owner-uid',
			participants: [{ userId: 'attacker', finalPosition: null }]
		});
		const ctx = anonCtx();
		await assertFails(
			updateDoc(doc(ctx.firestore(), 'tournaments', 'attack1'), {
				status: 'COMPLETED',
				participants: [{ userId: 'attacker', finalPosition: 1 }]
			})
		);
	});

	it('ATTACK2 — usuario normal NO puede cambiar rankingConfig.tier para más puntos', async () => {
		await setupTournament('attack2', {
			status: 'DRAFT',
			ownerId: 'owner-uid',
			rankingConfig: { tier: 'LOCAL' }
		});
		const ctx = userCtx('random-user');
		await assertFails(
			updateDoc(doc(ctx.firestore(), 'tournaments', 'attack2'), {
				rankingConfig: { tier: 'SERIES_35' }
			})
		);
	});

	it('ATTACK3 — usuario NO puede inflar su propio ranking directamente', async () => {
		await setupUser('attacker', { tournaments: [] });
		const ctx = userCtx('attacker');
		await assertFails(
			updateDoc(doc(ctx.firestore(), 'users', 'attacker'), {
				tournaments: [{ tournamentId: 'fake', rankingDelta: 9999, finalPosition: 1 }]
			})
		);
	});

	it('ATTACK4 — usuario NO puede autopromocionar a admin', async () => {
		await setupUser('attacker', { isAdmin: false });
		const ctx = userCtx('attacker');
		await assertFails(
			updateDoc(doc(ctx.firestore(), 'users', 'attacker'), { isAdmin: true })
		);
	});

	it('ATTACK5 — usuario NO puede corromper pageViewStats de analytics', async () => {
		const ctx = userCtx('random-user');
		await assertFails(
			setDoc(doc(ctx.firestore(), 'pageViewStats', '2026-04-16'), { totalViews: 9999999 })
		);
	});

	it('ATTACK6 — anónimo NO puede inscribirse en un torneo', async () => {
		await setupTournament('attack6', { status: 'DRAFT', ownerId: 'owner-uid' });
		const ctx = anonCtx();
		await assertFails(
			updateDoc(doc(ctx.firestore(), 'tournaments', 'attack6'), {
				participants: [{ userId: 'hacker', playerName: 'Ghost' }]
			})
		);
	});

	it('ATTACK7 — admin NO puede auto-escalar a super-admin', async () => {
		// Rogue admin tries to grant themselves isSuperAdmin via direct Firestore write.
		await setupUser('rogue-admin', { isAdmin: true, isSuperAdmin: false });
		const ctx = userCtx('rogue-admin');
		await assertFails(
			updateDoc(doc(ctx.firestore(), 'users', 'rogue-admin'), { isSuperAdmin: true })
		);
	});

	it('ATTACK8 — admin NO puede promocionar a un aliado a super-admin', async () => {
		// Rogue admin tries to escalate a cooperative user to super-admin.
		await setupUser('rogue-admin', { isAdmin: true, isSuperAdmin: false });
		await setupUser('ally', { isAdmin: false, isSuperAdmin: false });
		const ctx = userCtx('rogue-admin');
		await assertFails(
			updateDoc(doc(ctx.firestore(), 'users', 'ally'), {
				isAdmin: true,
				isSuperAdmin: true
			})
		);
	});
});
