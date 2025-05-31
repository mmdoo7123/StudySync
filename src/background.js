// =============================================
// Firebase Services (using CDN global variables)
// =============================================
const auth = firebase.auth();
const db = firebase.firestore();

// =============================================
// Message Listener for Deadlines
// =============================================
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "syncDeadlines") {
    try {
      const user = auth.currentUser;
      if (!user) {
        sendResponse({ error: "User not authenticated" });
        return;
      }
      
      await db.collection("users").doc(user.uid).collection("deadlines").add({
        title: request.title,
        dueDate: new Date(request.dueDate)
      });
      sendResponse({ success: true });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }
  return true; // Keep channel open
});

// =============================================
// Google Auth Implementation (CDN Version)
// =============================================
async function loginWithGoogle() {
  try {
    // 1. Get OAuth token via Chrome Identity API
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org`;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
    
    authUrl.searchParams.append('client_id', chrome.runtime.getManifest().oauth2.client_id);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('scope', 'profile email');

    // 2. Launch auth flow
    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl.toString(), interactive: true },
        (callbackUrl) => callbackUrl ? resolve(callbackUrl) : reject(chrome.runtime.lastError)
      );
    });

    // 3. Extract token and authenticate with Firebase
    const accessToken = new URL(responseUrl).hash.match(/access_token=([^&]+)/)[1];
    const credential = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
    const userCredential = await auth.signInWithCredential(credential);
    
    return userCredential.user;

  } catch (error) {
    console.error("Google OAuth failed:", error);
    throw error;
  }
}

// =============================================
// Message Handler for Login Requests
// =============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "googleLogin") {
    loginWithGoogle()
      .then(user => sendResponse({ success: true, user }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// =============================================
// Development Helper
// =============================================
if (location.href.includes('chrome-extension://')) {
  window.mockGoogleLogin = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider);
  };
}
/*function loginWithGoogle() {
    const clientId = chrome.runtime.getManifest().oauth2.client_id;
    const extensionId = chrome.runtime.id;
    const redirectUri = `https://${extensionId}.chromiumapp.org`;
  
    const authUrl = `https://accounts.google.com/o/oauth2/auth?
      client_id=${clientId}&
      redirect_uri=${encodeURIComponent(redirectUri)}&
      response_type=token&
      scope=profile`;
  
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true
      },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          console.error("OAuth failed:", chrome.runtime.lastError);
        } else {
          console.log("Success! Response URL:", responseUrl);
          // Extract access token from responseUrl (#token=...)
        }
      }
    );
  }
  
  // Call the function (e.g., from a UI button click)
  loginWithGoogle(); */