// src/background.js
// Chrome Extension Background Service Worker - No Firebase Imports

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

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCtPHdkiuicxgC3pQNB49lpjbLkEHQQ4K0",
  authDomain: "studysync-d812e.firebaseapp.com",
  projectId: "studysync-d812e",
  storageBucket: "studysync-d812e.firebasestorage.app",
  messagingSenderId: "385701813068",
  appId: "1:385701813068:web:e49ef1d44bd361197c4de9",
  measurementId: "G-Z448Z2EH5N"
};

// Service Worker event listeners
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed:', details);
  
  try {
    // Set up initial storage
    await chrome.storage.local.set({
      environment: ExtensionEnv.getEnvironment(),
      installTime: Date.now()
    });
    
    console.log('Installation setup completed');
  } catch (error) {
    console.error('Installation setup failed:', error);
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  if (message.action === 'googleLogin') {
    handleGoogleLogin()
      .then(result => sendResponse({ success: true, user: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
  
  if (message.action === 'saveUserData') {
    saveUserDataToFirestore(message.userData)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.action === 'getUserData') {
    getUserDataFromFirestore()
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.action === 'getEnvironment') {
    sendResponse({
      environment: ExtensionEnv.getEnvironment(),
      isDevelopment: ExtensionEnv.isDevelopment()
    });
  }
});

// Google Login handler using Chrome Identity API
async function handleGoogleLogin() {
  try {
    console.log('Starting Google login...');
    
    // Use Chrome Identity API to get OAuth token
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!token) {
          reject(new Error('No token received'));
        } else {
          resolve(token);
        }
      });
    });
    
    console.log('Token received, getting user info...');
    
    // Get user info from Google API
    const userInfo = await getUserInfoFromGoogle(token);
    
    // Store user info in extension storage
    await chrome.storage.local.set({
      userId: userInfo.id,
      userEmail: userInfo.email,
      userName: userInfo.name,
      userPicture: userInfo.picture,
      accessToken: token,
      lastLogin: Date.now()
    });
    
    console.log('User authenticated successfully:', userInfo.id);
    
    return {
      uid: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.name,
      photoURL: userInfo.picture
    };
  } catch (error) {
    console.error('Google login failed:', error);
    throw error;
  }
}

// Get user info from Google API
async function getUserInfoFromGoogle(token) {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to get user info from Google:', error);
    throw error;
  }
}

// Save user data to Firestore using REST API
async function saveUserDataToFirestore(userData) {
  try {
    const { userId, accessToken } = await chrome.storage.local.get(['userId', 'accessToken']);
    if (!userId || !accessToken) {
      throw new Error('User not authenticated');
    }
    
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${userId}`;
    
    const document = {
      fields: {}
    };
    
    // Convert userData to Firestore format
    for (const [key, value] of Object.entries(userData)) {
      if (typeof value === 'string') {
        document.fields[key] = { stringValue: value };
      } else if (typeof value === 'number') {
        document.fields[key] = { doubleValue: value };
      } else if (typeof value === 'boolean') {
        document.fields[key] = { booleanValue: value };
      } else {
        document.fields[key] = { stringValue: JSON.stringify(value) };
      }
    }
    
    // Add metadata
    document.fields.lastUpdated = { timestampValue: new Date().toISOString() };
    document.fields.environment = { stringValue: ExtensionEnv.getEnvironment() };
    
    const response = await fetch(firestoreUrl + '?updateMask.fieldPaths=*', {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(document)
    });
    
    if (!response.ok) {
      throw new Error(`Firestore error: ${response.status}`);
    }
    
    console.log('User data saved successfully');
  } catch (error) {
    console.error('Failed to save user data:', error);
    throw error;
  }
}

// Get user data from Firestore using REST API
async function getUserDataFromFirestore() {
  try {
    const { userId, accessToken } = await chrome.storage.local.get(['userId', 'accessToken']);
    if (!userId || !accessToken) {
      throw new Error('User not authenticated');
    }
    
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users/${userId}`;
    
    const response = await fetch(firestoreUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (response.status === 404) {
      return null; // Document doesn't exist
    }
    
    if (!response.ok) {
      throw new Error(`Firestore error: ${response.status}`);
    }
    
    const document = await response.json();
    
    // Convert Firestore format to regular object
    const userData = {};
    if (document.fields) {
      for (const [key, value] of Object.entries(document.fields)) {
        if (value.stringValue !== undefined) {
          userData[key] = value.stringValue;
        } else if (value.doubleValue !== undefined) {
          userData[key] = value.doubleValue;
        } else if (value.booleanValue !== undefined) {
          userData[key] = value.booleanValue;
        } else if (value.timestampValue !== undefined) {
          userData[key] = value.timestampValue;
        }
      }
    }
    
    return userData;
  } catch (error) {
    console.error('Failed to get user data:', error);
    throw error;
  }
}

// Handle alarms for scheduled tasks
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('Alarm triggered:', alarm.name);
  
  try {
    switch (alarm.name) {
      case 'syncData':
        await syncUserData();
        break;
      case 'cleanup':
        await performCleanup();
        break;
    }
  } catch (error) {
    console.error(`Alarm ${alarm.name} failed:`, error);
  }
});

// Sync user data periodically
async function syncUserData() {
  try {
    const userData = await getUserDataFromFirestore();
    if (userData) {
      await chrome.storage.local.set({ lastSync: Date.now() });
      console.log('Data sync completed');
    }
  } catch (error) {
    console.error('Data sync failed:', error);
  }
}

// Cleanup function
async function performCleanup() {
  try {
    const { installTime } = await chrome.storage.local.get(['installTime']);
    const daysSinceInstall = (Date.now() - installTime) / (1000 * 60 * 60 * 24);
    
    if (daysSinceInstall > 30) {
      console.log('Performing cleanup for old installation');
      // Add cleanup logic here
    }
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}

// Set up periodic alarms
chrome.alarms.create('syncData', { periodInMinutes: 60 });
chrome.alarms.create('cleanup', { periodInMinutes: 1440 }); // Daily

// Export utilities for testing in development
if (ExtensionEnv.isDevelopment()) {
  globalThis.backgroundUtils = {
    ExtensionEnv,
    handleGoogleLogin,
    saveUserDataToFirestore,
    getUserDataFromFirestore
  };
}

