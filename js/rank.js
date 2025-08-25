// js/rank.js
// Ranking service (GAS) helper: fetch top10 / submit on best
// UIは右側の枠（例: #ui-leaderboard）に簡易描画できます。

export class Rank {
  constructor(endpoint) {
    this.endpoint = (endpoint || "").trim();
    this.enabled = !!this.endpoint;
  }
  async top() {
    if (!this.enabled) return { status: "disabled", rows: [] };
    const r = await fetch(`${this.endpoint}?action=top`, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error("Bad response");
    // data: [{name, score, date}]
    return { status: "ok", rows: data };
  }
  async submit(name, score) {
    if (!this.enabled) return { status: "disabled" };
    const body = new URLSearchParams({
      name: String(name || "YOU").slice(0, 16),
      score: String(Math.max(0, score|0)),
      _ua: navigator.userAgent.slice(0, 64)
    });
    const r = await fetch(this.endpoint, { method: "POST", body });
    if (!r.ok) return { status: "error", error: `HTTP ${r.status}` };
    const data = await r.json().catch(()=> ({}));
    return data && data.ok ? { status: "ok" } : { status: "error", error: data?.error || "unknown" };
  }
}

// ---- local profile (player name) ----
export function loadPlayerName() {
  return localStorage.getItem("playerName") || "";
}
export function savePlayerName(n) {
  localStorage.setItem("playerName", String(n || "").slice(0, 16));
}

// ---- best score (local) ----
export function loadBest() {
  return Number(localStorage.getItem("bestScore") || "0") | 0;
}
export function saveBest(v) {
  localStorage.setItem("bestScore", String(v|0));
}

// ---- formatting & UI helper ----
export function formatRows(rows) {
  // " 1. NAME_______   012345"
  return rows.map((r, i) => {
    const rank = String(i + 1).padStart(2, "0");
    const name = String(r.name || "").slice(0, 10).padEnd(10, " ");
    const score = String(r.score | 0).padStart(6, " ");
    return `${rank}. ${name}  ${score}`;
  });
}

/**
 * 右枠に描画するヘルパー（存在しなければ何もしない）
 * @param {Rank} rank
 * @param {HTMLElement|null} el
 */
export async function renderLeaderboard(rank, el) {
  if (!el) return;
  el.textContent = "LOADING...";
  if (!rank.enabled) {
    el.textContent = "未設定";
    return;
  }
  try {
    const { status, rows } = await rank.top();
    if (status !== "ok") {
      el.textContent = "通信エラー";
      return;
    }
    const lines = formatRows(rows);
    el.textContent = lines.length ? lines.join("\n") : "まだスコアがありません";
  } catch (err) {
    console.error(err);
    el.textContent = "通信エラー";
  }
}
