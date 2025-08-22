// rank.js — Google Apps Script リーダーボード クライアント
export class RankClient {
  constructor(endpoint, version = "") {
    this.endpoint = endpoint || "";
    this.version = version;
  }
  get enabled() { return !!this.endpoint; }
  _withV(u) { return this.version ? (u + (u.includes("?") ? "&" : "?") + "v=" + this.version) : u; }

  async getTop() {
    if (!this.enabled) return [];
    const url = this._withV(this.endpoint + "?action=top");
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      const data = await res.json();
      // 期待フォーマット: [ {name, score, date}, ... ]
      if (Array.isArray(data)) return data.slice(0, 10);
      if (Array.isArray(data?.rows)) return data.rows.slice(0, 10);
      return [];
    } catch (e) {
      console.warn("[rank] getTop failed:", e);
      return [];
    }
  }

  async submit({ name, score, ua = "" }) {
    if (!this.enabled) return { ok: false, reason: "endpoint missing" };
    try {
      const body = new URLSearchParams();
      body.set("name", String(name || "").slice(0, 16));
      body.set("score", String(Math.max(0, Math.floor(score || 0))));
      body.set("_ua", String(ua || "").slice(0, 64));
      const res = await fetch(this._withV(this.endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      const data = await res.json().catch(() => ({}));
      return { ok: !!data?.ok };
    } catch (e) {
      console.warn("[rank] submit failed:", e);
      return { ok: false, reason: String(e) };
    }
  }
}
