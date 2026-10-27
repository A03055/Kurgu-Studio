'use strict';
/* Akıllı araçlar: seslendirme kaydı, proje dosyası, otomatik slayt, ritim, sessizlik silme */

async function addFileMedia(file, name) {
  const kind = detectKind(file) || 'audio';
  const m = { id: uid(), name: name || file.name, kind, blob: file, url: URL.createObjectURL(file), duration: 0, loading: true };
  state.media.set(m.id, m);
  await analyzeMedia(m);
  m.loading = false;
  Store.saveMedia(m);
  Panels.renderMedia();
  return m;
}

/* ---------- mikrofondan seslendirme ---------- */
const VoiceRec = {
  rec: null, stream: null, chunks: [], t0: 0, wall: 0, timer: null, count: 0,

  async toggle() { this.rec ? this.stop() : this.start(); },

  async start() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Bu cihaz ses kaydını desteklemiyor', 'err');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      return toast('Mikrofona erişilemedi. İzin verdiğinden ve mikrofonun takılı olduğundan emin ol.', 'err');
    }
    Engine.pause();
    Engine.ensureAudio();
    const ov = $('#recOverlay');
    ov.classList.remove('hidden');
    const num = $('#recCount');
    for (let i = 3; i > 0; i--) { num.textContent = i; num.classList.remove('hidden'); await wait(700); }
    num.classList.add('hidden');
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m));
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : {});
    this.chunks = [];
    this.rec.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.t0 = state.time;
    this.rec.start(250);
    this.wall = performance.now();
    // yankı olmasın diye kayıt sırasında hoparlör sesi kapanır, görüntü oynar
    if (Engine.monitor) Engine.monitor.gain.value = 0;
    if (projectDuration() > state.time + 0.1) Engine.play();
    $('#recTime').textContent = '00:00';
    this.timer = setInterval(() => { $('#recTime').textContent = fmtTime((performance.now() - this.wall) / 1000).slice(0, 5); }, 200);
    $('#btnRec') && $('#btnRec').classList.add('on');
  },

  async stop() {
    if (!this.rec) return;
    const rec = this.rec;
    this.rec = null;
    clearInterval(this.timer);
    const done = new Promise(r => { rec.onstop = r; });
    rec.stop();
    await done;
    this.stream.getTracks().forEach(t => t.stop());
    Engine.pause();
    if (Engine.monitor) Engine.monitor.gain.value = 1;
    $('#recOverlay').classList.add('hidden');
    $('#btnRec') && $('#btnRec').classList.remove('on');
    const type = rec.mimeType || 'audio/webm';
    const blob = new Blob(this.chunks, { type });
    if (blob.size < 500) return toast('Kayıt boş görünüyor', 'err');
    this.count++;
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    const name = `Seslendirme ${this.count}`;
    const m = await addFileMedia(new File([blob], `${name}.${ext}`, { type: type.split(';')[0] }), name);
    m.kind = 'audio';
    History.checkpoint();
    const tracks = state.project.tracks.filter(t => t.kind === 'audio');
    const clip = makeClip('audio', { mediaId: m.id, in: 0, out: m.duration, name, enhance: true });
    let tr = tracks.find(t => t.clips.every(o => clipEnd(o) <= this.t0 + 1e-3 || o.start >= this.t0 + m.duration - 1e-3));
    if (!tr) tr = addTrack('audio');
    clip.start = this.t0;
    tr.clips.push(clip);
    state.selected = clip.id;
    refresh();
    Engine.seek(this.t0);
    toast('Seslendirme eklendi (ses netleştirme açık)', 'ok');
  },
};

/* ---------- proje dosyası (.kurgu): proje + kullanılan medya tek dosyada ---------- */
const MAGIC = [0x4b, 0x52, 0x47, 0x55]; // "KRGU"

