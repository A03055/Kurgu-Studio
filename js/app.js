'use strict';
/* Uygulama: düzen, düzenleme komutları, klavye kısayolları, önizleme etkileşimi */

function refresh({ timeline = true, inspector = true } = {}) {
  if (state.selected && !findClip(state.selected)) state.selected = null;
  Engine.prune();
  Engine.resize();
  if (timeline) TL.render();
  if (inspector) Inspector.render();
  Engine.dirty = true;
  updateTransport();
  $('#projName').value = state.project.name;
  $('#aspectQuick').value = state.project.aspect;
  $('#emptyHint').classList.toggle('hidden', allClips().length > 0);
  Store.saveProject();
}

function select(id, additive = false) {
  if (additive && id) {
    if (state.selected && state.selected !== id) state.multi.add(state.selected);
    if (state.multi.has(id)) { state.multi.delete(id); id = [...state.multi].pop() || null; if (id) state.multi.delete(id); }
  } else state.multi.clear();
  state.selected = id;
  TL.markSelected();
  Inspector.render();
  if (Panels.tab === 'transition' || Panels.tab === 'filter') Panels.show(Panels.tab);
  Engine.dirty = true;
}

function updateTransport() {
  $('#tcCur').textContent = fmtTime(state.time);
  $('#tcDur').textContent = fmtTime(projectDuration());
}

/* ---- düzenleme komutları ---- */
function splitClip(clip, track, t) {
  if (t <= clip.start + 0.03 || t >= clipEnd(clip) - 0.03) return null;
  const origEnd = clipEnd(clip);
  const c2 = JSON.parse(JSON.stringify(clip));
  c2.id = uid();
  splitKf(clip, c2, t - clip.start, t);
  if (isMediaKind(clip.kind)) {
    const cut = clip.in + (t - clip.start) * clip.speed;
    clip.out = cut; c2.in = cut; c2.start = t;
  } else {
    clip.in = 0; clip.out = t - clip.start;
    c2.in = 0; c2.out = origEnd - t; c2.start = t;
  }
  clip.fadeOut = 0; clip.animOut = 'none';
  c2.fadeIn = 0; c2.anim = 'none'; c2.transition = null;
  if (c2.text) c2.text.typewriter = false;
  track.clips.push(c2);
  return c2;
}

function splitSelected() {
  const t = state.time;
  let targets = selectedClips();
  if (!targets.length) {
    for (const track of state.project.tracks) for (const clip of track.clips) if (t > clip.start && t < clipEnd(clip)) targets.push({ clip, track });
  }
  targets = targets.filter(({ clip }) => t > clip.start + 0.03 && t < clipEnd(clip) - 0.03);
  if (!targets.length) return toast('Bölmek için oynatma çizgisini bir klibin üzerine getir');
  History.checkpoint();
  let last = null;
  for (const { clip, track } of targets) last = splitClip(clip, track, t) || last;
  state.multi.clear();
  state.selected = last ? last.id : state.selected;
  refresh();
}

function deleteSelected() {
  const sel = selectedClips();
  if (!sel.length) return;
  History.checkpoint();
  for (const { clip, track } of sel) track.clips = track.clips.filter(c => c !== clip);
  state.selected = null;
  state.multi.clear();
  refresh();
}

/* Boşluk bırakmadan sil (ana iz için) */
function rippleDeleteSelected() {
  const sel = findClip(state.selected);
  if (!sel) return;
  History.checkpoint();
  const d = clipDur(sel.clip), s = sel.clip.start;
  sel.track.clips = sel.track.clips.filter(c => c !== sel.clip);
  for (const c of sel.track.clips) if (c.start >= s) c.start -= d;
  state.selected = null;
  refresh();
}

function duplicateSelected() {
  const sel = selectedClips();
  if (!sel.length) return;
  History.checkpoint();
  const span0 = Math.min(...sel.map(x => x.clip.start)), span1 = Math.max(...sel.map(x => clipEnd(x.clip)));
  let last = null;
  for (const { clip, track } of sel) {
    const c2 = JSON.parse(JSON.stringify(clip));
    c2.id = uid();
    track.clips.push(c2);
    c2.start = findFreeStart(track, c2, clip.start + (span1 - span0));
    last = c2;
  }
  state.multi.clear();
  state.selected = last.id;
  refresh();
}

