// src/popup.js
// Chrome Extension Popup Script - CSP Compliant Version

console.log('StudySync popup script loaded - CSP COMPLIANT VERSION');

// Environment detection utility
const ExtensionEnv = {
  isDevelopment: () => {
    const extensionId = chrome.runtime.id;
    return extensionId && extensionId.length < 32;
  },
  
  isProduction: () => {
    return !ExtensionEnv.isDevelopment();
  },
  
  getEnvironment: () => {
    return ExtensionEnv.isDevelopment() ? 'development' : 'production';
  }
};

// DOM elements
let googleLoginBtn;
let logoutBtn;
let userInfoDiv;
let loginSection;
let errorDiv;
let loadingDiv;

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup initializing...');
  
  try {
    initializeUI();
    updateEnvironmentInfo();
    showLoading(true);
    
    await loadUserState();
    setupEventListeners();
    
    showLoading(false);
    console.log('Popup initialized successfully');
    
  } catch (error) {
    console.error('Popup initialization failed:', error);
    showError('Failed to initialize popup: ' + error.message);
    showLoading(false);
  }
});

function initializeUI() {
  // Get DOM elements
  googleLoginBtn = document.getElementById('google-login-btn');
  logoutBtn = document.getElementById('logout-btn');
  userInfoDiv = document.getElementById('user-info');
  loginSection = document.getElementById('login-section');
  errorDiv = document.getElementById('error-message');
  
  // Create loading indicator if it doesn't exist
  loadingDiv = document.getElementById('loading');
  if (!loadingDiv) {
    loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading';
    loadingDiv.className = 'loading hidden';
    loadingDiv.innerHTML = '<div class="spinner"></div><span>Loading...</span>';
    document.body.appendChild(loadingDiv);
  }
  
  // Ensure all required elements exist
  if (!googleLoginBtn || !logoutBtn || !userInfoDiv || !loginSection || !errorDiv) {
    console.error('Required DOM elements not found');
    throw new Error('Required DOM elements not found');
  }
}

function updateEnvironmentInfo() {
  // Update environment info (previously inline script)
  const envInfo = document.getElementById('env-info');
  if (envInfo) {
    const isDev = ExtensionEnv.isDevelopment();
    envInfo.textContent = `${isDev ? 'Development' : 'Production'} Mode`;
  }
}

async function loadUserState() {
  try {
    console.log('Loading user state...');
    
    const result = await chrome.storage.local.get(['userId', 'userEmail', 'userName', 'userPicture']);
    
    if (result.userId) {
      updateUI({
        uid: result.userId,
        email: result.userEmail,
        displayName: result.userName,
        photoURL: result.userPicture
      });
      console.log('User state loaded:', result.userId);
    } else {
      showLoginState();
      console.log('No user state found');
    }
  } catch (error) {
    console.error('Failed to load user state:', error);
    showError('Failed to load user state: ' + error.message);
  }
}

function setupEventListeners() {
  // Handle login button click
  googleLoginBtn.addEventListener('click', handleLogin);
  
  // Handle logout button click
  logoutBtn.addEventListener('click', handleLogout);
  
  // Add keyboard support
  googleLoginBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLogin();
    }
  });
  
  logoutBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLogout();
    }
  });
}

async function handleLogin() {
  try {
    console.log('Starting login process...');
    showLoading(true);
    hideError();
    setButtonState(googleLoginBtn, true);
    
    // Send login request to background script
    const response = await sendMessageToBackground({ action: 'googleLogin' });
    
    if (response.success) {
      updateUI(response.user);
      console.log('Login successful');
    } else {
      // Handle specific OAuth errors
      if (response.error && response.error.includes('bad client id')) {
        showError('OAuth configuration error. Please check your Google Client ID in the manifest.json file.');
      } else {
        throw new Error(response.error || 'Login failed');
      }
    }
    
  } catch (error) {
    console.error('Login failed:', error);
    
    // Handle specific error types
    if (error.message.includes('OAuth2 request failed')) {
      showError('OAuth configuration error. Please set up your Google Client ID.');
    } else if (error.message.includes('bad client id')) {
      showError('Invalid Google Client ID. Please check your OAuth2 configuration.');
    } else {
      showError('Login failed: ' + error.message);
    }
  } finally {
    showLoading(false);
    setButtonState(googleLoginBtn, false);
  }
}

