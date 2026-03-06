import { auth, db, isFirebaseEnabled } from './config';
import { deleteAllFCMTokens } from './messaging';
import { doc, getDoc } from 'firebase/firestore';
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth';
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { setLocale } from '$lib/paraglide/runtime.js';

// User type
export interface User {
  id: string;
  name: string;
  email: string | null;
  photoURL: string | null;
  providerPhotoURL: string | null; // Original provider profile photo (preserved for fallback)
}

// Current user store (reactive)
export const currentUser = writable<User | null>(null);

// Flag to indicate Firebase Auth has completed its first check (restored session or confirmed no session)
export const authInitialized = writable<boolean>(false);

// Flag to indicate user needs to complete their profile (no document in users collection)
export const needsProfileSetup = writable<boolean>(false);

// Flag to indicate email verification is pending (email/password user not yet verified)
export const emailVerificationPending = writable<boolean>(false);

// Custom error code for Gmail accounts trying to register with email/password
const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];

/**
 * Check if an email is a Gmail/Google domain
 */
function isGmailDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return GMAIL_DOMAINS.includes(domain);
}

/**
 * Sign in with Google
 * @returns Promise with User object
 */
export async function signInWithGoogle(): Promise<User> {
  if (!browser) {
    throw new Error('Sign in can only be called in the browser');
  }

  if (!isFirebaseEnabled()) {
    console.warn('Firebase is disabled. Using mock authentication.');
    // Mock user for development
    const mockUser: User = {
      id: 'mock-user-123',
      name: 'Developer User',
      email: 'dev@scorekinole.com',
      photoURL: null,
      providerPhotoURL: null
    };
    currentUser.set(mockUser);
    return mockUser;
  }

  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth!, provider);
    const user = result.user;

    const appUser: User = {
      id: user.uid,
      name: user.displayName || 'Unknown',
      email: user.email,
      photoURL: user.photoURL,
      providerPhotoURL: user.photoURL
    };

    currentUser.set(appUser);
    return appUser;
  } catch (error) {
    console.error('Google sign in error:', error);
    throw error;
  }
}

/**
 * Sign up with email and password
 * Rejects Gmail domains (should use Google Sign-In instead)
 * Sends email verification after registration
 */
export async function signUpWithEmail(email: string, password: string): Promise<User> {
  if (!browser) {
    throw new Error('Sign up can only be called in the browser');
  }

  if (!isFirebaseEnabled()) {
    throw new Error('Firebase is disabled');
  }

  // Reject Gmail domains
  if (isGmailDomain(email)) {
    const error: any = new Error('Gmail accounts should use Google Sign-In');
    error.code = 'GMAIL_USE_GOOGLE_SIGNIN';
    throw error;
  }

  try {
    const result = await createUserWithEmailAndPassword(auth!, email, password);
    const user = result.user;

    // Send verification email
    await sendEmailVerification(user);
    emailVerificationPending.set(true);

    const appUser: User = {
      id: user.uid,
      name: user.email?.split('@')[0] || 'User',
      email: user.email,
      photoURL: null,
      providerPhotoURL: null
    };

    currentUser.set(appUser);
    return appUser;
  } catch (error) {
    console.error('Email sign up error:', error);
    throw error;
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  if (!browser) {
    throw new Error('Sign in can only be called in the browser');
  }

  if (!isFirebaseEnabled()) {
    throw new Error('Firebase is disabled');
  }

  try {
    const result = await signInWithEmailAndPassword(auth!, email, password);
    const user = result.user;

    // Check if email is verified
    if (!user.emailVerified) {
      emailVerificationPending.set(true);
    }

    const appUser: User = {
      id: user.uid,
      name: user.displayName || user.email?.split('@')[0] || 'User',
      email: user.email,
      photoURL: user.photoURL,
      providerPhotoURL: user.photoURL
    };

    currentUser.set(appUser);
    return appUser;
  } catch (error) {
    console.error('Email sign in error:', error);
    throw error;
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<void> {
  if (!browser || !isFirebaseEnabled()) {
    throw new Error('Firebase is disabled');
  }

  await sendPasswordResetEmail(auth!, email);
}

/**
 * Resend email verification to current user
 */
export async function resendVerificationEmail(): Promise<void> {
  if (!browser || !isFirebaseEnabled()) {
    throw new Error('Firebase is disabled');
  }

  const user = auth?.currentUser;
  if (!user) {
    throw new Error('No user signed in');
  }

  await sendEmailVerification(user);
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  if (!browser) {
    return;
  }

  if (!isFirebaseEnabled()) {
    currentUser.set(null);
    return;
  }

  try {
    // Delete FCM tokens before signing out (while we still have the user ID)
    await deleteAllFCMTokens();
    await firebaseSignOut(auth!);
    currentUser.set(null);
    emailVerificationPending.set(false);
    // User signed out
  } catch (error) {
    console.error('❌ Sign out error:', error);
    throw error;
  }
}

/**
 * Initialize auth state listener
 * Call this on app initialization
 */
export function initAuthListener(): void {
  if (!browser) {
    return;
  }

  if (!isFirebaseEnabled()) {
    // Firebase disabled - using local auth only
    authInitialized.set(true);
    return;
  }

  onAuthStateChanged(auth!, async (user: FirebaseUser | null) => {
    if (user) {
      // Check if this is an email/password user with unverified email
      const isPasswordProvider = user.providerData.some(p => p.providerId === 'password');
      if (isPasswordProvider && !user.emailVerified) {
        // Email not verified — blocking full access
        emailVerificationPending.set(true);

        const appUser: User = {
          id: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email,
          photoURL: null,
          providerPhotoURL: null
        };
        currentUser.set(appUser);
        authInitialized.set(true);
        return; // Do NOT create profile in Firestore
      }

      // Email is verified or user is Google provider — normal flow
      emailVerificationPending.set(false);

      // Start with auth provider data (preserve provider photo for fallback)
      const providerPhotoURL = user.photoURL;
      let appUser: User = {
        id: user.uid,
        name: user.displayName || 'Unknown',
        email: user.email,
        photoURL: user.photoURL,
        providerPhotoURL: providerPhotoURL
      };

      // Check if user has a document in the users collection
      try {
        const userDocRef = doc(db!, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          // User authenticated but no profile in Firestore - needs setup
          needsProfileSetup.set(true);
        } else {
          // User has profile in Firestore
          needsProfileSetup.set(false);

          // Use Firestore profile data (custom photo, player name, language)
          const profile = userDocSnap.data();
          if (profile) {
            appUser = {
              ...appUser,
              name: profile.playerName || appUser.name,
              // Use custom photo if set, otherwise fall back to Google photo
              photoURL: profile.photoURL || providerPhotoURL
            };

            // Apply user's language preference if set
            if (profile.language && ['es', 'ca', 'en'].includes(profile.language)) {
              // Apply language preference silently
              setLocale(profile.language, { reload: false });
            }
          }
        }
      } catch (error) {
        console.error('❌ Error checking user profile:', error);
        needsProfileSetup.set(false);
      }

      currentUser.set(appUser);
    } else {
      currentUser.set(null);
      needsProfileSetup.set(false);
      emailVerificationPending.set(false);
    }

    // Mark auth as initialized AFTER currentUser has its final value
    // This ensures derived stores see the complete state
    authInitialized.set(true);
  });
}
