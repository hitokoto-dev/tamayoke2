// bullets.js — 通常/高速/誘導の弾、描画と更新
export const BULLET_TYPES = { NORMAL: "normal", FAST: "fast", HOMING: "homing" };

// 画像パス（引き継ぎの最終アセット名）
const SPRITE_PATHS = {
  [BULLET_TYPES.NORMAL]: "assets/img/bullet_normal.png",
  [BULLET_TYPES.FAST]:   "assets/img/bullet_fast.png",
  [BULLET_TYPES.HOMING]: "assets/img/bullet_homing.png",
};

const Sprites = {}; // type -> HTMLImageElement or null

export async function loadBulletSprites() {
  const load = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null); // 画像がなくても動く
    im.src = src;
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
    this.r = r;       // 見た目半径
    this.hitR = hitR; // 当たり判定半径
  }

  update(dt, player) {
    if (this.type === BULLET_TYPES.HOMING && player) {
      // 進行方向をプレイヤー方向へゆっくり寄せる（最大旋回 15°/s）
      const maxTurn = (15 * Math.PI / 180) * dt;
      const angCur = Math.atan2(this.vy, this.vx);
      const dx = (player.x - this.x), dy = (player.y - this.y);
      const angTar = Math.atan2(dy, dx);
      let d = angTar - angCur;
      // -PI..PI に正規化
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
        // 進行方向に回転描画
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
      // フォールバック円
      g.beginPath();
      g.fillStyle = (this.type === BULLET_TYPES.FAST) ? "#f66" :
                    (this.type === BULLET_TYPES.HOMING) ? "#6cf" : "#fff";
      g.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = "#000";
      g.stroke();
    }
  }
}
