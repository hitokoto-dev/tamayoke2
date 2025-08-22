// Simple WebAudio manager with crossfade + loopStart/loopEnd + SFX ducking
export class AudioManager {
  constructor(config) {
    this.config = config;
    this.ctx = null;          // lazy-create on first user gesture
    this.master = null;
    this.bgmBus = null;
    this.sfxBus = null;
    this.currentBgm = null;   // { id, node, gain }
    this.buffers = new Map(); // key=url1|url2 -> AudioBuffer
    this.crossfade = (config.audio?.crossfadeMs ?? 400) / 1000;
  }

  /** Must be called from a user gesture (click/touch) at least once on mobile. */
  async unlock() {
    if (this.ctx && this.ctx.state === "running") return;
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // buses
      this.master = this.ctx.createGain();
      this.master.gain.value = this.config.audio?.volumes?.master ?? 0.8;
      this.master.connect(this.ctx.destination);

      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = this.config.audio?.volumes?.bgm ?? 0.5;
      this.bgmBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.config.audio?.volumes?.sfx ?? 0.9;
      this.sfxBus.connect(this.master);
    }
    if (this.ctx.state !== "running") {
      try { await this.ctx.resume(); } catch {}
    }
  }

  setVolumes({ master, bgm, sfx }) {
    if (!this.ctx) return;
    if (master != null) this.master.gain.value = master;
    if (bgm != null) this.bgmBus.gain.value = bgm;
    if (sfx != null) this.sfxBus.gain.value = sfx;
  }

  async _loadBuffer(urls) {
    const key = urls.join("|");
    if (this.buffers.has(key)) return this.buffers.get(key);
    for (const u of urls) {
      try {
        const res = await fetch(u, { cache: "force-cache" });
        if (!res.ok) continue;
        const arr = await res.arrayBuffer();
        const buf = await (this.ctx || (await this.unlock(), this.ctx)).decodeAudioData(arr.slice(0));
        this.buffers.set(key, buf);
        return buf;
      } catch {}
    }
    throw new Error("Audio load failed: " + key);
  }

  /**
   * Play BGM by id defined in config.audio.bgm (normal|bonus|safe|gameover)
   * Crossfades from current.
   */
  async playBgm(id) {
    if (!this.config.audio?.bgm?.[id]) return;
    await this.unlock(); // ensure context exists
    const def = this.config.audio.bgm[id];
    const buf = await this._loadBuffer(def.src);
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const shouldLoop = typeof def.loop === "boolean" ? def.loop : (id !== "gameover");
    src.loop = shouldLoop;
    const ls = Math.max(0, def.loopStart || 0);
    const le = Math.max(0, def.loopEnd || 0);
    src.loopStart = shouldLoop ? ls : 0;
    src.loopEnd   = (shouldLoop && le > ls) ? le : buf.duration;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    src.connect(g).connect(this.bgmBus);
    src.start(now);

    // fade-in new
    g.gain.linearRampToValueAtTime(1, now + this.crossfade);

    // fade-out old
    if (this.currentBgm) {
      const { node, gain } = this.currentBgm;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + this.crossfade);
      node.stop(now + this.crossfade + 0.05);
    }
    this.currentBgm = { id, node: src, gain: g };

    // ensure one-shot stop for non-loop (gameover)
    if (!shouldLoop) src.stop(now + buf.duration + 0.02);
  }

  /**
   * Play SFX with light ducking on BGM.
   * urls = [".ogg", ".mp3"] or single url
   */
  async playSfx(urls, { duckDb = -4, attack = 0.02, release = 0.2 } = {}) {
    await this.unlock();
    const u = Array.isArray(urls) ? urls : [urls];
    const buf = await this._loadBuffer(u);
    const now = this.ctx.currentTime;

    // duck BGM
    const base = this.bgmBus.gain.value;
    const target = base * Math.pow(10, duckDb / 20);
    this.bgmBus.gain.cancelScheduledValues(now);
    this.bgmBus.gain.setValueAtTime(this.bgmBus.gain.value, now);
    this.bgmBus.gain.linearRampToValueAtTime(target, now + attack);
    this.bgmBus.gain.linearRampToValueAtTime(base, now + attack + release);

    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.connect(this.sfxBus);
    s.start(now);
  }
}