function detachAudio(c) {
  const sel = findClip(c.id);
  if (!sel || c.kind !== 'video') return;
  const m = state.media.get(c.mediaId);
  if (!m || !m.wave) return toast('Bu videoda ses bulunamadı');
  History.checkpoint();
  const a = makeClip('audio', { mediaId: c.mediaId, start: c.start, in: c.in, out: c.out, speed: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, name: (m.name || '') + ' (ses)' });
  c.volume = 0;
  let tr = state.project.tracks.find(t => t.kind === 'audio' && t.clips.every(o => clipEnd(o) <= a.start || o.start >= clipEnd(a)));
  if (!tr) tr = addTrack('audio');
  tr.clips.push(a);
  refresh();
  toast('Ses ayrı ize alındı', 'ok');
}

function applyTransition(c, type) {
  History.checkpoint();
  c.transition = type ? { type, dur: (c.transition && c.transition.dur) || 0.6 } : null;
  state.selected = c.id;
  refresh();
  if (Panels.tab === 'transition') Panels.show('transition');
  if (type) {
    const sel = findClip(c.id);
    const prev = sel && prevAdjacent(sel.track, c);
    const w0 = prev ? c.start - c.transition.dur / 2 : c.start;
    Engine.seek(Math.max(0, w0 - 0.4));
    toast('Geçiş eklendi: ' + TRANSITIONS.find(x => x.id === type).name, 'ok');
  }
}

function applyTransitionAll(track, tr) {
  if (!track) return;
  const cuts = track.clips.filter(c => prevAdjacent(track, c));
  if (!cuts.length) return toast('Bu izde bitişik iki klip yok. Klipleri uç uca koy ya da bir klibi böl.');
  History.checkpoint();
  for (const c of cuts) c.transition = { type: tr.type, dur: tr.dur };
  refresh();
  toast(`${cuts.length} kesmeye geçiş eklendi`, 'ok');
}

function applyFilterPreset(c, id) {
  const p = FILTER_PRESETS.find(x => x.id === id);
  if (!p) return;
  History.checkpoint();
  const blur = c.filters ? c.filters.blur : 0;
  c.filters = Object.assign({ ...DEFAULT_FILTERS }, p.f, { blur });
  state.selected = c.id;
  refresh();
}

function freezeFrame() {
  const sel = findClip(state.selected);
  if (!sel || sel.clip.kind !== 'video') return toast('Önce bir video klibi seç');
  const c = sel.clip, t = state.time;
  if (t < c.start || t >= clipEnd(c)) return toast('Oynatma çizgisini videonun üzerine getir');
  const x = Engine.getEl(c);
  if (!x || x.el.readyState < 2) return toast('Kare henüz hazır değil, tekrar dene');
  const cv = document.createElement('canvas');
  cv.width = x.el.videoWidth; cv.height = x.el.videoHeight;
  cv.getContext('2d').drawImage(x.el, 0, 0);
  cv.toBlob(async blob => {
    const f = new File([blob], 'Dondurulmuş kare.png', { type: 'image/png' });
    const m = { id: uid(), name: 'Dondurulmuş kare', kind: 'image', blob: f, url: URL.createObjectURL(f), loading: true };
    state.media.set(m.id, m);
    await analyzeMedia(m); m.loading = false; Store.saveMedia(m);
    History.checkpoint();
    // klibi böl, araya 2 saniyelik dondurulmuş kare ekle, sonrasını kaydır
    const FREEZE = 2;
    for (const o of sel.track.clips) if (o !== c && o.start >= t - 1e-4) o.start += FREEZE;
    let after = null;
    if (t > c.start + 0.03 && t < clipEnd(c) - 0.03) {
      after = JSON.parse(JSON.stringify(c)); after.id = uid();
      const cut = c.in + (t - c.start) * c.speed;
      c.out = cut; after.in = cut; after.start = t + FREEZE; after.transition = null; after.fadeIn = 0;
      sel.track.clips.push(after);
    }
    const img = makeClip('image', { mediaId: m.id, start: t, in: 0, out: FREEZE, filters: { ...c.filters }, x: c.x, y: c.y, scale: c.scale, rotation: c.rotation, fit: c.fit, flipX: c.flipX });
    sel.track.clips.push(img);
    state.selected = img.id;
    refresh(); Panels.renderMedia();
    toast('Kare donduruldu (2 sn)', 'ok');
  });
}

