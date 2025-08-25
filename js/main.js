// js/main.js (diagnostic-known-good)
// まず必ずタイトルを描画。以後、設定・BGM・弾生成を順次初期化。
// 画面左上の #diag に進捗ログを出します。

import { NormalBullet, FastBullet, HomingBullet, KanjiBullet, loadBulletSprites } from "./bullets.js";
import * as SpawnerMod from "./spawner.js";
import { Rank, renderLeaderboard, loadPlayerName, savePlayerName, loadBest, saveBest } from "./rank.js";

const W=960, H=540, TITLE="title", PLAY="play", OVER="over";
const DEBUG=new URL(location.href).searchParams.has("debug");
const BUILD_V=(globalThis.V ?? "dev");

// ---- diag logger ----
const diagEl = document.getElementById("diag") || (()=>{const p=document.createElement("pre");p.id="diag";document.body.appendChild(p);return p;})();
function log(msg){ try{ diagEl.textContent += `\n${msg}`; }catch{} }

// ---- DOM / Canvas ----
let canvas, ctx, elLeaderboard;
function fit(){ if(!canvas) return; const s=Math.min(innerWidth/W, innerHeight/H); canvas.style.width=`${(W*s)|0}px`; canvas.style.height=`${(H*s)|0}px`; }

await (document.readyState==="loading" ? new Promise(r=>document.addEventListener("DOMContentLoaded", r, {once:true})) : null);

canvas = document.getElementById("g");
if(!canvas){ canvas=document.createElement("canvas"); canvas.id="g"; canvas.width=W; canvas.height=H; (document.getElementById("stage")||document.body).appendChild(canvas); }
ctx = canvas.getContext("2d");
elLeaderboard = document.getElementById("ui-leaderboard") || (()=>{const p=document.createElement("pre");p.id="ui-leaderboard";p.textContent="未設定"; (document.getElementById("stage")||document.body).appendChild(p); return p;})();
addEventListener("resize", fit); fit();

log(`V=${BUILD_V} | DOM ok | ctx=${!!ctx}`);

// ---- 即・タイトルを描画（ここで何も出ない場合はCanvas/描画問題）----
function drawImmediateTitle(){
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#0b1020"); g.addColorStop(1,"#101a35");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.textBaseline="middle";
  ctx.font="48px Orbitron, sans-serif";
  ctx.fillText("TAMAYOKE 2", W/2, H*0.36);
  ctx.font="18px Noto Sans JP, sans-serif";
  ctx.fillText("クリック／Enter でスタート", W/2, H*0.36+56);
}
drawImmediateTitle();

// ---- 入力 ----
const keys=new Set(); let pointerDown=false, pointerX=W/2, pointerY=H*0.75;
addEventListener("keydown",e=>{ if(!e.repeat) keys.add(e.key); if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault(); });
addEventListener("keyup",e=>keys.delete(e.key));
function cpos(e){ const r=canvas.getBoundingClientRect(); return {x:(e.clientX-r.left)*W/r.width, y:(e.clientY-r.top)*H/r.height}; }
canvas.addEventListener("pointerdown",e=>{ pointerDown=true; const p=cpos(e); pointerX=p.x; pointerY=p.y; unlockAudio(); });
addEventListener("pointerup",()=> pointerDown=false);
canvas.addEventListener("pointermove",e=>{ if(!pointerDown) return; const p=cpos(e); pointerX=p.x; pointerY=p.y; });

// ---- Config ----
let config=null;
async function loadConfig(){
  const q = DEBUG ? `?v=${Math.random()}` : `?v=${encodeURIComponent(BUILD_V)}`;
  const r = await fetch(`./config/game.json${q}`, { cache:"no-store" });
  if(!r.ok) throw new Error(`config HTTP ${r.status}`);
  return await r.json();
}

