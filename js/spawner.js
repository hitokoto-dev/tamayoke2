// spawner.js — パターン発生＆難易度スケール（巨大漢字弾対応）
import { Bullet, BULLET_TYPES, KanjiBullet } from "./bullets.js";

export class Spawner {
  constructor(config) {
    this.cfg = config;
    this.t = 0;
    this.timers = { rain: 0, side: 0, fan: 0, ring: 0, kanji: 0 };
    this.kanjiIdx = 0; // リストを巡回
    // 追加：tuning
    const t = this.cfg.tuning || {};
    this.speedScale = (typeof t.bulletSpeedScale === "number") ? t.bulletSpeedScale : 1.0;
    this.countScale = (typeof t.bulletCountScale === "number") ? t.bulletCountScale : 1.0;
  }

  reset() {
    this.t = 0;
    this.timers.rain = this.timers.side = this.timers.fan = this.timers.ring = this.timers.kanji = 0;
  }

  _coeff(time) {
    const base = this.cfg.difficulty.base;
    const gain = this.cfg.difficulty.gainPerSec;
    const caps = this.cfg.difficulty.caps;
    const d = base + Math.max(0, time - this.cfg.graceSec) * gain;

    const baseSpeedMul = Math.min(caps.speedMul, 1 + (d - base));
    const baseCountMul = Math.min(caps.countMul, 1 + 0.6 * (d - base));
    const speedMul = Math.min(baseSpeedMul * this.speedScale, caps.speedMul * this.speedScale);
    const countMul = Math.min(baseCountMul * this.countScale, caps.countMul * this.countScale);
    return { d, speedMul, countMul };
  }

  update(dt, time, bullets, player) {
    this.t += dt;

    // GRACE中もタイマー進行
    for (const k of Object.keys(this.timers)) this.timers[k] += dt;
    if (time < this.cfg.graceSec) return;

    const { speedMul, countMul } = this._coeff(time);
    const W = this.cfg.logicSize.w, H = this.cfg.logicSize.h;
    const hitR = this.cfg.bullets.hitR;
    const ev = this.cfg.spawns;

    // --- 小雨
    while (this.timers.rain >= ev.rainEvery) {
      this.timers.rain -= ev.rainEvery;
      const n = Math.max(1, Math.round(4 * countMul));
      for (let i = 0; i < n; i++) {
        const x = 40 + Math.random() * (W - 80);
        const y = -20 - Math.random() * 60;
        const spd = 160 * speedMul;
        bullets.push(new Bullet({
          type: BULLET_TYPES.NORMAL, x, y, vx: 0, vy: spd, r: 9, hitR
        }));
      }
    }

    // --- 横から直線
    while (this.timers.side >= ev.sideEvery) {
      this.timers.side -= ev.sideEvery;
      const fromLeft = Math.random() < 0.5;
      const n = Math.max(1, Math.round(6 * countMul));
      for (let i = 0; i < n; i++) {
        const y = 60 + Math.random() * (H - 120);
        const spd = 220 * speedMul;
        const vx = fromLeft ? +spd : -spd;
        const type = (i % 3 === 0) ? BULLET_TYPES.FAST : BULLET_TYPES.NORMAL;
        const r = (type === BULLET_TYPES.FAST ? 7 : 9);
        const x = fromLeft ? -20 : W + 20;
        bullets.push(new Bullet({ type, x, y, vx, vy: 0, r, hitR }));
      }
    }

    // --- 横から扇
    while (this.timers.fan >= ev.fanEvery) {
      this.timers.fan -= ev.fanEvery;
      const fromLeft = Math.random() < 0.5;
      const baseY = H * (0.25 + 0.5 * Math.random());
      const n = Math.max(5, Math.round(7 * countMul));
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1)) - 0.5;
        const ang = (fromLeft ? 0 : Math.PI) + t * (Math.PI / 4);
        const spd = 200 * speedMul;
        const vx = Math.cos(ang) * spd;
        const vy = Math.sin(ang) * spd;
        const x = fromLeft ? -20 : W + 20;
        bullets.push(new Bullet({
          type: BULLET_TYPES.NORMAL, x, y: baseY, vx, vy, r: 9, hitR
        }));
      }
    }

    // --- 巨大漢字弾（5秒ごと1発／速度120・最大旋回15°/s・常に自機狙い）
    while (this.timers.kanji >= ev.kanjiEvery) {
      this.timers.kanji -= ev.kanjiEvery;
      const list = this.cfg.kanji?.list || [{k:"漢字", f:"かんじ"}];
      const pick = list[this.kanjiIdx % list.length]; this.kanjiIdx++;

      const r = this.cfg.kanji?.visualR || 84;      // 見た目半径
      const spd = 120 * speedMul;
      const x = 80 + Math.random() * (W - 160);     // 上から出す（左右端を少し空ける）
      const y = -r - 10;

      const dx = (player?.x || W/2) - x;
      const dy = (player?.y || H/2) - y;
      const m = Math.hypot(dx, dy) || 1;
      const vx = (dx / m) * spd;
      const vy = (dy / m) * spd;

      bullets.push(new KanjiBullet({
        x, y, vx, vy, r,
        hitR,
        k: pick.k, f: pick.f,
        kanjiCfg: this.cfg.kanji || {}
      }));
    }
  }
}