function setAspect(a) {
  History.checkpoint();
  state.project.aspect = a;
  refresh();
}

/* ---- önizleme alanı ---- */
function fitStage() {
  const stage = $('#stage'), cv = Engine.canvas;
  if (!stage || !cv) return;
  const r = stage.getBoundingClientRect();
  const pad = 16;
  const aw = r.width - pad * 2, ah = r.height - pad * 2;
  const s = Math.min(aw / cv.width, ah / cv.height);
  cv.style.width = Math.max(10, Math.floor(cv.width * s)) + 'px';
  cv.style.height = Math.max(10, Math.floor(cv.height * s)) + 'px';
}

function canvasPoint(e) {
  const cv = Engine.canvas, r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height];
}

function initCanvasInteraction() {
  const cv = Engine.canvas;
  cv.addEventListener('pointerdown', e => {
    if (state.playing) Engine.pause();
    const [px, py] = canvasPoint(e);
    if (state.picking) {
      const pk = findClip(state.picking);
      const b = pk && Engine.bounds.get(pk.clip.id);
      state.picking = null;
      cv.classList.remove('picking');
      if (b && b.src) {
        let [lx, ly] = Engine.toLocal(b, px, py);
        if (pk.clip.flipX) lx = -lx;
        History.checkpoint();
        pk.clip.key.color = GLFX.pickColor(b.src, b.sw, b.sh, lx / b.w + 0.5, ly / b.h + 0.5);
        pk.clip.key.on = true;
        afterEdit(); Inspector.render();
        toast('Renk seçildi: ' + pk.clip.key.color, 'ok');
      }
      return;
    }
    let mode = null, c = null;
    const handle = state.selected && Engine.handleAt(px, py);
    if (handle) { mode = handle; c = findClip(state.selected).clip; }
    else {
      c = Engine.hitTest(px, py);
      if (!c) { if (state.selected) { state.selected = null; select(null); } return; }
      if (c.id !== state.selected) select(c.id);
      mode = 'move';
    }
    const b = Engine.bounds.get(c.id);
    const T = state.time;
    const o = { x: prop(c, 'x', T), y: prop(c, 'y', T), scale: prop(c, 'scale', T), rotation: prop(c, 'rotation', T) };
    const d0 = Math.hypot(px - b.cx, py - b.cy) || 1;
    const a0 = Math.atan2(py - b.cy, px - b.cx);
    let moved = false;
    cv.setPointerCapture(e.pointerId);
    const move = ev => {
      const [qx, qy] = canvasPoint(ev);
      if (!moved) { History.checkpoint(); moved = true; }
      if (mode === 'move') {
        let nx = o.x + (qx - px) / Engine.W, ny = o.y + (qy - py) / Engine.H;
        // merkeze yapış
        if (Math.abs(nx) < 0.012) nx = 0;
        if (Math.abs(ny) < 0.012) ny = 0;
        setProp(c, 'x', nx); setProp(c, 'y', ny);
      } else if (mode === 'scale') {
        setProp(c, 'scale', clamp(o.scale * Math.hypot(qx - b.cx, qy - b.cy) / d0, 0.05, 8));
      } else if (mode === 'rotate') {
        let r = o.rotation + (Math.atan2(qy - b.cy, qx - b.cx) - a0) * 180 / Math.PI;
        r = ((r + 540) % 360) - 180;
        for (const sn of [-180, -90, 0, 90, 180]) if (Math.abs(r - sn) < 4) r = sn;
        setProp(c, 'rotation', Math.round(r));
      }
      Engine.dirty = true;
    };
    const up = () => {
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      if (moved) { Inspector.render(); Store.saveProject(); TL.render(); }
    };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
  });
  cv.addEventListener('pointermove', e => {
    if (e.buttons) return;
    const [px, py] = canvasPoint(e);
    const hnd = state.selected && Engine.handleAt(px, py);
    if (state.picking) { cv.style.cursor = 'crosshair'; return; }
    cv.style.cursor = hnd === 'rotate' ? 'grab' : hnd === 'scale' ? 'nwse-resize' : Engine.hitTest(px, py) ? 'move' : 'default';
  });
  cv.addEventListener('dblclick', e => {
    const c = Engine.hitTest(...canvasPoint(e));
    if (c && c.kind === 'text') { select(c.id); Inspector.focusText(); }
  });
  cv.addEventListener('wheel', e => {
    const sel = findClip(state.selected);
    if (!sel || !isVisual(sel.clip.kind)) return;
    e.preventDefault();
    History.checkpoint();
    setProp(sel.clip, 'scale', clamp(prop(sel.clip, 'scale', state.time) * (e.deltaY < 0 ? 1.05 : 1 / 1.05), 0.05, 8));
    Engine.dirty = true;
    renderInspectorLater();
    Store.saveProject();
  }, { passive: false });
}

