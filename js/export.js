'use strict';
/* Dışa aktarma: tuval + ses gerçek zamanlı kaydedilir (MediaRecorder) */

const Exporter = {
  running: false,
  cancelled: false,
  finish: null,

  formats() {
    const list = [
      ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
      ['video/mp4', 'mp4'],
      ['video/webm;codecs=vp9,opus', 'webm'],
      ['video/webm;codecs=vp8,opus', 'webm'],
      ['video/webm', 'webm'],
    ];
    const out = {};
    if (!window.MediaRecorder) return out;
    for (const [m, ext] of list) if (!out[ext] && MediaRecorder.isTypeSupported(m)) out[ext] = { mime: m, ext };
    return out;
  },
  pickMime(ext) {
    const f = this.formats();
    return f[ext] || f.mp4 || f.webm || null;
  },

  QUALITY: { low: [0.05, 96000], medium: [0.09, 128000], high: [0.16, 192000], max: [0.28, 256000] },

  /* Seçilen ayarlara göre bit hızlarını ve tahmini boyutu hesaplar */
  plan() {
    const res = parseInt($('#exRes').value, 10);
    const fps = parseInt($('#exFps').value, 10);
    const q = $('#exQuality').value;
    const dur = Math.max(0.1, projectDuration());
    const [W, H] = Engine.size(res);
    let vbps, abps;
    if (q === 'target') {
      const mb = Math.max(1, parseFloat($('#exTarget').value) || 16);
      abps = 128000;
      // %4 kapsayıcı payı bırak
      vbps = Math.max(250000, (mb * 1048576 * 8 * 0.96) / dur - abps);
    } else {
      const [k, a] = this.QUALITY[q];
      vbps = W * H * fps * k;
      abps = a;
    }
    vbps = Math.round(Math.min(vbps, 80e6));
    const bytes = (vbps + abps) * dur / 8;
    return { res, fps, W, H, vbps, abps, bytes, dur, q };
  },

  updateEstimate() {
    const p = this.plan();
    $('#exTargetRow').classList.toggle('hidden', p.q !== 'target');
    const mb = p.bytes / 1048576;
    const sizeTxt = mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb >= 10 ? Math.round(mb) + ' MB' : mb.toFixed(1) + ' MB';
    const lowWarn = p.q === 'target' && p.vbps / (p.W * p.H * p.fps) < 0.03;
    const share = mb <= 16 ? 'WhatsApp\'a sığar' : mb <= 25 ? 'E-postaya sığar' : mb <= 100 ? 'Discord Nitro / Telegram' : '';
    $('#exEstimate').innerHTML = `
      <div class="est-main"><span>Tahmini dosya boyutu</span><b>≈ ${sizeTxt}</b></div>
      <div class="est-grid">
        <span>Çözünürlük</span><b>${p.W} × ${p.H}</b>
        <span>Video bit hızı</span><b>${(p.vbps / 1e6).toFixed(1)} Mbps</b>
        <span>Ses</span><b>${Math.round(p.abps / 1000)} kbps</b>
        <span>Video süresi</span><b>${fmtTime(p.dur)}</b>
        <span>Aktarım süresi</span><b>≈ ${fmtShort(p.dur + 1)}</b>
      </div>
      ${share ? `<div class="est-tag">✓ ${share}</div>` : ''}
      ${lowWarn ? '<div class="est-warn">Bu boyut için kalite düşük olabilir. Çözünürlüğü azaltmak görüntüyü daha net yapar.</div>' : ''}
      <div class="est-note">Hareketsiz sahnelerde dosya daha küçük çıkabilir.</div>`;
  },

  open() {
    if (projectDuration() <= 0) return toast('Önce zaman çizelgesine bir şey ekle');
    const modal = $('#exportModal');
    const fm = this.formats();
    const sel = $('#exFormatSel');
    const prev = sel.value;
    sel.innerHTML = '';
    if (fm.mp4) sel.appendChild(h('option', { value: 'mp4' }, 'MP4 (her yerde açılır)'));
    if (fm.webm) sel.appendChild(h('option', { value: 'webm' }, 'WebM'));
    if (!sel.options.length) sel.appendChild(h('option', { value: '' }, 'desteklenmiyor'));
    if (prev && fm[prev]) sel.value = prev;
    $('#exName').value = state.project.name || 'video';
    if (!this.bound) {
      this.bound = true;
      for (const id of ['#exRes', '#exFps', '#exQuality', '#exTarget', '#exFormatSel']) {
        $(id).addEventListener('input', () => this.updateEstimate());
        $(id).addEventListener('change', () => this.updateEstimate());
      }
    }
    this.updateEstimate();
    $('#exOptions').classList.remove('hidden');
    $('#exProgress').classList.add('hidden');
    $('#exDone').classList.add('hidden');
    modal.classList.remove('hidden');
  },
  close() {
    if (this.running) { this.cancel(); return; }
    $('#exportModal').classList.add('hidden');
  },
  cancel() {
    this.cancelled = true;
    if (this.finish) this.finish();
  },

  async start() {
    const fmt = this.pickMime($('#exFormatSel').value);
    const plan = this.plan();
    const canvas = Engine.canvas;
    if (!fmt || !canvas.captureStream) return toast('Bu tarayıcı video kaydını desteklemiyor. Chrome veya Edge kullan.', 'err');
    const { res, fps } = plan;
    const name = ($('#exName').value || 'video').replace(/[\\/:*?"<>|]+/g, '_');
    const prevRes = state.project.res;

    $('#exOptions').classList.add('hidden');
    $('#exProgress').classList.remove('hidden');
    const bar = $('#exBar'), pct = $('#exPct');
    bar.style.width = '0%'; pct.textContent = '0%';

    this.running = true; this.cancelled = false;
    Engine.pause();
    state.project.res = res;
    Engine.resize();
    Engine.ensureAudio();
    if (Engine.ac && Engine.ac.state === 'suspended') await Engine.ac.resume();
    state.exporting = true;
    document.body.classList.add('exporting');
    Engine.seek(0);
    // tüm kliplerin ilk karelerinin yüklenmesi için kısa bekleme
    await wait(800);

    const vs = canvas.captureStream(fps);
    const tracks = [...vs.getVideoTracks()];
    if (Engine.recDest) tracks.push(...Engine.recDest.stream.getAudioTracks());
    const rec = new MediaRecorder(new MediaStream(tracks), {
      mimeType: fmt.mime,
      videoBitsPerSecond: plan.vbps,
      audioBitsPerSecond: plan.abps,
    });
    const chunks = [];
    let written = 0;
    rec.ondataavailable = e => { if (e.data && e.data.size) { chunks.push(e.data); written += e.data.size; } };
    const stopped = new Promise(r => { rec.onstop = r; });
    const monitorOn = $('#exMonitor').checked;
    if (Engine.monitor) Engine.monitor.gain.value = monitorOn ? 1 : 0;

    const total = projectDuration();
    const done = new Promise(r => { this.finish = r; });
    const prevEnd = Engine.onEnd;
    Engine.onEnd = () => this.finish && this.finish();
    const prog = setInterval(() => {
      const p = clamp(state.time / total, 0, 1);
      bar.style.width = (p * 100).toFixed(1) + '%';
      pct.textContent = Math.floor(p * 100) + '%';
      $('#exTime').textContent = `${fmtTime(state.time)} / ${fmtTime(total)}`;
      $('#exSize').textContent = `Şu ana kadar ${(written / 1048576).toFixed(1)} MB · tahmini toplam ≈ ${(plan.bytes / 1048576).toFixed(1)} MB`;
    }, 200);

    rec.start(500);
    Engine.play();
    await done;
    await wait(250);
    clearInterval(prog);
    Engine.onEnd = prevEnd;
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    Engine.pause();
    tracks.forEach(t => { if (t.kind === 'video') t.stop(); });
    if (Engine.monitor) Engine.monitor.gain.value = 1;
    state.exporting = false;
    document.body.classList.remove('exporting');
    state.project.res = prevRes;
    Engine.resize();
    this.running = false;
    this.finish = null;

    if (this.cancelled) {
      $('#exportModal').classList.add('hidden');
      toast('Dışa aktarma iptal edildi');
      return;
    }
    const blob = new Blob(chunks, { type: fmt.mime.split(';')[0] });
    const url = URL.createObjectURL(blob);
    const file = `${name}.${fmt.ext}`;
    const a = $('#exLink');
    a.href = url; a.download = file;
    $('#exFile').textContent = `${file} · ${(blob.size / 1048576).toFixed(1)} MB`;
    $('#exPreview').src = url;
    $('#exProgress').classList.add('hidden');
    $('#exDone').classList.remove('hidden');
    a.click();
  },
};
