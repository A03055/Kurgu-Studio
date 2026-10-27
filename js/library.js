'use strict';
/* Programla birlikte gelen ücretsiz içerikler: geçişler, efektler, filtreler, metin şablonları,
   çıkartmalar, ses efektleri ve müzikler. Sesler ve müzikler kodla üretilir — telif derdi yok. */

const FONTS = [
  { id: 'Inter', name: 'Modern', stack: 'Inter, "Segoe UI", Roboto, Arial, sans-serif' },
  { id: 'Montserrat', name: 'Montserrat', stack: 'Montserrat, sans-serif' },
  { id: 'Poppins', name: 'Poppins', stack: 'Poppins, sans-serif' },
  { id: 'Fredoka', name: 'Yuvarlak', stack: 'Fredoka, sans-serif' },
  { id: 'Bebas', name: 'BEBAS', stack: '"Bebas Neue", Impact, sans-serif' },
  { id: 'Anton', name: 'Anton', stack: 'Anton, Impact, sans-serif' },
  { id: 'Impact', name: 'Kalın Başlık', stack: 'Impact, "Arial Black", Anton, sans-serif' },
  { id: 'Oswald', name: 'Oswald', stack: 'Oswald, sans-serif' },
  { id: 'Bangers', name: 'ÇİZGİ ROMAN', stack: 'Bangers, Impact, sans-serif' },
  { id: 'Lilita', name: 'Lilita', stack: '"Lilita One", sans-serif' },
  { id: 'Righteous', name: 'Righteous', stack: 'Righteous, sans-serif' },
  { id: 'Georgia', name: 'Klasik', stack: '"Playfair Display", Georgia, serif' },
  { id: 'Slab', name: 'Slab', stack: '"Roboto Slab", Georgia, serif' },
  { id: 'Lobster', name: 'Lobster', stack: 'Lobster, cursive' },
  { id: 'Pacifico', name: 'Pacifico', stack: 'Pacifico, cursive' },
  { id: 'Dancing', name: 'Dans', stack: '"Dancing Script", cursive' },
  { id: 'Brush', name: 'El yazısı', stack: '"Great Vibes", "Brush Script MT", cursive' },
  { id: 'Caveat', name: 'Not defteri', stack: 'Caveat, cursive' },
  { id: 'Marker', name: 'Keçeli kalem', stack: '"Permanent Marker", cursive' },
  { id: 'Pixel', name: 'PİKSEL', stack: '"Press Start 2P", monospace' },
  { id: 'Courier', name: 'Daktilo', stack: '"Courier New", Courier, monospace' },
  { id: 'Comic', name: 'Eğlenceli', stack: '"Comic Sans MS", "Comic Neue", Fredoka, cursive' },
];
const fontStack = id => (FONTS.find(f => f.id === id) || FONTS[0]).stack;

const TRANSITIONS = [
  { id: 'fade', name: 'Çözülme' },
  { id: 'black', name: 'Siyaha geçiş' },
  { id: 'white', name: 'Beyaz flaş' },
  { id: 'slideLeft', name: 'Sola kaydır' },
  { id: 'slideRight', name: 'Sağa kaydır' },
  { id: 'slideUp', name: 'Yukarı kaydır' },
  { id: 'slideDown', name: 'Aşağı kaydır' },
  { id: 'wipeLeft', name: 'Silme ←' },
  { id: 'wipeRight', name: 'Silme →' },
  { id: 'wipeDown', name: 'Perde ↓' },
  { id: 'circle', name: 'Daire aç' },
  { id: 'diamond', name: 'Elmas' },
  { id: 'zoomIn', name: 'Yakınlaş' },
  { id: 'zoomOut', name: 'Uzaklaş' },
  { id: 'spin', name: 'Döndür' },
  { id: 'blur', name: 'Bulanık' },
  { id: 'glitch', name: 'Glitch' },
  { id: 'pixel', name: 'Piksel' },
  { id: 'split', name: 'Bölünme' },
  { id: 'blinds', name: 'Jaluzi' },
  { id: 'clock', name: 'Saat' },
  { id: 'heart', name: 'Kalp' },
  { id: 'flip', name: 'Çevir' },
  { id: 'door', name: 'Kapı' },
  { id: 'crossZoom', name: 'Hızlı zoom' },
  { id: 'swipeBlur', name: 'Hızlı kaydır' },
];

