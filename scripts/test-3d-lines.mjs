#!/usr/bin/env node
/** Thin toolpath lines and simulation controls under the view. Phone 390x844. */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = '/opt/cursor/artifacts/screenshots';
const mode = process.argv[2] || 'served';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result || {});
      } else if (msg.method) for (const fn of this.listeners) fn(msg.method, msg.params || {});
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(fn) { this.listeners.push(fn); }
}
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('websocket')));
  });
  return new CDP(ws);
}
async function waitFor(cdp, expr, timeout = 8000) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeout) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval ' + JSON.stringify(r.exceptionDetails));
    last = r.result.value;
    if (last) return last;
    await sleep(40);
  }
  throw new Error('Hết giờ: ' + expr + ' cuối=' + last);
}
async function ev(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''));
  return r.result.value;
}
async function shot(cdp, name) {
  fs.mkdirSync(shotDir, { recursive: true });
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(shotDir, name);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}
async function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'okuma-ln-'));
  const chrome = spawn(fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : 'google-chrome', [
    '--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
    '--no-first-run', '--disable-sync', '--disable-background-networking', '--disable-component-update',
    '--disable-features=Translate,OptimizationHints,MediaRouter', '--hide-scrollbars',
    '--window-size=390,844', '--lang=vi', '--user-data-dir=' + profile,
    '--remote-debugging-port=0', '--remote-allow-origins=*', 'about:blank'
  ], { stdio: 'ignore' });
  let port = 0;
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 80 && !port; i++) {
    if (fs.existsSync(portFile)) port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    else await sleep(100);
  }
  if (!port) { chrome.kill('SIGKILL'); throw new Error('Chrome không mở cổng'); }
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  return { chrome, profile, cdp: await connect(page.webSocketDebuggerUrl) };
}
function watch(cdp, errors, requests) {
  cdp.on((method, params) => {
    if (method === 'Runtime.exceptionThrown') errors.push('exception: ' + (params.exceptionDetails && params.exceptionDetails.text));
    if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert')) {
      errors.push('console.' + params.type + ': ' + (params.args || []).map(a => a.value || a.description || '').join(' '));
    }
    if (method === 'Log.entryAdded' && params.entry && (params.entry.level === 'error' || params.entry.level === 'assert')) errors.push('log: ' + params.entry.text);
    if (method === 'Network.requestWillBeSent' && requests) requests.push(params.request.url);
    if (method === 'Page.javascriptDialogOpening') cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  });
}
async function prep(cdp, offline) {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable'); await cdp.send('Network.enable');
  if (offline) await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
}
async function openSim(cdp) {
  await ev(cdp, `document.querySelector('#setupSample').click()`);
  await waitFor(cdp, `!!document.querySelector('[data-step="5"]')`);
  await ev(cdp, `document.querySelector('[data-step="5"]').click()`);
  await waitFor(cdp, `!!document.querySelector('#cvSim3d') && !!document.querySelector('#simPlay') && window.OKU3D && window.OKU3D.ok()`);
  await sleep(200);
}
function layoutExpr() {
  return `(() => {
    const r = el => { const b = el && el.getBoundingClientRect(); return b ? { t: b.top, b: b.bottom, h: b.height } : null; };
    const views = document.querySelector('#v-flow .simviews') || document.querySelector('#cvSim3d');
    return {
      bar: r(document.querySelector('#simViewBar')),
      cv2: r(document.querySelector('#cvSim')),
      cv3: r(document.querySelector('#cvSim3d')),
      play: r(document.querySelector('#simPlay')),
      dock: r(document.querySelector('#v-flow .simstage .simdock')),
      tabs: r(document.querySelector('.tabs')),
      views: r(views),
      path: (document.querySelector('#v-flow .simstage [data-sim="path"]')||{}).textContent,
      lw: (document.querySelector('#v-flow .simstage [data-simlw]')||{}).value
    };
  })()`;
}
async function checkLayout(cdp, errors, tag) {
  const L = await ev(cdp, layoutExpr());
  const canvases = [L.cv2, L.cv3].filter(c => c && c.h > 2);
  const lowest = canvases.reduce((m, c) => Math.max(m, c.b), 0);
  const highest = canvases.reduce((m, c) => Math.min(m, c.t), 9999);
  if (!(L.bar && L.bar.b <= highest + 4)) errors.push(tag + ' nút 2D/3D không ở trên khung: ' + JSON.stringify(L));
  if (!(L.play && L.play.t >= lowest - 8)) errors.push(tag + ' nút Chạy không dưới khung: ' + JSON.stringify(L));
  if (!(L.play.t < 820 && L.play.b > 40 && L.play.b <= 844)) errors.push(tag + ' nút Chạy ngoài màn hình: ' + JSON.stringify(L.play));
  if (!(L.dock && L.tabs && L.dock.b <= L.tabs.t + 2)) errors.push(tag + ' thanh điều khiển bị tab che: ' + JSON.stringify({ dock: L.dock, tabs: L.tabs }));
  if (L.path !== 'Ẩn đường dao') errors.push(tag + ' nhãn đường dao: ' + L.path);
  if (Number(L.lw) < 0.7 || Number(L.lw) > 1.5) errors.push(tag + ' nét mặc định không mỏng: ' + L.lw);
  return L;
}

