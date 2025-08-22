// main.js — ローダー方式：同一バージョン V を全モジュール/画像に適用してキャッシュ回避
// 機能：背景 + 自機 + 弾幕 + 当たり判定 + セーフ/ボーナスゾーン + BGM切替（F2でデバッグ）

export async function boot(conf, V = "") {
  const W = 960, H = 540;
  const withV = (src) => V ? src + (src.includes("?") ? "&" : "?") + "v=" + V : src;

  // ▼ ここが“肝” — すべて動的 import にして同じ V を付与
  const [{ AudioManager }, { Input }, { Player }, bulletsMod, { Spawner }, zonesMod] =
    await Promise.all([
      import(withV("./audioManager.js")),
      import(withV("./input.js")),
      import(withV("./player.js")),
      import(withV("./bullets.js")),   // { loadBulletSprites, BULLET_TYPES, ... }
      import(withV("./spawner.js")),
      import(withV("./zones.js")),     // { SafeZones, BonusZone }
    ]);

  const { loadBulletSprites } = bulletsMod;
  const { SafeZones, BonusZone } = zonesMod;

  // ---------- ここからゲーム本体（zones版と同等の挙動） ----------
  const STARTS_ON_FIRST_TAP = true;

  let canvas = document.getElementById("game");
  let g = canvas.getContext("2d");
  let config = conf;
  let aud, input, player, spawner;
  let safeZones, bonusZone;

  let state = "title"; // "title" | "playing" | "safe" | "bonus" | "gameover"
  let last = 0, gameTime = 0, score = 0;
  let bgY = 0, bgImg = null;
  let unlocked = false;
  let bullets = [];
  let showDebug = false;

  const isPlaying = () => state === "playing" || state === "safe" || state === "bonus";

  function fitCanvas() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width  = `${Math.floor(W * s)}px`;
    canvas.style.height = `${Math.floor(H * s)}px`;
  }
  addEventListener("resize", fitCanvas); fitCanvas();

  function loadImage(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("image load failed: " + src));
      im.src = withV(src);
    });
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
    g.shadowColor = fontCfg.shadow.color;
    g.shadowBlur = fontCfg.shadow.blur;
    g.shadowOffsetX = fontCfg.shadow.offsetX;
    g.shadowOffsetY = fontCfg.shadow.offsetY;

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
      g.fillText(`V=${V}  state=${state}  bullets=${bullets.length}`, 12, H - 12);
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
    const inSafe  = safeZones.playerInside(player.x, player.y, player.hitR);
    const inBonus = !inSafe && bonusZone.playerInside(player.x, player.y); // セーフ優先
    let nextState = inSafe ? "safe" : (inBonus ? "bonus" : "playing");

    if (state !== nextState) {
      if (nextState === "safe")   { aud.playBgm("safe");   if (config.audio?.sfx?.zone_safe)   aud.playSfx(config.audio.sfx.zone_safe); }
      if (nextState === "bonus")  { aud.playBgm("bonus");  if (config.audio?.sfx?.zone_bonus)  aud.playSfx(config.audio.sfx.zone_bonus); }
      if (nextState === "playing"){ aud.playBgm("normal"); if (config.audio?.sfx?.zone_normal) aud.playSfx(config.audio.sfx.zone_normal); }
      state = nextState;
    }

    if (state === "bonus") {
      score += (config.score?.bonusPerSec ?? 1000) * dt;
    } else if (state === "safe") {
      score -= (config.score?.penaltyPerSec ?? 1000) * dt;
      if (score <= 0) { score = 0; gameOver(); }
    } else {
      score += (config.score?.perSec ?? 100) * dt;
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (safeZones.bulletHitsSafe(b.x, b.y, b.r)) bullets.splice(i, 1);
    }
  }

  function updateBullets(dt) {
    spawner.update(dt, gameTime, bullets, player);

    const px = player.x, py = player.y, ph = player.hitR;
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.update(dt, player);

      const dx = b.x - px, dy = b.y - py;
      if (dx * dx + dy * dy < (b.hitR + ph) * (b.hitR + ph)) {
        gameOver();
        return;
      }
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

    g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
    if (bgImg) drawBG(dt);
    safeZones.draw(g);
    bonusZone.draw(g);
    for (const b of bullets) b.draw(g);
    player.draw(g);
    drawUI();

    requestAnimationFrame(loop);
  }

  // ---- 起動シーケンス ----
  aud = new AudioManager(config);

  try { bgImg = await loadImage(config.background.image); }
  catch (e) { console.warn("bg load failed:", e); }

  player = new Player(config);
  player.load().catch(e => console.warn("[player] load error (fallback active)", e));

  await loadBulletSprites(); // 画像パス自体は変更なし（画像を更新したい時はファイル名を変えるのが確実）
  spawner = new Spawner(config);

  // ゾーン
  safeZones = new zonesMod.SafeZones(config);
  await safeZones.load(config.ui?.sprites?.safe || "assets/img/zone_safe.png");
  bonusZone = new zonesMod.BonusZone(config);
  await bonusZone.load(config.ui?.sprites?.bonus || "assets/img/zone_bonus.png");

  setupInput();
  requestAnimationFrame(loop);

  console.log(`[boot] ok V=${V}`);
}
