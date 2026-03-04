import { db } from '$lib/firebase/config';
import { collection, getDocs, writeBatch, doc, Timestamp } from 'firebase/firestore';

export const FIRESTORE_COLLECTIONS = [
	'tournaments',
	'users',
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
		return Timestamp.fromDate(new Date(value.value));
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
 * Restore documents to a Firestore collection using batched writes
 */
export async function restoreDocuments(
	collectionName: string,
	documents: Record<string, any>,
	onProgress?: (restored: number, total: number) => void
): Promise<number> {
	if (!db) throw new Error('Firebase no está inicializado');

	const entries = Object.entries(documents);
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
