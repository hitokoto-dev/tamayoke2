// bullets.js — 通常/高速/誘導/巨大漢字弾
export const BULLET_TYPES = {
  NORMAL: "normal",
  FAST:   "fast",
  HOMING: "homing",
  KANJI:  "kanji",   // 巨大漢字弾
};

// 画像パス（最終アセット名）
const SPRITE_PATHS = {
  [BULLET_TYPES.NORMAL]: "assets/img/bullet_normal.png",
  [BULLET_TYPES.FAST]:   "assets/img/bullet_fast.png",
  [BULLET_TYPES.HOMING]: "assets/img/bullet_homing.png",
  [BULLET_TYPES.KANJI]:  "assets/img/bullet_big.png",
};

const V = (typeof window !== "undefined" && window.__APP_VERSION__) || "";
const withV = (u) => V ? (u + (u.includes("?") ? "&" : "?") + "v=" + V) : u;

const Sprites = {}; // type -> HTMLImageElement|null

export async function loadBulletSprites() {
  const load = (src) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null); // 無くても動かす
    im.src = withV(src);
  });
  for (const [k, src] of Object.entries(SPRITE_PATHS)) {
    Sprites[k] = await load(src);
    if (!Sprites[k]) console.warn("[bullet] sprite missing:", src);
  }
}

export class Bullet {
  constructor({ type, x, y, vx, vy, r, hitR }) {
    this.type = type;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.r = r;
    this.hitR = hitR;
  }

