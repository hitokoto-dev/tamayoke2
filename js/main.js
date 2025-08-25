// js/main.js  — tamayoke2 安定版（依存なし・単体で動作）
// 要件反映：巨大漢字=5s/10x/非追尾、青=5x&70°で追尾終了、セーフ=無敵&減点、SCOREぶれ防止、プレイヤー固定向き

"use strict";

// ---- version / cache bust ----
const VER = (typeof V !== "undefined" ? V : "dev");
const bust = (url) => url + (url.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(VER);

// ---- assets（既存のアセット名）----
const IMG_SRC = {
  bg:         "assets/img/bg_mechcity_loop.png",
  zoneSafe:   "assets/img/zone_safe.png",
  zoneBonus:  "assets/img/zone_bonus.png",
  player:     "assets/img/player.png",
  b_normal:   "assets/img/bullet_normal.png",
  b_fast:     "assets/img/bullet_fast.png",
  b_homing:   "assets/img/bullet_homing.png",
  b_big:      "assets/img/bullet_big.png",
};

// ---- defaults（config が読めなくても起動）----
const DEFAULTS = {
  tuning: { bulletSpeedScale: 0.7 },
  spawns: { rainEvery: 0.15, sideEvery: 1.1, homingEvery: 3.6, kanjiEvery: 5.0 },
  player: { size: 26, hitR: 10, speed: 245, slow: 0.5 },
  zones:  { safeH: 90, safeCols: 6 },
  bonusMove: { cx: 480, cy: 243, r: 70, radius: 144, speed: 0.6 }, // 半径は大きめ
  audio: { crossfadeMs: 400, bgm: {} },
  rankApi: { endpoint: "" }
};

// ---- boot ----
window.addEventListener("DOMContentLoaded", () => {
  boot().catch(err => {
    console.error("BOOT ERROR:", err);
    const el = document.getElementById("bootlog");
    if (el) el.textContent += "\nBOOT ERROR: " + err.message;
  });
}, { once: true });

async function boot() {
  // canvas
  const canvas = document.getElementById("g");
  if (!canvas) throw new Error("#g canvas not found");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  // UI elements
  const elLB = document.getElementById("ui-leaderboard");
  const blog = document.getElementById("bootlog");
  const bl = (m) => { if (blog) blog.textContent += "\n" + m; };

  bl("V=" + VER);

  // CSS scale fit
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = `${(W * s) | 0}px`;
    canvas.style.height = `${(H * s) | 0}px`;
  }
  addEventListener("resize", fit);
  fit();

  // ---- load config ----
  let CFG = DEFAULTS;
  try {
    const r = await fetch(bust("./config/game.json"), { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      // 浅マージ（必要分）
      CFG = {
        tuning: { ...DEFAULTS.tuning, ...(j.tuning || {}) },
        spawns: { ...DEFAULTS.spawns, ...(j.spawns || {}) },
        player: { ...DEFAULTS.player, ...(j.player || {}) },
        zones:  { ...DEFAULTS.zones,  ...(j.zones  || {}) },
        bonusMove: { ...DEFAULTS.bonusMove, ...(j.bonusMove || {}) },
        audio: { ...DEFAULTS.audio, ...(j.audio || {}) },
        rankApi: { ...DEFAULTS.rankApi, ...((j.rankApi) || {}) }
      };
      bl("config ok");
    } else {
      bl("config miss (HTTP " + r.status + ") → defaults");
    }
  } catch (e) {
    bl("config miss (" + e.message + ") → defaults");
  }

  // ---- constants from config / knobs ----
  const SAFE_H = CFG.zones.safeH | 0;
  const BONUS = { cx: CFG.bonusMove.cx, cy: CFG.bonusMove.cy, rOrbit: CFG.bonusMove.r, radius: CFG.bonusMove.radius, speed: CFG.bonusMove.speed };
  const SAFE_PENALTY_PER_SEC = 20; // セーフ中の減点
  const NORMAL_FALL_MIN = 90, NORMAL_FALL_RAND = 30; // 白弾速度
  const HOMING_MAX_STEER_DEG = 70; // 誘導の累計回頭角（しつこさ制限）

  // ---- images ----
  const IMG = new Map();
  async function loadImage(url) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("img load failed: " + url));
      i.src = bust(url);
    });
  }
  await Promise.all(Object.entries(IMG_SRC).map(async ([k, u]) => {
    try { IMG.set(k, await loadImage(u)); bl("img ok: " + u); } catch { bl("img miss: " + u); }
  }));

  // ---- ranking ----
  const rankEndpoint = (CFG.rankApi?.endpoint || "").trim();
  const rank = {
    enabled: !!rankEndpoint,
    async top() {
      if (!this.enabled) return [];
      const r = await fetch(bust(rankEndpoint + "?action=top"), { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const arr = await r.json();
      return Array.isArray(arr) ? arr : [];
    },
    async submit(name, score) {
      if (!this.enabled) return { ok: false };
      const body = new URLSearchParams({ name: String(name || "YOU").slice(0, 16), score: String(score | 0), _ua: navigator.userAgent.slice(0, 64) });
      const r = await fetch(bust(rankEndpoint), { method: "POST", body });
      if (!r.ok) return { ok: false, error: "HTTP " + r.status };
      const d = await r.json().catch(() => ({}));
      return d && d.ok ? { ok: true } : { ok: false, error: d?.error || "unknown" };
    }
  };
  async function renderLeaderboard() {
    if (!elLB) return;
    if (!rank.enabled) { elLB.textContent = "未設定"; return; }
    elLB.textContent = "LOADING...";
    try {
      const rows = await rank.top();
      const lines = rows.slice(0, 10).map((r, i) => {
        const no = String(i + 1).padStart(2, "0");
        const name = String(r.name || "").slice(0, 10).padEnd(10, " ");
        const sc = String(Number(r.score) || 0).padStart(6, " ");
        return `${no}. ${name}  ${sc}`;
      });
      elLB.textContent = lines.length ? lines.join("\n") : "まだスコアがありません";
    } catch (e) {
      console.error(e);
      elLB.textContent = "通信エラー";
    }
  }
  if (rank.enabled) { bl("endpoint=" + rankEndpoint); renderLeaderboard().catch(()=>{}); }
  else { bl("endpoint=(empty) → 未設定"); }

  // ---- simple audio (フォールバックのみ / なくても動作) ----
  let AC = null, master = null, unlocked = false;
  function makeAC() { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.connect(AC.destination); master.gain.value = 0.8; }
  async function unlockAudio() { if (unlocked) return; if (!AC) makeAC(); try { await AC.resume(); } catch {} unlocked = AC && AC.state === "running"; }
  function beep(hz = 880, ms = 120, vol = 0.25) {
    if (!AC) return;
    const o = AC.createOscillator(); o.type = "square"; o.frequency.value = hz;
    const g = AC.createGain(); g.gain.value = vol; o.connect(g).connect(master); o.start();
    const t0 = AC.currentTime; g.gain.setValueAtTime(vol, t0); g.gain.linearRampToValueAtTime(0, t0 + ms / 1000);
    setTimeout(() => { try { o.stop(); } catch {} }, ms + 20);
  }
  function thud() { beep(220, 240, 0.35); }

  // ---- background (fallback) ----
  const stars = [{ n: 60, sp: 10, pts: [] }, { n: 40, sp: 20, pts: [] }, { n: 20, sp: 35, pts: [] }];
  for (const layer of stars) for (let i = 0; i < layer.n; i++) layer.pts.push({ x: Math.random() * W, y: Math.random() * H });
  function drawBG(t) {
    const bg = IMG.get("bg");
    if (bg) { const y = (t * 40) % H; ctx.drawImage(bg, 0, y - H, W, H); ctx.drawImage(bg, 0, y, W, H); }
    else {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0b1020"); g.addColorStop(1, "#0f1830");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      for (const layer of stars) { for (const p of layer.pts) { p.y += layer.sp * 0.016; if (p.y > H) p.y -= H; ctx.fillRect(p.x, p.y, 1.2, 1.2); } }
    }
  }

  // ---- zones ----
  function drawZones(t) {
    // safe: 縦横比保持で高さ合わせ→横タイル
    const texSafe = IMG.get("zoneSafe");
    if (texSafe) {
      const y = H - SAFE_H;
      const scale = SAFE_H / texSafe.height;
      const wScaled = texSafe.width * scale;
      ctx.globalAlpha = 0.95;
      for (let x = 0; x < W + 1; x += wScaled) ctx.drawImage(texSafe, x, y, wScaled, SAFE_H);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = "rgba(20,200,120,0.10)";
      ctx.fillRect(0, H - SAFE_H, W, SAFE_H);
    }

    // bonus
    const ang = t * BONUS.speed, bx = BONUS.cx + Math.cos(ang) * BONUS.rOrbit, by = BONUS.cy + Math.sin(ang) * BONUS.rOrbit;
    const texB = IMG.get("zoneBonus");
    if (texB) {
      ctx.save(); ctx.translate(bx, by); ctx.globalAlpha = 0.95;
      ctx.drawImage(texB, -BONUS.radius, -BONUS.radius, BONUS.radius * 2, BONUS.radius * 2);
      ctx.globalAlpha = 1; ctx.restore();
      ctx.strokeStyle = "rgba(250,210,60,0.25)"; ctx.beginPath(); ctx.arc(BONUS.cx, BONUS.cy, BONUS.rOrbit, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(250,210,60,0.12)"; ctx.beginPath(); ctx.arc(bx, by, BONUS.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(250,210,60,0.25)"; ctx.beginPath(); ctx.arc(BONUS.cx, BONUS.cy, BONUS.rOrbit, 0, Math.PI * 2); ctx.stroke();
    }
    return { bx, by };
  }
  function inCircle(px, py, cx, cy, r) { const dx = px - cx, dy = py - cy; return dx * dx + dy * dy <= r * r; }

  // ---- state ----
  const TITLE = "title", PLAY = "play", OVER = "over";
  const player = { x: W / 2, y: H * 0.8, size: CFG.player.size, hitR: CFG.player.hitR, speed: CFG.player.speed, slow: CFG.player.slow, vx: 0, vy: 0 };
  let bullets = [], state = TITLE, allowReturnAt = 0, timePlay = 0, score = 0;

  // ---- spawn ----
  const timers = { rain: 0, side: 0, homing: 0, kanji: 0 };
  function randomKanji() {
    const s = "炎雷風水土空光闇心愛夢星竜鬼斬破護爆迅煌零冥極華刹翔滅砲砕烈煌舞刃閃虎龍雷火光影彗".split("");
    return s[(Math.random() * s.length) | 0];
  }

  function spawn(dt) {
    timers.rain += dt; timers.side += dt; timers.homing += dt; timers.kanji += dt;

    // 雨（白：遅め）
    if (timers.rain >= (CFG.spawns.rainEvery || 0.15)) {
      timers.rain = 0;
      const x = 20 + Math.random() * (W - 40);
      bullets.push({ kind: "normal", x, y: -10, vx: 0, vy: NORMAL_FALL_MIN + Math.random() * NORMAL_FALL_RAND, r: 6, alive: true });
    }

    // 横（赤：fast）
    if (timers.side >= (CFG.spawns.sideEvery || 1.1)) {
      timers.side = 0;
      const L = Math.random() < 0.5, y0 = 60 + Math.random() * (H - 220);
      for (let i = 0; i < 7; i++) {
        bullets.push({ kind: "fast", x: L ? -10 : W + 10, y: y0 + i * 9, vx: L ? 160 : -160, vy: (Math.random() * 2 - 1) * 22, r: 5, alive: true });
      }
    }

    // 誘導（青）— r=30（5倍）、70°で追尾終了
    if (timers.homing >= (CFG.spawns.homingEvery || 3.6)) {
      timers.homing = 0;
      const edge = (Math.random() * 4) | 0; let x = 0, y = 0;
      if (edge === 0) { x = Math.random() * W; y = -10; }
      if (edge === 1) { x = W + 10; y = Math.random() * H; }
      if (edge === 2) { x = Math.random() * W; y = H + 10; }
      if (edge === 3) { x = -10; y = Math.random() * H; }
      const ang = Math.atan2(player.y - y, player.x - x), v = 145;
      bullets.push({ kind: "homing", x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, turnDeg: 120, r: 30, alive: true, homing: true, steeredDeg: 0, maxSteerDeg: HOMING_MAX_STEER_DEG });
    }

    // 巨大漢字弾 — 5s / r=240 / 非追尾（軌道固定）
    if (timers.kanji >= (CFG.spawns.kanjiEvery || 5.0)) {
      timers.kanji = 0;
      const r = 240; // 10倍
      const x = Math.max(r + 10, Math.min(W - (r + 10), Math.random() * W)); // 画面内中心
      bullets.push({ kind: "big", x, y: -r, vx: 0, vy: 95, r, alive: true, text: randomKanji() }); // ← turn処理なし
    }
  }

  // ---- update ----
  function update(dt) {
    // プレイヤー移動
    let dx = 0, dy = 0;
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) dx -= 1;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) dx += 1;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) dy -= 1;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) dy += 1;

    if (pointerDown) {
      player.x += (pointerX - player.x) * 0.35;
      player.y += (pointerY - player.y) * 0.35;
      player.vx = (pointerX - player.x); player.vy = (pointerY - player.y);
    } else if (dx || dy) {
      const len = Math.hypot(dx, dy) || 1;
      const v = player.speed * ((keys.has("Shift") || keys.has(" ")) ? player.slow : 1);
      const vx = (dx / len) * v, vy = (dy / len) * v;
      player.x += vx * dt; player.y += vy * dt;
      player.vx = vx; player.vy = vy;
    }
    player.x = Math.max(0, Math.min(W, player.x)); player.y = Math.max(0, Math.min(H, player.y));

    // 弾
    spawn(dt);
    for (const b of bullets) {
      if (b.homing) {
        const angTo = Math.atan2(player.y - b.y, player.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        const max = (b.turnDeg * Math.PI / 180) * dt;
        let diff = angTo - cur; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
        const clamped = Math.max(-max, Math.min(max, diff));
        b.steeredDeg += Math.abs(clamped) * 180 / Math.PI;
        const next = cur + clamped;
        const sp = Math.hypot(b.vx, b.vy) || 145;
        b.vx = Math.cos(next) * sp; b.vy = Math.sin(next) * sp;
        if (b.steeredDeg >= b.maxSteerDeg) { b.homing = false; } // 追尾終了→直進
      }
      // big は turnしない（非追尾）

      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -80 || b.x > W + 80 || b.y < -80 || b.y > H + 80) b.alive = false;
    }
    bullets = bullets.filter(b => b.alive);

    // セーフゾーンなら死亡なし
    const inSafe = (player.y >= H - SAFE_H + player.hitR * 0.5);
    if (inSafe) return false;

    // 当たり判定
    for (const b of bullets) {
      const rr = (b.r + player.hitR), dx2 = b.x - player.x, dy2 = b.y - player.y;
      if (dx2 * dx2 + dy2 * dy2 <= rr * rr) return true;
    }
    return false;
  }

  // ---- input ----
  const keys = new Set();
  let pointerDown = false, pointerX = W / 2, pointerY = H * 0.75;
  addEventListener("keydown", e => { if (!e.repeat) keys.add(e.key); if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault(); });
  addEventListener("keyup", e => keys.delete(e.key));
  function cpos(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  canvas.addEventListener("pointerdown", e => { pointerDown = true; const p = cpos(e); pointerX = p.x; pointerY = p.y; unlockAudio(); });
  addEventListener("pointerup", () => pointerDown = false);
  canvas.addEventListener("pointermove", e => { if (!pointerDown) return; const p = cpos(e); pointerX = p.x; pointerY = p.y; });

  // ---- draw ----
  function drawPlayer() {
    const img = IMG.get("player");
    const s = player.size;
    ctx.save(); ctx.translate(player.x, player.y);
    // 回転しない（前向き固定）
    if (img) ctx.drawImage(img, -s, -s, s * 2, s * 2);
    else {
      ctx.shadowColor = "rgba(80,200,255,0.6)"; ctx.shadowBlur = 20;
      ctx.fillStyle = "#4cf"; ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(0, 0, player.hitR, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBullets() {
    for (const b of bullets) {
      if (b.kind === "normal") {
        const sp = IMG.get("b_normal");
        if (sp) ctx.drawImage(sp, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        else { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }
      } else if (b.kind === "fast") {
        const sp = IMG.get("b_fast");
        if (sp) ctx.drawImage(sp, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        else { ctx.fillStyle = "#f55"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }
      } else if (b.kind === "homing") {
        const sp = IMG.get("b_homing");
        if (sp) ctx.drawImage(sp, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        else { ctx.fillStyle = "#6cf"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }
      } else if (b.kind === "big") {
        const sp = IMG.get("b_big");
        ctx.save(); ctx.translate(b.x, b.y);
        ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
        if (sp) ctx.drawImage(sp, -b.r, -b.r, b.r * 2, b.r * 2);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "bold " + Math.floor(b.r * 0.18) + "px Noto Sans JP, sans-serif"; ctx.fillText(b.text || "炎", 0, 4);
        ctx.fillStyle = "#f55"; ctx.font = Math.floor(b.r * 0.075) + "px Noto Sans JP, sans-serif"; ctx.fillText("アツイ", 0, -b.r + Math.max(14, Math.floor(b.r * 0.09)));
        ctx.restore();
      }
    }
  }

  function drawTitle() {
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "64px Orbitron, sans-serif"; ctx.fillText("TAMAYOKE 2", W / 2, H * 0.33);
    ctx.font = "18px Noto Sans JP, sans-serif"; ctx.fillText("クリック／Enter でスタート", W / 2, H * 0.33 + 56);
  }
  function drawGameOver() {
    ctx.font = "46px Orbitron, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#ff9";
    ctx.fillText("GAME OVER", W / 2, H * 0.35);
    ctx.font = "18px Noto Sans JP, sans-serif"; ctx.fillStyle = "#fff";
    ctx.fillText("0.7秒後に クリック／Enter でタイトルへ", W / 2, H * 0.35 + 50);
  }

  // SCOREぶれ防止
  function drawScore() {
    const s = String(score | 0).padStart(6, "0");
    ctx.textBaseline = "top"; ctx.textAlign = "right";
    ctx.font = "20px monospace"; ctx.fillStyle = "#fff";
    ctx.fillText(s, W - 16, 12);
    const w = ctx.measureText("000000").width;
    ctx.font = "20px Orbitron, sans-serif";
    ctx.fillText("SCORE", W - 16 - w - 10, 12);
  }

  // ---- submit best / first ----
  const SUBMITTED_KEY = "rankSubmittedOnce";
  const loadPlayerName = () => localStorage.getItem("playerName") || "";
  const savePlayerName = n => localStorage.setItem("playerName", String(n || "").slice(0, 16));
  const loadBest = () => Number(localStorage.getItem("bestScore") || "0") | 0;
  const saveBest = v => localStorage.setItem("bestScore", String(v | 0));
  async function submitScore(finalScore) {
    if (!rank.enabled) return;
    const already = localStorage.getItem(SUBMITTED_KEY) === "1";
    const best = loadBest();
    const mustSubmit = !already;
    const isBest = (finalScore | 0) > best;
    if (!mustSubmit && !isBest) return;
    if (isBest) saveBest(finalScore | 0);
    let name = loadPlayerName();
    if (!name) { name = (prompt("名前（16文字まで）を入力してください", "YOU") || "YOU").trim().slice(0, 16); savePlayerName(name); }
    const prev = elLB?.textContent || "";
    if (elLB) elLB.textContent = "SUBMITTING...";
    const res = await rank.submit(name, finalScore | 0);
    if (res.ok) { localStorage.setItem(SUBMITTED_KEY, "1"); renderLeaderboard().catch(()=>{}); beep(1320, 120, 0.35); }
    else { if (elLB) elLB.textContent = prev || "通信エラー"; }
  }

  // ---- loop ----
  let prev = performance.now(), tAccum = 0;
  bl("title ready");

  requestAnimationFrame(function loop(ts) {
    const dt = Math.min(1 / 20, Math.max(0, (ts - prev) / 1000));
    prev = ts; tAccum += dt;

    drawBG(tAccum);
    const { bx, by } = drawZones(tAccum);

    const inSafeZone = (player.y >= H - SAFE_H + player.hitR * 0.5);
    const inBonus = inCircle(player.x, player.y, bx, by, BONUS.radius);

    if (state === TITLE) {
      drawTitle();
      if (keys.has("Enter") || pointerDown) {
        pointerDown = false; state = PLAY; timePlay = 0; score = 0; bullets.length = 0;
        unlockAudio();
      }
    } else if (state === PLAY) {
      timePlay += dt;

      // セーフ中は減点（0未満×）／それ以外は通常+ボーナス加点
      if (inSafeZone) {
        score = Math.max(0, score - SAFE_PENALTY_PER_SEC * dt);
      } else {
        score += (inBonus ? 4 : 1) * 10 * dt;
      }

      if (update(dt)) {
        const fs = score | 0; thud(); submitScore(fs).catch(()=>{});
        state = OVER; allowReturnAt = performance.now() + 700; bullets.length = 0;
      }
      drawBullets(); drawPlayer(); drawScore();
    } else { // OVER
      drawBullets(); drawGameOver(); drawScore();
      if (performance.now() >= allowReturnAt && (keys.has("Enter") || pointerDown)) {
        pointerDown = false; state = TITLE; timePlay = 0;
      }
    }

    requestAnimationFrame(loop);
  });
}
