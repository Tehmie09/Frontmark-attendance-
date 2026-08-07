import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCxi7LOqxFN4bYBlhUFK5Q5U0hO13oEu58",
  authDomain: "ontmark-college-attendance.firebaseapp.com",
  projectId: "ontmark-college-attendance",
  storageBucket: "ontmark-college-attendance.firebasestorage.app",
  messagingSenderId: "736446088245",
  appId: "1:736446088245:web:e76f63bbf9347ad1d4dd7c",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