// ---- Audio ----
let AC=null, masterGain=null;
const bgm={ current:null,next:null,tracks:new Map(),crossfadeMs:400 };
function makeAC(){ AC = new (window.AudioContext||window.webkitAudioContext)(); masterGain=AC.createGain(); masterGain.connect(AC.destination); }
async function decodeToBuffer(url){ const res=await fetch(url,{cache:"force-cache"}); const ab=await res.arrayBuffer(); return await AC.decodeAudioData(ab); }
async function prepareBgmFromConfig(cfg){
  if(!cfg?.audio?.bgm) return;
  bgm.crossfadeMs = Math.max(0, cfg.audio.crossfadeMs ?? 400);
  for(const [k,s] of Object.entries(cfg.audio.bgm)){
    const src=s.src||s.url||s.file; if(!src) continue;
    bgm.tracks.set(k,{src,loopStart:+(s.loopStart??0),loopEnd:+(s.loopEnd??0),buf:null});
  }
}
async function ensureTrackBuffer(key){ const t=bgm.tracks.get(key); if(!t) return null; if(t.buf) return t.buf; t.buf=await decodeToBuffer(t.src); return t.buf; }
function startLoopingSource(buffer,ls,le){ const src=AC.createBufferSource(); src.buffer=buffer; src.loop=true; if(le>ls){src.loopStart=ls;src.loopEnd=le;} const g=AC.createGain(); g.gain.value=0; src.connect(g).connect(masterGain); src.start(0); return {node:src,gain:g}; }
async function crossfadeTo(key){
  if(!AC||AC.state!=="running"||!bgm.tracks.has(key)||bgm.current?.key===key) return;
  const buf=await ensureTrackBuffer(key); if(!buf) return;
  const {loopStart=0,loopEnd=0}=bgm.tracks.get(key);
  const nxt=startLoopingSource(buf,loopStart,loopEnd); bgm.next={key,...nxt};
  const dur=Math.max(0.01,bgm.crossfadeMs/1000), now=AC.currentTime;
  bgm.next.gain.gain.setValueAtTime(0,now); bgm.next.gain.gain.linearRampToValueAtTime(1, now+dur);
  if(bgm.current){ const c=bgm.current; c.gain.gain.setValueAtTime(c.gain.gain.value,now); c.gain.gain.linearRampToValueAtTime(0, now+dur); setTimeout(()=>{try{c.node.stop();}catch{}}, bgm.crossfadeMs+50); }
  bgm.current=bgm.next; bgm.next=null;
}
let audioUnlocked=false; async function unlockAudio(){ if(audioUnlocked) return; if(!AC) makeAC(); try{ await AC.resume(); audioUnlocked=(AC.state==="running"); }catch{} }

// ---- Rank ----
let rank=null;

// ---- Game state ----
const player={ x:W/2,y:H*0.8,size:24,hitR:10,speed:240,slow:0.5 };
let bullets=[], spawner=null, state=TITLE, allowReturnAt=0, score=0, timePlay=0, showDebug=DEBUG;
function difficultyMul(t, base=0.2, grow=0.8, timeToMax=120){ return Math.min(1, base + grow * Math.min(1, t/timeToMax)); }

// ---- Spawner（フォールバック内蔵）----
function createSpawnerAdapter(cfg){
  const Bullets={NormalBullet,FastBullet,HomingBullet,KanjiBullet};
  const S=SpawnerMod?.default || SpawnerMod?.Spawner || null;
  if (typeof S==="function") return new S({ Bullets, config: cfg });
  if (typeof SpawnerMod.createSpawner==="function") return SpawnerMod.createSpawner({ Bullets, config: cfg });
  let last={rain:0,side:0,ring:0,kanji:0,homing:0};
  return { update(dt,now){
    const s=cfg.spawns||{}, b=cfg?.tuning?.bulletSpeedScale ?? 1.0;
    function push(x){ if(x) bullets.push(x); }
    last.rain+=dt; if(last.rain>=(s.rainEvery??3.8)){ last.rain=0; const n=Math.max(8,Math.floor(14*difficultyMul(now))); for(let i=0;i<n;i++){ const x=(W/n)*(i+0.5), y=-10, v=90*(0.9+Math.random()*0.3)*b; push(new NormalBullet(x,y,0,v)); } }
    last.side+=dt; if(last.side>=(s.sideEvery??1.8)){ last.side=0; const left=Math.random()<0.5, y0=60+Math.random()*(H-120), c=Math.max(4,Math.floor(8*difficultyMul(now)));
      for(let i=0;i<c;i++){ const x=left?-10:W+10, vx=(left?140:-140)*(0.9+Math.random()*0.3)*b, vy=(Math.random()*2-1)*20; push(new FastBullet(x,y0+i*8,vx,vy)); } }
    last.ring+=dt; if(last.ring>=(s.ringEvery??9.0)){ last.ring=0; const cx=80+Math.random()*(W-160), cy=80+Math.random()*(H-160), n=24, spd=130*b;
      for(let i=0;i<n;i++){ const a=(i/n)*Math.PI*2; push(new NormalBullet(cx,cy,Math.cos(a)*spd,Math.sin(a)*spd)); } }
    last.kanji+=dt; if(last.kanji>=(s.kanjiEvery??5.0)){ last.kanji=0; push(new KanjiBullet(Math.random()*W,-20)); }
    last.homing+=dt; if(last.homing>=(s.homingEvery??4.5)){ last.homing=0; const e=Math.floor(Math.random()*4); let x=0,y=0; if(e===0){x=Math.random()*W;y=-10;} if(e===1){x=W+10;y=Math.random()*H;} if(e===2){x=Math.random()*W;y=H+10;} if(e===3){x=-10;y=Math.random()*H;} push(new HomingBullet(x,y)); }
  }};
}

