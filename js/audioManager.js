// audioManager.js — 失敗を許容する安全実装（SFX未配置でも落ちない）
export class AudioManager {
  constructor(config) {
    this.cfg = config?.audio || {};
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    // 開始時点の音量
    const vol = this.cfg.volumes || {};
    this.masterGain = this.ctx.createGain();
    this.bgmGain    = this.ctx.createGain();
    this.sfxGain    = this.ctx.createGain();
    this.masterGain.gain.value = vol.master ?? 0.8;
    this.bgmGain.gain.value    = vol.bgm    ?? 0.7;
    this.sfxGain.gain.value    = vol.sfx    ?? 0.9;
    this.bgmGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.crossfadeSec = Math.max(0.05, (this.cfg.crossfadeMs ?? 400) / 1000);

    // バッファキャッシュ
    this.buffers = { bgm: {}, sfx: {} };

    // 現在鳴っているBGM
    this._bgmSrc = null;
    this._bgmGain = null;

    this.unlocked = (this.ctx.state === "running");
    // index.html / main.js 側から渡されるバージョン文字（キャッシュ無効化用）
    this.version = window.__APP_VERSION__ || "";
  }

  async unlock() {
    try { await this.ctx.resume(); this.unlocked = true; } catch { /* noop */ }
  }

  _withV(url) {
    if (!this.version) return url;
    return url + (url.includes("?") ? "&" : "?") + "v=" + this.version;
  }

  async _loadBuffer(srcList) {
    const list = Array.isArray(srcList) ? srcList : [srcList];
    for (const raw of list) {
      const url = this._withV(raw);
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const ab = await res.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(ab.slice(0));
        return buf;
      } catch (_e) {
        // 次候補へ（.oggが無ければ.mp3、どちらも無ければ最後にnull返す）
        continue;
      }
    }
    console.warn("[audio] load failed:", list.join("|"));
    return null;
  }

  async _getBgmBuffer(name) {
    if (this.buffers.bgm[name]) return this.buffers.bgm[name];
    const ent = this.cfg.bgm?.[name];
    if (!ent || !ent.src) return null;
    const buf = await this._loadBuffer(ent.src);
    this.buffers.bgm[name] = buf;
    return buf;
  }

  async _getSfxBuffer(name) {
    if (this.buffers.sfx[name]) return this.buffers.sfx[name];
    const srcs = this.cfg.sfx?.[name];
    if (!srcs) return null;
    const buf = await this._loadBuffer(srcs);
    this.buffers.sfx[name] = buf;
    return buf;
  }

  async playBgm(name) {
    try {
      const buf = await this._getBgmBuffer(name);
      if (!buf) { console.warn("[bgm] missing:", name); return; }

      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      // ループ点（0なら未指定として無視）
      const ent = this.cfg.bgm?.[name] || {};
      const ls = Number(ent.loopStart || 0);
      const le = Number(ent.loopEnd || 0);
      if (le > ls) { src.loopStart = ls; src.loopEnd = le; }

      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(this.bgmGain);
      src.start();

      // クロスフェード
      const fade = this.crossfadeSec;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(1, now + fade);

      if (this._bgmGain && this._bgmSrc) {
        this._bgmGain.gain.cancelScheduledValues(now);
        this._bgmGain.gain.setValueAtTime(this._bgmGain.gain.value, now);
        this._bgmGain.gain.linearRampToValueAtTime(0, now + fade);
        const old = this._bgmSrc;
        setTimeout(() => { try { old.stop(); } catch {} }, (fade + 0.1) * 1000);
      }

      this._bgmSrc = src;
      this._bgmGain = g;
    } catch (e) {
      console.warn("[bgm] play error:", name, e);
    }
  }

  async playSfx(name) {
    try {
      const buf = await this._getSfxBuffer(name);
      if (!buf) { console.warn("[sfx] missing:", name); return; }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.sfxGain);
      src.start();
    } catch (e) {
      console.warn("[sfx] play error:", name, e);
    }
  }
}
