(function () {
  "use strict";

  const CFG = window.STORY_CONFIG;
  const stage = document.getElementById("stage");
  const topChrome = document.getElementById("topChrome");
  const chapterCode = document.getElementById("chapterCode");
  const navBackBtn = document.getElementById("navBackBtn");
  const navForwardBtn = document.getElementById("navForwardBtn");
  const soundToggle = document.getElementById("soundToggle");
  const soundBars = document.getElementById("soundBars");
  const soundtrackTag = document.getElementById("soundtrackTag");
  const creatorBar = document.getElementById("creatorBar");

  function safeStorageGet(store, key) {
    try {
      return store ? store.getItem(key) : null;
    } catch (_) {
      return null;
    }
  }
  function safeStorageSet(store, key, val) {
    try {
      if (store) store.setItem(key, val);
    } catch (_) {}
  }

  // Persistent anonymous device ID (distinguishes multiple phones/laptops) + per-visit session ID
  const deviceId =
    safeStorageGet(window.localStorage, "ply_did") ||
    "d_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
  safeStorageSet(window.localStorage, "ply_did", deviceId);

  let sessionId = "";
  try {
    sessionId =
      sessionStorage.getItem("ply_sid") ||
      "s_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
    sessionStorage.setItem("ply_sid", sessionId);
  } catch (_) {
    sessionId =
      "s_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
  }

  const bootParams = new URLSearchParams(window.location.search);
  const isPreviewMode = bootParams.get("preview") === "1";

  let activeTimers = [];
  function schedule(fn, ms) {
    const id = window.setTimeout(fn, ms);
    activeTimers.push(id);
    return id;
  }
  function clearTimers() {
    activeTimers.forEach((id) => window.clearTimeout(id));
    activeTimers = [];
  }

  // ==========================================================================
  // CINEMATIC SOUND DESIGN + GRIPIN "VAR BIR IHTIMAL" SOUNDTRACK ENGINE
  // ==========================================================================
  const Sound = {
    ctx: null,
    muted: !CFG.meta.soundEnabledByDefault,
    padGain: null,
    musicGain: null,
    riserGain: null,
    noiseBuffer: null,
    rawTrackBytes: null,
    rawTrackMime: "audio/mpeg",
    blobTrackUrl: null,
    trackBuffer: null,
    trackDurationSec: 0,
    trackLoading: false,
    decodeFailed: false,
    soundtrackStarted: false,
    loopTimer: null,
    activeSources: [],
    fallbackAudio: null,
    resolvedTrackUrl:
      ((CFG.meta && CFG.meta.soundtrackUrl) || "/assets/gripin_var_bir_ihtimal.mp3") +
      "?v=rofouract",

    preloadTrack() {
      if (this.trackLoading || this.rawTrackBytes || this.trackBuffer) return;
      if (typeof window.fetch !== "function") return;
      this.trackLoading = true;

      const defaultUrl =
        ((CFG.meta && CFG.meta.soundtrackUrl) || "/assets/gripin_var_bir_ihtimal.mp3") +
        "?v=rofouract";
      const overrideUrl =
        ((CFG.meta && CFG.meta.soundtrackFullOverrideUrl) ||
          "/assets/gripin_var_bir_ihtimal.m4a") + "?v=rofouract";

      const tryFetch = (url) =>
        fetch(url, { cache: "no-store" }).then((resp) => {
          if (!resp.ok) throw new Error("Missing audio " + url);
          const ct = (resp.headers.get("Content-Type") || "").toLowerCase();
          if (ct.includes("text/html")) throw new Error("HTML fallback");
          this.resolvedTrackUrl = url;
          this.rawTrackMime = url.includes(".mp3") ? "audio/mpeg" : ct || "audio/mp4";
          return resp.arrayBuffer();
        });

      tryFetch(defaultUrl)
        .catch(() => tryFetch(overrideUrl))
        .then((buf) => {
          this.rawTrackBytes = buf;
          if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
            try {
              this.blobTrackUrl = URL.createObjectURL(
                new Blob([buf], { type: this.rawTrackMime || "audio/mpeg" })
              );
            } catch (_) {}
          }
          if (this.ctx && !this.trackBuffer) {
            this._decodeBuffer();
          } else if (!this.ctx && this.soundtrackStarted) {
            this._startFallbackAudio();
          }
        })
        .catch(() => {
          this.trackLoading = false;
          this.decodeFailed = true;
          if (this.soundtrackStarted) {
            this._startFallbackAudio();
          }
        });
    },

    _decodeBuffer() {
      if (!this.ctx || !this.rawTrackBytes || this.trackBuffer) return;
      try {
        const copy = this.rawTrackBytes.slice(0);
        this.ctx.decodeAudioData(
          copy,
          (decoded) => {
            this.trackBuffer = decoded;
            this.trackDurationSec = decoded.duration || 0;
            this.decodeFailed = false;
            if (soundtrackTag && this.trackDurationSec > 0) {
              soundtrackTag.dataset.durationSec = String(Math.round(this.trackDurationSec));
            }
            window.__plySoundDiag = {
              url: this.resolvedTrackUrl,
              bytes: this.rawTrackBytes ? this.rawTrackBytes.byteLength : 0,
              durationSec: this.trackDurationSec,
            };
            if (this.soundtrackStarted && this.activeSources.length === 0) {
              this._launch505Deck(0, 0.25);
            }
          },
          () => {
            this.decodeFailed = true;
            if (this.soundtrackStarted && this.activeSources.length === 0) {
              this._startFallbackAudio();
            }
          }
        );
      } catch (_) {
        this.decodeFailed = true;
        if (this.soundtrackStarted && this.activeSources.length === 0) {
          this._startFallbackAudio();
        }
      }
    },

    _startFallbackAudio() {
      if (!this.fallbackAudio && typeof window.Audio === "function") {
        try {
          this.fallbackAudio = new window.Audio();
        } catch (_) {}
      }
      if (!this.fallbackAudio) return;
      try {
        const targetSrc = this.blobTrackUrl || this.resolvedTrackUrl;
        if (this.fallbackAudio.src !== targetSrc) {
          this.fallbackAudio.src = targetSrc;
        }
        this.fallbackAudio.loop = true;
        this.fallbackAudio.playsInline = true;
        this.fallbackAudio.currentTime = 0;
        this.fallbackAudio.volume = this.muted ? 0 : 0.38;
        const p = this.fallbackAudio.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch (_) {}
    },

    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume();
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      if (this.ctx.state === "suspended") this.ctx.resume();

      // Build 1.5s organic analog noise buffer for 35mm shutter, film sprockets & pencil foley
      const sampleRate = this.ctx.sampleRate || 44100;
      const frameCount = Math.floor(sampleRate * 1.5);
      const buffer = this.ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < frameCount; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.18) * 1.6));
      }
      this.noiseBuffer = buffer;

      // Warm darkroom ambient pad in the key of "505" (Dm: D3, F3, A3)
      const master = this.ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.024;
      master.connect(this.ctx.destination);
      this.padGain = master;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 310;
      filter.connect(master);

      [146.83, 174.61, 220.0].forEach((freq) => {
        const osc = this.ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(filter);
        osc.start();
      });

      // Master bus for soundtrack ("Var Bir İhtimal")
      const musicBus = this.ctx.createGain();
      musicBus.gain.value = this.muted ? 0 : 0.42;
      musicBus.connect(this.ctx.destination);
      this.musicGain = musicBus;

      this.preloadTrack();
      if (this.rawTrackBytes && !this.trackBuffer) {
        this._decodeBuffer();
      }

      // Unlock HTML5 Audio element inside user gesture with a tiny 44-byte silent WAV
      // (avoids duplicate multi-megabyte HTTP fetch while keeping mobile Safari unlocked)
      if (typeof window.Audio === "function" && !this.fallbackAudio) {
        try {
          const el = new window.Audio(
            "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
          );
          el.playsInline = true;
          el.volume = 0;
          const p = el.play();
          if (p && typeof p.then === "function") {
            p.then(() => {
              if (!this.soundtrackStarted) {
                el.pause();
              }
            }).catch(() => {});
          }
          this.fallbackAudio = el;
        } catch (_) {}
      }

      this.syncUI();
    },

    start505AtIstanbul() {
      this.init();
      if (soundtrackTag) {
        soundtrackTag.hidden = false;
        soundtrackTag.textContent = "♪ Var Bir İhtimal";
        soundtrackTag.title =
          (CFG.meta && CFG.meta.soundtrackTitle) || "Gripin · Var Bir İhtimal";
      }
      if (this.soundtrackStarted) return;
      this.soundtrackStarted = true;

      // Duck ambient drone gently so the soundtrack owns the room
      if (this.padGain && this.ctx && !this.muted) {
        this.padGain.gain.setTargetAtTime(0.008, this.ctx.currentTime, 0.8);
      }

      if (this.ctx && this.trackBuffer) {
        this._launch505Deck(0, 0.25);
      } else if (this.ctx && !this.decodeFailed) {
        // Buffer is finishing download/decode; _decodeBuffer() will launch at 0:00 the instant it completes
        this.preloadTrack();
        if (this.rawTrackBytes && !this.trackBuffer) {
          this._decodeBuffer();
        }
      } else {
        this._startFallbackAudio();
      }
      this.syncUI();
    },

    _launch505Deck(offsetSec = 0, fadeInSec = 0.25) {
      if (!this.ctx || !this.trackBuffer || !this.soundtrackStarted) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      if (this.fallbackAudio && !this.fallbackAudio.paused) {
        try {
          this.fallbackAudio.pause();
        } catch (_) {}
      }

      const now = this.ctx.currentTime;
      const dur = this.trackBuffer.duration;
      const crossfadeSec = dur > 12 ? 3.1 : Math.min(1.5, dur * 0.25);

      const src = this.ctx.createBufferSource();
      src.buffer = this.trackBuffer;

      const deckGain = this.ctx.createGain();
      deckGain.gain.setValueAtTime(0.0001, now);
      deckGain.gain.linearRampToValueAtTime(1.0, now + fadeInSec);

      const fadeOutStart = Math.max(fadeInSec + 0.2, dur - offsetSec - crossfadeSec);
      deckGain.gain.setValueAtTime(1.0, now + fadeOutStart);
      deckGain.gain.linearRampToValueAtTime(0.0001, now + fadeOutStart + crossfadeSec);

      src.connect(deckGain);
      deckGain.connect(this.musicGain);
      src.start(now, offsetSec);
      src.stop(now + dur - offsetSec + 0.05);

      this.activeSources.push(src);
      src.onended = () => {
        this.activeSources = this.activeSources.filter((s) => s !== src);
      };

      if (this.loopTimer) window.clearTimeout(this.loopTimer);
      this.loopTimer = window.setTimeout(() => {
        this._launch505Deck(0, crossfadeSec);
      }, Math.max(1000, fadeOutStart * 1000));
    },

    tick(freq = 520, duration = 0.09, vol = 0.04) {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    },

    // Mechanical 35mm film-gate sprocket click (accelerates during Act 1A rush)
    playReelTick(progress = 0) {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const now = this.ctx.currentTime;

      if (this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(1350 + progress * 950, now);
        bp.Q.setValueAtTime(4.2, now);

        const g = this.ctx.createGain();
        const peak = 0.022 + progress * 0.022;
        g.gain.setValueAtTime(peak, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

        src.connect(bp);
        bp.connect(g);
        g.connect(this.ctx.destination);
        src.start(now, Math.random() * 0.8, 0.024);
      }

      // Subtle warm wooden gate transient
      this.tick(185 + progress * 130, 0.032, 0.014 + progress * 0.01);
    },

    // Long cinema tension build: accelerating sub-bass heartbeat + rising analog filter sweep
    playSuspenseBuild(durationSec = 11.2) {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const now = this.ctx.currentTime;

      const riserBus = this.ctx.createGain();
      riserBus.gain.setValueAtTime(0.0001, now);
      riserBus.gain.exponentialRampToValueAtTime(0.022, now + durationSec * 0.45);
      riserBus.gain.exponentialRampToValueAtTime(0.068, now + durationSec * 0.94);
      riserBus.gain.exponentialRampToValueAtTime(0.0001, now + durationSec + 0.25);
      riserBus.connect(this.ctx.destination);
      this.riserGain = riserBus;

      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(80, now);
      lp.frequency.exponentialRampToValueAtTime(260, now + durationSec * 0.5);
      lp.frequency.exponentialRampToValueAtTime(980, now + durationSec);
      lp.Q.setValueAtTime(2.1, now);
      lp.connect(riserBus);

      // Deep Dm + subtle Eb suspense tension cluster
      [73.42, 110.0, 155.56, 174.61].forEach((baseFreq, idx) => {
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = idx === 0 ? "sawtooth" : idx === 1 ? "triangle" : "sine";
        oscGain.gain.value = idx === 2 ? 0.22 : 0.42;
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.12, now + durationSec);
        osc.connect(oscGain);
        oscGain.connect(lp);
        osc.start(now);
        osc.stop(now + durationSec + 0.3);
      });

      if (this.noiseBuffer) {
        const air = this.ctx.createBufferSource();
        air.buffer = this.noiseBuffer;
        air.loop = true;
        const airGain = this.ctx.createGain();
        airGain.gain.value = 0.32;
        air.connect(airGain);
        airGain.connect(lp);
        air.start(now);
        air.stop(now + durationSec + 0.3);
      }

      // Accelerating muffled darkroom heartbeat ("lub-dub")
      let beatCursorMs = 200;
      let stepIntervalMs = 1120;
      const totalMs = durationSec * 1000 - 350;
      while (beatCursorMs < totalMs) {
        const intensity = Math.min(1, beatCursorMs / totalMs);
        const fireMs = Math.round(beatCursorMs);
        schedule(() => {
          this._playHeartbeatPulse(intensity);
        }, fireMs);
        beatCursorMs += stepIntervalMs;
        stepIntervalMs = Math.max(330, stepIntervalMs * 0.86);
      }
    },

    _playHeartbeatPulse(intensity = 0.4) {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const now = this.ctx.currentTime;
      const baseVol = 0.028 + intensity * 0.048;

      [
        { delay: 0, startFreq: 68, endFreq: 38, vol: baseVol },
        { delay: 0.16 - intensity * 0.04, startFreq: 58, endFreq: 34, vol: baseVol * 0.72 },
      ].forEach((hit) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(hit.startFreq, now + hit.delay);
        osc.frequency.exponentialRampToValueAtTime(hit.endFreq, now + hit.delay + 0.16);
        g.gain.setValueAtTime(0.0001, now + hit.delay);
        g.gain.linearRampToValueAtTime(hit.vol, now + hit.delay + 0.018);
        g.gain.exponentialRampToValueAtTime(0.0001, now + hit.delay + 0.2);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now + hit.delay);
        osc.stop(now + hit.delay + 0.22);
      });
    },

    // Quiet intimate harmonic chime when the frozen Istanbul message emerges from blackout
    playPivotArrival() {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const now = this.ctx.currentTime;

      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(760, now);
      lp.connect(this.ctx.destination);

      [293.66, 440.0].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        g.gain.setValueAtTime(0.0001, now + idx * 0.06);
        g.gain.linearRampToValueAtTime(idx === 0 ? 0.026 : 0.016, now + idx * 0.06 + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 1.85);
        osc.connect(g);
        g.connect(lp);
        osc.start(now + idx * 0.06);
        osc.stop(now + 1.9);
      });
    },

    // Dramatic sub-bass heartbeat / tape-brake hush when freezing on "in 7-10 noiembrie o sa fiu in Istanbul"
    playFreezeDrop() {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const now = this.ctx.currentTime;

      if (this.riserGain) {
        try {
          this.riserGain.gain.cancelScheduledValues(now);
          this.riserGain.gain.setTargetAtTime(0.0001, now, 0.04);
        } catch (_) {}
      }

      // Deep velvet sub-bass drop
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(98, now);
      sub.frequency.exponentialRampToValueAtTime(36, now + 0.68);
      subGain.gain.setValueAtTime(0.11, now);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
      sub.connect(subGain);
      subGain.connect(this.ctx.destination);
      sub.start(now);
      sub.stop(now + 0.82);

      // Soft mechanical brake latch
      this.playReelTick(0.15);
    },

    // Two-curtain 35mm SLR camera shutter + warm cinematic Dm9 bloom as message morphs into Istanbul
    playIstanbulMorph() {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const now = this.ctx.currentTime;

      // Two-curtain mechanical shutter ("clack - click")
      if (this.noiseBuffer) {
        [0, 0.048].forEach((offset, curtainIdx) => {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const bp = this.ctx.createBiquadFilter();
          bp.type = "bandpass";
          bp.frequency.setValueAtTime(curtainIdx === 0 ? 1650 : 2300, now + offset);
          bp.Q.setValueAtTime(2.6, now + offset);
          const g = this.ctx.createGain();
          g.gain.setValueAtTime(curtainIdx === 0 ? 0.065 : 0.05, now + offset);
          g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.038);
          src.connect(bp);
          bp.connect(g);
          g.connect(this.ctx.destination);
          src.start(now + offset, curtainIdx * 0.25, 0.045);
        });
      }

      // Warm golden cinema chord bloom (Dm9: D3, A3, F4, E4) melting into "505"
      const bloomFilter = this.ctx.createBiquadFilter();
      bloomFilter.type = "lowpass";
      bloomFilter.frequency.setValueAtTime(260, now);
      bloomFilter.frequency.exponentialRampToValueAtTime(920, now + 1.4);
      bloomFilter.frequency.exponentialRampToValueAtTime(340, now + 3.2);
      bloomFilter.connect(this.ctx.destination);

      [146.83, 220.0, 329.63, 349.23].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = i === 0 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(0.022, now + 0.65 + i * 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 3.1);
        osc.connect(g);
        g.connect(bloomFilter);
        osc.start(now);
        osc.stop(now + 3.2);
      });
    },

    // Gentle rangefinder advance whisper on single-beat Spotify-Wrapped transitions
    playFrameAdvance(stepIdx = 0) {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const now = this.ctx.currentTime;

      if (this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(1850, now);
        bp.Q.setValueAtTime(3.2, now);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.024, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.026);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.ctx.destination);
        src.start(now, 0.12, 0.03);
      }

      // Soft harmonic note in Dm / Em ("505" palette)
      const notes = [293.66, 329.63, 349.23, 392.0, 440.0, 329.63];
      this.tick(notes[stepIdx % notes.length], 0.14, 0.018);
    },

    // Tactile waxy China-Marker grease pencil stroke on Baryta paper
    playGreasePencil() {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const now = this.ctx.currentTime;

      if (this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(420, now);
        bp.frequency.linearRampToValueAtTime(860, now + 0.09);
        bp.frequency.linearRampToValueAtTime(540, now + 0.18);
        bp.Q.setValueAtTime(2.4, now);

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.001, now);
        g.gain.linearRampToValueAtTime(0.036, now + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

        src.connect(bp);
        bp.connect(g);
        g.connect(this.ctx.destination);
        src.start(now, 0.3, 0.2);
      } else {
        this.tick(480, 0.09, 0.03);
      }
    },

    // Physical rubber-stamp thud on receipt
    playStampThud() {
      if (this.muted || !this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();
      const now = this.ctx.currentTime;

      const sub = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(118, now);
      sub.frequency.exponentialRampToValueAtTime(42, now + 0.18);
      g.gain.setValueAtTime(0.095, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      sub.connect(g);
      g.connect(this.ctx.destination);
      sub.start(now);
      sub.stop(now + 0.24);

      this.playReelTick(0.6);
    },

    toggle() {
      this.init();
      this.muted = !this.muted;
      if (this.padGain && this.ctx) {
        const targetPad = this.muted ? 0 : this.soundtrackStarted ? 0.008 : 0.024;
        this.padGain.gain.setTargetAtTime(targetPad, this.ctx.currentTime, 0.15);
      }
      if (this.musicGain && this.ctx) {
        this.musicGain.gain.setTargetAtTime(
          this.muted ? 0 : 0.42,
          this.ctx.currentTime,
          0.18
        );
      }
      if (this.fallbackAudio) {
        this.fallbackAudio.volume = this.muted ? 0 : 0.38;
      }
      this.syncUI();
    },

    syncUI() {
      if (!soundBars) return;
      soundBars.classList.toggle("muted", this.muted);
      soundBars.classList.toggle("playing", !this.muted && !!this.ctx);
      if (soundtrackTag) {
        soundtrackTag.classList.toggle("muted", this.muted);
      }
    },
  };

  // Start preloading soundtrack in background immediately at Gate 0
  Sound.preloadTrack();
  soundToggle.addEventListener("click", () => {
    Sound.toggle();
    trackEvent("toggled_sound", { muted: Sound.muted });
  });

  // ==========================================================================
  // VARIATION 3A: WAXY RED CHINA-MARKER GREASE PENCIL & BRASS LOUPE MOTIFS
  // ==========================================================================
  function chinaMarkerUnderlineSvg() {
    return `
      <svg class="china-marker-underline" viewBox="0 0 220 18" aria-hidden="true">
        <g filter="url(#chinaMarkerTexture)">
          <path class="china-marker-stroke" d="M6 12 C 62 5, 148 5, 212 10" />
          <path class="china-marker-stroke secondary" d="M20 15 C 86 10, 152 10, 196 13" />
        </g>
      </svg>
    `;
  }

  function chinaMarkerCircleSvg() {
    return `
      <svg class="china-marker-ring" viewBox="0 0 120 96" aria-hidden="true">
        <g filter="url(#chinaMarkerTexture)">
          <path class="ring-primary" d="M60 8 C96 7, 114 25, 112 49 C110 74, 86 89, 54 88 C23 87, 7 69, 9 45 C11 21, 36 7, 73 12" />
          <path class="ring-loop" d="M44 12 C84 9, 108 29, 106 51 C104 73, 79 85, 48 83 C21 81, 12 63, 15 41" />
        </g>
      </svg>
    `;
  }

  function chinaMarkerWideOvalSvg() {
    return `
      <svg class="china-marker-oval" viewBox="0 0 280 90" preserveAspectRatio="none" aria-hidden="true">
        <g filter="url(#chinaMarkerTexture)">
          <path class="oval-primary" d="M138 9 C226 7, 272 23, 270 46 C268 70, 214 83, 134 82 C54 81, 9 67, 11 43 C13 19, 68 8, 162 12" />
          <path class="oval-loop" d="M110 13 C206 10, 263 26, 261 48 C259 68, 202 79, 122 78 C52 77, 17 62, 19 41" />
        </g>
      </svg>
    `;
  }

  function chinaMarkerCheckSvg() {
    return `
      <svg class="china-check-svg" viewBox="0 0 28 26" aria-hidden="true">
        <g filter="url(#chinaMarkerTexture)">
          <path class="check-stroke" d="M4 14 L 10 21 C 14 14, 19 7, 25 2" />
        </g>
      </svg>
    `;
  }

  function chinaMarkerArrowSvg() {
    return `
      <svg class="china-arrow-svg" viewBox="0 0 28 16" aria-hidden="true">
        <g filter="url(#chinaMarkerTexture)">
          <path d="M2 8.5 C 9 8, 16 8, 23 8 M17 3.5 C 20 5.5, 22.5 7, 24.5 8 C 22.5 9.2, 20 11, 17.5 13" />
        </g>
      </svg>
    `;
  }

  function chinaMarkerSignatureSvg() {
    return `
      <svg class="china-signature-svg" viewBox="0 0 160 52" aria-hidden="true">
        <g filter="url(#chinaMarkerTexture)">
          <path class="sig-stroke" d="M14 38 C 18 12, 42 7, 36 26 C 31 41, 19 37, 29 27 C 40 16, 53 20, 48 33 C 45 40, 61 23, 70 28 C 76 31, 83 24, 92 29 C 104 35, 126 26, 150 28" />
        </g>
      </svg>
    `;
  }

  function chinaMarkerMarginMarkSvg() {
    return `
      <svg class="china-margin-mark-svg" viewBox="0 0 34 22" aria-hidden="true">
        <g filter="url(#chinaMarkerTexture)">
          <path d="M4 12.5 C 7.5 15.5, 10.2 18.2, 12.2 18.5 C 16.5 11.2, 23 6.2, 30.5 3.5" />
        </g>
      </svg>
    `;
  }

  // ==========================================================================
  // SLIDE FRONTIER & BACK/FORWARD HISTORY ENGINE
  // (Allows stepping back freely across beats and chapters, and stepping forward
  //  ONLY up to maxShownSlideIdx — never skipping past the latest shown slide)
  // ==========================================================================
  const ACT1_BEAT_COUNT = (CFG.act1 && CFG.act1.beats && CFG.act1.beats.length) || 5;
  const ACT3_BEAT_COUNT = (CFG.act3 && CFG.act3.beats && CFG.act3.beats.length) || 6;
  const ACT4_SETUP_COUNT =
    (CFG.act4 && CFG.act4.setupBeats && CFG.act4.setupBeats.length) || 3;

  const SLIDE_MAP = {
    INTRO: 0,
    ACT1_CINEMA: 1,
    ACT1_BEATS_START: 2,
    ACT2_PRELUDE: 2 + ACT1_BEAT_COUNT,
    ACT2: 3 + ACT1_BEAT_COUNT,
    ACT3_BEATS_START: 4 + ACT1_BEAT_COUNT,
    ACT4_SETUP_START: 4 + ACT1_BEAT_COUNT + ACT3_BEAT_COUNT,
    ACT4_REVEAL: 4 + ACT1_BEAT_COUNT + ACT3_BEAT_COUNT + ACT4_SETUP_COUNT,
    ACT4_CONTRACT: 5 + ACT1_BEAT_COUNT + ACT3_BEAT_COUNT + ACT4_SETUP_COUNT,
    ACT4_FINALE: 6 + ACT1_BEAT_COUNT + ACT3_BEAT_COUNT + ACT4_SETUP_COUNT,
  };
  SLIDE_MAP.ACT5_SETUP_START = SLIDE_MAP.ACT4_SETUP_START;
  SLIDE_MAP.ACT5_REVEAL = SLIDE_MAP.ACT4_REVEAL;
  SLIDE_MAP.ACT5_CONTRACT = SLIDE_MAP.ACT4_CONTRACT;
  SLIDE_MAP.ACT5_FINALE = SLIDE_MAP.ACT4_FINALE;

  let currentSlideIdx = 0;
  let maxShownSlideIdx = 0;
  let activeBeatScene = null;

  // ==========================================================================
  // MULTI-DEVICE, PASSIVE LOCATION & TIME-SPENT TELEMETRY ENGINE
  // (Silent, zero permission popups, resilient on mobile / Instagram in-app)
  // ==========================================================================
  function detectDeviceProfile() {
    const ua = (navigator && navigator.userAgent) || "";
    const platform = (navigator && navigator.platform) || "";
    const touchPoints = (navigator && navigator.maxTouchPoints) || 0;

    let inApp = "";
    if (/Instagram/i.test(ua)) inApp = "Instagram";
    else if (/FBAN|FBAV/i.test(ua)) inApp = "Facebook";
    else if (/WhatsApp/i.test(ua)) inApp = "WhatsApp";
    else if (/TikTok|Bytedance/i.test(ua)) inApp = "TikTok";
    else if (/Telegram/i.test(ua)) inApp = "Telegram";

    let os = "Other";
    let model = "Device";
    if (/iPhone/i.test(ua)) {
      model = "iPhone";
      const m = ua.match(/OS (\d+[_\d]*)/);
      os = m ? "iOS " + m[1].replace(/_/g, ".") : "iOS";
    } else if (/iPad/i.test(ua) || (platform === "MacIntel" && touchPoints > 1)) {
      model = "iPad";
      os = "iPadOS";
    } else if (/Android/i.test(ua)) {
      const m = ua.match(/Android\s+([\d.]+)/i);
      os = m ? "Android " + m[1] : "Android";
      const devMatch = ua.match(/;\s*([^;)]+?)\s+Build\//i);
      model = devMatch ? devMatch[1].trim() : "Android Phone";
    } else if (/Mac OS X/i.test(ua)) {
      model = "Mac";
      os = "macOS";
    } else if (/Windows/i.test(ua)) {
      model = "PC";
      os = "Windows";
    } else if (/Linux/i.test(ua)) {
      model = "Desktop";
      os = "Linux";
    }

    let browser = "Browser";
    if (inApp) browser = inApp + " In-App";
    else if (/Edg\//i.test(ua)) browser = "Edge";
    else if (/OPR\//i.test(ua)) browser = "Opera";
    else if (/CriOS|Chrome\//i.test(ua)) browser = "Chrome";
    else if (/FxiOS|Firefox\//i.test(ua)) browser = "Firefox";
    else if (/Safari\//i.test(ua)) browser = "Safari";

    const deviceType =
      /iPad/i.test(model)
        ? "tablet"
        : /iPhone|Android/i.test(model) || touchPoints > 1
        ? "mobile"
        : "desktop";

    const sw = (window.screen && window.screen.width) || 0;
    const sh = (window.screen && window.screen.height) || 0;
    const dpr = window.devicePixelRatio ? Math.round(window.devicePixelRatio * 10) / 10 : 1;

    return {
      label: `${model} · ${os} · ${browser}`,
      deviceType,
      model,
      os,
      browser,
      inApp: inApp || null,
      screen: `${sw}x${sh} @${dpr}x`,
      viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
      language: (navigator && navigator.language) || "",
      referrer: document.referrer || "",
      ua: ua.slice(0, 260),
    };
  }

  const deviceProfile = detectDeviceProfile();

  let resolvedTz = "";
  try {
    resolvedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (_) {}

  const locationProfile = {
    timezone: resolvedTz,
    locale: (navigator && navigator.language) || "",
    city: "",
    region: "",
    country: "",
    countryCode: "",
    ip: "",
    source: "timezone",
  };

  // Load cached passive geo if resolved earlier in this tab session
  const cachedGeoRaw = safeStorageGet(window.sessionStorage, "ply_geo_v1");
  if (cachedGeoRaw) {
    try {
      const parsedGeo = JSON.parse(cachedGeoRaw);
      if (parsedGeo && typeof parsedGeo === "object") {
        Object.assign(locationProfile, parsedGeo);
      }
    } catch (_) {}
  }

  const pageStartWallMs = Date.now();
  const perfNow = () =>
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now() - pageStartWallMs;

  let activeAccumMs = 0;
  let visibleSincePerfMs = document.visibilityState === "hidden" ? null : perfNow();

  function getActiveTimeMs() {
    const live = visibleSincePerfMs !== null ? Math.max(0, perfNow() - visibleSincePerfMs) : 0;
    return Math.round(activeAccumMs + live);
  }

  function getElapsedMs() {
    return Math.max(0, Date.now() - pageStartWallMs);
  }

  function snippetText(str, maxLen = 34) {
    if (!str) return "";
    const clean = String(str).replace(/\s+/g, " ").trim();
    return clean.length > maxLen ? clean.slice(0, maxLen - 1) + "…" : clean;
  }

  function describeSlide(slideIdx) {
    if (slideIdx === SLIDE_MAP.INTRO) {
      return { stepKey: "gate_0_intro", stepLabel: "Gate 0 · Ecranul de Start" };
    }
    if (slideIdx === SLIDE_MAP.ACT1_CINEMA) {
      return { stepKey: "act_1_istanbul_cinema", stepLabel: "Act 1 · Mesaje & Animația Istanbul" };
    }
    if (slideIdx >= SLIDE_MAP.ACT1_BEATS_START && slideIdx < SLIDE_MAP.ACT2_PRELUDE) {
      const bIdx = slideIdx - SLIDE_MAP.ACT1_BEATS_START;
      const b = CFG.act1 && CFG.act1.beats && CFG.act1.beats[bIdx];
      return {
        stepKey: `act_1_beat_${bIdx + 1}`,
        stepLabel: `Act 1 · Cadrul ${bIdx + 1}/${ACT1_BEAT_COUNT} ("${snippetText(b && b.text)}")`,
      };
    }
    if (slideIdx === SLIDE_MAP.ACT2_PRELUDE) {
      return {
        stepKey: "act_2_prelude",
        stepLabel: "Act 2 · Intertitlu („Atenție: urmează câteva complimente asumate :))”)",
      };
    }
    if (slideIdx === SLIDE_MAP.ACT2) {
      return { stepKey: "act_2_contact_sheet", stepLabel: "Act 2 · Contact Sheet (Cele 4 Cadre)" };
    }
    if (slideIdx >= SLIDE_MAP.ACT3_BEATS_START && slideIdx < SLIDE_MAP.ACT4_SETUP_START) {
      const bIdx = slideIdx - SLIDE_MAP.ACT3_BEATS_START;
      const b = CFG.act3 && CFG.act3.beats && CFG.act3.beats[bIdx];
      return {
        stepKey: `act_3_beat_${bIdx + 1}`,
        stepLabel: `Act 3 · Cadrul ${bIdx + 1}/${ACT3_BEAT_COUNT} ("${snippetText(b && b.text)}")`,
      };
    }
    if (slideIdx >= SLIDE_MAP.ACT4_SETUP_START && slideIdx < SLIDE_MAP.ACT4_REVEAL) {
      const bIdx = slideIdx - SLIDE_MAP.ACT4_SETUP_START;
      const b = CFG.act4 && CFG.act4.setupBeats && CFG.act4.setupBeats[bIdx];
      return {
        stepKey: `act_4_setup_${bIdx + 1}`,
        stepLabel: `Act 4 · Intro Propunere ${bIdx + 1}/${ACT4_SETUP_COUNT} ("${snippetText(b && b.text)}")`,
      };
    }
    if (slideIdx === SLIDE_MAP.ACT4_REVEAL) {
      return { stepKey: "act_4_reveal", stepLabel: "Act 4 · Scena următoare (FaceTime Reveal)" };
    }
    if (slideIdx === SLIDE_MAP.ACT4_CONTRACT) {
      return { stepKey: "act_4_contract", stepLabel: "Act 4 · Termenii și Condițiile" };
    }
    if (slideIdx === SLIDE_MAP.ACT4_FINALE) {
      return { stepKey: "act_4_finale", stepLabel: "Act 4 · Tratatul Semnat (Final)" };
    }
    return { stepKey: `slide_${slideIdx}`, stepLabel: `Pasul #${slideIdx}` };
  }

  function trackEvent(event, data = {}, opts = {}) {
    const desc = describeSlide(currentSlideIdx);
    const payload = {
      schemaVersion: 2,
      deviceId,
      sessionId,
      isPreview: isPreviewMode,
      event,
      data,
      stepIdx: currentSlideIdx,
      stepKey: desc.stepKey,
      stepLabel: desc.stepLabel,
      elapsedMs: getElapsedMs(),
      activeTimeMs: getActiveTimeMs(),
      device: deviceProfile,
      location: locationProfile,
      ts: new Date().toISOString(),
    };
    const jsonBody = JSON.stringify(payload);

    if (opts && opts.beacon && navigator && typeof navigator.sendBeacon === "function") {
      try {
        const blob = new Blob([jsonBody], { type: "application/json" });
        if (navigator.sendBeacon("/api/event", blob)) {
          return;
        }
      } catch (_) {}
    }

    if (typeof window.fetch === "function") {
      fetch("/api/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody,
        keepalive: !!(opts && opts.beacon),
      }).catch(() => {
        // Never block user experience if offline
      });
    }
  }

  // Silent passive general-location enrichment (no browser permission prompt)
  (function resolvePassiveGeneralLocation() {
    if (locationProfile.city || locationProfile.country || typeof window.fetch !== "function") {
      return;
    }
    const applyGeo = (city, region, country, countryCode, ip, tz, src) => {
      if (!city && !country) return false;
      locationProfile.city = city || "";
      locationProfile.region = region || "";
      locationProfile.country = country || "";
      locationProfile.countryCode = countryCode || "";
      locationProfile.ip = ip || "";
      if (tz && !locationProfile.timezone) locationProfile.timezone = tz;
      locationProfile.source = src;
      safeStorageSet(window.sessionStorage, "ply_geo_v1", JSON.stringify(locationProfile));
      trackEvent("location_resolved", {
        city: locationProfile.city,
        region: locationProfile.region,
        country: locationProfile.country,
        timezone: locationProfile.timezone,
      });
      return true;
    };

    fetch("https://ipwho.is/", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("geo1"))))
      .then((g) => {
        if (!g || g.success === false) throw new Error("geo1_unsuccessful");
        applyGeo(
          g.city,
          g.region,
          g.country,
          g.country_code,
          g.ip,
          g.timezone && g.timezone.id,
          "ipwho.is"
        );
      })
      .catch(() => {
        fetch("https://ipapi.co/json/", { cache: "force-cache" })
          .then((r) => (r.ok ? r.json() : null))
          .then((g) => {
            if (g && (g.city || g.country_name)) {
              applyGeo(
                g.city,
                g.region,
                g.country_name,
                g.country_code,
                g.ip,
                g.timezone,
                "ipapi.co"
              );
            }
          })
          .catch(() => {});
      });
  })();

  let lastLoggedSlideIdx = -1;
  let lastSlideEnteredActiveMs = 0;
  let hasLoggedPageOpen = false;
  let heartbeatCount = 0;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (visibleSincePerfMs !== null) {
        activeAccumMs += Math.max(0, perfNow() - visibleSincePerfMs);
        visibleSincePerfMs = null;
      }
      trackEvent(
        "session_hidden",
        {
          maxSlideIdx: maxShownSlideIdx,
          protestCount: persisted.contractProtestCount,
          signed: !!persisted.signedPayload,
        },
        { beacon: true }
      );
    } else if (visibleSincePerfMs === null) {
      visibleSincePerfMs = perfNow();
    }
  });

  window.addEventListener("pagehide", () => {
    if (visibleSincePerfMs !== null) {
      activeAccumMs += Math.max(0, perfNow() - visibleSincePerfMs);
      visibleSincePerfMs = null;
    }
    trackEvent(
      "page_closed",
      {
        maxSlideIdx: maxShownSlideIdx,
        protestCount: persisted.contractProtestCount,
        signed: !!persisted.signedPayload,
      },
      { beacon: true }
    );
  });

  window.setInterval(() => {
    if (document.visibilityState === "visible" && heartbeatCount < 120) {
      heartbeatCount += 1;
      trackEvent("time_heartbeat", {
        heartbeat: heartbeatCount,
        maxSlideIdx: maxShownSlideIdx,
      });
    }
  }, 15000);

  const persisted = {
    completedScenes: new Set(),
    act2Unlocked: new Set(),
    act2LastCardIdx: -1,
    contractSelected: new Set(
      ((CFG.act4 && CFG.act4.contract && CFG.act4.contract.clauses) || [])
        .filter((c) => c.defaultChecked)
        .map((c) => c.id)
    ),
    contractCustomNote: "",
    contractProtestCount: 0,
    signedPayload: null,
  };

  function extractNavOpts(arg) {
    return arg && typeof arg === "object" && arg.isNavOpts ? arg : {};
  }

  // ==========================================================================
  // CHROME, MOOD COLOR PALETTE & CHAPTER PROGRESS RAIL
  // ==========================================================================
  function setMood(mood) {
    if (!mood) return;
    document.body.setAttribute("data-mood", mood);
  }

  function syncNavChrome() {
    if (navBackBtn) {
      navBackBtn.disabled = currentSlideIdx <= 0 || isTransitioning;
    }
    if (navForwardBtn) {
      // STRICT GUARDRAIL: Forward is ALWAYS disabled at or beyond maxShownSlideIdx
      navForwardBtn.disabled = currentSlideIdx >= maxShownSlideIdx || isTransitioning;
    }

    const chapterStartSlides = [
      SLIDE_MAP.ACT1_CINEMA,
      SLIDE_MAP.ACT2,
      SLIDE_MAP.ACT3_BEATS_START,
      SLIDE_MAP.ACT4_SETUP_START,
    ];
    document.querySelectorAll(".rail-seg").forEach((seg) => {
      const segNum = Number(seg.getAttribute("data-seg"));
      const targetSlide = chapterStartSlides[segNum - 1];
      const canJump =
        typeof targetSlide === "number" &&
        targetSlide <= maxShownSlideIdx &&
        targetSlide !== currentSlideIdx;
      seg.classList.toggle("unlocked-jump", canJump);
    });
  }

  function recordSlideShown(slideIdx) {
    const prevIdx = lastLoggedSlideIdx;
    const nowActive = getActiveTimeMs();
    const prevDurationMs =
      prevIdx >= 0 ? Math.max(0, nowActive - lastSlideEnteredActiveMs) : 0;

    currentSlideIdx = slideIdx;
    if (slideIdx > maxShownSlideIdx) {
      maxShownSlideIdx = slideIdx;
    }
    syncNavChrome();

    if (slideIdx !== prevIdx) {
      const nextDesc = describeSlide(slideIdx);
      const prevDesc = prevIdx >= 0 ? describeSlide(prevIdx) : null;
      lastLoggedSlideIdx = slideIdx;
      lastSlideEnteredActiveMs = nowActive;
      trackEvent("step_viewed", {
        slideIdx,
        stepKey: nextDesc.stepKey,
        stepLabel: nextDesc.stepLabel,
        prevSlideIdx: prevIdx >= 0 ? prevIdx : null,
        prevStepLabel: prevDesc ? prevDesc.stepLabel : null,
        prevStepDurationMs: prevDurationMs,
      });
    }
  }

  function setChrome(actNumber, label, theme, defaultMood) {
    document.body.setAttribute("data-theme", theme);
    if (defaultMood) setMood(defaultMood);
    if (actNumber === 0 && maxShownSlideIdx === 0) {
      topChrome.hidden = true;
      return;
    }
    topChrome.hidden = false;
    chapterCode.textContent = label || "Proiecție Privată";
    document.querySelectorAll(".rail-seg").forEach((seg) => {
      const idx = Number(seg.getAttribute("data-seg"));
      seg.classList.toggle("done", idx < actNumber);
      seg.classList.toggle("active", idx === actNumber);
    });
    syncNavChrome();
  }

  // ==========================================================================
  // MOTION CHOREOGRAPHY: TWO-PHASE CINEMATIC SCENE CROSS-DISSOLVE
  // ==========================================================================
  let isTransitioning = false;
  let transitionTimer = null;

  function isReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function transitionScene(renderFn, options = {}) {
    const {
      force = false,
      instant = false,
      durationExit = 400,
      durationEnter = 620,
    } = options;

    if (isTransitioning) {
      if (!force) return;
      if (transitionTimer) {
        window.clearTimeout(transitionTimer);
        transitionTimer = null;
      }
    }

    isTransitioning = true;
    activeBeatScene = null;
    syncNavChrome();
    clearTimers(); // Clear pending timers from outgoing scene

    const outgoing = stage.firstElementChild;
    const reduced = isReducedMotion();
    const exitMs = reduced ? 200 : durationExit;
    const enterMs = reduced ? 250 : durationEnter;

    const phase2 = () => {
      transitionTimer = null;
      stage.innerHTML = "";
      renderFn(stage);

      const incoming = stage.firstElementChild;
      if (incoming) {
        incoming.classList.add("scene-enter-cinematic");
        incoming.style.pointerEvents = "none";
      }

      transitionTimer = window.setTimeout(() => {
        transitionTimer = null;
        isTransitioning = false;
        if (incoming) {
          incoming.style.pointerEvents = "";
        }
        syncNavChrome();
      }, enterMs);
    };

    if (outgoing && !instant) {
      outgoing.classList.remove("scene-enter-cinematic");
      outgoing.classList.add("scene-exit-vintage");
      outgoing.style.pointerEvents = "none";

      transitionTimer = window.setTimeout(() => {
        phase2();
      }, exitMs);
    } else {
      phase2();
    }
  }

  function navigateToSlide(targetIdx) {
    if (isTransitioning) return;
    // HARD INVARIANT: Never step below 0 or forward past maxShownSlideIdx
    if (targetIdx < 0 || targetIdx > maxShownSlideIdx) return;
    if (targetIdx === currentSlideIdx) return;

    Sound.init();
    Sound.playFrameAdvance(Math.max(0, targetIdx));

    if (
      activeBeatScene &&
      targetIdx >= activeBeatScene.startSlideIdx &&
      targetIdx <= activeBeatScene.endSlideIdx
    ) {
      activeBeatScene.goToBeat(targetIdx - activeBeatScene.startSlideIdx);
      return;
    }

    activeBeatScene = null;

    if (targetIdx === SLIDE_MAP.INTRO) {
      transitionScene(() => renderIntro({ isNavOpts: true }));
    } else if (targetIdx === SLIDE_MAP.ACT1_CINEMA) {
      transitionScene(() =>
        renderAct1Cinema({ isNavOpts: true, revisit: maxShownSlideIdx > SLIDE_MAP.ACT1_CINEMA })
      );
    } else if (
      targetIdx >= SLIDE_MAP.ACT1_BEATS_START &&
      targetIdx < SLIDE_MAP.ACT2_PRELUDE
    ) {
      const beatIdx = targetIdx - SLIDE_MAP.ACT1_BEATS_START;
      transitionScene(() => renderAct1Beats({ isNavOpts: true, initialBeatIdx: beatIdx }));
    } else if (targetIdx === SLIDE_MAP.ACT2_PRELUDE) {
      transitionScene(() => renderAct2Prelude({ isNavOpts: true }));
    } else if (targetIdx === SLIDE_MAP.ACT2) {
      transitionScene(() => renderAct2({ isNavOpts: true }));
    } else if (
      targetIdx >= SLIDE_MAP.ACT3_BEATS_START &&
      targetIdx < SLIDE_MAP.ACT4_SETUP_START
    ) {
      const beatIdx = targetIdx - SLIDE_MAP.ACT3_BEATS_START;
      transitionScene(() => renderAct3({ isNavOpts: true, initialBeatIdx: beatIdx }));
    } else if (
      targetIdx >= SLIDE_MAP.ACT4_SETUP_START &&
      targetIdx < SLIDE_MAP.ACT4_REVEAL
    ) {
      const beatIdx = targetIdx - SLIDE_MAP.ACT4_SETUP_START;
      transitionScene(() => renderAct5Setup({ isNavOpts: true, initialBeatIdx: beatIdx }));
    } else if (targetIdx === SLIDE_MAP.ACT4_REVEAL) {
      transitionScene(() => renderAct5Setup({ isNavOpts: true, openRevealDirectly: true }));
    } else if (targetIdx === SLIDE_MAP.ACT4_CONTRACT) {
      transitionScene(() => renderAct5Contract({ isNavOpts: true }));
    } else if (targetIdx === SLIDE_MAP.ACT4_FINALE && persisted.signedPayload) {
      const sp = persisted.signedPayload;
      transitionScene(() => renderFinale(sp.chosenTexts, sp.customNote, sp.protestCount));
    }
  }

  if (navBackBtn) {
    navBackBtn.addEventListener("click", () => {
      if (currentSlideIdx > 0 && !isTransitioning) {
        navigateToSlide(currentSlideIdx - 1);
      }
    });
  }

  if (navForwardBtn) {
    navForwardBtn.addEventListener("click", () => {
      if (currentSlideIdx < maxShownSlideIdx && !isTransitioning) {
        navigateToSlide(currentSlideIdx + 1);
      }
    });
  }

  document.querySelectorAll(".rail-seg").forEach((seg) => {
    seg.addEventListener("click", () => {
      const segNum = Number(seg.getAttribute("data-seg"));
      const chapterStartSlides = [
        SLIDE_MAP.ACT1_CINEMA,
        SLIDE_MAP.ACT2,
        SLIDE_MAP.ACT3_BEATS_START,
        SLIDE_MAP.ACT4_SETUP_START,
      ];
      const targetSlide = chapterStartSlides[segNum - 1];
      if (typeof targetSlide === "number" && targetSlide <= maxShownSlideIdx) {
        navigateToSlide(targetSlide);
      }
    });
  });

  window.addEventListener("keydown", (ev) => {
    const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (ev.key === "ArrowLeft" && currentSlideIdx > 0 && !isTransitioning) {
      ev.preventDefault();
      navigateToSlide(currentSlideIdx - 1);
    } else if (ev.key === "ArrowRight" && currentSlideIdx < maxShownSlideIdx && !isTransitioning) {
      ev.preventDefault();
      navigateToSlide(currentSlideIdx + 1);
    }
  });

  // ==========================================================================
  // STEP-BY-STEP SPOTIFY-WRAPPED SINGLE-BEAT STORYTELLER + 35MM REEL
  // (Only ONE sentence/paragraph occupies the stage at a time, with cinematic
  //  optical dissolves, mood shifts, and frontier-clamped Back/Next controls)
  // ==========================================================================
  function computeBeatReadingHoldMs(beat) {
    if (!beat || !beat.text) return 2880;
    const raw = [beat.text, beat.subtext].filter(Boolean).join(" ").trim();
    const words = raw.split(/\s+/).filter(Boolean).length;
    const chars = raw.length;
    const pauses = (raw.match(/[,:;!?…]/g) || []).length;
    const isScript = (beat.style || "").includes("script-accent");
    // 20% faster calibration across base, per-char, per-word, and pause weights
    const computed =
      (2200 + chars * 35 + words * 112 + pauses * 230 + (isScript ? 550 : 0)) * 0.8;
    return Math.round(Math.max(2880, Math.min(6240, computed)));
  }

  function playSequentialBeats(
    container,
    rawBeats,
    footerEl,
    ctaLabel,
    unlockExtraMs,
    onNext,
    reelFrames = [],
    navMeta = {}
  ) {
    container.classList.add("single-beat-stage");

    // Dynamically set every slide's hold time from its text length (20%-trimmed curve):
    // beats[idx] stays on screen for beats[idx + 1].delayMs (and the last beat for unlockExtraMs).
    const beats = (rawBeats || []).map((b, idx) => {
      if (idx === 0) return b;
      const prevHoldMs = computeBeatReadingHoldMs(rawBeats[idx - 1]);
      return Object.assign({}, b, {
        delayMs: Math.min(8000, prevHoldMs),
      });
    });
    if (beats.length > 0) {
      unlockExtraMs = Math.min(6000, computeBeatReadingHoldMs(beats[beats.length - 1]));
    }

    const sceneKey = navMeta.sceneKey || "beats";
    const startSlideIdx = typeof navMeta.startSlideIdx === "number" ? navMeta.startSlideIdx : 2;
    const endSlideIdx = startSlideIdx + beats.length - 1;
    const initialBeatIdx =
      typeof navMeta.initialBeatIdx === "number" ? navMeta.initialBeatIdx : undefined;

    const hasReel = Array.isArray(reelFrames) && reelFrames.length > 0;
    let setReelFrame = null;
    let maxUnlockedBeatIdx = Math.min(
      beats.length - 1,
      Math.max(-1, maxShownSlideIdx - startSlideIdx)
    );
    let activeBeatIdx = 0;

    // Spotify-Wrapped intra-reel segmented beat bar
    let beatSegs = [];
    if (beats.length > 1 && container.parentElement) {
      const wrappedRail = document.createElement("div");
      wrappedRail.className = "wrapped-beat-rail";
      wrappedRail.setAttribute("aria-hidden", "true");
      wrappedRail.innerHTML = beats
        .map(
          (_, i) =>
            `<span class="wrapped-seg" data-beat-seg="${i}"><i class="wrapped-seg-fill"></i></span>`
        )
        .join("");
      container.parentElement.insertBefore(wrappedRail, container);
      beatSegs = Array.from(wrappedRail.querySelectorAll(".wrapped-seg"));
    }

    function updateBeatSegs(activeIdx, holdDurationMs, isStaticHold = false) {
      beatSegs.forEach((seg, sIdx) => {
        const isUnlocked = sIdx <= maxUnlockedBeatIdx;
        seg.classList.toggle("unlocked-beat", isUnlocked && sIdx !== activeIdx);
        seg.classList.toggle("done", sIdx < activeIdx);
        seg.classList.toggle("visited-ahead", sIdx > activeIdx && sIdx <= maxUnlockedBeatIdx);
        seg.classList.remove("active");
        const fill = seg.querySelector(".wrapped-seg-fill");
        if (fill) {
          fill.style.transition = "none";
          fill.style.width =
            sIdx < activeIdx || (sIdx <= maxUnlockedBeatIdx && isStaticHold && sIdx === activeIdx)
              ? "100%"
              : sIdx > activeIdx && sIdx <= maxUnlockedBeatIdx
              ? "100%"
              : "0%";
        }
        if (sIdx === activeIdx && fill) {
          seg.classList.add("active");
          if (!isStaticHold) {
            void fill.offsetWidth;
            fill.style.transition = `width ${Math.max(600, holdDurationMs)}ms linear`;
            fill.style.width = "100%";
          } else {
            fill.style.width = "100%";
          }
        }
      });
    }

    function renderBeatCardAt(beatIdx, playAudio = true, holdMs = 3400, isStaticHold = false) {
      const beat = beats[beatIdx];
      if (!beat) return;

      activeBeatIdx = beatIdx;
      if (beat.mood) {
        setMood(beat.mood);
      }
      updateBeatSegs(beatIdx, holdMs, isStaticHold);

      container.innerHTML = "";
      const cardWrap = document.createElement("div");
      cardWrap.className = "beat-card-single";

      if (beat.subheading) {
        const eyebrow = document.createElement("span");
        eyebrow.className = "beat-eyebrow";
        eyebrow.textContent = beat.subheading;
        cardWrap.appendChild(eyebrow);
      }

      const line = document.createElement("p");
      line.className = `beat-line ${beat.style || "body"}`;
      const isScript =
        (beat.style || "").includes("script-accent") ||
        (beat.style || "").includes("font-allura");
      if (isScript) {
        line.innerHTML = `<span>${escapeHtml(beat.text)}</span>${chinaMarkerUnderlineSvg()}`;
      } else {
        line.textContent = beat.text;
      }

      cardWrap.appendChild(line);

      let subline = null;
      if (beat.subtext) {
        subline = document.createElement("p");
        subline.className = "beat-subtext";
        subline.textContent = beat.subtext;
        cardWrap.appendChild(subline);
      }

      container.appendChild(line.parentElement);

      void line.offsetWidth;
      line.classList.add("visible");
      if (subline) {
        subline.classList.add("visible");
      }

      if (playAudio) {
        Sound.playFrameAdvance(beatIdx);
      }
      line.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    if (hasReel && container.parentElement) {
      let activeReelIdx = 0;
      const carousel = document.createElement("div");
      carousel.className = "film-reel-carousel";
      carousel.innerHTML = `
        <div class="reel-sprocket-bar">
          <span class="reel-stock">KODAK 400TX</span>
          <div class="reel-controls">
            <button type="button" class="reel-nav-btn" id="reelPrevBtn" aria-label="Previous film frame" disabled>‹</button>
            <span class="reel-frame-badge" id="reelFrameCode">${reelFrames[0].code}</span>
            <button type="button" class="reel-nav-btn" id="reelNextBtn" aria-label="Next unlocked film frame" disabled>›</button>
          </div>
        </div>
        <div class="reel-viewport">
          <div class="reel-track" id="reelTrack">
            ${reelFrames
              .map(
                (rf) => `
              <div class="reel-slide">
                <img
                  src="${rf.photo}"
                  alt="35mm silver-gelatin frame ${rf.code}"
                  style="object-position: ${rf.pos || "center"}; filter: ${rf.filter || "none"};"
                />
              </div>
            `
              )
              .join("")}
          </div>
          <div class="reel-grain-tint" aria-hidden="true"></div>
        </div>
        <div class="reel-sprocket-bar bottom" aria-hidden="true">
          <span class="reel-stock-faint">SAFETY FILM</span>
          <span class="reel-stock-faint">⏐⏐⏐⏐</span>
        </div>
        <div class="kodak-subtitle-bar" id="reelSubtitleBar">${reelFrames[0].subtitle || ""}</div>
      `;

      container.parentElement.insertBefore(carousel, container);

      const trackEl = carousel.querySelector("#reelTrack");
      const frameBadge = carousel.querySelector("#reelFrameCode");
      const subBar = carousel.querySelector("#reelSubtitleBar");
      const prevBtn = carousel.querySelector("#reelPrevBtn");
      const nextBtn = carousel.querySelector("#reelNextBtn");

      setReelFrame = (targetIdx) => {
        if (maxUnlockedBeatIdx < 0) return;
        const maxFrame = Math.min(maxUnlockedBeatIdx, reelFrames.length - 1);
        const clamped = Math.max(0, Math.min(targetIdx, maxFrame));
        activeReelIdx = clamped;
        const frame = reelFrames[clamped];
        if (trackEl) {
          trackEl.style.transform = `translate3d(-${clamped * 100}%, 0, 0)`;
        }
        if (frameBadge) {
          frameBadge.textContent = `${frame.code}`;
        }
        if (subBar) {
          subBar.classList.remove("sub-fade");
          void subBar.offsetWidth;
          subBar.textContent = frame.subtitle || "";
          subBar.classList.add("sub-fade");
        }
        if (prevBtn) prevBtn.disabled = activeBeatIdx <= 0;
        if (nextBtn) nextBtn.disabled = activeBeatIdx >= maxUnlockedBeatIdx;
      };

      if (prevBtn) {
        prevBtn.addEventListener("click", () => {
          if (activeBeatIdx > 0) {
            Sound.playFrameAdvance(activeBeatIdx - 1);
            goToBeat(activeBeatIdx - 1);
          }
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", () => {
          if (activeBeatIdx < maxUnlockedBeatIdx) {
            Sound.playFrameAdvance(activeBeatIdx + 1);
            goToBeat(activeBeatIdx + 1);
          }
        });
      }
    }

    const pacing = document.createElement("div");
    pacing.className = "pacing-indicator";
    pacing.innerHTML =
      '<span class="pacing-dot"></span><span class="pacing-label" id="beatProgressLabel">Derulând cadrul 1...</span>';
    footerEl.appendChild(pacing);
    const progressLabel = pacing.querySelector("#beatProgressLabel");

    function mountSceneCtaButton() {
      persisted.completedScenes.add(sceneKey);
      pacing.classList.add("hidden");
      if (footerEl.querySelector(".primary-btn")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "primary-btn";
      btn.innerHTML = `<span>${ctaLabel}</span>${chinaMarkerArrowSvg()}`;
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.style.pointerEvents = "none";
        Sound.playFrameAdvance(beats.length);
        onNext();
      });
      footerEl.appendChild(btn);
      btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function scheduleFrontierFrom(frontierIdx) {
      let remCum = 0;
      for (let idx = frontierIdx + 1; idx < beats.length; idx++) {
        remCum += beats[idx].delayMs;
        const nextHoldMs =
          idx + 1 < beats.length
            ? beats[idx + 1].delayMs
            : unlockExtraMs || 2400;
        const exitAt = Math.max(0, remCum - 280);
        schedule(() => {
          const activeCard = container.querySelector(".beat-card-single");
          if (activeCard) activeCard.classList.add("beat-exit");
        }, exitAt);
        schedule(() => {
          maxUnlockedBeatIdx = Math.max(maxUnlockedBeatIdx, idx);
          recordSlideShown(startSlideIdx + idx);
          renderBeatCardAt(idx, true, nextHoldMs, false);
          if (setReelFrame) setReelFrame(idx);
          if (progressLabel) {
            progressLabel.textContent = `Cadrul ${idx + 1} din ${beats.length}`;
          }
        }, remCum);
      }

      schedule(() => {
        beatSegs.forEach((seg) => {
          seg.classList.remove("active");
          seg.classList.remove("visited-ahead");
          seg.classList.add("done");
        });
        mountSceneCtaButton();
      }, remCum + (unlockExtraMs || 0));
    }

    function goToBeat(targetBeatIdx) {
      const maxAllowed = Math.min(
        beats.length - 1,
        Math.max(maxUnlockedBeatIdx, maxShownSlideIdx - startSlideIdx)
      );
      if (targetBeatIdx < 0 || targetBeatIdx > maxAllowed) return;
      maxUnlockedBeatIdx = Math.max(maxUnlockedBeatIdx, maxAllowed);

      clearTimers();
      recordSlideShown(startSlideIdx + targetBeatIdx);

      const isAtFrontier =
        targetBeatIdx === maxUnlockedBeatIdx && !persisted.completedScenes.has(sceneKey);
      const nextHold =
        targetBeatIdx + 1 < beats.length
          ? beats[targetBeatIdx + 1].delayMs
          : unlockExtraMs || 2400;

      renderBeatCardAt(targetBeatIdx, false, nextHold, !isAtFrontier);
      if (setReelFrame) setReelFrame(targetBeatIdx);

      if (persisted.completedScenes.has(sceneKey)) {
        mountSceneCtaButton();
      } else if (targetBeatIdx < maxUnlockedBeatIdx) {
        pacing.classList.remove("hidden");
        if (progressLabel) {
          progressLabel.textContent = `Cadrul ${targetBeatIdx + 1} din ${beats.length} · Apasă Înainte ›`;
        }
      } else {
        pacing.classList.remove("hidden");
        if (progressLabel) {
          progressLabel.textContent = `Cadrul ${targetBeatIdx + 1} din ${beats.length}`;
        }
        scheduleFrontierFrom(targetBeatIdx);
      }
    }

    beatSegs.forEach((seg, sIdx) => {
      seg.addEventListener("click", () => {
        if (sIdx <= maxUnlockedBeatIdx && sIdx !== activeBeatIdx) {
          Sound.playFrameAdvance(sIdx);
          goToBeat(sIdx);
        }
      });
    });

    activeBeatScene = {
      startSlideIdx,
      endSlideIdx,
      goToBeat,
    };

    if (typeof initialBeatIdx === "number") {
      maxUnlockedBeatIdx = Math.max(maxUnlockedBeatIdx, initialBeatIdx);
      goToBeat(initialBeatIdx);
      return;
    }

    let cumulative = 0;
    beats.forEach((beat, idx) => {
      cumulative += beat.delayMs;
      const nextHoldMs =
        idx + 1 < beats.length
          ? beats[idx + 1].delayMs
          : unlockExtraMs || 2400;

      // Optical exit dissolve right before the next sentence replaces the current one
      if (idx > 0) {
        const exitAt = Math.max(0, cumulative - 280);
        schedule(() => {
          const activeCard = container.querySelector(".beat-card-single");
          if (activeCard) {
            activeCard.classList.add("beat-exit");
          }
        }, exitAt);
      }

      schedule(() => {
        maxUnlockedBeatIdx = Math.max(maxUnlockedBeatIdx, idx);
        recordSlideShown(startSlideIdx + idx);
        renderBeatCardAt(idx, true, nextHoldMs, false);
        if (setReelFrame && idx < reelFrames.length) {
          setReelFrame(idx);
        }
        if (progressLabel) {
          progressLabel.textContent = `Cadrul ${idx + 1} din ${beats.length}`;
        }
      }, cumulative);
    });

    schedule(() => {
      beatSegs.forEach((seg) => {
        seg.classList.remove("active");
        seg.classList.add("done");
      });
      pacing.classList.add("hidden");
      mountSceneCtaButton();
    }, cumulative + (unlockExtraMs || 0));
  }

  // ==========================================================================
  // GATE 0: BARYTA DARKROOM PROOF CARD & PEEKING 35MM STRIP
  // ==========================================================================
  function renderIntro(arg) {
    clearTimers();
    if (!hasLoggedPageOpen) {
      hasLoggedPageOpen = true;
      trackEvent("page_opened", {
        referrer: document.referrer || "",
        path: window.location.pathname + window.location.search,
      });
    }
    recordSlideShown(SLIDE_MAP.INTRO);
    setChrome(0, "Proiecție Privată", "obsidian", "midnight-amber");
    stage.innerHTML = "";

    const scene = document.createElement("div");
    scene.className = "scene intro-scene";
    scene.innerHTML = `
      <div class="intro-darkroom-stage">
        <div class="peeking-strip" aria-hidden="true">
          <div class="peeking-frame"><img src="/assets/bosphorus_ferry.jpg" alt="" /></div>
          <div class="peeking-frame"><img src="/assets/istiklal_tram.jpg" alt="" /></div>
          <span class="peeking-code">KODAK 400TX · 36A</span>
        </div>
        <div class="darkroom-proof-card">
          <div class="proof-inner-rule">
            <span class="pill-badge">${CFG.intro.badge}</span>
            <span class="proof-salutation font-allura">${CFG.intro.salutation || "Pentru"} ${CFG.meta.recipientName}</span>
            <h1 class="display-serif">${CFG.intro.title}</h1>
            ${chinaMarkerUnderlineSvg()}
            <p class="subtitle-copy">${CFG.intro.subtitle}</p>
          </div>
        </div>
      </div>
      <div class="scene-footer">
        <button type="button" class="primary-btn" id="startBtn">
          <span>${CFG.intro.cta}</span>
          ${chinaMarkerArrowSvg()}
        </button>
      </div>
    `;
    stage.appendChild(scene);

    const startBtn = document.getElementById("startBtn");
    startBtn.addEventListener("click", () => {
      if (startBtn.disabled) return;
      startBtn.disabled = true;
      startBtn.style.pointerEvents = "none";
      Sound.init();
      Sound.playFrameAdvance(0);
      trackEvent("started_journey", {
        hesitationMs: getActiveTimeMs(),
        wallDelayMs: getElapsedMs(),
        buttonLabel: CFG.intro.cta,
      });
      transitionScene(renderAct1Cinema);
    });
  }

  // ==========================================================================
  // ACT 1A: LONG SUSPENSEFUL MESSAGE ESCALATION -> BLURRED BACKGROUND ECHOES ->
  //         LEFT-ALIGNED HIGHLIGHT ON "in 7-10 noiembrie o sa fiu in Istanbul"
  //         (NO UNDERLINE) -> SLOW MORPH INTO ISTANBUL + GRIPIN -> AUTO-ADVANCE
  // ==========================================================================
  function buildAct1StreamSequence(baseFragments) {
    const src = Array.isArray(baseFragments) && baseFragments.length > 0
      ? baseFragments
      : ["00:24", "late replies :))", "orașe diferite", "🦭"];

    const rushExtras = [
      "02:41",
      "🦭",
      "ceaiul de musetel :))",
      "03:18",
      ":))",
      "arktick monkeys pe fundal 😭",
      "04:12",
      "pink noise 😭",
      "erai misterios",
      "05:04",
      "cartofi 🥔 :))",
      "did they notice tho",
      "01:50",
      "B&W filters",
      "nu vreau sa vina dimineata 😭",
      "03:52",
      "🦭 :))",
      "discuții fără sfârșit",
      "04:47",
      "voice notes",
      "peaky blinders propaganda 😭",
      "05:36",
      ":))",
      "ore aleatorii",
      "00:19",
      "vintage digital camera",
      "02:29",
      "🦭",
      "conversații neterminate",
      "03:44",
      "ceai târziu",
      "04:33",
      ":)) 😭",
      "orașe diferite",
      "01:12",
    ];
    const brakeTail = [
      "prea multe mesaje",
      "fusuri orare",
      "mai ești trează?",
      "conversații lungi",
      "01:39",
    ];

    const head = src.slice(0, Math.max(0, src.length - 5));
    return head.concat(rushExtras, brakeTail);
  }

  function buildAct1VelocitySchedule(count) {
    const slowPhase = [650, 1280, 1220, 1160, 1100, 1020, 940];
    const accelPhase = [
      780, 680, 590, 515, 450, 395, 345, 305,
      270, 240, 214, 192, 174, 158, 144, 132,
    ];
    const brakePhase = [160, 280, 440, 650, 920];

    const rushCount = Math.max(1, count - slowPhase.length - accelPhase.length - brakePhase.length);
    const rushPhase = [];
    for (let r = 0; r < rushCount; r++) {
      const ratio = r / Math.max(1, rushCount - 1);
      const curve = Math.sin(ratio * Math.PI);
      const ms = Math.round(112 - curve * 68);
      rushPhase.push(Math.max(44, ms));
    }

    const allIntervals = slowPhase.concat(accelPhase, rushPhase, brakePhase);
    const scheduleTimes = [];
    let acc = 0;
    for (let i = 0; i < count; i++) {
      acc += allIntervals[i] !== undefined ? allIntervals[i] : 60;
      scheduleTimes.push(acc);
    }
    return scheduleTimes;
  }

  function renderAct1Cinema(arg) {
    clearTimers();
    const navOpts = extractNavOpts(arg);
    const isRevisit = !!navOpts.revisit;
    recordSlideShown(SLIDE_MAP.ACT1_CINEMA);
    setChrome(1, CFG.act1.chapterLabel, "curiosity", "midnight-amber");
    stage.innerHTML = "";

    const template = document.getElementById("act1CinemaTemplate");
    let scene;
    if (template && template.content && template.content.firstElementChild) {
      scene = template.content.firstElementChild.cloneNode(true);
    } else {
      scene = document.createElement("div");
      scene.className = "scene act1-scene";
      scene.innerHTML = `
        <div class="prologue-cinema vintage-cinema" id="cinemaBox">
          <div class="istanbul-stage" id="istanbulStage" data-coords="41.0082° N · 28.9784° E">
            <div class="film-strip-vertical">
              <div class="sprocket-rail left" aria-hidden="true">
                <span class="edge-code">KODAK 400TX</span>
                <span class="edge-num">36</span>
                <span class="edge-code">FILM</span>
              </div>
              <div class="istanbul-cinema-frame">
                <div class="istanbul-photo-layer ken-burns">
                  <img src="${CFG.act1.heroPhoto || "/assets/istiklal_tram.jpg"}" alt="Historic Istiklal tramway in morning mist" class="istanbul-visual" />
                </div>
                <div class="istanbul-light-leak" aria-hidden="true"></div>
                <div class="istanbul-frame-border" aria-hidden="true"></div>
              </div>
              <div class="sprocket-rail right" aria-hidden="true">
                <span class="edge-num">${CFG.act1.heroFrameCode || "36A"}</span>
                <span class="edge-barcode" aria-hidden="true">⏐⏐⏐⏐</span>
                <span class="edge-num">37</span>
              </div>
            </div>
            <div class="istanbul-meta-overlay">
              <h2 class="city-title font-allura script-accent">${CFG.act1.heroTitle || "Printre pași, împiedicări și povești"}</h2>
              <p class="city-location-subtitle">${CFG.act1.heroLocationSubtitle || "Istanbul"}</p>
              <p class="cinema-caption kodak-subtitle">${CFG.act1.heroSubtitle || "Mesajele s-au transformat, în sfârșit, în realitate."}</p>
            </div>
          </div>
          <div class="morph-flare" id="morphFlare" aria-hidden="true"></div>
          <div class="pivot-msg-stage" id="pivotMsgStage"></div>
          <div class="msg-stream" id="msgStream"></div>
        </div>
      `;
    }
    stage.appendChild(scene);

    const cityTitleEl = scene.querySelector(".city-title");
    if (cityTitleEl && CFG.act1.heroTitle) {
      cityTitleEl.textContent = CFG.act1.heroTitle;
    }
    const cityLocEl = scene.querySelector(".city-location-subtitle");
    if (cityLocEl && CFG.act1.heroLocationSubtitle) {
      cityLocEl.textContent = CFG.act1.heroLocationSubtitle;
    }
    const cityCapEl = scene.querySelector(".cinema-caption");
    if (cityCapEl && CFG.act1.heroSubtitle) {
      cityCapEl.textContent = CFG.act1.heroSubtitle;
    }

    const cinemaBox = document.getElementById("cinemaBox");
    const stream = document.getElementById("msgStream");
    const pivotMsgStage = document.getElementById("pivotMsgStage");
    const morphFlare = document.getElementById("morphFlare");
    const istanbulStage = document.getElementById("istanbulStage");
    const fragments = buildAct1StreamSequence(CFG.act1.floatingFragments);
    const pivotMessage =
      CFG.act1.pivotMessage || "in 7-10 noiembrie o sa fiu in Istanbul";
    const pivotTimestamp = CFG.act1.pivotTimestamp || "01:42";

    const echoSlots = [
      { top: 6, align: "right" },
      { top: 13, align: "left" },
      { top: 19, align: "center" },
      { top: 26, align: "right" },
      { top: 33, align: "center" },
      { top: 41, align: "right" },
      { top: 49, align: "right" },
      { top: 56, align: "center" },
      { top: 63, align: "right" },
      { top: 70, align: "left" },
      { top: 76, align: "right" },
      { top: 82, align: "center" },
      { top: 87, align: "left" },
      { top: 16, align: "right" },
      { top: 73, align: "center" },
      { top: 90, align: "right" },
    ];
    const echoStartIdx = Math.max(0, fragments.length - echoSlots.length);

    // Revisit mode (when stepping Back from Act 1B): show the left-aligned highlighted
    // message over the blurred old messages immediately, then morph calmly into Istanbul
    if (isRevisit) {
      if (stream) {
        fragments.slice(echoStartIdx).forEach((frag, idx) => {
          const slot = echoSlots[idx % echoSlots.length];
          const b = document.createElement("span");
          const isTimecode = /^\d{2}:\d{2}$/.test(frag.trim());
          const variantClass = isTimecode ? "is-timecode" : "mine";
          b.className = `floating-bubble ${variantClass} align-${slot.align} lingering-echo instant-echo`;
          b.textContent = frag;
          b.style.top = `${slot.top}%`;
          stream.appendChild(b);
        });
        stream.classList.add("blurred-backdrop");
      }
      if (pivotMsgStage) {
        pivotMsgStage.innerHTML = `
          <div class="pivot-message-card">
            <span class="pivot-msg-time">${escapeHtml(pivotTimestamp)}</span>
            <p class="pivot-msg-text">${escapeHtml(pivotMessage)}</p>
          </div>
        `;
        void pivotMsgStage.offsetWidth;
        pivotMsgStage.classList.add("frozen");
      }
      schedule(() => {
        setMood("istiklal-gold");
        if (stream) stream.classList.add("fade-out");
        if (morphFlare) morphFlare.classList.add("bloom");
        if (pivotMsgStage) pivotMsgStage.classList.add("morphing-into-city");
        if (istanbulStage) istanbulStage.classList.add("active");
      }, 3000);
      return;
    }

    const fragTimes = buildAct1VelocitySchedule(fragments.length);
    const tensionStartMs = fragTimes[7] || 6650;
    const rushStartMs = fragTimes[23] || 12100;
    const brakeStartMs = fragTimes[fragments.length - 5] || 16700;
    const lastFragTime = fragTimes[fragTimes.length - 1] || 18700;

    // Dramatic suspense beats after the message whirlpool:
    const RACK_FOCUS_AT_MS = lastFragTime + 800;     // old messages stay on screen & blur into background
    const FREEZE_AT_MS = RACK_FOCUS_AT_MS + 1250;    // left-aligned Istanbul message focuses in sharp
    const MORPH_AT_MS = FREEZE_AT_MS + 3900;         // slow 3.4s optical morph into city + Gripin drop
    const AUTO_ADVANCE_AT_MS = MORPH_AT_MS + 6700;   // soak in Istanbul & read title/subtitle cleanly before first words

    const laneTops = [9, 23, 38, 53, 68, 82];
    const laneAligns = ["left", "right", "center", "left", "right", "center"];

    // Phase 2 cue: Heartbeat + rising analog tension build kicks in
    schedule(() => {
      if (cinemaBox) cinemaBox.classList.add("building-tension");
      setMood("velvet-sepia");
      Sound.playSuspenseBuild((RACK_FOCUS_AT_MS - tensionStartMs) / 1000);
    }, tensionStartMs);

    // Phase 3 cue: High-speed projector whirlpool
    schedule(() => {
      if (stream) stream.classList.add("rushing-gate");
      setMood("crimson-suspense");
    }, rushStartMs);

    // Phase 4A cue: Physical reel brake
    schedule(() => {
      if (stream) stream.classList.remove("rushing-gate");
    }, brakeStartMs);

    fragments.forEach((frag, i) => {
      const isLingeringEcho = i >= echoStartIdx;
      const echoSlot = isLingeringEcho ? echoSlots[i - echoStartIdx] : null;
      const lane = (i * 5 + Math.floor(i / 6)) % laneTops.length;
      const fireAt = fragTimes[i];
      const isSlow = i < 7;
      const isRushing = i >= 23 && i < fragments.length - 5;
      const isBraking = i >= fragments.length - 5;
      const progress = Math.min(1, i / Math.max(1, fragments.length - 6));

      const lenBonus = Math.min(1.35, Math.max(0, frag.length - 6) * 0.042);
      let durSec = 2.4;
      if (isSlow) {
        durSec = 2.35 - i * 0.05 + lenBonus;
      } else if (isBraking) {
        const bIdx = i - (fragments.length - 5);
        durSec = 1.15 + bIdx * 0.26 + lenBonus * 0.7;
      } else if (isLingeringEcho) {
        durSec = 0.85;
      } else if (isRushing) {
        durSec = 0.42;
      } else {
        const aIdx = i - 7;
        const accelDecay = Math.max(0.25, 1 - aIdx * 0.055);
        durSec = Math.max(0.68, 1.95 - aIdx * 0.072 + lenBonus * accelDecay);
      }

      schedule(() => {
        if (!stream) return;
        const b = document.createElement("span");
        const isTimecode = /^\d{2}:\d{2}$/.test(frag.trim());
        const isShortScript =
          !isTimecode && (frag.length <= 16 || frag === "🦭" || frag === ":))");

        let variantClass = "mine";
        if (isTimecode) {
          variantClass = "is-timecode";
        } else if (isShortScript && i % 2 === 0) {
          variantClass = "is-script font-allura";
        }

        const alignDir = echoSlot ? echoSlot.align : laneAligns[lane];
        const motionClass = isLingeringEcho
          ? " lingering-echo"
          : isRushing
          ? " is-rushing"
          : "";

        b.className = `floating-bubble ${variantClass} align-${alignDir}${motionClass}`;
        b.textContent = frag;
        b.style.top = `${echoSlot ? echoSlot.top : laneTops[lane]}%`;
        b.style.setProperty("--whisper-dur", `${durSec.toFixed(2)}s`);
        stream.appendChild(b);

        if (!isRushing || i % 2 === 0) {
          Sound.playReelTick(
            isBraking ? Math.max(0.12, 0.55 - (i - (fragments.length - 5)) * 0.1) : progress
          );
        }
      }, fireAt);
    });

    // PHASE 4B: Sub-bass tape-brake hush — old messages stay on screen & rack-focus into a soft background blur
    schedule(() => {
      if (stream) stream.classList.add("blurred-backdrop");
      if (cinemaBox) {
        cinemaBox.classList.remove("building-tension");
      }
      Sound.playFreezeDrop();
    }, RACK_FOCUS_AT_MS);

    // PHASE 5: Left-aligned "in 7-10 noiembrie o sa fiu in Istanbul" comes into crisp focus
    // over the blurred old messages in the background (with NO underline!)
    schedule(() => {
      if (stream) stream.classList.add("blurred-backdrop");
      Sound.playPivotArrival();

      if (pivotMsgStage) {
        pivotMsgStage.innerHTML = `
          <div class="pivot-message-card">
            <span class="pivot-msg-time">${escapeHtml(pivotTimestamp)}</span>
            <p class="pivot-msg-text">${escapeHtml(pivotMessage)}</p>
          </div>
        `;
        void pivotMsgStage.offsetWidth;
        pivotMsgStage.classList.add("frozen");
      }
    }, FREEZE_AT_MS);

    // PHASE 6: Slow dramatic optical morph into Istanbul + Gripin "Var Bir İhtimal" drop!
    schedule(() => {
      setMood("istiklal-gold");
      Sound.playIstanbulMorph();
      Sound.start505AtIstanbul();
      trackEvent("istanbul_reveal_reached", { isRevisit });

      if (stream) stream.classList.add("fade-out");
      if (morphFlare) morphFlare.classList.add("bloom");
      if (pivotMsgStage) pivotMsgStage.classList.add("morphing-into-city");
      if (istanbulStage) istanbulStage.classList.add("active");
    }, MORPH_AT_MS);

    const goToAct1Beats = () => {
      transitionScene(renderAct1Beats);
    };

    // Automatically dissolve from the Istanbul 35mm reveal straight into the first words (no button!)
    schedule(goToAct1Beats, AUTO_ADVANCE_AT_MS);
  }

  // ==========================================================================
  // ACT 1B: PURE CURIOSITY — SINGLE-SENTENCE WRAPPED CARDS + 35MM REEL
  // ==========================================================================
  function renderAct1Beats(arg) {
    clearTimers();
    const navOpts = extractNavOpts(arg);
    setChrome(1, CFG.act1.chapterLabel, "curiosity", "midnight-amber");
    stage.innerHTML = "";

    const scene = document.createElement("div");
    scene.className = "scene";
    const stack = document.createElement("div");
    stack.className = "beats-stack";
    const footer = document.createElement("div");
    footer.className = "scene-footer";

    scene.appendChild(stack);
    scene.appendChild(footer);
    stage.appendChild(scene);

    playSequentialBeats(
      stack,
      CFG.act1.beats,
      footer,
      CFG.act1.cta,
      CFG.act1.unlockDelayAfterLastBeatMs,
      () => {
        trackEvent("completed_act_1");
        transitionScene(renderAct2Prelude);
      },
      CFG.act1.reelFrames,
      {
        sceneKey: "act1",
        startSlideIdx: SLIDE_MAP.ACT1_BEATS_START,
        initialBeatIdx: navOpts.initialBeatIdx,
      }
    );
  }

  // ==========================================================================
  // ACT 2A PRELUDE: PLAYFUL DARKROOM INTERTITLE BEFORE THE CIRCLING SECTION
  // ==========================================================================
  function renderAct2Prelude(arg) {
    clearTimers();
    const navOpts = extractNavOpts(arg);
    recordSlideShown(SLIDE_MAP.ACT2_PRELUDE);
    setChrome(2, CFG.act2.chapterLabel, "notes", "safelight-rose");
    stage.innerHTML = "";

    const preludeLine =
      (CFG.act2 && CFG.act2.preludeText) ||
      "Atenție: urmează câteva complimente asumate :))";

    const scene = document.createElement("div");
    scene.className = "scene act2-prelude-scene";
    scene.innerHTML = `
      <div class="act2-prelude-card">
        <span class="prelude-eyebrow">Rola II · Înainte de planșă</span>
        <p class="prelude-statement">${escapeHtml(preludeLine)}</p>
        <div class="prelude-flourish">${chinaMarkerUnderlineSvg()}</div>
      </div>
      <div class="scene-footer" id="preludeFooter"></div>
    `;
    stage.appendChild(scene);

    Sound.playFrameAdvance(1);

    const footerEl = scene.querySelector("#preludeFooter");
    if (navOpts.isNavOpts) {
      const contBtn = document.createElement("button");
      contBtn.type = "button";
      contBtn.className = "primary-btn";
      contBtn.innerHTML = `<span>${CFG.act2.cta || "Continuă"}</span>${chinaMarkerArrowSvg()}`;
      contBtn.addEventListener("click", () => {
        if (contBtn.disabled) return;
        contBtn.disabled = true;
        contBtn.style.pointerEvents = "none";
        Sound.playFrameAdvance(2);
        transitionScene(renderAct2);
      });
      if (footerEl) footerEl.appendChild(contBtn);
    } else {
      schedule(() => {
        transitionScene(renderAct2);
      }, 1600);
    }
  }

  // ==========================================================================
  // ACT 2: 2x2 CONTACT SHEET + RED CHINA MARKER + ANTIQUE BRASS LOUPE
  // ==========================================================================
  function renderAct2(arg) {
    clearTimers();
    recordSlideShown(SLIDE_MAP.ACT2);
    setChrome(2, CFG.act2.chapterLabel, "notes", "velvet-sepia");
    stage.innerHTML = "";

    const total = CFG.act2.cards.length;
    const unlocked = persisted.act2Unlocked;

    const scene = document.createElement("div");
    scene.className = "scene contact-scene";

    const header = document.createElement("div");
    header.className = "notes-header";
    header.innerHTML = `
      <h2 class="notes-headline">${CFG.act2.headline}</h2>
      <div class="notes-sub">
        <span>${CFG.act2.subheadline}</span>
        <span class="unlock-counter" id="unlockCounter">${unlocked.size} / ${total}</span>
      </div>
    `;

    const sheetWrap = document.createElement("div");
    sheetWrap.className = "contact-sheet-wrap";

    const topEdge = document.createElement("div");
    topEdge.className = "contact-sheet-edge";
    topEdge.innerHTML = `<span>KODAK 400TX</span><span>CONTACT PROOF</span><span>SHEET II</span>`;

    const grid = document.createElement("div");
    grid.className = "cards-grid";

    const bottomEdge = document.createElement("div");
    bottomEdge.className = "contact-sheet-edge";
    bottomEdge.innerHTML = `<span>13A · 16A</span><span>SILVER GELATIN</span>`;

    sheetWrap.appendChild(topEdge);
    sheetWrap.appendChild(grid);
    sheetWrap.appendChild(bottomEdge);

    const inspector = document.createElement("div");
    inspector.className = "baryta-proof-tray";
    inspector.id = "loupeInspector";
    inspector.innerHTML = `
      <div class="darkroom-margin-standby">
        <span class="crop-tick tl" aria-hidden="true"></span>
        <span class="crop-tick tr" aria-hidden="true"></span>
        <span class="crop-tick bl" aria-hidden="true"></span>
        <span class="crop-tick br" aria-hidden="true"></span>
        <div class="standby-code-row">
          <span>PLANȘA II · 13A · 16A</span>
          <span>CREION ROȘU</span>
        </div>
        <p class="standby-prompt">Apasă pe oricare cadru de mai sus ca să-l încercuiești și să citești nota de pe marginea planșei.</p>
      </div>
    `;

    const footer = document.createElement("div");
    footer.className = "scene-footer";
    const lockHint = document.createElement("div");
    lockHint.className = "pacing-indicator";
    lockHint.innerHTML =
      '<span class="pacing-dot"></span><span class="pacing-label">Încercuiește toate cele 4 cadre de mai sus ca să continui...</span>';
    footer.appendChild(lockHint);

    const cardMoods = ["velvet-sepia", "bosphorus-silver", "midnight-amber", "istiklal-gold"];

    function inspectCardInLoupe(card, fallbackCode) {
      const code = card.frameCode || fallbackCode;
      const obsTag = card.tag || "NOTĂ DE PLANȘĂ";
      inspector.innerHTML = `
        <article class="baryta-proof-slip">
          <span class="crop-tick tl" aria-hidden="true"></span>
          <span class="crop-tick tr" aria-hidden="true"></span>
          <span class="crop-tick bl" aria-hidden="true"></span>
          <span class="crop-tick br" aria-hidden="true"></span>
          <div class="baryta-proof-meta">
            <span class="baryta-proof-code">CADRUL ${escapeHtml(code)} · ${escapeHtml(obsTag)}</span>
            <span class="baryta-proof-mark">${chinaMarkerMarginMarkSvg()}<span>ÎNCERCUIT</span></span>
          </div>
          <div class="baryta-proof-heading">
            <h3 class="font-allura baryta-proof-title">${escapeHtml(card.frontTitle)}</h3>
          </div>
          <p class="baryta-proof-body">${escapeHtml(card.backText)}</p>
        </article>
      `;
    }

    function mountAct2NextBtn() {
      setMood("warm-dawn");
      lockHint.classList.add("hidden");
      if (footer.querySelector("#nextBtn")) return;
      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "primary-btn";
      nextBtn.id = "nextBtn";
      nextBtn.innerHTML = `<span>${CFG.act2.cta}</span>${chinaMarkerArrowSvg()}`;
      nextBtn.addEventListener("click", () => {
        if (nextBtn.disabled) return;
        nextBtn.disabled = true;
        nextBtn.style.pointerEvents = "none";
        Sound.playFrameAdvance(2);
        trackEvent("completed_act_2");
        transitionScene(renderAct3);
      });
      footer.appendChild(nextBtn);
      nextBtn.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function logRepeatObservationTap(cardId, cardTitle, code, count) {
      trackEvent("inspected_observation", {
        cardId,
        cardTitle,
        frameCode: code,
        unlockedCount: count,
      });
    }

    CFG.act2.cards.forEach((card, idx) => {
      const fallbackCode = `${13 + idx}A`;
      const frameCode = card.frameCode || fallbackCode;
      const photo = card.photo || "/assets/bosphorus_ferry.jpg";
      const alreadyUnlocked = unlocked.has(card.id);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "note-card" + (alreadyUnlocked ? " unlocked" : "");
      btn.innerHTML = `
        <div class="contact-rebate-top">
          <span class="contact-frame-num">${frameCode}</span>
          <span class="card-status" data-status>${alreadyUnlocked ? "încercuit" : "vezi"}</span>
        </div>
        <div class="contact-thumb-wrap">
          <img src="${photo}" alt="${escapeHtml(card.frontTitle)}" class="contact-thumb" />
          ${chinaMarkerCircleSvg()}
        </div>
        <div class="card-front-title">${card.frontTitle}</div>
        <p class="card-back-copy">${card.backText}</p>
      `;

      if (persisted.act2LastCardIdx === idx) {
        btn.classList.add("active-loupe");
        inspectCardInLoupe(card, fallbackCode);
      }

      btn.addEventListener("click", () => {
        grid.querySelectorAll(".note-card").forEach((el) => el.classList.remove("active-loupe"));
        btn.classList.add("active-loupe");
        persisted.act2LastCardIdx = idx;
        setMood(cardMoods[idx % cardMoods.length]);
        inspectCardInLoupe(card, fallbackCode);
        Sound.playGreasePencil();

        if (unlocked.has(card.id)) logRepeatObservationTap(card.id, card.frontTitle, frameCode, unlocked.size);
        if (unlocked.has(card.id)) return;
        unlocked.add(card.id);
        btn.classList.add("unlocked");
        btn.querySelector("[data-status]").textContent = "încercuit";
        document.getElementById("unlockCounter").textContent = `${unlocked.size} / ${total}`;
        trackEvent("unlocked_observation", {
          cardId: card.id,
          cardTitle: card.frontTitle,
          frameCode,
          unlockedCount: unlocked.size,
        });

        if (unlocked.size === total) {
          schedule(() => {
            mountAct2NextBtn();
          }, 650);
        }
      });

      // Stagger entrance of contact-sheet frames
      btn.style.opacity = "0";
      btn.style.transform = "translateY(10px)";
      schedule(() => {
        btn.style.transition =
          "opacity 0.5s ease, transform 0.5s ease, background 0.3s ease, border-color 0.35s ease";
        btn.style.opacity = "1";
        btn.style.transform = "translateY(0)";
      }, 180 + idx * 140);

      grid.appendChild(btn);
    });

    scene.appendChild(header);
    scene.appendChild(sheetWrap);
    scene.appendChild(inspector);
    scene.appendChild(footer);
    stage.appendChild(scene);

    if (unlocked.size === total) {
      mountAct2NextBtn();
    }
  }

  // ==========================================================================
  // ACT 3: THE HONEST TRUTH (SINGLE-BEAT WRAPPED CARDS + FOCUS PULL REEL)
  // ==========================================================================
  function renderAct3(arg) {
    clearTimers();
    const navOpts = extractNavOpts(arg);
    setChrome(3, CFG.act3.chapterLabel, "truth", "bosphorus-silver");
    stage.innerHTML = "";

    const scene = document.createElement("div");
    scene.className = "scene";
    const stack = document.createElement("div");
    stack.className = "beats-stack";
    const footer = document.createElement("div");
    footer.className = "scene-footer";

    scene.appendChild(stack);
    scene.appendChild(footer);
    stage.appendChild(scene);

    playSequentialBeats(
      stack,
      CFG.act3.beats,
      footer,
      CFG.act3.cta,
      CFG.act3.unlockDelayAfterLastBeatMs,
      () => {
        trackEvent("completed_act_3");
        transitionScene(renderAct5Setup);
      },
      CFG.act3.reelFrames,
      {
        sceneKey: "act3",
        startSlideIdx: SLIDE_MAP.ACT3_BEATS_START,
        initialBeatIdx: navOpts.initialBeatIdx,
      }
    );
  }

  // ==========================================================================
  // ACT 4A: PROPUNEREA — SINGLE-BEAT BUILD-UP -> FACETIME REVEAL CARD
  // ==========================================================================
  function renderAct5Setup(arg) {
    clearTimers();
    const navOpts = extractNavOpts(arg);
    setChrome(4, CFG.act4.chapterLabel, "nightmare", "velvet-sepia");
    stage.innerHTML = "";

    const scene = document.createElement("div");
    scene.className = "scene";

    const headerCluster = document.createElement("div");
    headerCluster.className = "act5-setup-header";

    const badgeWrap = document.createElement("div");
    badgeWrap.className = "cinema-cue-wrap";
    badgeWrap.innerHTML = `
      <span class="pill-badge warning">${escapeHtml(CFG.act4.warningBadge)}</span>
      ${chinaMarkerUnderlineSvg()}
    `;
    headerCluster.appendChild(badgeWrap);

    const setupBeats = CFG.act4.setupBeats;
    const wrappedRail = document.createElement("div");
    wrappedRail.className = "wrapped-beat-rail";
    wrappedRail.setAttribute("aria-hidden", "true");
    wrappedRail.innerHTML = setupBeats
      .map(
        (_, i) =>
          `<span class="wrapped-seg" data-beat-seg="${i}"><i class="wrapped-seg-fill"></i></span>`
      )
      .join("");
    headerCluster.appendChild(wrappedRail);
    const beatSegs = Array.from(wrappedRail.querySelectorAll(".wrapped-seg"));

    const topWrap = document.createElement("div");
    topWrap.className = "beats-stack single-beat-stage";

    const footer = document.createElement("div");
    footer.className = "scene-footer";
    const pacing = document.createElement("div");
    pacing.className = "pacing-indicator";
    pacing.innerHTML =
      '<span class="pacing-dot"></span><span class="pacing-label" id="act5Status">Respiră liniștit...</span>';
    footer.appendChild(pacing);

    scene.appendChild(headerCluster);
    scene.appendChild(topWrap);
    scene.appendChild(footer);
    stage.appendChild(scene);

    function mountTermsButton() {
      persisted.completedScenes.add("act5reveal");
      if (footer.querySelector("#termsBtn")) return;
      const termsBtn = document.createElement("button");
      termsBtn.type = "button";
      termsBtn.className = "primary-btn";
      termsBtn.id = "termsBtn";
      termsBtn.innerHTML = `<span>${CFG.act4.openContractButton}</span>${chinaMarkerArrowSvg()}`;
      termsBtn.addEventListener("click", () => {
        if (termsBtn.disabled) return;
        termsBtn.disabled = true;
        termsBtn.style.pointerEvents = "none";
        Sound.playFrameAdvance(4);
        trackEvent("opened_terms", { buttonLabel: CFG.act4.openContractButton });
        transitionScene(renderAct5Contract);
      });
      footer.appendChild(termsBtn);
      termsBtn.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function showNightmareRevealCard(immediateTerms = false) {
      clearTimers();
      activeBeatScene = null;
      recordSlideShown(SLIDE_MAP.ACT4_REVEAL);
      pacing.classList.add("hidden");
      const existingRevealBtn = footer.querySelector("#revealBtn");
      if (existingRevealBtn) existingRevealBtn.remove();

      beatSegs.forEach((seg) => {
        seg.classList.remove("active");
        seg.classList.add("done");
        seg.classList.add("unlocked-beat");
      });

      setMood("safelight-rose");
      topWrap.innerHTML = "";
      const box = document.createElement("div");
      box.className = "nightmare-reveal-box";
      box.innerHTML = `
        <span class="nightmare-frame-label font-allura">${escapeHtml(CFG.act4.revealEyebrow || "Propunerea")}</span>
        <div class="nightmare-circled-wrap">
          <h2 class="nightmare-big">${CFG.act4.nightmareTitle}</h2>
          ${chinaMarkerWideOvalSvg()}
        </div>
        <p class="nightmare-sub">${CFG.act4.nightmareSubtitle}</p>
      `;
      topWrap.appendChild(box);
      box.scrollIntoView({ behavior: "smooth", block: "nearest" });

      if (immediateTerms || persisted.completedScenes.has("act5reveal")) {
        mountTermsButton();
      } else {
        schedule(() => {
          mountTermsButton();
        }, 2000);
      }
    }

    function mountRevealButton() {
      persisted.completedScenes.add("act5setup");
      pacing.classList.add("hidden");
      if (footer.querySelector("#revealBtn")) return;
      const revealBtn = document.createElement("button");
      revealBtn.type = "button";
      revealBtn.className = "primary-btn";
      revealBtn.id = "revealBtn";
      revealBtn.innerHTML = `<span>${CFG.act4.revealButton}</span>${chinaMarkerArrowSvg()}`;

      revealBtn.addEventListener("click", () => {
        if (revealBtn.disabled) return;
        revealBtn.disabled = true;
        revealBtn.style.pointerEvents = "none";
        revealBtn.remove();
        Sound.playFreezeDrop();
        Sound.playGreasePencil();
        trackEvent("revealed_nightmare");
        showNightmareRevealCard(false);
      });

      footer.appendChild(revealBtn);
      revealBtn.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    let maxUnlockedSetupIdx = Math.min(
      setupBeats.length - 1,
      Math.max(-1, maxShownSlideIdx - SLIDE_MAP.ACT5_SETUP_START)
    );
    let activeSetupIdx = 0;

    function renderSetupBeatAt(idx, playAudio = true, holdMs = 2400, isStatic = false) {
      const b = setupBeats[idx];
      if (!b) return;
      activeSetupIdx = idx;
      if (b.mood) setMood(b.mood);

      beatSegs.forEach((seg, sIdx) => {
        seg.classList.toggle("unlocked-beat", sIdx <= maxUnlockedSetupIdx && sIdx !== idx);
        seg.classList.toggle("done", sIdx < idx);
        seg.classList.toggle("visited-ahead", sIdx > idx && sIdx <= maxUnlockedSetupIdx);
        seg.classList.remove("active");
        const fill = seg.querySelector(".wrapped-seg-fill");
        if (fill) {
          fill.style.transition = "none";
          fill.style.width =
            sIdx < idx || (sIdx <= maxUnlockedSetupIdx && (isStatic || sIdx > idx))
              ? "100%"
              : "0%";
        }
        if (sIdx === idx && fill) {
          seg.classList.add("active");
          if (!isStatic) {
            void fill.offsetWidth;
            fill.style.transition = `width ${Math.max(600, holdMs)}ms linear`;
            fill.style.width = "100%";
          } else {
            fill.style.width = "100%";
          }
        }
      });

      topWrap.innerHTML = "";
      const cardWrap = document.createElement("div");
      cardWrap.className = "beat-card-single";
      if (b.subheading) {
        const eye = document.createElement("span");
        eye.className = "beat-eyebrow";
        eye.textContent = b.subheading;
        cardWrap.appendChild(eye);
      }
      const p = document.createElement("p");
      p.className = idx === setupBeats.length - 1 ? "beat-line lead" : "beat-line body";
      p.textContent = b.text;
      cardWrap.appendChild(p);
      topWrap.appendChild(cardWrap);

      void p.offsetWidth;
      p.classList.add("visible");
      if (playAudio) Sound.playFrameAdvance(idx);
      p.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function goToSetupBeat(targetBeatIdx) {
      const maxAllowed = Math.min(
        setupBeats.length - 1,
        Math.max(maxUnlockedSetupIdx, maxShownSlideIdx - SLIDE_MAP.ACT5_SETUP_START)
      );
      if (targetBeatIdx < 0 || targetBeatIdx > maxAllowed) return;
      maxUnlockedSetupIdx = Math.max(maxUnlockedSetupIdx, maxAllowed);

      clearTimers();
      const existingTerms = footer.querySelector("#termsBtn");
      if (existingTerms) existingTerms.remove();

      recordSlideShown(SLIDE_MAP.ACT5_SETUP_START + targetBeatIdx);
      const isFrontier =
        targetBeatIdx === maxUnlockedSetupIdx && !persisted.completedScenes.has("act5setup");
      const holdMs =
        targetBeatIdx + 1 < setupBeats.length ? setupBeats[targetBeatIdx + 1].delayMs : 2200;
      renderSetupBeatAt(targetBeatIdx, false, holdMs, !isFrontier);

      if (persisted.completedScenes.has("act5setup")) {
        mountRevealButton();
      } else if (targetBeatIdx < maxUnlockedSetupIdx) {
        pacing.classList.remove("hidden");
      } else {
        pacing.classList.remove("hidden");
        let rem = 0;
        for (let k = targetBeatIdx + 1; k < setupBeats.length; k++) {
          rem += setupBeats[k].delayMs;
          const nextHold = k + 1 < setupBeats.length ? setupBeats[k + 1].delayMs : 2200;
          schedule(() => {
            const prevCard = topWrap.querySelector(".beat-card-single");
            if (prevCard) prevCard.classList.add("beat-exit");
          }, Math.max(0, rem - 360));
          schedule(() => {
            maxUnlockedSetupIdx = Math.max(maxUnlockedSetupIdx, k);
            recordSlideShown(SLIDE_MAP.ACT5_SETUP_START + k);
            renderSetupBeatAt(k, true, nextHold, false);
          }, rem);
        }
        schedule(() => {
          beatSegs.forEach((seg) => {
            seg.classList.remove("active");
            seg.classList.add("done");
          });
          mountRevealButton();
        }, rem + 2200);
      }
    }

    beatSegs.forEach((seg, sIdx) => {
      seg.addEventListener("click", () => {
        if (SLIDE_MAP.ACT5_SETUP_START + sIdx <= maxShownSlideIdx) {
          Sound.playFrameAdvance(sIdx);
          activeBeatScene = {
            startSlideIdx: SLIDE_MAP.ACT5_SETUP_START,
            endSlideIdx: SLIDE_MAP.ACT5_SETUP_START + setupBeats.length - 1,
            goToBeat: goToSetupBeat,
          };
          goToSetupBeat(sIdx);
        }
      });
    });

    if (navOpts.openRevealDirectly) {
      showNightmareRevealCard(true);
      return;
    }

    activeBeatScene = {
      startSlideIdx: SLIDE_MAP.ACT5_SETUP_START,
      endSlideIdx: SLIDE_MAP.ACT5_SETUP_START + setupBeats.length - 1,
      goToBeat: goToSetupBeat,
    };

    if (typeof navOpts.initialBeatIdx === "number") {
      maxUnlockedSetupIdx = Math.max(maxUnlockedSetupIdx, navOpts.initialBeatIdx);
      goToSetupBeat(navOpts.initialBeatIdx);
      return;
    }

    let cumulative = 0;
    setupBeats.forEach((b, i) => {
      cumulative += b.delayMs;
      const holdMs = i + 1 < setupBeats.length ? setupBeats[i + 1].delayMs : 2200;

      if (i > 0) {
        schedule(() => {
          const prevCard = topWrap.querySelector(".beat-card-single");
          if (prevCard) prevCard.classList.add("beat-exit");
        }, Math.max(0, cumulative - 360));
      }

      schedule(() => {
        maxUnlockedSetupIdx = Math.max(maxUnlockedSetupIdx, i);
        recordSlideShown(SLIDE_MAP.ACT5_SETUP_START + i);
        renderSetupBeatAt(i, true, holdMs, false);
      }, cumulative);
    });

    schedule(() => {
      beatSegs.forEach((seg) => {
        seg.classList.remove("active");
        seg.classList.add("done");
      });
      mountRevealButton();
    }, cumulative + 2200);
  }

  // ==========================================================================
  // ACT 4B: BARYTA CREAM SURVIVAL CONTRACT & RED CHINA-MARKER SIGNATURE
  // ==========================================================================
  function renderAct5Contract(arg) {
    clearTimers();
    recordSlideShown(SLIDE_MAP.ACT4_CONTRACT);
    setChrome(4, CFG.act4.chapterLabel, "nightmare", "velvet-sepia");
    stage.innerHTML = "";

    const contractCfg = CFG.act4.contract;
    const selected = persisted.contractSelected;
    let protestCount = persisted.contractProtestCount;
    const exhaustedLabel =
      contractCfg.protestExhaustedButton || "Bine, gata, am rămas fără scuze";

    const scene = document.createElement("div");
    scene.className = "scene";

    const card = document.createElement("div");
    card.className = "contract-card";
    card.innerHTML = `
      <div class="contract-header">
        <h2 class="contract-title">${contractCfg.title}</h2>
        <p class="contract-instruction">${contractCfg.instruction}</p>
      </div>
      <div class="clauses-list" id="clausesList"></div>
      <div class="custom-clause-wrap">
        <input
          type="text"
          class="custom-clause-input"
          id="customClauseInput"
          maxlength="160"
          placeholder="${contractCfg.customNotePlaceholder}"
        />
      </div>
      <div id="protestSlot"></div>
      <div class="signature-row" id="signatureRow">
        <span class="sig-label">Semnătura:</span>
        <div class="sig-line">
          ${chinaMarkerSignatureSvg()}
        </div>
      </div>
      <div class="contract-actions">
        <button type="button" class="primary-btn" id="signTreatyBtn"></button>
        <button type="button" class="ghost-btn" id="protestBtn">${
          protestCount >= contractCfg.protestResponses.length
            ? exhaustedLabel
            : contractCfg.protestButton
        }</button>
      </div>
    `;

    stage.appendChild(scene);
    scene.appendChild(card);

    const listEl = document.getElementById("clausesList");
    const signBtn = document.getElementById("signTreatyBtn");
    const protestBtn = document.getElementById("protestBtn");
    const protestSlot = document.getElementById("protestSlot");
    const customInput = document.getElementById("customClauseInput");
    const signatureRow = document.getElementById("signatureRow");

    let lastLoggedCustomNote = persisted.contractCustomNote || "";
    if (customInput && persisted.contractCustomNote) {
      customInput.value = persisted.contractCustomNote;
    }
    if (customInput) {
      customInput.addEventListener("input", () => {
        persisted.contractCustomNote = customInput.value;
      });
      customInput.addEventListener("change", () => {
        const val = customInput.value.trim();
        if (val && val !== lastLoggedCustomNote) {
          lastLoggedCustomNote = val;
          trackEvent("custom_rule_typed", { customNote: val });
        }
      });
    }

    function syncSignBtn() {
      const count = selected.size;
      const minRequiredClauses = contractCfg.minRequiredClauses;
      signBtn.disabled = count < minRequiredClauses;
      const needed = minRequiredClauses - count;
      if (signatureRow) {
        signatureRow.classList.toggle("ready", count >= minRequiredClauses);
      }
      if (needed > 0) {
        signBtn.disabled = true;
        signBtn.textContent =
          needed === 1 && count === 0
            ? "Bifează cel puțin o clauză ca să deblochezi"
            : `Bifează încă ${needed} ${needed > 1 ? "clauze" : "clauză"} ca să deblochezi`;
      } else {
        signBtn.disabled = false;
        signBtn.innerHTML = `<span>${contractCfg.signButton}</span>${chinaMarkerArrowSvg()}`;
      }
    }

    contractCfg.clauses.forEach((clause) => {
      const row = document.createElement("div");
      const isChecked = selected.has(clause.id);
      row.className = "clause-item" + (isChecked ? " checked" : "");
      row.innerHTML = `
        <span class="clause-box">${isChecked ? chinaMarkerCheckSvg() : ""}</span>
        <span class="clause-text">${clause.text}</span>
      `;
      row.addEventListener("click", () => {
        let nowChecked = false;
        if (selected.has(clause.id)) {
          selected.delete(clause.id);
          row.classList.remove("checked");
          row.querySelector(".clause-box").innerHTML = "";
          Sound.tick(380, 0.07, 0.025);
          nowChecked = false;
        } else {
          selected.add(clause.id);
          row.classList.add("checked");
          row.querySelector(".clause-box").innerHTML = chinaMarkerCheckSvg();
          Sound.playGreasePencil();
          nowChecked = true;
        }
        syncSignBtn();
        trackEvent("toggled_clause", {
          clauseId: clause.id,
          clauseTitle: clause.title || clause.id,
          clauseText: clause.text,
          checked: nowChecked,
          action: nowChecked ? "checked" : "unchecked",
          selectedCount: selected.size,
          selectedIds: Array.from(selected),
          selectedTitles: contractCfg.clauses
            .filter((c) => selected.has(c.id))
            .map((c) => c.title || c.id),
        });
      });
      listEl.appendChild(row);
    });

    syncSignBtn();

    protestBtn.addEventListener("click", () => {
      const idx = Math.min(protestCount, contractCfg.protestResponses.length - 1);
      const reply = contractCfg.protestResponses[idx];
      protestCount += 1;
      persisted.contractProtestCount = protestCount;
      Sound.playReelTick(0.4);
      trackEvent("clicked_hate_video_calls", { protestCount, reply });

      protestSlot.innerHTML = "";
      const toast = document.createElement("div");
      toast.className = "protest-toast";
      toast.textContent = reply;
      protestSlot.appendChild(toast);

      if (protestCount >= contractCfg.protestResponses.length) {
        protestBtn.textContent = exhaustedLabel;
      }
    });

    signBtn.addEventListener("click", () => {
      if (signBtn.disabled) return;
      signBtn.disabled = true;
      signBtn.style.pointerEvents = "none";
      const chosenObjs = contractCfg.clauses.filter((c) => selected.has(c.id));
      const chosenTexts = chosenObjs.map((c) => c.text);
      const chosenIds = chosenObjs.map((c) => c.id);
      const chosenTitles = chosenObjs.map((c) => c.title || c.id);
      const customNote = customInput.value.trim();
      persisted.contractCustomNote = customNote;
      persisted.signedPayload = { chosenTexts, customNote, protestCount };

      Sound.playGreasePencil();
      trackEvent("signed_contract", {
        clauses: chosenTexts,
        clauseIds: chosenIds,
        clauseTitles: chosenTitles,
        customNote,
        protestCount,
      });

      transitionScene(() => renderFinale(chosenTexts, customNote, protestCount));
    });
  }

  // ==========================================================================
  // ACT 4C: BARYTA PROOF RECEIPT & INSTAGRAM VERDICT HANDOFF
  // ==========================================================================
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderFinale(chosenClauses, customNote, protestCount) {
    clearTimers();
    persisted.signedPayload = {
      chosenTexts: chosenClauses,
      customNote,
      protestCount,
    };
    recordSlideShown(SLIDE_MAP.ACT4_FINALE);
    setChrome(4, "Rola IV · Semnat", "signed", "warm-dawn");
    stage.innerHTML = "";

    document.querySelectorAll(".rail-seg").forEach((seg) => {
      seg.classList.remove("active");
      seg.classList.add("done");
    });

    Sound.playStampThud();

    const fin = CFG.act4.finale;
    const verdictMessage = (fin.buildVerdictMessage || fin.buildWhatsappMessage)(
      chosenClauses,
      customNote,
      protestCount
    );
    const cleanIg = ((CFG.meta && CFG.meta.instagramUsername) || "")
      .replace(/^@+/, "")
      .replace(/[^a-zA-Z0-9._]/g, "");
    const igUrl = cleanIg
      ? `https://ig.me/m/${cleanIg}`
      : `https://www.instagram.com/direct/inbox/`;

    const scene = document.createElement("div");
    scene.className = "scene";

    const sanitizedCustomNote = escapeHtml(customNote);
    const summaryItems = chosenClauses
      .map((c) => `<li>${c}</li>`)
      .concat(
        sanitizedCustomNote
          ? [`<li><strong>Regulă proprie:</strong> ${sanitizedCustomNote}</li>`]
          : []
      )
      .join("");

    const launchBtnLabel = fin.instagramButton || fin.whatsappButton;

    scene.innerHTML = `
      <div class="receipt-card">
        <span class="stamp-seal">${fin.stampText}</span>
        <h2 class="display-serif font-allura script-accent">${fin.title}</h2>
        <p class="subtitle-copy" style="font-size: 15px;">${fin.subtitle}</p>
        <ul class="receipt-summary">${summaryItems}</ul>
        <div class="signature-row ready">
          <span class="sig-label">Semnat:</span>
          <div class="sig-line">
            ${chinaMarkerSignatureSvg()}
          </div>
        </div>
        <a
          href="${igUrl}"
          target="_blank"
          rel="noopener noreferrer"
          class="primary-btn whatsapp-cta instagram-cta"
          id="waLaunchBtn"
          style="text-decoration: none;"
        >
          <span>${launchBtnLabel}</span>
          ${chinaMarkerArrowSvg()}
        </a>
        <p class="copy-fallback-msg" id="igCopyHint">Deschide Instagram și copiază automat termenii semnați pentru DM.</p>
      </div>
    `;

    stage.appendChild(scene);

    const waLaunchBtn = document.getElementById("waLaunchBtn");
    const igCopyHint = document.getElementById("igCopyHint");
    if (waLaunchBtn) {
      waLaunchBtn.addEventListener("click", () => {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard
            .writeText(verdictMessage)
            .then(() => {
              if (igCopyHint) {
                igCopyHint.textContent =
                  "Verdictul a fost copiat, dă Paste în DM pe Instagram :))";
              }
            })
            .catch(() => {});
        }
        trackEvent("clicked_instagram_send", { hasDirectUsername: !!cleanIg });
      });
    }
  }

  // Descriptive Scene Function Aliases for Architecture Consistency
  const renderAct2Notes = renderAct2;
  const renderAct3Imagination = renderAct3;
  const renderAct4 = renderAct5Setup;
  const renderAct4Confidence = renderAct5Setup;
  const renderAct5Treaty = renderAct5Setup;
  const renderAct5Finale = renderFinale;

  // ==========================================================================
  // CREATOR PREVIEW BAR (?preview=1 ONLY — HIDDEN FOR HER)
  // ==========================================================================
  const params = new URLSearchParams(window.location.search);
  if (params.get("preview") === "1") {
    creatorBar.hidden = false;
    creatorBar.querySelectorAll("button[data-jump]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.style.pointerEvents = "none";
        Sound.init();
        const target = Number(btn.getAttribute("data-jump"));
        if (target >= 2 && !Sound.soundtrackStarted) {
          Sound.start505AtIstanbul();
        }
        const options = { force: true };
        if (target === 0) transitionScene(renderIntro, options);
        if (target === 1) transitionScene(renderAct1Cinema, options);
        if (target === 2) transitionScene(renderAct2, options);
        if (target === 3) transitionScene(renderAct3, options);
        if (target === 4 || target === 5) transitionScene(renderAct5Setup, options);
        window.setTimeout(() => {
          btn.disabled = false;
          btn.style.pointerEvents = "";
        }, 800);
      });
    });
  }

  // Boot at Gate 0
  renderIntro();
})();
