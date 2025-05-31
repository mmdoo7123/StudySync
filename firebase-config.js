// Your Firebase config (from Firebase console)
const firebaseConfig = {
    apiKey: "AIzaSyCtPHdkiuicxgC3pQNB49lpjbLkEHQQ4K0",
    authDomain: "studysync-d812e.firebaseapp.com",
    projectId: "studysync-d812e",
    storageBucket: "studysync-d812e.firebasestorage.app",
    messagingSenderId: "385701813068",
    appId: "1:385701813068:web:e49ef1d44bd361197c4de9",
    measurementId: "G-Z448Z2EH5N"
};
  
  // Initialize Firebase
  const app = firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  
  // For background script access
  window.firebase = firebase;