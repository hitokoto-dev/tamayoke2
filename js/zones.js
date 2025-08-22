// zones.js — セーフ/ボーナスゾーン（描画・判定・アニメーション）
const W = 960, H = 540;

function loadImageOrNull(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

// 円と矩形の交差（半径rの円が矩形[x,y,w,h]と重なる？）
function circleIntersectsRect(cx, cy, r, x, y, w, h) {
  const nx = Math.max(x, Math.min(cx, x + w));
  const ny = Math.max(y, Math.min(cy, y + h));
  const dx = cx - nx, dy = cy - ny;
  return (dx * dx + dy * dy) <= r * r;
}

export class SafeZones {
  constructor(config) {
    this.cfg = config;
    this.h = config.zones.safeH;         // 高さ36
    this.cols = config.zones.safeCols;   // 4
    this.w = W / 4.5;                    // 指定幅
    this.rects = [];
    this.sprite = null;
    this.insets = config.ui?.nineSlice?.safe || { left: 8, right: 8, top: 6, bottom: 6 };
    this._layout();
  }

  _layout() {
    // 均等配置（左右マージン含め5等分のスロットに置く）
    const total = this.w * this.cols;
    const gap = (W - total) / (this.cols + 1);
    const y = H - this.h; // 画面下
    this.rects.length = 0;
    for (let i = 0; i < this.cols; i++) {
      const x = Math.round(gap + i * (this.w + gap));
      this.rects.push({ x, y, w: Math.round(this.w), h: this.h });
    }
  }

  async load(spritePath) {
    this.sprite = await loadImageOrNull(spritePath);
  }

  // 弾の侵入禁止：円（弾）と任意のセーフ矩形が重なれば true
  bulletHitsSafe(x, y, r) {
    for (const rc of this.rects) {
      if (circleIntersectsRect(x, y, r, rc.x, rc.y, rc.w, rc.h)) return true;
    }
    return false;
  }

  // プレイヤーがどれかに入っているか
  playerInside(px, py, pr) {
    for (const rc of this.rects) {
      if (circleIntersectsRect(px, py, pr, rc.x, rc.y, rc.w, rc.h)) return true;
    }
    return false;
  }

  drawNineSlice(g, img, x, y, w, h) {
    const { left, right, top, bottom } = this.insets;
    const iw = img.width, ih = img.height;

    const sx = [0, left, iw - right, iw];
    const sy = [0, top, ih - bottom, ih];
    const dx = [x, x + left, x + w - right, x + w];
    const dy = [y, y + top, y + h - bottom, y + h];

    for (let iy = 0; iy < 3; iy++) for (let ix = 0; ix < 3; ix++) {
      const sw = sx[ix + 1] - sx[ix];
      const sh = sy[iy + 1] - sy[iy];
      const dw = Math.round(dx[ix + 1] - dx[ix]);
      const dh = Math.round(dy[iy + 1] - dy[iy]);
      g.drawImage(
        img,
        sx[ix], sy[iy], sw, sh,
        Math.round(dx[ix]), Math.round(dy[iy]), dw, dh
      );
    }
  }

  draw(g) {
    if (this.sprite) {
      for (const rc of this.rects) this.drawNineSlice(g, this.sprite, rc.x, rc.y, rc.w, rc.h);
    } else {
      // フォールバック：半透明バー
      g.save();
      g.fillStyle = "rgba(80,180,255,0.2)";
      for (const rc of this.rects) g.fillRect(rc.x | 0, rc.y | 0, rc.w | 0, rc.h | 0);
      g.restore();
    }
  }
}

export class BonusZone {
  constructor(config) {
    this.cfg = config;
    this.r = config.zones.centerR; // 90
    // 軌道
    const o = config.zones.bonusMove.orbit;
    this.orbitCenter = { x: o.center.x * W, y: o.center.y * H };
    this.orbitRadius = o.radius;                // 120
    this.degPerSec = o.degPerSec;               // 24
    this.spinDegPerSec = config.zones.bonusMove.spinDegPerSec; // 35
    this.theta = 0; // 現在角
    this.spin = 0;  // スプライト表示角
    this.sprite = null;
  }

  async load(spritePath) {
    this.sprite = await loadImageOrNull(spritePath);
  }

  update(dt) {
    // 軌道更新
    this.theta += (this.degPerSec * Math.PI / 180) * dt;
    this.spin  += (this.spinDegPerSec * Math.PI / 180) * dt;
  }

  center() {
    return {
      x: this.orbitCenter.x + Math.cos(this.theta) * this.orbitRadius,
      y: this.orbitCenter.y + Math.sin(this.theta) * this.orbitRadius
    };
  }

  playerInside(px, py) {
    const c = this.center();
    const dx = px - c.x, dy = py - c.y;
    return (dx * dx + dy * dy) <= (this.r * this.r);
  }

  draw(g) {
    const c = this.center();
    const d = this.r * 2;
    if (this.sprite) {
      g.save();
      g.translate(c.x | 0, c.y | 0);
      g.rotate(this.spin);
      g.drawImage(this.sprite, -this.r, -this.r, d, d);
      g.restore();
    } else {
      // フォールバック：輪郭円
      g.save();
      g.strokeStyle = "rgba(255,216,74,0.9)";
      g.lineWidth = 3;
      g.beginPath(); g.arc(c.x, c.y, this.r, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
  }
}