const EFFECTS = [
  { id: 'vignette', name: 'Vinyet', cat: 'Temel' },
  { id: 'letterbox', name: 'Sinema şeridi', cat: 'Temel' },
  { id: 'grain', name: 'Film greni', cat: 'Retro' },
  { id: 'vhs', name: 'VHS', cat: 'Retro' },
  { id: 'oldfilm', name: 'Eski film', cat: 'Retro' },
  { id: 'scanlines', name: 'Tarama çizgisi', cat: 'Retro' },
  { id: 'glitch', name: 'Glitch', cat: 'Dinamik' },
  { id: 'rgb', name: 'RGB kayma', cat: 'Dinamik' },
  { id: 'shake', name: 'Sarsıntı', cat: 'Dinamik' },
  { id: 'zoompulse', name: 'Ritim zoom', cat: 'Dinamik' },
  { id: 'flash', name: 'Flaş', cat: 'Dinamik' },
  { id: 'strobe', name: 'Stroboskop', cat: 'Dinamik' },
  { id: 'blurin', name: 'Bulanık giriş', cat: 'Dinamik' },
  { id: 'lightleak', name: 'Işık sızması', cat: 'Işık' },
  { id: 'glow', name: 'Parıltı', cat: 'Işık' },
  { id: 'rainbow', name: 'Gökkuşağı', cat: 'Işık' },
  { id: 'snow', name: 'Kar', cat: 'Parçacık' },
  { id: 'rain', name: 'Yağmur', cat: 'Parçacık' },
  { id: 'confetti', name: 'Konfeti', cat: 'Parçacık' },
  { id: 'hearts', name: 'Kalpler', cat: 'Parçacık' },
  { id: 'sparkle', name: 'Yıldızlar', cat: 'Parçacık' },
  { id: 'bubbles', name: 'Baloncuk', cat: 'Parçacık' },
  { id: 'pixelate', name: 'Pikselleştir', cat: 'Stil' },
  { id: 'mirror', name: 'Ayna', cat: 'Stil' },
  { id: 'kaleido', name: 'Dörtlü ayna', cat: 'Stil' },
  { id: 'bw', name: 'Siyah beyaz', cat: 'Stil' },
  { id: 'negative', name: 'Negatif', cat: 'Stil' },
  { id: 'dream', name: 'Rüya', cat: 'Stil' },
  { id: 'frame', name: 'Polaroid çerçeve', cat: 'Stil' },
  { id: 'rec', name: 'Kamera REC', cat: 'Stil' },
  { id: 'duotone', name: 'Duoton', cat: 'Stil' },
  { id: 'heartbeat', name: 'Kalp atışı', cat: 'Dinamik' },
  { id: 'tvoff', name: 'TV kapanış', cat: 'Retro' },
  { id: 'dust', name: 'Toz', cat: 'Retro' },
  { id: 'bokeh', name: 'Bokeh', cat: 'Işık' },
  { id: 'fireflies', name: 'Ateş böceği', cat: 'Parçacık' },
];

const MASKS = [
  { id: 'none', name: 'Yok' }, { id: 'rect', name: 'Dikdörtgen' }, { id: 'circle', name: 'Daire' },
  { id: 'heart', name: 'Kalp' }, { id: 'star', name: 'Yıldız' }, { id: 'linear', name: 'Doğrusal' }, { id: 'band', name: 'Şerit' },
];

const AUDIO_FX = [
  { id: 'none', name: 'Yok' }, { id: 'echo', name: 'Yankı' }, { id: 'hall', name: 'Salon' }, { id: 'radio', name: 'Radyo' },
  { id: 'phone', name: 'Telefon' }, { id: 'robot', name: 'Robot' }, { id: 'underwater', name: 'Su altı' }, { id: 'megaphone', name: 'Megafon' },
];

