import { signInWithGoogle, signOut, onAuthChange, getCurrentUser } from '../firebase/auth.js';
import { getUserProfile, saveUserProfile, getPlayerName } from '../firebase/userProfile.js';
import { isFirebaseEnabled } from '../firebase/config.js';

// Auth UI state
let currentPlayerName = '';

/**
 * Initialize auth UI
 */
export function initAuthUI() {
  if (!isFirebaseEnabled()) {
    console.log('Firebase disabled - auth UI hidden');
    const authBtn = document.getElementById('btnAuth');
    if (authBtn) authBtn.style.display = 'none';
    return;
  }

  // Listen to auth state changes
  onAuthChange(async (user) => {
    await updateAuthUI(user);
  });
}

/**
 * Update auth UI based on user state
 * @param {Object|null} user Current user or null
 */
async function updateAuthUI(user) {
  const authBtn = document.getElementById('btnAuth');
  const authText = document.getElementById('authText');
  const authIcon = document.getElementById('authIcon');

  if (!authBtn || !authText || !authIcon) return;

  if (user) {
    // User is signed in
    authIcon.textContent = '👋';

    // Load user profile
    const profile = await getUserProfile();
    console.log('🔍 Profile loaded:', profile);

    if (!profile || !profile.playerName) {
      // First time user - show player name modal and use Google name temporarily
      console.log('⚠️ No profile or playerName, using Google name:', user.name);
      authText.textContent = user.name || 'Sign Out';
      showPlayerNameModal();
    } else {
      // Load player name and show it in the button
      currentPlayerName = profile.playerName;
      authText.textContent = currentPlayerName;
      console.log('✅ Auth button updated to:', currentPlayerName);
      updateTeam1NameWithPlayer();
    }
  } else {
    // User is signed out
    authIcon.textContent = '👤';
    authText.textContent = 'Sign In';
    currentPlayerName = '';
  }
}

/**
 * Handle auth button click
 */
export async function handleAuthClick() {
  const user = getCurrentUser();

  if (user) {
    // Sign out
    if (confirm('Are you sure you want to sign out?')) {
      try {
        await signOut();
        console.log('User signed out');
      } catch (error) {
        console.error('Error signing out:', error);
        alert('Error signing out. Please try again.');
      }
    }
  } else {
    // Sign in
    try {
      await signInWithGoogle();
      console.log('User signed in');
    } catch (error) {
      console.error('Error signing in:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('Sign in cancelled by user');
      } else {
        alert('Error signing in with Google. Please try again.');
      }
    }
  }
}

/**
 * Show player name modal
 */
function showPlayerNameModal() {
  const modal = document.getElementById('playerNameModal');
  const input = document.getElementById('playerNameInput');

  if (!modal || !input) return;

  const user = getCurrentUser();
  if (user) {
    // Pre-fill with Google display name
    input.value = user.name || '';
  }

  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 100);
}

/**
 * Save player name from modal
 */
export async function savePlayerName() {
  const input = document.getElementById('playerNameInput');
  const modal = document.getElementById('playerNameModal');
  const authText = document.getElementById('authText');

  if (!input || !modal) return;

  const playerName = input.value.trim();

  if (!playerName) {
    alert('Please enter a player name');
    return;
  }

  try {
    await saveUserProfile(playerName);
    currentPlayerName = playerName;

    // Update auth button text with player name
    if (authText) {
      authText.textContent = playerName;
    }

    updateTeam1NameWithPlayer();
    modal.style.display = 'none';
  } catch (error) {
    console.error('Error saving player name:', error);
    alert('Error saving player name. Please try again.');
  }
}

/**
 * Update Team 1 name with current player name
 */
function updateTeam1NameWithPlayer() {
  if (!currentPlayerName) return;

  // Find Team 1 name input by ID
  const team1Input = document.getElementById('team1NameInput');
  if (team1Input) {
    team1Input.value = currentPlayerName;
    // Trigger any change events if needed
    team1Input.dispatchEvent(new Event('input', { bubbles: true }));
    team1Input.dispatchEvent(new Event('change', { bubbles: true }));
    console.log('✅ Team 1 name set to:', currentPlayerName);
  } else {
    console.warn('Team 1 input not found');
  }
}

/**
 * Get current player name
 * @returns {string} Current player name or empty string
 */
export function getCurrentPlayerName() {
  return currentPlayerName;
}

// Make functions available globally
window.handleAuthClick = handleAuthClick;
window.savePlayerName = savePlayerName;
