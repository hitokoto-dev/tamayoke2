// js/main.js — 2ファイルで完結：必ず起動・必ず送信（初回）・TOP10表示
// 依存：グローバル window.RANK_ENDPOINT のみ（index.htmlで直書き）

const W = 960, H = 540;
const TITLE="title", PLAY="play", OVER="over";
const BUILD_V = globalThis.V ?? "dev";
const DEBUG = new URL(location.href).searchParams.has("debug");

// ---------- DOM ----------
await (document.readyState==="loading"
  ? new Promise(r=>document.addEventListener("DOMContentLoaded",r,{once:true}))
  : 0);

const canvas = document.getElementById("g");
if (!canvas) throw new Error("#g canvas not found");
const ctx = canvas.getContext("2d");
function fit(){ const s=Math.min(innerWidth/W, innerHeight/H); canvas.style.width=`${(W*s)|0}px`; canvas.style.height=`${(H*s)|0}px`; }
addEventListener("resize", fit); fit();
const elLeaderboard = document.getElementById("ui-leaderboard");

// ---------- ランキング（このファイル内に完結） ----------
class Rank {
  constructor(endpoint){ this.endpoint=String(endpoint||"").trim(); this.enabled=!!this.endpoint; }
  async top(){
    if(!this.enabled) return {status:"disabled", rows:[]};
    const r=await fetch(`${this.endpoint}?action=top`, {cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const arr = await r.json();
    return {status:"ok", rows: Array.isArray(arr)?arr:[]};
  }
  async submit(name, score){
    if(!this.enabled) return {status:"disabled"};
    const body = new URLSearchParams({
      name: String(name||"YOU").slice(0,16),
      score: String(Math.max(0, score|0)),
      _ua: navigator.userAgent.slice(0,64)
    });
    const r = await fetch(this.endpoint, {method:"POST", body});
    if(!r.ok) return {status:"error", error:`HTTP ${r.status}`};
    const d = await r.json().catch(()=>({}));
    return d && d.ok ? {status:"ok"} : {status:"error", error:d?.error||"unknown"};
  }
}
// 右上描画
async function renderLeaderboard(rank){
  if(!elLeaderboard) return;
  if(!rank.enabled){ elLeaderboard.textContent="未設定"; return; }
  elLeaderboard.textContent = "LOADING...";
  try{
    const {status, rows} = await rank.top();
    if(status!=="ok"){ elLeaderboard.textContent="通信エラー"; return; }
    const lines = rows.slice(0,10).map((r,i)=>{
      const no=String(i+1).padStart(2,"0");
      const name=String(r.name||"").slice(0,10).padEnd(10," ");
      const sc=String(Number(r.score)||0).padStart(6," ");
      return `${no}. ${name}  ${sc}`;
    });
    elLeaderboard.textContent = lines.length ? lines.join("\n") : "まだスコアがありません";
  }catch(e){ console.error(e); elLeaderboard.textContent="通信エラー"; }
}

// ローカル保存
const loadPlayerName = () => localStorage.getItem("playerName") || "";
const savePlayerName = n => localStorage.setItem("playerName", String(n||"").slice(0,16));
const loadBest = () => Number(localStorage.getItem("bestScore")||"0")|0;
const saveBest = v => localStorage.setItem("bestScore", String(v|0));

// ---------- 入力 ----------
const keys=new Set(); let pointerDown=false, pointerX=W/2, pointerY=H*0.75;
addEventListener("keydown",e=>{ if(!e.repeat) keys.add(e.key); if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault(); if(e.key==="F2") showDebug=!showDebug; });
addEventListener("keyup",e=>keys.delete(e.key));
function cpos(e){ const r=canvas.getBoundingClientRect(); return {x:(e.clientX-r.left)*W/r.width, y:(e.clientY-r.top)*H/r.height}; }
canvas.addEventListener("pointerdown",e=>{ pointerDown=true; const p=cpos(e); pointerX=p.x; pointerY=p.y; });
addEventListener("pointerup",()=> pointerDown=false);
canvas.addEventListener("pointermove",e=>{ if(!pointerDown) return; const p=cpos(e); pointerX=p.x; pointerY=p.y; });

// ---------- ゲーム状態 ----------
const player={ x:W/2,y:H*0.8,size:24,hitR:10,speed:240,slow:0.5 };
let bullets=[], state=TITLE, allowReturnAt=0, timePlay=0, score=0, showDebug=DEBUG;

// 簡易弾（安定重視・フォールバック描画）
const timers={ rain:0, side:0, ring:0, homing:0 };
function spawn(dt){
  timers.rain+=dt; timers.side+=dt; timers.ring+=dt; timers.homing+=dt;

  if(timers.rain>=0.16){ timers.rain=0;
    const x = 20 + Math.random()*(W-40);
    bullets.push({type:"white",x,y:-10,vx:0,vy:130+Math.random()*50,r:6,alive:true});
  }
  if(timers.side>=1.2){ timers.side=0;
    const L=Math.random()<0.5, y0=60+Math.random()*(H-220);
    for(let i=0;i<6;i++){
      bullets.push({type:"red",x:L?-10:W+10,y:y0+i*10,vx:L?160:-160,vy:(Math.random()*2-1)*20,r:5,alive:true});
    }
  }
  if(timers.ring>=2.6){ timers.ring=0;
    const cx=80+Math.random()*(W-160), cy=80+Math.random()*(H-220), n=18, spd=120;
    for(let i=0;i<n;i++){ const a=i/n*Math.PI*2; bullets.push({type:"white",x:cx,y:cy,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,r:6,alive:true}); }
  }
  if(timers.homing>=3.8){ timers.homing=0;
    const edge=(Math.random()*4)|0; let x=0,y=0;
    if(edge===0){x=Math.random()*W;y=-10;} if(edge===1){x=W+10;y=Math.random()*H;} if(edge===2){x=Math.random()*W;y=H+10;} if(edge===3){x=-10;y=Math.random()*H;}
    // 初速度はプレイヤー方向へ
    const ang=Math.atan2(player.y-y, player.x-x); const v=140; 
    bullets.push({type:"blue",x,y,vx:Math.cos(ang)*v,vy:Math.sin(ang)*v,turnDeg:120,r:6,alive:true,homing:true});
  }
}
function update(dt){
  // プレイヤー移動
  let dx=0,dy=0;
  if(keys.has("ArrowLeft")||keys.has("a")||keys.has("A")) dx-=1;
  if(keys.has("ArrowRight")||keys.has("d")||keys.has("D")) dx+=1;
  if(keys.has("ArrowUp")||keys.has("w")||keys.has("W")) dy-=1;
  if(keys.has("ArrowDown")||keys.has("s")||keys.has("S")) dy+=1;
  if(pointerDown){ player.x+=(pointerX-player.x)*0.35; player.y+=(pointerY-player.y)*0.35; }
  else if(dx||dy){ const len=Math.hypot(dx,dy)||1; const v=player.speed*((keys.has("Shift")||keys.has(" "))?player.slow:1); player.x+=(dx/len)*v*dt; player.y+=(dy/len)*v*dt; }
  player.x=Math.max(0,Math.min(W,player.x)); player.y=Math.max(0,Math.min(H,player.y));

  // 弾
  spawn(dt);
  for(const b of bullets){
    if(b.homing){
      // 最大旋回角を制限しつつプレイヤー方向へ
      const angTo=Math.atan2(player.y-b.y, player.x-b.x);
      const cur =Math.atan2(b.vy,b.vx);
      const maxTurn=(b.turnDeg*Math.PI/180)*dt;
      let diff = angTo - cur; while(diff> Math.PI) diff-=Math.PI*2; while(diff<-Math.PI) diff+=Math.PI*2;
      diff=Math.max(-maxTurn,Math.min(maxTurn,diff));
      const next=cur+diff; const sp=Math.hypot(b.vx,b.vy)||140;
      b.vx=Math.cos(next)*sp; b.vy=Math.sin(next)*sp;
    }
    b.x+=b.vx*dt; b.y+=b.vy*dt;
    if(b.x<-60||b.x>W+60||b.y<-60||b.y>H+60) b.alive=false;
  }
  bullets=bullets.filter(b=>b.alive);

  // 当たり
  for(const b of bullets){
    const rr=(b.r+player.hitR), dx=b.x-player.x, dy=b.y-player.y;
    if(dx*dx+dy*dy<=rr*rr) return true;
  }
  return false;
}

// ---------- 描画 ----------
function drawBG(){
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#0b1020"); g.addColorStop(1,"#101a35");
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  // 下部セーフゾーン
  ctx.fillStyle="rgba(20,200,120,0.10)"; ctx.fillRect(0, H-90, W, 90);
}
function drawPlayer(){
  ctx.save(); ctx.translate(player.x,player.y);
  const s=player.size; ctx.fillStyle="#4cf";
  ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*0.7,0); ctx.lineTo(0,s); ctx.lineTo(-s*0.7,0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(0,0,player.hitR,0,Math.PI*2); ctx.stroke();
  ctx.restore();
}
function drawBullets(){ for(const b of bullets){ ctx.fillStyle = b.type==="red"?"#f55":b.type==="blue"?"#6cf":"#fff"; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); } }
function drawTitle(){ ctx.fillStyle="#fff"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font="48px Orbitron, sans-serif"; ctx.fillText("TAMAYOKE 2", W/2, H*0.36); ctx.font="18px Noto Sans JP, sans-serif"; ctx.fillText("クリック／Enter でスタート", W/2, H*0.36+56); }
function drawGameOver(){ ctx.font="46px Orbitron, sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle="#ff9"; ctx.fillText("GAME OVER", W/2, H*0.35); ctx.font="18px Noto Sans JP, sans-serif"; ctx.fillStyle="#fff"; ctx.fillText("0.7秒後に クリック／Enter でタイトルへ", W/2, H*0.35+50); }
function drawScore(){ const s=String(score|0).padStart(6,"0"); ctx.font="20px Orbitron, monospace"; ctx.textAlign="right"; ctx.textBaseline="top"; ctx.fillStyle="#fff"; ctx.fillText(`SCORE  ${s}`, W-16, 12); }
function drawDebug(){ if(!showDebug) return; ctx.font="12px monospace"; ctx.textAlign="left"; ctx.textBaseline="top"; ctx.fillStyle="rgba(255,255,255,0.85)"; ctx.fillText(`V=${BUILD_V} state=${state} bullets=${bullets.length}`, 8, H-20); }

// ---------- 送信（初回は必ず送信。以降はベストのみ） ----------
const SUBMITTED_KEY="rankSubmittedOnce";
let rank=null;
async function submitScore(finalScore){
  if(!rank?.enabled) return;
  const already = localStorage.getItem(SUBMITTED_KEY)==="1";
  const best = loadBest();
  const mustSubmit = !already;                 // ★初回は必ず送信
  const isBest = (finalScore|0) > best;

  if(!mustSubmit && !isBest) return;
  if(isBest) saveBest(finalScore|0);

  let name = loadPlayerName();
  if(!name){ name=(prompt("名前（16文字まで）を入力してください","YOU")||"YOU").trim().slice(0,16); savePlayerName(name); }

  const prev = elLeaderboard.textContent;
  elLeaderboard.textContent = "SUBMITTING...";
  const res = await rank.submit(name, finalScore|0);
  if(res.status==="ok"){ localStorage.setItem(SUBMITTED_KEY,"1"); await renderLeaderboard(rank); }
  else { console.error(res.error||"submit failed"); elLeaderboard.textContent = prev || "通信エラー"; }
}

// ---------- ループ ----------
let prevTs=performance.now();
function loop(ts){
  const dt=Math.min(1/20, Math.max(0,(ts-prevTs)/1000)); prevTs=ts;

  if(state===TITLE){
    if(keys.has("Enter")||pointerDown){ pointerDown=false; state=PLAY; timePlay=0; score=0; bullets.length=0; }
  }else if(state===PLAY){
    timePlay+=dt;
    // ボーナスは後で戻せるように、ひとまず固定加点
    score += 10*dt;
    const hit = update(dt);
    if(hit){ const finalScore=score|0; submitScore(finalScore).catch(()=>{}); state=OVER; allowReturnAt=performance.now()+700; bullets.length=0; }
  }else if(state===OVER){
    if(performance.now()>=allowReturnAt && (keys.has("Enter")||pointerDown)){ pointerDown=false; state=TITLE; }
  }

  drawBG();
  if(state===TITLE){ drawTitle(); } else if(state===PLAY){ drawBullets(); drawPlayer(); drawScore(); } else { drawBullets(); drawGameOver(); drawScore(); }
  drawDebug();
  requestAnimationFrame(loop);
}

// ---------- 起動 ----------
let showDebug=DEBUG;
(async function boot(){
  // ランキング：index.htmlで直書きした endpoint を使用
  rank = new Rank(globalThis.RANK_ENDPOINT);
  await renderLeaderboard(rank);
  requestAnimationFrame(loop);
})();
