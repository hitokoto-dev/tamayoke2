// js/main.js — 依存最小の本復帰版（弾生成は内蔵）+ ランキング送信
import {
  Rank, renderLeaderboard, detectRankEndpoint,
  loadPlayerName, savePlayerName, loadBest, saveBest
} from "./rank.js";

const W = 960, H = 540;
const TITLE = "title", PLAY = "play", OVER = "over";
const DEBUG = new URL(location.href).searchParams.has("debug");
const BUILD_V = (globalThis.V ?? "dev");

// ---------- DOM ----------
await (document.readyState === "loading"
  ? new Promise(res => document.addEventListener("DOMContentLoaded", res, { once: true }))
  : 0);

const canvas = document.getElementById("g");
const ctx = canvas.getContext("2d");
function fit() { const s = Math.min(innerWidth / W, innerHeight / H); canvas.style.width = `${(W * s) | 0}px`; canvas.style.height = `${(H * s) | 0}px`; }
addEventListener("resize", fit); fit();
const elLeaderboard = document.getElementById("ui-leaderboard");

// ---------- 入力 ----------
const keys = new Set();
addEventListener("keydown", e => { if (!e.repeat) keys.add(e.key); if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault(); });
addEventListener("keyup", e => keys.delete(e.key));
let pointerDown = false, pointerX = W / 2, pointerY = H * 0.75;
function cpos(e){ const r = canvas.getBoundingClientRect(); return { x:(e.clientX-r.left)*W/r.width, y:(e.clientY-r.top)*H/r.height }; }
canvas.addEventListener("pointerdown", e => { pointerDown = true; const p = cpos(e); pointerX = p.x; pointerY = p.y; });
addEventListener("pointerup", () => pointerDown = false);
canvas.addEventListener("pointermove", e => { if (!pointerDown) return; const p = cpos(e); pointerX = p.x; pointerY = p.y; });

// ---------- ゲーム状態 ----------
const player = { x: W/2, y: H*0.8, size: 24, hitR: 10, speed: 240, slow: 0.5 };
let bullets = [];
let state = TITLE, allowReturnAt = 0, time = 0, score = 0;

// かんたん弾生成（内蔵）
const timers = { rain: 0, side: 0, ring: 0 };
function spawn(dt){
  timers.rain += dt; timers.side += dt; timers.ring += dt;

  if (timers.rain >= 0.16) { // 雨
    timers.rain = 0;
    const x = 20 + Math.random() * (W - 40);
    bullets.push({ x, y: -10, vx: 0, vy: 140 + Math.random()*50, r: 6, alive: true });
  }
  if (timers.side >= 1.2) { // 横
    timers.side = 0;
    const left = Math.random() < 0.5, y = 60 + Math.random() * (H - 220);
    for (let i = 0; i < 6; i++) {
      bullets.push({ x: left ? -10 : W + 10, y: y + i * 10, vx: left ? 160 : -160, vy: (Math.random()*2-1)*20, r: 6, alive: true });
    }
  }
  if (timers.ring >= 2.4) { // リング
    timers.ring = 0;
    const cx = 80 + Math.random()*(W-160), cy = 80 + Math.random()*(H-220), n = 18, spd = 120;
    for (let i=0;i<n;i++){ const a = i/n*Math.PI*2; bullets.push({ x:cx, y:cy, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd, r:6, alive:true }); }
  }
}
function update(dt){
  // 移動
  let dx=0,dy=0;
  if(keys.has("ArrowLeft")||keys.has("a")||keys.has("A")) dx-=1;
  if(keys.has("ArrowRight")||keys.has("d")||keys.has("D")) dx+=1;
  if(keys.has("ArrowUp")||keys.has("w")||keys.has("W")) dy-=1;
  if(keys.has("ArrowDown")||keys.has("s")||keys.has("S")) dy+=1;
  if(pointerDown){ player.x+=(pointerX-player.x)*0.35; player.y+=(pointerY-player.y)*0.35; }
  else if(dx||dy){ const len=Math.hypot(dx,dy)||1; const v=player.speed*((keys.has("Shift")||keys.has(" "))?player.slow:1); player.x+=(dx/len)*v*dt; player.y+=(dy/len)*v*dt; }
  player.x=Math.max(0,Math.min(W,player.x)); player.y=Math.max(0,Math.min(H,player.y));

  // 弾
  spawn(dt);
  for(const b of bullets){ b.x+=b.vx*dt; b.y+=b.vy*dt; if(b.x<-40||b.x>W+40||b.y<-40||b.y>H+40) b.alive=false; }
  bullets = bullets.filter(b=>b.alive);

  // 当たり
  for(const b of bullets){ const rr=(b.r+player.hitR); const dx=b.x-player.x, dy=b.y-player.y; if(dx*dx+dy*dy<=rr*rr) return true; }
  return false;
}

