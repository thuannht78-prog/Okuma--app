#!/usr/bin/env node
/**
 * Phone-size check: round end-on stock, natural orbit, pinch+pan, color presets.
 * Served site, then offline HTML via file:// with the network cut.
 */
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
    ws.addEventListener('error', () => reject(new Error('websocket ' + url)));
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'okuma-3d-'));
  const chromeBin = fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : 'google-chrome';
  const chrome = spawn(chromeBin, [
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
    if (method === 'Log.entryAdded' && params.entry && (params.entry.level === 'error' || params.entry.level === 'assert')) {
      errors.push('log: ' + params.entry.text);
    }
    if (method === 'Network.requestWillBeSent' && requests) requests.push(params.request.url);
    if (method === 'Page.javascriptDialogOpening') cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  });
}
async function prep(cdp, offline) {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  if (offline) await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
}
async function touch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(p => ({ x: p.x, y: p.y, id: p.id, radiusX: 2, radiusY: 2, force: 1 }))
  });
}
async function openSim(cdp) {
  await ev(cdp, `document.querySelector('#setupSample').click()`);
  await waitFor(cdp, `!!document.querySelector('[data-step="6"]')`);
  await ev(cdp, `document.querySelector('[data-step="6"]').click()`);
  await waitFor(cdp, `!!document.querySelector('#cvSim3d') && window.OKU3D && window.OKU3D.ok()`);
  await ev(cdp, `document.querySelector('#sim3d').click()`);
  await sleep(200);
  await ev(cdp, `document.querySelector('#cvSim3d').scrollIntoView({ block: 'center' })`);
  await sleep(150);
}
function camExpr() {
  return `(() => { const c = window.OKU3D.cam; return { yaw: c.yaw, pitch: c.pitch, dist: c.dist, t: c.target.slice() }; })()`;
}
async function box(cdp) {
  return ev(cdp, `(() => { const r = document.querySelector('#cvSim3d').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
}

async function checkRoundAndGestures(cdp, errors, tag) {
  await openSim(cdp);
  const labels = await ev(cdp, `(() => ({
    mau: !!document.querySelector('.c3panel'),
    dao: [...document.querySelectorAll('.c3panel')].some(n => n.textContent.includes('Đảo chiều xoay')),
    presets: [...document.querySelectorAll('[data-c3preset]')].map(b => b.textContent)
  }))()`);
  if (!labels.mau || !labels.dao) throw new Error('Thiếu bảng màu: ' + JSON.stringify(labels));
  if (!labels.presets.includes('Đồng') || !labels.presets.includes('Mặc định')) throw new Error('Thiếu preset: ' + labels.presets.join(','));

  await ev(cdp, `window.OKU3D.lookEnd()`);
  await sleep(280);
  const round = await ev(cdp, `window.OKU3D.diskMeasure()`);
  if (!round) throw new Error('Không đo được mặt đầu');
  if (round.segs < 96) errors.push(tag + ' số múi thấp: ' + round.segs);
  if (round.median < 36) errors.push(tag + ' vòng tròn quá nhỏ: ' + round.median);
  if (round.inlierFrac < 0.7) errors.push(tag + ' biên dạng không tròn: ' + JSON.stringify(round));
  if (round.ripple > 0.035) errors.push(tag + ' gợn bán kính: ' + round.ripple);
  if (Math.abs(round.hv - 1) > 0.07) errors.push(tag + ' méo tỷ lệ: ' + round.hv);
  if (Math.abs(round.cssAspect - round.bufAspect) > 0.04) errors.push(tag + ' canvas bị kéo: ' + round.cssAspect + ' vs ' + round.bufAspect);
  const endShot = await shot(cdp, tag === 'offline' ? '3d-offline-end-round.png' : '3d-end-round.png');

  const b = await box(cdp);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const before = await ev(cdp, camExpr());
  await touch(cdp, 'touchStart', [{ id: 1, x: cx, y: cy }]);
  await sleep(30);
  await touch(cdp, 'touchMove', [{ id: 1, x: cx + 70, y: cy + 10 }]);
  await sleep(30);
  await touch(cdp, 'touchEnd', []);
  const afterDrag = await ev(cdp, camExpr());
  const dyaw = afterDrag.yaw - before.yaw;
  if (!(dyaw < -0.35)) errors.push(tag + ' kéo phải không xoay theo tay, dyaw=' + dyaw);

  await ev(cdp, `window.OKU3D.lookEnd()`);
  await sleep(40);
  const z0 = await ev(cdp, camExpr());
  await touch(cdp, 'touchStart', [{ id: 1, x: cx - 40, y: cy }, { id: 2, x: cx + 40, y: cy }]);
  await sleep(40);
  await touch(cdp, 'touchMove', [{ id: 1, x: cx - 100, y: cy - 24 }, { id: 2, x: cx + 90, y: cy + 16 }]);
  await sleep(40);
  await touch(cdp, 'touchEnd', []);
  const z1 = await ev(cdp, camExpr());
  if (!(z1.dist < z0.dist * 0.75)) errors.push(tag + ' hai ngón không phóng, dist ' + z0.dist + ' → ' + z1.dist);
  const moved = Math.hypot(z1.t[0] - z0.t[0], z1.t[1] - z0.t[1], z1.t[2] - z0.t[2]);
  if (!(moved > 1)) errors.push(tag + ' hai ngón không kéo, d=' + moved);

  await ev(cdp, `window.OKU3D.resetCam()`);
  const m0 = await ev(cdp, camExpr());
  const mouse = await ev(cdp, `(() => {
    const c = document.querySelector('#cvSim3d');
    const r = c.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const opt = (px, py, buttons) => ({ bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 7, clientX: px, clientY: py, button: 0, buttons });
    c.dispatchEvent(new PointerEvent('pointerdown', opt(x, y, 1)));
    c.dispatchEvent(new PointerEvent('pointermove', opt(x + 50, y, 1)));
    c.dispatchEvent(new PointerEvent('pointerup', opt(x + 50, y, 0)));
    c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: x, clientY: y }));
    return true;
  })()`);
  if (!mouse) errors.push(tag + ' chuột không gửi được');
  const m1 = await ev(cdp, camExpr());
  if (!(m1.yaw < m0.yaw - 0.2)) errors.push(tag + ' chuột trái không xoay theo tay');
  if (!(m1.dist < m0.dist)) errors.push(tag + ' bánh xe không phóng');

  const fin = await ev(cdp, `(() => { const b = document.querySelector('#simStep'); let n = 0; while (n < 500 && !((document.querySelector('#simStatus')||{}).textContent||'').includes('đã chạy hết')) { b.click(); n++; } return { n, verts: window.OKU3D.verts(), segs: window.OKU3D.segments(), fail: window.OKU3D.fail() }; })()`);
  if (!fin || fin.fail || fin.verts < 800 || fin.segs < 64) errors.push(tag + ' lưới thành phẩm: ' + JSON.stringify(fin));

  return { round, dyaw, pinch: [z0.dist, z1.dist], pan: moved, endShot, fin };
}

async function checkColors(cdp, errors) {
  await ev(cdp, `document.querySelector('#cvSim3d').scrollIntoView({ block: 'start' })`);
  await ev(cdp, `document.querySelector('#sim3dWrap .c3panel').open = true`);
  await sleep(150);
  await ev(cdp, `document.querySelector('#sim3dWrap .c3panel').scrollIntoView({ block: 'center' })`);
  await sleep(120);
  const panel = await shot(cdp, '3d-colors-panel.png');
  await ev(cdp, `document.querySelector('#sim3dWrap [data-c3preset="dong"]').click()`);
  await sleep(200);
  await ev(cdp, `document.querySelector('#cvSim3d').scrollIntoView({ block: 'center' })`);
  await sleep(180);
  const preset = await shot(cdp, '3d-preset-dong.png');
  const saved = await ev(cdp, `(() => {
    const j = JSON.parse(localStorage.getItem('okuma_sim3d_colors') || '{}');
    const stock = (document.querySelector('#sim3dWrap [data-c3="stock"]') || {}).value;
    const px = window.OKU3D.probe();
    return { preset: j.preset, stock: j.stock, input: stock, px, bg: j.bg };
  })()`);
  if (saved.preset !== 'dong' || String(saved.stock).toLowerCase() !== '#c47a45') errors.push('Preset Đồng chưa lưu: ' + JSON.stringify(saved));
  if (String(saved.input).toLowerCase() !== '#c47a45') errors.push('Ô màu phôi chưa đổi');
  const redder = (saved.px || []).some(p => p[0] > p[2] + 18);
  if (!redder) errors.push('Màu đồng không hiện trên hình: ' + JSON.stringify(saved.px));
  return { panel, preset, saved };
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
    const gestures = await checkRoundAndGestures(cdp, errors, 'served');
    const colors = await checkColors(cdp, errors);
    const http = requests.filter(u => /^https?:/i.test(u) && !u.startsWith('http://127.0.0.1:8765'));
    if (http.length) errors.push('Gọi mạng ngoài: ' + http.join(' | '));
    const report = { ok: errors.length === 0, gestures, colors: { panel: colors.panel, preset: colors.preset, saved: colors.saved }, errors };
    console.log(JSON.stringify(report, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    try { cdp.ws.close(); } catch (e) { /* ignore */ }
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
  if (!fs.existsSync(htmlPath)) throw new Error('Chưa build offline');
  const errors = [], requests = [];
  const { chrome, profile, cdp } = await launchChrome();
  watch(cdp, errors, requests);
  try {
    await prep(cdp, true);
    await cdp.send('Page.navigate', { url: 'file://' + htmlPath });
    await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('#btnSupport')`);
    const online = await ev(cdp, `navigator.onLine`);
    const proto = await ev(cdp, `location.protocol`);
    const gestures = await checkRoundAndGestures(cdp, errors, 'offline');
    const http = requests.filter(u => /^https?:/i.test(u));
    if (http.length) errors.push('file:// đã gọi mạng: ' + http.join(' | '));
    if (proto !== 'file:') errors.push('protocol=' + proto);
    if (online !== false) errors.push('onLine=' + online);
    const report = { ok: errors.length === 0, proto, online, gestures, errors };
    console.log(JSON.stringify(report, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    try { cdp.ws.close(); } catch (e) { /* ignore */ }
    chrome.kill('SIGKILL');
    spawnSync('rm', ['-rf', profile]);
  }
}

const run = mode === 'file' ? runFile : runServed;
run().catch(err => { console.error(err); process.exit(1); });
