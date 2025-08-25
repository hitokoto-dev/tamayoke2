// js/rank.js（GAS未設定でも安全に動く最小実装）
export class Rank {
  constructor(endpoint){ this.endpoint=(endpoint||"").trim(); this.enabled=!!this.endpoint; }
  async top(){ if(!this.enabled) return {status:"disabled",rows:[]};
    const r=await fetch(`${this.endpoint}?action=top`,{cache:"no-store"});
    if(!r.ok) throw new Error(`HTTP ${r.status}`); const data=await r.json();
    return {status:"ok", rows:Array.isArray(data)?data:[]};
  }
  async submit(name,score){ if(!this.enabled) return {status:"disabled"};
    const body=new URLSearchParams({name:String(name||"YOU").slice(0,16),score:String(Math.max(0,score|0)),_ua:navigator.userAgent.slice(0,64)});
    const r=await fetch(this.endpoint,{method:"POST",body}); if(!r.ok) return {status:"error",error:`HTTP ${r.status}`};
    const d=await r.json().catch(()=>({})); return d&&d.ok?{status:"ok"}:{status:"error",error:d?.error||"unknown"}; }
}
export function loadPlayerName(){ return localStorage.getItem("playerName")||""; }
export function savePlayerName(n){ localStorage.setItem("playerName", String(n||"").slice(0,16)); }
export function loadBest(){ return Number(localStorage.getItem("bestScore")||"0")|0; }
export function saveBest(v){ localStorage.setItem("bestScore", String(v|0)); }
export function formatRows(rows){ return rows.map((r,i)=>`${String(i+1).padStart(2,"0")}. ${String(r.name||"").slice(0,10).padEnd(10," ")}  ${String(r.score|0).padStart(6," ")}`); }
export async function renderLeaderboard(rank, el){ if(!el) return; el.textContent="LOADING..."; if(!rank.enabled){ el.textContent="未設定"; return; }
  try{ const {status,rows}=await rank.top(); if(status!=="ok"){ el.textContent="通信エラー"; return; }
    const lines=formatRows(rows); el.textContent=lines.length?lines.join("\n"):"まだスコアがありません";
  }catch(e){ console.error(e); el.textContent="通信エラー"; } }