const FILTER_PRESETS = [
  { id: 'none', name: 'Orijinal', f: {} },
  { id: 'vivid', name: 'Canlı', f: { saturate: 145, contrast: 112 } },
  { id: 'warm', name: 'Sıcak', f: { sepia: 28, saturate: 125, brightness: 103 } },
  { id: 'cool', name: 'Soğuk', f: { hue: 195, sepia: 25, saturate: 110, contrast: 105 } },
  { id: 'bw', name: 'Siyah-Beyaz', f: { grayscale: 100, contrast: 120 } },
  { id: 'noir', name: 'Noir', f: { grayscale: 100, contrast: 160, brightness: 90 } },
  { id: 'vintage', name: 'Vintage', f: { sepia: 55, contrast: 90, brightness: 106, saturate: 80 } },
  { id: 'cinema', name: 'Sinematik', f: { contrast: 128, saturate: 82, brightness: 92 } },
  { id: 'fade', name: 'Soluk', f: { contrast: 78, brightness: 112, saturate: 70 } },
  { id: 'drama', name: 'Dramatik', f: { contrast: 145, saturate: 115, brightness: 88 } },
  { id: 'pastel', name: 'Pastel', f: { saturate: 65, brightness: 115, contrast: 85 } },
  { id: 'sunset', name: 'Gün batımı', f: { sepia: 40, saturate: 160, hue: 345 } },
  { id: 'cyber', name: 'Siber', f: { hue: 260, saturate: 170, contrast: 120 } },
  { id: 'forest', name: 'Orman', f: { hue: 25, saturate: 120, contrast: 108 } },
];
function filterPresetCss(f) {
  const x = Object.assign({ ...DEFAULT_FILTERS }, f);
  // hue değerleri sepia ile birlikte "renk tonu" verir
  return `brightness(${x.brightness}%) contrast(${x.contrast}%) saturate(${x.saturate}%) sepia(${x.sepia}%) hue-rotate(${x.hue}deg) grayscale(${x.grayscale}%) invert(${x.invert}%)`;
}

const ANIMS_IN = [
  { id: 'none', name: 'Yok' }, { id: 'fade', name: 'Belir' }, { id: 'pop', name: 'Zıpla' },
  { id: 'slideUp', name: 'Aşağıdan' }, { id: 'slideDown', name: 'Yukarıdan' }, { id: 'slideLeft', name: 'Sağdan' },
  { id: 'slideRight', name: 'Soldan' }, { id: 'zoom', name: 'Büyü' }, { id: 'spin', name: 'Dönerek' },
  { id: 'blur', name: 'Netleş' }, { id: 'bounce', name: 'Sek' },
];
const ANIMS_OUT = [
  { id: 'none', name: 'Yok' }, { id: 'fade', name: 'Kaybol' }, { id: 'pop', name: 'Küçül' },
  { id: 'slideUp', name: 'Yukarı' }, { id: 'slideDown', name: 'Aşağı' }, { id: 'slideLeft', name: 'Sola' },
  { id: 'slideRight', name: 'Sağa' }, { id: 'zoom', name: 'Büyüyerek' }, { id: 'spin', name: 'Dönerek' },
  { id: 'blur', name: 'Bulanıklaş' },
];
const ANIMS_LOOP = [
  { id: 'none', name: 'Yok' }, { id: 'kenIn', name: 'Yavaş yakınlaş' }, { id: 'kenOut', name: 'Yavaş uzaklaş' },
  { id: 'panL', name: 'Sola kay' }, { id: 'panR', name: 'Sağa kay' }, { id: 'pulse', name: 'Nabız' },
  { id: 'wobble', name: 'Sallan' }, { id: 'float', name: 'Süzül' }, { id: 'rotate', name: 'Dön' },
];

