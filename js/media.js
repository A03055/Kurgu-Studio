'use strict';
/* Medya içe aktarma: süre, küçük resim ve ses dalgası çıkarma */

const EXT_KIND = {
  video: ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogv', 'avi', '3gp'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'weba'],
};

function detectKind(file) {
  const t = file.type || '';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  for (const [k, list] of Object.entries(EXT_KIND)) if (list.includes(ext)) return k;
  return null;
}

async function importFiles(files) {
  const list = [...files];
  let added = 0;
  for (const f of list) {
    const kind = detectKind(f);
    if (!kind) { toast(`Desteklenmeyen dosya: ${f.name}`, 'err'); continue; }
    const m = { id: uid(), name: f.name, kind, blob: f, url: URL.createObjectURL(f), loading: true, duration: 0 };
    state.media.set(m.id, m);
    Panels.renderMedia();
    try {
      await analyzeMedia(m);
      m.loading = false;
      Store.saveMedia(m);
      added++;
    } catch (e) {
      console.warn(e);
      state.media.delete(m.id);
      URL.revokeObjectURL(m.url);
      toast(`Açılamadı: ${f.name}`, 'err');
    }
    Panels.renderMedia();
  }
  if (added) toast(`${added} dosya eklendi`, 'ok');
  return added;
}

/* Kodla üretilen bir sesi (müzik / efekt) kütüphaneye ekler */
async function addGeneratedMedia(blob, name, kind, builtin) {
  const existing = [...state.media.values()].find(m => m.builtin === builtin);
  if (existing) return existing;
  const m = { id: uid(), name, kind, blob, url: URL.createObjectURL(blob), duration: 0, builtin, loading: true };
  state.media.set(m.id, m);
  await analyzeMedia(m);
  m.loading = false;
  Store.saveMedia(m);
  Panels.renderMedia();
  return m;
}

function hydrateMedia(rec) {
  const m = Object.assign({}, rec, { url: URL.createObjectURL(rec.blob) });
  if (m.kind === 'image') {
    m.img = new Image();
    m.img.onload = () => { Engine.dirty = true; };
    m.img.src = m.url;
  }
  state.media.set(m.id, m);
  return m;
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('resim yüklenemedi'));
    img.src = url;
  });
}

function onceEvent(el, ev, timeout = 15000) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('zaman aşımı: ' + ev)), timeout);
    el.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true });
    el.addEventListener('error', () => { clearTimeout(t); rej(new Error('medya hatası')); }, { once: true });
  });
}

async function fixInfiniteDuration(el) {
  // MediaRecorder çıktısı webm dosyalarında süre "Infinity" gelir; sona atlayarak düzeltilir
  if (Number.isFinite(el.duration)) return;
  el.currentTime = 1e7;
  await new Promise(r => {
    const done = () => { if (Number.isFinite(el.duration)) { el.removeEventListener('durationchange', done); r(); } };
    el.addEventListener('durationchange', done);
    setTimeout(r, 4000);
  });
  el.currentTime = 0;
}

function makeThumb(src, sw, sh, H = 90) {
  const c = document.createElement('canvas');
  c.height = H; c.width = Math.max(1, Math.round(H * sw / sh));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}

async function analyzeMedia(m) {
  if (m.kind === 'image') {
    const img = await loadImage(m.url);
    m.img = img;
    m.width = img.naturalWidth || 1280; m.height = img.naturalHeight || 720;
    m.duration = 5;
    m.thumb = makeThumb(img, m.width, m.height);
    return;
  }
  const el = document.createElement(m.kind === 'video' ? 'video' : 'audio');
  el.preload = 'auto'; el.muted = true; el.src = m.url;
  if (m.kind === 'video') el.playsInline = true;
  await onceEvent(el, 'loadedmetadata');
  await fixInfiniteDuration(el);
  m.duration = Number.isFinite(el.duration) ? el.duration : 10;
  if (m.kind === 'video') {
    m.width = el.videoWidth; m.height = el.videoHeight;
    if (!m.width) { m.kind = 'audio'; } // görüntüsü olmayan video → ses
    else {
      el.currentTime = Math.min(1, m.duration / 3);
      try { await onceEvent(el, 'seeked', 8000); } catch (e) { /* küçük resimsiz devam */ }
      try { m.thumb = makeThumb(el, m.width, m.height); } catch (e) { m.thumb = null; }
    }
  }
  el.removeAttribute('src'); el.load();
  if (m.blob.size < 250 * 1024 * 1024) {
    try { m.wave = await makeWaveform(m.blob); } catch (e) { m.wave = null; }
  }
}

async function makeWaveform(blob) {
  const buf = await blob.arrayBuffer();
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ac = new AC(1, 2, 44100);
  const audio = await new Promise((res, rej) => {
    const p = ac.decodeAudioData(buf, res, rej);
    if (p && p.then) p.then(res, rej);
  });
  const data = audio.getChannelData(0);
  const N = 1200, step = Math.max(1, Math.floor(data.length / N));
  const peaks = new Float32Array(N);
  let max = 0.0001;
  for (let i = 0; i < N; i++) {
    let p = 0;
    const s = i * step, e = Math.min(data.length, s + step);
    for (let j = s; j < e; j += 4) { const v = Math.abs(data[j]); if (v > p) p = v; }
    peaks[i] = p; if (p > max) max = p;
  }
  const c = document.createElement('canvas');
  c.width = N; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < N; i++) {
    const hgt = Math.max(1, (peaks[i] / max) * 30);
    ctx.fillRect(i, 32 - hgt, 1, hgt * 2);
  }
  return c.toDataURL('image/png');
}

/* Düz renk / gradyan arka plan resmi üretir */
function makeColorImage(fill, name) {
  const c = document.createElement('canvas');
  c.width = 1920; c.height = 1080;
  const ctx = c.getContext('2d');
  if (Array.isArray(fill)) {
    const g = ctx.createLinearGradient(0, 0, 1920, 1080);
    fill.forEach((col, i) => g.addColorStop(i / (fill.length - 1), col));
    ctx.fillStyle = g;
  } else ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 1920, 1080);
  return new Promise(r => c.toBlob(b => r(new File([b], name + '.png', { type: 'image/png' })), 'image/png'));
}

function removeMedia(id) {
  const m = state.media.get(id);
  if (!m) return;
  const used = allClips().filter(c => c.mediaId === id);
  if (used.length && !confirm(`"${m.name}" zaman çizelgesinde ${used.length} yerde kullanılıyor. Hepsi silinsin mi?`)) return;
  if (used.length) {
    History.checkpoint();
    for (const t of state.project.tracks) t.clips = t.clips.filter(c => c.mediaId !== id);
  }
  state.media.delete(id);
  Store.deleteMedia(id);
  refresh();
  Panels.renderMedia();
}
