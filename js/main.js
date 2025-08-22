// main.js — 背景 + 自機 + 弾幕 + 当たり判定（タイトル中はTIME=0固定）
import { AudioManager }   from "./audioManager.js?v=danmaku1";
import { Input }          from "./input.js?v=danmaku1";
import { Player }         from "./player.js?v=danmaku1";
import { Bullet, BULLET_TYPES, loadBulletSprites } from "./bullets.js?v=danmaku1";
import { Spawner }        from "./spawner.js?v=danmaku1";

const STARTS_ON_FIRST_TAP = true;

let canvas, g, config, aud, input, player, spawner;
let state = "title";
let last = 0;
let gameTime = 0;
let score = 0;
let bgY = 0, bgImg;
let unlocked = false;
let bullets = [];

const W = 960, H = 540;
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
  g.font = "700 28px Orbitron, system-ui";
  g.fillStyle = "#66aaff";
  g.shadowColor = "#001a33"; g.shadowBlur = 4; g.shadowOffsetX = 2; g.shadowOffsetY = 2;
  const elapsed = isPlaying() ? gameTime : 0;

  // スコア（とりあえず毎秒+100だけ入れて見える化）
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
    g.fillText("ドラッグ／WASD／矢印で移動。Shift/Spaceで低速。", W/2, H/2 + 30);
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
  // （任意）開始SFX： if (config.audio?.sfx?.start) aud.playSfx(config.audio.sfx.start);
}

function toTitle() {
  state = "title";
  bullets = [];
  aud.playBgm("safe"); // タイトル曲的に
}

function gameOver() {
  state = "gameover";
  aud.playBgm("gameover");
  if (config.audio?.sfx?.explode) aud.playSfx(config.audio.sfx.explode);
}

function updateBullets(dt) {
  // 発生
  spawner.update(dt, gameTime, bullets, player);

  // 移動＆当たり判定
  const px = player.x, py = player.y, ph = player.hitR;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.update(dt, player);

    // 衝突：当たり半径判定
    const dx = b.x - px, dy = b.y - py;
    if (dx * dx + dy * dy < (b.hitR + ph) * (b.hitR + ph)) {
      gameOver();
      return; // 即終了
    }

    // 画面外で破棄
    if (b.outOfBounds(W, H, 40)) {
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
    score += (config.score?.perSec ?? 100) * dt; // とりあえず見える化
    updateBullets(dt);
    player.update(dt, input);
  }

  // 描画
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  if (bgImg) drawBG(dt);

  // 弾 → 自機 → UI の順で描画（自機が上）
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

  // 背景
  try { bgImg = await loadImage(config.background.image); } catch (e) { console.warn("bg load failed:", e); }

  // プレイヤー
  player = new Player(config);
  player.load().catch(e => console.warn("[player] load error (fallback active)", e));

  // 弾
  await loadBulletSprites();
  spawner = new Spawner(config);

  setupInput();
  requestAnimationFrame(loop);
  console.log("[boot] danmaku ready");
}
