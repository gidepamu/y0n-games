import { app, db, ref, set, push, onValue, update, get } from "./firebase.js";

/* ======================================
   RETRO AUDIO ENGINE
====================================== */
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContextClass();
let musicSource = null;
let musicPlaying = false;

function playBeep(frequency = 440, duration = 150, type = "square", volume = 0.2) {
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
  osc.start();
  osc.stop(audioCtx.currentTime + duration / 1000);
}

const sounds = {
  rotate: () => playBeep(660, 80, "square", 0.1),
  drop: () => playBeep(180, 120, "sawtooth", 0.2),
  clear: () => {
    playBeep(523, 80, "triangle", 0.2);
    setTimeout(() => playBeep(659, 80, "triangle", 0.15), 100);
  },
  gameOver: () => {
    playBeep(440, 200, "square", 0.2);
    setTimeout(() => playBeep(349, 250, "square", 0.15), 220);
    setTimeout(() => playBeep(261, 300, "square", 0.1), 500);
  },
};

function startMusic() {
  if (musicPlaying) return;
  const tempo = 0.4;
  const notes = [261, 329, 392, 523, 392, 329];
  musicSource = setInterval(() => {
    const note = notes[Math.floor(Math.random() * notes.length)];
    playBeep(note, 120, "triangle", 0.1);
  }, 600 * tempo);
  musicPlaying = true;
}

function stopMusic() {
  if (musicSource) clearInterval(musicSource);
  musicSource = null;
  musicPlaying = false;
}

// Tombol mute di pojok kanan atas
const muteBtn = document.createElement("button");
muteBtn.innerText = "🔊 Music ON";
muteBtn.className = "game-btn";
muteBtn.style.position = "fixed";
muteBtn.style.top = "10px";
muteBtn.style.right = "10px";
muteBtn.style.padding = "8px 12px";
document.body.appendChild(muteBtn);

muteBtn.onclick = () => {
  if (musicPlaying) {
    stopMusic();
    muteBtn.innerText = "🔈 Music OFF";
  } else {
    audioCtx.resume();
    startMusic();
    muteBtn.innerText = "🔊 Music ON";
  }
};

/* ======================================
   GAME SETUP + FIREBASE DUEL SYSTEM
====================================== */
const createBtn = document.getElementById("createRoomBtn");
const joinBtn = document.getElementById("joinRoomBtn");
const joinInput = document.getElementById("joinRoomInput");
const roomCodeLabel = document.getElementById("roomCode");
const playersList = document.getElementById("playersList");
const matchStatus = document.getElementById("matchStatus");
const playerNameLabel = document.getElementById("playerNameLabel");
const opponentNameLabel = document.getElementById("opponentName");
const scoreDisplay = document.getElementById("scoreDisplay");
const resultLabel = document.getElementById("result");
const startGameBtn = document.getElementById("startGameBtn");
const forfeitBtn = document.getElementById("forfeitBtn");

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scale = 20;
ctx.scale(scale, scale);

const playerName = localStorage.getItem("playerName") || ("Player" + Math.floor(Math.random()*1000));
playerNameLabel.innerText = playerName;

let roomId = null;
let myPlayerRef = null;
let myPlayerKey = null;
let opponentKey = null;
let opponentData = null;
let score = 0;

scoreDisplay.innerText = score;
let arena = createMatrix(12, 20);
let player = null;
let dropCounter = 0, dropInterval = 500, lastTime = 0;

const roomsRef = ref(db, "tetris/rooms");

createBtn.onclick = async () => {
  const newRoomRef = push(roomsRef);
  roomId = newRoomRef.key;
  await set(newRoomRef, { created: Date.now() });
  roomCodeLabel.innerText = roomId;
  matchStatus.innerText = "Room created. Waiting for opponent...";
  await joinAsPlayer(roomId);
  listenRoom(roomId);
};

