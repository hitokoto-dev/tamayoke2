// js/main.js — フル実装（BGMクロスフェード／ランキング送信／弾幕／ゾーン／デバッグ）

import { NormalBullet, FastBullet, HomingBullet, KanjiBullet, setBulletConfig, loadBulletSprites } from "./bullets.js";
import { createSpawner } from "./spawner.js";
import { Rank, renderLeaderboard, detectRankEndpoint, loadPlayerName, savePlayerName, loadBest, saveBest } from "./rank.js";

const W=960, H=540;
const TITLE="title", PLAY="play", OVER="over";
const DEBUG = new URL(location.href).searchParams.has("debug");
const BUILD_V = (globalThis.V ?? "dev");

// ---------- DOM ----------
await (document.readyState==="loading" ? new Promise(r=>document.addEventListener("DOMContentLoaded",r,{once:true})) : 0);
const canvas = document.getElementById("g");
if(!canvas) throw new Error("#g canvas not found");
const ctx = canvas.getContext("2d");
const elLeaderboard = document.getElementById("ui-leaderboard");
function fit(){ const s=Math.min(innerWidth/W, innerHeight/H); canvas.style.width=`${(W*s)|0}px`; canvas.style.height=`${(H*s)|0}px`; }
addEventListener("resize",fit); fit();

// ---------- 入力 ----------
const keys=new Set(); let pointerDown=false, pointerX=W/2, pointerY=H*0.75;
addEventListener("keydown",e=>{ if(!e.repeat) keys.add(e.key); if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault(); if(e.key==="F2") showDebug=!showDebug; });
addEventListener("keyup",e=>keys.delete(e.key));
function cpos(e){ const r=canvas.getBoundingClientRect(); return {x:(e.clientX-r.left)*W/r.width, y:(e.clientY-r.top)*H/r.height}; }
canvas.addEventListener("pointerdown",e=>{ pointerDown=true; const p=cpos(e); pointerX=p.x; pointerY=p.y; unlockAudio(); });
addEventListener("pointerup",()=> pointerDown=false);
canvas.addEventListener("pointermove",e=>{ if(!pointerDown) return; const p=cpos(e); pointerX=p.x; pointerY=p.y; });

// ---------- コンフィグ ----------
let config=null;
async function loadConfig(){
  const bust=`?v=${encodeURIComponent(BUILD_V)}`
  const r=await fetch(`./config/game.json${bust}`,{cache:"no-store"});
  if(!r.ok) throw new Error(`config HTTP ${r.status}`);
  return await r.json();
}

