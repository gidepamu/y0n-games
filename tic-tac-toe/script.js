// === Firebase Imports ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

// === Firebase Init ===
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// === HTML Elements ===
const lobby = document.getElementById("lobby");
const suitSection = document.getElementById("suitSection");
const game = document.getElementById("game");
const boardEl = document.getElementById("board");
const turnInfo = document.getElementById("turnInfo");
const scoreInfo = document.getElementById("scoreInfo");
const resetBtn = document.getElementById("resetBtn");
const joinBtn = document.getElementById("joinBtn");
const suitButtons = document.querySelectorAll(".suit");
const suitStatus = document.getElementById("suitStatus");
const popup = document.getElementById("popupWinner");
const popupText = document.getElementById("popupText");
const popupBtn = document.getElementById("popupBtn");

// === Variables ===
let playerName, room, mySymbol = "";
let board = Array(9).fill("");
let currentTurn = "X";
let gameOver = false;
let scores = { X: 0, O: 0 };
let listenersActive = false;

// === Gabung ke Game ===
joinBtn.onclick = async () => {
  playerName = document.getElementById("playerName").value.trim();
  room = document.getElementById("roomName").value.trim();

  if (!playerName || !room) return alert("Isi nama dan room dulu!");

  // Update URL biar bisa dibagikan
  const newUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}&name=${encodeURIComponent(playerName)}`;
  window.history.pushState({}, "", newUrl);

  // Buat node room jika belum ada
  await update(ref(db, `games/${room}`), {
    board: Array(9).fill(""),
    turn: "X",
    scores: { X: 0, O: 0 }
  });

  // Tampilkan halaman suit
  lobby.style.display = "none";
  suitSection.style.display = "block";

  // Aktifkan listener setelah room diset
  if (!listenersActive) {
    activateListeners();
    listenersActive = true;
  }
};

// === Fungsi Listener untuk Suit & Game ===
function activateListeners() {
  // SUIT Buttons
  suitButtons.forEach(btn => {
    btn.onclick = () => {
      const choice = btn.dataset.choice;
      set(ref(db, `games/${room}/suit/${playerName}`), choice);
      suitStatus.textContent = `${playerName} sudah memilih (${choice}), menunggu lawan...`;
    };
  });

  // SUIT Listener
  onValue(ref(db, `games/${room}/suit`), (snapshot) => {
    const data = snapshot.val();
    console.log("🔥 SUIT DATA UPDATE:", data);

    if (!data || Object.keys(data).length === 0) {
      suitStatus.textContent = "Menunggu lawan bergabung ke room...";
      return;
    }

    if (Object.keys(data).length === 1) {
      const [p] = Object.keys(data);
      if (p === playerName)
        suitStatus.textContent = "Menunggu lawan memilih...";
      else
        suitStatus.textContent = "Lawan sudah memilih, giliran kamu!";
      return;
    }

    if (Object.keys(data).length === 2) {
      const [p1, p2] = Object.keys(data);
      const c1 = data[p1], c2 = data[p2];
      let winner = null;

      if (c1 === c2) {
        suitStatus.textContent = "Seri! Suit ulang...";
        set(ref(db, `games/${room}/suit`), {}); // reset
        return;
      }

      if (
        (c1 === "batu" && c2 === "gunting") ||
        (c1 === "gunting" && c2 === "kertas") ||
        (c1 === "kertas" && c2 === "batu")
      ) winner = p1;
      else winner = p2;

      // Tentukan simbol
      mySymbol = (playerName === winner) ? "X" : "O";

      // Set turn pertama hanya sekali (oleh pemenang)
      if (playerName === winner) {
        update(ref(db, `games/${room}`), { turn: "X" });
      }

      suitStatus.textContent = `${winner} menang suit dan main duluan!`;

      // Delay biar update Firebase sempat sync ke semua pemain
      setTimeout(() => {
        suitSection.style.display = "none";
        game.style.display = "block";
      }, 1500);
    }
  });

  // Game Board Listener
  onValue(ref(db, `games/${room}/board`), (snapshot) => {
    const data = snapshot.val();
    if (data) board = data;
    renderBoard();
  });

  // Turn Listener
  onValue(ref(db, `games/${room}/turn`), (snapshot) => {
    currentTurn = snapshot.val() || "X";
    turnInfo.textContent = `Giliran: ${currentTurn}`;
  });

  // Score Listener
  onValue(ref(db, `games/${room}/scores`), (snapshot) => {
    const data = snapshot.val();
    if (data) scores = data;
    updateScore();
  });
}

// === Render Board ===
function renderBoard() {
  boardEl.innerHTML = "";
  board.forEach((val, i) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.textContent = val;
    cell.onclick = () => makeMove(i);
    boardEl.appendChild(cell);
  });
}

// === Player Move ===
function makeMove(i) {
  if (gameOver || board[i] !== "" || currentTurn !== mySymbol) return;
  board[i] = mySymbol;
  set(ref(db, `games/${room}/board`), board);
  checkWinner();
  update(ref(db, `games/${room}`), { turn: mySymbol === "X" ? "O" : "X" });
}

// === Check Winner ===
function checkWinner() {
  const winCombos = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of winCombos) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      gameOver = true;
      const winnerSymbol = board[a];
      scores[winnerSymbol] += 1;
      update(ref(db, `games/${room}`), { scores });
      showPopup(`Pemain ${winnerSymbol} menang! 🏆`);
      return;
    }
  }
  if (!board.includes("")) {
    gameOver = true;
    showPopup("Seri! 🤝");
  }
}

// === Update Score Display ===
function updateScore() {
  scoreInfo.textContent = `Skor ❌: ${scores["X"] || 0} | 🔵: ${scores["O"] || 0}`;
}

// === POPUP WINNER ===
function showPopup(text) {
  popupText.textContent = text;
  popup.style.display = "flex";
}

popupBtn.onclick = () => {
  popup.style.display = "none";
  set(ref(db, `games/${room}/board`), Array(9).fill(""));
  gameOver = false;
};

// === Reset Game (Manual Button) ===
resetBtn.onclick = () => {
  set(ref(db, `games/${room}/board`), Array(9).fill(""));
  gameOver = false;
};