joinBtn.onclick = async () => {
  const code = joinInput.value.trim();
  if (!code) return alert("Enter room code");
  const roomRef = ref(db, `tetris/rooms/${code}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return alert("Room not found");
  roomId = code;
  roomCodeLabel.innerText = roomId;
  await joinAsPlayer(roomId);
  listenRoom(roomId);
};

async function joinAsPlayer(rId){
  const playersRef = ref(db, `tetris/rooms/${rId}/players`);
  const pRef = push(playersRef);
  myPlayerRef = pRef;
  myPlayerKey = pRef.key;
  await set(pRef, {
    name: playerName,
    score: 0,
    status: "waiting",
    joinedAt: Date.now()
  });
  matchStatus.innerText = "Joined room. Ready.";
}

function listenRoom(rId){
  const playersRef = ref(db, `tetris/rooms/${rId}/players`);
  onValue(playersRef, (snap) => {
    const data = snap.val() || {};
    playersList.innerHTML = "";
    const keys = Object.keys(data);
    keys.forEach(k=>{
      const li = document.createElement("li");
      li.innerText = `${data[k].name} (${data[k].score || 0})${k===myPlayerKey?" — (you)":""}`;
      playersList.appendChild(li);
    });

    opponentKey = keys.find(k => k !== myPlayerKey);
    opponentData = opponentKey ? data[opponentKey] : null;
    opponentNameLabel.innerText = opponentData ? opponentData.name : "—";

    const finishedPlayers = keys.filter(k => data[k].status === "finished");
    if (finishedPlayers.length >= 2){
      const p1 = data[finishedPlayers[0]];
      const p2 = data[finishedPlayers[1]];
      evaluateWinner(p1, p2);
    } else if (keys.length >= 2) {
      matchStatus.innerText = "Duel in progress...";
    } else {
      matchStatus.innerText = "Waiting for opponent...";
    }
  });
}

function evaluateWinner(pA, pB){
  let winnerText = "Draw";
  if (pA.score > pB.score) winnerText = pA.name + " wins!";
  else if (pB.score > pA.score) winnerText = pB.name + " wins!";
  resultLabel.innerText = winnerText;

  const scoreNodeRef = ref(db, `tetris/scores/rooms/${roomId}`);
  const payload = {
    players: { [pA.name]: pA.score, [pB.name]: pB.score },
    winner: winnerText,
    time: Date.now()
  };
  set(scoreNodeRef, payload);
  matchStatus.innerText = "Duel finished";
  stopMusic();
  sounds.gameOver();
}

startGameBtn.onclick = () => {
  if (!roomId || !myPlayerRef) return alert("Join or create room first.");
  update(myPlayerRef, { status: "playing", score: 0 });
  startTetris();
  startMusic();
  matchStatus.innerText = "Playing...";
};

forfeitBtn.onclick = async () => {
  if (!myPlayerRef) return;
  await update(myPlayerRef, { status: "finished", score });
  matchStatus.innerText = "You forfeited";
  stopMusic();
  sounds.gameOver();
};

/* ======================================
   GAME LOGIC
====================================== */
function createMatrix(w,h){ const m=[]; while(h--) m.push(new Array(w).fill(0)); return m; }
function pieceFrom(type){
  if (type === "T") return [[0,1,0],[1,1,1],[0,0,0]];
  if (type === "O") return [[1,1],[1,1]];
  if (type === "L") return [[0,1],[0,1],[0,1]];
  if (type === "J") return [[1,0],[1,0],[1,0]];
  if (type === "I") return [[1,1,1,1]];
  if (type === "S") return [[0,1,1],[1,1,0],[0,0,0]];
  if (type === "Z") return [[1,1,0],[0,1,1],[0,0,0]];
}
function createPiece(){
  const pieces = "ILJOTSZ";
  return pieceFrom(pieces[Math.floor(Math.random()*pieces.length)]);
}

function collide(arena, player){
  const [m,o]=[player.matrix, player.pos];
  for(let y=0;y<m.length;y++){
    for(let x=0;x<m[y].length;x++){
      if(m[y][x] !== 0 &&
         (arena[y+o.y] && arena[y+o.y][x+o.x]) !== 0){
        return true;
      }
    }
  }
  return false;
}

function merge(arena, player){
  player.matrix.forEach((row,y)=>{
    row.forEach((v,x)=>{
      if(v!==0) arena[y+player.pos.y][x+player.pos.x] = v;
    });
  });
}

function rotate(matrix){
  return matrix[0].map((_,i)=>matrix.map(row=>row[i])).reverse();
}

function arenaSweep(){
  let rows = 1;
  outer: for(let y=arena.length-1;y>0;y--){
    for(let x=0;x<arena[y].length;x++){
      if(arena[y][x] === 0) continue outer;
    }
    arena.splice(y,1);
    arena.unshift(new Array(12).fill(0));
    score += rows * 10;
    rows *= 2;
    scoreDisplay.innerText = score;
    sounds.clear();
  }
}

function draw(){
  ctx.fillStyle = "#000";
  ctx.fillRect(0,0,canvas.width, canvas.height);
  drawMatrix(arena, {x:0,y:0});
  drawMatrix(player.matrix, player.pos);
}

function drawMatrix(matrix, offset){
  matrix.forEach((row,y)=>{
    row.forEach((v,x)=>{
      if(v!==0){
        ctx.fillStyle = "#0f0";
        ctx.fillRect(x+offset.x, y+offset.y, 1, 1);
      }
    });
  });
}

function playerDrop(){
  player.pos.y++;
  if(collide(arena, player)){
    player.pos.y--;
    merge(arena, player);
    sounds.drop();
    playerReset();
    arenaSweep();
  }
  dropCounter = 0;
}

function playerMove(dir){
  player.pos.x += dir;
  if(collide(arena, player)) player.pos.x -= dir;
}

function playerReset(){
  player.matrix = createPiece();
  player.pos.y = 0;
  player.pos.x = (arena[0].length/2 | 0);
  if(collide(arena, player)){
    arena.forEach(row=>row.fill(0));
    if (myPlayerRef) update(myPlayerRef, { status: "finished", score });
    alert("Game Over!");
    stopMusic();
    sounds.gameOver();
  }
}

document.addEventListener("keydown",(e)=>{
  if(!player) return;
  if(e.key==="ArrowLeft") playerMove(-1);
  if(e.key==="ArrowRight") playerMove(1);
  if(e.key==="ArrowDown") playerDrop();
  if(e.key==="ArrowUp") {
    player.matrix = rotate(player.matrix);
    sounds.rotate();
  }
  if(e.key==="m" || e.key==="M") muteBtn.click();
});

function update(time=0){
  if(!player) return;
  const delta=time-lastTime;
  lastTime=time;
  dropCounter+=delta;
  if(dropCounter>dropInterval) playerDrop();
  draw();
  requestAnimationFrame(update);
}

function startTetris(){
  arena=createMatrix(12,20);
  player={ pos:{x:5,y:0}, matrix:createPiece() };
  score=0;
  scoreDisplay.innerText=score;
  dropCounter=0;
  lastTime=0;
  if(myPlayerRef) update(myPlayerRef,{ status:"playing", score:0 });
  requestAnimationFrame(update);
  startScoreSync();
}

let scoreUpdateInterval=null;
function startScoreSync(){
  if(!myPlayerRef) return;
  if(scoreUpdateInterval) clearInterval(scoreUpdateInterval);
  scoreUpdateInterval=setInterval(()=>{ update(myPlayerRef,{ score }); },2000);
}

window.addEventListener("beforeunload", async()=>{
  if(myPlayerRef){ try{ await update(myPlayerRef,{ status:"left" }); }catch(e){} }
});
