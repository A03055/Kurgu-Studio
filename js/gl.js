'use strict';
/* WebGL ile klip işleme: yeşil ekran (chroma key) ve renk düzeltme (sıcaklık, ton, gölgeler, parlak alanlar, canlılık) */

const GLFX = {
  canvas: null, gl: null, prog: null, loc: {}, tex: null, failed: false,

  init() {
    if (this.gl || this.failed) return !!this.gl;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true });
      if (!gl) throw new Error('WebGL yok');
      const vs = `attribute vec2 p; varying vec2 v; void main(){ v = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }`;
      const fs = `
        precision mediump float;
        varying vec2 v;
        uniform sampler2D t;
        uniform vec3 key; uniform float keyOn, sim, smooth, spill;
        uniform float temp, tint, shadows, highlights, vib;
        vec2 uv(vec3 c){ return vec2(dot(c, vec3(-.169, -.331, .5)), dot(c, vec3(.5, -.419, -.081))); }
        void main(){
          vec4 s = texture2D(t, v);
          vec3 col = s.rgb; float a = s.a;
          if (keyOn > .5) {
            float d = distance(uv(col), uv(key));
            a *= smoothstep(sim, sim + smooth + .0001, d);
            float sp = pow(clamp((d - sim) / max(spill, .001), 0., 1.), 1.5);
            col = mix(vec3(dot(col, vec3(.2126, .7152, .0722))), col, sp);
          }
          col.r += temp * .12; col.b -= temp * .12; col.g += tint * .1;
          float l = dot(col, vec3(.2126, .7152, .0722));
          col += shadows * .3 * (1. - smoothstep(0., .55, l));
          col += highlights * .3 * smoothstep(.45, 1., l);
          float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
          col = mix(vec3(l), col, 1. + vib * (1. - (mx - mn)));
          gl_FragColor = vec4(clamp(col, 0., 1.), a);
        }`;
      const sh = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const pl = gl.getAttribLocation(pr, 'p');
      gl.enableVertexAttribArray(pl);
      gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
      for (const n of ['t', 'key', 'keyOn', 'sim', 'smooth', 'spill', 'temp', 'tint', 'shadows', 'highlights', 'vib']) this.loc[n] = gl.getUniformLocation(pr, n);
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.canvas = c; this.gl = gl; this.prog = pr;
      return true;
    } catch (e) {
      console.warn('WebGL kullanılamıyor:', e);
      this.failed = true;
      return false;
    }
  },

  needed(c) {
    const k = c.key, g = c.grade;
    return (k && k.on) || (g && (g.temp || g.tint || g.shadows || g.highlights || g.vibrance));
  },

  /* Kaynağı işler ve işlenmiş tuvali döndürür (hemen çizilmeli; bir sonraki çağrı üzerine yazar) */
  process(src, sw, sh, c) {
    if (!this.init()) return src;
    const gl = this.gl;
    const s = Math.min(1, 2048 / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * s)), hgt = Math.max(1, Math.round(sh * s));
    if (this.canvas.width !== w || this.canvas.height !== hgt) { this.canvas.width = w; this.canvas.height = hgt; }
    gl.viewport(0, 0, w, hgt);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (e) { return src; }
    const k = c.key || DEFAULT_KEY, g = c.grade || DEFAULT_GRADE;
    const n = parseInt((k.color || '#00ff00').slice(1), 16);
    gl.uniform1i(this.loc.t, 0);
    gl.uniform3f(this.loc.key, ((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
    gl.uniform1f(this.loc.keyOn, k.on ? 1 : 0);
    gl.uniform1f(this.loc.sim, k.sim);
    gl.uniform1f(this.loc.smooth, k.smooth);
    gl.uniform1f(this.loc.spill, k.spill);
    gl.uniform1f(this.loc.temp, g.temp || 0);
    gl.uniform1f(this.loc.tint, g.tint || 0);
    gl.uniform1f(this.loc.shadows, g.shadows || 0);
    gl.uniform1f(this.loc.highlights, g.highlights || 0);
    gl.uniform1f(this.loc.vib, g.vibrance || 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  },

  /* Önizlemede tıklanan noktanın rengini alır (yeşil ekran damlalığı) */
  pickColor(src, sw, sh, u, v) {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const x = c.getContext('2d');
    x.drawImage(src, clamp(u, 0, 1) * sw, clamp(v, 0, 1) * sh, 1, 1, 0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map(n => n.toString(16).padStart(2, '0')).join('');
  },
};
