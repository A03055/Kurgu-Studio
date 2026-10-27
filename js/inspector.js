'use strict';
/* Sağ panel: seçili klibin ayarları ya da proje ayarları */

function afterEdit(tl = false) {
  Engine.dirty = true;
  if (tl) TL.render();
  Store.saveProject();
}

function ctlSlider({ label, min, max, step = 1, get, set, fmt = v => v, def, tl = false }) {
  const val = h('span', { class: 'sl-val' }, fmt(get()));
  const inp = h('input', { type: 'range', min, max, step, value: get() });
  const start = () => History.checkpoint();
  inp.addEventListener('pointerdown', start);
  inp.addEventListener('keydown', start);
  inp.addEventListener('input', () => { set(parseFloat(inp.value)); val.textContent = fmt(get()); afterEdit(tl); });
  const lab = h('label', { class: 'sl-label', title: def !== undefined ? 'Çift tıkla: sıfırla' : '' }, label);
  if (def !== undefined) lab.addEventListener('dblclick', () => { History.checkpoint(); set(def); inp.value = get(); val.textContent = fmt(get()); afterEdit(tl); });
  return h('div', { class: 'ctl slider' }, h('div', { class: 'sl-top' }, lab, val), inp);
}

function ctlSelect(label, options, get, set, tl = false) {
  const sel = h('select', {}, options.map(o => h('option', { value: o.id, selected: o.id === get() }, o.name)));
  sel.addEventListener('change', () => { History.checkpoint(); set(sel.value); afterEdit(tl); Inspector.render(); });
  return h('div', { class: 'ctl row' }, h('label', {}, label), sel);
}

function ctlColor(label, get, set) {
  const inp = h('input', { type: 'color', value: get() });
  inp.addEventListener('pointerdown', () => History.checkpoint());
  inp.addEventListener('input', () => { set(inp.value); afterEdit(); });
  return h('div', { class: 'ctl row' }, h('label', {}, label), inp);
}

function ctlToggle(label, get, set, tl = false) {
  const inp = h('input', { type: 'checkbox', checked: !!get() });
  inp.addEventListener('change', () => { History.checkpoint(); set(inp.checked); afterEdit(tl); Inspector.render(); });
  return h('label', { class: 'ctl toggle' }, inp, h('span', { class: 'sw' }), h('span', {}, label));
}

function chips(options, get, set, tl = false, cls = '') {
  return h('div', { class: 'chips ' + cls }, options.map(o => h('button', {
    class: 'chip' + (o.id === get() ? ' on' : ''),
    onclick: () => { History.checkpoint(); set(o.id); afterEdit(tl); Inspector.render(); },
  }, o.name)));
}

function section(title, ...kids) {
  return h('div', { class: 'insp-sec' }, title ? h('div', { class: 'sec-title' }, title) : null, ...kids);
}

