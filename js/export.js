'use strict';
/* Dışa aktarma: tuval + ses gerçek zamanlı kaydedilir (MediaRecorder) */

const Exporter = {
  running: false,
  cancelled: false,
  finish: null,

  pickMime() {
    const list = [
      ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
      ['video/mp4', 'mp4'],
      ['video/webm;codecs=vp9,opus', 'webm'],
      ['video/webm;codecs=vp8,opus', 'webm'],
      ['video/webm', 'webm'],
    ];
    for (const [m, ext] of list) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return { mime: m, ext };
    return null;
  },

  open() {
    if (projectDuration() <= 0) return toast('Önce zaman çizelgesine bir şey ekle');
    const modal = $('#exportModal');
    const fmt = this.pickMime();
    $('#exFormat').textContent = fmt ? fmt.ext.toUpperCase() : 'desteklenmiyor';
    $('#exName').value = state.project.name || 'video';
    $('#exDuration').textContent = fmtTime(projectDuration());
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
    const fmt = this.pickMime();
    const canvas = Engine.canvas;
    if (!fmt || !canvas.captureStream) return toast('Bu tarayıcı video kaydını desteklemiyor. Chrome veya Edge kullan.', 'err');
    const res = parseInt($('#exRes').value, 10);
    const fps = parseInt($('#exFps').value, 10);
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
    const pixels = Engine.W * Engine.H;
    const rec = new MediaRecorder(new MediaStream(tracks), {
      mimeType: fmt.mime,
      videoBitsPerSecond: Math.round(pixels * fps * 0.17),
      audioBitsPerSecond: 192000,
    });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
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