const renderInspectorLater = debounce(() => Inspector.render(), 200);

/* ---- sağ tık menüsü ---- */
function showContextMenu(x, y, c) {
  hideContextMenu();
  const items = [
    ['split', 'Böl', 'S', splitSelected],
    ['copy', 'Çoğalt', 'Ctrl+D', duplicateSelected],
    c.kind === 'video' ? ['freeze', 'Kareyi dondur', '', freezeFrame] : null,
    c.kind === 'video' ? ['audio', 'Sesi ayır', '', () => detachAudio(c)] : null,
    isVisual(c.kind) && c.kind !== 'text' ? ['transition', 'Geçiş ekle…', '', () => Panels.show('transition')] : null,
    ['trash', 'Boşluk bırakmadan sil', 'Shift+Del', rippleDeleteSelected],
    ['trash', 'Sil', 'Del', deleteSelected],
  ].filter(Boolean);
  const menu = h('div', { class: 'ctx-menu', id: 'ctxMenu' }, items.map(([ic, label, key, fn]) =>
    h('button', { onclick: () => { hideContextMenu(); fn(); } }, h('span', { html: icon(ic, 14) }), h('span', {}, label), h('kbd', {}, key))));
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  setTimeout(() => window.addEventListener('pointerdown', onCtxOutside), 0);
}
function onCtxOutside(e) { if (!e.target.closest('#ctxMenu')) hideContextMenu(); }
function hideContextMenu() {
  const m = $('#ctxMenu'); if (m) m.remove();
  window.removeEventListener('pointerdown', onCtxOutside);
}

/* ---- klavye ---- */
function initKeys() {
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' && !['range', 'checkbox', 'color'].includes(e.target.type) || tag === 'textarea' || tag === 'select') return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const frame = 1 / 30;
    if (k === ' ') { e.preventDefault(); Engine.toggle(); }
    else if (mod && k.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); History.doUndo(); }
    else if (mod && (k.toLowerCase() === 'y' || (k.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); History.doRedo(); }
    else if (mod && k.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); }
    else if (mod && k.toLowerCase() === 'b') { e.preventDefault(); splitSelected(); }
    else if (mod && k.toLowerCase() === 'e') { e.preventDefault(); Exporter.open(); }
    else if (mod && k.toLowerCase() === 's') { e.preventDefault(); saveProjectFile(); }
    else if (mod && k.toLowerCase() === 'o') { e.preventDefault(); $('#openInput').click(); }
    else if (mod && k.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
    else if (!mod && k.toLowerCase() === 's') { e.preventDefault(); splitSelected(); }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); e.shiftKey ? rippleDeleteSelected() : deleteSelected(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); Engine.seek(state.time - (e.shiftKey ? 1 : frame)); }
    else if (k === 'ArrowRight') { e.preventDefault(); Engine.seek(state.time + (e.shiftKey ? 1 : frame)); }
    else if (k === 'Home') { e.preventDefault(); Engine.seek(0); }
    else if (k === 'End') { e.preventDefault(); Engine.seek(projectDuration()); }
    else if (k === 'Escape') { hideContextMenu(); state.picking = null; Engine.canvas.classList.remove('picking'); if (VoiceRec.rec) VoiceRec.stop(); else if (state.selected) select(null); }
    else if (k === '+' || k === '=') TL.setZoom(state.zoom * 1.25);
    else if (k === '-') TL.setZoom(state.zoom / 1.25);
  });
}

