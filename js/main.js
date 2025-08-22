// main.js — 背景 + 自機 + 弾幕 + 当たり判定 + セーフ/ボーナスゾーン
// F2でデバッグ表示。ゾーン入退でBGMクロスフェード＆SFX。
import { AudioManager }   from "./audioManager.js?v=zones1";
import { Input }          from "./input.js?v=zones1";
import { Player }         from "./player.js?v=zones1";
import { loadBulletSprites } from "./bullets.js?v=zones1";
import { Spawner }        from "./spawner.js?v=zones1";
import { SafeZones, BonusZone } from "./zones.js?v=zones1";

const STARTS_ON_FIRST_TAP = true;
const W = 960, H = 540;

let canvas, g, config, aud, input, player, spawner;
let safeZones, bonusZone;

let state = "title"; // "title" | "playing" | "safe" | "bonus" | "gameover"
let last = 0;
let gameTime = 0;
let score = 0;
let bgY = 0, bgImg;
let unlocked = false;
let bullets = [];
let showDebug = false;

const isPlaying = () => state === "playing" || state === "safe" || state === "bonus";

function fitCanvas() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width  = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
}

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=src; });
}

function drawBG(dt) {
  const speed = config.background.scrollSpeed;
  const loopH = config.background.height;
  bgY = (bgY + speed * dt) % loopH;
  const half = loopH / 2;
  const y1 = Math.floor(-bgY / 2);
  g.drawImage(bgImg, 0, 0, bgImg.width, half, 0, y1, W, H);
  g.drawImage(bgImg, 0, half, bgImg.width, half, 0, y1 + H, W, H);
}

function drawUI() {
  const fontCfg = config.ui.font;
  const colors = {
    playing: fontCfg.normalColor,
    safe:    fontCfg.penaltyColor,
    bonus:   fontCfg.bonusColor,
    gameover:"#ffffff",
    title:   fontCfg.normalColor
  };
  g.font = "700 28px Orbitron, system-ui";
  g.fillStyle = colors[state] || fontCfg.normalColor;
  g.shadowColor = fontCfg.shadow.color; g.shadowBlur = fontCfg.shadow.blur;
  g.shadowOffsetX = fontCfg.shadow.offsetX; g.shadowOffsetY = fontCfg.shadow.offsetY;

  const elapsed = isPlaying() ? gameTime : 0;
  g.textAlign = "right";
  g.fillText(`SCORE ${String(Math.floor(score)).padStart(6, "0")}`, W - 12, 12 + 28);
  g.textAlign = "left";
  g.fillText(`TIME ${elapsed.toFixed(1)}s`, 12, 58);

  if (state === "title") {
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.font = "700 36px Orbitron, system-ui";
    g.textAlign = "center";
    g.fillText("Tap to Start", W/2, H/2);
    g.font = "400 16px Noto Sans JP, system-ui";
    g.fillText("ドラッグ／WASD／矢印で移動。Shift/Spaceで低速。F2でデバッグ表示", W/2, H/2 + 30);
  }

  if (state === "gameover") {
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#fff";
    g.font = "700 44px Orbitron, system-ui";
    g.textAlign = "center";
    g.fillText("GAME OVER", W/2, H/2 - 10);
    g.font = "400 16px Noto Sans JP, system-ui";
    g.fillText("タップでタイトルへ", W/2, H/2 + 20);
  }

  if (showDebug) {
    g.save();
    g.shadowBlur = 0;
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.font = "400 12px system-ui";
    g.textAlign = "left";
    g.fillText(`state=${state} bullets=${bullets.length}`, 12, H - 12);
    g.restore();
  }
}

function setupInput() {
  input = new Input(canvas);

  const onTap = async () => {
    if (!unlocked) { await aud.unlock(); unlocked = true; }
    if (state === "gameover") { toTitle(); return; }
    if (!STARTS_ON_FIRST_TAP && state === "title") { aud.playBgm("safe"); return; }
    if (state === "title") startGame();
  };
  canvas.addEventListener("pointerdown", onTap, { passive: true });

  addEventListener("keydown", (e) => {
    if (e.key === "Enter" && state === "title") startGame();
    if (e.key === "Escape" && state === "gameover") toTitle();
    if (e.key === "F2") showDebug = !showDebug;
    if (e.key === "s" && isPlaying()) { state = "safe";  aud.playBgm("safe"); }
    if (e.key === "b" && isPlaying()) { state = "bonus"; aud.playBgm("bonus"); }
    if (e.key === "g" && isPlaying()) { gameOver(); }
  });
}

