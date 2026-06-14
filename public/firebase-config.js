// Firebase configuration
const firebaseConfig = {
  apiKey: "INSERIR_FIREBASE_API_KEY_AQUI",
  authDomain: "INSERIR_FIREBASE_AUTH_DOMAIN_AQUI",
  projectId: "INSERIR_FIREBASE_PROJECT_ID_AQUI",
  storageBucket: "INSERIR_FIREBASE_STORAGE_BUCKET_AQUI",
  messagingSenderId: "INSERIR_FIREBASE_MESSAGING_SENDER_ID_AQUI",
  appId: "INSERIR_FIREBASE_APP_ID_AQUI",
  measurementId: "INSERIR_FIREBASE_MEASUREMENT_ID_AQUI"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();
