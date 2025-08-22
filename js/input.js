// input.js — マウス/タッチ/キーボード共通入力
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.ptrDown = false;
    this.ptrX = 0; this.ptrY = 0;
    this.keys = new Set();

    const toLogical = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = 960 / rect.width;
      const sy = 540 / rect.height;
      return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
    };

    canvas.addEventListener("pointerdown", (e) => {
      const p = toLogical(e.clientX, e.clientY);
      this.ptrDown = true; this.ptrX = p.x; this.ptrY = p.y;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.ptrDown) return;
      const p = toLogical(e.clientX, e.clientY);
      this.ptrX = p.x; this.ptrY = p.y;
    });
    const up = (e) => { this.ptrDown = false; try { canvas.releasePointerCapture(e.pointerId); } catch {} };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    addEventListener("keydown", (e) => this.keys.add(e.key));
    addEventListener("keyup",   (e) => this.keys.delete(e.key));
  }

  getAxis() {
    let ax = 0, ay = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("a")) ax -= 1;
    if (this.keys.has("ArrowRight")|| this.keys.has("d")) ax += 1;
    if (this.keys.has("ArrowUp")   || this.keys.has("w")) ay -= 1;
    if (this.keys.has("ArrowDown") || this.keys.has("s")) ay += 1;
    if (ax || ay) { const m = Math.hypot(ax, ay) || 1; ax /= m; ay /= m; }
    return { x: ax, y: ay };
  }

  isSlow(touchCount = 0) {
    return this.keys.has("Shift") || this.keys.has(" ") || touchCount >= 2;
  }
}