const TEXT_PRESETS = [
  { name: 'Düz metin', css: 'font-weight:600', text: { content: 'Metin ekle', size: 80 } },
  { name: 'BAŞLIK', css: 'font-family:Anton,Impact,sans-serif;letter-spacing:1px;-webkit-text-stroke:1px #000', text: { content: 'BAŞLIK', font: 'Anton', size: 150, strokeW: 6, stroke: '#000000' }, y: -0.28, anim: 'pop' },
  { name: 'Altyazı', css: 'background:rgba(0,0,0,.65);padding:2px 6px;border-radius:4px;font-weight:500', text: { content: 'Altyazı metni', size: 54, bold: false, bgOn: true, bg: '#000000', bgOpacity: 0.65 }, y: 0.38, anim: 'fade' },
  { name: 'Neon', css: 'color:#7ff;text-shadow:0 0 6px #0ff,0 0 12px #0ff', text: { content: 'NEON', size: 130, color: '#88ffff', shadow: 40, shadowColor: '#00e5ff' }, anim: 'fade', loop: 'pulse' },
  { name: 'Vurgu', css: 'background:#ffd400;color:#111;padding:2px 8px;border-radius:4px;font-weight:800', text: { content: 'Vurgulu', size: 90, color: '#111111', bgOn: true, bg: '#ffd400', bgOpacity: 1 }, anim: 'pop' },
  { name: 'Retro', css: 'font-family:Lobster,cursive;color:#ff5fa2;-webkit-text-stroke:1px #2b0a3d;font-size:18px', text: { content: 'Retro', font: 'Lobster', italic: false, size: 120, color: '#ff5fa2', strokeW: 5, stroke: '#2b0a3d' }, anim: 'slideUp' },
  { name: 'Oyun', css: 'font-family:Bangers,Impact,sans-serif;color:#ffe14d;-webkit-text-stroke:1px #c00;font-size:18px;letter-spacing:1px', text: { content: 'LEVEL UP!', font: 'Bangers', size: 130, color: '#ffe14d', strokeW: 7, stroke: '#cc0000', shadow: 12, shadowColor: '#000000' }, anim: 'bounce' },
  { name: 'Zarif', css: 'font-family:Playfair Display,Georgia,serif;letter-spacing:3px', text: { content: 'z a r i f', font: 'Georgia', bold: false, size: 90, letter: 12 }, anim: 'blur' },
  { name: 'Daktilo', css: 'font-family:Courier New,monospace', text: { content: 'Bir varmış, bir yokmuş...', font: 'Courier', size: 64, typewriter: true, bold: false } },
  { name: 'El yazısı', css: 'font-family:Great Vibes,cursive;font-size:20px', text: { content: 'Sevgiyle', font: 'Brush', size: 140, bold: false, color: '#fff3d6', shadow: 10, shadowColor: '#000000' }, anim: 'fade' },
  { name: 'Etiket', css: 'background:#ff3d71;color:#fff;padding:2px 8px;border-radius:12px;font-weight:700', text: { content: 'YENİ', size: 70, bgOn: true, bg: '#ff3d71', bgOpacity: 1 }, x: 0.3, y: -0.35, anim: 'pop', loop: 'wobble' },
  { name: 'Abone ol', css: 'background:#e00;color:#fff;padding:2px 8px;border-radius:4px;font-weight:800', text: { content: '▶ ABONE OL', size: 72, bgOn: true, bg: '#ee0000', bgOpacity: 1 }, y: 0.32, anim: 'bounce', loop: 'pulse' },
  { name: 'Tatil', css: 'font-family:Pacifico,cursive;color:#fff;text-shadow:0 2px 0 #ff6a3d;font-size:16px', text: { content: 'Yaz Tatili', font: 'Pacifico', size: 120, bold: false, color: '#ffffff', shadow: 0, strokeW: 5, stroke: '#ff6a3d' }, anim: 'bounce' },
  { name: 'PİKSEL', css: 'font-family:\'Press Start 2P\',monospace;font-size:10px;color:#7CFF6B', text: { content: 'GAME OVER', font: 'Pixel', size: 70, bold: false, color: '#7CFF6B', shadow: 20, shadowColor: '#00ff44' }, anim: 'pop', loop: 'pulse' },
  { name: 'Sinema', css: 'font-family:Bebas Neue,sans-serif;letter-spacing:4px;font-size:18px', text: { content: 'BİR FİLM', font: 'Bebas', size: 130, bold: false, letter: 18 }, anim: 'fade', loop: 'kenIn' },
  { name: 'Not', css: 'font-family:Caveat,cursive;font-size:20px;color:#fffbe0', text: { content: 'unutma!', font: 'Caveat', size: 110, color: '#fffbe0', bgOn: true, bg: '#2b2b2b', bgOpacity: 0.5 }, anim: 'slideUp' },
  { name: 'Keçeli', css: 'font-family:Permanent Marker,cursive;color:#ff3d71;font-size:16px', text: { content: 'WOW!', font: 'Marker', size: 140, color: '#ff3d71', strokeW: 4, stroke: '#ffffff' }, anim: 'pop', loop: 'wobble' },
  { name: 'Modern', css: 'font-family:Montserrat,sans-serif;font-weight:700;letter-spacing:2px', text: { content: 'MODERN', font: 'Montserrat', size: 100, letter: 10 }, anim: 'slideRight' },
];

