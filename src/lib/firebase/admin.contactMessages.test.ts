/**
 * Tests for the contact-messages admin helpers in admin.ts
 * (getContactMessagesPaginated / markContactMessageRead / deleteContactMessage),
 * backing /admin/contact-messages.
 *
 * Covers:
 * - Pagination: page mapping, lastDoc cursor, hasMore edges (exact-full page)
 * - Filters: unread/read add the where('read'...) constraint, 'all' doesn't
 * - totalCount counts the same subset the filter shows (header badge)
 * - Query errors propagate to the caller (the page shows an error state)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock state ──────────────────────────────────────────────────────────────

let mockDocs: { id: string; data: Record<string, any> }[] = [];
let getDocsError: Error | null = null;
let capturedQueries: any[] = [];
let capturedCountTargets: any[] = [];
let updateDocCalls: { path: string; data: any }[] = [];
let deleteDocCalls: string[] = [];

// ─── vi.mock setup ──────────────────────────────────────────────────────────

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('./config', () => ({
	db: {},
	isFirebaseEnabled: () => true
}));

vi.mock('./auth', () => ({
	currentUser: {
		subscribe: (fn: any) => {
			fn({ id: 'admin-user' });
			return () => {};
		}
	}
}));

vi.mock('./userProfile', () => ({
	getUserProfile: async () => ({ isAdmin: true }),
	getUserProfileById: async () => null
}));

vi.mock('firebase/functions', () => ({
	getFunctions: vi.fn(() => ({ app: {} })),
	httpsCallable: vi.fn()
}));

vi.mock('firebase/app', () => ({
	getApp: vi.fn(() => ({ name: '[DEFAULT]' }))
}));

vi.mock('firebase/firestore', () => ({
	doc: (_db: any, collectionName: string, id: string) => ({
		path: `${collectionName}/${id}`,
		id,
		_collection: collectionName
	}),
	collection: (_db: any, name: string) => ({ _collection: name }),
	query: (ref: any, ...constraints: any[]) => ({ _query: true, ref, constraints }),
	where: (field: string, op: string, value: any) => ({ _type: 'where', field, op, value }),
	orderBy: (field: string, dir?: string) => ({ _type: 'orderBy', field, dir }),
	limit: (n: number) => ({ _type: 'limit', n }),
	startAfter: (docSnap: any) => ({ _type: 'startAfter', docSnap }),
	getCountFromServer: async (target: any) => {
		capturedCountTargets.push(target);
		// Supports both a bare collection ref and a query with a where filter,
		// mirroring the real aggregate count.
		const whereC = target._query
			? target.constraints.find((c: any) => c._type === 'where')
			: null;
		const docs = whereC ? mockDocs.filter((d) => d.data[whereC.field] === whereC.value) : mockDocs;
		return { data: () => ({ count: docs.length }) };
	},
	getDocs: async (q: any) => {
		if (getDocsError) throw getDocsError;
		capturedQueries.push(q);
		const whereC = q.constraints.find((c: any) => c._type === 'where');
		const limitC = q.constraints.find((c: any) => c._type === 'limit');
		let docs = mockDocs;
		if (whereC) docs = docs.filter((d) => d.data[whereC.field] === whereC.value);
		if (limitC) docs = docs.slice(0, limitC.n);
		const snaps = docs.map((d) => ({ id: d.id, data: () => ({ ...d.data }) }));
		return {
			docs: snaps,
			forEach: (cb: (snap: { id: string; data: () => any }) => void) => snaps.forEach(cb)
		};
	},
	getDoc: async () => ({ exists: () => false, data: () => undefined }),
	setDoc: async () => {},
	updateDoc: async (ref: any, data: any) => {
		updateDocCalls.push({ path: ref.path, data });
	},
	deleteDoc: async (ref: any) => {
		deleteDocCalls.push(ref.path);
	},
	serverTimestamp: () => 'SERVER_TIMESTAMP',
	deleteField: () => '__DELETE_FIELD__',
	arrayRemove: (...args: any[]) => args,
	arrayUnion: (...args: any[]) => args,
	runTransaction: async () => {}
}));

// Dynamic import after mocks
const { getContactMessagesPaginated, markContactMessageRead, deleteContactMessage } = await import(
	'./admin'
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMsg(id: string, read = false) {
	return {
		id,
		data: {
			name: `User ${id}`,
			email: `${id}@example.com`,
			message: `Message body for ${id} long enough`,
			createdAt: null,
			ip: '1.2.3.4',
			read
		}
	};
}

beforeEach(() => {
	mockDocs = [];
	getDocsError = null;
	capturedQueries = [];
	capturedCountTargets = [];
	updateDocCalls = [];
	deleteDocCalls = [];
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getContactMessagesPaginated — paginación', () => {
	it('mapea los docs con su id y devuelve hasMore=false cuando la página no se llena', async () => {
		mockDocs = [makeMsg('m1'), makeMsg('m2')];

		const result = await getContactMessagesPaginated(5, null, 'all');

		expect(result.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
		expect(result.messages[0].email).toBe('m1@example.com');
		expect(result.hasMore).toBe(false);
		expect(result.lastDoc?.id).toBe('m2');
		expect(result.totalCount).toBe(2);
	});

	it('página vacía → lastDoc null, hasMore false, sin mensajes', async () => {
		const result = await getContactMessagesPaginated(5, null, 'all');
		expect(result.messages).toEqual([]);
		expect(result.lastDoc).toBeNull();
		expect(result.hasMore).toBe(false);
	});

	it('edge: última página exactamente llena → hasMore=true aunque no queden docs (provoca una petición extra vacía; inofensivo)', async () => {
		mockDocs = [makeMsg('m1'), makeMsg('m2'), makeMsg('m3')];

		const result = await getContactMessagesPaginated(3, null, 'all');

		expect(result.messages).toHaveLength(3);
		expect(result.hasMore).toBe(true);
	});

	it('incluye startAfter solo cuando se pasa cursor, y limit siempre', async () => {
		mockDocs = [makeMsg('m1')];

		await getContactMessagesPaginated(5, null, 'all');
		const first = capturedQueries[0].constraints;
		expect(first.some((c: any) => c._type === 'startAfter')).toBe(false);
		expect(first.find((c: any) => c._type === 'limit')?.n).toBe(5);

		const cursor = { id: 'm1' } as any;
		await getContactMessagesPaginated(5, cursor, 'all');
		const second = capturedQueries[1].constraints;
		const sa = second.find((c: any) => c._type === 'startAfter');
		expect(sa?.docSnap).toBe(cursor);
	});
});

describe('getContactMessagesPaginated — filtros', () => {
	it("filter 'unread' añade where('read','==',false) y solo devuelve no leídos", async () => {
		mockDocs = [makeMsg('m1', true), makeMsg('m2', false), makeMsg('m3', false)];

		const result = await getContactMessagesPaginated(10, null, 'unread');

		const whereC = capturedQueries[0].constraints.find((c: any) => c._type === 'where');
		expect(whereC).toMatchObject({ field: 'read', op: '==', value: false });
		expect(result.messages.map((m) => m.id)).toEqual(['m2', 'm3']);
	});

	it("filter 'read' añade where('read','==',true)", async () => {
		mockDocs = [makeMsg('m1', true), makeMsg('m2', false)];

		const result = await getContactMessagesPaginated(10, null, 'read');

		const whereC = capturedQueries[0].constraints.find((c: any) => c._type === 'where');
		expect(whereC).toMatchObject({ field: 'read', op: '==', value: true });
		expect(result.messages.map((m) => m.id)).toEqual(['m1']);
	});

	it("filter 'all' no añade where y ordena por createdAt desc", async () => {
		mockDocs = [makeMsg('m1')];

		await getContactMessagesPaginated(10, null, 'all');

		const constraints = capturedQueries[0].constraints;
		expect(constraints.some((c: any) => c._type === 'where')).toBe(false);
		expect(constraints.find((c: any) => c._type === 'orderBy')).toMatchObject({
			field: 'createdAt',
			dir: 'desc'
		});
	});

	it('totalCount cuenta el mismo subconjunto que muestra el filtro (badge correcto en Unread/Read)', async () => {
		mockDocs = [makeMsg('m1', true), makeMsg('m2', true), makeMsg('m3', false)];

		const result = await getContactMessagesPaginated(10, null, 'unread');

		expect(result.messages).toHaveLength(1);
		expect(result.totalCount).toBe(1);
		// El count se pide sobre una query con el mismo where del filtro:
		expect(capturedCountTargets[0]._query).toBe(true);
		expect(
			capturedCountTargets[0].constraints.find((c: any) => c._type === 'where')
		).toMatchObject({ field: 'read', op: '==', value: false });
	});

	it("con filtro 'all' el count se pide sobre la colección completa", async () => {
		mockDocs = [makeMsg('m1', true), makeMsg('m2', false)];

		const result = await getContactMessagesPaginated(10, null, 'all');

		expect(result.totalCount).toBe(2);
		expect(capturedCountTargets[0]).toMatchObject({ _collection: 'contactMessages' });
		expect(capturedCountTargets[0]._query).toBeUndefined();
	});
});

describe('getContactMessagesPaginated — errores', () => {
	it('un error de la query (p.ej. índice ausente) se propaga al caller — la página muestra estado de error en vez de "No messages"', async () => {
		mockDocs = [makeMsg('m1')];
		getDocsError = new Error('The query requires an index');

		await expect(getContactMessagesPaginated(10, null, 'unread')).rejects.toThrow(
			'The query requires an index'
		);
	});
});

describe('markContactMessageRead / deleteContactMessage', () => {
	it('markContactMessageRead escribe el flag en el doc correcto', async () => {
		await markContactMessageRead('msg-1', true);
		expect(updateDocCalls).toEqual([{ path: 'contactMessages/msg-1', data: { read: true } }]);

		await markContactMessageRead('msg-1', false);
		expect(updateDocCalls[1]).toEqual({ path: 'contactMessages/msg-1', data: { read: false } });
	});

	it('deleteContactMessage borra el doc correcto', async () => {
		await deleteContactMessage('msg-2');
		expect(deleteDocCalls).toEqual(['contactMessages/msg-2']);
	});
});
