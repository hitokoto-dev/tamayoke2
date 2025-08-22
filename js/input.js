// input.js — マウス/タッチ/キーボードをひとまとめに
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.ptrDown = false;
    this.ptrX = 0; this.ptrY = 0;     // 論理座標（960x540）
    this.keys = new Set();

    // 論理解像度→DOMサイズの変換
    const toLogical = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = 960 / rect.width;
      const sy = 540 / rect.height;
      const x = (clientX - rect.left) * sx;
      const y = (clientY - rect.top) * sy;
      return { x, y };
    };

    // Pointer
    canvas.addEventListener("pointerdown", (e) => {
      const p = toLogical(e.clientX, e.clientY);
      this.ptrDown = true; this.ptrX = p.x; this.ptrY = p.y;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.ptrDown) return;
      const p = toLogical(e.clientX, e.clientY);
      this.ptrX = p.x; this.ptrY = p.y;
    });
    const up = (e) => { this.ptrDown = false; try{canvas.releasePointerCapture(e.pointerId);}catch{} };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    // Keyboard
    addEventListener("keydown", (e) => this.keys.add(e.key));
    addEventListener("keyup",   (e) => this.keys.delete(e.key));
  }

  // 移動ベクトル（WASD/矢印）
  getAxis() {
    let ax = 0, ay = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("a")) ax -= 1;
    if (this.keys.has("ArrowRight")|| this.keys.has("d")) ax += 1;
    if (this.keys.has("ArrowUp")   || this.keys.has("w")) ay -= 1;
    if (this.keys.has("ArrowDown") || this.keys.has("s")) ay += 1;
    // 正規化
    if (ax || ay) {
      const len = Math.hypot(ax, ay) || 1;
      ax /= len; ay /= len;
    }
    return { x: ax, y: ay };
  }

  // “低速移動”判定（Shift/Space または 2本指）
  isSlow(touchCount = 0) {
    return this.keys.has("Shift") || this.keys.has(" ") || touchCount >= 2;
  }
}
