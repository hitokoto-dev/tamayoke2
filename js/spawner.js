// spawner.js
import { NormalBullet, FastBullet, HomingBullet, KanjiBullet } from "./bullets.js";

export class Spawner {
  constructor(config) {
    this.c = config;
    this.t = {
      row: 0, sine: 0, rain: 0, side: 0, fan: 0, ring: 0, kanji: 0, homing: 0
    };
    this.paused = false;
    this.active = true;
  }

  reset() {
    for (const k of Object.keys(this.t)) this.t[k] = 0;
    this.paused = false;
    this.active  = true;
  }

  update(dt, time, bullets, player) {
    if (this.paused || !this.active) return;

    // 難易度
    const dcfg = this.c.difficulty;
    const diff = (dcfg.base || 0.6) + Math.max(0, time - 3) * (dcfg.gainPerSec || 0.08);
    const speedMul = Math.min(1 + diff * 0.5, dcfg.caps?.speedMul ?? 2.0);
    const countMul = Math.min(1 + diff * 0.35, dcfg.caps?.countMul ?? 1.6);

    // 共通
    const W = this.c.logicSize.w, H = this.c.logicSize.h;
    const baseSpeed = 160 * (this.c.tuning?.bulletSpeedScale ?? 1); // 白い球は0.7倍（config）
    const fastSpeed = 260 * speedMul;          // 赤：速い
    const homingSpeed = 140 * speedMul;        // 青：誘導
    const kanjiSpeed = 120 * speedMul;         // 巨大漢字弾

    // タイマ進行
    for (const k of Object.keys(this.t)) this.t[k] += dt;

    // 1) 小雨（上から点在）
    if (this.t.rain >= (this.c.spawns.rainEvery || 3.8)) {
      this.t.rain = 0;
      const n = Math.round(4 * countMul);
      for (let i = 0; i < n; i++) {
        const x = 20 + Math.random() * (W - 40);
        const y = -20 - Math.random() * 30;
        const vx = 0, vy = (baseSpeed + Math.random() * 40) * speedMul;
        bullets.push(new NormalBullet(x, y, vx, vy, this.c.bullets.hitR));
      }
    }

    // 2) 横から直線
    if (this.t.side >= (this.c.spawns.sideEvery || 1.8)) {
      this.t.side = 0;
      const fromLeft = Math.random() < 0.5;
      const y = 40 + Math.random() * (H - 160);
      const n = Math.round(6 * countMul);
      for (let i = 0; i < n; i++) {
        const x = fromLeft ? -20 - i * 14 : W + 20 + i * 14;
        const vx = (fromLeft ? 1 : -1) * baseSpeed * 0.9 * speedMul;
        bullets.push(new NormalBullet(x, y, vx, 0, this.c.bullets.hitR));
      }
    }

    // 3) 横から扇
    if (this.t.fan >= (this.c.spawns.fanEvery || 3.2)) {
      this.t.fan = 0;
      const fromLeft = Math.random() < 0.5;
      const x0 = fromLeft ? -20 : W + 20;
      const y0 = H * (0.3 + Math.random() * 0.4);
      const n = Math.round(7 * countMul);
      for (let i = 0; i < n; i++) {
        const ang = (fromLeft ? 0 : Math.PI) + (i - (n - 1) / 2) * (Math.PI / 16);
        const vx = Math.cos(ang) * baseSpeed * speedMul;
        const vy = Math.sin(ang) * baseSpeed * speedMul;
        bullets.push(new NormalBullet(x0, y0, vx, vy, this.c.bullets.hitR));
      }
    }

    // 4) リング
    if (this.t.ring >= (this.c.spawns.ringEvery || 9.0)) {
      this.t.ring = 0;
      const cx = W * (0.25 + Math.random() * 0.5);
      const cy = H * (0.3 + Math.random() * 0.4);
      const n = Math.round(26 * countMul);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * (Math.PI * 2);
        const vx = Math.cos(ang) * baseSpeed * 0.9 * speedMul;
        const vy = Math.sin(ang) * baseSpeed * 0.9 * speedMul;
        bullets.push(new NormalBullet(cx, cy, vx, vy, this.c.bullets.hitR));
      }
    }

    // 5) 赤い球（数を減らす：ファストは低頻度）
    if (this.t.row >= (this.c.spawns.rowEvery || 6.6)) {
      this.t.row = 0;
      // 少数のみ
      const n = Math.max(2, Math.round(3 * (countMul * 0.6)));
      const y = 60 + Math.random() * (H - 120);
      for (let i = 0; i < n; i++) {
        const x = 40 + i * (W / (n + 1));
        const vx = (Math.random() < 0.5 ? -1 : 1) * fastSpeed;
        const vy = (Math.random() - 0.5) * 40;
        bullets.push(new FastBullet(x, y, vx, vy, this.c.bullets.hitR));
      }
    }

    // 6) 誘導弾（青）
    if (this.t.homing >= (this.c.spawns.homingEvery || 4.5)) {
      this.t.homing = 0;
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side < 0 ? -24 : W + 24;
      const y = 60 + Math.random() * (H - 120);
      const vx = side < 0 ? homingSpeed : -homingSpeed;
      bullets.push(new HomingBullet(x, y, vx, 0, this.c.bullets.hitR, 200));
    }

    // 7) 巨大漢字弾（常にプレイヤー狙い／5sごと）
    if (this.t.kanji >= (this.c.spawns.kanjiEvery || 5.0)) {
      this.t.kanji = 0;
      const edge = Math.floor(Math.random() * 4); // 0:上 1:右 2:下 3:左
      let x = 0, y = 0;
      if (edge === 0) { x = Math.random()*W; y = -40; }
      if (edge === 1) { x = W + 40; y = Math.random()*H; }
      if (edge === 2) { x = Math.random()*W; y = H + 40; }
      if (edge === 3) { x = -40; y = Math.random()*H; }
      bullets.push(new KanjiBullet(x, y, kanjiSpeed, player, this.c.kanji));
    }
  }
}
