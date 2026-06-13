import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore
} from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import type { Messaging } from 'firebase/messaging';
import { browser } from '$app/environment';

// Check if Firebase is enabled
export const isFirebaseEnabled = (): boolean => {
  return import.meta.env.VITE_FIREBASE_ENABLED === 'true';
};

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase only if enabled, configured, and in browser (avoid SSR issues)
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (browser && isFirebaseEnabled()) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    // Persistent IndexedDB cache: instant reads of already-seen docs, offline
    // write queueing, cache-first onSnapshot. Multi-tab safe. Falls back to
    // in-memory cache automatically on browsers without IndexedDB.
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      // Optional document fields (e.g. pointsToWin in rounds mode, eventEdition for
      // non-event matches, savedBy when logged out) are legitimately undefined.
      // Firestore rejects undefined in setDoc/updateDoc by default, which silently
      // dropped friendly matches. Omitting undefined fields instead fixes that class
      // of error across every write.
      ignoreUndefinedProperties: true
    });
    // Firebase initialized (errors are logged below)
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
  }
}

/**
 * Get Firebase Storage instance (lazy — keeps the storage SDK out of the
 * initial bundle; it is only needed for avatar upload/delete).
 */
let storage: FirebaseStorage | null = null;

export async function getFirebaseStorage(): Promise<FirebaseStorage | null> {
  if (!browser || !app) return null;
  if (!storage) {
    try {
      const { getStorage } = await import('firebase/storage');
      storage = getStorage(app);
    } catch (error) {
      console.error('❌ Firebase Storage initialization error:', error);
      return null;
    }
  }
  return storage;
}

/**
 * Get Firebase Messaging instance (lazy — keeps the messaging SDK out of the
 * initial bundle). Only call this when the user has granted notification permission.
 */
let messaging: Messaging | null = null;

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (!browser || !app) return null;
  if (!messaging) {
    try {
      const { getMessaging } = await import('firebase/messaging');
      messaging = getMessaging(app);
    } catch (error) {
      console.error('❌ Firebase Messaging initialization error:', error);
      return null;
    }
  }
  return messaging;
}

export { app, auth, db };
