import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

// Initialize Firebase
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Message listener
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "syncDeadlines") {
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
  }
  return true;
});

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

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "googleLogin") {
    loginWithGoogle()
      .then(user => sendResponse({ success: true, user }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});