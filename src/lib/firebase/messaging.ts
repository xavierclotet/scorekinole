/**
 * Firebase Cloud Messaging (FCM) — token management and notification permissions.
 *
 * Tokens are stored in `users/{userId}/fcmTokens/{tokenHash}` so each device
 * gets its own entry and Cloud Functions can look them up when sending pushes.
 */

import { getToken, deleteToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, deleteDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { db, isFirebaseEnabled, getFirebaseMessaging } from './config';
import { currentUser } from './auth';

/**
 * Hash a string into a short hex identifier (for use as Firestore doc ID).
 */
async function hashToken(token: string): Promise<string> {
	const data = new TextEncoder().encode(token);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Request notification permission from the browser, obtain an FCM token,
 * and save it in Firestore under the current user.
 *
 * @returns The FCM token string, or null if permission was denied / unavailable.
 */
export async function requestNotificationPermission(): Promise<string | null> {
	if (!browser || !isFirebaseEnabled()) return null;

	const user = get(currentUser);
	if (!user) {
		console.warn('Cannot register push token: no authenticated user');
		return null;
	}

	// Ask for permission
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		console.log('ℹ️ Notification permission denied');
		return null;
	}

	const messaging = getFirebaseMessaging();
	if (!messaging) return null;

	try {
		// Get the service worker registration (SvelteKit registers one automatically)
		const swRegistration = await navigator.serviceWorker.ready;

		const token = await getToken(messaging, {
			vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
			serviceWorkerRegistration: swRegistration
		});

		if (token) {
			await saveFCMToken(user.id, token);
			console.log('✅ FCM token registered');
		}
		return token;
	} catch (error) {
		console.error('❌ Error getting FCM token:', error);
		return null;
	}
}

/**
 * Save (or update) an FCM token in Firestore.
 */
async function saveFCMToken(userId: string, token: string): Promise<void> {
	if (!db) return;

	const tokenId = await hashToken(token);
	const tokenRef = doc(db, 'users', userId, 'fcmTokens', tokenId);

	await setDoc(tokenRef, {
		token,
		createdAt: serverTimestamp(),
		lastUsedAt: serverTimestamp(),
		platform: 'web',
		userAgent: navigator.userAgent
	}, { merge: true });
}

/**
 * Delete all FCM tokens for the current user (call on sign-out).
 */
export async function deleteAllFCMTokens(): Promise<void> {
	if (!browser || !isFirebaseEnabled() || !db) return;

	const user = get(currentUser);
	if (!user) return;

	try {
		// Delete from FCM service (may fail if SW was never registered)
		const messaging = getFirebaseMessaging();
		if (messaging) {
			try {
				await deleteToken(messaging);
			} catch {
				// Ignore — SW may not be registered (e.g., user never enabled push)
			}
		}

		// Delete all token docs from Firestore
		const tokensRef = collection(db, 'users', user.id, 'fcmTokens');
		const snapshot = await getDocs(tokensRef);
		const deletes = snapshot.docs.map(d => deleteDoc(d.ref));
		await Promise.all(deletes);

		console.log('✅ FCM tokens deleted');
	} catch (error) {
		console.error('❌ Error deleting FCM tokens:', error);
	}
}

/**
 * Refresh the FCM token if needed (handles token rotation).
 * Firebase JS SDK v9+ removed onTokenRefresh, so we call getToken()
 * on app load and save if the token is new/changed.
 */
export async function refreshFCMTokenIfNeeded(): Promise<void> {
	if (!browser || !isFirebaseEnabled()) return;

	const user = get(currentUser);
	if (!user) return;

	const messaging = getFirebaseMessaging();
	if (!messaging) return;

	try {
		const swRegistration = await navigator.serviceWorker.ready;
		const token = await getToken(messaging, {
			vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
			serviceWorkerRegistration: swRegistration
		});

		if (token) {
			await saveFCMToken(user.id, token);
		}
	} catch {
		// Token refresh failed silently — will retry on next app load
	}
}
