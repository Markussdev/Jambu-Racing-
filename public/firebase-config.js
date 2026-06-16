// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB0GYjGhzFMhmBw6UeyQPxb5w6VE6qZnuo",
  authDomain: "jambu-racing.firebaseapp.com",
  projectId: "jambu-racing",
  storageBucket: "jambu-racing.firebasestorage.app",
  messagingSenderId: "43908481528",
  appId: "1:43908481528:web:81aeb326f57bea66d5160d",
  measurementId: "G-2CXSQGFVP3"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();