async function runPage(cdp, errors, tag) {
  await openSim(cdp);
  let lay = await checkLayout(cdp, errors, tag + ' cả hai');
  await ev(cdp, `document.querySelector('#sim3d').click()`);
  await sleep(200);
  lay = await checkLayout(cdp, errors, tag + ' 3D');
  await ev(cdp, `(() => { const b = document.querySelector('#simStep'); for (let i = 0; i < 28; i++) b.click(); return true; })()`);
  await sleep(250);
  const counts = await ev(cdp, `(() => {
    const gl = document.querySelector('#cvSim3d').getContext('webgl') || document.querySelector('#cvSim3d').getContext('experimental-webgl');
    window.OKU3D.probe();
    const c = document.querySelector('#cvSim3d');
    const w = c.width, h = c.height, pix = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pix);
    let orange = 0, blue = 0;
    for (let i = 0; i < pix.length; i += 8) {
      const r = pix[i], g = pix[i+1], b = pix[i+2];
      if (r > 175 && r > g + 28 && r > b + 40 && g < 210) orange++;
      if (b > 185 && b > r + 70 && r < 110 && g > 50) blue++;
    }
    return { orange, blue, w, h, verts: window.OKU3D.verts(), fail: window.OKU3D.fail() };
  })()`);
  if (counts.fail) errors.push(tag + ' WebGL: ' + counts.fail);
  if (counts.orange < 12) errors.push(tag + ' không thấy nét cam chạy nhanh: ' + JSON.stringify(counts));
  if (counts.blue < 12) errors.push(tag + ' không thấy nét xanh chạy dao: ' + JSON.stringify(counts));
  if (counts.orange + counts.blue > 9000) errors.push(tag + ' đường dao còn quá dày: ' + JSON.stringify(counts));
  const thin = await shot(cdp, tag === 'offline' ? '3d-offline-thin-path.png' : '3d-thin-path.png');
  await ev(cdp, `document.querySelector('#simPlay').scrollIntoView({ block: 'end' })`);
  await sleep(120);
  const controls = tag === 'offline' ? null : await shot(cdp, '3d-controls-under.png');
  await ev(cdp, `document.querySelector('#v-flow .simstage [data-sim="path"]').click()`);
  await sleep(150);
  const hidden = await ev(cdp, `(() => {
    const c = document.querySelector('#cvSim3d');
    const gl = c.getContext('webgl');
    const w = c.width, h = c.height, pix = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pix);
    let orange = 0;
    for (let i = 0; i < pix.length; i += 8) {
      const r = pix[i], g = pix[i+1], b = pix[i+2];
      if (r > 175 && r > g + 28 && r > b + 40 && g < 210) orange++;
    }
    return orange;
  })()`);
  if (!(hidden < counts.orange * 0.35)) errors.push(tag + ' ẩn đường dao không hết nét cam: ' + hidden + ' / ' + counts.orange);
  await ev(cdp, `document.querySelector('#v-flow .simstage [data-sim="path"]').click()`);
  let prev = null;
  if (tag !== 'offline') {
    await ev(cdp, `document.querySelector('#prev3d').scrollIntoView({ block: 'center' })`);
    await waitFor(cdp, `!!document.querySelector('#prev3d')`);
    await ev(cdp, `document.querySelector('#prev3d').click()`);
    await sleep(300);
    await ev(cdp, `document.querySelector('#prevDock3d .simdock').scrollIntoView({ block: 'end' })`);
    await sleep(150);
    const prevLay = await ev(cdp, `(() => {
      const play = document.querySelector('#prevDock3d [data-sim="play"]').getBoundingClientRect();
      const cv = document.querySelector('#cvPrev3d').getBoundingClientRect();
      const bar = document.querySelector('#prevViewBar').getBoundingClientRect();
      return { playT: play.top, playB: play.bottom, cvB: cv.bottom, cvT: cv.top, barB: bar.bottom, label: document.querySelector('#prevDock3d [data-sim="path"]').textContent };
    })()`);
    if (!(prevLay.barB <= prevLay.cvT + 6)) errors.push('Xem trước: 2D/3D không ở trên khung');
    if (!(prevLay.playT >= prevLay.cvB - 8)) errors.push('Xem trước: nút Chạy không dưới khung 3D ' + JSON.stringify(prevLay));
    if (prevLay.label !== 'Ẩn đường dao') errors.push('Xem trước thiếu Ẩn đường dao');
    prev = await shot(cdp, '3d-preview-controls.png');
  }
  return { lay, counts, hidden, thin, controls, prev };
}