function selectAll() {
  const ids = allClips().map(c => c.id);
  if (!ids.length) return;
  state.multi = new Set(ids.slice(0, -1));
  state.selected = ids[ids.length - 1];
  TL.markSelected(); Inspector.render();
}

/* ---- zaman çizelgesi yüksekliği ---- */
function initSplitter() {
  const sp = $('#splitter');
  sp.addEventListener('pointerdown', e => {
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = $('#timeline').getBoundingClientRect().height;
    const move = ev => {
      const nh = clamp(h0 - (ev.clientY - y0), 150, innerHeight - 260);
      document.documentElement.style.setProperty('--tl-h', nh + 'px');
      fitStage();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); TL.render(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

/* ---- dosya sürükle-bırak (masaüstünden) ---- */
function initFileDrop() {
  let depth = 0;
  const ov = $('#dropOverlay');
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; depth++; ov.classList.remove('hidden'); });
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) ov.classList.add('hidden'); });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', async e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0; ov.classList.add('hidden');
    const before = new Set(state.media.keys());
    await importFiles(e.dataTransfer.files);
    // zaman çizelgesi boşsa eklenenleri doğrudan ana ize koy
    if (!allClips().length) {
      for (const id of state.media.keys()) if (!before.has(id)) {
        const m = state.media.get(id);
        if (m.kind !== 'audio') await Library.add({ type: 'media', id });
      }
      TL.fitZoom();
    }
  });
}

function newProject() {
  if (allClips().length && !confirm('Yeni proje başlatılsın mı? Zaman çizelgesi temizlenir (medya kütüphanen korunur). Bunu geri alabilirsin.')) return;
  History.checkpoint();
  const keep = state.project.aspect;
  state.project = defaultProject();
  state.project.aspect = keep;
  state.selected = null;
  Engine.seek(0);
  refresh();
}

