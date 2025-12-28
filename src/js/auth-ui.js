import { signInWithGoogle, signOut, onAuthChange, getCurrentUser } from '../firebase/auth.js';
import { getUserProfile, saveUserProfile, getPlayerName } from '../firebase/userProfile.js';
import { isFirebaseEnabled } from '../firebase/config.js';
import { t } from './translations.js';

// Auth UI state
let currentPlayerName = '';
let isUpdatingUI = false; // Flag to prevent concurrent updates
let authListenerInitialized = false; // Prevent multiple listener registrations

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

  // Only register listener once
  if (authListenerInitialized) {
    console.log('⚠️ Auth listener already initialized - skipping');
    return;
  }

  authListenerInitialized = true;

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
  // Prevent concurrent updates
  if (isUpdatingUI) {
    console.log('⚠️ UI update already in progress - skipping');
    return;
  }

  isUpdatingUI = true;

  try {
    if (user) {
      // User is signed in

      // Load user profile
      const profile = await getUserProfile();
      console.log('🔍 Profile loaded:', profile);

      // Use profile photo or fallback to user photo
      const photoURL = profile?.photoURL || user.photo;

      if (!profile || !profile.playerName) {
        // First time user - show player name modal and use Google name temporarily
        console.log('⚠️ No profile or playerName, using Google name:', user.name);
        currentPlayerName = user.name || 'User';
        showPlayerNameModal();
      } else {
        // Load player name
        currentPlayerName = profile.playerName;
        console.log('✅ Player name loaded:', currentPlayerName);

        // Update Team 1 with player name and photo
        updateTeam1NameWithPlayer(photoURL);
      }

      // Update menu auth state with user data
      updateMenuAuthState(user);
    } else {
      // User is signed out
      currentPlayerName = '';

      // Update menu auth state to signed out
      updateMenuAuthState(null);
    }
  } finally {
    // Always reset the flag
    isUpdatingUI = false;
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

  // Update Team 1 state directly (avoid calling setTeam1Name to prevent errors)
  if (window.team1) {
    window.team1.name = currentPlayerName;
  }

  // Update input field
  const team1Input = document.getElementById('team1NameInput');
  if (team1Input) {
    team1Input.value = currentPlayerName;
    console.log('✅ Team 1 name set to:', currentPlayerName);
  }

  // Update Team 1 display with photo
  const team1NameEl = document.getElementById('team1Name');
  if (team1NameEl) {
    // Clear all existing content (photo and text)
    team1NameEl.innerHTML = '';

    // Add photo if available
    if (photoURL) {
      const photoImg = document.createElement('img');
      photoImg.src = photoURL;
      photoImg.alt = 'Profile';
      photoImg.className = 'player-photo';
      photoImg.style.cssText = 'width: 2rem; height: 2rem; border-radius: 50%; object-fit: cover; margin-right: 0.5rem; vertical-align: middle;';
      team1NameEl.appendChild(photoImg);
      console.log('✅ Team 1 photo added');
    }

    // Add player name text
    const nameText = document.createTextNode(currentPlayerName);
    team1NameEl.appendChild(nameText);
    console.log('✅ Team 1 display updated with name:', currentPlayerName);
  }

  // Save to localStorage if saveData exists
  if (typeof window.saveData === 'function') {
    window.saveData();
  }
}

/**
 * Get current player name
 * @returns {string} Current player name or empty string
 */
export function getCurrentPlayerName() {
  return currentPlayerName;
}

/**
 * Update menu visibility based on auth state
 * @param {Object|null} user Current user or null
 */
function updateMenuAuthState(user) {
  const btnSignIn = document.getElementById('btnSignIn');
  const btnProfile = document.getElementById('btnProfile');
  const profileIcon = document.getElementById('profileIcon');
  const profileName = document.getElementById('profileName');
  const btnLogout = document.getElementById('btnLogout');
  const authDivider = document.getElementById('authDivider');

  if (user) {
    // User is signed in - show profile and logout
    if (btnSignIn) btnSignIn.style.display = 'none';
    if (btnProfile) btnProfile.style.display = 'flex';
    if (btnLogout) btnLogout.style.display = 'flex';
    if (authDivider) authDivider.style.display = 'block'; // Show divider after logout

    // Update profile button with user info
    if (profileIcon && user.photo) {
      profileIcon.innerHTML = `<img src="${user.photo}" alt="Profile" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">`;
    }
    if (profileName && currentPlayerName) {
      profileName.textContent = currentPlayerName;
    }
  } else {
    // User is signed out - show sign in
    if (btnSignIn) btnSignIn.style.display = 'flex';
    if (btnProfile) btnProfile.style.display = 'none';
    if (btnLogout) btnLogout.style.display = 'none';
    if (authDivider) authDivider.style.display = 'block'; // Show divider after sign in
  }
}

/**
 * Handle logout button click
 */
async function handleLogout() {
  try {
    await signOut();
    console.log('User signed out');
  } catch (error) {
    console.error('Error signing out:', error);
    alert('Error signing out. Please try again.');
  }
}

/**
 * Open profile modal
 */
async function openProfileModal() {
  const modal = document.getElementById('profileModal');
  const user = getCurrentUser();

  if (!user || !modal) return;

  // Load user profile
  const profile = await getUserProfile();

  // Populate modal fields
  const profilePhoto = document.getElementById('profilePhoto');
  const profileEmail = document.getElementById('profileEmail');
  const profileUid = document.getElementById('profileUid');
  const profilePlayerNameInput = document.getElementById('profilePlayerNameInput');

  if (profilePhoto && user.photo) {
    profilePhoto.src = user.photo;
  }
  if (profileEmail) {
    profileEmail.textContent = user.email || '-';
  }
  if (profileUid) {
    profileUid.textContent = user.id || '-';
  }
  if (profilePlayerNameInput && profile?.playerName) {
    profilePlayerNameInput.value = profile.playerName;
  }

  // Show modal
  modal.style.display = 'flex';
}

/**
 * Close profile modal
 */
function closeProfileModal() {
  const modal = document.getElementById('profileModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Update profile from modal
 */
async function updateProfile() {
  const profilePlayerNameInput = document.getElementById('profilePlayerNameInput');

  if (!profilePlayerNameInput) return;

  const newPlayerName = profilePlayerNameInput.value.trim();

  if (!newPlayerName) {
    alert(t('enterPlayerName'));
    return;
  }

  try {
    const profile = await saveUserProfile(newPlayerName);
    currentPlayerName = newPlayerName;

    // Update UI elements
    const authText = document.getElementById('authText');
    if (authText) {
      authText.textContent = newPlayerName;
    }

    const profileName = document.getElementById('profileName');
    if (profileName) {
      profileName.textContent = newPlayerName;
    }

    // Get photo URL from profile or current user
    const user = getCurrentUser();
    const photoURL = profile?.photoURL || user?.photo;

    // Update Team 1 with new name and photo
    updateTeam1NameWithPlayer(photoURL);

    closeProfileModal();
  } catch (error) {
    console.error('Error updating profile:', error);
    alert('Error updating profile. Please try again.');
  }
}

// Make functions available globally
window.handleAuthClick = handleAuthClick;
window.savePlayerName = savePlayerName;
window.handleLogout = handleLogout;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.updateProfile = updateProfile;
