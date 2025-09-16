// auth.js - Client-side authentication functions

// Global auth state
let currentUser = null;
let isLoggedIn = false;

// Collect device fingerprinting data
function getDeviceFingerprint() {
  const deviceInfo = {
    screen_resolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language || navigator.userLanguage,
    platform: navigator.platform,
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack,
    hardwareConcurrency: navigator.hardwareConcurrency,
    maxTouchPoints: navigator.maxTouchPoints,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth
  };
  
  return deviceInfo;
}

// Event listeners to update UI based on auth state
const authStateListeners = [];

// Initialize auth state from session
async function initAuth() {
  try {
    const response = await fetch('/api/auth/profile');
    
    if (response.ok) {
      const data = await response.json();
      currentUser = data.user;
      isLoggedIn = true;
    } else {
      currentUser = null;
      isLoggedIn = false;
    }
  } catch (error) {
    console.error('Auth initialization error:', error);
    currentUser = null;
    isLoggedIn = false;
  }
  
  notifyAuthStateChange();
  return isLoggedIn;
}

// Register a new user
async function register(username, email, password) {
  try {
    const deviceFingerprint = getDeviceFingerprint();
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Device-Fingerprint': JSON.stringify(deviceFingerprint)
      },
      body: JSON.stringify({ username, email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    
    currentUser = data.user;
    isLoggedIn = true;
    notifyAuthStateChange();
    
    return { success: true, user: data.user, message: data.message };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Login user
async function login(username, password) {
  try {
    const deviceFingerprint = getDeviceFingerprint();
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Device-Fingerprint': JSON.stringify(deviceFingerprint)
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    currentUser = data.user;
    isLoggedIn = true;
    notifyAuthStateChange();
    
    return { success: true, user: data.user, message: data.message };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Logout user
async function logout() {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Logout failed');
    }
    
    currentUser = null;
    isLoggedIn = false;
    notifyAuthStateChange();
    
    return { success: true, message: data.message };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Update user profile
async function updateProfile(email) {
  try {
    const response = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Profile update failed');
    }
    
    currentUser = data.user;
    notifyAuthStateChange();
    
    return { success: true, user: data.user, message: data.message };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Change password
async function changePassword(currentPassword, newPassword) {
  try {
    const response = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Password change failed');
    }
    
    return { success: true, message: data.message };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get current auth state
function getAuthState() {
  return {
    isLoggedIn,
    user: currentUser,
    isAdmin: currentUser?.role === 'admin'
  };
}

// Subscribe to auth state changes
function onAuthStateChange(callback) {
  authStateListeners.push(callback);
  // Call immediately with current state
  callback(getAuthState());
  return () => {
    const index = authStateListeners.indexOf(callback);
    if (index !== -1) {
      authStateListeners.splice(index, 1);
    }
  };
}

// Notify all listeners of auth state change
function notifyAuthStateChange() {
  const state = getAuthState();
  authStateListeners.forEach(callback => callback(state));
}

// Check if user has admin role
function isAdmin() {
  return currentUser?.role === 'admin';
}

// Export auth functions
export {
  initAuth,
  register,
  login,
  logout,
  updateProfile,
  changePassword,
  getAuthState,
  onAuthStateChange,
  isAdmin
};