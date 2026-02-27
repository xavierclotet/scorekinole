import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getAnalytics, type Analytics } from 'firebase/analytics';
import { getMessaging, type Messaging } from 'firebase/messaging';
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
let storage: FirebaseStorage | null = null;
let analytics: Analytics | null = null;

if (browser && isFirebaseEnabled()) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    analytics = getAnalytics(app);
    console.log('✅ Firebase initialized successfully');
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
  }
}

/**
 * Get Firebase Messaging instance (lazy initialization).
 * Only call this when the user has granted notification permission.
 */
let messaging: Messaging | null = null;

export function getFirebaseMessaging(): Messaging | null {
  if (!browser || !app) return null;
  if (!messaging) {
    try {
      messaging = getMessaging(app);
    } catch (error) {
      console.error('❌ Firebase Messaging initialization error:', error);
      return null;
    }
  }
  return messaging;
}

export { app, auth, db, storage, analytics };
