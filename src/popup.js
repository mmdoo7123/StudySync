import { auth } from '../firebase/config.js';

document.addEventListener('DOMContentLoaded', () => {
  const googleLoginBtn = document.getElementById('google-login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userInfoDiv = document.getElementById('user-info');
  const loginSection = document.getElementById('login-section');
  const errorDiv = document.getElementById('error-message');

  // Handle login flow
  googleLoginBtn.addEventListener('click', async () => {
    try {
      errorDiv.classList.add('hidden');
      const response = await chrome.runtime.sendMessage({ action: "googleLogin" });
      
      if (!response.success) {
        throw new Error(response.error);
      }
      
      updateUI(response.user);
    } catch (error) {
      showError(error.message);
    }
  });

  // Handle logout
  logoutBtn.addEventListener('click', () => {
    auth.signOut().catch(showError); // Changed from signOut(auth)
  });

  // Listen for auth state changes
  auth.onAuthStateChanged((user) => { // Changed from onAuthStateChanged(auth, ...)
    if (user) {
      updateUI(user);
    } else {
      loginSection.classList.remove('hidden');
      userInfoDiv.classList.add('hidden');
    }
  });

  function updateUI(user) {
    document.getElementById('user-email').textContent = user.email;
    userInfoDiv.classList.remove('hidden');
    loginSection.classList.add('hidden');
  }

  function showError(message) {
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    setTimeout(() => errorDiv.classList.add('hidden'), 5000);
  }
});
/*chrome.identity.launchWebAuthFlow({
    url: 'https://accounts.google.com/o/oauth2/auth?client_id=876312628673-p3vs5q50b55m1lo9udn92fh53rt4mjka.apps.googleusercontent.com&redirect_uri=https://egjncmaafpcpnbpbklcfholgmmejojhi.chromiumapp.org&response_type=token&scope=profile',
    interactive: true
  }, (responseUrl) => {
    console.log("Login success! Response:", responseUrl);
  });*/