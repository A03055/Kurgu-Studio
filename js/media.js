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
    if (/\.kurgu$/i.test(f.name)) { await openProjectFile(f); continue; }
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
    try { const r = await makeWaveform(m.blob); m.wave = r.wave; m.peaks = r.peaks; } catch (e) { m.wave = null; }
  }
}

async function decodeAudio(blob) {
  const buf = await blob.arrayBuffer();
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ac = new AC(1, 2, 44100);
  return new Promise((res, rej) => {
    const p = ac.decodeAudioData(buf, res, rej);
    if (p && p.then) p.then(res, rej);
  });
}

const PEAK_RATE = 50; // saniyede 50 ölçüm

/* Ses seviyesi (RMS) dizisi: ritim bulma ve sessizlik silme için */
function computePeaks(audio) {
  const ch = [];
  for (let c = 0; c < Math.min(2, audio.numberOfChannels); c++) ch.push(audio.getChannelData(c));
  const step = Math.max(1, Math.floor(audio.sampleRate / PEAK_RATE));
  const n = Math.floor(ch[0].length / step);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i * step; j < (i + 1) * step; j += 2) {
      let v = 0; for (const d of ch) v += d[j];
      v /= ch.length; sum += v * v; cnt++;
    }
    out[i] = Math.round(Math.sqrt(sum / Math.max(1, cnt)) * 10000) / 10000;
  }
  return out;
}

function waveImage(audio) {
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
  if (max < 0.003) return null; // sessiz kayıt
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

async function makeWaveform(blob) {
  const audio = await decodeAudio(blob);
  return { wave: waveImage(audio), peaks: computePeaks(audio) };
}

async function ensurePeaks(m) {
  if (m.peaks) return m.peaks;
  const r = await makeWaveform(m.blob);
  m.peaks = r.peaks;
  if (!m.wave) m.wave = r.wave;
  Store.saveMedia(m);
  return m.peaks;
}

/* Ritim (vuruş) noktalarını bulur: ses enerjisindeki ani artışlar */
function detectBeats(peaks) {
  const n = peaks.length, R = PEAK_RATE;
  if (n < R) return [];
  const on = new Float32Array(n);
  let maxOn = 0;
  for (let i = 1; i < n; i++) { on[i] = Math.max(0, peaks[i] - peaks[i - 1]); if (on[i] > maxOn) maxOn = on[i]; }
  const pre = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + on[i];
  const beats = [];
  let last = -1e9;
  const half = Math.floor(R * 0.6);
  for (let i = 1; i < n - 1; i++) {
    const a = Math.max(0, i - half), b = Math.min(n, i + half);
    const avg = (pre[b] - pre[a]) / (b - a);
    if (on[i] > avg * 2 && on[i] > maxOn * 0.12 && on[i] >= on[i - 1] && on[i] >= on[i + 1] && i - last > R * 0.3) {
      beats.push(Math.round(i / R * 1000) / 1000);
      last = i;
    }
  }
  return beats;
}

/* Kaynak süre aralığında konuşma/ses olan bölümleri döndürür (sessizlikler hariç) */
function findSoundRanges(peaks, from, to, minSilence = 0.6, pad = 0.15) {
  const R = PEAK_RATE;
  const a = Math.max(0, Math.floor(from * R)), b = Math.min(peaks.length, Math.ceil(to * R));
  const seg = peaks.slice(a, b);
  if (!seg.length) return [[from, to]];
  const sorted = [...seg].sort((x, y) => x - y);
  const loud = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const thr = Math.max(0.006, loud * 0.12);
  const ranges = [];
  let start = null, quiet = 0;
  for (let i = a; i < b; i++) {
    if (peaks[i] >= thr) {
      if (start === null) start = i;
      quiet = 0;
    } else if (start !== null) {
      quiet++;
      if (quiet >= minSilence * R) { ranges.push([start, i - quiet + 1]); start = null; quiet = 0; }
    }
  }
  if (start !== null) ranges.push([start, b]);
  const out = [];
  for (const [s, e] of ranges) {
    const s2 = Math.max(from, s / R - pad), e2 = Math.min(to, e / R + pad);
    if (out.length && s2 <= out[out.length - 1][1]) out[out.length - 1][1] = e2;
    else if (e2 - s2 > 0.08) out.push([s2, e2]);
  }
  return out;
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
