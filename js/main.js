// Minimal boot: background scroll + BGM state switching (fixed timer)
import { AudioManager } from "./audioManager.js";

// === 設定：タップ1回で即スタートするか？ ===
// true  : 1回目のタップでゲーム開始（現状と同じ）
// false : 1回目のタップで"音声解錠＆タイトルBGM再生"、2回目でゲーム開始
const STARTS_ON_FIRST_TAP = true;

let canvas, ctx2d, config;
let aud;
let state = "title";   // "title" -> "playing" or "safe"/"bonus" -> "gameover"
let last = 0;          // rAF時刻(ms)
let gameTime = 0;      // ★プレイ中のみ加算（秒）
let bgY = 0;
let bgImg;
let unlocked = false;  // AudioContext 解錠済みか

/** CSS scaling with aspect lock */
function fitCanvas() {
  const W = 960, H = 540;
  const vw = window.innerWidth, vh = window.innerHeight;
  const scale = Math.min(vw / W, vh / H);
  canvas.style.width  = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

function isPlayingState() {
  return state === "playing" || state === "safe" || state === "bonus";
}

function drawBackground(dt) {
  const spd = config.background.scrollSpeed; // px/sec
  bgY += spd * dt;
  const loopH = config.background.height; // 1080px
  bgY %= loopH;

  // draw two slices to loop vertically (1080を540に分割描画)
  const y1 = Math.floor(-bgY / 2);
  const half = loopH / 2;
  ctx2d.drawImage(bgImg, 0, 0, bgImg.width, half, 0, y1, 960, 540);
  ctx2d.drawImage(bgImg, 0, half, bgImg.width, half, 0, y1 + 540, 960, 540);
}

/** UI描画 */
function drawUI() {
  ctx2d.font = "700 28px Orbitron, system-ui";
  ctx2d.fillStyle = "#66aaff";
  ctx2d.shadowColor = "#001a33";
  ctx2d.shadowBlur = 4;
  ctx2d.shadowOffsetX = 2;
  ctx2d.shadowOffsetY = 2;

  const elapsed = gameTime.toFixed(1);
  ctx2d.textAlign = "right";
  ctx2d.fillText(`SCORE 000000`, 960 - 12, 12 + 28); // ダミー表示
  ctx2d.textAlign = "left";
  ctx2d.fillText(`TIME ${elapsed}s`, 12, 58);
}

/** 入力：タップやキーで開始＆BGM切替 */
function setupInput() {
  const onPointer = async () => {
    // まずは解錠だけでも行う
    if (!unlocked) {
      await aud.unlock();
      unlocked = true;

      if (!STARTS_ON_FIRST_TAP) {
        // タイトルのままBGMを流したい場合（ユーザー操作後なので再生OK）
        state = "title";
        aud.playBgm("safe"); // タイトルBGMにsafeを利用
        return; // 2回目のタップでゲーム開始
      }
    }

    // 即スタートする設定ならここで開始
    if (state === "title") {
      startGame();
    }
  };

  canvas.addEventListener("pointerdown", onPointer, { passive: true });

  // デバッグ切替：S=セーフ, B=ボーナス, G=ゲームオーバー
  window.addEventListener("keydown", (e) => {
    if (e.key === "s" && isPlayingState()) { state = "safe";  aud.playBgm("safe"); }
    if (e.key === "b" && isPlayingState()) { state = "bonus"; aud.playBgm("bonus"); }
    if (e.key === "g" && isPlayingState()) { state = "gameover"; aud.playBgm("gameover"); }
    if (e.key === "Enter" && state === "title") startGame(); // Enterでも開始
  });
}

function startGame() {
  state = "playing";
  gameTime = 0;        // ★タイトルで進んだりしないよう、開始時にリセット
  aud.playBgm("normal");
}

/** メインループ */
function loop(ts) {
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last) / 1000); // 秒
  last = ts;

  // ★プレイ中のみTIMEを加算
  if (isPlayingState()) gameTime += dt;

  // 画面クリア
  ctx2d.fillStyle = "#000";
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);

  // 背景
  if (bgImg) drawBackground(dt);

  // タイトル表示
  if (state === "title") {
    ctx2d.fillStyle = "rgba(255,255,255,0.9)";
    ctx2d.font = "700 36px Orbitron, system-ui";
    ctx2d.textAlign = "center";
    ctx2d.fillText("Tap to Start", 480, 280);

    // STARTS_ON_FIRST_TAP=false の場合：
    // 1回目タップ後(解錠済み)はsafe曲が流れて、2回目タップで開始になる
  }

  drawUI();
  requestAnimationFrame(loop);
}

/** public: called from index.html */
export async function boot(conf) {
  config = conf;

  canvas = document.getElementById("game");
  ctx2d = canvas.getContext("2d");

  fitCanvas();
  window.addEventListener("resize", fitCanvas);

  // Audio
  aud = new AudioManager(config);

  // 背景画像ロード
  try {
    bgImg = await loadImage(config.background.image);
  } catch {
    console.warn("background image load failed:", config.background.image);
  }

  setupInput();
  requestAnimationFrame(loop);
}
