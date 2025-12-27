// Scorekinole - Main Entry Point
// This file imports all modules and initializes the application

// Import styles
import './styles/main.css';

// Import Firebase (optional - only if enabled)
import { initAuthListener, onAuthChange } from './firebase/auth.js';
import { isFirebaseEnabled } from './firebase/config.js';

// Import main application code
import './js/app.js';

// Initialize Firebase if enabled
if (isFirebaseEnabled()) {
  console.log('🔥 Firebase enabled - initializing...');
  initAuthListener();

  // Listen to auth state changes
  onAuthChange((user) => {
    if (user) {
      console.log('✅ User logged in:', user.name);
      // TODO: Sync local history to cloud when user logs in
    } else {
      console.log('👤 User logged out or not authenticated');
    }
  });
} else {
  console.log('📦 Running in local-only mode (Firebase disabled)');
}

console.log('🎯 Scorekinole initialized');
