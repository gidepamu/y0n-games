import { db, ref, set } from "./firebase.js";

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const scale = 20;
ctx.scale(scale, scale);

let score = 0;
const playerName = localStorage.getItem("playerName");
document.getElementById("playerName").innerText = playerName;

const arena = createMatrix(12, 20);
const player = {
  pos: { x: 5, y: 0 },
  matrix: createPiece(),
};

// === RETRO AUDIO ENGINE ===
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

// === BACKGROUND MUSIC ===
function startMusic() {
  if (musicPlaying) return;
  const now = audioCtx.currentTime;
  const tempo = 0.4; // beat spacing
  const notes = [261, 329, 392, 523, 392, 329]; // simple loop melody
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

// add a small button for mute/unmute
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
    audioCtx.resume(); // resume audio context if suspended
    startMusic();
    muteBtn.innerText = "🔊 Music ON";
  }
};

// === GAME LOGIC ===
function createPiece() {
  const pieces = "ILJOTSZ";
  return pieceFrom(pieces[Math.floor(Math.random() * pieces.length)]);
}

function pieceFrom(type) {
  if (type === "T") return [[0,1,0],[1,1,1],[0,0,0]];
  if (type === "O") return [[1,1],[1,1]];
  if (type === "L") return [[0,1],[0,1],[0,1]];
  if (type === "J") return [[1,0],[1,0],[1,0]];
  if (type === "I") return [[1,1,1,1]];
  if (type === "S") return [[0,1,1],[1,1,0],[0,0,0]];
  if (type === "Z") return [[1,1,0],[0,1,1],[0,0,0]];
}

function createMatrix(w,h){
  const m=[];
  while(h--){ m.push(new Array(w).fill(0)); }
  return m;
}

function collide(arena, player){
  const [m,o]=[player.matrix, player.pos];
  for(let y=0; y<m.length; y++){
    for(let x=0; x<m[y].length; x++){
      if(m[y][x] !== 0 &&
         (arena[y+o.y] && arena[y+o.y][x+o.x]) !== 0){
        return true;
      }
    }
  }
  return false;
}

function merge(arena, player){
  player.matrix.forEach((row, y)=>{
    row.forEach((value, x)=>{
      if(value !== 0){ arena[y+player.pos.y][x+player.pos.x] = value; }
    });
  });
}

function rotate(matrix){
  return matrix[0].map((_,i)=>matrix.map(row=>row[i])).reverse();
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
  if(collide(arena, player)){ player.pos.x -= dir; }
}

function playerReset(){
  player.matrix = createPiece();
  player.pos.y = 0;
  player.pos.x = (arena[0].length/2 | 0);

  if (collide(arena, player)){
    arena.forEach(row=>row.fill(0));
    saveScore();
    sounds.gameOver();
    setTimeout(() => {
      alert("Game Over!");
      stopMusic();
      window.location = "menu.html";
    }, 700);
  }
}

function arenaSweep(){
  let rows = 1;
  outer: for(let y=arena.length-1; y>0; y--){
    for(let x=0; x<arena[y].length; x++){
      if(arena[y][x]==0){ continue outer; }
    }
    arena.splice(y,1);
    arena.unshift(new Array(12).fill(0));
    score += rows * 10;
    rows *= 2;
    document.getElementById("score").innerText = score;
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

let dropCounter = 0;
let dropInterval = 500;
let lastTime = 0;

function update(time = 0){
  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;
  if(dropCounter > dropInterval){ playerDrop(); }
  draw();
  requestAnimationFrame(update);
}
update();

// === CONTROLS ===
document.addEventListener("keydown",(e)=>{
  if(e.key=="ArrowLeft") playerMove(-1);
  if(e.key=="ArrowRight") playerMove(1);
  if(e.key=="ArrowDown") playerDrop();
  if(e.key=="ArrowUp") {
    player.matrix = rotate(player.matrix);
    sounds.rotate();
  }
  if(e.key=="m" || e.key=="M"){
    muteBtn.click();
  }
});

// === SAVE SCORE TO FIREBASE ===
async function saveScore(){
  const path = `tetris/scores/${playerName}`;
  await set(ref(db, path), {
    name: playerName,
    score,
    time: Date.now(),
  });
}

// === Start background music ===
startMusic();
