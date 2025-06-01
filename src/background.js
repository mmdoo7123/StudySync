import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/config.js';

// Google Auth
async function loginWithGoogle() {
  try {
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org`;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
    
    authUrl.searchParams.append('client_id', chrome.runtime.getManifest().oauth2.client_id);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('scope', 'profile email');

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl.toString(), interactive: true },
        (callbackUrl) => callbackUrl ? resolve(callbackUrl) : reject(chrome.runtime.lastError)
      );
    });

    const accessToken = new URL(responseUrl).hash.match(/access_token=([^&]+)/)[1];
    const credential = GoogleAuthProvider.credential(null, accessToken);
    return await signInWithCredential(auth, credential);
  } catch (error) {
    console.error("Google OAuth failed:", error);
    throw error;
  }
}

// Combined Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "syncDeadlines") {
    // Logic for syncDeadlines
    (async () => { // Wrap in async IIFE to use await
      try {
        const user = auth.currentUser;
        if (!user) {
          sendResponse({ error: "User not authenticated" });
          return;
        }
        
        await addDoc(collection(db, "users", user.uid, "deadlines"), {
          title: request.title,
          dueDate: new Date(request.dueDate)
        });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    })();
    return true; // Indicate asynchronous response
  } else if (request.action === "googleLogin") {
    // Logic for googleLogin
    loginWithGoogle()
      .then(user => sendResponse({ success: true, user }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Indicate asynchronous response
  }
});