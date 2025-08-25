// rank.js
export class RankClient {
  constructor(endpoint, V = "") {
    this.endpoint = endpoint || "";
    this.V = V;
    this.enabled = !!this.endpoint;
  }

  async getTop() {
    if (!this.enabled) return [];
    const url = `${this.endpoint}?action=top&v=${encodeURIComponent(this.V)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("rank top fetch failed");
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async submit({ name, score, ua = "" }) {
    if (!this.enabled) return { ok: false };
    const body = new URLSearchParams();
    body.set("name", String(name || "YOU").slice(0, 16));
    body.set("score", String(score | 0));
    body.set("_ua", ua.slice(0, 64));
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!res.ok) throw new Error("rank submit failed");
    return res.json().catch(() => ({ ok: true }));
  }
}
