// js/bullets.js — normal / fast / homing / kanji + スプライト（無ければフォールバック描画）

const SPRITES = new Map();
let CFG = { homingTurnDeg: 120, kanjiTurnDeg: 60, baseSpeedMul: 1.0 };

// 外部から調整
export function setBulletConfig(cfg) {
  CFG = {
    homingTurnDeg: cfg?.homingTurnDeg ?? 120,
    kanjiTurnDeg : cfg?.kanjiTurnDeg  ??  60,
    baseSpeedMul : cfg?.tuning?.bulletSpeedScale ?? 1.0
  };
}

export async function loadBulletSprites() {
  const list = [
    ["white","assets/bullets/white.png"],
    ["red","assets/bullets/red.png"],
    ["blue","assets/bullets/blue.png"],
    ["kanji","assets/bullets/kanji.png"]
  ];
  await Promise.all(list.map(([key, url]) => loadImage(url).then(img => SPRITES.set(key,img)).catch(()=>{})));
}
function loadImage(url){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; }); }

function drawSpriteOrCircle(ctx, key, x, y, r, tint) {
  const sp = SPRITES.get(key);
  if (sp) {
    const s = r*2;
    ctx.drawImage(sp, x - r, y - r, s, s);
  } else {
    ctx.fillStyle = tint || "#fff";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }
}

export class NormalBullet {
  constructor(x,y,vx,vy){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.r=6; this.alive=true; }
  update(dt){ this.x+=this.vx*dt*CFG.baseSpeedMul; this.y+=this.vy*dt*CFG.baseSpeedMul; }
  draw(ctx){ drawSpriteOrCircle(ctx, "white", this.x, this.y, this.r, "#fff"); }
}

export class FastBullet {
  constructor(x,y,vx,vy){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.r=5; this.alive=true; }
  update(dt){ this.x+=this.vx*dt*CFG.baseSpeedMul*1.25; this.y+=this.vy*dt*CFG.baseSpeedMul*1.25; }
  draw(ctx){ drawSpriteOrCircle(ctx, "red", this.x, this.y, this.r, "#f55"); }
}

export class HomingBullet {
  constructor(x,y,vx=0,vy=0){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.speed=140; this.r=6; this.alive=true; }
  update(dt, player){
    // 速度ベクトルをプレイヤー方向へ最大角速度内で回転
    const ax = player.x - this.x, ay = player.y - this.y;
    const angTo = Math.atan2(ay, ax);
    const cur   = Math.atan2(this.vy, this.vx);
    const maxTurn = (CFG.homingTurnDeg*Math.PI/180) * dt;
    let diff = normalizeAngle(angTo - cur);
    diff = Math.max(-maxTurn, Math.min(maxTurn, diff));
    const next = cur + diff;
    const v = this.speed * CFG.baseSpeedMul;
    this.vx = Math.cos(next) * v;
    this.vy = Math.sin(next) * v;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
  draw(ctx){ drawSpriteOrCircle(ctx, "blue", this.x, this.y, this.r, "#6cf"); }
}

export class KanjiBullet {
  constructor(x,y){ this.x=x; this.y=y; this.vx=0; this.vy=90; this.r=24; this.alive=true; this.speed=110; this.kanji=randomKanji(); }
  update(dt, player){
    // 緩やか追尾
    const ax = player.x - this.x, ay = player.y - this.y;
    const angTo = Math.atan2(ay, ax);
    const cur   = Math.atan2(this.vy, this.vx);
    const maxTurn = (CFG.kanjiTurnDeg*Math.PI/180) * dt;
    let diff = normalizeAngle(angTo - cur);
    diff = Math.max(-maxTurn, Math.min(maxTurn, diff));
    const next = cur + diff;
    const v = this.speed * CFG.baseSpeedMul * 0.9;
    this.vx = Math.cos(next) * v;
    this.vy = Math.sin(next) * v;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
  draw(ctx){
    // 円背景＋漢字＋赤ルビ風
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
    drawSpriteOrCircle(ctx, "kanji", this.x, this.y, this.r, "#fff"); // スプライトがあれば描画
    ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.font = "bold 20px Noto Sans JP, sans-serif";
    ctx.fillText(this.kanji, 0, 2);
    ctx.fillStyle="#f55"; ctx.font = "10px Noto Sans JP, sans-serif";
    ctx.fillText("アツイ", 0, -this.r+10);
    ctx.restore();
  }
}

function normalizeAngle(a){ while(a> Math.PI) a-=Math.PI*2; while(a<-Math.PI)a+=Math.PI*2; return a; }
function randomKanji(){
  const list = "炎雷風水土空光闇心愛夢星竜鬼雷爆撃盾剣舞滅翔刹斬破球護撃弾忍舞華烈迅煌艦砲砕零冥極".split("");
  return list[(Math.random()*list.length)|0];
}
