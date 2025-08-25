// js/rank.js — ランキング（GAS）本番実装＋検出/保存ヘルパ

export async function detectRankEndpoint() {
  // 1) 明示上書き（index.html で window.RANK_ENDPOINT をセットしていれば優先）
  const over = (globalThis.RANK_ENDPOINT && String(globalThis.RANK_ENDPOINT).trim()) || "";
  if (over) return over;

  // 2) config/game.json から取得（V でキャッシュ破り）
  const v = encodeURIComponent(globalThis.V || Date.now());
  try {
    const r = await fetch(`./config/game.json?v=${v}`, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const cfg = await r.json();
    return (cfg?.rankApi?.endpoint || "").trim();
  } catch {
    return "";
  }
}

export class Rank {
  constructor(endpoint) {
    this.endpoint = String(endpoint || "").trim();
    this.enabled  = !!this.endpoint;
  }
  async top() {
    if (!this.enabled) return { status: "disabled", rows: [] };
    const r = await fetch(`${this.endpoint}?action=top`, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const arr = await r.json();
    return { status: "ok", rows: Array.isArray(arr) ? arr : [] };
  }
  async submit(name, score) {
    if (!this.enabled) return { status: "disabled" };
    const body = new URLSearchParams({
      name: String(name || "YOU").slice(0, 16),
      score: String(Math.max(0, score | 0)),
      _ua: navigator.userAgent.slice(0, 64)
    });
    const r = await fetch(this.endpoint, { method: "POST", body });
    if (!r.ok) return { status: "error", error: `HTTP ${r.status}` };
    const d = await r.json().catch(() => ({}));
    return d && d.ok ? { status: "ok" } : { status: "error", error: d?.error || "unknown" };
  }
}

// ローカル保存（名前／ベスト）
export const loadPlayerName = () => localStorage.getItem("playerName") || "";
export const savePlayerName = (n) => localStorage.setItem("playerName", String(n || "").slice(0, 16));
export const loadBest = () => Number(localStorage.getItem("bestScore") || "0") | 0;
export const saveBest = (v) => localStorage.setItem("bestScore", String(v | 0));

// 右上描画
export async function renderLeaderboard(rank, el) {
  if (!el) return;
  if (!rank?.enabled) { el.textContent = "未設定"; return; }
  el.textContent = "LOADING...";
  try {
    const { status, rows } = await rank.top();
    if (status !== "ok") { el.textContent = "通信エラー"; return; }
    const lines = rows.slice(0, 10).map((r, i) => {
      const no = String(i + 1).padStart(2, "0");
      const name = String(r.name || "").slice(0, 10).padEnd(10, " ");
      const sc = String(Number(r.score) || 0).padStart(6, " ");
      return `${no}. ${name}  ${sc}`;
    });
    el.textContent = lines.length ? lines.join("\n") : "まだスコアがありません";
  } catch (e) {
    console.error(e);
    el.textContent = "通信エラー";
  }
}
