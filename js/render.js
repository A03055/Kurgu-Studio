'use strict';
/* Oynatma ve görüntü motoru: klipleri tuvale çizer, sesleri eşitler, geçiş ve efektleri uygular */

/* Klip ses efektleri (Web Audio düğüm zincirleri) */
const AudioFX = {
  ir: null,
  impulse(ac) {
    if (this.ir && this.ir.sampleRate === ac.sampleRate) return this.ir;
    const len = Math.floor(ac.sampleRate * 2.8);
    const b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (hash(i, c + 3) * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    return (this.ir = b);
  },
  curve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    return c;
  },
  build(ac, type, enhance) {
    if ((!type || type === 'none') && !enhance) return null;
    const nodes = [];
    const add = n => { nodes.push(n); return n; };
    const bq = (t, f, q) => { const b = add(ac.createBiquadFilter()); b.type = t; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    const input = add(ac.createGain());
    const output = add(ac.createGain());
    let cur = input;
    const chain = n => { cur.connect(n); cur = n; return n; };
    if (enhance) {
      // konuşmayı netleştir: uğultuyu kes, anlaşılırlığı artır, seviyeyi dengele
      chain(bq('highpass', 90, 0.7));
      chain(bq('lowpass', 11000));
      const pk = chain(bq('peaking', 3200, 0.9)); pk.gain.value = 4;
      const lowcut = chain(bq('peaking', 300, 1)); lowcut.gain.value = -3;
      const cp = chain(add(ac.createDynamicsCompressor()));
      cp.threshold.value = -26; cp.ratio.value = 4; cp.attack.value = 0.004; cp.release.value = 0.2;
      chain(add(ac.createGain())).gain.value = 1.7;
    }
    switch (type) {
      case 'echo': {
        const d = add(ac.createDelay(1)); d.delayTime.value = 0.28;
        const fb = add(ac.createGain()); fb.gain.value = 0.38;
        const wet = add(ac.createGain()); wet.gain.value = 0.5;
        cur.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(output);
        break;
      }
      case 'hall': {
        const cv = add(ac.createConvolver()); cv.buffer = this.impulse(ac);
        const wet = add(ac.createGain()); wet.gain.value = 0.55;
        cur.connect(cv); cv.connect(wet); wet.connect(output);
        break;
      }
      case 'radio': case 'phone': case 'megaphone': {
        const f = { radio: [300, 4500, 8, 0.9], phone: [450, 3000, 3, 1], megaphone: [650, 3500, 35, 0.55] }[type];
        chain(bq('highpass', f[0], 0.8)); chain(bq('lowpass', f[1], 0.8));
        const ws = chain(add(ac.createWaveShaper())); ws.curve = this.curve(f[2]);
        chain(add(ac.createGain())).gain.value = f[3];
        break;
      }
      case 'robot': {
        const rm = add(ac.createGain()); rm.gain.value = 0;
        const osc = add(ac.createOscillator()); osc.frequency.value = 55; osc.connect(rm.gain); osc.start();
        chain(rm);
        chain(add(ac.createGain())).gain.value = 1.8;
        break;
      }
      case 'underwater': chain(bq('lowpass', 420, 2)); chain(add(ac.createGain())).gain.value = 1.4; break;
    }
    cur.connect(output);
    return { input, output, nodes };
  },
};

const Engine = {
  canvas: null, ctx: null, W: 1920, H: 1080,
  els: new Map(),
  pool: null,
  ac: null, master: null, monitor: null, recDest: null,
  dirty: true, playWall: 0, playFrom: 0,
  bounds: new Map(),
  layers: [],
  noise: null,
  onTick: null, onEnd: null, onPlayState: null,
  showGuides: true,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pool = $('#mediaPool');
    this.noise = this.makeNoise();
    this.resize();
    const loop = now => { requestAnimationFrame(loop); this.tick(now); };
    requestAnimationFrame(loop);
  },

  size(res = state.project.res, aspect = state.project.aspect) {
    const [aw, ah] = ASPECTS[aspect] || ASPECTS['16:9'];
    let W, H;
    if (aw >= ah) { H = res; W = Math.round(res * aw / ah / 2) * 2; }
    else { W = res; H = Math.round(res * ah / aw / 2) * 2; }
    return [W, H];
  },

  resize() {
    const [W, H] = this.size();
    if (W === this.W && H === this.H && this.canvas.width === W) return;
    this.W = W; this.H = H;
    this.canvas.width = W; this.canvas.height = H;
    this.layers = [];
    this.dirty = true;
    if (window.fitStage) fitStage();
  },

  layer(i) {
    let l = this.layers[i];
    if (!l || l.c.width !== this.W || l.c.height !== this.H) {
      const c = document.createElement('canvas');
      c.width = this.W; c.height = this.H;
      l = this.layers[i] = { c, ctx: c.getContext('2d') };
    }
    l.ctx.setTransform(1, 0, 0, 1, 0, 0);
    l.ctx.globalAlpha = 1; l.ctx.filter = 'none'; l.ctx.globalCompositeOperation = 'source-over';
    l.ctx.clearRect(0, 0, this.W, this.H);
    return l;
  },

  makeNoise() {
    const frames = [];
    for (let f = 0; f < 4; f++) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d');
      const img = x.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = hash(i, f + 1) * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      frames.push(c);
    }
    return frames;
  },

  /* ---------- ses ---------- */
  ensureAudio() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ac = new AC();
    this.master = this.ac.createGain();
    this.monitor = this.ac.createGain();
    this.master.connect(this.monitor);
    this.monitor.connect(this.ac.destination);
    if (this.ac.createMediaStreamDestination) {
      this.recDest = this.ac.createMediaStreamDestination();
      this.master.connect(this.recDest);
    }
    for (const e of this.els.values()) this.route(e);
  },
  route(e) {
    if (!this.ac || e.gain) return;
    try {
      e.src = this.ac.createMediaElementSource(e.el);
      e.gain = this.ac.createGain();
      e.gain.connect(this.master);
      e.fxKey = null;
      this.rewire(e, 'none|0');
    } catch (err) { console.warn(err); }
  },
  rewire(e, key) {
    if (!e.src || e.fxKey === key) return;
    try { e.src.disconnect(); } catch (err) { /* yok say */ }
    if (e.chain) for (const n of e.chain.nodes) { try { n.disconnect(); if (n.stop) n.stop(); } catch (err) { /* yok say */ } }
    const [type, enh] = key.split('|');
    e.chain = AudioFX.build(this.ac, type, enh === '1');
    if (e.chain) { e.src.connect(e.chain.input); e.chain.output.connect(e.gain); }
    else e.src.connect(e.gain);
    e.fxKey = key;
  },
  setLevel(x, level, tc = 0.03) {
    if (x.lastLevel !== undefined && Math.abs(x.lastLevel - level) < 0.002) return;
    x.lastLevel = level;
    if (x.gain) {
      x.el.volume = 1;
      x.gain.gain.setTargetAtTime(level, this.ac.currentTime, state.playing ? tc : 0.001);
    } else x.el.volume = clamp(level, 0, 1);
  },
  getEl(clip) {
    const m = state.media.get(clip.mediaId);
    if (!m) return null;
    let e = this.els.get(clip.id);
    if (e && e.mediaId === m.id) return e;
    if (e) this.dropEl(clip.id);
    const el = document.createElement(clip.kind === 'audio' ? 'audio' : 'video');
    el.preload = 'auto';
    el.playsInline = true;
    el.src = m.url;
    el.addEventListener('seeked', () => { this.dirty = true; });
    el.addEventListener('loadeddata', () => { this.dirty = true; });
    this.pool.appendChild(el);
    e = { el, mediaId: m.id };
    this.els.set(clip.id, e);
    this.route(e);
    return e;
  },
  dropEl(id) {
    const e = this.els.get(id);
    if (!e) return;
    try { e.el.pause(); e.el.removeAttribute('src'); e.el.load(); } catch (err) { /* yok say */ }
    e.el.remove();
    try { e.src && e.src.disconnect(); e.gain && e.gain.disconnect(); } catch (err) { /* yok say */ }
    if (e.chain) for (const n of e.chain.nodes) { try { n.disconnect(); if (n.stop) n.stop(); } catch (err) { /* yok say */ } }
    this.els.delete(id);
  },
  prune() {
    const ids = new Set(allClips().map(c => c.id));
    for (const id of [...this.els.keys()]) if (!ids.has(id)) this.dropEl(id);
  },

  /* ---------- oynatma ---------- */
  play() {
    if (state.playing) return;
    const d = projectDuration();
    if (d <= 0) return toast('Önce zaman çizelgesine bir şey ekle');
    if (state.time >= d - 0.02) state.time = 0;
    this.ensureAudio();
    state.playing = true;
    this.playWall = performance.now();
    this.playFrom = state.time;
    this.onPlayState && this.onPlayState(true);
  },
  pause() {
    state.playing = false;
    for (const e of this.els.values()) if (!e.el.paused) e.el.pause();
    this.dirty = true;
    this.onPlayState && this.onPlayState(false);
  },
  toggle() { state.playing ? this.pause() : this.play(); },
  seek(t) {
    state.time = Math.max(0, t);
    if (state.playing) { this.playWall = performance.now(); this.playFrom = state.time; }
    this.dirty = true;
  },

  tick(now) {
    if (state.playing) {
      const d = projectDuration();
      state.time = this.playFrom + (now - this.playWall) / 1000;
      if (state.time >= d) {
        state.time = d;
        this.pause();
        this.onEnd && this.onEnd();
      }
      this.dirty = true;
    }
    this.sync(state.playing);
    if (this.dirty) {
      this.dirty = false;
      this.draw();
      this.onTick && this.onTick();
    }
  },

  fade(c, t) {
    const lt = t - c.start, d = clipDur(c);
    let f = 1;
    if (c.fadeIn > 0) f = Math.min(f, lt / c.fadeIn);
    if (c.fadeOut > 0) f = Math.min(f, (d - lt) / c.fadeOut);
    return clamp(f, 0, 1);
  },

  sync(playing) {
    const t = state.time;
    // otomatik kısma: "diğer sesler çalarken kıs" işaretli klipler, başka bir ses duyulurken kısılır
    let voice = false;
    for (const tr of state.project.tracks) {
      if (tr.muted || (tr.kind !== 'audio' && tr.kind !== 'video')) continue;
      for (const c of tr.clips) {
        if (!isMediaKind(c.kind) || c.duck || t < c.start || t >= clipEnd(c)) continue;
        const m = state.media.get(c.mediaId);
        if (m && m.wave && prop(c, 'volume', t) > 0.05) { voice = true; break; }
      }
    }
    for (const tr of state.project.tracks) {
      for (const c of tr.clips) {
        if (!isMediaKind(c.kind)) continue;
        const s = c.start, e = clipEnd(c);
        const active = t >= s && t < e;
        const near = !active && t < s && s - t < 1.5;
        if (!active && !near) {
          const x = this.els.get(c.id);
          if (x && !x.el.paused) x.el.pause();
          continue;
        }
        const x = this.getEl(c);
        if (!x) continue;
        const el = x.el;
        if (el.readyState < 1) continue;
        if (active) {
          const target = c.in + (t - s) * c.speed;
          if (Math.abs(el.playbackRate - c.speed) > 0.001) el.playbackRate = c.speed;
          const keep = c.keepPitch !== false;
          if ('preservesPitch' in el && el.preservesPitch !== keep) el.preservesPitch = keep;
          if (x.gain) this.rewire(x, `${c.afx || 'none'}|${c.enhance ? 1 : 0}`);
          let level = tr.muted ? 0 : prop(c, 'volume', t) * this.fade(c, t);
          if (c.duck && voice) level *= 0.22;
          this.setLevel(x, level, c.duck ? 0.12 : 0.03);
          if (playing) {
            if (el.paused) {
              if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target;
              const p = el.play(); if (p) p.catch(() => {});
            } else if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
          } else {
            if (!el.paused) el.pause();
            if (Math.abs(el.currentTime - target) > 0.02 && !el.seeking) el.currentTime = target;
          }
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - c.in) > 0.05 && !el.seeking) el.currentTime = c.in;
        }
      }
    }
  },

  /* ---------- çizim ---------- */
  draw() {
    const { ctx, W, H } = this;
    const t = state.time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = state.project.bg || '#000';
    ctx.fillRect(0, 0, W, H);
    this.bounds.clear();
    const tracks = state.project.tracks;
    for (let i = tracks.length - 1; i >= 0; i--) {
      const tr = tracks[i];
      if (tr.hidden || tr.kind === 'audio') continue;
      if (tr.kind === 'fx') {
        for (const c of tr.clips) {
          if (t < c.start || t >= clipEnd(c)) continue;
          this.applyFx(c, t);
        }
      } else this.drawTrack(ctx, tr, t);
    }
    if (!state.exporting && this.showGuides) this.drawSelection();
  },

  transitionWindow(tr, c) {
    if (!c.transition || !c.transition.type) return null;
    const d = Math.min(c.transition.dur || 0.6, clipDur(c));
    const prev = prevAdjacent(tr, c);
    if (prev) {
      const half = Math.min(d / 2, clipDur(prev) / 2, clipDur(c) / 2);
      return { prev, w0: c.start - half, w1: c.start + half };
    }
    return { prev: null, w0: c.start, w1: c.start + d };
  },

  drawTrack(ctx, tr, t) {
    const done = new Set();
    for (const c of tr.clips) {
      const w = this.transitionWindow(tr, c);
      if (!w || t < w.w0 || t >= w.w1) continue;
      const p = (t - w.w0) / (w.w1 - w.w0);
      this.drawTransition(ctx, tr, w.prev, c, p, t);
      done.add(c.id); if (w.prev) done.add(w.prev.id);
    }
    for (const c of tr.clips) {
      if (done.has(c.id)) continue;
      if (t < c.start || t >= clipEnd(c)) continue;
      this.drawClip(ctx, c, t, tr);
    }
  },

  animState(c, t) {
    const W = this.W, H = this.H;
    const lt = t - c.start, d = Math.max(0.001, clipDur(c));
    const s = { dx: 0, dy: 0, sc: 1, rot: 0, alpha: 1, blur: 0 };
    const ad = Math.max(0.05, Math.min(c.animDur || 0.5, d / 2));
    const apply = (type, p, dir) => {
      const e = easeOutCubic(p);
      switch (type) {
        case 'fade': s.alpha *= p; break;
        case 'pop': s.sc *= dir > 0 ? (p < 1 ? Math.max(0, easeOutBack(p)) : 1) : e; s.alpha *= Math.min(1, p * 3); break;
        case 'slideUp': s.dy += dir * (1 - e) * H * 0.4; s.alpha *= p; break;
        case 'slideDown': s.dy -= dir * (1 - e) * H * 0.4; s.alpha *= p; break;
        case 'slideLeft': s.dx += dir * (1 - e) * W * 0.5; s.alpha *= p; break;
        case 'slideRight': s.dx -= dir * (1 - e) * W * 0.5; s.alpha *= p; break;
        case 'zoom': s.sc *= lerp(dir > 0 ? 2.2 : 1.8, 1, e); s.alpha *= p; break;
        case 'spin': s.rot += (1 - e) * (dir > 0 ? -360 : 360); s.sc *= Math.max(0.01, e); break;
        case 'blur': s.blur += (1 - p) * 40; s.alpha *= p; break;
        case 'bounce': {
          const b = p < 1 ? 1 - Math.abs(Math.cos(p * Math.PI * 2.5)) * (1 - p) : 1;
          s.dy -= (1 - b) * H * 0.35; s.alpha *= Math.min(1, p * 4); break;
        }
      }
    };
    if (c.anim && c.anim !== 'none' && lt < ad) apply(c.anim, clamp(lt / ad, 0, 1), 1);
    if (c.animOut && c.animOut !== 'none' && d - lt < ad) apply(c.animOut, clamp((d - lt) / ad, 0, 1), -1);
    const k = lt / d;
    switch (c.loop) {
      case 'kenIn': s.sc *= 1 + 0.18 * k; break;
      case 'kenOut': s.sc *= 1.18 - 0.18 * k; break;
      case 'panL': s.sc *= 1.15; s.dx += W * 0.06 * (0.5 - k) * 2; break;
      case 'panR': s.sc *= 1.15; s.dx -= W * 0.06 * (0.5 - k) * 2; break;
      case 'pulse': s.sc *= 1 + 0.05 * Math.sin(lt * Math.PI * 2 * 1.2); break;
      case 'wobble': s.rot += 6 * Math.sin(lt * Math.PI * 2 * 1.5); break;
      case 'float': s.dy += H * 0.02 * Math.sin(lt * Math.PI * 2 * 0.5); break;
      case 'rotate': s.rot += lt * 90; break;
    }
    return s;
  },

  filterCss(f, extraBlur = 0) {
    const k = this.H / 1080;
    const parts = [];
    if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
    if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
    if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
    if (f.sepia) parts.push(`sepia(${f.sepia}%)`);
    if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
    if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
    if (f.invert) parts.push(`invert(${f.invert}%)`);
    const b = (f.blur || 0) + extraBlur;
    if (b > 0.05) parts.push(`blur(${(b * k).toFixed(1)}px)`);
    return parts.length ? parts.join(' ') : 'none';
  },

  source(c) {
    if (c.kind === 'video') {
      const x = this.getEl(c);
      if (!x || x.el.readyState < 2 || !x.el.videoWidth) return null;
      return { src: x.el, sw: x.el.videoWidth, sh: x.el.videoHeight };
    }
    if (c.kind === 'image') {
      const m = state.media.get(c.mediaId);
      if (!m || !m.img || !m.img.complete || !m.img.naturalWidth) return null;
      return { src: m.img, sw: m.img.naturalWidth, sh: m.img.naturalHeight };
    }
    return null;
  },

  drawClip(ctx, c, t, tr) {
    const W = this.W, H = this.H;
    const a = this.animState(c, t);
    const P = k => prop(c, k, t);
    let alpha = P('opacity') * this.fade(c, t) * a.alpha;
    if (alpha <= 0.001) return;
    if (c.kind === 'text') return this.drawText(ctx, c, t, a, alpha);
    const s = this.source(c);
    if (!s) return;
    const { sw, sh } = s;
    let src = s.src;
    const contain = Math.min(W / sw, H / sh), cover = Math.max(W / sw, H / sh);
    const base = c.fit === 'cover' ? cover : contain;
    const sc = P('scale') * a.sc;
    const cx = W / 2 + P('x') * W + a.dx, cy = H / 2 + P('y') * H + a.dy;
    const rot = (P('rotation') || 0) + a.rot;
    // Bulanık arka plan (ana iz, dikey videolar için)
    if (tr && tr.main && state.project.bgMode === 'blur' && c.fit !== 'cover') {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.filter = `blur(${Math.round(40 * H / 1080)}px) brightness(80%)`;
      const bw = sw * cover * 1.15, bh = sh * cover * 1.15;
      ctx.drawImage(src, W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
      ctx.restore();
    }
    if (GLFX.needed(c)) src = GLFX.process(src, sw, sh, c);
    const dw = sw * base * sc, dh = sh * base * sc;
    const m = c.mask;
    const masked = m && m.type && m.type !== 'none';
    const g = masked ? this.layer(7).ctx : ctx;
    g.save();
    if (!masked) {
      g.globalAlpha = alpha;
      if (c.blend && c.blend !== 'normal') g.globalCompositeOperation = c.blend;
    }
    g.filter = this.filterCss(c.filters, a.blur);
    g.translate(cx, cy);
    g.rotate(rot * Math.PI / 180);
    if (c.flipX) g.scale(-1, 1);
    g.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    if (masked) {
      g.filter = m.feather > 0 ? `blur(${(m.feather / 100 * Math.min(dw, dh) * 0.25).toFixed(1)}px)` : 'none';
      g.globalCompositeOperation = m.invert ? 'destination-out' : 'destination-in';
      g.beginPath();
      this.maskPath(g, m, dw, dh);
      g.fillStyle = '#000';
      g.fill();
    }
    g.restore();
    if (masked) {
      ctx.save();
      ctx.globalAlpha = alpha;
      if (c.blend && c.blend !== 'normal') ctx.globalCompositeOperation = c.blend;
      ctx.drawImage(this.layers[7].c, 0, 0);
      ctx.restore();
    }
    if (ctx === this.ctx || !this.bounds.has(c.id)) this.bounds.set(c.id, { cx, cy, w: dw, h: dh, rot, sw, sh, src: s.src });
  },

  maskPath(g, m, dw, dh) {
    const w = m.w * dw, hh = m.h * dh;
    const big = (dw + dh) * 3;
    g.save();
    g.translate(m.x * dw, m.y * dh);
    g.rotate((m.rot || 0) * Math.PI / 180);
    switch (m.type) {
      case 'rect': roundRectPath(g, -w / 2, -hh / 2, w, hh, (m.round || 0) / 100 * Math.min(w, hh) / 2); break;
      case 'circle': g.ellipse(0, 0, Math.max(0.1, w / 2), Math.max(0.1, hh / 2), 0, 0, Math.PI * 2); break;
      case 'heart': heartPath(g, 0, 0, w, hh); break;
      case 'star': starPath(g, 0, 0, w, hh); break;
      case 'linear': g.rect(-big, 0, big * 2, big); break;
      case 'band': g.rect(-big, -hh / 2, big * 2, hh); break;
    }
    g.restore();
  },

  drawText(ctx, c, t, a, alpha) {
    const T = c.text, W = this.W, H = this.H, k = H / 1080;
    const size = T.size * k;
    let content = T.content || '';
    if (T.typewriter) {
      const n = Math.floor((t - c.start) / 0.06);
      content = content.slice(0, Math.max(0, n));
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${T.italic ? 'italic ' : ''}${T.bold ? '700' : '400'} ${size}px ${fontStack(T.font)}`;
    if (document.fonts && !document.fonts.check(ctx.font, T.content || 'a')) document.fonts.load(ctx.font, T.content || 'a').then(() => { this.dirty = true; }).catch(() => {});
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(T.letter || 0) * k}px`;
    ctx.textBaseline = 'middle';
    const full = (T.content || ' ').split('\n');
    const lines = content.split('\n');
    const lh = size * 1.22;
    const w = Math.max(size * 0.5, ...full.map(l => ctx.measureText(l).width));
    const hgt = lh * full.length;
    const pad = size * 0.35;
    const cx = W / 2 + prop(c, 'x', t) * W + a.dx, cy = H / 2 + prop(c, 'y', t) * H + a.dy;
    const sc = prop(c, 'scale', t) * a.sc;
    const rot = (prop(c, 'rotation', t) || 0) + a.rot;
    ctx.translate(cx, cy);
    ctx.rotate(rot * Math.PI / 180);
    ctx.scale(sc, sc);
    if (a.blur > 0.05) ctx.filter = `blur(${(a.blur * k).toFixed(1)}px)`;
    if (T.bgOn) {
      ctx.fillStyle = hexA(T.bg, T.bgOpacity ?? 1);
      roundRectPath(ctx, -w / 2 - pad, -hgt / 2 - pad * 0.55, w + pad * 2, hgt + pad * 1.1, size * 0.22);
      ctx.fill();
    }
    ctx.textAlign = T.align || 'center';
    const ax = T.align === 'left' ? -w / 2 : T.align === 'right' ? w / 2 : 0;
    lines.forEach((l, i) => {
      const y = -hgt / 2 + lh * (i + 0.5);
      if (T.shadow > 0) { ctx.shadowColor = T.shadowColor; ctx.shadowBlur = T.shadow * k; }
      if (T.strokeW > 0) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = T.strokeW * k * 2;
        ctx.strokeStyle = T.stroke;
        ctx.strokeText(l, ax, y);
        if (T.shadow > 0) ctx.shadowBlur = 0;
      }
      ctx.fillStyle = T.color;
      ctx.fillText(l, ax, y);
      if (T.shadow > 0 && !T.strokeW) { ctx.shadowBlur = 0; ctx.fillText(l, ax, y); }
    });
    ctx.restore();
    if (ctx === this.ctx || !this.bounds.has(c.id)) this.bounds.set(c.id, { cx, cy, w: (w + pad * 2) * sc, h: (hgt + pad * 1.1) * sc, rot });
  },

  /* ---------- geçişler ---------- */
  drawTransition(ctx, tr, A, B, p, t) {
    const W = this.W, H = this.H;
    const la = this.layer(0), lb = this.layer(1);
    if (A) this.drawClip(la.ctx, A, Math.min(t, clipEnd(A) - 0.001), tr);
    this.drawClip(lb.ctx, B, Math.max(t, B.start), tr);
    const a = la.c, b = lb.c;
    const e = easeInOutCubic(p);
    const k = H / 1080;
    ctx.save();
    const draw = (img, alpha = 1, x = 0, y = 0, s = 1, rot = 0, filter = 'none') => {
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha; ctx.filter = filter;
      ctx.translate(W / 2 + x, H / 2 + y);
      if (rot) ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.drawImage(img, -W / 2, -H / 2);
      ctx.restore();
    };
    const clipDraw = (pathFn, img) => { ctx.save(); ctx.beginPath(); pathFn(); ctx.clip(); ctx.drawImage(img, 0, 0); ctx.restore(); };
    const ss = (e0, e1, x) => { const q = clamp((x - e0) / (e1 - e0), 0, 1); return q * q * (3 - 2 * q); };
    switch (B.transition.type) {
      case 'fade': draw(a, 1 - ss(0.5, 1, p)); draw(b, ss(0, 0.6, p)); break;
      case 'black':
      case 'white': {
        const col = B.transition.type === 'black' ? '#000' : '#fff';
        if (p < 0.5) { draw(a); ctx.globalAlpha = p * 2; } else { draw(b); ctx.globalAlpha = (1 - p) * 2; }
        ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); break;
      }
      case 'slideLeft': draw(a, 1, -e * W); draw(b, 1, (1 - e) * W); break;
      case 'slideRight': draw(a, 1, e * W); draw(b, 1, -(1 - e) * W); break;
      case 'slideUp': draw(a, 1, 0, -e * H); draw(b, 1, 0, (1 - e) * H); break;
      case 'slideDown': draw(a, 1, 0, e * H); draw(b, 1, 0, -(1 - e) * H); break;
      case 'wipeLeft': draw(a); clipDraw(() => ctx.rect(W * (1 - e), 0, W * e, H), b); break;
      case 'wipeRight': draw(a); clipDraw(() => ctx.rect(0, 0, W * e, H), b); break;
      case 'wipeDown': draw(a); clipDraw(() => ctx.rect(0, 0, W, H * e), b); break;
      case 'circle': draw(a); clipDraw(() => ctx.arc(W / 2, H / 2, Math.max(0.1, e * Math.hypot(W, H) / 2), 0, Math.PI * 2), b); break;
      case 'diamond': {
        draw(a);
        const r = e * (W + H) / 2;
        clipDraw(() => { ctx.moveTo(W / 2, H / 2 - r); ctx.lineTo(W / 2 + r, H / 2); ctx.lineTo(W / 2, H / 2 + r); ctx.lineTo(W / 2 - r, H / 2); ctx.closePath(); }, b);
        break;
      }
      case 'zoomIn': draw(b, ss(0.2, 0.8, p), 0, 0, 0.85 + 0.15 * e); draw(a, 1 - ss(0.3, 0.9, p), 0, 0, 1 + 1.5 * e); break;
      case 'zoomOut': draw(b, ss(0.2, 0.8, p), 0, 0, 1.6 - 0.6 * e); draw(a, 1 - ss(0.3, 0.9, p), 0, 0, 1 - 0.6 * e); break;
      case 'spin':
        if (p < 0.5) draw(a, 1, 0, 0, 1 - p * 1.6, p * 2 * Math.PI);
        else draw(b, 1, 0, 0, 0.2 + (p - 0.5) * 1.6, -(1 - p) * 2 * Math.PI);
        break;
      case 'blur': {
        const bl = (1 - Math.abs(p * 2 - 1)) * 40 * k;
        draw(a, 1 - ss(0.4, 0.6, p), 0, 0, 1, 0, `blur(${bl}px)`);
        draw(b, ss(0.4, 0.6, p), 0, 0, 1, 0, `blur(${bl}px)`);
        break;
      }
      case 'glitch': {
        const base = p < 0.5 ? a : b, other = p < 0.5 ? b : a;
        draw(base);
        const amt = 1 - Math.abs(p * 2 - 1);
        const fr = Math.floor(t * 30);
        for (let i = 0; i < 10; i++) {
          if (hash(fr, i) > amt + 0.1) continue;
          const y = hash(fr, i + 50) * H, hh = (0.02 + hash(fr, i + 90) * 0.12) * H;
          const dx = (hash(fr, i + 130) - 0.5) * W * 0.2 * amt;
          ctx.drawImage(hash(fr, i + 170) > 0.5 ? other : base, 0, y, W, hh, dx, y, W, hh);
        }
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.35 * amt;
        ctx.fillStyle = hash(fr, 7) > 0.5 ? '#ff0050' : '#00f0ff';
        ctx.fillRect(0, hash(fr, 8) * H, W, H * 0.05);
        break;
      }
      case 'pixel': {
        const img = p < 0.5 ? a : b;
        const ps = Math.max(1, (1 - Math.abs(p * 2 - 1)) * 70 * k);
        const sm = this.layer(2);
        const w = Math.max(1, Math.round(W / ps)), hh = Math.max(1, Math.round(H / ps));
        sm.ctx.drawImage(img, 0, 0, w, hh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sm.c, 0, 0, w, hh, 0, 0, W, H);
        ctx.imageSmoothingEnabled = true;
        break;
      }
      case 'split':
        draw(b);
        ctx.drawImage(a, 0, 0, W, H / 2, 0, -e * H / 2, W, H / 2);
        ctx.drawImage(a, 0, H / 2, W, H / 2, 0, H / 2 + e * H / 2, W, H / 2);
        break;
      case 'blinds': {
        draw(a);
        const n = 10, sh = H / n;
        clipDraw(() => { for (let i = 0; i < n; i++) ctx.rect(0, i * sh, W, sh * e); }, b);
        break;
      }
      case 'clock':
        draw(a);
        clipDraw(() => { ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + e * Math.PI * 2); ctx.closePath(); }, b);
        break;
      case 'heart': {
        draw(a);
        const sz = Math.max(1, e * Math.max(W, H) * 2.6);
        clipDraw(() => heartPath(ctx, W / 2, H / 2 + sz * 0.05, sz, sz), b);
        break;
      }
      case 'flip': {
        const img = p < 0.5 ? a : b;
        const sx = Math.max(0.001, p < 0.5 ? 1 - e * 2 : e * 2 - 1);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sx, 1); ctx.filter = `brightness(${60 + 40 * sx}%)`; ctx.drawImage(img, -W / 2, -H / 2); ctx.restore();
        break;
      }
      case 'door':
        draw(b);
        ctx.drawImage(a, 0, 0, W / 2, H, -e * W / 2, 0, W / 2, H);
        ctx.drawImage(a, W / 2, 0, W / 2, H, W / 2 + e * W / 2, 0, W / 2, H);
        break;
      case 'crossZoom': {
        const bl = (1 - Math.abs(p * 2 - 1)) * 28 * k;
        if (p < 0.5) draw(a, 1, 0, 0, 1 + p * 1.2, 0, `blur(${bl}px)`);
        else draw(b, 1, 0, 0, 1 + (1 - p) * 1.2, 0, `blur(${bl}px)`);
        break;
      }
      case 'swipeBlur': {
        const bl = (1 - Math.abs(p * 2 - 1)) * 30 * k;
        draw(a, 1, -e * W, 0, 1, 0, `blur(${bl}px)`); draw(b, 1, (1 - e) * W, 0, 1, 0, `blur(${bl}px)`);
        break;
      }
      default: draw(b);
    }
    ctx.restore();
    // seçim kutusu için sınırları kaydet
    if (!this.bounds.has(B.id)) this.drawClip(this.layer(3).ctx, B, Math.max(t, B.start), tr);
  },

  /* ---------- efektler (efekt izi altındaki her şeye uygulanır) ---------- */
  applyFx(c, t) {
    const { ctx, W, H } = this;
    const k = H / 1080;
    const lt = t - c.start, d = clipDur(c);
    const I = clamp((c.fx.intensity ?? 0.7) * this.fade(c, t), 0, 1.5);
    if (I <= 0) return;
    const fr = Math.floor(t * 30);
    const snap = () => { const l = this.layer(4); l.ctx.drawImage(this.canvas, 0, 0); return l.c; };
    const redraw = (img, filter = 'none', alpha = 1, op = 'source-over') => {
      ctx.save(); ctx.filter = filter; ctx.globalAlpha = alpha; ctx.globalCompositeOperation = op;
      ctx.drawImage(img, 0, 0); ctx.restore();
    };
    const rgbSplit = (img, dx, dy = 0) => {
      const r = this.layer(5), g = this.layer(6);
      r.ctx.drawImage(img, dx, dy); r.ctx.globalCompositeOperation = 'multiply'; r.ctx.fillStyle = '#f00'; r.ctx.fillRect(0, 0, W, H);
      g.ctx.drawImage(img, -dx, -dy); g.ctx.globalCompositeOperation = 'multiply'; g.ctx.fillStyle = '#0ff'; g.ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(r.c, 0, 0); ctx.drawImage(g.c, 0, 0); ctx.restore();
    };
    const grain = (alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'overlay';
      const pat = ctx.createPattern(this.noise[fr % 4], 'repeat');
      ctx.translate(hash(fr, 1) * 256, hash(fr, 2) * 256);
      ctx.fillStyle = pat; ctx.fillRect(-256, -256, W + 512, H + 512);
      ctx.restore();
    };
    const vignette = (amt) => {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${clamp(amt, 0, 1)})`);
      ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    };
    const scan = (alpha, gap = 4) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = '#000';
      const g = Math.max(2, gap * k);
      for (let y = 0; y < H; y += g) ctx.fillRect(0, y, W, g / 2);
      ctx.restore();
    };
    const particles = (n, fn) => { for (let i = 0; i < n; i++) fn(i, hash(i, 101), hash(i, 202), hash(i, 303), hash(i, 404)); };

    switch (c.fx.type) {
      case 'vignette': vignette(0.9 * I); break;
      case 'letterbox': {
        const p = easeOutCubic(clamp(lt / 0.5, 0, 1)) * easeOutCubic(clamp((d - lt) / 0.5, 0, 1));
        const bh = H * 0.13 * I * p;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
        break;
      }
      case 'grain': grain(0.35 * I); break;
      case 'scanlines': scan(0.3 * I); break;
      case 'vhs': {
        const img = snap();
        rgbSplit(img, 4 * k * I * (1 + hash(fr, 3)));
        scan(0.18 * I, 3);
        const by = ((lt * 0.25) % 1.2 - 0.1) * H;
        ctx.save(); ctx.globalAlpha = 0.25 * I; ctx.globalCompositeOperation = 'overlay';
        ctx.drawImage(this.noise[fr % 4], 0, 0, 256, 32, 0, by, W, H * 0.06); ctx.restore();
        grain(0.2 * I);
        ctx.save();
        ctx.font = `700 ${Math.round(42 * k)}px "Courier New", monospace`;
        ctx.fillStyle = '#fff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4 * k;
        ctx.globalAlpha = I;
        ctx.fillText('PLAY ▶', 50 * k, 80 * k);
        ctx.fillText(`SP  ${fmtTime(t).slice(0, 5)}`, 50 * k, H - 60 * k);
        ctx.restore();
        break;
      }
      case 'oldfilm': {
        const img = snap();
        const flick = 0.9 + hash(fr, 9) * 0.2;
        redraw(img, `sepia(${80 * I}%) contrast(110%) brightness(${flick * 100}%)`);
        grain(0.4 * I);
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5 * k;
        for (let i = 0; i < 3; i++) if (hash(fr, i + 20) < 0.4 * I) {
          const x = hash(fr, i + 30) * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (hash(fr, i) - 0.5) * 20, H); ctx.stroke();
        }
        ctx.restore();
        vignette(0.8 * I);
        break;
      }
      case 'glitch': {
        const on = hash(Math.floor(t * 8), 77) < 0.55 * I + 0.1;
        if (!on) break;
        const img = snap();
        rgbSplit(img, (hash(fr, 1) - 0.5) * 30 * k * I);
        const base = img;
        for (let i = 0; i < 8; i++) {
          if (hash(fr, i + 10) > 0.6) continue;
          const y = hash(fr, i + 40) * H, hh = (0.01 + hash(fr, i + 60) * 0.08) * H;
          ctx.drawImage(base, 0, y, W, hh, (hash(fr, i + 80) - 0.5) * W * 0.12 * I, y, W, hh);
        }
        break;
      }
      case 'rgb': rgbSplit(snap(), (6 + 6 * Math.sin(lt * 6)) * k * I, 2 * k * I); break;
      case 'shake': {
        const img = snap();
        const amp = 18 * k * I;
        const dx = (hash(fr, 1) - 0.5) * 2 * amp, dy = (hash(fr, 2) - 0.5) * 2 * amp;
        ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.translate(W / 2 + dx, H / 2 + dy); ctx.rotate((hash(fr, 3) - 0.5) * 0.02 * I); ctx.scale(1.06, 1.06);
        ctx.drawImage(img, -W / 2, -H / 2); ctx.restore();
        break;
      }
      case 'zoompulse': {
        const img = snap();
        const beat = (lt % 0.5) / 0.5;
        const s = 1 + 0.09 * I * Math.exp(-beat * 5);
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.drawImage(img, -W / 2, -H / 2); ctx.restore();
        break;
      }
      case 'flash': {
        const a = Math.max(0, 1 - lt / 0.45) * I;
        ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore();
        break;
      }
      case 'strobe':
        if (Math.floor(lt / 0.09) % 2 === 0) { ctx.save(); ctx.globalAlpha = 0.7 * clamp(I, 0, 1); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
        break;
      case 'blurin': {
        const p = clamp(lt / Math.max(0.3, d * 0.6), 0, 1);
        if (p >= 1) break;
        redraw(snap(), `blur(${(1 - easeOutCubic(p)) * 30 * k * I}px)`);
        break;
      }
      case 'lightleak': {
        ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.75 * clamp(I, 0, 1);
        const blobs = [['255,140,40', 0.3, 0.2], ['255,60,120', 0.75, 0.6], ['255,220,120', 0.5, 0.9]];
        blobs.forEach(([col, px, sp], i) => {
          const x = W * (px + 0.35 * Math.sin(lt * sp + i * 2)), y = H * (0.5 + 0.4 * Math.cos(lt * sp * 0.7 + i));
          const r = Math.max(W, H) * 0.45;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(${col},0.85)`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        });
        ctx.restore();
        break;
      }
      case 'glow': redraw(snap(), `blur(${14 * k}px) brightness(130%)`, 0.6 * clamp(I, 0, 1), 'screen'); break;
      case 'dream': {
        const img = snap();
        redraw(img, `blur(${18 * k}px) saturate(140%)`, 0.55 * clamp(I, 0, 1), 'screen');
        ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.4 * clamp(I, 0, 1); ctx.fillStyle = '#ff9ecf'; ctx.fillRect(0, 0, W, H); ctx.restore();
        break;
      }
      case 'rainbow': {
        ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.45 * clamp(I, 0, 1);
        const off = (lt * 0.3) % 1;
        const g = ctx.createLinearGradient(-W + off * W * 2, 0, W + off * W * 2, H);
        ['#ff004c', '#ff9a00', '#ffe600', '#22ff7a', '#00b7ff', '#8a2bff', '#ff004c'].forEach((col, i, arr) => g.addColorStop(i / (arr.length - 1), col));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
        break;
      }
      case 'snow':
        ctx.save(); ctx.fillStyle = '#fff';
        particles(Math.round(160 * I), (i, a, b, s, r) => {
          const y = ((b + lt * (0.05 + s * 0.12)) % 1.05) * H;
          const x = (a + 0.02 * Math.sin(lt * (1 + s) + i)) * W;
          ctx.globalAlpha = 0.5 + r * 0.5; ctx.beginPath(); ctx.arc(x, y, (1.5 + r * 4) * k, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore(); break;
      case 'rain':
        ctx.save(); ctx.strokeStyle = 'rgba(200,220,255,0.55)'; ctx.lineWidth = 1.5 * k;
        particles(Math.round(220 * I), (i, a, b, s) => {
          const y = ((b + lt * (0.9 + s * 0.8)) % 1.1) * H, x = a * W - y * 0.15;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6 * k, y + (30 + s * 30) * k); ctx.stroke();
        });
        ctx.fillStyle = 'rgba(20,30,60,0.15)'; ctx.fillRect(0, 0, W, H);
        ctx.restore(); break;
      case 'confetti': {
        const cols = ['#ff3d71', '#ffd400', '#00d68f', '#3d8bff', '#ff8a00', '#b44dff'];
        ctx.save();
        particles(Math.round(140 * I), (i, a, b, s, r) => {
          const y = ((b - 0.2 + lt * (0.12 + s * 0.2)) % 1.2) * H;
          const x = (a + 0.03 * Math.sin(lt * 3 + i)) * W;
          ctx.save(); ctx.translate(x, y); ctx.rotate(lt * (2 + s * 5) + i);
          ctx.scale(1, Math.cos(lt * 6 + i)); ctx.fillStyle = cols[i % cols.length];
          ctx.fillRect(-6 * k, -3 * k, 12 * k, 7 * k); ctx.restore();
        });
        ctx.restore(); break;
      }
      case 'hearts':
      case 'sparkle':
      case 'bubbles': {
        const type = c.fx.type;
        ctx.save();
        particles(Math.round((type === 'sparkle' ? 50 : 36) * I), (i, a, b, s, r) => {
          const life = 3 + s * 3;
          const ph = ((lt + b * life) % life) / life;
          let x = a * W, y;
          if (type === 'sparkle') { y = b * H; }
          else { y = H * (1.05 - ph * 1.2); x += Math.sin(ph * 8 + i) * 30 * k; }
          const alpha = type === 'sparkle' ? Math.max(0, Math.sin(ph * Math.PI)) : Math.min(1, (1 - ph) * 2);
          ctx.globalAlpha = alpha;
          if (type === 'hearts') {
            ctx.font = `${Math.round((28 + r * 40) * k)}px sans-serif`;
            ctx.fillText(['❤️', '💖', '💕', '💗'][i % 4], x, y);
          } else if (type === 'bubbles') {
            ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2 * k;
            ctx.fillStyle = 'rgba(160,220,255,0.15)';
            ctx.beginPath(); ctx.arc(x, y, (8 + r * 26) * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          } else {
            const sz = (6 + r * 18) * k * (0.5 + alpha);
            ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff6b0'; ctx.shadowBlur = 12 * k;
            ctx.beginPath();
            ctx.moveTo(x, y - sz); ctx.quadraticCurveTo(x, y, x + sz, y); ctx.quadraticCurveTo(x, y, x, y + sz);
            ctx.quadraticCurveTo(x, y, x - sz, y); ctx.quadraticCurveTo(x, y, x, y - sz); ctx.fill();
          }
        });
        ctx.restore(); break;
      }
      case 'pixelate': {
        const img = snap();
        const ps = Math.max(2, (6 + 34 * clamp(I, 0, 1)) * k);
        const sm = this.layer(5);
        const w = Math.max(1, Math.round(W / ps)), hh = Math.max(1, Math.round(H / ps));
        sm.ctx.drawImage(img, 0, 0, w, hh);
        ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(sm.c, 0, 0, w, hh, 0, 0, W, H); ctx.restore();
        break;
      }
      case 'mirror': {
        const img = snap();
        ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, W / 2, H, 0, 0, W / 2, H); ctx.restore();
        break;
      }
      case 'kaleido': {
        const img = snap();
        const hw = W / 2, hh = H / 2;
        ctx.save(); ctx.drawImage(img, hw / 2, hh / 2, hw, hh, 0, 0, hw, hh); ctx.restore();
        ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(img, hw / 2, hh / 2, hw, hh, 0, 0, hw, hh); ctx.restore();
        ctx.save(); ctx.translate(0, H); ctx.scale(1, -1); ctx.drawImage(img, hw / 2, hh / 2, hw, hh, 0, 0, hw, hh); ctx.restore();
        ctx.save(); ctx.translate(W, H); ctx.scale(-1, -1); ctx.drawImage(img, hw / 2, hh / 2, hw, hh, 0, 0, hw, hh); ctx.restore();
        break;
      }
      case 'bw': redraw(snap(), `grayscale(${clamp(I, 0, 1) * 100}%) contrast(115%)`); break;
      case 'negative': redraw(snap(), `invert(${clamp(I, 0, 1) * 100}%)`); break;
      case 'frame': {
        const img = snap();
        const m = Math.min(W, H) * 0.06 * clamp(I, 0.3, 1.5), mb = m * 3;
        ctx.save(); ctx.fillStyle = '#f7f5ef'; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, m, m, W - m * 2, H - m - mb);
        ctx.fillStyle = '#333'; ctx.font = `italic ${Math.round(mb * 0.35)}px "Brush Script MT", "Segoe Script", cursive`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(state.project.name || '', W / 2, H - mb / 2);
        ctx.restore();
        break;
      }
      case 'duotone': {
        const img = snap();
        redraw(img, 'grayscale(100%) contrast(120%)');
        ctx.save(); ctx.globalAlpha = clamp(I, 0, 1);
        ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#ff8a5c'; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = '#3a0f6b'; ctx.fillRect(0, 0, W, H);
        ctx.restore();
        break;
      }
      case 'heartbeat': {
        const img = snap();
        const ph = lt % 1;
        const pulse = Math.max(0, 1 - ph / 0.12) + 0.6 * Math.max(0, 1 - Math.abs(ph - 0.26) / 0.1);
        const s = 1 + 0.08 * I * pulse;
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.drawImage(img, -W / 2, -H / 2); ctx.restore();
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2);
        g.addColorStop(0, 'rgba(255,0,40,0)'); g.addColorStop(1, `rgba(255,0,40,${0.45 * clamp(I, 0, 1) * pulse})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        break;
      }
      case 'tvoff': {
        const p = clamp((lt - (d - 0.7)) / 0.7, 0, 1);
        if (p <= 0) break;
        const img = snap();
        ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        const sy = p < 0.6 ? Math.max(0.006, 1 - p / 0.6) : 0.006;
        const sx = p < 0.6 ? 1 : Math.max(0, 1 - (p - 0.6) / 0.4);
        ctx.translate(W / 2, H / 2); ctx.scale(sx, sy); ctx.filter = `brightness(${100 + p * 250}%)`;
        ctx.drawImage(img, -W / 2, -H / 2); ctx.restore();
        break;
      }
      case 'dust': {
        ctx.save();
        const n = Math.round(40 * I);
        for (let i = 0; i < n; i++) {
          const x = hash(fr, i) * W, y = hash(fr, i + 500) * H, r = (0.6 + hash(fr, i + 900) * 2.5) * k;
          ctx.globalAlpha = 0.3 + hash(fr, i + 1300) * 0.5;
          ctx.fillStyle = hash(fr, i + 1700) > 0.5 ? '#fff' : '#111';
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        if (hash(fr, 77) < 0.3 * I) {
          ctx.strokeStyle = 'rgba(20,20,20,.6)'; ctx.lineWidth = 1.2 * k; ctx.beginPath();
          const x = hash(fr, 88) * W, y = hash(fr, 99) * H;
          ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 20 * k, y + 10 * k, x + 15 * k, y + 40 * k); ctx.stroke();
        }
        ctx.restore();
        grain(0.15 * I);
        break;
      }
      case 'bokeh': {
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        const cols = ['255,190,90', '255,120,160', '140,200,255', '255,240,170'];
        particles(Math.round(22 * clamp(I, 0.2, 1.5)), (i, a, b, s2, r) => {
          const x = (a + 0.04 * Math.sin(lt * 0.4 + i)) * W, y = (b + 0.04 * Math.cos(lt * 0.3 + i * 2)) * H;
          const rad = (40 + r * 90) * k;
          const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
          const al = 0.25 + 0.2 * Math.sin(lt * (0.8 + s2) + i);
          gr.addColorStop(0, `rgba(${cols[i % 4]},${al})`); gr.addColorStop(0.7, `rgba(${cols[i % 4]},${al * 0.7})`); gr.addColorStop(1, `rgba(${cols[i % 4]},0)`);
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
        break;
      }
      case 'fireflies': {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        particles(Math.round(45 * clamp(I, 0.2, 1.5)), (i, a, b, s2, r) => {
          const x = (a + 0.06 * Math.sin(lt * (0.5 + s2) + i * 3)) * W, y = (b + 0.05 * Math.cos(lt * (0.4 + r) + i)) * H;
          const al = Math.max(0, Math.sin(lt * (1.5 + s2 * 2) + i * 7));
          const rad = (10 + r * 14) * k;
          const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
          gr.addColorStop(0, `rgba(255,250,170,${al})`); gr.addColorStop(0.25, `rgba(220,255,90,${al * 0.6})`); gr.addColorStop(1, 'rgba(180,255,60,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
        break;
      }
      case 'rec': {
        ctx.save();
        const m = 40 * k, L = 60 * k;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4 * k;
        [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
          ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
        });
        ctx.font = `700 ${Math.round(40 * k)}px "Courier New", monospace`;
        ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
        if (Math.floor(lt * 1.5) % 2 === 0) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(m + 40 * k, m + 50 * k, 14 * k, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#fff'; ctx.fillText('REC', m + 65 * k, m + 52 * k);
        ctx.textAlign = 'right'; ctx.fillText(fmtTime(lt).replace('.', ':'), W - m - 30 * k, m + 52 * k);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * k; ctx.strokeRect(W - m - 120 * k, H - m - 70 * k, 70 * k, 32 * k);
        ctx.fillRect(W - m - 115 * k, H - m - 65 * k, 45 * k, 22 * k);
        ctx.restore();
        break;
      }
    }
  },

  drawSelection() {
    const sel = state.selected;
    if (!sel) return;
    const b = this.bounds.get(sel);
    if (!b) return;
    const { ctx } = this;
    const s = Math.max(1, this.H / 540);
    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(b.rot * Math.PI / 180);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * s;
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 4 * s;
    ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.shadowBlur = 0;
    const hs = 9 * s;
    ctx.fillStyle = '#fff';
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath(); ctx.arc(x * b.w / 2, y * b.h / 2, hs, 0, Math.PI * 2); ctx.fill();
    }
    // döndürme tutamacı
    ctx.beginPath(); ctx.moveTo(0, -b.h / 2); ctx.lineTo(0, -b.h / 2 - 30 * s); ctx.stroke();
    ctx.fillStyle = '#7c5cff';
    ctx.beginPath(); ctx.arc(0, -b.h / 2 - 30 * s, hs, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  /* Önizlemede tıklanan noktadaki klibi bulur */
  hitTest(px, py) {
    const tracks = state.project.tracks;
    for (const tr of tracks) {
      if (tr.hidden || tr.kind === 'audio' || tr.kind === 'fx') continue;
      for (let i = tr.clips.length - 1; i >= 0; i--) {
        const c = tr.clips[i];
        const b = this.bounds.get(c.id);
        if (!b) continue;
        if (this.inBounds(b, px, py)) return c;
      }
    }
    return null;
  },
  toLocal(b, px, py) {
    const r = -b.rot * Math.PI / 180;
    const dx = px - b.cx, dy = py - b.cy;
    return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)];
  },
  inBounds(b, px, py) {
    const [x, y] = this.toLocal(b, px, py);
    return Math.abs(x) <= b.w / 2 && Math.abs(y) <= b.h / 2;
  },
  handleAt(px, py) {
    const b = this.bounds.get(state.selected);
    if (!b) return null;
    const s = Math.max(1, this.H / 540);
    const [x, y] = this.toLocal(b, px, py);
    const r = 22 * s;
    if (Math.hypot(x, y + b.h / 2 + 30 * s) < r) return 'rotate';
    for (const [hx, hy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (Math.hypot(x - hx * b.w / 2, y - hy * b.h / 2) < r) return 'scale';
    }
    return null;
  },
};