const STICKERS = {
  'Yüzler': '😀 😂 🤣 😍 🥰 😎 🤩 🥳 😭 😱 🤯 😡 🤔 🙄 😴 🤤 😇 🤡 💀 👻 👽 🤖 🙈 🐶'.split(' '),
  'El & Kalp': '👍 👎 👏 🙌 🙏 💪 ✌️ 🤞 👌 👉 👀 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 💥 💫 💦 💨'.split(' '),
  'Nesne': '🔥 ⭐ 🌟 ✨ ⚡ 🌈 ☀️ 🌙 ❄️ 🎉 🎊 🎁 🎈 🏆 🥇 🎵 🎶 🎬 📸 💡 💰 💎 🚀 ⏰'.split(' '),
  'Yemek & Doğa': '🍕 🍔 🍟 🍩 🍦 🍓 🍉 🍿 ☕ 🧋 🌸 🌹 🌻 🍀 🌴 🌊 🐱 🦄 🐼 🦋 🐝 🐸 🦁 🐧'.split(' '),
  'İşaret': '✅ ❌ ⚠️ ❓ ❗ ➡️ ⬅️ ⬆️ ⬇️ 🔴 🟢 🔵 ⭕ 🆕 🆒 🔝 💬 💭 🗯️ 📌 📍 🔔 🔊 🏁'.split(' '),
};

/* ---------------- Ses üretimi ---------------- */

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function encodeWav(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
  const out = new ArrayBuffer(44 + len * ch * 2);
  const v = new DataView(out);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, len * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const s = clamp(data[c][i], -1, 1);
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Blob([out], { type: 'audio/wav' });
}

const Synth = {
  noise(ac, sec = 1) {
    const b = ac.createBuffer(1, Math.floor(ac.sampleRate * sec), ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = hash(i, 7) * 2 - 1;
    return b;
  },
  env(g, t, v, a, hold, r) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  },
  tone(ac, out, freq, t, dur, o = {}) {
    const osc = ac.createOscillator();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    if (o.detune) osc.detune.value = o.detune;
    const g = ac.createGain();
    Synth.env(g, t, o.v ?? 0.2, o.a ?? 0.01, Math.max(0, dur - (o.a ?? 0.01)), o.r ?? 0.2);
    let node = osc;
    if (o.cutoff) {
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cutoff; f.Q.value = o.q || 0.7;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(o.dest || out);
    osc.start(t); osc.stop(t + dur + (o.r ?? 0.2) + 0.05);
  },
  kick(ac, out, t, v = 0.9) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.45);
  },
  snare(ac, out, t, nb, v = 0.35) {
    const s = ac.createBufferSource(); s.buffer = nb;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = ac.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, hash(t * 1000, 3) * 0.5); s.stop(t + 0.25);
    Synth.tone(ac, out, 190, t, 0.03, { type: 'triangle', v: v * 0.6, r: 0.08 });
  },
  hat(ac, out, t, nb, v = 0.12, len = 0.05) {
    const s = ac.createBufferSource(); s.buffer = nb;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ac.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, hash(t * 1000, 5) * 0.5); s.stop(t + len + 0.02);
  },
  reverb(ac, out, sec = 2.2, mix = 0.25) {
    const conv = ac.createConvolver();
    const len = Math.floor(ac.sampleRate * sec);
    const b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (hash(i, c + 11) * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    conv.buffer = b;
    const wet = ac.createGain(); wet.gain.value = mix;
    const input = ac.createGain();
    input.connect(out); input.connect(conv); conv.connect(wet); wet.connect(out);
    return input;
  },
};