/* ---- başlangıç ---- */
async function main() {
  $('#btnUndo').innerHTML = icon('undo');
  $('#btnRedo').innerHTML = icon('redo');
  $('#btnSplit').innerHTML = icon('split');
  $('#btnDelete').innerHTML = icon('trash');
  $('#btnDup').innerHTML = icon('copy');
  $('#btnFreeze').innerHTML = icon('freeze');
  $('#btnSnap').innerHTML = icon('magnet');
  $('#btnZoomOut').innerHTML = icon('zoomOut', 16);
  $('#btnZoomIn').innerHTML = icon('zoomIn', 16);
  $('#btnStart').innerHTML = icon('start');
  $('#btnEnd').innerHTML = icon('end');
  $('#btnPlay').innerHTML = icon('play', 22);
  $('#btnFull').innerHTML = icon('full');
  $('#btnExport').innerHTML = icon('download', 16) + '<span>Dışa aktar</span>';
  $('#btnNew').innerHTML = icon('file', 16) + '<span>Yeni</span>';
  $('#btnOpen').innerHTML = icon('upload', 16) + '<span>Aç</span>';
  $('#btnSave').innerHTML = icon('download', 16) + '<span>Kaydet</span>';
  $('#btnRec').innerHTML = icon('mic');
  $('#btnAddMusic').innerHTML = icon('audio', 14) + '<span>Müzik ekle</span>';
  $('#btnAddText').innerHTML = icon('text', 14) + '<span>Metin ekle</span>';
  $('#btnAddMusic').onclick = () => { Panels.show('audio'); $('#panelBody').scrollTop = 0; };
  $('#btnAddText').onclick = () => { Panels.show('text'); Library.add({ type: 'text', preset: 0 }); };
  $('#btnOpen').onclick = () => $('#openInput').click();
  $('#openInput').addEventListener('change', e => { if (e.target.files[0]) openProjectFile(e.target.files[0]); e.target.value = ''; });
  $('#btnSave').onclick = saveProjectFile;
  $('#btnRec').onclick = () => VoiceRec.toggle();
  $('#recStop').onclick = () => VoiceRec.stop();

  await Store.init();
  Engine.init($('#preview'));
  let lastKfT = -1;
  Engine.onTick = () => {
    TL.updatePlayhead(); updateTransport();
    if (!state.playing && state.time !== lastKfT) {
      lastKfT = state.time;
      const s = findClip(state.selected);
      if (s && hasAnyKf(s.clip)) renderInspectorLater();
    }
  };
  Engine.onPlayState = p => { $('#btnPlay').innerHTML = icon(p ? 'pause' : 'play', 22); $('#btnPlay').classList.toggle('on', p); };
  TL.init();
  Panels.init();
  initCanvasInteraction();
  initKeys();
  initSplitter();
  initFileDrop();

  $('#btnUndo').onclick = () => History.doUndo();
  $('#btnRedo').onclick = () => History.doRedo();
  $('#btnSplit').onclick = splitSelected;
  $('#btnDelete').onclick = deleteSelected;
  $('#btnDup').onclick = duplicateSelected;
  $('#btnFreeze').onclick = freezeFrame;
  $('#btnSnap').onclick = () => { state.snap = !state.snap; $('#btnSnap').classList.toggle('on', state.snap); toast(state.snap ? 'Yapışma açık' : 'Yapışma kapalı'); };
  $('#btnSnap').classList.toggle('on', state.snap);
  $('#btnZoomIn').onclick = () => TL.setZoom(state.zoom * 1.3);
  $('#btnZoomOut').onclick = () => TL.setZoom(state.zoom / 1.3);
  $('#btnFit').onclick = () => TL.fitZoom();
  $('#zoomSlider').addEventListener('input', e => TL.setZoom(Math.exp(parseFloat(e.target.value))));
  $('#zoomSlider').value = Math.log(state.zoom);
  $('#btnPlay').onclick = () => Engine.toggle();
  $('#btnStart').onclick = () => Engine.seek(0);
  $('#btnEnd').onclick = () => Engine.seek(projectDuration());
  $('#btnFull').onclick = () => { const s = $('#stage'); document.fullscreenElement ? document.exitFullscreen() : s.requestFullscreen && s.requestFullscreen(); };
  $('#btnExport').onclick = () => Exporter.open();
  $('#btnNew').onclick = newProject;
  $('#exStart').onclick = () => Exporter.start();
  $('#exCancel').onclick = () => Exporter.close();
  $('#exClose').onclick = () => Exporter.close();
  $('#exAgain').onclick = () => Exporter.open();
  $('#exportModal').addEventListener('pointerdown', e => { if (e.target.id === 'exportModal' && !Exporter.running) Exporter.close(); });
  $('#projName').addEventListener('change', e => { History.checkpoint(); state.project.name = e.target.value || 'Yeni Proje'; refresh(); });
  $('#aspectQuick').addEventListener('change', e => setAspect(e.target.value));
  $('#emptyImport').onclick = () => { Panels.show('media'); $('.import-zone input').click(); };

  new ResizeObserver(fitStage).observe($('#stage'));
  document.addEventListener('fullscreenchange', () => setTimeout(fitStage, 50));
  window.addEventListener('beforeunload', () => { Store.saveProject(); });

  refresh();
  setTimeout(() => { if (allClips().length) TL.fitZoom(); }, 50);
  setTimeout(() => Panels.prewarm(), 2500);
}

window.addEventListener('DOMContentLoaded', main);