async function handleLogout() {
  try {
    console.log('Starting logout process...');
    showLoading(true);
    hideError();
    setButtonState(logoutBtn, true);
    
    // Get current token to revoke
    const { accessToken } = await chrome.storage.local.get(['accessToken']);
    
    // Revoke token if it exists
    if (accessToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
          method: 'POST'
        });
      } catch (error) {
        console.warn('Failed to revoke token:', error);
      }
    }
    
    // Clear Chrome Identity token
    try {
      const token = await new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          resolve(token);
        });
      });
      
      if (token) {
        chrome.identity.removeCachedAuthToken({ token: token });
      }
    } catch (error) {
      console.warn('Failed to clear Chrome Identity token:', error);
    }
    
    // Clear extension storage
    await chrome.storage.local.clear();
    
    // Update UI
    showLoginState();
    console.log('Logout successful');
    
  } catch (error) {
    console.error('Logout failed:', error);
    showError('Logout failed: ' + error.message);
  } finally {
    showLoading(false);
    setButtonState(logoutBtn, false);
  }
}

function updateUI(user) {
  if (loginSection) loginSection.classList.add('hidden');
  if (userInfoDiv) {
    userInfoDiv.classList.remove('hidden');
    
    // Update user email display
    const userEmailElement = document.getElementById('user-email');
    if (userEmailElement) {
      userEmailElement.textContent = user.email || 'Unknown';
    }
    
    // Update user name if available
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) {
      userNameElement.textContent = user.displayName || 'Unknown';
    }
    
    // Update user photo if available
    const userPhotoElement = document.getElementById('user-photo');
    if (userPhotoElement && user.photoURL) {
      userPhotoElement.src = user.photoURL;
      userPhotoElement.classList.remove('hidden');
    }
  }
  
  if (logoutBtn) logoutBtn.classList.remove('hidden');
}

function showLoginState() {
  if (loginSection) loginSection.classList.remove('hidden');
  if (userInfoDiv) userInfoDiv.classList.add('hidden');
  if (logoutBtn) logoutBtn.classList.add('hidden');
}

function showError(message) {
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    
    // Auto-hide error after 10 seconds for OAuth errors (they need more time to read)
    setTimeout(() => {
      hideError();
    }, 10000);
  }
  console.error('Error:', message);
}

function hideError() {
  if (errorDiv) {
    errorDiv.classList.add('hidden');
  }
}

function showLoading(show) {
  if (loadingDiv) {
    if (show) {
      loadingDiv.classList.remove('hidden');
    } else {
      loadingDiv.classList.add('hidden');
    }
  }
}

function setButtonState(button, disabled) {
  if (button) {
    button.disabled = disabled;
    button.style.opacity = disabled ? '0.6' : '1';
    button.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }
}

// Utility function to communicate with background script
async function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Message timeout'));
    }, 10000); // 10 second timeout
    
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeout);
      
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response) {
        reject(new Error('No response received'));
      } else {
        resolve(response);
      }
    });
  });
}

// Handle runtime errors
window.addEventListener('error', (event) => {
  console.error('Popup runtime error:', event.error);
  showError('An error occurred: ' + event.error.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Popup unhandled promise rejection:', event.reason);
  showError('An error occurred: ' + event.reason.message);
});

// Export for debugging in development
if (ExtensionEnv.isDevelopment()) {
  globalThis.popupUtils = {
    ExtensionEnv,
    sendMessageToBackground,
    handleLogin,
    handleLogout,
    updateUI,
    showLoginState,
    showError,
    updateEnvironmentInfo
  };
}