// ---- Zones/Draw/Loop（省略なしでそのまま動作）----
function valAsPx(v,t){ if(v==null) return 0; if(v>0 && v<=1) return v*t; return v; }
function getZonesNow(t){ const zc=config?.zones||{}, safeH=valAsPx(zc.safeH??90,H), safeTop=H-safeH;
  const bm=config?.bonusMove||{}, cx=bm.cx??(W/2), cy=bm.cy??(H*0.45), R=bm.r??70, sp=bm.speed??0.6;
  const ang=t*sp, bx=cx+Math.cos(ang)*R, by=cy+Math.sin(ang)*R, br=bm.radius??48;
  return { safeTop, safeH, bonus:{x:bx,y:by,r:br} }; }
function inCircle(px,py,cx,cy,r){ const dx=px-cx, dy=py-cy; return dx*dx+dy*dy <= r*r; }

function enterTitle(){ state=TITLE; timePlay=0; bullets.length=0; crossfadeTo("title").catch(()=>{}); renderLeaderboard(rank, elLeaderboard).catch(()=>{}); }
function startGame(){ state=PLAY; timePlay=0; score=0; bullets.length=0; player.x=W/2; player.y=H*0.8; crossfadeTo("play").catch(()=>{}); }
function enterGameOver(){ state=OVER; allowReturnAt=performance.now()+700; bullets.length=0; crossfadeTo("title").catch(()=>{}); }

