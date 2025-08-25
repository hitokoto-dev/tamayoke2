// js/main.js (self-healing DOM版 / まるっと差し替え)
// tamayoke2 main loop / state / UI / audio unlock+crossfade / rank submit
// 16:9 logical 960x540, CSS scale (aspect preserved)

import {
  NormalBullet,
  FastBullet,
  HomingBullet,
  KanjiBullet,
  loadBulletSprites
} from "./bullets.js";

import * as SpawnerMod from "./spawner.js";

import {
  Rank,
  renderLeaderboard,
  loadPlayerName,
  savePlayerName,
  loadBest,
  saveBest
} from "./rank.js";

// ----------------------------------------
// Constants & global flags
// ----------------------------------------
const W = 960, H = 540; // logical size
const TITLE = "title";
const PLAY  = "play";
const OVER  = "over";

const url = new URL(location.href);
const DEBUG = url.searchParams.has("debug");

// V (cache-buster) from index.html if exposed; fallback
const BUILD_V = (globalThis.V ?? "dev");

// ----------------------------------------
// DOM / Canvas（自己修復: DOMを待ち、無ければ生成）
// ----------------------------------------
let canvas = null;
let ctx = null;
let elLeaderboard = null;

function ensureLeaderboardStyle(el) {
  // index.html 側にCSSが無い場合のための最低限スタイル
  if (!el) return;
  el.className = el.className || "leaderboard";
  if (!el.style.position) {
    Object.assign(el.style, {
      position:"absolute", top:"12px", right:"12px", width:"240px", height:"220px",
      padding:"8px", border:"1px solid #334", background:"rgba(0,0,0,.35)",
      font:"14px Orbitron,monospace", whiteSpace:"pre", overflow:"auto", color:"#fff"
    });
  }
}

// CSS scale to fit window (aspect keep)
function fitCanvas() {
  if (!canvas) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.min(vw / W, vh / H);
  canvas.style.width = `${(W * scale) | 0}px`;
  canvas.style.height = `${(H * scale) | 0}px`;
}

// DOM ready helper
async function domReady() {
  if (document.readyState === "loading") {
    await new Promise(res => document.addEventListener("DOMContentLoaded", res, { once: true }));
  }
}

// DOM bootstrap（存在しなければ自動生成）
async function ensureDom() {
  await domReady();

  // canvas
  canvas = document.getElementById("g");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "g";
    canvas.width = W;
    canvas.height = H;
    (document.getElementById("stage") || document.body).appendChild(canvas);
  }
  ctx = canvas.getContext("2d");

  // leaderboard
  elLeaderboard = document.getElementById("ui-leaderboard");
  if (!elLeaderboard) {
    elLeaderboard = document.createElement("pre");
    elLeaderboard.id = "ui-leaderboard";
    elLeaderboard.textContent = "未設定";
    (document.getElementById("stage") || document.body).appendChild(elLeaderboard);
  }
  ensureLeaderboardStyle(elLeaderboard);

  window.addEventListener("resize", fitCanvas);
  fitCanvas();
}

// ----------------------------------------
// Input (mouse/touch drag + keyboard WASD/arrow + Shift/Space=slow)
// ----------------------------------------
const keys = new Set();
let pointerDown = false;
let pointerX = W/2, pointerY = H*0.75;

window.addEventListener("keydown", (e)=> {
  if (e.repeat) return;
  keys.add(e.key);
  // prevent page scroll on arrows/space
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
});
window.addEventListener("keyup",   (e)=> { keys.delete(e.key); });

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * (W / r.width);
  const y = (e.clientY - r.top)  * (H / r.height);
  return { x, y };
}
function attachPointerHandlers() {
  canvas.addEventListener("pointerdown", (e)=>{
    pointerDown = true;
    const p = canvasPos(e);
    pointerX = p.x; pointerY = p.y;
    unlockAudio(); // first gesture -> resume AudioContext
  });
  window.addEventListener("pointerup",   ()=> pointerDown = false);
  canvas.addEventListener("pointermove", (e)=>{
    if (!pointerDown) return;
    const p = canvasPos(e);
    pointerX = p.x; pointerY = p.y;
  });
}

