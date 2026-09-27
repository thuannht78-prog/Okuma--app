/* Mô phỏng tiện 3D (WebGL1, không thư viện ngoài).
 * Phôi là khối tròn xoay, bóc theo đúng đường dao buildToolpath().
 * Rãnh, cắt đứt, khoan/tiện trong, ren và dao động lực là ước lượng.
 * Không thay chạy thử không phôi trên máy. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const NZ = 96, NR = 40, MAXV = 110000;
  let segCount = 96;
  const COL = {
    stock: [0.62, 0.66, 0.71],
    cut: [0.50, 0.56, 0.62],
    chuck: [0.36, 0.42, 0.47],
    jaw: [0.26, 0.30, 0.35],
    tail: [0.36, 0.42, 0.47],
    insert: [0.90, 0.76, 0.20],
    tip: [0.90, 0.76, 0.20],
    holder: [0.22, 0.28, 0.33],
    feed: [0.12, 0.48, 0.94],
    rapid: [0.98, 0.48, 0.05],
    hole: [0.16, 0.18, 0.20],
    thread: [0.32, 0.36, 0.40],
    slot: [0.20, 0.24, 0.22],
    bg: [0.905, 0.933, 0.957]
  };
  const num = (v, d) => (v === '' || v == null || isNaN(Number(v))) ? d : Number(v);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function ident() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }
  function mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function trans(x, y, z) { const m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function rotX(a) {
    const c = Math.cos(a), s = Math.sin(a), m = ident();
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return m;
  }
  function persp(fovy, aspect, n, f) {
    const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = (2 * f * n) / (n - f);
    return m;
  }
  function look(eye, tgt, up) {
    let zx = eye[0] - tgt[0], zy = eye[1] - tgt[1], zz = eye[2] - tgt[2];
    let zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    let xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    const m = new Float32Array(16);
    m[0] = xx; m[1] = yx; m[2] = zx;
    m[4] = xy; m[5] = yy; m[6] = zy;
    m[8] = xz; m[9] = yz; m[10] = zz;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    m[15] = 1;
    return m;
  }

  const VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aNrm;',
    'uniform mat4 uM;',
    'uniform mat4 uVP;',
    'varying vec3 vN;',
    'varying vec3 vM;',
    'void main(){',
    '  vM=aPos;',
    '  vec4 w=uM*vec4(aPos,1.0);',
    '  vN=mat3(uM)*aNrm;',
    '  gl_Position=uVP*w;',
    '}'
  ].join('');
  const FS = [
    'precision mediump float;',
    'varying vec3 vN; varying vec3 vM;',
    'uniform vec3 uColor; uniform vec4 uPack;',
    'uniform vec4 uF0; uniform vec4 uF1;',
    'uniform vec4 uH0; uniform vec4 uH1; uniform vec4 uH2; uniform vec4 uH3; uniform vec4 uHm;',
    'uniform vec4 uR0; uniform vec4 uR1; uniform vec4 uR2; uniform vec4 uR3; uniform vec4 uRs;',
    'bool flatCut(vec4 f){',
    '  float ny=sin(f.x), nz=cos(f.x);',
    '  float z0=min(f.z,f.w), z1=max(f.z,f.w);',
    '  return vM.x>z0 && vM.x<z1 && (vM.y*ny+vM.z*nz)>f.y+0.03;',
    '}',
    'bool axHole(vec4 h, float mouth){',
    '  if(h.w<0.05||h.z<0.05) return false;',
    '  float dy=vM.y-h.x, dz=vM.z-h.y;',
    '  return vM.x<=mouth+0.08 && vM.x>=mouth-h.w && dy*dy+dz*dz<=h.z*h.z;',
    '}',
    'bool rdHole(vec4 h, float rs){',
    '  if(h.w<0.05||h.z<0.05||rs<0.2) return false;',
    '  float ny=sin(h.y), nz=cos(h.y);',
    '  float px=vM.x-h.x, py=vM.y-ny*rs, pz=vM.z-nz*rs;',
    '  float along=-(py*ny+pz*nz);',
    '  float ry=py-(-ny)*along, rz=pz-(-nz)*along;',
    '  return along>=-0.08 && along<=h.w && px*px+ry*ry+rz*rz<=h.z*h.z;',
    '}',
    'void main(){',
    '  if(uPack.x>0.5){',
    '    if(uPack.y>0.5 && flatCut(uF0)) discard;',
    '    if(uPack.y>1.5 && flatCut(uF1)) discard;',
    '    if(uPack.z>0.5 && axHole(uH0,uHm.x)) discard;',
    '    if(uPack.z>1.5 && axHole(uH1,uHm.y)) discard;',
    '    if(uPack.z>2.5 && axHole(uH2,uHm.z)) discard;',
    '    if(uPack.z>3.5 && axHole(uH3,uHm.w)) discard;',
    '    if(uPack.w>0.5 && rdHole(uR0,uRs.x)) discard;',
    '    if(uPack.w>1.5 && rdHole(uR1,uRs.y)) discard;',
    '    if(uPack.w>2.5 && rdHole(uR2,uRs.z)) discard;',
    '    if(uPack.w>3.5 && rdHole(uR3,uRs.w)) discard;',
    '  }',
    '  vec3 n=normalize(vN);',
    '  float L=abs(dot(n,normalize(vec3(0.30,0.78,0.52))))*0.55;',
    '  float L2=abs(dot(n,normalize(vec3(-0.45,0.18,0.28))))*0.18;',
    '  gl_FragColor=vec4(uColor*(0.34+L+L2),1.0);',
    '}'
  ].join('');
  const LVS = [
    'attribute vec3 aFrom; attribute vec3 aTo; attribute float aSide; attribute float aEnd;',
    'uniform mat4 uM; uniform mat4 uVP; uniform vec2 uRes; uniform float uPx;',
    'varying float vLift;',
    'void main(){',
    '  vec4 c0=uVP*uM*vec4(aFrom,1.0);',
    '  vec4 c1=uVP*uM*vec4(aTo,1.0);',
    '  vec2 s0=c0.xy/max(c0.w,0.0001);',
    '  vec2 s1=c1.xy/max(c1.w,0.0001);',
    '  vec2 d=s1-s0;',
    '  float len=length(d);',
    '  vec2 dir=len<1e-5?vec2(1.0,0.0):d/len;',
    '  vec2 nrm=vec2(-dir.y,dir.x);',
    '  vec4 c=aEnd<0.5?c0:c1;',
    '  c.xy+=nrm*aSide*(uPx/max(uRes.y,1.0))*c.w;',
    '  gl_Position=c;',
    '  vLift=aFrom.z;',
    '}'
  ].join('');
  const LFS = [
    'precision mediump float;',
    'varying float vLift;',
    'uniform vec3 uRapid; uniform vec3 uFeed; uniform float uAlpha; uniform float uDash;',
    'void main(){',
    '  bool rapid=vLift<0.7;',
    '  if(rapid && uDash>0.5 && fract((gl_FragCoord.x+gl_FragCoord.y)/uDash)>0.48) discard;',
    '  gl_FragColor=vec4(rapid?uRapid:uFeed, uAlpha);',
    '}'
  ].join('');

  let canvas = null, gl = null, prog = null, buf = null, lprog = null, lbuf = null, raf = 0, lastT = 0;
  let locs = null, llocs = null, failed = '', verts = 0, builtKey = '';
  let showPath = true, linePx = 1.25;
  let playing = false, cutting = false, liveLock = false, section = false, spin = 0.35;
  let orbitInvert = false;
  const cam = { yaw: 0.82, pitch: 0.36, dist: 180, target: [0, 8, 0], user: false };
  let scene = null, cuts = null;
  const ptrs = new Map();
  let gesture = null;
  function blockScroll(e) { if (e.cancelable) e.preventDefault(); }
  function drive(pts, pan) {
    if (!pts.length) return;
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      if (!gesture || gesture.mode !== 'pinch') gesture = { mode: 'pinch', d: dist, x: mx, y: my };
      else {
        const scale = gesture.d / dist;
        if (scale > 0.25 && scale < 4) cam.dist = clamp(cam.dist * scale, 28, 980);
        const pdx = mx - gesture.x, pdy = my - gesture.y;
        if (Math.abs(pdx) + Math.abs(pdy) < 180) panPixels(pdx, pdy);
        gesture.d = dist; gesture.x = mx; gesture.y = my;
      }
      cam.user = true;
      return;
    }
    const p = pts[0];
    if (!gesture || gesture.mode !== 'one') gesture = { mode: 'one', x: p.x, y: p.y };
    else {
      const dx = p.x - gesture.x, dy = p.y - gesture.y;
      gesture.x = p.x; gesture.y = p.y;
      if (!dx && !dy) return;
      if (Math.abs(dx) + Math.abs(dy) > 180) return;
      if (pan) panPixels(dx, dy);
      else {
        const s = orbitInvert ? 1 : -1;
        cam.yaw += dx * 0.01 * s;
        cam.pitch = clamp(cam.pitch - dy * 0.01 * s, -1.2, 1.2);
      }
    }
    cam.user = true;
  }
  const onDown = e => {
    if (!canvas || e.pointerType === 'touch') return;
    if (e.pointerType === 'mouse' && e.button > 2) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* bỏ */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 1 || e.button === 2 });
    if (ptrs.size >= 2) {
      const pts = [...ptrs.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      gesture = { mode: 'pinch', d: dist, x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    } else gesture = { mode: 'one', x: e.clientX, y: e.clientY };
    blockScroll(e);
  };
  const onUp = e => { if (e.pointerType === 'touch') return; ptrs.delete(e.pointerId); gesture = null; };
  const onMove = e => {
    if (e.pointerType === 'touch') return;
    const rec = ptrs.get(e.pointerId);
    if (!rec) return;
    rec.x = e.clientX;
    rec.y = e.clientY;
    blockScroll(e);
    const pan = !!(e.shiftKey || (e.buttons & 2) || (e.buttons & 4) || rec.pan);
    drive([...ptrs.values()], pan);
  };
  const onTouchStart = e => {
    blockScroll(e);
    const pts = [...e.touches].map(t => ({ x: t.clientX, y: t.clientY }));
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      gesture = { mode: 'pinch', d: dist, x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    } else if (pts.length === 1) gesture = { mode: 'one', x: pts[0].x, y: pts[0].y };
  };
  const onTouchMove = e => {
    blockScroll(e);
    drive([...e.touches].map(t => ({ x: t.clientX, y: t.clientY })), false);
  };
  const onTouchEnd = e => { gesture = null; blockScroll(e); };
  const onWheel = e => {
    blockScroll(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 80 : e.deltaY;
    cam.dist = clamp(cam.dist * Math.exp(dy * 0.0011), 28, 980);
    cam.user = true;
  };
  const onMenu = e => e.preventDefault();

  function panPixels(dx, dy) {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const fx = -cp * sy, fy = -sp, fz = -cp * cy;
    let rx = fz, rz = -fx, rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    const k = cam.dist / (canvas && canvas.clientHeight || 400) * 1.15;
    cam.target[0] -= (rx * dx + ux * dy) * k;
    cam.target[1] -= uy * dy * k;
    cam.target[2] -= (rz * dx + uz * dy) * k;
  }

  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      failed = gl.getShaderInfoLog(s) || 'shader';
      gl.deleteShader(s);
      return null;
    }
    return s;
  }
  function initGL() {
    failed = '';
    gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: true, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' })
      || canvas.getContext('experimental-webgl');
    if (!gl) { failed = 'no-webgl'; return false; }
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos'); gl.bindAttribLocation(prog, 1, 'aNrm');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { failed = gl.getProgramInfoLog(prog) || 'link'; return false; }
    locs = {
      uM: gl.getUniformLocation(prog, 'uM'), uVP: gl.getUniformLocation(prog, 'uVP'),
      uColor: gl.getUniformLocation(prog, 'uColor'), uPack: gl.getUniformLocation(prog, 'uPack'),
      uF0: gl.getUniformLocation(prog, 'uF0'), uF1: gl.getUniformLocation(prog, 'uF1'),
      uH0: gl.getUniformLocation(prog, 'uH0'), uH1: gl.getUniformLocation(prog, 'uH1'),
      uH2: gl.getUniformLocation(prog, 'uH2'), uH3: gl.getUniformLocation(prog, 'uH3'),
      uHm: gl.getUniformLocation(prog, 'uHm'),
      uR0: gl.getUniformLocation(prog, 'uR0'), uR1: gl.getUniformLocation(prog, 'uR1'),
      uR2: gl.getUniformLocation(prog, 'uR2'), uR3: gl.getUniformLocation(prog, 'uR3'),
      uRs: gl.getUniformLocation(prog, 'uRs')
    };
    buf = gl.createBuffer();
    const keepFail = failed;
    const lvs = sh(gl.VERTEX_SHADER, LVS), lfs = sh(gl.FRAGMENT_SHADER, LFS);
    failed = keepFail;
    if (lvs && lfs) {
      lprog = gl.createProgram();
      gl.attachShader(lprog, lvs); gl.attachShader(lprog, lfs);
      gl.bindAttribLocation(lprog, 2, 'aFrom'); gl.bindAttribLocation(lprog, 3, 'aTo');
      gl.bindAttribLocation(lprog, 4, 'aSide'); gl.bindAttribLocation(lprog, 5, 'aEnd');
      gl.linkProgram(lprog);
      if (!gl.getProgramParameter(lprog, gl.LINK_STATUS)) { gl.deleteProgram(lprog); lprog = null; }
      else {
        llocs = {
          uM: gl.getUniformLocation(lprog, 'uM'), uVP: gl.getUniformLocation(lprog, 'uVP'),
          uRes: gl.getUniformLocation(lprog, 'uRes'), uPx: gl.getUniformLocation(lprog, 'uPx'),
          uRapid: gl.getUniformLocation(lprog, 'uRapid'), uFeed: gl.getUniformLocation(lprog, 'uFeed'),
          uAlpha: gl.getUniformLocation(lprog, 'uAlpha'), uDash: gl.getUniformLocation(lprog, 'uDash')
        };
        lbuf = gl.createBuffer();
      }
    }
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    return true;
  }

  function showFail() {
    if (!canvas || !failed) return;
    let note = canvas.parentNode && canvas.parentNode.querySelector('.sim3dfail');
    if (!note && canvas.parentNode) {
      note = document.createElement('p');
      note.className = 'hint sim3dfail';
      canvas.insertAdjacentElement('afterend', note);
    }
    if (note) note.textContent = 'Không chạy được mô phỏng 3D trên trình duyệt này (thiếu WebGL). Vẫn xem được mặt cắt 2D.';
  }

  function mount(cv) {
    if (!cv) return;
    if (canvas === cv && gl && !failed) { if (!raf) raf = requestAnimationFrame(frame); return; }
    unmount();
    canvas = cv;
    if (!initGL()) { showFail(); canvas = null; return; }
    const old = cv.parentNode && cv.parentNode.querySelector('.sim3dfail');
    if (old) old.remove();
    cv.addEventListener('pointerdown', onDown, { passive: false });
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointermove', onMove, { passive: false });
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', onMenu);
    cv.addEventListener('touchstart', onTouchStart, { passive: false });
    cv.addEventListener('touchmove', onTouchMove, { passive: false });
    cv.addEventListener('touchend', onTouchEnd, { passive: false });
    cv.addEventListener('touchcancel', onTouchEnd, { passive: false });
    if (root.ResizeObserver) {
      cv._okRo = new root.ResizeObserver(() => resize());
      cv._okRo.observe(cv);
    }
    builtKey = '';
    cam.user = false;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function unmount() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ptrs.clear(); gesture = null;
    if (canvas) {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onMenu);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      if (canvas._okRo) { canvas._okRo.disconnect(); canvas._okRo = null; }
    }
    if (gl) {
      if (buf) gl.deleteBuffer(buf); if (lbuf) gl.deleteBuffer(lbuf);
      if (prog) gl.deleteProgram(prog); if (lprog) gl.deleteProgram(lprog);
      const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    }
    canvas = null; gl = null; prog = null; lprog = null; buf = null; lbuf = null; locs = null; llocs = null; scene = null; builtKey = '';
  }

  function angList(op) {
    const list = String(op.angs || '').split(/[;,\s]+/).map(Number).filter(v => isFinite(v));
    if (list.length) return list;
    const n = Math.max(1, num(op.n, 1)), c0 = num(op.c0, 0), out = [];
    for (let i = 0; i < n; i++) out.push(c0 + 360 * i / n);
    return out;
  }
  function facePts(op) {
    if (op.pos === 'ang') return angList(op).map(a => { const r = num(op.pcd, 0) / 2, t = a * Math.PI / 180; return [r * Math.cos(t), r * Math.sin(t)]; });
    if (op.pos === 'xyc' || op.pos === 'xyy') {
      return String(op.xy || '').split(/[;\n]+/).map(s => s.trim()).filter(Boolean).map(s => {
        const p = s.split(/[,\s]+/).map(Number); return [p[0], p[1]];
      }).filter(p => isFinite(p[0]) && isFinite(p[1]));
    }
    return angList(op).map(a => { const r = num(op.pcd, 0) / 2, t = a * Math.PI / 180; return [r * Math.cos(t), r * Math.sin(t)]; });
  }
  function opFrac(moves, ops, mi, u, i) {
    let n = 0, acc = 0;
    for (let k = 0; k < moves.length; k++) {
      if (moves[k].i !== i || moves[k].kind !== 'feed') continue;
      n++;
      if (k < mi) acc += 1;
      else if (k === mi) {
        const m = moves[k];
        const L = Math.hypot(m.z1 - m.z0, m.r1 - m.r0) || 1;
        acc += clamp(u / L, 0, 1);
      }
    }
    return n ? acc / n : 0;
  }

  function build(model) {
    const moves = model.moves || [];
    const ops = model.ops || [];
    const blank = model.blank || { z0: -80, z1: 0, r: 30 };
    const chuck = model.chuck || { z: blank.z0, jawLen: 18, jawR: blank.r + 12, stockR: blank.r };
    const zLo = blank.z0, zHi = Math.max(blank.z1, zLo + 1), stockR = Math.max(1, blank.r);
    const dz = (zHi - zLo) / NZ, dr = stockR / NR;
    const grid = new Uint8Array(NZ * NR);
    for (let iz = 0; iz < NZ; iz++) {
      const row = iz * NR;
      for (let ir = 0; ir < NR; ir++) grid[row + ir] = 1;
    }
    let sever = null;
    const threadOps = new Map();
    function removeRect(za, zb, ra, rb) {
      if (za > zb) { const t = za; za = zb; zb = t; }
      if (ra > rb) { const t = ra; ra = rb; rb = t; }
      let iz0 = Math.floor((za - zLo) / dz); if (iz0 < 0) iz0 = 0;
      let iz1 = Math.floor(((zb - 1e-4) - zLo) / dz); if (iz1 >= NZ) iz1 = NZ - 1;
      let ir0 = Math.floor(ra / dr); if (ir0 < 0) ir0 = 0;
      let ir1 = Math.floor((rb - 1e-4) / dr); if (ir1 >= NR) ir1 = NR - 1;
      if (iz0 > iz1 || ir0 > ir1) return;
      for (let iz = iz0; iz <= iz1; iz++) {
        const row = iz * NR;
        for (let ir = ir0; ir <= ir1; ir++) grid[row + ir] = 0;
      }
    }
    function sweepOuter(za, ra, zb, rb) {
      if (Math.abs(zb - za) < 0.35) return;
      const iz0 = clamp(Math.floor((Math.min(za, zb) - zLo) / dz), 0, NZ - 1);
      const iz1 = clamp(Math.floor((Math.max(za, zb) - zLo) / dz), 0, NZ - 1);
      for (let iz = iz0; iz <= iz1; iz++) {
        const z = zLo + (iz + 0.5) * dz;
        const t = clamp((z - za) / (zb - za), 0, 1);
        const rCut = ra + (rb - ra) * t;
        const ir0 = clamp(Math.ceil(rCut / dr), 0, NR);
        const row = iz * NR;
        for (let ir = ir0; ir < NR; ir++) grid[row + ir] = 0;
      }
    }
    function sweepInner(za, ra, zb, rb) {
      if (Math.abs(zb - za) < 0.35) return;
      const iz0 = clamp(Math.floor((Math.min(za, zb) - zLo) / dz), 0, NZ - 1);
      const iz1 = clamp(Math.floor((Math.max(za, zb) - zLo) / dz), 0, NZ - 1);
      for (let iz = iz0; iz <= iz1; iz++) {
        const z = zLo + (iz + 0.5) * dz;
        const t = clamp((z - za) / (zb - za), 0, 1);
        const rCut = Math.max(0, ra + (rb - ra) * t);
        const ir1 = clamp(Math.floor(rCut / dr), -1, NR - 1);
        const row = iz * NR;
        for (let ir = 0; ir <= ir1; ir++) grid[row + ir] = 0;
      }
    }
    function apply(op, zA, rA, zB, rB) {
      if (!op) return;
      const t = op.type;
      if (t === 'facing') {
        const zCut = (zA + zB) * 0.5;
        const rTool = Math.max(0, Math.min(rA, rB));
        removeRect(zCut, zHi + dz, 0, stockR + 1);
        removeRect(zCut - dz * 0.6, zCut, rTool, stockR + 1);
        return;
      }
      if (t === 'drill') {
        const tip = Math.min(zA, zB);
        removeRect(tip, zHi + dz, 0, Math.max(0.4, num(op.dia, 5)) / 2);
        return;
      }
      if (t === 'groove' && op.gt === 'face') {
        const zf = num(op.zr, 0), dep = Math.max(0.2, num(op.w, 3));
        const zReach = Math.min(zA, zB);
        const zBot = Math.max(zf - dep, zReach);
        if (zBot < zf - 0.05) removeRect(zBot, zf, Math.min(num(op.d1, 40), num(op.d2, 30)) / 2, Math.max(num(op.d1, 40), num(op.d2, 30)) / 2);
        return;
      }
      if (t === 'groove') {
        const zr = num(op.zr, -10), w = Math.max(0.4, num(op.w, 3));
        const depth = Math.max(0, Math.min(rA, rB));
        removeRect(zr - w, zr, depth, stockR + 1);
        return;
      }
      if (t === 'cutoff') {
        const zz = (zA + zB) * 0.5, depth = Math.max(0, Math.min(rA, rB));
        removeRect(zz - 1.3, zz + 1.3, depth, stockR + 1);
        if (Math.min(rA, rB) < 1.05) sever = zz;
        return;
      }
      if (t === 'thread') {
        const crest = num(op.dia, 20) / 2;
        const rTool = op.side === 'ID' ? Math.max(rA, rB) : Math.min(Math.abs(rA), Math.abs(rB));
        const pitch = Math.max(0.4, num(op.P, 1.5));
        if (op.side === 'ID') sweepInner(zA, Math.max(crest * 0.5, rTool), zB, Math.max(crest * 0.5, rTool));
        else sweepOuter(zA, (crest + rTool) * 0.5, zB, (crest + rTool) * 0.5);
        const zs = num(op.zs, Math.max(zA, zB)), ze = num(op.ze, Math.min(zA, zB));
        threadOps.set(op.id, { z0: Math.max(zLo, Math.min(zs, ze)), z1: Math.min(zHi + 2, Math.max(zs, ze)), r: op.side === 'ID' ? crest : (crest + rTool) * 0.5, pitch, id: op.side === 'ID' });
        return;
      }
      if (t === 'id' || (t === 'thread' && op.side === 'ID')) { sweepInner(zA, rA, zB, rB); return; }
      if (t === 'od') { sweepOuter(zA, rA, zB, rB); return; }
    }
    const mi = model.mi || 0, uu = model.u || 0;
    const lim = Math.min(mi, moves.length);
    for (let k = 0; k < lim; k++) {
      const m = moves[k];
      if (!m || m.kind !== 'feed') continue;
      apply(ops[m.i], m.z0, m.r0, m.z1, m.r1);
    }
    if (mi < moves.length && moves[mi] && moves[mi].kind === 'feed') {
      const m = moves[mi];
      const L = Math.hypot(m.z1 - m.z0, m.r1 - m.r0) || 1;
      const t = clamp(uu / L, 0, 1);
      apply(ops[m.i], m.z0, m.r0, m.z0 + (m.z1 - m.z0) * t, m.r0 + (m.r1 - m.r0) * t);
    }

    const flats = [], axH = [], rdH = [], slots = [], pockets = [];
    ops.forEach((op, i) => {
      if (!op || op.on === false) return;
      const f = opFrac(moves, ops, mi, uu, i);
      if (f <= 0.02) return;
      if (op.type === 'mflat') {
        const R0 = num(op.dia, stockR * 2) / 2;
        const rFlat = Math.max(0.5, R0 - num(op.depth, 1) * f);
        flats.push({ ang: num(op.c, 0) * Math.PI / 180, r: rFlat, z0: Math.min(num(op.z1, 0), num(op.z2, -10)), z1: Math.max(num(op.z1, 0), num(op.z2, -10)), rStock: R0 });
      } else if (op.type === 'lface') {
        const depth = Math.max(0.4, num(op.depth, 8) * f), mouth = num(op.zTop, 0);
        facePts(op).forEach(p => axH.push({ y: p[1], z: p[0], r: 3.4, depth, mouth }));
      } else if (op.type === 'lside') {
        const rSurf = num(op.dia, stockR * 2) / 2, depth = Math.max(0.4, num(op.depth, 6) * f);
        const zs = String(op.zs || '').split(/[;,\s]+/).map(Number).filter(v => isFinite(v));
        (zs.length ? zs : [-20]).forEach(z => angList(op).forEach(a => rdH.push({ z, ang: a * Math.PI / 180, r: 3.2, depth, rs: rSurf })));
      } else if (op.type === 'mslot') {
        slots.push({ x1: num(op.x1, 0), y1: num(op.y1, 0), x2: num(op.x2, 0), y2: num(op.y2, 0), w: Math.max(1, num(op.td, 4)), mouth: num(op.zTop, 0), depth: Math.max(0.3, num(op.depth, 2) * f) });
      } else if (op.type === 'mpocket') {
        pockets.push({ x: num(op.cx, 0), y: num(op.cy, 0), lx: num(op.lx, 6), ly: num(op.ly, 8), ang: num(op.c, 0) * Math.PI / 180, mouth: num(op.zTop, 0), depth: Math.max(0.3, num(op.depth, 2) * f) });
      }
    });

    const data = new Float32Array(MAXV * 6);
    let vn = 0;
    const parts = [];
    let cur = null;
    function start(color, group, cut, offset) {
      cur = { o: vn, n: 0, color, group, cut: cut ? 1 : 0, offset: !!offset };
      parts.push(cur);
    }
    function stop() { if (cur) cur.n = vn - cur.o; }
    function vert(x, y, z, nx, ny, nz) {
      if (vn >= MAXV) return;
      const i = vn * 6;
      data[i] = x; data[i + 1] = y; data[i + 2] = z; data[i + 3] = nx; data[i + 4] = ny; data[i + 5] = nz;
      vn++;
    }
    function tri(ax, ay, az, bx, by, bz, cx, cy, cz) {
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      vert(ax, ay, az, nx, ny, nz); vert(bx, by, bz, nx, ny, nz); vert(cx, cy, cz, nx, ny, nz);
    }
    function quad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3) {
      tri(x0, y0, z0, x1, y1, z1, x2, y2, z2);
      tri(x0, y0, z0, x2, y2, z2, x3, y3, z3);
    }
    function cellOn(iz, ir) { return iz >= 0 && ir >= 0 && iz < NZ && ir < NR && grid[iz * NR + ir]; }
    function groupAt(z) { return sever != null && z > sever + 0.4 ? 'drop' : 'spin'; }
    function gOf(iz) { return groupAt(zLo + (iz + 0.5) * dz); }
    function exposed(iz, ir, face) {
      if (!cellOn(iz, ir)) return false;
      if (face === 'o') return !cellOn(iz, ir + 1);
      if (face === 'i') return ir > 0 && ir * dr > 0.15 && !cellOn(iz, ir - 1);
      if (face === 'f') return !cellOn(iz + 1, ir);
      if (face === 'b') return !cellOn(iz - 1, ir);
      return false;
    }
    const spans = [];
    for (let ir = 0; ir < NR; ir++) {
      const rO = (ir + 1) * dr;
      let iz = 0;
      while (iz < NZ) {
        if (!exposed(iz, ir, 'o')) { iz++; continue; }
        const g = gOf(iz);
        const z0 = zLo + iz * dz;
        iz++;
        while (iz < NZ && exposed(iz, ir, 'o') && gOf(iz) === g) iz++;
        spans.push({ k: 'w', z0, r0: rO, z1: zLo + iz * dz, r1: rO, g, color: rO >= stockR - dr * 0.65 ? COL.stock : COL.cut, out: 1 });
      }
      if (ir === 0) continue;
      const rI = ir * dr;
      iz = 0;
      while (iz < NZ) {
        if (!exposed(iz, ir, 'i')) { iz++; continue; }
        const g = gOf(iz);
        const z0 = zLo + iz * dz;
        iz++;
        while (iz < NZ && exposed(iz, ir, 'i') && gOf(iz) === g) iz++;
        spans.push({ k: 'w', z0, r0: rI, z1: zLo + iz * dz, r1: rI, g, color: COL.cut, out: -1 });
      }
    }
    for (let iz = 0; iz < NZ; iz++) {
      const g = gOf(iz);
      [['f', 1], ['b', -1]].forEach(([face, sign]) => {
        const z = face === 'f' ? zLo + (iz + 1) * dz : zLo + iz * dz;
        const color = (z <= zLo + dz * 0.55 || z >= zHi - dz * 0.55) ? COL.stock : COL.cut;
        let ir = 0;
        while (ir < NR) {
          if (!exposed(iz, ir, face)) { ir++; continue; }
          const r0 = ir * dr;
          ir++;
          while (ir < NR && exposed(iz, ir, face)) ir++;
          spans.push({ k: 'r', z, r0, r1: ir * dr, sign, g, color });
        }
      });
    }
    let TH = 128;
    while (TH > 96 && spans.length * TH * 6 > 90000) TH -= 8;
    while (TH > 48 && spans.length * TH * 6 > 100000) TH -= 16;
    segCount = TH;
    const th0 = section ? Math.PI : 0, thSpan = section ? Math.PI : TAU;
    const thN = section ? Math.max(48, TH >> 1) : TH;
    const cosT = new Float32Array(thN + 1), sinT = new Float32Array(thN + 1);
    for (let k = 0; k <= thN; k++) {
      const a = th0 + thSpan * k / thN;
      cosT[k] = Math.cos(a); sinT[k] = Math.sin(a);
    }
    function wall(zA, rA, zB, rB, outward) {
      const dzs = zB - zA, drs = rB - rA;
      let nz = -drs, nr = dzs;
      if ((outward || 1) < 0) { nz = -nz; nr = -nr; }
      const nl = Math.hypot(nz, nr) || 1; nz /= nl; nr /= nl;
      for (let k = 0; k < thN; k++) {
        const c0 = cosT[k], s0 = sinT[k], c1 = cosT[k + 1], s1 = sinT[k + 1];
        vert(zA, rA * c0, rA * s0, nz, nr * c0, nr * s0);
        vert(zB, rB * c0, rB * s0, nz, nr * c0, nr * s0);
        vert(zB, rB * c1, rB * s1, nz, nr * c1, nr * s1);
        vert(zA, rA * c0, rA * s0, nz, nr * c0, nr * s0);
        vert(zB, rB * c1, rB * s1, nz, nr * c1, nr * s1);
        vert(zA, rA * c1, rA * s1, nz, nr * c1, nr * s1);
      }
    }
    function ring(z, r0, r1, sign) {
      const nx = sign > 0 ? 1 : -1;
      for (let k = 0; k < thN; k++) {
        const c0 = cosT[k], s0 = sinT[k], c1 = cosT[k + 1], s1 = sinT[k + 1];
        if (sign > 0) {
          vert(z, r0 * c0, r0 * s0, nx, 0, 0); vert(z, r0 * c1, r0 * s1, nx, 0, 0); vert(z, r1 * c1, r1 * s1, nx, 0, 0);
          vert(z, r0 * c0, r0 * s0, nx, 0, 0); vert(z, r1 * c1, r1 * s1, nx, 0, 0); vert(z, r1 * c0, r1 * s0, nx, 0, 0);
        } else {
          vert(z, r0 * c0, r0 * s0, nx, 0, 0); vert(z, r1 * c0, r1 * s0, nx, 0, 0); vert(z, r1 * c1, r1 * s1, nx, 0, 0);
          vert(z, r0 * c0, r0 * s0, nx, 0, 0); vert(z, r1 * c1, r1 * s1, nx, 0, 0); vert(z, r0 * c1, r0 * s1, nx, 0, 0);
        }
      }
    }
    spans.sort((a, b) => (a.g < b.g ? -1 : a.g > b.g ? 1 : (a.color === b.color ? 0 : (a.color === COL.stock ? -1 : 1))));
    let spanKey = '';
    spans.forEach(s => {
      const key = s.g + (s.color === COL.stock ? 'S' : 'C');
      if (key !== spanKey) { stop(); start(s.color, s.g, 1, 0); spanKey = key; }
      if (s.k === 'w') wall(s.z0, s.r0, s.z1, s.r1, s.out);
      else ring(s.z, s.r0, s.r1, s.sign);
    });
    stop();
    const split = sever != null;

    if (section) {
      start(COL.cut, 'spin', 0, 0);
      for (let iz = 0; iz < NZ; iz++) {
        if (split && zLo + (iz + 0.5) * dz > sever + 0.4) continue;
        capSlice(iz, 0);
      }
      stop();
      if (split) {
        start(COL.cut, 'drop', 0, 0);
        for (let iz = 0; iz < NZ; iz++) if (zLo + (iz + 0.5) * dz > sever + 0.4) capSlice(iz, 0);
        stop();
      }
    }
    function capSlice(iz) {
      const zA = zLo + iz * dz, zB = zA + dz, row = iz * NR;
      let ir = 0;
      while (ir < NR) {
        while (ir < NR && !grid[row + ir]) ir++;
        if (ir >= NR) break;
        const r0 = ir * dr;
        while (ir < NR && grid[row + ir]) ir++;
        const r1 = ir * dr;
        const zc = 0.04;
        quad(zA, r0, zc, zB, r0, zc, zB, r1, zc, zA, r1, zc);
        quad(zA, -r0, zc, zA, -r1, zc, zB, -r1, zc, zB, -r0, zc);
      }
    }

    const jawR = Math.max(chuck.jawR || stockR + 10, stockR + 4);
    const jawLen = Math.max(0, chuck.jawLen || 0);
    start(COL.chuck, 'spin', 0, 0);
    wall(chuck.z - 22, jawR * 0.62, chuck.z, jawR * 0.62);
    ring(chuck.z - 22, 0, jawR * 0.62, -1);
    ring(chuck.z, 0, jawR * 0.62, 1);
    stop();
    start(COL.jaw, 'spin', 0, 0);
    for (let j = 0; j < 3; j++) {
      const cth = j * TAU / 3;
      const a0 = cth - 0.34, a1 = cth + 0.34;
      let cvis = cth % TAU; if (cvis < 0) cvis += TAU;
      if (section && Math.sin(cvis) > 0.25) continue;
      const z0 = chuck.z, z1 = chuck.z + jawLen, r0 = stockR * 0.96, r1 = jawR;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      quad(z0, r1 * c0, r1 * s0, z1, r1 * c0, r1 * s0, z1, r1 * c1, r1 * s1, z0, r1 * c1, r1 * s1);
      quad(z0, r0 * c0, r0 * s0, z0, r0 * c1, r0 * s1, z1, r0 * c1, r0 * s1, z1, r0 * c0, r0 * s0);
      quad(z0, r0 * c0, r0 * s0, z1, r0 * c0, r0 * s0, z1, r1 * c0, r1 * s0, z0, r1 * c0, r1 * s0);
      quad(z0, r0 * c1, r0 * s1, z0, r1 * c1, r1 * s1, z1, r1 * c1, r1 * s1, z1, r0 * c1, r0 * s1);
      quad(z1, r0 * c0, r0 * s0, z1, r0 * c1, r0 * s1, z1, r1 * c1, r1 * s1, z1, r1 * c0, r1 * s0);
      quad(z0, r0 * c0, r0 * s0, z0, r1 * c0, r1 * s0, z0, r1 * c1, r1 * s1, z0, r0 * c1, r0 * s1);
    }
    stop();

    if (model.tailOn) {
      const td = Math.max(4, num(model.tailDia, 16)) / 2;
      start(COL.tail, 'fixed', 0, 0);
      wall(0.6, 0.4, 12, td, 1);
      wall(12, td * 0.72, 34, td * 0.72, 1);
      stop();
    }

    const threads = [...threadOps.values()];
    threads.forEach(th => {
      const g = groupAt((th.z0 + th.z1) / 2);
      start(COL.thread, g, 0, 1);
      const len = Math.abs(th.z1 - th.z0), steps = clamp(Math.round(len / th.pitch * 14), 8, 220);
      const rr = th.r + (th.id ? -0.25 : 0.22);
      for (let i = 0; i < steps; i++) {
        const z0 = th.z0 + (th.z1 - th.z0) * i / steps;
        const z1 = th.z0 + (th.z1 - th.z0) * (i + 1) / steps;
        const a0 = z0 / th.pitch * TAU, a1 = z1 / th.pitch * TAU;
        if (section && (Math.sin(a0) > 0.15 && Math.sin(a1) > 0.15)) continue;
        quad(z0, rr * Math.cos(a0), rr * Math.sin(a0), z0, rr * Math.cos(a0 + 0.18), rr * Math.sin(a0 + 0.18), z1, rr * Math.cos(a1 + 0.18), rr * Math.sin(a1 + 0.18), z1, rr * Math.cos(a1), rr * Math.sin(a1));
      }
      stop();
    });

    function tube(x0, y0, z0, x1, y1, z1, rad) {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz) || 1;
      const ax = dx / len, ay = dy / len, az = dz / len;
      let px, py, pz;
      if (Math.abs(ax) < 0.85) { px = 0; py = az; pz = -ay; } else { px = -az; py = 0; pz = ax; }
      let pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
      const qx = ay * pz - az * py, qy = az * px - ax * pz, qz = ax * py - ay * px;
      const seg = 12;
      for (let k = 0; k < seg; k++) {
        const a0 = TAU * k / seg, a1 = TAU * (k + 1) / seg;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        quad(
          x0 + (px * c0 + qx * s0) * rad, y0 + (py * c0 + qy * s0) * rad, z0 + (pz * c0 + qz * s0) * rad,
          x1 + (px * c0 + qx * s0) * rad, y1 + (py * c0 + qy * s0) * rad, z1 + (pz * c0 + qz * s0) * rad,
          x1 + (px * c1 + qx * s1) * rad, y1 + (py * c1 + qy * s1) * rad, z1 + (pz * c1 + qz * s1) * rad,
          x0 + (px * c1 + qx * s1) * rad, y0 + (py * c1 + qy * s1) * rad, z0 + (pz * c1 + qz * s1) * rad
        );
      }
    }
    axH.forEach(h => {
      if (section && h.z > h.r + 1) return;
      start(COL.hole, groupAt(h.mouth - h.depth * 0.5), 0, 0);
      tube(h.mouth + 0.2, h.y, h.z, h.mouth - h.depth, h.y, h.z, h.r * 0.92);
      stop();
    });
    rdH.forEach(h => {
      const ny = Math.sin(h.ang), nz = Math.cos(h.ang);
      if (section && h.rs * nz > h.r + 1) return;
      start(COL.hole, groupAt(h.z), 0, 0);
      tube(h.z, ny * (h.rs + 0.3), nz * (h.rs + 0.3), h.z, ny * (h.rs - h.depth), nz * (h.rs - h.depth), h.r * 0.92);
      stop();
    });
    flats.forEach(f => {
      const ny = Math.sin(f.ang), nz = Math.cos(f.ang), ty = -nz, tz = ny;
      const half = Math.sqrt(Math.max(0, f.rStock * f.rStock - f.r * f.r));
      const cy = ny * f.r, cz = nz * f.r;
      const g = groupAt((f.z0 + f.z1) / 2);
      start(COL.stock, g, 0, 0);
      quad(f.z0, cy + ty * half, cz + tz * half, f.z1, cy + ty * half, cz + tz * half, f.z1, cy - ty * half, cz - tz * half, f.z0, cy - ty * half, cz - tz * half);
      const ah = Math.acos(clamp(f.r / Math.max(f.r, f.rStock), -1, 1));
      [f.z0, f.z1].forEach(z => {
        const steps = 6;
        for (let k = 0; k < steps; k++) {
          const a0 = f.ang - ah + (2 * ah) * k / steps;
          const a1 = f.ang - ah + (2 * ah) * (k + 1) / steps;
          tri(z, cy, cz, z, f.rStock * Math.sin(a0), f.rStock * Math.cos(a0), z, f.rStock * Math.sin(a1), f.rStock * Math.cos(a1));
        }
      });
      stop();
    });
    slots.forEach(s => {
      start(COL.slot, groupAt(s.mouth), 0, 0);
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, px = -uy, py = ux, hw = s.w * 0.5;
      const c = (t, nrm, dep) => [s.mouth - dep, s.y1 + uy * t + py * nrm, s.x1 + ux * t + px * nrm];
      const P = (t, n, d) => c(t, n, d);
      const A = P(0, hw, 0), B = P(len, hw, 0), C = P(len, -hw, 0), D = P(0, -hw, 0);
      const A2 = P(0, hw, s.depth), B2 = P(len, hw, s.depth), C2 = P(len, -hw, s.depth), D2 = P(0, -hw, s.depth);
      quad(A2[0], A2[1], A2[2], B2[0], B2[1], B2[2], C2[0], C2[1], C2[2], D2[0], D2[1], D2[2]);
      quad(A[0], A[1], A[2], D[0], D[1], D[2], D2[0], D2[1], D2[2], A2[0], A2[1], A2[2]);
      quad(B[0], B[1], B[2], B2[0], B2[1], B2[2], C2[0], C2[1], C2[2], C[0], C[1], C[2]);
      quad(A[0], A[1], A[2], A2[0], A2[1], A2[2], B2[0], B2[1], B2[2], B[0], B[1], B[2]);
      quad(D[0], D[1], D[2], C[0], C[1], C[2], C2[0], C2[1], C2[2], D2[0], D2[1], D2[2]);
      stop();
    });
    pockets.forEach(pk => {
      start(COL.slot, groupAt(pk.mouth), 0, 0);
      const hx = pk.lx / 2, hy = pk.ly / 2, co = Math.cos(pk.ang), si = Math.sin(pk.ang);
      const corners = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(q => {
        const x = pk.x + q[0] * co - q[1] * si, y = pk.y + q[0] * si + q[1] * co;
        return [y, x];
      });
      const top = corners.map(q => [pk.mouth, q[0], q[1]]);
      const bot = corners.map(q => [pk.mouth - pk.depth, q[0], q[1]]);
      quad(bot[0][0], bot[0][1], bot[0][2], bot[1][0], bot[1][1], bot[1][2], bot[2][0], bot[2][1], bot[2][2], bot[3][0], bot[3][1], bot[3][2]);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        quad(top[i][0], top[i][1], top[i][2], bot[i][0], bot[i][1], bot[i][2], bot[j][0], bot[j][1], bot[j][2], top[j][0], top[j][1], top[j][2]);
      }
      stop();
    });

    // Đường chạy nhanh / chạy dao (cắt trong vùng phôi, không kéo tới điểm thay dao).
    const box = { z0: zLo - 6, z1: zHi + 18, r1: jawR + 8 };
    function clipSeg(z0, r0, z1, r1) {
      let t0 = 0, t1 = 1, dz = z1 - z0, dr = r1 - r0;
      function side(p, q) {
        if (Math.abs(q) < 1e-8) return p >= -1e-5;
        const t = -p / q;
        if (q < 0) { if (t < t0) return false; if (t < t1) t1 = t; }
        else { if (t > t1) return false; if (t > t0) t0 = t; }
        return true;
      }
      if (!side(z0 - box.z0, dz) || !side(box.z1 - z0, -dz) || !side(r0 + 2, dr) || !side(box.r1 - r0, -dr)) return null;
      if (t1 - t0 < 1e-3) return null;
      return [z0 + dz * t0, r0 + dr * t0, z0 + dz * t1, r0 + dr * t1];
    }
    const shown = [];
    for (let k = 0; k < lim; k++) shown.push(moves[k]);
    if (mi < moves.length && moves[mi]) {
      const m = moves[mi];
      const L = Math.hypot(m.z1 - m.z0, m.r1 - m.r0) || 1;
      const t = clamp(uu / L, 0, 1);
      shown.push({ z0: m.z0, r0: m.r0, z1: m.z0 + (m.z1 - m.z0) * t, r1: m.r0 + (m.r1 - m.r0) * t, kind: m.kind });
    }
    const rapidPts = [], feedPts = [];
    function pushLine(dst, z0, r0, z1, r1, kind) {
      const lift = kind ? 1.2 : 0.25;
      const ax = z0, ay = r0, bx = z1, by = r1;
      [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]].forEach(cr => {
        dst.push(ax, ay, lift, bx, by, lift, cr[1], cr[0]);
      });
    }
    shown.forEach(m => {
      if (!m) return;
      const c = clipSeg(m.z0, m.r0, m.z1, m.r1); if (!c) return;
      pushLine(m.kind === 'rapid' ? rapidPts : feedPts, c[0], c[1], c[2], c[3], m.kind === 'rapid' ? 0 : 1);
    });
    const lineData = new Float32Array(rapidPts.length + feedPts.length);
    lineData.set(rapidPts, 0); lineData.set(feedPts, rapidPts.length);

    // Dao / chíp.
    let tz = zHi + 8, tr = stockR + 16, typ = 'od', tdia = 8, side = 'OD';
    if (mi < moves.length && moves[mi]) {
      const m = moves[mi];
      const L = Math.hypot(m.z1 - m.z0, m.r1 - m.r0) || 1;
      const t = clamp(uu / L, 0, 1);
      tz = m.z0 + (m.z1 - m.z0) * t; tr = m.r0 + (m.r1 - m.r0) * t;
      const op = ops[m.i]; typ = op ? op.type : 'od'; tdia = op ? num(op.dia, op.td || 8) : 8; side = op && op.side ? op.side : 'OD';
    } else if (moves.length) {
      const m = moves[moves.length - 1]; tz = m.z1; tr = m.r1; const op = ops[m.i]; typ = op ? op.type : 'od'; side = op && op.side ? op.side : 'OD';
    }
    const park = tz > zHi + 20 || tz < zLo - 10 || tr > jawR + 6;
    if (park) { tz = zHi + 9; tr = stockR + 16; typ = 'od'; }
    tr = Math.max(0, tr);
    start(COL.insert, 'fixed', 0, 0);
    if (typ === 'drill' || typ === 'lface') {
      stop(); start(COL.holder, 'fixed', 0, 0);
      tube(tz, 0, 0, Math.max(tz, zHi) + 26, 0, 0, Math.max(1.2, tdia * 0.28));
      stop(); start(COL.tip, 'fixed', 0, 0);
      tube(tz, 0, 0, tz + 7, 0, 0, Math.max(1.4, tdia * 0.34));
    } else if (typ === 'id' || (typ === 'thread' && side === 'ID')) {
      quad(tz, tr, 0, tz + 7, tr + 3.5, 1.1, tz + 2, tr + 7, 1.1, tz - 2, tr + 3, 0);
      quad(tz, tr, 0, tz - 2, tr + 3, 0, tz + 2, tr + 7, -1.1, tz + 7, tr + 3.5, -1.1);
      stop(); start(COL.holder, 'fixed', 0, 0);
      quad(tz + 4, tr + 4, -2.2, tz + 28, tr * 0.35, -2.2, tz + 28, tr * 0.35, 2.2, tz + 4, tr + 4, 2.2);
      quad(tz + 4, 1, -2.2, tz + 28, 1, -2.2, tz + 28, tr * 0.35, -2.2, tz + 4, tr + 4, -2.2);
    } else if (typ === 'lside' || typ === 'mflat') {
      const y0 = Math.max(tr, stockR);
      quad(tz - 3, y0, -3, tz + 3, y0, -3, tz + 3, y0 + 16, -3, tz - 3, y0 + 16, -3);
      quad(tz - 3, y0, 3, tz - 3, y0 + 16, 3, tz + 3, y0 + 16, 3, tz + 3, y0, 3);
      quad(tz - 3, y0, -3, tz - 3, y0, 3, tz + 3, y0, 3, tz + 3, y0, -3);
    } else {
      quad(tz, tr, 0, tz + 4.2, tr + 2.4, 1.15, tz + 1.4, tr + 6.2, 1.15, tz - 2.6, tr + 3.4, 0);
      quad(tz, tr, 0, tz - 2.6, tr + 3.4, 0, tz + 1.4, tr + 6.2, -1.15, tz + 4.2, tr + 2.4, -1.15);
      stop(); start(COL.holder, 'fixed', 0, 0);
      quad(tz - 3.2, tr + 5, -3.2, tz + 3.6, tr + 5, -3.2, tz + 3.6, tr + 24, -3.2, tz - 3.2, tr + 24, -3.2);
      quad(tz - 3.2, tr + 5, 3.2, tz - 3.2, tr + 24, 3.2, tz + 3.6, tr + 24, 3.2, tz + 3.6, tr + 5, 3.2);
      quad(tz - 3.2, tr + 5, -3.2, tz - 3.2, tr + 5, 3.2, tz + 3.6, tr + 5, 3.2, tz + 3.6, tr + 5, -3.2);
    }
    stop();
    start(COL.tip, 'fixed', 0, 0);
    tri(tz, tr, 0.9, tz - 1.3, tr + 2.2, 0.9, tz + 1.3, tr + 2.2, 0.9);
    stop();

    const uF = [0, 0, 0, 0, 0, 0, 0, 0];
    const uH = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const uHm = [0, 0, 0, 0];
    const uR = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const uRs = [0, 0, 0, 0];
    flats.slice(0, 2).forEach((f, i) => { uF[i * 4] = f.ang; uF[i * 4 + 1] = f.r; uF[i * 4 + 2] = f.z0; uF[i * 4 + 3] = f.z1; });
    axH.slice(0, 4).forEach((h, i) => { uH[i * 4] = h.y; uH[i * 4 + 1] = h.z; uH[i * 4 + 2] = h.r; uH[i * 4 + 3] = h.depth; uHm[i] = h.mouth; });
    rdH.slice(0, 4).forEach((h, i) => { uR[i * 4] = h.z; uR[i * 4 + 1] = h.ang; uR[i * 4 + 2] = h.r; uR[i * 4 + 3] = h.depth; uRs[i] = h.rs; });

    return {
      data, vn, parts: parts.filter(p => p.n > 0 && !p.skip),
      lines: { data: lineData, nRapid: rapidPts.length / 8, nFeed: feedPts.length / 8 },
      cuts: { nF: Math.min(2, flats.length), nH: Math.min(4, axH.length), nR: Math.min(4, rdH.length), uF, uH, uHm, uR, uRs },
      center: [(zLo + zHi) / 2, stockR * 0.15, 0],
      fit: Math.max(70, (zHi - zLo) * 0.72 + jawR * 1.15),
      stockR,
      sever
    };
  }

  function upload(sc) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, sc.data.subarray(0, sc.vn * 6), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    verts = sc.vn;
    if (lbuf && sc.lines) {
      gl.bindBuffer(gl.ARRAY_BUFFER, lbuf);
      gl.bufferData(gl.ARRAY_BUFFER, sc.lines.data, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    }
  }

  function resize() {
    if (!canvas || !gl) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.clientWidth || 360;
    const h = rect.height || canvas.clientHeight || 280;
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const W = Math.max(2, Math.round(w * dpr)), H = Math.max(2, Math.round(h * dpr));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render() {
    if (!gl || !prog) return;
    resize();
    const rect = canvas.getBoundingClientRect();
    const aspect = (rect.width || canvas.width) / Math.max(1, rect.height || canvas.height);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const eye = [cam.target[0] + cam.dist * cp * sy, cam.target[1] + cam.dist * sp, cam.target[2] + cam.dist * cp * cy];
    const vp = mul(persp(0.7, aspect, 2, 4000), look(eye, cam.target, [0, 1, 0]));
    gl.useProgram(prog);
    gl.uniformMatrix4fv(locs.uVP, false, vp);
    const ang = section ? 0 : spin;
    const spinM = rotX(ang);
    const dropM = trans(0, -16, 0);
    const id = ident();
    gl.clearColor(COL.bg[0], COL.bg[1], COL.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!scene) return;
    const c = scene.cuts;
    gl.uniform4f(locs.uF0, c.uF[0], c.uF[1], c.uF[2], c.uF[3]);
    gl.uniform4f(locs.uF1, c.uF[4], c.uF[5], c.uF[6], c.uF[7]);
    gl.uniform4f(locs.uH0, c.uH[0], c.uH[1], c.uH[2], c.uH[3]);
    gl.uniform4f(locs.uH1, c.uH[4], c.uH[5], c.uH[6], c.uH[7]);
    gl.uniform4f(locs.uH2, c.uH[8], c.uH[9], c.uH[10], c.uH[11]);
    gl.uniform4f(locs.uH3, c.uH[12], c.uH[13], c.uH[14], c.uH[15]);
    gl.uniform4f(locs.uHm, c.uHm[0], c.uHm[1], c.uHm[2], c.uHm[3]);
    gl.uniform4f(locs.uR0, c.uR[0], c.uR[1], c.uR[2], c.uR[3]);
    gl.uniform4f(locs.uR1, c.uR[4], c.uR[5], c.uR[6], c.uR[7]);
    gl.uniform4f(locs.uR2, c.uR[8], c.uR[9], c.uR[10], c.uR[11]);
    gl.uniform4f(locs.uR3, c.uR[12], c.uR[13], c.uR[14], c.uR[15]);
    gl.uniform4f(locs.uRs, c.uRs[0], c.uRs[1], c.uRs[2], c.uRs[3]);
    scene.parts.forEach(p => {
      const M = p.group === 'spin' ? spinM : p.group === 'drop' ? dropM : id;
      gl.uniformMatrix4fv(locs.uM, false, M);
      gl.uniform3f(locs.uColor, p.color[0], p.color[1], p.color[2]);
      gl.uniform4f(locs.uPack, p.cut, c.nF, c.nH, c.nR);
      if (p.offset) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1.2, -1.5); }
      else gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.drawArrays(gl.TRIANGLES, p.o, p.n);
    });
    gl.disable(gl.POLYGON_OFFSET_FILL);
    drawPath(vp, id);
  }

  function drawPath(vp, idM) {
    const lines = scene && scene.lines;
    if (!showPath || !lprog || !lbuf || !llocs || !lines || !(lines.nRapid + lines.nFeed)) return;
    gl.useProgram(lprog);
    gl.bindBuffer(gl.ARRAY_BUFFER, lbuf);
    const stride = 32;
    gl.enableVertexAttribArray(2); gl.enableVertexAttribArray(3);
    gl.enableVertexAttribArray(4); gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 12);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 24);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 28);
    gl.uniformMatrix4fv(llocs.uM, false, idM);
    gl.uniformMatrix4fv(llocs.uVP, false, vp);
    gl.uniform2f(llocs.uRes, canvas.width, canvas.height);
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    gl.uniform1f(llocs.uPx, linePx * dpr);
    gl.uniform3f(llocs.uRapid, COL.rapid[0], COL.rapid[1], COL.rapid[2]);
    gl.uniform3f(llocs.uFeed, COL.feed[0], COL.feed[1], COL.feed[2]);
    gl.uniform1f(llocs.uAlpha, 0.9);
    gl.uniform1f(llocs.uDash, 6.0 * dpr);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, lines.nRapid + lines.nFeed);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
    gl.disableVertexAttribArray(4); gl.disableVertexAttribArray(5);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - (lastT || ts)) / 1000);
    lastT = ts;
    if (!section && playing && !liveLock) spin = (spin + dt * (cutting ? 2.5 : 0.45)) % TAU;
    render();
  }

  function update(model) {
    if (!model) return;
    playing = !!model.playing;
    const moves = model.moves || [], mi = model.mi || 0, op = mi < moves.length ? (model.ops || [])[moves[mi].i] : null;
    const live = op && (op.type === 'lface' || op.type === 'lside' || op.type === 'mslot' || op.type === 'mpocket' || op.type === 'mflat');
    liveLock = !!live;
    cutting = !!(op && moves[mi] && moves[mi].kind === 'feed' && !live);
    let sig = moves.length;
    const step = Math.max(1, (moves.length / 12) | 0);
    for (let k = 0; k < moves.length; k += step) {
      const m = moves[k];
      sig = (sig * 33 + ((m.z1 * 10) | 0) + ((m.r1 * 17) | 0) + (m.kind === 'feed' ? 1 : 2)) | 0;
    }
    const key = [mi, Math.round((model.u || 0) * 2), section ? 1 : 0, sig, model.tailOn ? 1 : 0, model.blank && model.blank.z0, model.blank && model.blank.z1, model.blank && model.blank.r, (model.ops || []).length].join(':');
    if (key === builtKey && scene) return;
    builtKey = key;
    scene = build(model);
    cuts = scene.cuts;
    if (!cam.user) { cam.target = scene.center.slice(); cam.dist = scene.fit; }
    if (gl && buf) upload(scene);
  }

  function resetCam() {
    cam.user = false; cam.yaw = 0.82; cam.pitch = 0.36; spin = 0.35;
    if (scene) { cam.target = scene.center.slice(); cam.dist = scene.fit; }
  }
  function lookEnd() {
    cam.user = true;
    cam.yaw = Math.PI / 2;
    cam.pitch = 0;
    spin = 0;
    if (scene) {
      cam.target = [scene.center[0], 0, 0];
      cam.dist = Math.max(80, (scene.stockR || 30) * 5.6);
    }
  }
  function hexRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function putCol(key, hex) {
    const c = hexRgb(hex);
    if (!c || !COL[key]) return;
    COL[key][0] = c[0]; COL[key][1] = c[1]; COL[key][2] = c[2];
  }
  function setPathStyle(v) {
    if (!v) return;
    if (v.showPath != null) showPath = !!v.showPath;
    if (v.linePx != null) linePx = clamp(Number(v.linePx) || 1.25, 0.75, 3);
  }
  function setAppearance(v) {
    if (!v) return;
    putCol('stock', v.stock); putCol('cut', v.cut); putCol('insert', v.tool); putCol('tip', v.tool);
    putCol('rapid', v.rapid); putCol('feed', v.feed); putCol('chuck', v.chuck); putCol('bg', v.bg);
    COL.jaw[0] = COL.chuck[0] * 0.72; COL.jaw[1] = COL.chuck[1] * 0.72; COL.jaw[2] = COL.chuck[2] * 0.75;
    COL.tail[0] = COL.chuck[0]; COL.tail[1] = COL.chuck[1]; COL.tail[2] = COL.chuck[2];
    if (v.invert != null) orbitInvert = !!v.invert;
    if (canvas && v.bg) canvas.style.background = v.bg;
  }
  function diskMeasure() {
    if (!gl || !canvas) return null;
    const keep = spin;
    spin = 0;
    render();
    spin = keep;
    const w = canvas.width, h = canvas.height;
    const pix = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pix);
    const bg = [pix[0], pix[1], pix[2]];
    const cx = (w / 2) | 0, cy = (h / 2) | 0;
    const N = 72, radii = [];
    for (let i = 0; i < N; i++) {
      const a = TAU * i / N, dx = Math.cos(a), dy = Math.sin(a);
      let r = 0;
      const lim = Math.min(w, h) * 0.49;
      for (let s = 3; s < lim; s++) {
        const x = (cx + dx * s) | 0, y = (cy + dy * s) | 0;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) { r = s; break; }
        const o = (y * w + x) * 4;
        if (Math.abs(pix[o] - bg[0]) < 22 && Math.abs(pix[o + 1] - bg[1]) < 22 && Math.abs(pix[o + 2] - bg[2]) < 22) { r = s; break; }
      }
      radii.push(r);
    }
    const sorted = radii.slice().sort((a, b) => a - b);
    const median = sorted[(N / 2) | 0] || 1;
    const inliers = [];
    let hx = 0, hn = 0, vy = 0, vn2 = 0;
    for (let i = 0; i < N; i++) {
      if (Math.abs(radii[i] - median) / median >= 0.05) continue;
      inliers.push(radii[i]);
      const a = TAU * i / N;
      if (Math.abs(Math.cos(a)) > 0.75) { hx += radii[i]; hn++; }
      if (Math.abs(Math.sin(a)) > 0.75) { vy += radii[i]; vn2++; }
    }
    let mean = 0;
    inliers.forEach(r => { mean += r; });
    mean = inliers.length ? mean / inliers.length : median;
    let acc = 0;
    inliers.forEach(r => { const d = r - mean; acc += d * d; });
    const rect = canvas.getBoundingClientRect();
    return {
      segs: segCount,
      median,
      inlierFrac: inliers.length / N,
      ripple: mean ? Math.sqrt(acc / Math.max(1, inliers.length)) / mean : 1,
      hv: hn && vn2 ? (hx / hn) / (vy / vn2) : 1,
      cssAspect: rect.width / Math.max(1, rect.height),
      bufAspect: w / Math.max(1, h),
      verts
    };
  }
  function setSection(on) {
    const n = !!on;
    if (n === section) return;
    section = n;
    builtKey = '';
    if (!cam.user) { cam.yaw = n ? 0.52 : 0.82; cam.pitch = n ? 0.3 : 0.36; }
  }
  function probe() {
    if (!gl || !canvas) return null;
    render();
    const w = canvas.width, h = canvas.height, px = new Uint8Array(4), out = [];
    [[0.5, 0.5], [0.35, 0.55], [0.62, 0.42], [0.5, 0.7], [0.28, 0.4]].forEach(q => {
      gl.readPixels((w * q[0]) | 0, (h * q[1]) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out.push([px[0], px[1], px[2]]);
    });
    return out;
  }

  root.OKU3D = {
    mount, unmount, update, resetCam, setSection, probe, lookEnd, setAppearance, setPathStyle, diskMeasure,
    current: () => canvas,
    ok: () => !!(gl && !failed),
    fail: () => failed,
    verts: () => verts,
    segments: () => segCount,
    cam
  };
})(window);
