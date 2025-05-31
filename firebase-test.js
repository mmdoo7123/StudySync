import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, addDoc } from 'firebase/firestore';
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
console.log("Firebase initialized successfully!");
const auth = getAuth(app);
const db = getFirestore(app);

// Connect to emulators
connectAuthEmulator(auth, "http://127.0.0.1:19099");
connectFirestoreEmulator(db, '127.0.0.1', 18081);
console.log("✅ Connected to emulators");

// Test Authentication
async function runTests() {
  try {
    console.log("Starting auth test...");
    const userCredential = await createUserWithEmailAndPassword(
      auth, 
      "test@example.com", 
      "password123"
    );
    console.log("Auth test passed! User created:", userCredential.user.uid);
  // Firestore Test
    console.log("Starting Firestore test...");
    const docRef = await addDoc(collection(db, "testCollection"), {
      message: "Test document",
      timestamp: new Date()
    });
    console.log("📝 Firestore Success! Document ID:", docRef.id);

  } catch (error) {
    console.error("❌ Test Failed:", error);
    process.exit(1);
  }
}


// Run tests
runTests().catch(console.error);
