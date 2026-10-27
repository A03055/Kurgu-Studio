'use strict';
/* Zaman çizelgesi: izler, klipler, sürükle-bırak, kırpma, yakalama (snap) */

const HEAD_W = 132;
const TRACK_H = { fx: 34, text: 38, video: 62, audio: 46 };
const KIND_LABEL = { video: 'Video', image: 'Resim', audio: 'Ses', text: 'Metin', fx: 'Efekt' };

const TL = {
  scroll: null, inner: null, ruler: null, rctx: null, playhead: null, phMark: null,

  init() {
    this.scroll = $('#tlScroll');
    this.inner = $('#tlInner');
    this.scroll.addEventListener('scroll', () => this.drawRuler());
    new ResizeObserver(() => { this.render(); }).observe(this.scroll);
    this.scroll.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const t = this.timeAt(e.clientX);
        const before = e.clientX - this.scroll.getBoundingClientRect().left;
        this.setZoom(state.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
        this.scroll.scrollLeft = HEAD_W + t * state.zoom - before;
      } else if (!e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY) && this.inner.scrollHeight <= this.scroll.clientHeight + 2) {
        this.scroll.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  },

  setZoom(z) {
    state.zoom = clamp(z, 4, 400);
    const zs = $('#zoomSlider');
    if (zs) zs.value = Math.log(state.zoom);
    this.render();
  },

  fitZoom() {
    const d = Math.max(5, projectDuration());
    this.setZoom((this.scroll.clientWidth - HEAD_W - 40) / d);
    this.scroll.scrollLeft = 0;
  },

  timeAt(clientX) {
    const r = this.scroll.getBoundingClientRect();
    return (clientX - r.left + this.scroll.scrollLeft - HEAD_W) / state.zoom;
  },

  laneWidth() {
    const vis = (this.scroll.clientWidth - HEAD_W) / state.zoom;
    return Math.max(projectDuration() + 30, vis + 5) * state.zoom;
  },

  render() {
    if (!this.inner) return;
    const W = this.laneWidth();
    this.inner.innerHTML = '';
    this.inner.style.width = (HEAD_W + W) + 'px';

    // cetvel
    const rrow = h('div', { class: 'tl-row tl-ruler' },
      h('div', { class: 'tl-head tl-corner' }, h('span', { class: 'tc-mini', id: 'tlTc' }, fmtTime(state.time))),
      h('div', { class: 'lane ruler-lane' }));
    this.ruler = h('canvas', { class: 'ruler-canvas' });
    rrow.querySelector('.ruler-lane').appendChild(this.ruler);
    this.rctx = this.ruler.getContext('2d');
    this.phMark = h('div', { class: 'ph-mark' });
    rrow.querySelector('.ruler-lane').appendChild(this.phMark);
    rrow.querySelector('.ruler-lane').addEventListener('pointerdown', e => this.scrubStart(e));
    this.inner.appendChild(rrow);

    for (const tr of state.project.tracks) this.inner.appendChild(this.trackRow(tr));

    // iz ekleme satırı
    const addRow = h('div', { class: 'tl-row tl-addrow' },
      h('div', { class: 'tl-head' },
        h('button', { class: 'mini-btn', title: 'Video katmanı ekle', onclick: () => this.addTrackUI('video') }, '+ Video'),
        h('button', { class: 'mini-btn', title: 'Ses izi ekle', onclick: () => this.addTrackUI('audio') }, '+ Ses')),
      h('div', { class: 'lane', onpointerdown: e => this.laneDown(e) }));
    this.inner.appendChild(addRow);

    this.playhead = h('div', { class: 'playhead' });
    this.inner.appendChild(this.playhead);
    this.drawRuler();
    this.updatePlayhead();
  },

  addTrackUI(kind) {
    History.checkpoint();
    addTrack(kind);
    refresh();
  },

  trackRow(tr) {
    const icons = { fx: 'sparkles', text: 'text', video: 'media', audio: 'audio' };
    const head = h('div', { class: 'tl-head' },
      h('span', { class: 'th-icon', html: icon(icons[tr.kind], 14) }),
      h('span', { class: 'th-name', title: tr.name + ' (çift tıkla: yeniden adlandır)', ondblclick: () => {
        const n = prompt('İz adı', tr.name);
        if (n) { History.checkpoint(); tr.name = n; refresh(); }
      } }, tr.name + (tr.main ? ' ★' : '')),
      h('span', { class: 'th-btns' },
        tr.kind !== 'audio' ? h('button', { class: 'ib' + (tr.hidden ? ' off' : ''), title: tr.hidden ? 'Göster' : 'Gizle', html: icon(tr.hidden ? 'eyeOff' : 'eye', 14), onclick: () => { History.checkpoint(); tr.hidden = !tr.hidden; refresh(); } }) : null,
        (tr.kind === 'video' || tr.kind === 'audio') ? h('button', { class: 'ib' + (tr.muted ? ' off' : ''), title: tr.muted ? 'Sesi aç' : 'Sessiz', html: icon(tr.muted ? 'mute' : 'vol', 14), onclick: () => { History.checkpoint(); tr.muted = !tr.muted; refresh(); } }) : null,
        !tr.main ? h('button', { class: 'ib', title: 'İzi sil', html: icon('x', 14), onclick: () => this.deleteTrack(tr) }) : null,
      ));
    const lane = h('div', { class: 'lane', 'data-track': tr.id });
    lane.addEventListener('pointerdown', e => this.laneDown(e));
    lane.addEventListener('dragover', e => this.dragOver(e, tr, lane));
    lane.addEventListener('dragleave', () => lane.classList.remove('drop'));
    lane.addEventListener('drop', e => this.drop(e, tr, lane));
    for (const c of tr.clips) lane.appendChild(this.clipEl(c, tr));
    // geçiş işaretleri
    for (const c of tr.clips) {
      const prev = prevAdjacent(tr, c);
      if (!prev || tr.kind === 'audio' || tr.kind === 'fx') continue;
      const has = c.transition && c.transition.type;
      const mk = h('button', { class: 'tr-mark' + (has ? ' on' : ''), title: has ? 'Geçiş: ' + (TRANSITIONS.find(x => x.id === c.transition.type) || {}).name : 'Geçiş ekle', html: icon('transition', 12) });
      mk.style.left = (c.start * state.zoom) + 'px';
      mk.addEventListener('pointerdown', e => e.stopPropagation());
      mk.addEventListener('click', e => { e.stopPropagation(); select(c.id); Panels.show('transition'); });
      lane.appendChild(mk);
    }
    return h('div', { class: `tl-row tr-${tr.kind}${tr.hidden ? ' hidden-track' : ''}`, style: { height: TRACK_H[tr.kind] + 'px' } }, head, lane);
  },

  deleteTrack(tr) {
    if (tr.clips.length && !confirm(`"${tr.name}" izindeki ${tr.clips.length} klip silinecek. Emin misin?`)) return;
    History.checkpoint();
    state.project.tracks = state.project.tracks.filter(t => t !== tr);
    refresh();
  },

  clipLabel(c) {
    if (c.kind === 'text') return (c.text.content || '').replace(/\n/g, ' ') || 'Metin';
    if (c.kind === 'fx') return (EFFECTS.find(e => e.id === c.fx.type) || {}).name || 'Efekt';
    const m = state.media.get(c.mediaId);
    return c.name || (m ? m.name : 'Kayıp medya');
  },

  clipEl(c, tr) {
    const z = state.zoom;
    const dur = clipDur(c);
    const el = h('div', { class: `clip k-${c.kind}${state.selected === c.id ? ' sel' : ''}${state.multi.has(c.id) ? ' msel' : ''}`, 'data-clip': c.id });
    el.style.left = (c.start * z) + 'px';
    el.style.width = Math.max(4, dur * z) + 'px';
    const m = state.media.get(c.mediaId);
    if (m) {
      if ((c.kind === 'video' || c.kind === 'image') && m.thumb) {
        el.style.backgroundImage = `url(${m.thumb})`;
      } else if (c.kind === 'audio' && m.wave) {
        const full = m.duration / c.speed * z;
        el.style.backgroundImage = `url(${m.wave})`;
        el.style.backgroundSize = `${full}px 100%`;
        el.style.backgroundPosition = `${-c.in / c.speed * z}px 0`;
        el.style.backgroundRepeat = 'no-repeat';
      }
    } else if (c.mediaId) el.classList.add('missing');
    const badges = [];
    if (isMediaKind(c.kind) && c.speed !== 1) badges.push(`${c.speed}x`);
    if (c.kind === 'video' || c.kind === 'audio') if (c.volume === 0 && !kfList(c, 'volume')) badges.push('🔇');
    if (c.afx && c.afx !== 'none') badges.push('🎛');
    if (c.duck) badges.push('↘');
    if (c.key && c.key.on) badges.push('🟩');
    if (c.mask && c.mask.type !== 'none') badges.push('◐');
    if (c.filters && Object.keys(DEFAULT_FILTERS).some(k => c.filters[k] !== DEFAULT_FILTERS[k])) badges.push('🎨');
    if ((c.anim && c.anim !== 'none') || (c.animOut && c.animOut !== 'none') || (c.loop && c.loop !== 'none')) badges.push('✨');
    el.appendChild(h('div', { class: 'clip-label' },
      c.kind === 'text' ? h('span', { class: 'k-ic', html: icon('text', 11) }) : null,
      c.kind === 'fx' ? h('span', { class: 'k-ic', html: icon('sparkles', 11) }) : null,
      h('span', { class: 'cl-name' }, this.clipLabel(c)),
      badges.length ? h('span', { class: 'cl-badges' }, badges.join(' ')) : null,
      h('span', { class: 'cl-dur' }, fmtShort(dur))));
    if (c.fadeIn > 0) el.appendChild(h('div', { class: 'fade-in', style: { width: (c.fadeIn * z) + 'px' } }));
    if (c.fadeOut > 0) el.appendChild(h('div', { class: 'fade-out', style: { width: (c.fadeOut * z) + 'px' } }));
    // anahtar kareler ve ritim noktaları
    if (c.kf) {
      const ts = new Set();
      for (const p of KF_PROPS) for (const k of (c.kf[p] || [])) ts.add(Math.round(k.t * 1000) / 1000);
      for (const t of ts) el.appendChild(h('div', { class: 'kf-dot', style: { left: (t * z) + 'px' } }));
    }
    if (m && m.beats && (c.kind === 'audio' || c.kind === 'video')) {
      for (const b of m.beats) if (b >= c.in && b <= c.out) el.appendChild(h('div', { class: 'beat-dot', style: { left: ((b - c.in) / c.speed * z) + 'px' } }));
    }
    const hl = h('div', { class: 'handle hl' }), hr = h('div', { class: 'handle hr' });
    el.append(hl, hr);
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const mode = e.target === hl ? 'left' : e.target === hr ? 'right' : 'move';
      this.clipDown(e, c, tr, mode);
    });
    el.addEventListener('contextmenu', e => { e.preventDefault(); select(c.id); showContextMenu(e.clientX, e.clientY, c); });
    el.addEventListener('dblclick', () => { if (c.kind === 'text') { Inspector.focusText(); } });
    return el;
  },

  snapPoints(excludeId) {
    const pts = [0, state.time];
    for (const c of allClips()) {
      if (c.id === excludeId) continue;
      pts.push(c.start, clipEnd(c));
      if (c.mediaId) { const m = state.media.get(c.mediaId); if (m && m.beats) pts.push(...beatTimes(c)); }
    }
    return pts;
  },
  snapVal(v, pts) {
    if (!state.snap) return { v, hit: null };
    const th = 9 / state.zoom;
    let best = null, bd = th;
    for (const p of pts) { const d = Math.abs(p - v); if (d < bd) { bd = d; best = p; } }
    return best === null ? { v, hit: null } : { v: best, hit: best };
  },
  showSnapLine(t) {
    let ln = $('.snap-line', this.inner);
    if (t === null) { if (ln) ln.remove(); return; }
    if (!ln) { ln = h('div', { class: 'snap-line' }); this.inner.appendChild(ln); }
    ln.style.left = (HEAD_W + t * state.zoom) + 'px';
  },

  clipDown(e, c, tr, mode) {
    e.stopPropagation();
    e.preventDefault();
    if (e.shiftKey || e.ctrlKey || e.metaKey) { select(c.id, true); return; }
    if (state.multi.has(c.id)) { state.multi.delete(c.id); if (state.selected) state.multi.add(state.selected); state.selected = c.id; Inspector.render(); }
    else if (state.selected !== c.id) select(c.id);
    const group = mode === 'move' ? selectedClips().filter(x => x.clip !== c).map(x => ({ clip: x.clip, start: x.clip.start })) : [];
    const groupMin = Math.min(c.start, ...group.map(g => g.start));
    const sx = e.clientX, sy = e.clientY;
    const orig = { start: c.start, in: c.in, out: c.out, end: clipEnd(c) };
    const dur = clipDur(c);
    const pts = this.snapPoints(c.id);
    let cur = tr, moved = false;
    const m = state.media.get(c.mediaId);
    const onMove = ev => {
      if (!moved && Math.abs(ev.clientX - sx) < 3 && Math.abs(ev.clientY - sy) < 3) return;
      if (!moved) { History.checkpoint(); moved = true; document.body.classList.add('dragging'); }
      const dt = (ev.clientX - sx) / state.zoom;
      let hit = null;
      if (mode === 'move') {
        let ns = Math.max(0, orig.start + dt);
        const a = this.snapVal(ns, pts), b = this.snapVal(ns + dur, pts);
        if (a.hit !== null && (b.hit === null || Math.abs(a.v - ns) <= Math.abs(b.v - ns - dur))) { ns = a.v; hit = a.hit; }
        else if (b.hit !== null) { ns = b.v - dur; hit = b.hit; }
        if (group.length) ns = Math.max(ns, orig.start - groupMin);
        c.start = Math.max(0, ns);
        for (const g of group) g.clip.start = g.start + (c.start - orig.start);
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const laneEl = !group.length && under && under.closest('.lane[data-track]');
        if (laneEl) {
          const tgt = findTrack(laneEl.dataset.track);
          if (tgt && tgt !== cur && acceptsKind(tgt, c.kind)) {
            cur.clips = cur.clips.filter(x => x !== c);
            tgt.clips.push(c);
            cur = tgt;
          }
        }
      } else if (mode === 'left') {
        let ns = orig.start + dt;
        const s = this.snapVal(ns, pts); ns = s.v; hit = s.hit;
        const prevEnd = Math.max(0, ...cur.clips.filter(o => o !== c && clipEnd(o) <= orig.start + 1e-4).map(clipEnd));
        const minStart = isMediaKind(c.kind) ? orig.start - orig.in / c.speed : -Infinity;
        ns = clamp(ns, Math.max(prevEnd, minStart, 0), orig.end - MIN_DUR);
        if (isMediaKind(c.kind)) { c.in = orig.in + (ns - orig.start) * c.speed; c.start = ns; }
        else { c.start = ns; c.in = 0; c.out = orig.end - ns; }
      } else {
        let ne = orig.end + dt;
        const s = this.snapVal(ne, pts); ne = s.v; hit = s.hit;
        const next = Math.min(Infinity, ...cur.clips.filter(o => o !== c && o.start >= orig.end - 1e-4).map(o => o.start));
        const maxEnd = isMediaKind(c.kind) && m ? orig.start + (m.duration - orig.in) / c.speed : Infinity;
        ne = clamp(ne, orig.start + MIN_DUR, Math.min(next, maxEnd));
        c.out = orig.in + (ne - orig.start) * (isMediaKind(c.kind) ? c.speed : 1);
      }
      this.render();
      this.showSnapLine(hit);
      Engine.dirty = true;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('dragging');
      this.showSnapLine(null);
      if (!moved) return;
      if (mode === 'move' && !group.length) c.start = findFreeStart(cur, c, c.start);
      refresh();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  },

  laneDown(e) {
    if (e.button !== 0) return;
    if (state.selected || state.multi.size) { state.selected = null; state.multi.clear(); refresh({ timeline: false }); this.markSelected(); }
    this.scrubStart(e);
  },

  scrubStart(e) {
    const move = ev => {
      let t = Math.max(0, this.timeAt(ev.clientX));
      if (state.snap && !ev.shiftKey) { const s = this.snapVal(t, this.snapPoints(null).slice(2)); t = s.v; }
      Engine.seek(t);
    };
    move(e);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },

  markSelected() {
    $$('.clip', this.inner).forEach(el => {
      el.classList.toggle('sel', el.dataset.clip === state.selected);
      el.classList.toggle('msel', state.multi.has(el.dataset.clip));
    });
  },

  updatePlayhead() {
    if (!this.playhead) return;
    const x = state.time * state.zoom;
    this.playhead.style.left = (HEAD_W + x) + 'px';
    if (this.phMark) this.phMark.style.left = x + 'px';
    const tc = $('#tlTc'); if (tc) tc.textContent = fmtTime(state.time);
    if (state.playing) {
      const sl = this.scroll.scrollLeft, vw = this.scroll.clientWidth - HEAD_W;
      if (x < sl || x > sl + vw - 40) this.scroll.scrollLeft = Math.max(0, x - vw * 0.15);
    }
    if (parseFloat(this.inner.style.width) < HEAD_W + x + 200) this.render();
  },

  drawRuler() {
    if (!this.ruler) return;
    const vw = Math.max(10, this.scroll.clientWidth - HEAD_W);
    const dpr = window.devicePixelRatio || 1;
    const H = 26;
    if (this.ruler.width !== Math.round(vw * dpr)) { this.ruler.width = Math.round(vw * dpr); this.ruler.height = H * dpr; }
    this.ruler.style.width = vw + 'px'; this.ruler.style.height = H + 'px';
    const ctx = this.rctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, H);
    const z = state.zoom, sl = this.scroll.scrollLeft;
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const major = steps.find(s => s * z >= 70) || 600;
    const minor = major / (major >= 1 && major % 5 === 0 ? 5 : 2);
    const t0 = Math.floor(sl / z / minor) * minor;
    const t1 = (sl + vw) / z;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    for (let t = t0; t <= t1; t += minor) {
      const x = Math.round(t * z - sl) + 0.5;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      ctx.strokeStyle = isMajor ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.18)';
      ctx.beginPath(); ctx.moveTo(x, isMajor ? 12 : 18); ctx.lineTo(x, H); ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.fillText(major < 1 ? t.toFixed(1) + 's' : fmtShort(t).replace('.0s', 's'), x + 3, 2);
      }
    }
  },

  /* ---- kütüphaneden sürükle-bırak ---- */
  dragOver(e, tr, lane) {
    if (!e.dataTransfer.types.includes('application/x-kurgu')) return;
    e.preventDefault();
    lane.classList.add('drop');
  },
  drop(e, tr, lane) {
    lane.classList.remove('drop');
    const raw = e.dataTransfer.getData('application/x-kurgu');
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    const item = JSON.parse(raw);
    const t = Math.max(0, this.timeAt(e.clientX));
    if (item.type === 'transition') {
      const clipEl = e.target.closest('.clip');
      const c = clipEl && findClip(clipEl.dataset.clip);
      if (c) applyTransition(c.clip, item.id);
      else toast('Geçişi bir klibin üzerine bırak');
      return;
    }
    if (item.type === 'filter') {
      const clipEl = e.target.closest('.clip');
      const c = clipEl && findClip(clipEl.dataset.clip);
      if (c) applyFilterPreset(c.clip, item.id);
      return;
    }
    Library.add(item, { time: t, track: tr });
  },
};
