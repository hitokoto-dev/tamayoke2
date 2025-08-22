// player.js — 自機。速度/低速/境界クリップ/スプライト描画
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
  }

  async load() {
    this.sprite = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = this.cfg.sprite; // configの相対パス
    });
  }

  // 入力に応じて更新。pointerが押されていれば“追従”、押されてなければキーボード。
  update(dt, input, activeTouches = 0) {
    const speed = input.isSlow(activeTouches) ? this.slow : this.speed;

    if (input.ptrDown) {
      // ポインタ追従（ゆっくり吸い付く・指とのズレ軽減）
      const k = 12; // 追従係数（大きいほど速く追従）
      this.vx = (input.ptrX - this.x) * k;
      this.vy = (input.ptrY - this.y) * k;
      // 速度制限
      const vmax = speed * 3;
      const m = Math.hypot(this.vx, this.vy);
      if (m > vmax) { this.vx = this.vx / m * vmax; this.vy = this.vy / m * vmax; }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    } else {
      // キーボード移動
      const ax = input.getAxis();
      this.x += ax.x * speed * dt;
      this.y += ax.y * speed * dt;
    }

    // 画面内にクリップ（44px安全余白は見た目で確保：size/2）
    const r = this.size / 2;
    this.x = Math.max(r, Math.min(960 - r, this.x));
    this.y = Math.max(r, Math.min(540 - r, this.y));
  }

  draw(g) {
    const r = this.size / 2;
    if (this.sprite) {
      g.drawImage(this.sprite, this.x - r, this.y - r, this.size, this.size);
    } else {
      // スプライトがまだならプレースホルダ
      g.fillStyle = "#0ff";
      g.beginPath(); g.arc(this.x, this.y, r, 0, Math.PI * 2); g.fill();
    }

    // デバッグ：当たり判定を表示したい時はコメント解除
    // g.strokeStyle = "rgba(255,0,0,0.6)";
    // g.beginPath(); g.arc(this.x, this.y, this.hitR, 0, Math.PI*2); g.stroke();
  }
}
