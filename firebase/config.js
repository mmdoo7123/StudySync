// src/firebase/config.js
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyCtPHdkiuicxgC3pQNB49lpjbLkEHQQ4K0",
    authDomain: "studysync-d812e.firebaseapp.com",
    projectId: "studysync-d812e",
    storageBucket: "studysync-d812e.firebasestorage.app",
    messagingSenderId: "385701813068",
    appId: "1:385701813068:web:e49ef1d44bd361197c4de9",
    measurementId: "G-Z448Z2EH5N"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Conditional emulator connection
if (process.env.NODE_ENV === 'development') {
  connectAuthEmulator(auth, "http://127.0.0.1:19099");
  connectFirestoreEmulator(db, '127.0.0.1', 18081);
  console.log("🔥 Connected to Firebase Emulators");
}

export { auth, db };