async function renderSound(seconds, build) {
  const sr = 44100;
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ac = new AC(2, Math.ceil(sr * seconds), sr);
  const master = ac.createGain(); master.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor();
  master.connect(comp); comp.connect(ac.destination);
  build(ac, master);
  const buf = await ac.startRendering();
  return encodeWav(buf);
}

/* Müzik: akor yürüyüşü + davul + bas + melodi */
function makeSong(o) {
  const beat = 60 / o.bpm, bar = beat * 4;
  const bars = o.bars, total = bars * bar + 2.5;
  return renderSound(total, (ac, master) => {
    const nb = Synth.noise(ac, 2);
    const rv = Synth.reverb(ac, master, 2.5, o.wet ?? 0.3);
    for (let b = 0; b < bars; b++) {
      const chord = o.chords[b % o.chords.length];
      const t0 = b * bar;
      const fadeOutBar = b === bars - 1;
      // pad / akorlar
      if (o.pad) for (const n of chord) {
        Synth.tone(ac, rv, mtof(n), t0, bar * 0.98, { type: o.pad, v: 0.045, a: o.padA ?? 0.4, r: 0.8, cutoff: o.padCut ?? 1400, detune: (hash(n, b) - 0.5) * 12 });
      }
      // piyano tarzı arpej
      if (o.piano) for (let i = 0; i < 8; i++) {
        const n = chord[[0, 1, 2, 3, 2, 1, 2, 3][i] % chord.length] + 12;
        Synth.tone(ac, rv, mtof(n), t0 + i * beat / 2, 0.05, { type: 'sine', v: 0.12, a: 0.005, r: 1.1 });
        Synth.tone(ac, rv, mtof(n) * 2, t0 + i * beat / 2, 0.03, { type: 'sine', v: 0.03, a: 0.005, r: 0.5 });
      }
      // arp (16'lık)
      if (o.arp) for (let i = 0; i < 16; i++) {
        const n = chord[i % chord.length] + 12 + (i % 8 >= 4 ? 12 : 0);
        Synth.tone(ac, rv, mtof(n), t0 + i * beat / 4, beat / 8, { type: o.arp, v: 0.05, a: 0.003, r: 0.08, cutoff: 3000 });
      }
      // bas
      if (o.bass) {
        const root = chord[0] - 12;
        const pattern = o.bassPattern || [0, 2];
        for (const p of pattern) Synth.tone(ac, master, mtof(root), t0 + p * beat, beat * (o.bassLen || 0.9), { type: o.bass, v: 0.2, a: 0.01, r: 0.1, cutoff: 600 });
      }
      // melodi (pentatonik, deterministik)
      if (o.melody && b % 8 >= 4 - (o.melodyAll ? 4 : 0)) {
        const scale = o.scale;
        for (let i = 0; i < 8; i++) {
          if (hash(b * 31 + i, o.seed) < 0.35) continue;
          const n = scale[Math.floor(hash(b * 17 + i, o.seed + 1) * scale.length)];
          Synth.tone(ac, rv, mtof(n), t0 + i * beat / 2, beat * 0.4, { type: o.melody, v: 0.07, a: 0.01, r: 0.3, cutoff: 2500 });
        }
      }
      // davul
      if (o.drums && !(fadeOutBar && o.dropLast)) {
        for (let i = 0; i < 16; i++) {
          const t = t0 + i * beat / 4 + (i % 2 ? (o.swing || 0) * beat / 4 : 0);
          if (o.drums.k[i] === 'x') Synth.kick(ac, master, t, 0.8);
          if (o.drums.s[i] === 'x') Synth.snare(ac, master, t, nb, 0.28);
          if (o.drums.h[i] === 'x') Synth.hat(ac, master, t, nb, 0.08);
        }
      }
      if (o.drone && b % 2 === 0) Synth.tone(ac, rv, mtof(o.drone), t0, bar * 2, { type: 'sawtooth', v: 0.05, a: 1, r: 1, cutoff: 400 + 300 * (b % 4) });
      if (o.pulse) for (let i = 0; i < 4; i++) Synth.tone(ac, master, mtof(o.pulse), t0 + i * beat, 0.08, { type: 'square', v: 0.05, r: 0.15, cutoff: 900 });
    }
  });
}

