#!/usr/bin/env node
/** Original v32 screens plus OSP export from the embedded studio. Phone 390x844. */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = '/opt/cursor/artifacts/screenshots';
fs.mkdirSync(shotDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', () => reject(new Error('websocket'))); });
  return new CDP(ws);
}
async function waitFor(cdp, expr, timeout = 15000) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeout) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval ' + JSON.stringify(r.exceptionDetails));
    last = r.result.value;
    if (last) return last;
    await sleep(50);
  }
  throw new Error('Hết giờ: ' + expr + ' cuối=' + last);
}
async function ev(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r.result.value;
}
async function shot(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(shotDir, name);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}
async function launch(w, h) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oku-v32-'));
  const chrome = spawn(fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : 'google-chrome', [
    '--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
    '--no-first-run', '--disable-sync', '--hide-scrollbars',
    '--window-size=' + w + ',' + h, '--lang=vi', '--user-data-dir=' + profile,
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
  const cdp = await connect(page.webSocketDebuggerUrl);
  return { chrome, profile, cdp };
}
function watch(cdp, errors) {
  cdp.on((method, params) => {
    if (method === 'Runtime.exceptionThrown') errors.push('exception: ' + (params.exceptionDetails && params.exceptionDetails.text));
    if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert')) {
      const text = (params.args || []).map(a => a.value || a.description || '').join(' ');
      if (/THREE\.|WebGL|texImage2D|GL_INVALID/.test(text)) return;
      errors.push('console.' + params.type + ': ' + text);
    }
    if (method === 'Page.javascriptDialogOpening') cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  });
}
async function clickText(cdp, re) {
  return ev(cdp, `(() => { const b = [...document.querySelectorAll('button')].find(n => ${re}.test(n.textContent)); if (!b) return ''; b.click(); return b.textContent; })()`);
}

async function shootOriginal() {
  const shots = [];
  const { chrome, profile, cdp } = await launch(390, 844);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const url = 'file://' + path.join(root, 'reference', 'IGF-Profile-3D-Studio-v32.html');
    await cdp.send('Page.navigate', { url });
    await waitFor(cdp, `document.body && document.body.innerText.includes('BLANK')`);
    await sleep(400);
    shots.push(await shot(cdp, 'v32-original-phone-2d.png'));
    await ev(cdp, `document.querySelector('.igf-left').scrollIntoView({block:'end'})`);
    await sleep(200);
    shots.push(await shot(cdp, 'v32-original-phone-list.png'));
    const trong = await clickText(cdp, '/TRONG/');
    await sleep(200);
    shots.push(await shot(cdp, 'v32-original-phone-inner.png'));
    if (!trong) throw new Error('không thấy nút TRONG');
    await clickText(cdp, '/NGOÀI|NGOAI/');
    const tab3 = await clickText(cdp, '/3D/');
    await sleep(600);
    shots.push(await shot(cdp, 'v32-original-phone-3d.png'));
    if (!tab3) throw new Error('không thấy tab 3D');
    await clickText(cdp, '/PHAY/');
    await sleep(250);
    shots.push(await shot(cdp, 'v32-original-phone-mill.png'));
  } finally {
    try { cdp.ws.close(); } catch (e) { /* bỏ */ }
    chrome.kill('SIGKILL'); spawnSync('rm', ['-rf', profile]);
  }
  const desk = await launch(1280, 800);
  try {
    await desk.cdp.send('Page.enable'); await desk.cdp.send('Runtime.enable');
    await desk.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await desk.cdp.send('Page.navigate', { url: 'file://' + path.join(root, 'reference', 'IGF-Profile-3D-Studio-v32.html') });
    await waitFor(desk.cdp, `document.body && document.body.innerText.includes('ONE-TOUCH')`);
    await sleep(500);
    shots.push(await shot(desk.cdp, 'v32-original-desktop-2d.png'));
    await clickText(desk.cdp, '/3D/');
    await sleep(700);
    shots.push(await shot(desk.cdp, 'v32-original-desktop-3d.png'));
  } finally {
    try { desk.cdp.ws.close(); } catch (e) { /* bỏ */ }
    desk.chrome.kill('SIGKILL'); spawnSync('rm', ['-rf', desk.profile]);
  }
  return shots;
}