const Inspector = {
  tabs: {},

  render() {
    const box = $('#inspector');
    box.innerHTML = '';
    const sel = findClip(state.selected);
    if (!sel) return this.renderProject(box);
    const { clip: c, track } = sel;
    const tabsFor = {
      video: [['basic', 'Temel'], ['adjust', 'Ayarla'], ['anim', 'Animasyon'], ['audio', 'Ses'], ['speed', 'Hız'], ['trans', 'Geçiş']],
      image: [['basic', 'Temel'], ['adjust', 'Ayarla'], ['anim', 'Animasyon'], ['trans', 'Geçiş']],
      text: [['text', 'Metin'], ['basic', 'Konum'], ['anim', 'Animasyon']],
      audio: [['audio', 'Ses'], ['speed', 'Hız']],
      fx: [['fx', 'Efekt']],
    }[c.kind];
    let tab = this.tabs[c.kind];
    if (!tabsFor.some(t => t[0] === tab)) tab = this.tabs[c.kind] = tabsFor[0][0];

    box.appendChild(h('div', { class: 'insp-head' },
      h('div', { class: 'ih-kind k-' + c.kind }, KIND_LABEL[c.kind]),
      h('div', { class: 'ih-name', title: TL.clipLabel(c) }, TL.clipLabel(c)),
      h('div', { class: 'ih-actions' },
        h('button', { class: 'ib', title: 'Böl (S)', html: icon('split', 16), onclick: splitSelected }),
        h('button', { class: 'ib', title: 'Çoğalt (Ctrl+D)', html: icon('copy', 16), onclick: duplicateSelected }),
        h('button', { class: 'ib danger', title: 'Sil (Delete)', html: icon('trash', 16), onclick: deleteSelected }))));
    box.appendChild(h('div', { class: 'insp-tabs' }, tabsFor.map(([id, name]) =>
      h('button', { class: id === tab ? 'on' : '', onclick: () => { this.tabs[c.kind] = id; this.render(); } }, name))));
    const body = h('div', { class: 'insp-body' });
    box.appendChild(body);
    const fn = { basic: 'tabBasic', adjust: 'tabAdjust', anim: 'tabAnim', audio: 'tabAudio', speed: 'tabSpeed', trans: 'tabTrans', text: 'tabText', fx: 'tabFx' }[tab];
    this[fn](body, c, track);
  },

  durationCtl(c) {
    const inp = h('input', { type: 'number', min: 0.1, step: 0.1, value: clipDur(c).toFixed(2) });
    inp.addEventListener('change', () => {
      const v = Math.max(MIN_DUR, parseFloat(inp.value) || 1);
      History.checkpoint();
      if (isMediaKind(c.kind)) {
        const m = state.media.get(c.mediaId);
        c.out = Math.min(m ? m.duration : Infinity, c.in + v * c.speed);
      } else c.out = c.in + v;
      refresh();
    });
    return h('div', { class: 'ctl row' }, h('label', {}, 'Süre (sn)'), inp);
  },

  tabBasic(b, c) {
    const pct = v => Math.round(v * 100) + '%';
    if (c.kind !== 'text') b.appendChild(section('Yerleşim',
      chips([{ id: 'contain', name: 'Sığdır' }, { id: 'cover', name: 'Doldur' }], () => c.fit, v => { c.fit = v; c.scale = 1; c.x = 0; c.y = 0; }),
      ctlToggle('Yatay çevir (ayna)', () => c.flipX, v => { c.flipX = v; })));
    b.appendChild(section('Dönüştür',
      ctlSlider({ label: 'Ölçek', min: 0.05, max: 4, step: 0.01, get: () => c.scale, set: v => { c.scale = v; }, fmt: pct, def: 1 }),
      ctlSlider({ label: 'Konum X', min: -1, max: 1, step: 0.005, get: () => c.x, set: v => { c.x = v; }, fmt: v => Math.round(v * 100), def: 0 }),
      ctlSlider({ label: 'Konum Y', min: -1, max: 1, step: 0.005, get: () => c.y, set: v => { c.y = v; }, fmt: v => Math.round(v * 100), def: 0 }),
      ctlSlider({ label: 'Döndür', min: -180, max: 180, step: 1, get: () => c.rotation, set: v => { c.rotation = v; }, fmt: v => v + '°', def: 0 }),
      ctlSlider({ label: 'Opaklık', min: 0, max: 1, step: 0.01, get: () => c.opacity, set: v => { c.opacity = v; }, fmt: pct, def: 1 }),
      h('button', { class: 'btn ghost sm', html: icon('center', 14) + ' Konumu sıfırla', onclick: () => { History.checkpoint(); Object.assign(c, { x: 0, y: 0, scale: 1, rotation: 0 }); afterEdit(); this.render(); } })));
    if (c.kind !== 'text') b.appendChild(section('Karışım modu', ctlSelect('Mod', [
      { id: 'normal', name: 'Normal' }, { id: 'screen', name: 'Ekran (aydınlat)' }, { id: 'multiply', name: 'Çarp (koyulaştır)' },
      { id: 'overlay', name: 'Bindirme' }, { id: 'lighten', name: 'Açık olan' }, { id: 'darken', name: 'Koyu olan' },
      { id: 'difference', name: 'Fark' }, { id: 'soft-light', name: 'Yumuşak ışık' }], () => c.blend || 'normal', v => { c.blend = v; })));
    if (!isMediaKind(c.kind)) b.appendChild(section('Zamanlama', this.durationCtl(c)));
  },

  tabAdjust(b, c) {
    const f = c.filters;
    const thumb = (state.media.get(c.mediaId) || {}).thumb;
    b.appendChild(section('Filtreler', h('div', { class: 'filter-grid' }, FILTER_PRESETS.map(p => {
      const on = Object.keys(DEFAULT_FILTERS).every(k => (f[k] ?? DEFAULT_FILTERS[k]) === (p.f[k] ?? DEFAULT_FILTERS[k]) || k === 'blur');
      return h('button', { class: 'fp' + (on ? ' on' : ''), onclick: () => applyFilterPreset(c, p.id) },
        h('div', { class: 'fp-img', style: { backgroundImage: thumb ? `url(${thumb})` : '', filter: filterPresetCss(p.f) } }),
        h('span', {}, p.name));
    }))));
    const s = (label, key, min, max, def, unit = '') => ctlSlider({ label, min, max, step: 1, get: () => f[key], set: v => { f[key] = v; }, fmt: v => v + unit, def });
    b.appendChild(section('Ayarla',
      s('Parlaklık', 'brightness', 0, 200, 100, '%'),
      s('Kontrast', 'contrast', 0, 200, 100, '%'),
      s('Doygunluk', 'saturate', 0, 300, 100, '%'),
      s('Renk tonu', 'hue', 0, 360, 0, '°'),
      s('Sıcaklık (sepya)', 'sepia', 0, 100, 0, '%'),
      s('Siyah-beyaz', 'grayscale', 0, 100, 0, '%'),
      s('Bulanıklık', 'blur', 0, 40, 0, 'px'),
      s('Negatif', 'invert', 0, 100, 0, '%'),
      h('button', { class: 'btn ghost sm', onclick: () => { History.checkpoint(); c.filters = { ...DEFAULT_FILTERS }; afterEdit(true); this.render(); } }, 'Tümünü sıfırla')));
  },

  tabAnim(b, c) {
    b.appendChild(section('Giriş animasyonu', chips(ANIMS_IN, () => c.anim || 'none', v => { c.anim = v; }, true)));
    b.appendChild(section('Çıkış animasyonu', chips(ANIMS_OUT, () => c.animOut || 'none', v => { c.animOut = v; }, true)));
    b.appendChild(section('Sürekli animasyon', chips(ANIMS_LOOP, () => c.loop || 'none', v => { c.loop = v; }, true)));
    b.appendChild(section('Ayar',
      ctlSlider({ label: 'Animasyon süresi', min: 0.1, max: 3, step: 0.05, get: () => c.animDur || 0.5, set: v => { c.animDur = v; }, fmt: v => v.toFixed(2) + 's', def: 0.5 }),
      ctlSlider({ label: 'Açılma (fade in)', min: 0, max: Math.min(5, clipDur(c)), step: 0.05, get: () => c.fadeIn, set: v => { c.fadeIn = v; }, fmt: v => v.toFixed(2) + 's', def: 0, tl: true }),
      ctlSlider({ label: 'Kararma (fade out)', min: 0, max: Math.min(5, clipDur(c)), step: 0.05, get: () => c.fadeOut, set: v => { c.fadeOut = v; }, fmt: v => v.toFixed(2) + 's', def: 0, tl: true })));
  },

  tabAudio(b, c) {
    b.appendChild(section('Ses',
      ctlSlider({ label: 'Ses seviyesi', min: 0, max: 2, step: 0.01, get: () => c.volume, set: v => { c.volume = v; }, fmt: v => Math.round(v * 100) + '%', def: 1, tl: true }),
      ctlSlider({ label: 'Sesi aç (fade in)', min: 0, max: Math.min(10, clipDur(c)), step: 0.05, get: () => c.fadeIn, set: v => { c.fadeIn = v; }, fmt: v => v.toFixed(2) + 's', def: 0, tl: true }),
      ctlSlider({ label: 'Sesi kıs (fade out)', min: 0, max: Math.min(10, clipDur(c)), step: 0.05, get: () => c.fadeOut, set: v => { c.fadeOut = v; }, fmt: v => v.toFixed(2) + 's', def: 0, tl: true }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn ghost sm', html: icon('mute', 14) + ' Sessize al', onclick: () => { History.checkpoint(); c.volume = 0; afterEdit(true); this.render(); } }),
        c.kind === 'video' ? h('button', { class: 'btn ghost sm', html: icon('audio', 14) + ' Sesi ayır', onclick: () => detachAudio(c) }) : null)));
  },

  tabSpeed(b, c) {
    const setSpeed = v => {
      const m = state.media.get(c.mediaId);
      c.speed = v;
      if (m) c.out = Math.min(c.out, m.duration);
    };
    b.appendChild(section('Hız',
      chips([0.25, 0.5, 1, 1.5, 2, 3, 4].map(v => ({ id: v, name: v + 'x' })), () => c.speed, setSpeed, true),
      ctlSlider({ label: 'Özel hız', min: 0.25, max: 4, step: 0.05, get: () => c.speed, set: setSpeed, fmt: v => v.toFixed(2) + 'x', def: 1, tl: true }),
      h('p', { class: 'hint' }, `Klip süresi: ${fmtShort(clipDur(c))}`)));
  },

  tabTrans(b, c, track) {
    const prev = prevAdjacent(track, c);
    const cur = c.transition && c.transition.type;
    b.appendChild(h('p', { class: 'hint' }, prev
      ? 'Bu klip ile önceki klip arasındaki geçiş.'
      : 'Önünde bitişik klip yok: geçiş arka plandan giriş olarak uygulanır.'));
    b.appendChild(section('Geçiş türü', h('div', { class: 'trans-grid small' },
      h('button', { class: 'tg' + (!cur ? ' on' : ''), onclick: () => applyTransition(c, null) }, h('div', { class: 'tg-prev none' }), h('span', {}, 'Yok')),
      TRANSITIONS.map(tr => transitionTile(tr, cur === tr.id, () => applyTransition(c, tr.id))))));
    if (cur) b.appendChild(section('Ayar',
      ctlSlider({ label: 'Geçiş süresi', min: 0.2, max: 2, step: 0.05, get: () => c.transition.dur, set: v => { c.transition.dur = v; }, fmt: v => v.toFixed(2) + 's', def: 0.6 }),
      h('button', { class: 'btn ghost sm', onclick: () => applyTransitionAll(track, c.transition) }, 'Bu izdeki tüm kesmelere uygula')));
  },

  tabText(b, c) {
    const T = c.text;
    const ta = h('textarea', { rows: 3, id: 'textContent' }, T.content);
    ta.addEventListener('focus', () => History.checkpoint());
    ta.addEventListener('input', () => { T.content = ta.value; afterEdit(); TL.render(); });
    b.appendChild(section('Metin', ta));
    b.appendChild(section('Yazı tipi',
      h('div', { class: 'font-grid' }, FONTS.map(f => h('button', {
        class: 'font-btn' + (T.font === f.id ? ' on' : ''), style: { fontFamily: f.stack },
        onclick: () => { History.checkpoint(); T.font = f.id; afterEdit(); this.render(); },
      }, f.name))),
      h('div', { class: 'btn-row' },
        h('button', { class: 'tbtn' + (T.bold ? ' on' : ''), style: { fontWeight: 800 }, onclick: () => { History.checkpoint(); T.bold = !T.bold; afterEdit(); this.render(); } }, 'B'),
        h('button', { class: 'tbtn' + (T.italic ? ' on' : ''), style: { fontStyle: 'italic' }, onclick: () => { History.checkpoint(); T.italic = !T.italic; afterEdit(); this.render(); } }, 'I'),
        ...['left', 'center', 'right'].map(al => h('button', { class: 'tbtn' + (T.align === al ? ' on' : ''), onclick: () => { History.checkpoint(); T.align = al; afterEdit(); this.render(); } }, { left: '⇤', center: '≡', right: '⇥' }[al]))),
      ctlSlider({ label: 'Boyut', min: 10, max: 400, step: 1, get: () => T.size, set: v => { T.size = v; }, def: 80 }),
      ctlSlider({ label: 'Harf aralığı', min: -10, max: 60, step: 1, get: () => T.letter || 0, set: v => { T.letter = v; }, def: 0 }),
      ctlColor('Renk', () => T.color, v => { T.color = v; }),
      h('div', { class: 'swatches' }, ['#ffffff', '#000000', '#ffd400', '#ff3d71', '#00e5ff', '#22ff7a', '#b44dff', '#ff8a00'].map(col =>
        h('button', { class: 'swatch', style: { background: col }, onclick: () => { History.checkpoint(); T.color = col; afterEdit(); this.render(); } })))));
    b.appendChild(section('Kontur',
      ctlSlider({ label: 'Kalınlık', min: 0, max: 20, step: 0.5, get: () => T.strokeW, set: v => { T.strokeW = v; }, def: 0 }),
      ctlColor('Renk', () => T.stroke, v => { T.stroke = v; })));
    b.appendChild(section('Arka plan',
      ctlToggle('Arka plan kutusu', () => T.bgOn, v => { T.bgOn = v; }),
      T.bgOn ? ctlColor('Renk', () => T.bg, v => { T.bg = v; }) : null,
      T.bgOn ? ctlSlider({ label: 'Opaklık', min: 0, max: 1, step: 0.01, get: () => T.bgOpacity, set: v => { T.bgOpacity = v; }, fmt: v => Math.round(v * 100) + '%', def: 0.6 }) : null));
    b.appendChild(section('Gölge / Parlama',
      ctlSlider({ label: 'Yoğunluk', min: 0, max: 80, step: 1, get: () => T.shadow, set: v => { T.shadow = v; }, def: 0 }),
      ctlColor('Renk', () => T.shadowColor, v => { T.shadowColor = v; })));
    b.appendChild(section('Diğer',
      ctlToggle('Daktilo efekti (harf harf yaz)', () => T.typewriter, v => { T.typewriter = v; }),
      this.durationCtl(c)));
  },

  tabFx(b, c) {
    b.appendChild(section('Efekt türü', h('div', { class: 'fx-grid small' }, EFFECTS.map(e =>
      fxTile(e, c.fx.type === e.id, () => { History.checkpoint(); c.fx.type = e.id; afterEdit(true); this.render(); })))));
    b.appendChild(section('Ayar',
      ctlSlider({ label: 'Yoğunluk', min: 0, max: 1.5, step: 0.01, get: () => c.fx.intensity, set: v => { c.fx.intensity = v; }, fmt: v => Math.round(v * 100) + '%', def: 0.7 }),
      ctlSlider({ label: 'Yavaşça başla', min: 0, max: 3, step: 0.05, get: () => c.fadeIn, set: v => { c.fadeIn = v; }, fmt: v => v.toFixed(2) + 's', def: 0 }),
      ctlSlider({ label: 'Yavaşça bitir', min: 0, max: 3, step: 0.05, get: () => c.fadeOut, set: v => { c.fadeOut = v; }, fmt: v => v.toFixed(2) + 's', def: 0 }),
      this.durationCtl(c),
      h('p', { class: 'hint' }, 'Efektler, efekt izinin altındaki tüm görüntüye uygulanır.')));
  },

  renderProject(box) {
    const p = state.project;
    box.appendChild(h('div', { class: 'insp-head' }, h('div', { class: 'ih-kind' }, 'Proje'), h('div', { class: 'ih-name' }, p.name)));
    const body = h('div', { class: 'insp-body' });
    box.appendChild(body);
    body.appendChild(section('En-boy oranı', h('div', { class: 'aspect-grid' }, Object.keys(ASPECTS).map(a => {
      const [w, hh] = ASPECTS[a];
      const sc = 26 / Math.max(w, hh);
      const label = { '16:9': 'YouTube', '9:16': 'TikTok/Reels', '1:1': 'Kare', '4:5': 'Instagram', '4:3': 'Klasik', '21:9': 'Sinema' }[a];
      return h('button', { class: 'asp' + (p.aspect === a ? ' on' : ''), onclick: () => setAspect(a) },
        h('div', { class: 'asp-box', style: { width: w * sc + 'px', height: hh * sc + 'px' } }),
        h('b', {}, a), h('span', {}, label));
    }))));
    body.appendChild(section('Arka plan',
      chips([{ id: 'color', name: 'Düz renk' }, { id: 'blur', name: 'Bulanık video' }], () => p.bgMode || 'color', v => { p.bgMode = v; }),
      ctlColor('Renk', () => p.bg, v => { p.bg = v; }),
      h('p', { class: 'hint' }, '"Bulanık video", ana izdeki videonun boşlukları bulanık kopyasıyla doldurur. Dikey videolarda çok işe yarar.')));
    body.appendChild(section('Bilgi',
      h('div', { class: 'kv' }, h('span', {}, 'Süre'), h('b', {}, fmtTime(projectDuration()))),
      h('div', { class: 'kv' }, h('span', {}, 'Çözünürlük'), h('b', {}, Engine.size().join(' × '))),
      h('div', { class: 'kv' }, h('span', {}, 'Klip sayısı'), h('b', {}, String(allClips().length)))));
    body.appendChild(section('Kısayollar', h('div', { class: 'keys' },
      [['Boşluk', 'Oynat / Durdur'], ['S', 'Oynatma çizgisinden böl'], ['Delete', 'Seçiliyi sil'], ['Ctrl+Z / Ctrl+Y', 'Geri al / Yinele'],
        ['Ctrl+D', 'Çoğalt'], ['← / →', '1 kare ileri/geri'], ['Shift + ← / →', '1 saniye'], ['Home / End', 'Başa / sona git'],
        ['Ctrl + tekerlek', 'Zaman çizelgesini yakınlaştır'], ['Sağ tık', 'Klip menüsü']].map(([k, v]) => h('div', { class: 'key' }, h('kbd', {}, k), h('span', {}, v))))));
  },

  focusText() {
    this.tabs.text = 'text';
    this.render();
    const ta = $('#textContent');
    if (ta) { ta.focus(); ta.select(); }
  },
};

function transitionTile(tr, on, onclick) {
  const el = h('button', { class: 'tg' + (on ? ' on' : ''), draggable: 'true', title: tr.name + ' — klibe sürükle ya da seçili klibe tıkla', onclick },
    h('div', { class: 'tg-prev' }, h('div', { class: 'tg-a' }), h('div', { class: `tg-b ta-${tr.id}` })),
    h('span', {}, tr.name));
  el.addEventListener('dragstart', e => e.dataTransfer.setData('application/x-kurgu', JSON.stringify({ type: 'transition', id: tr.id })));
  return el;
}

function fxTile(e, on, onclick) {
  const el = h('button', { class: 'fxt' + (on ? ' on' : ''), draggable: 'true', title: e.name, onclick },
    h('div', { class: `fxt-prev fxp-${e.id}` }),
    h('span', {}, e.name));
  el.addEventListener('dragstart', ev => ev.dataTransfer.setData('application/x-kurgu', JSON.stringify({ type: 'fx', id: e.id })));
  return el;
}