function drawBG(t){ const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#0b1020"); g.addColorStop(1,"#101a35"); ctx.fillStyle=g; ctx.fillRect(0,0,W,H); }
function drawZones(t){ const z=getZonesNow(t); ctx.fillStyle="rgba(20,200,120,0.10)"; ctx.fillRect(0,z.safeTop,W,z.safeH);
  const cols=config?.zones?.safeCols??0; if(cols>1){ ctx.strokeStyle="rgba(60,220,160,0.10)"; ctx.lineWidth=1; for(let i=1;i<cols;i++){ const x=(W/cols)*i; ctx.beginPath(); ctx.moveTo(x,z.safeTop); ctx.lineTo(x,H); ctx.stroke(); } }
  ctx.beginPath(); ctx.arc(z.bonus.x,z.bonus.y,z.bonus.r,0,Math.PI*2); ctx.fillStyle="rgba(250,210,60,0.12)"; ctx.fill();
  const bm=config?.bonusMove||{}, cx=bm.cx??(W/2), cy=bm.cy??(H*0.45), R=bm.r??70; ctx.strokeStyle="rgba(250,210,60,0.25)"; ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke(); }
function drawPlayer(){ ctx.save(); ctx.translate(player.x,player.y); ctx.fillStyle="#4cf"; const s=player.size; ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*0.7,0); ctx.lineTo(0,s); ctx.lineTo(-s*0.7,0); ctx.closePath(); ctx.fill(); ctx.strokeStyle="rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(0,0,player.hitR,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
function drawBullets(){ for(const b of bullets) b.draw?.(ctx); }
function drawScore(){ const s=String(score|0).padStart(6,"0"); ctx.font="20px Orbitron, monospace"; ctx.textAlign="right"; ctx.textBaseline="top"; ctx.fillStyle="#fff"; ctx.fillText(`SCORE  ${s}`, W-16, 12); }
function drawTitle(){ ctx.font="48px Orbitron, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle="#fff"; ctx.fillText("TAMAYOKE 2", W/2, H*0.36); ctx.font="18px Noto Sans JP, sans-serif"; ctx.fillText("クリック／Enter でスタート", W/2, H*0.36+56); }
function drawGameOver(){ ctx.font="46px Orbitron, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle="#ff9"; ctx.fillText("GAME OVER", W/2, H*0.35); ctx.font="18px Noto Sans JP, sans-serif"; ctx.fillStyle="#fff"; ctx.fillText("0.7秒後に クリック／Enter でタイトルへ", W/2, H*0.35+50); }
function drawDebugOverlay(t,fps,bc){ if(!DEBUG) return; ctx.font="12px monospace"; ctx.textAlign="left"; ctx.textBaseline="top"; ctx.fillStyle="rgba(255,255,255,0.85)"; const lines=[`V=${BUILD_V}  state=${state}`,`time=${t.toFixed(2)}  fps=${fps|0}`,`bullets=${bc}  score=${score|0}`]; let y=H-12*lines.length-8; for(const s of lines){ ctx.fillText(s,8,y); y+=12; } }

function updatePlayer(dt){
  let dx=0,dy=0;
  if(keys.has("ArrowLeft")||keys.has("a")||keys.has("A")) dx-=1;
  if(keys.has("ArrowRight")||keys.has("d")||keys.has("D")) dx+=1;
  if(keys.has("ArrowUp")||keys.has("w")||keys.has("W")) dy-=1;
  if(keys.has("ArrowDown")||keys.has("s")||keys.has("S")) dy+=1;
  if(pointerDown){ player.x+=(pointerX-player.x)*0.35; player.y+=(pointerY-player.y)*0.35; }
  else if(dx||dy){ const len=Math.hypot(dx,dy)||1; const slow=(keys.has("Shift")||keys.has(" "))?player.slow:1.0; const v=player.speed*slow; player.x+=(dx/len)*v*dt; player.y+=(dy/len)*v*dt; }
  player.x=Math.max(0,Math.min(W,player.x)); player.y=Math.max(0,Math.min(H,player.y));
}
function updateBullets(dt,now){ spawner?.update?.(dt,now); for(const b of bullets) b.update?.(dt,player);
  bullets=bullets.filter(b=>b.alive!==false && b.x>-40&&b.x<W+40 && b.y>-40&&b.y<H+40); }
function checkCollision(){ for(const b of bullets){ const br=(b.hitR??b.r??6), dx=b.x-player.x, dy=b.y-player.y; if(dx*dx+dy*dy <= (br+player.hitR)*(br+player.hitR)) return true; } return false; }

async function submitIfBest(finalScore){
  const prev=loadBest(); if((finalScore|0)<=prev) return;
  saveBest(finalScore|0);
  let name=loadPlayerName(); if(!name){ name=(prompt("名前（16文字まで）を入力してください","YOU")||"YOU").trim().slice(0,16); savePlayerName(name); }
  const res=await rank.submit(name, finalScore|0);
  if(res.status==="ok"){ renderLeaderboard(rank, elLeaderboard).catch(()=>{}); } else { console.warn("rank submit failed:", res.error); }
}

let prevTs=performance.now(), fps=60;
function loop(ts){
  const dt=Math.min(1/20, Math.max(0,(ts-prevTs)/1000)); prevTs=ts; fps=0.9*fps+0.1*(1/dt);

  if(state===TITLE){ if(keys.has("Enter")||pointerDown){ pointerDown=false; startGame(); } }
  else if(state===PLAY){
    timePlay+=dt; updatePlayer(dt); updateBullets(dt,timePlay);
    const z=getZonesNow(timePlay), inBonus=inCircle(player.x,player.y,z.bonus.x,z.bonus.y,z.bonus.r);
    score += (inBonus?4:1)*10*dt;
    if(checkCollision()){ const finalScore=score|0; submitIfBest(finalScore).catch(()=>{}); enterGameOver(); }
  } else if(state===OVER){ if((performance.now()>=allowReturnAt) && (keys.has("Enter")||pointerDown)){ pointerDown=false; enterTitle(); } }

  drawBG(timePlay); drawZones(timePlay);
  if(state===TITLE){ drawTitle(); } else if(state===PLAY){ drawBullets(); drawPlayer(); drawScore(); } else { drawBullets(); drawGameOver(); drawScore(); }
  drawDebugOverlay(timePlay,fps,bullets.length);

  requestAnimationFrame(loop);
}

// ---- Boot ----
(async function boot(){
  try{
    log("boot start");
    // ここまで来てタイトルが見えていれば、描画はOK

    // 設定ロード
    config = await loadConfig();
    log("config ok");

    // player調整
    if(config?.player){ player.size=config.player.size??player.size; player.hitR=config.player.hitR??player.hitR; player.speed=config.player.speed??player.speed; player.slow=config.player.slow??player.slow; }

    // ランキング
    rank = new Rank((config.rankApi && config.rankApi.endpoint) || "");
    renderLeaderboard(rank, elLeaderboard).catch(()=>{});
    log(`rank ${rank.enabled?"enabled":"disabled"}`);

    // Audio
    makeAC(); await prepareBgmFromConfig(config); log("audio ready");

    // スプライトは非同期で（表示は止めない）
    loadBulletSprites().then(()=>log("sprites loaded")).catch(e=>log("sprites ERR:"+e));

    // Spawner
    spawner = createSpawnerAdapter(config); log("spawner ready");

    // 状態開始＆ループ
    state = TITLE;
    requestAnimationFrame(loop);
    log("loop started");

    // デバッグトグル
    addEventListener("keydown",e=>{ if(e.key==="F2") showDebug=!showDebug; });

  }catch(err){
    console.error(err); log("BOOT ERROR: "+err.message);
    ctx.fillStyle="#fff"; ctx.font="16px monospace"; ctx.fillText("BOOT ERROR: "+err.message, 12, 20);
  }
})();