  update(dt, player) {
    if (this.type === BULLET_TYPES.HOMING && player) {
      const maxTurn = (15 * Math.PI / 180) * dt;
      const angCur = Math.atan2(this.vy, this.vx);
      const dx = (player.x - this.x), dy = (player.y - this.y);
      const angTar = Math.atan2(dy, dx);
      let d = angTar - angCur;
      d = (d + Math.PI) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; d -= Math.PI;
      const turn = Math.max(-maxTurn, Math.min(maxTurn, d));
      const spd = Math.hypot(this.vx, this.vy) || 1;
      const ang = angCur + turn;
      this.vx = Math.cos(ang) * spd;
      this.vy = Math.sin(ang) * spd;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  outOfBounds(w, h, m = 40) {
    return (this.x < -m || this.x > w + m || this.y < -m || this.y > h + m);
  }

  draw(g) {
    const s = Sprites[this.type];
    if (s) {
      if (this.type === BULLET_TYPES.HOMING) {
        const ang = Math.atan2(this.vy, this.vx);
        g.save();
        g.translate(this.x, this.y);
        g.rotate(ang);
        g.drawImage(s, -this.r, -this.r, this.r * 2, this.r * 2);
        g.restore();
      } else {
        g.drawImage(s, this.x - this.r, this.y - this.r, this.r * 2, this.r * 2);
      }
    } else {
      g.beginPath();
      g.fillStyle = (this.type === BULLET_TYPES.FAST) ? "#f66" :
                    (this.type === BULLET_TYPES.HOMING) ? "#6cf" :
                    (this.type === BULLET_TYPES.KANJI) ? "#ffd84a" : "#fff";
      g.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = "#000";
      g.stroke();
    }
  }
}

// ---- 巨大漢字弾 ----
export class KanjiBullet extends Bullet {
  constructor({ x, y, vx, vy, r, hitR, k, f, kanjiCfg }) {
    super({ type: BULLET_TYPES.KANJI, x, y, vx, vy, r, hitR });
    this.k = k;              // 漢字
    this.f = f;              // ふりがな
    this.cfg = kanjiCfg;     // { visualR, paddingRate, rubyRate, lineGapRate, rubyColor }
    this._layoutCache = null;
  }

  update(dt, player) {
    // 誘導：最大旋回 15°/s
    const maxTurn = (15 * Math.PI / 180) * dt;
    const angCur = Math.atan2(this.vy, this.vx);
    const dx = (player.x - this.x), dy = (player.y - this.y);
    const angTar = Math.atan2(dy, dx);
    let d = angTar - angCur;
    d = (d + Math.PI) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; d -= Math.PI;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, d));
    const spd = Math.hypot(this.vx, this.vy) || 1;
    const ang = angCur + turn;
    this.vx = Math.cos(ang) * spd;
    this.vy = Math.sin(ang) * spd;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  _ensureLayout(g) {
    if (this._layoutCache) return this._layoutCache;

    const r = this.r;
    const pad = this.cfg.paddingRate ?? 0.12;
    const inner = r * (1 - pad);                  // テキスト描画の余白込み半径
    const rubyRate = this.cfg.rubyRate ?? 0.28;
    const gapRate  = this.cfg.lineGapRate ?? 0.16;

    // 行分割（3文字以上は2行に割る: 視認性優先の簡易ルール）
    const text = this.k || "";
    let lines;
    if (text.length >= 3) {
      const mid = Math.ceil(text.length / 2);
      lines = [text.slice(0, mid), text.slice(mid)];
    } else {
      lines = [text];
    }

    // 100px基準で幅を測ってから縮尺で求める
    const measureWidthAt = (s, px) => {
      g.save();
      g.font = `700 ${px}px Noto Sans JP, system-ui`;
      const w = g.measureText(s).width;
      g.restore();
      return w;
    };

    const longest = lines.reduce((a, b) =>
      (measureWidthAt(a, 100) > measureWidthAt(b, 100)) ? a : b
    );

    const w100 = Math.max(1, measureWidthAt(longest, 100));
    // 最大横幅 = 直径(内側)
    const maxW = inner * 2;
    let mainPx = Math.min((maxW / w100) * 100, inner * 0.95); // 縦の暴れを抑える上限

    // 2行なら縦方向制約もかける
    if (lines.length === 2) {
      const gapPx = mainPx * gapRate;
      const totalH = mainPx * 2 + gapPx;
      const maxH = inner * 2 * 0.78; // 上部ルビ用に少し控える
      if (totalH > maxH) {
        mainPx *= maxH / totalH;
      }
    }

    const rubyPx = Math.max(8, Math.floor(mainPx * rubyRate));
    const gapPx  = Math.floor(mainPx * gapRate);

    this._layoutCache = { lines, mainPx, rubyPx, gapPx };
    return this._layoutCache;
  }

  draw(g) {
    // 背景円
    const s = Sprites[BULLET_TYPES.KANJI];
    if (s) g.drawImage(s, this.x - this.r, this.y - this.r, this.r * 2, this.r * 2);
    else {
      g.save();
      g.fillStyle = "#222"; g.beginPath(); g.arc(this.x, this.y, this.r, 0, Math.PI*2); g.fill();
      g.restore();
    }

    const { lines, mainPx, rubyPx, gapPx } = this._ensureLayout(g);

    // ルビ（円の上側）
    if (this.f) {
      g.save();
      g.font = `700 ${rubyPx}px Noto Sans JP, system-ui`;
      g.fillStyle = this.cfg.rubyColor || "#f00";
      g.textAlign = "center"; g.textBaseline = "alphabetic";
      const topY = this.y - this.r + rubyPx + Math.max(2, this.r * 0.06);
      g.fillText(this.f, this.x, topY);
      g.restore();
    }

    // 漢字本体（中央寄せ）
    g.save();
    g.font = `700 ${Math.floor(mainPx)}px Noto Sans JP, system-ui`;
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (lines.length === 1) {
      g.fillText(lines[0], this.x, this.y + Math.floor(this.r * 0.08)); // 視覚補正で少し下げる
    } else {
      const y0 = this.y - (mainPx + gapPx) / 2;
      g.fillText(lines[0], this.x, y0);
      g.fillText(lines[1], this.x, y0 + mainPx + gapPx);
    }
    g.restore();
  }
}
