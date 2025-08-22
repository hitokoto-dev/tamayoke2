// spawner.js — パターン発生＆難易度スケール
import { Bullet, BULLET_TYPES } from "./bullets.js?v=danmaku1";

export class Spawner {
  constructor(config) {
    this.cfg = config;
    this.t = 0;
    this.timers = {
      rain: 0, side: 0, fan: 0, ring: 0, homing: 0
    };
  }

  reset() {
    this.t = 0;
    this.timers.rain = this.timers.side = this.timers.fan = this.timers.ring = this.timers.homing = 0;
  }

  // 難易度係数（仕様ベース）
  _coeff(time) {
    const base = this.cfg.difficulty.base;       // 0.6
    const gain = this.cfg.difficulty.gainPerSec; // 0.08
    const d = base + Math.max(0, time - this.cfg.graceSec) * gain; // 0.6〜
    const speedMul = Math.min(this.cfg.difficulty.caps.speedMul, 1 + (d - base));      // ≥1.0
    const countMul = Math.min(this.cfg.difficulty.caps.countMul, 1 + 0.6 * (d - base)); // ゆるやか
    return { d, speedMul, countMul };
  }

  update(dt, time, bullets, player) {
    this.t += dt;
    if (time < this.cfg.graceSec) return;

    const { speedMul, countMul } = this._coeff(time);
    const W = this.cfg.logicSize.w, H = this.cfg.logicSize.h;
    const hitR = this.cfg.bullets.hitR;

    // 各パターンの発生タイミング
    const ev = this.cfg.spawns;

    // 小雨（上から点在）: rainEvery ごとに 4 * countMul 発
    this.timers.rain += dt;
    if (this.timers.rain >= ev.rainEvery) {
      this.timers.rain -= ev.rainEvery;
      const n = Math.max(1, Math.round(4 * countMul));
      for (let i = 0; i < n; i++) {
        const x = 40 + Math.random() * (W - 80);
        const y = -20 - Math.random() * 60;
        const spd = 160 * speedMul;
        bullets.push(new Bullet({
          type: BULLET_TYPES.NORMAL,
          x, y, vx: 0, vy: spd,
          r: 9, hitR
        }));
      }
    }

    // 横から直線: sideEvery ごとに 左右どちらかに 6 * countMul
    this.timers.side += dt;
    if (this.timers.side >= ev.sideEvery) {
      this.timers.side -= ev.sideEvery;
      const fromLeft = Math.random() < 0.5;
      const n = Math.max(1, Math.round(6 * countMul));
      for (let i = 0; i < n; i++) {
        const y = 60 + Math.random() * (H - 120);
        const spd = 220 * speedMul;
        const vx = (fromLeft ? +spd : -spd);
        const type = (i % 3 === 0) ? BULLET_TYPES.FAST : BULLET_TYPES.NORMAL;
        const r = (type === BULLET_TYPES.FAST ? 7 : 9);
        const x = fromLeft ? -20 : W + 20;
        bullets.push(new Bullet({ type, x, y, vx, vy: 0, r, hitR }));
      }
    }

    // 横から扇: fanEvery ごとに 7発
    this.timers.fan += dt;
    if (this.timers.fan >= ev.fanEvery) {
      this.timers.fan -= ev.fanEvery;
      const fromLeft = Math.random() < 0.5;
      const baseY = H * (0.25 + 0.5 * Math.random());
      const n = 7;
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1)) - 0.5; // -0.5..0.5
        const ang = (fromLeft ? 0 : Math.PI) + t * (Math.PI / 4); // ±22.5°
        const spd = 200 * speedMul;
        const vx = Math.cos(ang) * spd;
        const vy = Math.sin(ang) * spd;
        const x = fromLeft ? -20 : W + 20;
        bullets.push(new Bullet({
          type: BULLET_TYPES.NORMAL, x, y: baseY, vx, vy, r: 9, hitR
        }));
      }
    }

    // 誘導弾: kanjiEvery の代わりに1発（仕様の「巨大漢字弾」は別実装予定）
    this.timers.homing += dt;
    if (this.timers.homing >= ev.kanjiEvery) {
      this.timers.homing -= ev.kanjiEvery;
      const x = Math.random() < 0.5 ? 80 : (W - 80);
      const y = -30;
      const spd = 120 * speedMul; // 仕様ベース
      // まずはプレイヤー方向へ
      const dx = (player?.x || W / 2) - x;
      const dy = (player?.y || H / 2) - y;
      const m = Math.hypot(dx, dy) || 1;
      const vx = (dx / m) * spd;
      const vy = (dy / m) * spd;
      bullets.push(new Bullet({
        type: BULLET_TYPES.HOMING, x, y, vx, vy, r: 8, hitR
      }));
    }

    // （必要ならリング/横スイング列は後で追加）
  }
}