async function shootIntegrated() {
  const errors = [];
  const srv = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  await sleep(300);
  const { chrome, profile, cdp } = await launch(390, 844);
  watch(cdp, errors);
  const shots = [];
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8766/' });
    await waitFor(cdp, `!!document.querySelector('#setupNew') && !!document.querySelector('#setupNew').onclick`);
    await ev(cdp, `document.querySelector('#setupNew').click()`);
    await waitFor(cdp, `!!document.querySelector('#nameAsk')`);
    await ev(cdp, `(() => { document.querySelector('#nameAsk').value = 'V32PART'; document.querySelector('#nameOk').click(); return true; })()`);
    await waitFor(cdp, `document.querySelector('#headTitle').textContent === 'V32PART'`);
    await ev(cdp, `document.querySelector('[data-step="3"]').click()`);
    await waitFor(cdp, `!!document.querySelector('#v32frame')`);
    await waitFor(cdp, `(() => { const f = document.querySelector('#v32frame'); return !!(f && f.contentWindow && f.contentWindow.__igf32 && window.__v32Loaded && f.contentWindow.document.getElementById('btnOsp')); })()`, 20000);
    const loaded = await ev(cdp, `(() => {
      const w = document.querySelector('#v32frame').contentWindow;
      w.__igf32.load({
        blank: { material: 'S45C', od: 80, ol: 100, id: 0 },
        start: { sx: 0, sz: 0 },
        elements: [
          { id: 'a', type: 'FACE', x: 60 },
          { id: 'b', type: 'LONG', z: -40 },
          { id: 'c', type: 'TAPER', x: 70, z: -55 },
          { id: 'd', type: 'LONG', z: -90 }
        ],
        inStart: { sx: 40, sz: 0 },
        inElements: [
          { id: 'i1', type: 'LONG', z: -30 },
          { id: 'i2', type: 'FACE', x: 20 }
        ],
        mills: [],
        side: 'out'
      });
      w.__igf32.allow = 1;
      return w.document.body.innerText.includes('NGOÀI') && w.document.body.innerText.includes('TRONG');
    })()`);
    if (!loaded) throw new Error('Studio không hiện NGOÀI/TRONG');
    await waitFor(cdp, `(() => { const g = document.querySelector('#v32frame').contentWindow.__igf32.get(); return g && g.elements && g.elements.length === 4 && g.inElements && g.inElements.length === 2 && g.elements[0].x === 60; })()`);
    await ev(cdp, `document.querySelector('#v32frame').contentWindow.document.getElementById('btnOsp').click()`);
    await waitFor(cdp, `(() => { const lib = JSON.parse(localStorage.getItem('okuma_lb3000_setups_v1')); const s = lib.items.find(x => x.name === 'V32PART'); return s && s.project.igf.elems.length === 4 && s.project.igf.innerElems.length === 2; })()`);
    await ev(cdp, `document.querySelector('#v32frame').scrollIntoView({block:'center'})`);
    await sleep(400);
    shots.push(await shot(cdp, 'v32-editor.png'));
    await ev(cdp, `document.querySelector('[data-step="4"]').click()`);
    await waitFor(cdp, `document.querySelector('#flowSteps button.on') && document.querySelector('#flowSteps button.on').dataset.step === '4'`);
    await sleep(200);
    shots.push(await shot(cdp, 'v32-decide.png'));
    const kinds = await ev(cdp, `(() => { const lib = JSON.parse(localStorage.getItem('okuma_lb3000_setups_v1')); const s = lib.items.find(x => x.name === 'V32PART'); return s.project.ops.map(o => o.type).join(','); })()`);
    if (!kinds.includes('od') || !kinds.includes('id')) throw new Error('thiếu tiện ngoài/trong: ' + kinds);
    await ev(cdp, `document.querySelector('[data-step="5"]').click()`);
    await waitFor(cdp, `document.querySelectorAll('#igfOps li.op').length > 0`);
    await ev(cdp, `document.querySelector('[data-step="6"]').click()`);
    await waitFor(cdp, `!!document.querySelector('#cvSim') && !!document.querySelector('#simStep')`);
    const sim = await ev(cdp, `(() => {
      const btn = document.querySelector('#simStep');
      let n = 0;
      while (n < 8000) {
        const t = (document.querySelector('#simStatus') || {}).textContent || '';
        if (t.includes('đã chạy hết')) return t;
        btn.click(); n++;
      }
      return (document.querySelector('#simStatus') || {}).textContent || '';
    })()`);
    if (!sim.includes('đã chạy hết')) throw new Error('mô phỏng: ' + sim);
    await ev(cdp, `document.querySelector('#cvSim').scrollIntoView({block:'center'})`);
    await sleep(200);
    shots.push(await shot(cdp, 'v32-sim.png'));
    await ev(cdp, `document.querySelector('[data-step="7"]').click()`);
    await waitFor(cdp, `!!document.querySelector('#igfDl') && (document.querySelector('.simgate')||{}).textContent.includes('Đã mô phỏng')`);
    await ev(cdp, `document.querySelector('#code').scrollIntoView({block:'start'})`);
    await sleep(200);
    shots.push(await shot(cdp, 'v32-code.png'));
    await ev(cdp, `(() => {
      window.__dl = '';
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (b) => { const u = orig(b); if (b && b.text) b.text().then(t => { window.__dl = t; }); return u; };
      document.querySelector('#igfDl').click();
      return true;
    })()`);
    const exported = await waitFor(cdp, `window.__dl && window.__dl.length > 40 ? window.__dl : ''`);
    if (!exported.includes('X60') || !/X20/.test(exported)) throw new Error('MIN không theo biên dạng:\\n' + exported.slice(0, 500));
    if (!/G85|G86|G87/.test(exported) || !exported.includes('$V32PART.MIN%')) throw new Error('MIN thiếu chu trình hoặc tên:\\n' + exported.slice(0, 300));
    return { shots, kinds, head: exported.split(/\n/).slice(0, 8), errors };
  } finally {
    try { cdp.ws.close(); } catch (e) { /* bỏ */ }
    chrome.kill('SIGKILL'); spawnSync('rm', ['-rf', profile]); srv.kill('SIGKILL');
  }
}

const original = await shootOriginal();
const integrated = await shootIntegrated();
const ok = integrated.errors.length === 0;
console.log(JSON.stringify({ ok, original, integrated }, null, 2));
if (!ok) process.exit(1);
