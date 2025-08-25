// main.js — ローダー方式 + ランキング（GAS）
export async function boot(conf, V = "") {
  const W = 960, H = 540;
  const withV = (src) => V ? src + (src.includes("?") ? "&" : "?") + "v=" + V : src;

  const [{ AudioManager }, { Input }, { Player }, bulletsMod, { Spawner }, zonesMod, { RankClient }] =
    await Promise.all([
      import(withV("./audioManager.js")),
      import(withV("./input.js")),
      import(withV("./player.js")),
      import(withV("./bullets.js")),    // { loadBulletSprites, ... }
      import(withV("./spawner.js")),
      import(withV("./zones.js")),      // { SafeZones, BonusZone }
      import(withV("./rank.js")),
    ]);

  const { loadBulletSprites } = bulletsMod;
  const { SafeZones, BonusZone } = zonesMod;

  // ====== 状態 ======
  let canvas = document.getElementById("game");
  let g = canvas.getContext("2d");
  let config = conf;
  let aud, input, player, spawner, safeZones, bonusZone;

  let state = "title";  // "title" | "playing" | "safe" | "bonus" | "gameover"
  let last = 0, gameTime = 0, score = 0, bgY = 0;
  let bgImg = null, unlocked = false, bullets = [], showDebug = false;

  // ★ ゲームオーバー用（0.7 秒の再スタート遅延）
  let restartAt = 0;

  // ローカル保存
  let bestScore = Number(localStorage.getItem("bestScore") || 0);
  let playerName = localStorage.getItem("playerName") || "";

  // ランキング
  const rankUrl = config.rankApi?.endpoint || "";
  const rankClient = new RankClient(rankUrl, V);
  let topRows = [];
  async function refreshTop() { topRows = rankClient.enabled ? (await rankClient.getTop()) : []; }

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
    // ★ 下方向へ流れるように（逆方向修正済み）
    bgY = (bgY - speed * dt + loopH) % loopH;
    const half = loopH / 2;
    const y1 = Math.floor(-bgY / 2);
    g.drawImage(bgImg, 0, 0, bgImg.width, half, 0, y1, W, H);
    g.drawImage(bgImg, 0, half, bgImg.width, half, 0, y1 + H, W, H);
  }

  function drawScoreStable(g, xRight, y, label, numText) {
    g.save();
    g.textAlign = "left";
    const digitW = g.measureText("0").width;
    const labelW = g.measureText(label).width;
    let x = xRight - (labelW + digitW * numText.length);
    g.fillText(label, x, y); x += labelW;
    for (const ch of numText) { g.fillText(ch, x, y); x += digitW; }
    g.restore();
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

    // 右上スコア（右端固定・等幅）
    drawScoreStable(g, W - 12, 12 + 28, "SCORE ", String(Math.floor(score)).padStart(6, "0"));

    // 左上 BEST/TIME（TIMEはタイトル/ゲーム時で使い分け）
    g.textAlign = "left";
    g.fillText(`BEST ${String(Math.floor(bestScore)).padStart(6, "0")}`, 12, 40);
    g.globalAlpha = 0.55;
    g.fillText(`TIME ${elapsed.toFixed(1)}s`, 12, 58);
    g.globalAlpha = 1;

    if (state === "title") {
      // タイトル表示
      g.fillStyle = "rgba(255,255,255,0.92)";
      g.font = "700 36px Orbitron, system-ui";
      g.textAlign = "center";
      g.fillText("Tap to Start", W/2, H/2 - 6);
      g.font = "400 16px Noto Sans JP, system-ui";
      g.fillText("ドラッグ／WASD／矢印で移動。Shift/Spaceで低速。F2でデバッグ表示", W/2, H/2 + 22);

      // 右側にランキングTop10
      g.textAlign = "right";
      g.font = "700 18px Orbitron, system-ui";
      g.fillStyle = "#ffffff";
      const titleY = 92;
      g.fillText("LEADERBOARD", W - 16, titleY);
      g.font = "400 14px Noto Sans JP, system-ui";
      const startY = titleY + 18;
      const lineH = 18;
      if (!rankClient.enabled) {
        g.fillText("(未設定: config.rankApi.endpoint)", W - 16, startY);
      } else if (!topRows.length) {
        g.fillText("読み込み中… / 未投稿", W - 16, startY);
      } else {
        for (let i = 0; i < Math.min(10, topRows.length); i++) {
          const r = topRows[i];
          const name = (r.name ?? "—").toString().slice(0, 16);
          const sc = String(r.score ?? 0).padStart(6, "0");
          g.fillText(`${(i+1).toString().padStart(2," ")}. ${name}  ${sc}`, W - 16, startY + lineH * (i + 1));
        }
      }
      // プレイヤー名表示
      g.textAlign = "left";
      g.font = "400 12px system-ui";
      const pn = playerName ? `NAME: ${playerName}` : "NAME: （ベスト更新時に入力）";
      g.fillText(pn, 12, H - 12);
    }

    if (state === "gameover") {
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#fff";
      g.font = "700 44px Orbitron, system-ui";
      g.textAlign = "center";
      g.fillText("GAME OVER", W/2, H/2 - 10);
      g.font = "400 16px Noto Sans JP, system-ui";
      // 0.7s 経過後のみ再開案内
      const now = performance.now() / 1000;
      if (now >= restartAt) {
        g.fillText("タップ / Space / Enter でタイトルへ", W/2, H/2 + 20);
      } else {
        g.fillText("…", W/2, H/2 + 20);
      }
    }

    if (showDebug) {
      g.save();
      g.shadowBlur = 0;
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.font = "400 12px system-ui";
      g.textAlign = "left";
      g.fillText(`V=${V}  state=${state}  bullets=${bullets.length}`, 12, H - 28);
      g.restore();
    }
  }

  // ===== 入力 =====
  function canRestartNow() {
    return performance.now() / 1000 >= restartAt;
  }
  function onTapOrStart() {
    if (!unlocked) { aud.unlock().catch(()=>{}); unlocked = true; }
    if (state === "title") startGame();
    else if (state === "gameover" && canRestartNow()) toTitle();
  }
  function onKey(e) {
    if (e.key === "F2") showDebug = !showDebug;
    if (state === "title" && (e.key === "Enter" || e.code === "Space")) startGame();
    if (state === "gameover" && (e.key === "Enter" || e.code === "Space") && canRestartNow()) toTitle();

    // デバッグキー
    if (isPlaying() && e.key === "s") { state = "safe";  aud.playBgm("safe"); }
    if (isPlaying() && e.key === "b") { state = "bonus"; aud.playBgm("bonus"); }
    if (isPlaying() && e.key === "g") { gameOver(); }
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
    // タイトルBGM（仕様に合わせて safe を使用）
    aud.playBgm("safe");
    refreshTop(); // タイトルに戻ったらTop10を取り直す
  }

  async function maybeSubmitBest(newScore) {
    if (!rankClient.enabled) return;
    try {
      if (!playerName) {
        const nm = prompt("ランキング名（16文字まで）を入力してください", "YOU");
        if (!nm) return; // キャンセルなら送信しない
        playerName = nm.trim().slice(0, 16);
        localStorage.setItem("playerName", playerName);
      }
      const ua = (navigator.userAgent || "").slice(0, 64);
      await rankClient.submit({ name: playerName, score: Math.floor(newScore), ua });
      refreshTop();
    } catch (e) {
      console.warn("[rank] submit error:", e);
    }
  }

  function gameOver() {
    // ★ 既に gameover なら何もしない
    if (state === "gameover") return;

    state = "gameover";
    restartAt = performance.now() / 1000 + 0.7; // ★ 0.7s 後からタイトルへ戻れる
    aud.playBgm("gameover");
    if (config.audio?.sfx?.explode) aud.playSfx(config.audio.sfx.explode);

    // ★ 画面上の弾をクリア & スポーン休止（updateBullets は isPlaying() で止まるが念のため）
    bullets = [];
    if (spawner) { spawner.paused = true; }

    // ベスト更新時のみ送信（>0）
    if (score > 0 && Math.floor(score) > Math.floor(bestScore)) {
      bestScore = Math.floor(score);
      localStorage.setItem("bestScore", String(bestScore));
      maybeSubmitBest(bestScore);
    }
  }

  function applyZoneLogic(dt) {
    // ★ gameover 中はゾーン更新・状態遷移しない（ここが重要）
    if (state === "gameover") return;

    const inSafe  = safeZones.playerInside(player.x, player.y, player.hitR);
    const inBonus = !inSafe && bonusZone.playerInside(player.x, player.y);
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
  }

  function updateBullets(dt) {
    // ★ isPlaying() でしか呼ばれないが、念のため gameover を弾く
    if (state === "gameover") return;

    spawner.update(dt, gameTime, bullets, player);
    const speedScale = (config.tuning && config.tuning.bulletSpeedScale) ?? 1;
    const bdt = dt * speedScale;
    const px = player.x, py = player.y, ph = player.hitR;
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.update(bdt, player);
      const dx = b.x - px, dy = b.y - py;
      if (dx * dx + dy * dy < (b.hitR + ph) * (b.hitR + ph)) { gameOver(); return; }
      if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) { bullets.splice(i, 1); }
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
    safeZones.draw(g); bonusZone.draw(g);
    for (const b of bullets) b.draw(g);
    player.draw(g);
    drawUI();
    requestAnimationFrame(loop);
  }

  // ==== 起動 ====
  aud = new AudioManager(config);
  try { bgImg = await loadImage(config.background.image); } catch (e) { console.warn("bg load failed:", e); }

  player = new Player(config);
  player.load().catch(e => console.warn("[player] load error (fallback active)", e));

  await loadBulletSprites();
  spawner   = new Spawner(config);
  safeZones = new SafeZones(config);  await safeZones.load(config.ui?.sprites?.safe || "assets/img/zone_safe.png");
  bonusZone = new BonusZone(config);  await bonusZone.load(config.ui?.sprites?.bonus || "assets/img/zone_bonus.png");

  if (rankClient.enabled) refreshTop();

  // 入力（タイトル開始／ゲームオーバー復帰／デバッグ）
  input = new Input(canvas);
  canvas.addEventListener("pointerdown", onTapOrStart, { passive: true });
  addEventListener("keydown", onKey);

  // ループ開始
  requestAnimationFrame(loop);
  console.log(`[boot] ok V=${V} rank=${rankClient.enabled ? "on" : "off"}`);
}