async function saveProjectFile() {
  const used = new Set(allClips().map(c => c.mediaId).filter(Boolean));
  const list = [...state.media.values()].filter(m => used.has(m.id) && m.blob);
  const meta = {
    format: 'kurgu', v: 1, saved: new Date().toISOString(), project: state.project,
    media: list.map(m => ({ id: m.id, name: m.name, kind: m.kind, type: m.blob.type || '', size: m.blob.size, duration: m.duration, width: m.width, height: m.height, thumb: m.thumb, wave: m.wave, peaks: m.peaks || null, beats: m.beats || null, builtin: m.builtin || null })),
  };
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const head = new Uint8Array(12);
  head.set(MAGIC, 0);
  const dv = new DataView(head.buffer);
  dv.setUint32(4, 1, true);
  dv.setUint32(8, json.length, true);
  const blob = new Blob([head, json, ...list.map(m => m.blob)], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.project.name || 'proje').replace(/[\\/:*?"<>|]+/g, '_') + '.kurgu';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  toast(`Proje kaydedildi (${(blob.size / 1048576).toFixed(1)} MB)`, 'ok');
}

async function openProjectFile(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (!MAGIC.every((b, i) => head[i] === b)) throw new Error('Kurgu proje dosyası değil');
    const len = new DataView(head.buffer).getUint32(8, true);
    const meta = JSON.parse(new TextDecoder().decode(await file.slice(12, 12 + len).arrayBuffer()));
    if (allClips().length && !confirm('Proje açılsın mı? Şu anki zaman çizelgesi değişecek (geri alabilirsin).')) return;
    let off = 12 + len;
    for (const r of meta.media) {
      const blob = file.slice(off, off + r.size, r.type);
      off += r.size;
      if (state.media.has(r.id)) continue;
      const rec = Object.assign({}, r, { blob: new File([blob], r.name, { type: r.type }) });
      delete rec.size; delete rec.type;
      const m = hydrateMedia(rec);
      Store.saveMedia(m);
    }
    History.checkpoint();
    state.project = migrateProject(meta.project);
    state.selected = null;
    state.multi.clear();
    Engine.seek(0);
    refresh();
    Panels.renderMedia();
    setTimeout(() => TL.fitZoom(), 50);
    toast('Proje açıldı: ' + state.project.name, 'ok');
  } catch (e) {
    console.warn(e);
    toast('Proje açılamadı: ' + e.message, 'err');
  }
}

/* ---------- otomatik slayt videosu ---------- */
async function autoSlideshow() {
  const items = [...state.media.values()].filter(m => !m.builtin && !m.loading && (m.kind === 'image' || m.kind === 'video'));
  if (!items.length) return toast('Önce fotoğraf ya da video içe aktar');
  const music = await Panels.soundBlob(MUSIC.find(x => x.id === 'happy'), 'music');
  History.checkpoint();
  const track = getTrackFor('video');
  const start = trackEnd(track);
  let t = start;
  const trans = ['fade', 'slideLeft', 'crossZoom', 'circle', 'swipeBlur', 'zoomIn', 'heart', 'wipeRight', 'clock', 'door'];
  items.forEach((m, i) => {
    const dur = m.kind === 'image' ? 3 : Math.min(m.duration, 5);
    const c = makeClip(m.kind, { mediaId: m.id, start: t, in: 0, out: dur, name: m.name, fit: 'cover', loop: m.kind === 'image' ? (i % 2 ? 'kenOut' : 'kenIn') : 'none' });
    if (i > 0) c.transition = { type: trans[(i - 1) % trans.length], dur: 0.7 };
    else c.fadeIn = 0.6;
    if (i === items.length - 1) c.fadeOut = 0.8;
    track.clips.push(c);
    t += dur;
  });
  const title = makeClip('text', { start, out: 2.8, anim: 'blur', animOut: 'fade', loop: 'kenIn', y: 0 });
  Object.assign(title.text, { content: state.project.name && state.project.name !== 'Yeni Proje' ? state.project.name : 'Anılarım', font: 'Brush', size: 170, bold: false, shadow: 18, shadowColor: '#000000' });
  const ttr = getTrackFor('text');
  ttr.clips.push(title);
  title.start = findFreeStart(ttr, title, start);
  const atracks = state.project.tracks.filter(x => x.kind === 'audio');
  const mtr = atracks[atracks.length - 1] || addTrack('audio');
  const mc = makeClip('audio', { mediaId: music.id, start, in: 0, out: Math.min(music.duration, t - start), name: music.name, volume: 0.7, fadeOut: 2, duck: true });
  mtr.clips.push(mc);
  mc.start = findFreeStart(mtr, mc, start);
  state.selected = null;
  refresh();
  Engine.seek(start);
  TL.fitZoom();
  toast(`Slayt videosu hazır: ${items.length} öğe, müzik ve geçişlerle`, 'ok');
}

/* ---------- ritim ---------- */
async function analyzeBeats(c) {
  const m = state.media.get(c.mediaId);
  if (!m) return;
  toast('Ritim analiz ediliyor…');
  try {
    const peaks = await ensurePeaks(m);
    m.beats = detectBeats(peaks);
    Store.saveMedia(m);
  } catch (e) { return toast('Ses çözülemedi', 'err'); }
  TL.render(); Inspector.render();
  toast(`${m.beats.length} ritim noktası bulundu`, 'ok');
}

function beatTimes(c) {
  const m = state.media.get(c.mediaId);
  if (!m || !m.beats) return [];
  return m.beats.filter(b => b >= c.in && b <= c.out).map(b => c.start + (b - c.in) / c.speed);
}

function cutMainToBeats(c, every = 1) {
  const times = beatTimes(c).filter((_, i) => i % every === 0);
  if (!times.length) return toast('Önce "Ritim noktalarını bul"a tıkla');
  const track = getTrackFor('video');
  History.checkpoint();
  let n = 0;
  for (const t of times) {
    for (const clip of [...track.clips]) if (splitClip(clip, track, t)) n++;
  }
  refresh();
  toast(n ? `Ana iz ${n} yerden ritme göre kesildi` : 'Ritim noktalarında kesilecek klip yok', n ? 'ok' : '');
}

function fitClipsToBeats(c, every = 2) {
  const marks = beatTimes(c).filter((_, i) => i % every === 0);
  if (marks.length < 2) return toast('Yeterli ritim noktası yok. Önce "Ritim noktalarını bul"a tıkla.');
  const track = getTrackFor('video');
  const clips = [...track.clips].sort((a, b) => a.start - b.start);
  if (!clips.length) return toast('Ana izde klip yok');
  History.checkpoint();
  let cur = marks[0];
  for (const clip of clips) {
    const next = marks.find(m => m > cur + 0.25);
    clip.start = cur;
    if (next !== undefined) {
      const dur = next - cur;
      if (isMediaKind(clip.kind)) {
        const m = state.media.get(clip.mediaId);
        clip.out = Math.min(m ? m.duration : Infinity, clip.in + dur * clip.speed);
      } else { clip.in = 0; clip.out = dur; }
    }
    cur = clipEnd(clip);
  }
  refresh();
  toast('Klipler ritme göre dizildi', 'ok');
}

/* ---------- sessiz yerleri sil ---------- */
async function removeSilence(c) {
  const sel = findClip(c.id);
  const m = state.media.get(c.mediaId);
  if (!sel || !m) return;
  toast('Sessiz bölümler aranıyor…');
  let peaks;
  try { peaks = await ensurePeaks(m); } catch (e) { return toast('Bu klipte ses bulunamadı', 'err'); }
  const keep = findSoundRanges(peaks, c.in, c.out);
  if (!keep.length) return toast('Klipte ses bulunamadı');
  const keptDur = keep.reduce((s, [a, b]) => s + (b - a), 0) / c.speed;
  const removed = clipDur(c) - keptDur;
  if (removed < 0.2) return toast('Silinecek sessiz bölüm bulunamadı');
  History.checkpoint();
  const track = sel.track;
  const oldEnd = clipEnd(c);
  let t = c.start;
  const parts = keep.map(([a, b], i) => {
    const p = JSON.parse(JSON.stringify(c));
    p.id = i === 0 ? c.id : uid();
    p.in = a; p.out = b; p.start = t; p.kf = {};
    if (i > 0) { p.transition = null; p.fadeIn = 0; p.anim = 'none'; }
    if (i < keep.length - 1) { p.fadeOut = 0; p.animOut = 'none'; }
    t += (b - a) / c.speed;
    return p;
  });
  track.clips = track.clips.filter(x => x !== c);
  for (const o of track.clips) if (o.start >= oldEnd - 1e-3) o.start -= removed;
  track.clips.push(...parts);
  refresh();
  toast(`${removed.toFixed(1)} sn sessizlik silindi (${keep.length} parça)`, 'ok');
}
