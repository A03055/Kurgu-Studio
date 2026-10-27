'use strict';
/* Sol panel: medya, ses, metin, çıkartma, efekt, geçiş ve filtre kütüphaneleri */

const Panels = {
  tab: 'media',
  previewAudio: null,

  init() {
    const rail = $('#rail');
    const tabs = [['media', 'media', 'Medya'], ['audio', 'audio', 'Ses'], ['text', 'text', 'Metin'], ['sticker', 'sticker', 'Çıkartma'],
      ['fx', 'fx', 'Efekt'], ['transition', 'transition', 'Geçiş'], ['filter', 'filter', 'Filtre']];
    for (const [id, ic, name] of tabs) {
      rail.appendChild(h('button', { class: 'rail-btn', 'data-tab': id, onclick: () => this.show(id) },
        h('span', { html: icon(ic, 20) }), h('span', {}, name)));
    }
    this.show('media');
  },

  show(tab) {
    this.tab = tab;
    $$('.rail-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const body = $('#panelBody');
    body.innerHTML = '';
    this['render_' + tab](body);
  },

  draggable(el, data) {
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/x-kurgu', JSON.stringify(data));
    });
    return el;
  },

  renderMedia() { if (this.tab === 'media') this.show('media'); },

  render_media(b) {
    const input = h('input', { type: 'file', multiple: true, accept: 'video/*,image/*,audio/*', hidden: true });
    input.addEventListener('change', () => { importFiles(input.files); input.value = ''; });
    b.appendChild(h('div', { class: 'panel-title' }, 'Medya'));
    b.appendChild(h('button', { class: 'import-zone', onclick: () => input.click() },
      h('span', { class: 'iz-ic', html: icon('upload', 26) }),
      h('b', {}, 'İçe aktar'),
      h('span', {}, 'Video, fotoğraf veya ses dosyası seç ya da buraya sürükle'), input));
    const items = [...state.media.values()].filter(m => !m.builtin || m.kind !== 'audio');
    if (!items.length) b.appendChild(h('p', { class: 'hint center' }, 'Henüz medya yok.'));
    const grid = h('div', { class: 'media-grid' });
    for (const m of items) grid.appendChild(this.mediaCard(m));
    b.appendChild(grid);

    b.appendChild(h('div', { class: 'panel-title' }, 'Hazır arka planlar'));
    const bgs = [
      ['Siyah', '#000000'], ['Beyaz', '#ffffff'], ['Gece', ['#0f2027', '#203a43', '#2c5364']], ['Gün batımı', ['#ff512f', '#f09819', '#ffd200']],
      ['Okyanus', ['#2193b0', '#6dd5ed']], ['Pembe', ['#ee9ca7', '#ffdde1']], ['Mor', ['#41295a', '#2f0743', '#8e2de2']], ['Neon', ['#00f260', '#0575e6']],
      ['Şeftali', ['#ffecd2', '#fcb69f']], ['Ateş', ['#f12711', '#f5af19']], ['Orman', ['#134e5e', '#71b280']], ['Pastel', ['#a1c4fd', '#c2e9fb', '#fbc2eb']],
    ];
    b.appendChild(h('div', { class: 'bg-grid' }, bgs.map(([name, fill]) => h('button', {
      class: 'bg-tile', title: name + ' — ana ize ekle',
      style: { background: Array.isArray(fill) ? `linear-gradient(135deg, ${fill.join(',')})` : fill },
      onclick: async () => {
        const f = await makeColorImage(fill, name);
        const m = { id: uid(), name: name + ' arka plan', kind: 'image', blob: f, url: URL.createObjectURL(f), builtin: 'bg-' + name, loading: true };
        state.media.set(m.id, m);
        await analyzeMedia(m); m.loading = false; Store.saveMedia(m);
        Library.add({ type: 'media', id: m.id });
        this.renderMedia();
      },
    }, h('span', {}, name)))));
  },

  mediaCard(m) {
    const kindIcon = { video: 'media', image: 'palette', audio: 'audio' }[m.kind];
    const card = h('div', { class: 'media-card' + (m.loading ? ' loading' : ''), title: m.name },
      h('div', { class: 'mc-thumb', style: m.thumb ? { backgroundImage: `url(${m.thumb})` } : (m.wave ? { backgroundImage: `url(${m.wave})`, backgroundSize: '100% 60%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : {}) },
        !m.thumb ? h('span', { class: 'mc-ic', html: icon(kindIcon, 22) }) : null,
        m.kind !== 'image' && m.duration ? h('span', { class: 'mc-dur' }, fmtShort(m.duration)) : null,
        m.loading ? h('span', { class: 'spinner' }) : null,
        h('button', { class: 'mc-add', title: 'Zaman çizelgesine ekle', html: icon('plus', 16), onclick: e => { e.stopPropagation(); Library.add({ type: 'media', id: m.id }); } }),
        h('button', { class: 'mc-del', title: 'Kütüphaneden sil', html: icon('x', 12), onclick: e => { e.stopPropagation(); removeMedia(m.id); } })),
      h('div', { class: 'mc-name' }, m.name));
    card.addEventListener('dblclick', () => Library.add({ type: 'media', id: m.id }));
    return this.draggable(card, { type: 'media', id: m.id });
  },

  render_audio(b) {
    b.appendChild(h('div', { class: 'panel-title' }, 'Müzik ', h('small', {}, 'ücretsiz · telifsiz')));
    for (const s of MUSIC) b.appendChild(this.soundRow(s, 'music'));
    b.appendChild(h('div', { class: 'panel-title' }, 'Ses efektleri'));
    const grid = h('div', { class: 'sfx-grid' });
    for (const s of SFX) grid.appendChild(this.soundRow(s, 'sfx'));
    b.appendChild(grid);
    const own = [...state.media.values()].filter(m => m.kind === 'audio' && !m.builtin);
    if (own.length) {
      b.appendChild(h('div', { class: 'panel-title' }, 'Senin seslerin'));
      const g = h('div', { class: 'media-grid' });
      own.forEach(m => g.appendChild(this.mediaCard(m)));
      b.appendChild(g);
    }
    b.appendChild(h('p', { class: 'hint' }, 'Tüm müzikler ve efektler bu programın içinde üretilir; YouTube, TikTok ve Instagram\'da gönül rahatlığıyla kullanabilirsin.'));
  },

  async soundBlob(s, kind) {
    const key = `${kind}-${s.id}`;
    const existing = [...state.media.values()].find(m => m.builtin === key);
    if (existing) return existing;
    toast(`"${s.name}" hazırlanıyor…`);
    const blob = await s.make();
    return addGeneratedMedia(blob, s.name, 'audio', key);
  },

  soundRow(s, kind) {
    const play = h('button', { class: 'snd-play', html: icon('play', 14), title: 'Dinle' });
    play.addEventListener('click', async e => {
      e.stopPropagation();
      if (this.previewAudio && !this.previewAudio.paused) {
        const same = this.previewAudio.dataset.id === s.id;
        this.previewAudio.pause();
        $$('.snd-play.on').forEach(x => { x.classList.remove('on'); x.innerHTML = icon('play', 14); });
        if (same) return;
      }
      play.classList.add('busy');
      const m = await this.soundBlob(s, kind);
      play.classList.remove('busy');
      const a = this.previewAudio = new Audio(m.url);
      a.dataset.id = s.id;
      a.play();
      play.classList.add('on'); play.innerHTML = icon('pause', 14);
      a.onended = () => { play.classList.remove('on'); play.innerHTML = icon('play', 14); };
    });
    const row = h('div', { class: 'snd-row ' + kind },
      play,
      h('div', { class: 'snd-info' }, h('b', {}, s.name), s.desc ? h('span', {}, s.desc) : null),
      h('button', { class: 'snd-add', html: icon('plus', 16), title: 'Ekle', onclick: e => { e.stopPropagation(); Library.add({ type: 'sound', id: s.id, kind }); } }));
    return this.draggable(row, { type: 'sound', id: s.id, kind });
  },

  render_text(b) {
    b.appendChild(h('div', { class: 'panel-title' }, 'Metin şablonları'));
    b.appendChild(h('div', { class: 'text-grid' }, TEXT_PRESETS.map((p, i) =>
      this.draggable(h('button', { class: 'text-tile', onclick: () => Library.add({ type: 'text', preset: i }) },
        h('span', { style: p.css }, p.name)), { type: 'text', preset: i }))));
    b.appendChild(h('p', { class: 'hint' }, 'Eklediğin metne çift tıklayarak yazıyı değiştirebilirsin. Yazı tipi, renk, kontur, gölge ve animasyonları sağ panelden ayarla.'));
  },

  render_sticker(b) {
    for (const [cat, list] of Object.entries(STICKERS)) {
      b.appendChild(h('div', { class: 'panel-title' }, cat));
      b.appendChild(h('div', { class: 'sticker-grid' }, list.map(em =>
        this.draggable(h('button', { class: 'stk', onclick: () => Library.add({ type: 'sticker', emoji: em }) }, em), { type: 'sticker', emoji: em }))));
    }
  },

  render_fx(b) {
    b.appendChild(h('p', { class: 'hint' }, 'Tıkla: oynatma çizgisine 3 saniyelik efekt ekler. Ya da efekt izine sürükle.'));
    const cats = [...new Set(EFFECTS.map(e => e.cat))];
    for (const cat of cats) {
      b.appendChild(h('div', { class: 'panel-title' }, cat));
      b.appendChild(h('div', { class: 'fx-grid' }, EFFECTS.filter(e => e.cat === cat).map(e => fxTile(e, false, () => Library.add({ type: 'fx', id: e.id })))));
    }
  },

  render_transition(b) {
    const sel = findClip(state.selected);
    const ok = sel && (sel.clip.kind === 'video' || sel.clip.kind === 'image' || sel.clip.kind === 'text');
    b.appendChild(h('p', { class: 'hint' }, ok
      ? 'Seçili klibin başına uygulamak için bir geçişe tıkla.'
      : 'Bir klibi seçip geçişe tıkla ya da geçişi zaman çizelgesindeki klibin üzerine sürükle.'));
    const cur = ok && sel.clip.transition && sel.clip.transition.type;
    b.appendChild(h('div', { class: 'trans-grid' }, TRANSITIONS.map(tr => transitionTile(tr, cur === tr.id, () => {
      const s = findClip(state.selected);
      if (!s || !isVisual(s.clip.kind)) return toast('Önce zaman çizelgesinden bir klip seç');
      applyTransition(s.clip, tr.id);
    }))));
    b.appendChild(h('button', { class: 'btn ghost sm full', onclick: () => {
      const tr = getTrackFor('video');
      applyTransitionAll(tr, { type: 'fade', dur: 0.6 });
    } }, 'Ana izdeki tüm kesmelere "Çözülme" ekle'));
  },

  render_filter(b) {
    const sel = findClip(state.selected);
    const ok = sel && (sel.clip.kind === 'video' || sel.clip.kind === 'image');
    const thumb = ok ? (state.media.get(sel.clip.mediaId) || {}).thumb : null;
    b.appendChild(h('p', { class: 'hint' }, ok ? 'Seçili klibe uygulamak için tıkla.' : 'Bir video veya resim klibi seç, sonra filtreye tıkla ya da klibin üzerine sürükle.'));
    b.appendChild(h('div', { class: 'filter-grid big' }, FILTER_PRESETS.map(p =>
      this.draggable(h('button', { class: 'fp', onclick: () => {
        const s = findClip(state.selected);
        if (!s || !(s.clip.kind === 'video' || s.clip.kind === 'image')) return toast('Önce bir video veya resim klibi seç');
        applyFilterPreset(s.clip, p.id);
      } }, h('div', { class: 'fp-img' + (thumb ? '' : ' demo'), style: { backgroundImage: thumb ? `url(${thumb})` : '', filter: filterPresetCss(p.f) } }), h('span', {}, p.name)), { type: 'filter', id: p.id }))));
    b.appendChild(h('button', { class: 'btn ghost sm full', onclick: () => {
      const s = findClip(state.selected);
      if (!s || !(s.clip.kind === 'video' || s.clip.kind === 'image')) return toast('Önce bir klip seç');
      const f = s.clip.filters;
      History.checkpoint();
      for (const c of allClips()) if (c.kind === 'video' || c.kind === 'image') c.filters = { ...f };
      refresh(); toast('Filtre tüm kliplere uygulandı', 'ok');
    } }, 'Seçili klibin filtresini tüm kliplere uygula'));
  },
};

/* Kütüphaneden zaman çizelgesine ekleme */
const Library = {
  async add(item, opt = {}) {
    let clip, track;
    const at = opt.time ?? state.time;
    if (item.type === 'media') {
      const m = state.media.get(item.id);
      if (!m) return;
      if (m.loading) return toast('Dosya hâlâ hazırlanıyor…');
      clip = makeClip(m.kind, { mediaId: m.id, in: 0, out: m.kind === 'image' ? 5 : m.duration, name: m.name });
      track = opt.track && acceptsKind(opt.track, m.kind) ? opt.track : getTrackFor(m.kind);
      // "+" ile eklenen video/resim ana izin sonuna eklenir
      clip.start = opt.time === undefined && track.main ? trackEnd(track) : at;
    } else if (item.type === 'sound') {
      const list = item.kind === 'music' ? MUSIC : SFX;
      const s = list.find(x => x.id === item.id);
      const m = await Panels.soundBlob(s, item.kind);
      clip = makeClip('audio', { mediaId: m.id, in: 0, out: m.duration, name: m.name });
      if (item.kind === 'music') { clip.fadeOut = 1.5; clip.volume = 0.8; }
      const audioTracks = state.project.tracks.filter(t => t.kind === 'audio');
      track = opt.track && acceptsKind(opt.track, 'audio') ? opt.track
        : (item.kind === 'music' ? audioTracks[audioTracks.length - 1] : audioTracks[0]) || getTrackFor('audio');
      clip.start = at;
    } else if (item.type === 'text' || item.type === 'sticker') {
      if (item.type === 'text') {
        const p = TEXT_PRESETS[item.preset];
        clip = makeClip('text', { out: 3, x: p.x || 0, y: p.y || 0, anim: p.anim || 'none', loop: p.loop || 'none' });
        Object.assign(clip.text, p.text);
      } else {
        clip = makeClip('text', { out: 3, anim: 'pop', loop: 'float' });
        Object.assign(clip.text, { content: item.emoji, size: 260, bold: false, font: 'Inter' });
      }
      track = opt.track && acceptsKind(opt.track, 'text') ? opt.track : getTrackFor('text');
      clip.start = at;
    } else if (item.type === 'fx') {
      clip = makeClip('fx', { out: 3, fx: { type: item.id, intensity: 0.7 } });
      track = opt.track && acceptsKind(opt.track, 'fx') ? opt.track : getTrackFor('fx');
      clip.start = at;
    }
    if (!clip) return;
    History.checkpoint();
    track.clips.push(clip);
    clip.start = findFreeStart(track, clip, clip.start);
    // metin/efekt için boş yer yoksa yeni iz aç
    if ((clip.kind === 'text' || clip.kind === 'fx') && Math.abs(clip.start - at) > 0.01 && opt.time === undefined) {
      track.clips.pop();
      track = addTrack(clip.kind);
      track.clips.push(clip);
      clip.start = at;
    }
    state.selected = clip.id;
    if (clip.kind !== 'audio' && opt.time === undefined && track.main) Engine.seek(clip.start);
    refresh();
    $('#emptyHint').classList.add('hidden');
  },
};
