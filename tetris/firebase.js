import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getDatabase, ref, set, get, onValue, push, update
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-database.js";

// Import konfigurasi dari file kamu
import { firebaseConfig } from "/tic-tac-toe/firebase-config.js";

// Inisialisasi Firebase
export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export { ref, set, get, onValue, push, update };
