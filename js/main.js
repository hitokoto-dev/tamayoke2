// main.js — 背景 + 自機（移動）/ タイトル中はTIME 0固定
import { AudioManager } from "./audioManager.js?v=ship2";
import { Input }        from "./input.js?v=ship2";
import { Player }       from "./player.js?v=ship2";

const STARTS_ON_FIRST_TAP = true;

let canvas, g, config, aud, input, player;
let state = "title";
let last = 0;
let gameTime = 0;
let bgY = 0, bgImg;
let unlocked = false;

const isPlaying = () => state === "playing" || state === "safe" || state === "bonus";

function fitCanvas() {
  const W = 960, H = 540;
  const s = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = `${Math.floor(W * s)}px`;
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
  g.drawImage(bgImg, 0, 0, bgImg.width, half, 0, y1, 960, 540);
  g.drawImage(bgImg, 0, half, bgImg.width, half, 0, y1 + 540, 960, 540);
}

function drawUI() {
  g.font = "700 28px Orbitron, system-ui";
  g.fillStyle = "#66aaff";
  g.shadowColor = "#001a33";
  g.shadowBlur = 4; g.shadowOffsetX = 2; g.shadowOffsetY = 2;
  const elapsed = isPlaying() ? gameTime : 0;
  g.textAlign = "right"; g.fillText(`SCORE 000000`, 960 - 12, 12 + 28);
  g.textAlign = "left";  g.fillText(`TIME ${elapsed.toFixed(1)}s`, 12, 58);

  if (state === "title") {
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.font = "700 36px Orbitron, system-ui";
    g.textAlign = "center";
    g.fillText("Tap to Start", 480, 280);
    g.font = "400 16px Noto Sans JP, system-ui";
    g.fillText("ドラッグ／WASD／矢印で移動。Shift/Spaceで低速。", 480, 310);
  }
}

function setupInput() {
  input = new Input(canvas);

  const onTap = async () => {
    if (!unlocked) { await aud.unlock(); unlocked = true; }
    if (!STARTS_ON_FIRST_TAP && state === "title") { aud.playBgm("safe"); return; }
    if (state === "title") startGame();
  };
  canvas.addEventListener("pointerdown", onTap, { passive: true });

  addEventListener("keydown", (e) => {
    if (e.key === "Enter" && state === "title") startGame();
    if (e.key === "s" && isPlaying()) { state = "safe";  aud.playBgm("safe"); }
    if (e.key === "b" && isPlaying()) { state = "bonus"; aud.playBgm("bonus"); }
    if (e.key === "g" && isPlaying()) { state = "gameover"; aud.playBgm("gameover"); }
  });
}

function startGame() {
  state = "playing";
  gameTime = 0; last = 0;
  aud.playBgm("normal");
}

function loop(ts) {
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  if (isPlaying()) gameTime += dt;

  g.fillStyle = "#000"; g.fillRect(0, 0, canvas.width, canvas.height);
  if (bgImg) drawBG(dt);

  // 自機
  if (player) {
    if (isPlaying()) player.update(dt, input); // タイトル中は位置固定
    player.draw(g); // タイトル中も見えるように描く
  }

  drawUI();
  requestAnimationFrame(loop);
}

export async function boot(conf) {
  config = conf;
  canvas = document.getElementById("game");
  g = canvas.getContext("2d");
  fitCanvas(); addEventListener("resize", fitCanvas);

  aud = new AudioManager(config);

  try { bgImg = await loadImage(config.background.image); } catch { console.warn("bg load failed"); }

  player = new Player(config);
  // 読み込み失敗でも続行（プレースホルダで表示）
  player.load().catch(e => console.warn("[player] load error (fallback active)", e));

  setupInput();
  requestAnimationFrame(loop);
  console.log("[boot] main.js ship2 loaded", conf.player);
}