async function runServed() {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  await sleep(250);
  const errors = [], requests = [];
  const { chrome, profile, cdp } = await launchChrome();
  watch(cdp, errors, requests);
  try {
    await prep(cdp, false);
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8765/' });
    await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('#setupNew')`);
    const page = await runPage(cdp, errors, 'served');
    const http = requests.filter(u => /^https?:/i.test(u) && !u.startsWith('http://127.0.0.1:8765'));
    if (http.length) errors.push('Gọi mạng ngoài: ' + http.join(' | '));
    console.log(JSON.stringify({ ok: errors.length === 0, page, errors }, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    try { cdp.ws.close(); } catch (e) { /* bỏ */ }
    chrome.kill('SIGKILL');
    spawnSync('rm', ['-rf', profile]);
    srv.kill('SIGKILL');
  }
}
async function runFile() {
  if (process.env.OKUMA_OFFLINE_NS !== '1') {
    const script = fileURLToPath(import.meta.url);
    const r = spawnSync('unshare', ['--net', '--map-root-user', 'bash', '-c', '(ip link set lo up || /usr/sbin/ifconfig lo up) && OKUMA_OFFLINE_NS=1 node ' + JSON.stringify(script) + ' file'], { stdio: 'inherit' });
    process.exit(r.status == null ? 1 : r.status);
  }
  const htmlPath = path.join(root, 'download', 'okuma-app-offline.html');
  const errors = [], requests = [];
  const { chrome, profile, cdp } = await launchChrome();
  watch(cdp, errors, requests);
  try {
    await prep(cdp, true);
    await cdp.send('Page.navigate', { url: 'file://' + htmlPath });
    await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('#btnOfflineHtml')`);
    const online = await ev(cdp, `navigator.onLine`);
    const page = await runPage(cdp, errors, 'offline');
    if (online !== false) errors.push('onLine=' + online);
    const http = requests.filter(u => /^https?:/i.test(u));
    if (http.length) errors.push('file:// đã gọi mạng');
    console.log(JSON.stringify({ ok: errors.length === 0, online, page, errors }, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    try { cdp.ws.close(); } catch (e) { /* bỏ */ }
    chrome.kill('SIGKILL');
    spawnSync('rm', ['-rf', profile]);
  }
}
(mode === 'file' ? runFile : runServed)().catch(err => { console.error(err); process.exit(1); });