// ---------- オーディオ（クロスフェード＆モバイル解錠） ----------
let AC=null, masterGain=null;
const bgm={current:null,next:null,tracks:new Map(),crossfadeMs:400};
function makeAC(){ AC=new (window.AudioContext||window.webkitAudioContext)(); masterGain=AC.createGain(); masterGain.connect(AC.destination); }
async function decodeToBuffer(url){ const res=await fetch(url,{cache:"force-cache"}); const ab=await res.arrayBuffer(); return await AC.decodeAudioData(ab); }
async function prepareBgmFromConfig(cfg){
  const bgc = cfg?.audio?.bgm; if(!bgc) return;
  bgm.crossfadeMs = Math.max(0, cfg?.audio?.crossfadeMs ?? 400);
  for(const [key,s] of Object.entries(bgc)){
    const src = s.src || s.url || s.file; if(!src) continue;
    bgm.tracks.set(key,{src,loopStart:+(s.loopStart??0),loopEnd:+(s.loopEnd??0),buf:null});
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
  bgm.next.gain.gain.setValueAtTime(0,now); bgm.next.gain.gain.linearRampToValueAtTime(1,now+dur);
  if(bgm.current){ const c=bgm.current; c.gain.gain.setValueAtTime(c.gain.gain.value,now); c.gain.gain.linearRampToValueAtTime(0,now+dur); setTimeout(()=>{try{c.node.stop();}catch{}},bgm.crossfadeMs+50); }
  bgm.current=bgm.next; bgm.next=null;
}
let audioUnlocked=false;
async function unlockAudio(){ if(audioUnlocked) return; if(!AC) makeAC(); try{ await AC.resume(); audioUnlocked=(AC.state==="running"); }catch{} }

// ---------- 弾幕／ゾーン ----------
const player={ x:W/2,y:H*0.8,size:24,hitR:10,speed:240,slow:0.5 };
let bullets=[], spawner=null;
let state=TITLE, allowReturnAt=0, timePlay=0, score=0, showDebug=DEBUG;

function valAsPx(v,t){ if(v==null) return 0; if(v>0 && v<=1) return v*t; return v; }
function getZonesNow(t){
  const zc=config?.zones||{}, safeH=valAsPx(zc.safeH??90,H), safeTop=H-safeH;
  const bm=config?.bonusMove||{}, cx=bm.cx??(W/2), cy=bm.cy??(H*0.45), R=bm.r??70, sp=bm.speed??0.6;
  const ang=t*sp, bx=cx+Math.cos(ang)*R, by=cy+Math.sin(ang)*R, br=bm.radius??48;
  return { safeTop, safeH, bonus:{x:bx,y:by,r:br} };
}
function inCircle(px,py,cx,cy,r){ const dx=px-cx, dy=py-cy; return dx*dx+dy*dy <= r*r; }

function drawBG(t){
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#0b1020"); g.addColorStop(1,"#101a35"); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
}
function drawZones(t){
  const z=getZonesNow(t);
  ctx.fillStyle="rgba(20,200,120,0.10)"; ctx.fillRect(0,z.safeTop,W,z.safeH);
  const cols=config?.zones?.safeCols??0;
  if(cols>1){ ctx.strokeStyle="rgba(60,220,160,0.10)"; for(let i=1;i<cols;i++){ const x=(W/cols)*i; ctx.beginPath(); ctx.moveTo(x,z.safeTop); ctx.lineTo(x,H); ctx.stroke(); } }
  ctx.beginPath(); ctx.arc(z.bonus.x,z.bonus.y,z.bonus.r,0,Math.PI*2); ctx.fillStyle="rgba(250,210,60,0.12)"; ctx.fill();
  const bm=config?.bonusMove||{}, cx=bm.cx??(W/2), cy=bm.cy??(H*0.45), R=bm.r??70; ctx.strokeStyle="rgba(250,210,60,0.25)"; ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();
}
function drawPlayer(){
  ctx.save(); ctx.translate(player.x,player.y);
  const s=player.size; ctx.fillStyle="#4cf";
  ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*0.7,0); ctx.lineTo(0,s); ctx.lineTo(-s*0.7,0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(0,0,player.hitR,0,Math.PI*2); ctx.stroke();
  ctx.restore();
}
function drawBullets(){ for(const b of bullets) b.draw?.(ctx); }
function drawScore(){ const s=String(score|0).padStart(6,"0"); ctx.font="20px Orbitron, monospace"; ctx.textAlign="right"; ctx.textBaseline="top"; ctx.fillStyle="#fff"; ctx.fillText(`SCORE  ${s}`, W-16, 12); }
function drawTitle(){ ctx.font="48px Orbitron, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle="#fff"; ctx.fillText("TAMAYOKE 2", W/2, H*0.36); ctx.font="18px Noto Sans JP, sans-serif"; ctx.fillText("クリック／Enter でスタート", W/2, H*0.36+56); }
function drawGameOver(){ ctx.font="46px Orbitron, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle="#ff9"; ctx.fillText("GAME OVER", W/2, H*0.35); ctx.font="18px Noto Sans JP, sans-serif"; ctx.fillStyle="#fff"; ctx.fillText("0.7秒後に クリック／Enter でタイトルへ", W/2, H*0.35+50); }

// ---------- 更新 ----------
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
function updateBullets(dt, now){ spawner?.update?.(dt, now, bullets, W, H); for(const b of bullets) b.update?.(dt,player);
  bullets=bullets.filter(b=>b.alive!==false && b.x>-60&&b.x<W+60 && b.y>-60&&b.y<H+60); }
function checkCollision(){ for(const b of bullets){ const br=(b.hitR??b.r??6), dx=b.x-player.x, dy=b.y-player.y; if(dx*dx+dy*dy <= (br+player.hitR)*(br+player.hitR)) return true; } return false; }

// ---------- ランキング ----------
let rank=null;
const SUBMITTED_KEY="rankSubmittedOnce";
async function submitIfNeeded(finalScore){
  if(!rank?.enabled) return;
  const already = localStorage.getItem(SUBMITTED_KEY)==="1";
  const best = loadBest();
  const mustSubmit = !already;              // 初回は必ず送信
  const isBest = (finalScore|0) > best;
  if(!mustSubmit && !isBest) return;
  if(isBest) saveBest(finalScore|0);

  let name = loadPlayerName();
  if(!name){ name=(prompt("名前（16文字まで）を入力してください","YOU")||"YOU").trim().slice(0,16); savePlayerName(name); }

  const res = await rank.submit(name, finalScore|0);
  if(res.status==="ok"){ localStorage.setItem(SUBMITTED_KEY,"1"); await renderLeaderboard(rank, elLeaderboard); }
}

// ---------- ループ ----------
let prevTs=performance.now();
function loop(ts){
  const dt=Math.min(1/20, Math.max(0,(ts-prevTs)/1000)); prevTs=ts;

  if(state===TITLE){
    if(keys.has("Enter")||pointerDown){ pointerDown=false; state=PLAY; timePlay=0; score=0; bullets.length=0; crossfadeTo("play").catch(()=>{}); }
  }else if(state===PLAY){
    timePlay+=dt; updatePlayer(dt); updateBullets(dt,timePlay);
    const z=getZonesNow(timePlay); const inBonus=inCircle(player.x,player.y,z.bonus.x,z.bonus.y,z.bonus.r);
    score += (inBonus?4:1)*10*dt;
    if(checkCollision()){ const finalScore=score|0; submitIfNeeded(finalScore).catch(()=>{}); state=OVER; allowReturnAt=performance.now()+700; bullets.length=0; crossfadeTo("title").catch(()=>{}); }
  }else if(state===OVER){
    if((performance.now()>=allowReturnAt) && (keys.has("Enter")||pointerDown)){ pointerDown=false; state=TITLE; timePlay=0; bullets.length=0; }
  }

  drawBG(timePlay); drawZones(timePlay);
  if(state===TITLE){ drawTitle(); } else if(state===PLAY){ drawBullets(); drawPlayer(); drawScore(); } else { drawBullets(); drawGameOver(); drawScore(); }

  if(showDebug){ ctx.font="12px monospace"; ctx.textAlign="left"; ctx.textBaseline="top"; ctx.fillStyle="rgba(255,255,255,0.85)"; ctx.fillText(`V=${BUILD_V} state=${state} bullets=${bullets.length}`, 8, H-20); }
  requestAnimationFrame(loop);
}

// ---------- 起動 ----------
let showDebug=DEBUG;
(async function boot(){
  try{
    config = await loadConfig();

    // bullets & spawner
    setBulletConfig(config);
    await loadBulletSprites().catch(()=>{});
    spawner = createSpawner({ Bullets:{NormalBullet,FastBullet,HomingBullet,KanjiBullet}, config });

    // audio
    makeAC(); await prepareBgmFromConfig(config); crossfadeTo("title").catch(()=>{});

    // rank
    const ep = await detectRankEndpoint();
    rank = new Rank(ep);
    renderLeaderboard(rank, elLeaderboard).catch(()=>{});

    requestAnimationFrame(loop);
  }catch(err){
    console.error(err);
    ctx.fillStyle="#fff"; ctx.font="16px monospace";
    ctx.fillText("BOOT ERROR: "+err.message, 12, 20);
  }
})();