// ---------- 描画 ----------
function drawBG(){
  const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#0b1020"); g.addColorStop(1,"#101a35");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  // 下部セーフ
  ctx.fillStyle="rgba(20,200,120,0.10)"; ctx.fillRect(0, H-90, W, 90);
}
function drawTitle(){
  ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.font="48px Orbitron, sans-serif"; ctx.fillText("TAMAYOKE 2", W/2, H*0.36);
  ctx.font="18px Noto Sans JP, sans-serif"; ctx.fillText("クリック／Enter でスタート", W/2, H*0.36+56);
}
function drawPlayer(){
  ctx.save(); ctx.translate(player.x,player.y);
  const s=player.size; ctx.fillStyle="#4cf";
  ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*0.7,0); ctx.lineTo(0,s); ctx.lineTo(-s*0.7,0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(0,0,player.hitR,0,Math.PI*2); ctx.stroke();
  ctx.restore();
}
function drawBullets(){ ctx.fillStyle="#fff"; for(const b of bullets){ ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); } }
function drawScore(){ const s=String(score|0).padStart(6,"0"); ctx.font="20px Orbitron, monospace"; ctx.textAlign="right"; ctx.textBaseline="top"; ctx.fillStyle="#fff"; ctx.fillText(`SCORE  ${s}`, W-16, 12); }
function drawGameOver(){
  ctx.font="46px Orbitron, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle="#ff9";
  ctx.fillText("GAME OVER", W/2, H*0.35);
  ctx.font="18px Noto Sans JP, sans-serif"; ctx.fillStyle="#fff";
  ctx.fillText("0.7秒後に クリック／Enter でタイトルへ", W/2, H*0.35+50);
}
function drawDebug(){
  if(!DEBUG) return;
  ctx.font="12px monospace"; ctx.textAlign="left"; ctx.textBaseline="top"; ctx.fillStyle="rgba(255,255,255,0.85)";
  ctx.fillText(`V=${BUILD_V} state=${state} bullets=${bullets.length}`, 8, H-20);
}

// ---------- ランキング ----------
let rank = null;
async function submitIfBest(finalScore){
  const prev = loadBest();
  if ((finalScore|0) <= prev) return;
  saveBest(finalScore|0);

  let name = loadPlayerName();
  if (!name) { name = (prompt("名前（16文字まで）を入力してください","YOU")||"YOU").trim().slice(0,16); savePlayerName(name); }

  const res = await rank.submit(name, finalScore|0);
  if (res.status === "ok") { renderLeaderboard(rank, elLeaderboard).catch(()=>{}); }
}

// ---------- ループ ----------
let prev = performance.now();
function loop(ts){
  const dt = Math.min(1/20, Math.max(0,(ts-prev)/1000)); prev = ts;

  if (state === TITLE) {
    if (keys.has("Enter") || pointerDown) { pointerDown=false; state=PLAY; time=0; score=0; bullets.length=0; }
  } else if (state === PLAY) {
    time += dt; score += 10*dt;
    const hit = update(dt);
    if (hit) { const finalScore = score|0; submitIfBest(finalScore).catch(()=>{}); state=OVER; allowReturnAt=performance.now()+700; bullets.length=0; }
  } else if (state === OVER) {
    if (performance.now() >= allowReturnAt && (keys.has("Enter") || pointerDown)) { pointerDown=false; state=TITLE; }
  }

  drawBG();
  if (state === TITLE) { drawTitle(); }
  else if (state === PLAY) { drawBullets(); drawPlayer(); drawScore(); }
  else { drawBullets(); drawGameOver(); drawScore(); }

  drawDebug();
  requestAnimationFrame(loop);
}

// ---------- 起動 ----------
(async () => {
  const ep = await detectRankEndpoint();
  rank = new Rank(ep);
  renderLeaderboard(rank, elLeaderboard).catch(()=>{});
  requestAnimationFrame(loop);
})();
