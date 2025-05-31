// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
if (window.location.hostname === 'localhost') {
  const auth = getAuth();
  const db = getFirestore();
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, 'localhost', 8081);
}