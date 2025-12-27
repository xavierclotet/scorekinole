import { signInWithGoogle, signOut, onAuthChange, getCurrentUser } from '../firebase/auth.js';
import { getUserProfile, saveUserProfile, getPlayerName } from '../firebase/userProfile.js';
import { isFirebaseEnabled } from '../firebase/config.js';
import { setTeam1Name } from './app.js';

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

    // Load user profile
    const profile = await getUserProfile();
    console.log('🔍 Profile loaded:', profile);

    // Use profile photo or fallback to user photo
    const photoURL = profile?.photoURL || user.photo;
    if (photoURL) {
      authIcon.innerHTML = `<img src="${photoURL}" alt="Profile" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">`;
    } else {
      authIcon.textContent = '👋';
    }

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

      // Update Team 1 with player name and photo
      updateTeam1NameWithPlayer(photoURL);
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
    const profile = await saveUserProfile(playerName);
    currentPlayerName = playerName;

    // Update auth button text with player name
    if (authText) {
      authText.textContent = playerName;
    }

    // Get photo URL from profile or current user
    const user = getCurrentUser();
    const photoURL = profile?.photoURL || user?.photo;

    updateTeam1NameWithPlayer(photoURL);
    modal.style.display = 'none';
  } catch (error) {
    console.error('Error saving player name:', error);
    alert('Error saving player name. Please try again.');
  }
}

/**
 * Update Team 1 name with current player name and photo
 * @param {string} photoURL - User's profile photo URL
 */
function updateTeam1NameWithPlayer(photoURL) {
  if (!currentPlayerName) return;

  // Update Team 1 state and input field
  setTeam1Name(currentPlayerName);

  const team1Input = document.getElementById('team1NameInput');
  if (team1Input) {
    team1Input.value = currentPlayerName;
    console.log('✅ Team 1 name set to:', currentPlayerName);
  }

  // Update Team 1 display with photo
  const team1NameEl = document.getElementById('team1Name');
  if (team1NameEl && photoURL) {
    // Remove existing photo if any
    const existingPhoto = team1NameEl.querySelector('.player-photo');
    if (existingPhoto) {
      existingPhoto.remove();
    }

    // Create and insert photo element
    const photoImg = document.createElement('img');
    photoImg.src = photoURL;
    photoImg.alt = 'Profile';
    photoImg.className = 'player-photo';
    photoImg.style.cssText = 'width: 2rem; height: 2rem; border-radius: 50%; object-fit: cover; margin-right: 0.5rem; vertical-align: middle;';

    // Insert photo at the beginning
    team1NameEl.insertBefore(photoImg, team1NameEl.firstChild);
    console.log('✅ Team 1 photo added');
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