function startGame() {
  state = "playing";
  gameTime = 0; last = 0; score = 0;
  bullets = [];
  spawner.reset();
  aud.playBgm("normal");
}

function toTitle() {
  state = "title";
  bullets = [];
  aud.playBgm("safe");
}

function gameOver() {
  state = "gameover";
  aud.playBgm("gameover");
  if (config.audio?.sfx?.explode) aud.playSfx(config.audio.sfx.explode);
}

function applyZoneLogic(dt) {
  // ゾーン判定
  const inSafe  = safeZones.playerInside(player.x, player.y, player.hitR);
  const inBonus = !inSafe && bonusZone.playerInside(player.x, player.y); // セーフ優先

  let nextState = inSafe ? "safe" : (inBonus ? "bonus" : "playing");
  if (state !== nextState) {
    // BGMクロスフェード
    if (nextState === "safe")   { aud.playBgm("safe");   if (config.audio?.sfx?.zone_safe)   aud.playSfx(config.audio.sfx.zone_safe); }
    if (nextState === "bonus")  { aud.playBgm("bonus");  if (config.audio?.sfx?.zone_bonus)  aud.playSfx(config.audio.sfx.zone_bonus); }
    if (nextState === "playing"){ aud.playBgm("normal"); if (config.audio?.sfx?.zone_normal) aud.playSfx(config.audio.sfx.zone_normal); }
    state = nextState;
  }

  // スコア処理
  if (state === "bonus") {
    score += (config.score?.bonusPerSec ?? 1000) * dt;
  } else if (state === "safe") {
    score -= (config.score?.penaltyPerSec ?? 1000) * dt;
    if (score <= 0) { score = 0; gameOver(); }
  } else {
    score += (config.score?.perSec ?? 100) * dt;
  }

  // セーフには弾は侵入不可：入った弾は消す
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (safeZones.bulletHitsSafe(b.x, b.y, b.r)) bullets.splice(i, 1);
  }
}

function updateBullets(dt) {
  spawner.update(dt, gameTime, bullets, player);

  // 弾移動＆当たり
  const px = player.x, py = player.y, ph = player.hitR;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.update(dt, player);

    // 自機との衝突
    const dx = b.x - px, dy = b.y - py;
    if (dx * dx + dy * dy < (b.hitR + ph) * (b.hitR + ph)) {
      gameOver();
      return;
    }

    // 画面外で破棄
    if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) {
      bullets.splice(i, 1);
    }
  }
}

function loop(ts) {
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;

  if (isPlaying()) {
    gameTime += dt;
    bonusZone.update(dt);
    updateBullets(dt);
    player.update(dt, input);
    applyZoneLogic(dt);
  }

  // 描画
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  if (bgImg) drawBG(dt);

  // 背景 → ゾーン → 弾 → 自機 → UI
  safeZones.draw(g);
  bonusZone.draw(g);
  for (const b of bullets) b.draw(g);
  player.draw(g);
  drawUI();

  requestAnimationFrame(loop);
}

export async function boot(conf) {
  config = conf;
  canvas = document.getElementById("game");
  g = canvas.getContext("2d");
  fitCanvas(); addEventListener("resize", fitCanvas);

  aud = new AudioManager(config);

  try { bgImg = await loadImage(config.background.image); } catch (e) { console.warn("bg load failed:", e); }

  player = new Player(config);
  player.load().catch(e => console.warn("[player] load error (fallback active)", e));

  await loadBulletSprites();
  spawner = new Spawner(config);

  // ゾーン
  safeZones = new SafeZones(config);
  await safeZones.load(config.ui?.sprites?.safe || "assets/img/zone_safe.png");
  bonusZone = new BonusZone(config);
  await bonusZone.load(config.ui?.sprites?.bonus || "assets/img/zone_bonus.png");

  setupInput();
  requestAnimationFrame(loop);
  console.log("[boot] zones1 ready");
}
