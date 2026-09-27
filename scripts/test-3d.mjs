#!/usr/bin/env node
/**
 * Headless phone-size check of the 3D lathe view:
 * served site, then the offline HTML via file:// with the network cut.
 * Saves screenshots and a short mp4.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = '/opt/cursor/artifacts/screenshots';
const videoPath = '/opt/cursor/artifacts/3d-sim-demo.mp4';
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
    '--headless=new',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--no-first-run',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-features=Translate,OptimizationHints,MediaRouter',
    '--hide-scrollbars',
    '--window-size=390,844',
    '--lang=vi',
    '--user-data-dir=' + profile,
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    'about:blank'
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
  const cdp = await connect(page.webSocketDebuggerUrl);
  return { chrome, profile, cdp };
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
  if (offline) {
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
}

async function openSim(cdp) {
  await ev(cdp, `document.querySelector('#setupSample').click()`);
  await waitFor(cdp, `!!document.querySelector('[data-step="5"]')`);
  await ev(cdp, `document.querySelector('[data-step="5"]').click()`);
  await waitFor(cdp, `!!document.querySelector('#cvSim3d') && !!window.OKU3D && !!document.querySelector('#simStep')`);
  await sleep(250);
  const labels = await ev(cdp, `(() => ({
    both: (document.querySelector('#simBoth')||{}).textContent,
    sec: (document.querySelector('#simSection')||{}).textContent,
    cam: (document.querySelector('#simCam')||{}).textContent,
    ok: window.OKU3D.ok(),
    fail: window.OKU3D.fail(),
    verts: window.OKU3D.verts()
  }))()`);
  if (labels.both !== 'Cả hai') throw new Error('Thiếu nhãn 3D: ' + JSON.stringify(labels));
  if (labels.sec !== 'Mặt cắt' || labels.cam !== 'Đặt lại góc nhìn') throw new Error('Nhãn điều khiển: ' + JSON.stringify(labels));
  if (!labels.ok) throw new Error('WebGL lỗi: ' + labels.fail);
  if (labels.verts < 200) throw new Error('Lưới 3D quá ít đỉnh: ' + labels.verts);
  await ev(cdp, `document.querySelector('#sim3d').click()`);
  await sleep(200);
  await ev(cdp, `document.querySelector('#cvSim3d').scrollIntoView({ block: 'start' })`);
  await sleep(120);
}

async function probe(cdp) {
  const px = await ev(cdp, `window.OKU3D.probe()`);
  if (!px || !px.length) throw new Error('Không đọc được điểm ảnh 3D');
  let diff = 0;
  px.forEach(p => { diff += Math.abs(p[0] - 231) + Math.abs(p[1] - 238) + Math.abs(p[2] - 244); });
  return { px, diff, verts: await ev(cdp, `window.OKU3D.verts()`) };
}

async function runServed() {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  await sleep(250);
  const errors = [], requests = [];
  const { chrome, profile, cdp } = await launchChrome();
  const frames = [];
  watch(cdp, errors, requests);
  cdp.on((method, params) => {
    if (method === 'Page.screencastFrame') {
      frames.push(params.data);
      cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
    }
  });
  const shots = [];
  try {
    await prep(cdp, false);
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8765/' });
    await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('#setupNew')`);
    await sleep(200);
    await openSim(cdp);
    const stepped = await ev(cdp, `(() => { const b = document.querySelector('#simStep'); for (let i = 0; i < 36; i++) b.click(); return (document.querySelector('#simStatus')||{}).textContent; })()`);
    await sleep(200);
    const midPx = await probe(cdp);
    if (midPx.diff < 40) throw new Error('Giữa mô phỏng 3D gần như trống: ' + JSON.stringify(midPx));
    shots.push(await shot(cdp, '3d-mid-sim.png'));

    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, maxWidth: 390, maxHeight: 844, everyNthFrame: 2 });
    await ev(cdp, `(() => { const s = document.querySelector('#simSpeed'); s.value = '2'; s.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#simPlay').click(); return true; })()`);
    await sleep(6500);
    await ev(cdp, `document.querySelector('#simPause').click()`);
    await cdp.send('Page.stopScreencast').catch(() => {});
    await sleep(200);

    await ev(cdp, `(() => { const b = document.querySelector('#simStep'); let n = 0; while (n < 500 && !((document.querySelector('#simStatus')||{}).textContent||'').includes('đã chạy hết')) { b.click(); n++; } return n; })()`);
    await sleep(200);
    const finPx = await probe(cdp);
    if (finPx.diff < 40) throw new Error('Thành phẩm 3D trống: ' + JSON.stringify(finPx));
    shots.push(await shot(cdp, '3d-finished.png'));
    await ev(cdp, `document.querySelector('#simSection').click()`);
    await sleep(280);
    const secPx = await probe(cdp);
    if (secPx.diff < 40) throw new Error('Mặt cắt 3D trống: ' + JSON.stringify(secPx));
    shots.push(await shot(cdp, '3d-section.png'));
    const gate = await ev(cdp, `(document.querySelector('.simgate')||{}).textContent || ''`);
    if (!gate.includes('Đã mô phỏng')) throw new Error('Chưa khóa xuất sau mô phỏng: ' + gate);

    await ev(cdp, `document.querySelector('#prev3d').scrollIntoView({ block: 'center' })`);
    await waitFor(cdp, `!!document.querySelector('#prev3d')`);
    await ev(cdp, `document.querySelector('#prev3d').click()`);
    await sleep(300);
    await waitFor(cdp, `window.OKU3D && window.OKU3D.ok() && window.OKU3D.verts() > 200`);
    const prevPx = await probe(cdp);
    if (prevPx.diff < 40) throw new Error('Xem trước 3D trống: ' + JSON.stringify(prevPx));
    shots.push(await shot(cdp, '3d-preview-finished.png'));

    let video = null;
    if (frames.length >= 4) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okuma-vid-'));
      frames.forEach((b64, i) => fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.jpg'), Buffer.from(b64, 'base64')));
      fs.mkdirSync(path.dirname(videoPath), { recursive: true });
      const ff = spawnSync('ffmpeg', ['-y', '-framerate', '12', '-i', path.join(dir, '%04d.jpg'), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath], { encoding: 'utf8' });
      fs.rmSync(dir, { recursive: true, force: true });
      if (ff.status !== 0) errors.push('ffmpeg: ' + (ff.stderr || '').slice(-400));
      else video = videoPath;
    } else errors.push('Screencast quá ít khung: ' + frames.length);

    const http = requests.filter(u => /^https?:/i.test(u) && !u.startsWith('http://127.0.0.1:8765'));
    if (http.length) errors.push('Gọi mạng ngoài: ' + http.join(' | '));
    const report = { ok: errors.length === 0, stepped, midPx, secPx, finPx, prevPx, gate, frames: frames.length, shots, video, errors };
    console.log(JSON.stringify(report, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    try { cdp.ws.close(); } catch (e) { /* ignore */ }
    chrome.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
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
    await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('#btnOfflineHtml')`);
    const online = await ev(cdp, `navigator.onLine`);
    const proto = await ev(cdp, `location.protocol`);
    await openSim(cdp);
    await ev(cdp, `(() => { const b = document.querySelector('#simStep'); for (let i = 0; i < 36; i++) b.click(); return true; })()`);
    await sleep(200);
    const mid = await probe(cdp);
    if (mid.diff < 40) throw new Error('Offline 3D trống: ' + JSON.stringify(mid));
    const shotMid = await shot(cdp, '3d-offline-mid.png');
    await ev(cdp, `document.querySelector('#simSection').click()`);
    await sleep(200);
    const shotSec = await shot(cdp, '3d-offline-section.png');
    await ev(cdp, `(() => { const b = document.querySelector('#simStep'); let n = 0; while (n < 500 && !((document.querySelector('#simStatus')||{}).textContent||'').includes('đã chạy hết')) { b.click(); n++; } document.querySelector('#simSection').click(); return n; })()`);
    await sleep(200);
    const fin = await probe(cdp);
    const shotFin = await shot(cdp, '3d-offline-finished.png');
    const http = requests.filter(u => /^https?:/i.test(u));
    if (http.length) errors.push('file:// đã gọi mạng: ' + http.join(' | '));
    if (proto !== 'file:') errors.push('protocol=' + proto);
    if (online !== false) errors.push('onLine=' + online);
    if (fin.diff < 40) errors.push('Thành phẩm offline trống');
    const report = { ok: errors.length === 0, proto, online, mid, fin, shots: [shotMid, shotSec, shotFin], errors };
    console.log(JSON.stringify(report, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    try { cdp.ws.close(); } catch (e) { /* ignore */ }
    chrome.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

const run = mode === 'file' ? runFile : runServed;
run().catch(err => { console.error(err); process.exit(1); });