const MUSIC = [
  { id: 'lofi', name: 'Lo-fi Sakin', desc: '80 BPM · rahat', make: () => makeSong({ bpm: 80, bars: 12, chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], pad: 'triangle', padCut: 1100, bass: 'sine', melody: 'sine', scale: [72, 74, 76, 79, 81, 84], seed: 3, swing: 0.25, drums: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, wet: 0.35 }) },
  { id: 'pop', name: 'Enerjik Pop', desc: '120 BPM · hareketli', make: () => makeSong({ bpm: 120, bars: 16, chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], pad: 'sawtooth', padCut: 1800, padA: 0.05, arp: 'square', bass: 'sawtooth', bassPattern: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], bassLen: 0.4, melody: 'triangle', melodyAll: true, scale: [72, 74, 76, 79, 81], seed: 9, drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' }, wet: 0.2 }) },
  { id: 'piano', name: 'Duygusal Piyano', desc: '70 BPM · duygusal', make: () => makeSong({ bpm: 70, bars: 8, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], pad: 'sine', padCut: 900, padA: 1, piano: true, bass: 'sine', bassPattern: [0], bassLen: 3.5, wet: 0.45 }) },
  { id: 'synth', name: 'Synthwave', desc: '100 BPM · retro', make: () => makeSong({ bpm: 100, bars: 16, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], pad: 'sawtooth', padCut: 2200, padA: 0.2, arp: 'sawtooth', bass: 'square', bassPattern: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], bassLen: 0.35, drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, wet: 0.35 }) },
  { id: 'tense', name: 'Gerilim', desc: '95 BPM · gizemli', make: () => makeSong({ bpm: 95, bars: 12, chords: [[50, 53, 57], [50, 53, 58], [50, 53, 57], [49, 53, 56]], pad: 'triangle', padCut: 700, padA: 1.5, drone: 38, pulse: 38, drums: { k: 'x.........x.....', s: '................', h: '..x...x...x...x.' }, wet: 0.5 }) },
  { id: 'happy', name: 'Mutlu Gün', desc: '115 BPM · neşeli', make: () => makeSong({ bpm: 115, bars: 16, chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], piano: true, bass: 'triangle', bassPattern: [0, 1.5, 2, 3], bassLen: 0.4, melody: 'square', melodyAll: true, scale: [72, 74, 76, 79, 81, 84], seed: 21, drums: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' }, wet: 0.2 }) },
];

const SFX = [
  { id: 'whoosh', name: 'Vuuş', make: () => renderSound(1.0, (ac, out) => {
    const s = ac.createBufferSource(); s.buffer = Synth.noise(ac, 1);
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(3500, 0.45); f.frequency.exponentialRampToValueAtTime(400, 0.95);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(1.2, 0.4); g.gain.exponentialRampToValueAtTime(0.0001, 0.95);
    s.connect(f); f.connect(g); g.connect(out); s.start(0);
  }) },
  { id: 'pop', name: 'Pop', make: () => renderSound(0.3, (ac, out) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(900, 0); o.frequency.exponentialRampToValueAtTime(180, 0.12);
    g.gain.setValueAtTime(0.8, 0); g.gain.exponentialRampToValueAtTime(0.0001, 0.18);
    o.connect(g); g.connect(out); o.start(0); o.stop(0.25);
  }) },
  { id: 'ding', name: 'Ding', make: () => renderSound(2, (ac, out) => {
    [[1320, 0.4], [2640, 0.15], [3960, 0.08], [1980, 0.1]].forEach(([f, v]) => Synth.tone(ac, out, f, 0, 0.01, { type: 'sine', v, a: 0.002, r: 1.8 }));
  }) },
  { id: 'success', name: 'Başarı', make: () => renderSound(1.6, (ac, out) => {
    [72, 76, 79, 84].forEach((n, i) => Synth.tone(ac, out, mtof(n), i * 0.11, 0.08, { type: 'square', v: 0.12, r: 0.5, cutoff: 3000 }));
  }) },
  { id: 'error', name: 'Hata', make: () => renderSound(0.7, (ac, out) => {
    [0, 0.22].forEach(t => Synth.tone(ac, out, 140, t, 0.16, { type: 'square', v: 0.25, r: 0.05, cutoff: 1200 }));
  }) },
  { id: 'notify', name: 'Bildirim', make: () => renderSound(1, (ac, out) => {
    Synth.tone(ac, out, mtof(81), 0, 0.06, { type: 'sine', v: 0.4, r: 0.4 });
    Synth.tone(ac, out, mtof(88), 0.12, 0.06, { type: 'sine', v: 0.4, r: 0.6 });
  }) },
  { id: 'boom', name: 'Bum', make: () => renderSound(2, (ac, out) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(90, 0); o.frequency.exponentialRampToValueAtTime(28, 1.5);
    g.gain.setValueAtTime(1, 0); g.gain.exponentialRampToValueAtTime(0.0001, 1.8);
    o.connect(g); g.connect(out); o.start(0); o.stop(1.9);
    const s = ac.createBufferSource(); s.buffer = Synth.noise(ac, 1);
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g2 = ac.createGain(); g2.gain.setValueAtTime(0.8, 0); g2.gain.exponentialRampToValueAtTime(0.0001, 0.8);
    s.connect(f); f.connect(g2); g2.connect(out); s.start(0);
  }) },
  { id: 'riser', name: 'Yükseliş', make: () => renderSound(2.5, (ac, out) => {
    const s = ac.createBufferSource(); s.buffer = Synth.noise(ac, 2.5);
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(200, 0); f.frequency.exponentialRampToValueAtTime(8000, 2.3);
    const g = ac.createGain(); g.gain.setValueAtTime(0.05, 0); g.gain.exponentialRampToValueAtTime(1.5, 2.2); g.gain.exponentialRampToValueAtTime(0.0001, 2.45);
    s.connect(f); f.connect(g); g.connect(out); s.start(0);
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(880, 2.3);
    const g2 = ac.createGain(); g2.gain.setValueAtTime(0.0001, 0); g2.gain.exponentialRampToValueAtTime(0.08, 2.2); g2.gain.exponentialRampToValueAtTime(0.0001, 2.45);
    o.connect(g2); g2.connect(out); o.start(0); o.stop(2.5);
  }) },
  { id: 'click', name: 'Tık', make: () => renderSound(0.2, (ac, out) => Synth.hat(ac, out, 0, Synth.noise(ac, 0.5), 0.9, 0.03)) },
  { id: 'shutter', name: 'Deklanşör', make: () => renderSound(0.5, (ac, out) => {
    const nb = Synth.noise(ac, 0.5);
    Synth.snare(ac, out, 0, nb, 0.7); Synth.hat(ac, out, 0.09, nb, 0.6, 0.06);
  }) },
  { id: 'heart', name: 'Kalp atışı', make: () => renderSound(1.4, (ac, out) => {
    [0, 0.28].forEach(t => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3); });
  }) },
  { id: 'type', name: 'Daktilo', make: () => renderSound(2, (ac, out) => {
    const nb = Synth.noise(ac, 1);
    for (let i = 0; i < 12; i++) Synth.hat(ac, out, i * 0.14 + hash(i, 2) * 0.05, nb, 0.7, 0.025);
    Synth.tone(ac, out, 2400, 1.8, 0.01, { type: 'sine', v: 0.3, r: 0.3 });
  }) },
  { id: 'laugh', name: 'Boing', make: () => renderSound(0.8, (ac, out) => {
    const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, 0); o.frequency.exponentialRampToValueAtTime(600, 0.6);
    lfo.frequency.value = 18; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.5, 0); g.gain.exponentialRampToValueAtTime(0.0001, 0.7);
    o.connect(g); g.connect(out); o.start(0); lfo.start(0); o.stop(0.75); lfo.stop(0.75);
  }) },
  { id: 'coin', name: 'Para', make: () => renderSound(0.8, (ac, out) => {
    Synth.tone(ac, out, mtof(83), 0, 0.07, { type: 'square', v: 0.15, r: 0.02, cutoff: 5000 });
    Synth.tone(ac, out, mtof(88), 0.07, 0.25, { type: 'square', v: 0.15, r: 0.3, cutoff: 5000 });
  }) },
];
