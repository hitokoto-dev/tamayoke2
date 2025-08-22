// player.js — 安全版：読み込み失敗でも必ず見える発光サークルを描画
export class Player {
  constructor(config) {
    this.cfg = config.player;
    this.x = 960 * 0.5;
    this.y = 540 * 0.85;
    this.vx = 0; this.vy = 0;
    this.speed = this.cfg.speed; // 例: 280
    this.slow  = this.cfg.slow;  // 例: 120
    this.size  = this.cfg.size;  // 見た目サイズ（px）
    this.hitR  = this.cfg.hitR;  // 当たり判定半径（px）
    this.sprite = null;
    this.spritePath = this.cfg.sprite; // "assets/img/player.png"
  }

  async load() {
    try {
      this.sprite = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = this.spritePath;
      });
      console.log("[player] sprite loaded:", this.spritePath, this.sprite.naturalWidth, this.sprite.naturalHeight);
    } catch (e) {
      console.warn("[player] sprite failed, fallback to circle:", this.spritePath, e);
      this.sprite = null; // フォールバック描画へ
    }
  }

  update(dt, input, activeTouches = 0) {
    const speed = (input.isSlow(activeTouches) ? this.slow : this.speed);

    if (input.ptrDown) {
      const k = 12;
      this.vx = (input.ptrX - this.x) * k;
      this.vy = (input.ptrY - this.y) * k;
      const vmax = speed * 3;
      const m = Math.hypot(this.vx, this.vy);
      if (m > vmax) { this.vx = this.vx / m * vmax; this.vy = this.vy / m * vmax; }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    } else {
      const ax = input.getAxis();
      this.x += ax.x * speed * dt;
      this.y += ax.y * speed * dt;
    }

    // 画面内にクリップ
    const r = this.size / 2;
    this.x = Math.max(r, Math.min(960 - r, this.x));
    this.y = Math.max(r, Math.min(540 - r, this.y));
  }

  draw(g) {
    const r = this.size / 2;

    // 下地の発光（絶対に見えるように）
    g.save();
    g.globalAlpha = 0.6;
    g.fillStyle = "#0ff";
    g.beginPath(); g.arc(this.x, this.y, r + 6, 0, Math.PI * 2); g.fill();
    g.restore();

    if (this.sprite) {
      g.drawImage(this.sprite, this.x - r, this.y - r, this.size, this.size);
    } else {
      // プレースホルダ（明るいシアン）
      g.fillStyle = "#0ff";
      g.beginPath(); g.arc(this.x, this.y, r, 0, Math.PI * 2); g.fill();
    }

    // 視認性のための白枠
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(this.x, this.y, r, 0, Math.PI * 2); g.stroke();
  }
}
