// js/spawner.js — パターン生成（雨/横/リング/漢字/誘導）
// main から Bullets と config が注入される想定

export function createSpawner({ Bullets, config }) {
  const { NormalBullet, FastBullet, HomingBullet, KanjiBullet } = Bullets;
  const sp = (config?.spawns) || {};
  const every = {
    rain : sp.rainEvery  ?? 3.8,
    side : sp.sideEvery  ?? 1.8,
    ring : sp.ringEvery  ?? 9.0,
    kanji: sp.kanjiEvery ?? 5.0,
    homing:sp.homingEvery?? 4.5
  };
  let t = { rain:0, side:0, ring:0, kanji:0, homing:0 };

  function diffMul(time, grow=0.85, tMax=120){
    const m = Math.min(1, time / tMax);
    return 0.2 + grow * m; // 0.2→1.05 くらい
  }

  return {
    update(dt, now, bullets, W=960, H=540) {
      const mul = diffMul(now);

      // 雨：上から
      t.rain += dt;
      if (t.rain >= every.rain) {
        t.rain = 0;
        const n = Math.max(8, Math.floor(14 * mul));
        for (let i=0;i<n;i++){
          const x = (W/n)*(i+0.5);
          const y = -10;
          const v = 90 * (0.9 + Math.random()*0.3);
          bullets.push(new NormalBullet(x,y, 0, v));
        }
      }

      // 横から
      t.side += dt;
      if (t.side >= every.side) {
        t.side = 0;
        const L = Math.random()<0.5;
        const y0 = 60 + Math.random() * (H-120);
        const c = Math.max(4, Math.floor(8 * mul*0.8));
        for (let i=0;i<c;i++){
          const x = L ? -10 : W+10;
          const vx = (L? 140 : -140) * (0.9 + Math.random()*0.3);
          const vy = (Math.random()*2-1)*24;
          bullets.push(new FastBullet(x, y0 + i*8, vx, vy));
        }
      }

      // リング
      t.ring += dt;
      if (t.ring >= every.ring) {
        t.ring = 0;
        const cx = 80 + Math.random()*(W-160);
        const cy = 80 + Math.random()*(H-160);
        const n  = 24;
        const spd= 130;
        for(let i=0;i<n;i++){
          const a = (i/n)*Math.PI*2;
          bullets.push(new NormalBullet(cx, cy, Math.cos(a)*spd, Math.sin(a)*spd));
        }
      }

      // 巨大漢字弾
      t.kanji += dt;
      if (t.kanji >= every.kanji) {
        t.kanji = 0;
        const x = 40 + Math.random()*(W-80);
        bullets.push(new KanjiBullet(x, -20));
      }

      // 誘導弾
      t.homing += dt;
      if (t.homing >= every.homing) {
        t.homing = 0;
        const edge = (Math.random()*4)|0;
        let x=0,y=0;
        if (edge===0){ x=Math.random()*W; y=-10; }
        if (edge===1){ x=W+10; y=Math.random()*H; }
        if (edge===2){ x=Math.random()*W; y=H+10; }
        if (edge===3){ x=-10; y=Math.random()*H; }
        bullets.push(new HomingBullet(x,y));
      }
    }
  };
}
