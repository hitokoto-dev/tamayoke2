// player.js — スプライト表示時は光輪OFF。未読込なら発光円で必ず見える。
export class Player {
  constructor(config) {
    this.cfg = config.player;
    this.x = 960 * 0.5;
    this.y = 540 * 0.85;
    this.vx = 0; this.vy = 0;
    this.speed = this.cfg.speed;
    this.slow  = this.cfg.slow;
    this.size  = this.cfg.size;
    this.hitR  = this.cfg.hitR;
    this.sprite = null;
    this.spritePath = this.cfg.sprite;
  }

  async load() {
    try {
      this.sprite = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = this.spritePath;
      });
      console.log("[player] sprite loaded:", this.spritePath);
    } catch (e) {
      console.warn("[player] sprite failed (fallback to circle):", this.spritePath, e);
      this.sprite = null;
    }
  }

  update(dt, input) {
    const speed = input.isSlow(0) ? this.slow : this.speed;

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

    const r = this.size / 2;
    this.x = Math.max(r, Math.min(960 - r, this.x));
    this.y = Math.max(r, Math.min(540 - r, this.y));
  }

  draw(g) {
    const r = this.size / 2;
    const showGlow = (!this.sprite) || (this.cfg.glow === true);
    if (showGlow) {
      g.save();
      g.globalAlpha = 0.6;
      g.fillStyle = "#0ff";
      g.beginPath(); g.arc(this.x, this.y, r + 6, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    if (this.sprite) {
      g.drawImage(this.sprite, this.x - r, this.y - r, this.size, this.size);
    } else {
      g.fillStyle = "#0ff";
      g.beginPath(); g.arc(this.x, this.y, r, 0, Math.PI * 2); g.fill();
    }

    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(this.x, this.y, r, 0, Math.PI * 2); g.stroke();
  }
}
