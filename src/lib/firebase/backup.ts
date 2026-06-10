import { db } from '$lib/firebase/config';
import { isSuperAdmin } from './admin';
import {
	collection,
	getDocs,
	getCountFromServer,
	query,
	limit,
	writeBatch,
	doc,
	Timestamp
} from 'firebase/firestore';

// Top-level collections of the app. 'pairs' (doubles pair ranking/history,
// written by Cloud Functions) was missing — backups silently excluded it.
// NOTE: subcollections (users/{id}/fcmTokens) are NOT exported; FCM tokens
// regenerate when devices re-register, so that loss is acceptable.
export const FIRESTORE_COLLECTIONS = [
	'tournaments',
	'users',
	'pairs',
	'matches',
	'venues',
	'matchInvites',
	'pageViews',
	'pageViewStats'
] as const;

export type CollectionName = (typeof FIRESTORE_COLLECTIONS)[number];

export interface BackupMetadata {
	date: string;
	collections: string[];
	documentCount: number;
}

export interface BackupData {
	metadata: BackupMetadata;
	data: Record<string, Record<string, any>>;
}

/**
 * Convert Firestore Timestamps to ISO strings recursively
 */
function serializeValue(value: any): any {
	if (value === null || value === undefined) return value;
	if (value instanceof Timestamp) return { __timestamp: true, value: value.toDate().toISOString() };
	if (Array.isArray(value)) return value.map(serializeValue);
	if (typeof value === 'object' && value !== null) {
		const result: Record<string, any> = {};
		for (const [k, v] of Object.entries(value)) {
			result[k] = serializeValue(v);
		}
		return result;
	}
	return value;
}

/**
 * Convert ISO strings back to Firestore Timestamps recursively
 */
function deserializeValue(value: any): any {
	if (value === null || value === undefined) return value;
	if (
		typeof value === 'object' &&
		value !== null &&
		value.__timestamp === true &&
		typeof value.value === 'string'
	) {
		const date = new Date(value.value);
		// Corrupted timestamp string: keep the raw marker object instead of
		// throwing mid-restore (earlier batches would already be committed)
		if (isNaN(date.getTime())) return value;
		return Timestamp.fromDate(date);
	}
	if (Array.isArray(value)) return value.map(deserializeValue);
	if (typeof value === 'object' && value !== null) {
		const result: Record<string, any> = {};
		for (const [k, v] of Object.entries(value)) {
			result[k] = deserializeValue(v);
		}
		return result;
	}
	return value;
}

/**
 * Export selected Firestore collections as a backup object
 */
export async function exportCollections(collectionNames: string[]): Promise<BackupData> {
	if (!db) throw new Error('Firebase no está inicializado');

	// Defense in depth: the page is SuperAdminGuard-ed, but every other admin
	// function checks client-side too (rules are the real enforcement)
	if (!(await isSuperAdmin())) throw new Error('No autorizado: se requiere super admin');

	const data: Record<string, Record<string, any>> = {};
	let totalDocs = 0;

	for (const name of collectionNames) {
		const snapshot = await getDocs(collection(db, name));
		const docs: Record<string, any> = {};

		snapshot.forEach((docSnap) => {
			docs[docSnap.id] = serializeValue(docSnap.data());
			totalDocs++;
		});

		data[name] = docs;
	}

	return {
		metadata: {
			date: new Date().toISOString(),
			collections: collectionNames,
			documentCount: totalDocs
		},
		data
	};
}

/**
 * Preview a collection WITHOUT downloading it entirely — the export preview
 * used exportCollections([name]), which froze the tab on large collections
 * (pageViews). Returns the first `maxDocs` documents plus the total count.
 */
export async function previewCollectionDocs(
	collectionName: string,
	maxDocs = 50
): Promise<{ docs: Record<string, any>; total: number }> {
	if (!db) throw new Error('Firebase no está inicializado');
	if (!(await isSuperAdmin())) throw new Error('No autorizado: se requiere super admin');

	const colRef = collection(db, collectionName);
	const [countSnapshot, snapshot] = await Promise.all([
		getCountFromServer(colRef),
		getDocs(query(colRef, limit(maxDocs)))
	]);

	const docs: Record<string, any> = {};
	snapshot.forEach((docSnap) => {
		docs[docSnap.id] = serializeValue(docSnap.data());
	});

	return { docs, total: countSnapshot.data().count };
}

/**
 * Restore documents to a Firestore collection using batched writes
 */
export async function restoreDocuments(
	collectionName: string,
	documents: Record<string, any>,
	onProgress?: (restored: number, total: number) => void
): Promise<number> {
	if (!db) throw new Error('Firebase no está inicializado');

	// The collection name comes from the uploaded JSON file — restrict writes
	// to known collections (a tampered/foreign backup could target anything)
	if (!(FIRESTORE_COLLECTIONS as readonly string[]).includes(collectionName)) {
		throw new Error(`Colección desconocida: ${collectionName}`);
	}

	if (!(await isSuperAdmin())) throw new Error('No autorizado: se requiere super admin');

	const entries = Object.entries(documents);

	// Validate BEFORE writing anything: a malformed entry throwing mid-loop
	// would leave a partial restore (earlier batches already committed)
	for (const [docId, docData] of entries) {
		if (!docData || typeof docData !== 'object' || Array.isArray(docData)) {
			throw new Error(`Documento inválido en el backup: ${collectionName}/${docId}`);
		}
	}

	const total = entries.length;
	let restored = 0;

	// Firestore batch limit is 500
	for (let i = 0; i < entries.length; i += 500) {
		const batch = writeBatch(db);
		const chunk = entries.slice(i, i + 500);

		for (const [docId, docData] of chunk) {
			const ref = doc(db, collectionName, docId);
			batch.set(ref, deserializeValue(docData));
		}

		await batch.commit();
		restored += chunk.length;
		onProgress?.(restored, total);
	}

	return restored;
}

/**
 * Download an object as a JSON file
 */
export function downloadJson(data: object, filename: string): void {
	const json = JSON.stringify(data, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