// ----------------------------------------
// Config
// ----------------------------------------
let config = null;
async function loadConfig() {
  const bust = DEBUG ? `?v=${Math.random()}` : `?v=${encodeURIComponent(BUILD_V)}`;
  const r = await fetch(`./config/game.json${bust}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`config load failed: ${r.status}`);
  const data = await r.json();
  return data;
}

// ----------------------------------------
// Audio (simple WebAudio crossfade player with loop points)
// ----------------------------------------
let AC = null;
let masterGain = null;

const bgm = {
  current: null,  // {key, src, loopStart, loopEnd, gain, node, buf}
  next: null,
  tracks: new Map(), // key -> {src, loopStart, loopEnd, buf}
  crossfadeMs: 400
};

function makeAC() {
  AC = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = AC.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(AC.destination);
}

async function decodeToBuffer(url) {
  const res = await fetch(url, { cache: "force-cache" });
  const ab = await res.arrayBuffer();
  return await AC.decodeAudioData(ab);
}

async function prepareBgmFromConfig(cfg) {
  if (!cfg?.audio?.bgm) return;
  bgm.crossfadeMs = Math.max(0, cfg.audio.crossfadeMs ?? 400);
  const entries = Object.entries(cfg.audio.bgm);
  for (const [key, spec] of entries) {
    const src = spec.src || spec.url || spec.file;
    if (!src) continue;
    const loopStart = Number(spec.loopStart ?? 0);
    const loopEnd   = Number(spec.loopEnd ?? 0);
    bgm.tracks.set(key, { src, loopStart, loopEnd, buf: null });
  }
}

async function ensureTrackBuffer(key) {
  const t = bgm.tracks.get(key);
  if (!t) return null;
  if (t.buf) return t.buf;
  t.buf = await decodeToBuffer(t.src);
  return t.buf;
}

function startLoopingSource(buffer, loopStart, loopEnd) {
  const src = AC.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  if (loopEnd > loopStart) {
    src.loopStart = loopStart;
    src.loopEnd = loopEnd;
  }
  const g = AC.createGain();
  g.gain.value = 0;
  src.connect(g).connect(masterGain);
  src.start(0);
  return { node: src, gain: g };
}

async function crossfadeTo(key) {
  if (!AC || AC.state !== "running") return;
  if (!bgm.tracks.has(key)) return;
  if (bgm.current?.key === key) return; // same track

  const buf = await ensureTrackBuffer(key);
  if (!buf) return;
  const { loopStart=0, loopEnd=0 } = bgm.tracks.get(key);
  const nxt = startLoopingSource(buf, loopStart, loopEnd);
  bgm.next = { key, ...nxt };

  const dur = Math.max(0.01, bgm.crossfadeMs / 1000);
  const now = AC.currentTime;

  // fade-in next
  bgm.next.gain.gain.cancelScheduledValues(now);
  bgm.next.gain.gain.setValueAtTime(0, now);
  bgm.next.gain.gain.linearRampToValueAtTime(1, now + dur);

  // fade-out current
  if (bgm.current) {
    const c = bgm.current;
    c.gain.gain.cancelScheduledValues(now);
    c.gain.gain.setValueAtTime(c.gain.gain.value, now);
    c.gain.gain.linearRampToValueAtTime(0, now + dur);
    setTimeout(()=> {
      try { c.node.stop(); } catch {}
    }, bgm.crossfadeMs + 50);
  }

  // promote next to current
  bgm.current = bgm.next;
  bgm.next = null;
}

let audioUnlocked = false;
async function unlockAudio() {
  if (audioUnlocked) return;
  if (!AC) makeAC();
  try {
    await AC.resume();
    audioUnlocked = (AC.state === "running");
  } catch {}
}

// ----------------------------------------
// Rank (GAS)
// ----------------------------------------
let rank = null;

// ----------------------------------------
// Game objects
// ----------------------------------------
const player = {
  x: W/2, y: H*0.8,
  size: 24,
  hitR: 10,
  speed: 240,
  slow: 0.5
};

let bullets = [];       // {update(dt), draw(ctx), alive, x,y,hitR?}
let spawner = null;     // created from spawner.js (injected bullet classes)
let state = TITLE;      // "title" | "play" | "over"
let allowReturnAt = 0;  // ms timestamp after which we can return to title from OVER
let score = 0;
let timePlay = 0;       // seconds since game start
let showDebug = DEBUG;  // F2 toggle

// difficulty ramp helper (linear -> clamp to 1.0)
function difficultyMul(tSec, base = 0.2, grow = 0.8, timeToMax = 120) {
  const r = Math.min(1, base + grow * Math.min(1, tSec / timeToMax));
  return r;
}

// ----------------------------------------
// Spawner wiring（フォールバック内蔵）
// ----------------------------------------
function createSpawnerAdapter(cfg) {
  const Bullets = { NormalBullet, FastBullet, HomingBullet, KanjiBullet };
  const S = SpawnerMod?.default || SpawnerMod?.Spawner || null;

  if (typeof S === "function") {
    return new S({ Bullets, config: cfg });
  }
  if (typeof SpawnerMod.createSpawner === "function") {
    return SpawnerMod.createSpawner({ Bullets, config: cfg });
  }
  // fallback: simple patterns
  let last = { rain: 0, side: 0, ring: 0, kanji: 0, homing: 0 };
  return {
    update(dt, nowSec) {
      const s = cfg.spawns || {};
      const bscale = cfg?.tuning?.bulletSpeedScale ?? 1.0;
      function push(b) { if (b) bullets.push(b); }

      // rain
      last.rain += dt;
      if (last.rain >= (s.rainEvery ?? 3.8)) {
        last.rain = 0;
        const n = Math.max(8, Math.floor(14 * difficultyMul(nowSec)));
        for (let i = 0; i < n; i++) {
          const x = (W / n) * (i + 0.5);
          const y = -10;
          const v = 90 * (0.9 + Math.random()*0.3) * bscale;
          push(new NormalBullet(x, y, 0, v));
        }
      }

      // side
      last.side += dt;
      if (last.side >= (s.sideEvery ?? 1.8)) {
        last.side = 0;
        const left = Math.random() < 0.5;
        const y0 = 60 + Math.random() * (H - 120);
        const count = Math.max(4, Math.floor(8 * difficultyMul(nowSec)));
        for (let i = 0; i < count; i++) {
          const x = left ? -10 : W + 10;
          const vx = (left ? 140 : -140) * (0.9 + Math.random()*0.3) * bscale;
          const vy = (Math.random()*2 - 1) * 20;
          push(new FastBullet(x, y0 + i*8, vx, vy));
        }
      }

      // ring
      last.ring += dt;
      if (last.ring >= (s.ringEvery ?? 9.0)) {
        last.ring = 0;
        const cx = 80 + Math.random()*(W-160);
        const cy = 80 + Math.random()*(H-160);
        const n = 24;
        const spd = 130 * bscale;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const vx = Math.cos(a) * spd;
          const vy = Math.sin(a) * spd;
          push(new NormalBullet(cx, cy, vx, vy));
        }
      }

      // kanji
      last.kanji += dt;
      if (last.kanji >= (s.kanjiEvery ?? 5.0)) {
        last.kanji = 0;
        const x = Math.random() * W;
        const y = -20;
        push(new KanjiBullet(x, y));
      }

      // homing
      last.homing += dt;
      if (last.homing >= (s.homingEvery ?? 4.5)) {
        last.homing = 0;
        const edge = Math.floor(Math.random()*4);
        let x = 0, y = 0;
        if (edge === 0) { x = Math.random()*W; y = -10; }
        if (edge === 1) { x = W+10; y = Math.random()*H; }
        if (edge === 2) { x = Math.random()*W; y = H+10; }
        if (edge === 3) { x = -10; y = Math.random()*H; }
        push(new HomingBullet(x, y));
      }
    }
  };
}

// ----------------------------------------
// Zones (safe bottom / bonus orbit center)
// ----------------------------------------
function valAsPx(v, total) {
  if (v == null) return 0;
  if (v > 0 && v <= 1.0) return v * total; // ratio
  return v; // px
}
function getZonesNow(tSec) {
  const zc = config?.zones || {};
  const safeH = valAsPx(zc.safeH ?? 90, H);
  const safeTop = H - safeH;

  const bm = (config?.bonusMove) || {};
  const cx = bm.cx ?? (W/2);
  const cy = bm.cy ?? (H*0.45);
  const R  = bm.r  ?? 70;
  const sp = bm.speed ?? 0.6;
  const ang = tSec * sp;
  const bx = cx + Math.cos(ang) * R;
  const by = cy + Math.sin(ang) * R;
  const br = bm.radius ?? 48;

  return { safeTop, safeH, bonus: { x: bx, y: by, r: br } };
}

function inCircle(px, py, cx, cy, r) {
  const dx = px - cx, dy = py - cy;
  return (dx*dx + dy*dy) <= (r*r);
}

// ----------------------------------------
// State transitions
// ----------------------------------------
function enterTitle() {
  state = TITLE;
  timePlay = 0;
  bullets.length = 0;
  crossfadeTo("title").catch(()=>{});
  renderLeaderboard(rank, elLeaderboard).catch(()=>{});
}

function startGame() {
  state = PLAY;
  timePlay = 0;
  score = 0;
  bullets.length = 0;
  player.x = W/2; player.y = H*0.8;
  crossfadeTo("play").catch(()=>{});
}

function enterGameOver() {
  state = OVER;
  allowReturnAt = performance.now() + 700; // 0.7s 後にタイトル復帰可
  bullets.length = 0; // 弾クリア
  crossfadeTo("title").catch(()=>{});
}

// ----------------------------------------
// Drawing helpers
// ----------------------------------------
function drawBG(tSec) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b1020");
  g.addColorStop(1, "#101a35");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);
}

function drawZones(tSec) {
  const z = getZonesNow(tSec);
  // safe bottom
  ctx.fillStyle = "rgba(20,200,120,0.10)";
  ctx.fillRect(0, z.safeTop, W, z.safeH);

  // grid (safeCols)
  const cols = config?.zones?.safeCols ?? 0;
  if (cols > 1) {
    ctx.strokeStyle = "rgba(60,220,160,0.10)";
    ctx.lineWidth = 1;
    for (let i = 1; i < cols; i++) {
      const x = (W / cols) * i;
      ctx.beginPath(); ctx.moveTo(x, z.safeTop); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  // bonus orbit circle
  ctx.beginPath();
  ctx.arc(z.bonus.x, z.bonus.y, z.bonus.r, 0, Math.PI*2);
  ctx.fillStyle = "rgba(250,210,60,0.12)";
  ctx.fill();

  // orbit indicator
  ctx.strokeStyle = "rgba(250,210,60,0.25)";
  ctx.lineWidth = 1;
  const bm = config?.bonusMove || {};
  const cx = bm.cx ?? (W/2);
  const cy = bm.cy ?? (H*0.45);
  const R  = bm.r  ?? 70;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI*2);
  ctx.stroke();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = "#4cf";
  const s = player.size;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s*0.7, 0);
  ctx.lineTo(0, s);
  ctx.lineTo(-s*0.7, 0);
  ctx.closePath();
  ctx.fill();

  // hit circle
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath(); ctx.arc(0,0, player.hitR, 0, Math.PI*2); ctx.stroke();

  ctx.restore();
}

function drawBullets() {
  for (const b of bullets) b.draw?.(ctx);
}

function drawScore() {
  const s = String(score | 0).padStart(6, "0");
  ctx.font = "20px Orbitron, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#fff";
  ctx.fillText(`SCORE  ${s}`, W - 16, 12);
}

function drawTitle() {
  ctx.font = "48px Orbitron, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText("TAMAYOKE 2", W/2, H*0.36);

  ctx.font = "18px Noto Sans JP, sans-serif";
  ctx.fillText("クリック／Enter でスタート", W/2, H*0.36 + 56);
}

function drawGameOver() {
  ctx.font = "46px Orbitron, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff9";
  ctx.fillText("GAME OVER", W/2, H*0.35);

  ctx.font = "18px Noto Sans JP, sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText("0.7秒後に クリック／Enter でタイトルへ", W/2, H*0.35 + 50);
}

function drawDebugOverlay(tSec, fps, bulletCount) {
  if (!showDebug) return;
  ctx.font = "12px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const lines = [
    `V=${BUILD_V}  state=${state}`,
    `time=${tSec.toFixed(2)}  fps=${fps|0}`,
    `bullets=${bulletCount}  score=${score|0}`
  ];
  let y = H - 12*lines.length - 8;
  for (const s of lines) {
    ctx.fillText(s, 8, y);
    y += 12;
  }
}

// ----------------------------------------
// Update
// ----------------------------------------
function updatePlayer(dt) {
  // keyboard
  let dx = 0, dy = 0;
  if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) dx -= 1;
  if (keys.has("ArrowRight")|| keys.has("d") || keys.has("D")) dx += 1;
  if (keys.has("ArrowUp")   || keys.has("w") || keys.has("W")) dy -= 1;
  if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) dy += 1;

  // drag pointer (優先度高)
  if (pointerDown) {
    player.x += (pointerX - player.x) * 0.35;
    player.y += (pointerY - player.y) * 0.35;
  } else if (dx || dy) {
    const len = Math.hypot(dx,dy) || 1;
    const slow = (keys.has("Shift") || keys.has(" ")) ? player.slow : 1.0;
    const v = player.speed * slow;
    player.x += (dx/len) * v * dt;
    player.y += (dy/len) * v * dt;
  }

  // clamp
  player.x = Math.max(0, Math.min(W, player.x));
  player.y = Math.max(0, Math.min(H, player.y));
}

function updateBullets(dt, nowSec) {
  spawner?.update?.(dt, nowSec);

  for (const b of bullets) b.update?.(dt, player);

  bullets = bullets.filter(b => b.alive !== false &&
    b.x > -40 && b.x < W+40 && b.y > -40 && b.y < H+40);
}

function checkCollision() {
  for (const b of bullets) {
    const br = (b.hitR ?? b.r ?? 6);
    const dx = b.x - player.x;
    const dy = b.y - player.y;
    if (dx*dx + dy*dy <= (br + player.hitR) * (br + player.hitR)) return true;
  }
  return false;
}

// ----------------------------------------
// Rank submission (best only)
// ----------------------------------------
async function submitIfBest(finalScore) {
  const prev = loadBest();
  if ((finalScore|0) <= prev) return;

  saveBest(finalScore|0);

  let name = loadPlayerName();
  if (!name) {
    name = (prompt("名前（16文字まで）を入力してください", "YOU") || "YOU").trim().slice(0,16);
    savePlayerName(name);
  }
  const res = await rank.submit(name, finalScore|0);
  if (res.status === "ok") {
    renderLeaderboard(rank, elLeaderboard).catch(()=>{});
  } else {
    console.warn("rank submit failed:", res.error);
  }
}

// ----------------------------------------
// Main loop
// ----------------------------------------
let prevTs = performance.now();
let fps = 60;

function loop(ts) {
  const dt = Math.min(1/20, Math.max(0, (ts - prevTs) / 1000)); // clamp dt
  prevTs = ts;
  fps = 0.9*fps + 0.1*(1/dt);

  // input: global keys (state change)
  if (state === TITLE) {
    if (keys.has("Enter") || pointerDown) {
      startGame();
      pointerDown = false;
    }
  } else if (state === PLAY) {
    timePlay += dt;
    updatePlayer(dt);
    updateBullets(dt, timePlay);

    // score: 時間 & ボーナスゾーン
    const z = getZonesNow(timePlay);
    const inBonus = inCircle(player.x, player.y, z.bonus.x, z.bonus.y, z.bonus.r);
    score += (inBonus ? 4 : 1) * 10 * dt; // base 10pt/s, bonus 4x

    // collision -> GAME OVER固定
    if (checkCollision()) {
      const finalScore = score|0;
      submitIfBest(finalScore).catch(()=>{});
      enterGameOver();
    }
  } else if (state === OVER) {
    if ((performance.now() >= allowReturnAt) && (keys.has("Enter") || pointerDown)) {
      pointerDown = false;
      enterTitle();
    }
  }

  // draw
  drawBG(timePlay);
  drawZones(timePlay);

  if (state === TITLE) {
    drawTitle();
  } else if (state === PLAY) {
    drawBullets();
    drawPlayer();
    drawScore();
  } else if (state === OVER) {
    drawBullets();
    drawGameOver();
    drawScore();
  }

  drawDebugOverlay(timePlay, fps, bullets.length);

  requestAnimationFrame(loop);
}

// ----------------------------------------
// Boot
// ----------------------------------------
(async function boot() {
  try {
    await ensureDom();          // ★ DOM準備＆自己修復
    attachPointerHandlers();    // ★ pointer handlers after canvas ready

    config = await loadConfig();

    // player tuning from config
    if (config?.player) {
      player.size  = config.player.size  ?? player.size;
      player.hitR  = config.player.hitR  ?? player.hitR;
      player.speed = config.player.speed ?? player.speed;
      player.slow  = config.player.slow  ?? player.slow;
    }

    // rank
    rank = new Rank((config.rankApi && config.rankApi.endpoint) || "");

    // audio prepare
    makeAC();
    await prepareBgmFromConfig(config);
    // note: 実再生はユーザー操作で unlockAudio() → crossfadeTo()

    // bullets images（ロード完了まで待つ）
    await loadBulletSprites();

    // spawner
    spawner = createSpawnerAdapter(config);

    // debug toggle
    window.addEventListener("keydown", (e)=>{
      if (e.key === "F2") showDebug = !showDebug;
    });

    // start in title
    enterTitle();
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    if (ctx) {
      ctx.fillStyle = "#fff";
      ctx.font = "16px monospace";
      ctx.fillText("BOOT ERROR: " + err.message, 12, 20);
    } else {
      alert("BOOT ERROR: " + err.message);
    }
  }
})();
