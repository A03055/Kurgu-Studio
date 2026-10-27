'use strict';
/* Proje modeli, geri al / yinele ve otomatik kayıt */

const ASPECTS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5], '4:3': [4, 3], '21:9': [21, 9] };
const DEFAULT_FILTERS = { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, invert: 0 };
const DEFAULT_TEXT = {
  content: 'Metin', font: 'Inter', size: 80, color: '#ffffff', bold: true, italic: false, align: 'center',
  bgOn: false, bg: '#000000', bgOpacity: 0.6, strokeW: 0, stroke: '#000000', shadow: 0, shadowColor: '#000000',
  letter: 0, typewriter: false,
};
const TRACK_NAMES = { fx: 'Efekt', text: 'Metin', video: 'Video', audio: 'Ses' };
const MIN_DUR = 0.1;

function newTrack(kind, name, extra = {}) {
  return Object.assign({ id: uid(), kind, name: name || TRACK_NAMES[kind], muted: false, hidden: false, clips: [] }, extra);
}

function defaultProject() {
  return {
    v: 1,
    name: 'Yeni Proje',
    aspect: '16:9',
    res: 1080,
    bg: '#000000',
    tracks: [
      newTrack('fx', 'Efekt'),
      newTrack('text', 'Metin'),
      newTrack('video', 'Katman'),
      newTrack('video', 'Ana video', { main: true }),
      newTrack('audio', 'Ses'),
      newTrack('audio', 'Müzik'),
    ],
  };
}

const state = {
  project: defaultProject(),
  media: new Map(),
  time: 0,
  playing: false,
  selected: null,
  zoom: 60,
  snap: true,
  exporting: false,
};

function makeClip(kind, props = {}) {
  const c = {
    id: uid(), kind, mediaId: null, name: '', start: 0, in: 0, out: 5, speed: 1, volume: 1,
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, fit: 'contain', flipX: false,
    filters: { ...DEFAULT_FILTERS }, fadeIn: 0, fadeOut: 0, anim: 'none', animOut: 'none', loop: 'none', animDur: 0.5,
    transition: null,
  };
  if (kind === 'text') c.text = { ...DEFAULT_TEXT };
  if (kind === 'fx') c.fx = { type: 'vignette', intensity: 0.7 };
  return Object.assign(c, props);
}

const isMediaKind = k => k === 'video' || k === 'audio';
const isVisual = k => k === 'video' || k === 'image' || k === 'text';
function clipDur(c) { return (c.out - c.in) / (isMediaKind(c.kind) ? (c.speed || 1) : 1); }
function clipEnd(c) { return c.start + clipDur(c); }
function allClips() { return state.project.tracks.flatMap(t => t.clips); }
function findClip(id) {
  if (!id) return null;
  for (const track of state.project.tracks) {
    const clip = track.clips.find(c => c.id === id);
    if (clip) return { clip, track };
  }
  return null;
}
function findTrack(id) { return state.project.tracks.find(t => t.id === id); }
function projectDuration() {
  let d = 0;
  for (const c of allClips()) d = Math.max(d, clipEnd(c));
  return d;
}
function acceptsKind(track, kind) {
  if (track.kind === 'video') return kind === 'video' || kind === 'image';
  return track.kind === kind;
}
function trackKindFor(kind) { return kind === 'image' ? 'video' : kind; }

/* Klibe en yakın boş yeri bulur (çakışma olmasın) */
function findFreeStart(track, clip, desired) {
  const d = clipDur(clip);
  const others = track.clips.filter(c => c !== clip && c.id !== clip.id);
  const free = s => s >= -1e-6 && others.every(o => s + d <= o.start + 1e-4 || s >= clipEnd(o) - 1e-4);
  if (free(desired)) return Math.max(0, desired);
  const cands = [];
  for (const o of others) { cands.push(clipEnd(o), o.start - d); }
  let best = null;
  for (const s of cands) {
    if (!free(s)) continue;
    if (best === null || Math.abs(s - desired) < Math.abs(best - desired)) best = s;
  }
  if (best === null) best = Math.max(0, ...others.map(clipEnd));
  return Math.max(0, best);
}

function trackEnd(track) { return track.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0); }

function getTrackFor(kind, preferMain = true) {
  const tk = trackKindFor(kind);
  const tracks = state.project.tracks.filter(t => t.kind === tk);
  if (tk === 'video' && preferMain) return tracks.find(t => t.main) || tracks[tracks.length - 1];
  if (tracks.length) return tracks[0];
  return addTrack(tk);
}

function addTrack(kind) {
  const t = newTrack(kind);
  const tracks = state.project.tracks;
  const order = { fx: 0, text: 1, video: 2, audio: 3 };
  let idx = tracks.findIndex(x => order[x.kind] >= order[kind]);
  if (kind === 'audio') idx = tracks.length;
  if (idx < 0) idx = tracks.length;
  const n = tracks.filter(x => x.kind === kind).length;
  if (n) t.name = `${TRACK_NAMES[kind]} ${n + 1}`;
  tracks.splice(idx, 0, t);
  return t;
}

/* Bitişik önceki klip (geçişler için) */
function prevAdjacent(track, clip) {
  let best = null;
  for (const c of track.clips) {
    if (c === clip) continue;
    if (Math.abs(clipEnd(c) - clip.start) < 0.05) best = c;
  }
  return best;
}

const History = {
  undo: [], redo: [],
  checkpoint() {
    const s = JSON.stringify(state.project);
    if (this.undo[this.undo.length - 1] === s) return;
    this.undo.push(s);
    if (this.undo.length > 150) this.undo.shift();
    this.redo.length = 0;
  },
  doUndo() {
    const cur = JSON.stringify(state.project);
    let s;
    do { s = this.undo.pop(); } while (s !== undefined && s === cur);
    if (s === undefined) return toast('Geri alınacak bir şey yok');
    this.redo.push(cur);
    state.project = JSON.parse(s);
    refresh();
  },
  doRedo() {
    const s = this.redo.pop();
    if (!s) return toast('Yinelenecek bir şey yok');
    this.undo.push(JSON.stringify(state.project));
    state.project = JSON.parse(s);
    refresh();
  },
};

const Store = {
  ok: false,
  async init() {
    try {
      await DB.open();
      this.ok = true;
      const recs = (await DB.getAll('media')) || [];
      for (const r of recs) hydrateMedia(r);
      const p = await DB.get('kv', 'project');
      if (p && p.tracks) state.project = migrateProject(p);
    } catch (e) {
      console.warn('Kayıt alanı kullanılamıyor', e);
    }
  },
  saveProject: debounce(() => {
    if (!Store.ok) return;
    DB.put('kv', JSON.parse(JSON.stringify(state.project)), 'project').catch(e => console.warn(e));
  }, 500),
  saveMedia(m) {
    if (!this.ok) return;
    const rec = { id: m.id, name: m.name, kind: m.kind, blob: m.blob, duration: m.duration, width: m.width, height: m.height, thumb: m.thumb, wave: m.wave, builtin: m.builtin || null };
    DB.put('media', rec).catch(e => { console.warn(e); toast('Dosya kaydedilemedi (disk dolu olabilir)', 'err'); });
  },
  deleteMedia(id) { if (this.ok) DB.del('media', id).catch(() => {}); },
};

function migrateProject(p) {
  for (const t of p.tracks) {
    for (const c of t.clips) {
      c.filters = Object.assign({ ...DEFAULT_FILTERS }, c.filters || {});
      if (c.kind === 'text') c.text = Object.assign({ ...DEFAULT_TEXT }, c.text || {});
    }
  }
  return p;
}
