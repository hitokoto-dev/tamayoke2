// bullets.js
let imgNormal, imgFast, imgHoming, imgBig;

export async function loadBulletSprites() {
  function load(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("bullet image load failed: " + src));
      im.src = src;
    });
  }
  [imgNormal, imgFast, imgHoming, imgBig] = await Promise.all([
    load("assets/img/bullet_normal.png"),
    load("assets/img/bullet_fast.png"),
    load("assets/img/bullet_homing.png"),
    load("assets/img/bullet_big.png")
  ]);
}

// スプライトが未ロードでも落ちないフォールバック付きの描画
function drawSpriteOrDotScaled(g, im, r, color = "#fff") {
  if (im) {
    g.drawImage(im, -r, -r, r * 2, r * 2);
  } else {
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = "#000";
    g.stroke();
  }
}

class BaseBullet {
  constructor(x, y, vx, vy, hitR = 3, visR = 9) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.hitR = hitR;     // 当たり半径（判定用）
    this.visR = visR;     // 見た目半径（描画用）
    this.rotation = 0;
  }
  update(dt /*, player */) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rotation = Math.atan2(this.vy, this.vx);
  }
  draw(g) {
    g.save();
    g.translate(this.x, this.y);
    g.rotate(this.rotation);
    drawSpriteOrDotScaled(g, imgNormal, this.visR, "#fff");
    g.restore();
  }
}

export class NormalBullet extends BaseBullet {
  // 既定：hitR=3, 見た目半径=9（直径18px想定）
  constructor(x, y, vx, vy, hitR = 3, visR = 9) {
    super(x, y, vx, vy, hitR, visR);
  }
  draw(g) {
    g.save(); g.translate(this.x, this.y);
    drawSpriteOrDotScaled(g, imgNormal, this.visR, "#fff");
    g.restore();
  }
}

export class FastBullet extends BaseBullet {
  // 既定：見た目半径=7（直径14px想定）
  constructor(x, y, vx, vy, hitR = 3, visR = 7) {
    super(x, y, vx, vy, hitR, visR);
  }
  draw(g) {
    g.save(); g.translate(this.x, this.y);
    drawSpriteOrDotScaled(g, imgFast, this.visR, "#f33");
    g.restore();
  }
}

export class HomingBullet extends BaseBullet {
  // 既定：最大旋回角=180°/s、見た目半径=8
  constructor(x, y, vx, vy, hitR = 3, maxTurnDeg = 180, visR = 8) {
    super(x, y, vx, vy, hitR, visR);
    this.maxTurn = (maxTurnDeg * Math.PI) / 180;
  }
  update(dt, player) {
    const tx = player.x - this.x, ty = player.y - this.y;
    const tv = Math.atan2(ty, tx);
    const cv = Math.atan2(this.vy, this.vx);
    let d = ((tv - cv + Math.PI) % (2 * Math.PI)) - Math.PI;
    const lim = this.maxTurn * dt;
    if (d >  lim) d =  lim;
    if (d < -lim) d = -lim;
    const nv = cv + d;
    const speed = Math.hypot(this.vx, this.vy);
    this.vx = Math.cos(nv) * speed;
    this.vy = Math.sin(nv) * speed;
    super.update(dt);
  }
  draw(g) {
    g.save();
    g.translate(this.x, this.y);
    g.rotate(this.rotation);
    drawSpriteOrDotScaled(g, imgHoming, this.visR, "#6af");
    g.restore();
  }
}

export class KanjiBullet extends BaseBullet {
  constructor(x, y, speed, player, kanjiCfg) {
    const ang = Math.atan2(player.y - y, player.x - x);
    // 当たり半径は大きめ（24）、見た目は kanjiCfg.visualR / maxR でスケール
    super(x, y, Math.cos(ang) * speed, Math.sin(ang) * speed, 24, kanjiCfg.visualR ?? 84);
    this.speed = speed;
    this.maxTurn = (15 * Math.PI) / 180; // 15°/s
    this.k = (kanjiCfg.list[Math.floor(Math.random() * kanjiCfg.list.length)] ?? { k: "漢字", f: "かんじ" });
    this.cfg = kanjiCfg;
  }
  update(dt, player) {
    const tx = player.x - this.x, ty = player.y - this.y;
    const tv = Math.atan2(ty, tx);
    const cv = Math.atan2(this.vy, this.vx);
    let d = ((tv - cv + Math.PI) % (2 * Math.PI)) - Math.PI;
    const lim = this.maxTurn * dt;
    if (d > lim) d = lim;
    if (d < -lim) d = -lim;
    const nv = cv + d;
    this.vx = Math.cos(nv) * this.speed;
    this.vy = Math.sin(nv) * this.speed;
    super.update(dt, player);
  }
  draw(g) {
    const R = Math.min(this.cfg.maxR ?? this.visR, this.visR);
    g.save();
    g.translate(this.x, this.y);
    if (imgBig) {
      g.drawImage(imgBig, -R, -R, R * 2, R * 2);
    } else {
      g.fillStyle = "#222"; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    }
    // 文字
    const pad = R * (this.cfg.paddingRate ?? 0.12);
    const textR = R - pad;
    g.fillStyle = "#fff";
    g.textAlign = "center";
    let size = textR * 0.9;
    g.font = `${Math.floor(size)}px Noto Sans JP, system-ui`;
    while (g.measureText(this.k.k).width > textR * 1.7 && size > 10) {
      size -= 2; g.font = `${Math.floor(size)}px Noto Sans JP, system-ui`;
    }
    g.fillText(this.k.k, 0, 12);
    g.fillStyle = this.cfg.rubyColor || "#f00";
    g.font = `${Math.floor(size * (this.cfg.rubyRate ?? 0.28))}px Noto Sans JP, system-ui`;
    g.fillText(this.k.f, 0, -textR * 0.4);
    g.restore();
  }
}
