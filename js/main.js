// Minimal boot: background scroll + BGM state switching
import { AudioManager } from "./audioManager.js";

let canvas, ctx2d, config;
let aud;
let state = "title";   // "title" -> "playing" -> "safe"|"bonus" -> "gameover"
let t0 = 0, last = 0;
let bgY = 0;
let bgImg;

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

function drawBackground(dt) {
  const H = config.logicSize.h;
  const spd = config.background.scrollSpeed; // px/sec
  bgY += spd * dt;
  const loopH = config.background.height; // 1080px
  bgY %= loopH;

  // draw two slices to loop vertically
  const y1 = Math.floor(-bgY / 2); // scale texture 1080->540 by drawing half height
  const half = loopH / 2;          // draw top/bottom halves to fit 540
  ctx2d.drawImage(bgImg, 0, 0, bgImg.width, half, 0, y1, 960, 540);
  ctx2d.drawImage(bgImg, 0, half, bgImg.width, half, 0, y1 + 540, 960, 540);
}

/** simple on-screen text */
function drawUI() {
  ctx2d.font = "700 28px Orbitron, system-ui";
  ctx2d.fillStyle = "#66aaff";
  ctx2d.shadowColor = "#001a33";
  ctx2d.shadowBlur = 4;
  ctx2d.shadowOffsetX = 2;
  ctx2d.shadowOffsetY = 2;

  const elapsed = ((last - t0) / 1000).toFixed(1);
  ctx2d.textAlign = "right";
  ctx2d.fillText(`SCORE 000000`, 960 - 12, 12 + 28); // ダミー表示
  ctx2d.textAlign = "left";
  ctx2d.fillText(`TIME ${elapsed}s`, 12, 58);
}

/** input: first click/tap -> start */
function setupInput() {
  const startPlay = async () => {
    await aud.unlock();
    if (state === "title") {
      state = "playing";
      aud.playBgm("normal");
    }
  };
  // pointer for both desktop/mobile
  canvas.addEventListener("pointerdown", startPlay, { passive: true });
  // quick demo keys: S=safe, B=bonus, G=gameover
  window.addEventListener("keydown", (e) => {
    if (e.key === "s") { state = "safe";   aud.playBgm("safe"); }
    if (e.key === "b") { state = "bonus";  aud.playBgm("bonus"); }
    if (e.key === "g") { state = "gameover"; aud.playBgm("gameover"); }
  });
}

/** main loop */
function loop(ts) {
  if (!last) last = ts, t0 = ts;
  const dt = Math.min(0.05, (ts - last) / 1000); // clamp
  last = ts;

  // clear
  ctx2d.fillStyle = "#000";
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);

  // background
  if (bgImg) drawBackground(dt);

  // title overlay
  if (state === "title") {
    ctx2d.fillStyle = "rgba(255,255,255,0.9)";
    ctx2d.font = "700 36px Orbitron, system-ui";
    ctx2d.textAlign = "center";
    ctx2d.fillText("Tap to Start", 480, 280);
    // title BGM（安全：初回gestureまでは無音、gesture後に鳴る）
    // 起動直後の自動再生はブロックされるので、ここでは呼ばない
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
  // タイトル状態ではBGM切替はしない（ユーザー操作で解錠後に再生開始）
  // 任意でタイトル曲にしたい場合は config.audio.bgm.safe を使う想定
  // ユーザーがタップ後、playingへ遷移時に normal を再生します。

  // Background texture
  try {
    bgImg = await loadImage(config.background.image);
  } catch {
    console.warn("background image load failed:", config.background.image);
  }

  setupInput();
  requestAnimationFrame(loop);
}

