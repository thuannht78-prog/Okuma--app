#!/usr/bin/env node
/** PROCESS DECIDE: machining type, element range, direction. Phone 390x844. */
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
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
  return r.result.value;
}
async function shot(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(shotDir, name);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}
async function launch(w, h) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oku-pd-'));
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

const errors = [];
const srv = spawn('python3', ['-m', 'http.server', '8767', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
await sleep(300);
const { chrome, profile, cdp } = await launch(390, 844);
watch(cdp, errors);
const shots = [];
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8767/' });
  await waitFor(cdp, `!!document.querySelector('#setupNew') && !!document.querySelector('#setupNew').onclick`);
  await ev(cdp, `document.querySelector('#setupNew').click()`);
  await waitFor(cdp, `!!document.querySelector('#nameAsk')`);
  await ev(cdp, `(() => { document.querySelector('#nameAsk').value = 'PDPART'; document.querySelector('#nameOk').click(); return true; })()`);
  await waitFor(cdp, `document.querySelector('#headTitle').textContent === 'PDPART'`);
  await ev(cdp, `document.querySelector('[data-step="3"]').click()`);
  await waitFor(cdp, `!!document.querySelector('#v32frame')`);
  await waitFor(cdp, `(() => { const f = document.querySelector('#v32frame'); return !!(f && f.contentWindow && f.contentWindow.__igf32 && window.__v32Loaded); })()`, 20000);
  await ev(cdp, `(() => {
    const w = document.querySelector('#v32frame').contentWindow;
    w.__igf32.load({
      blank: { material: 'S45C', od: 100, ol: 82, id: 0 },
      start: { sx: 0, sz: 80 },
      elements: [
        { id: 'a', type: 'FACE', x: 50 },
        { id: 'b', type: 'LONG', z: 60 },
        { id: 'c', type: 'TAPER', x: 70, z: 45 },
        { id: 'd', type: 'LONG', z: 25 },
        { id: 'e', type: 'FACE', x: 100 }
      ],
      inElements: [],
      mills: [],
      side: 'out'
    });
    w.__igf32.allow = 1;
    return true;
  })()`);
  await waitFor(cdp, `(() => { const g = document.querySelector('#v32frame').contentWindow.__igf32.get(); return g && g.elements && g.elements.length === 5 && g.elements[0].x === 50 && g.elements[1].z === 60; })()`);
  await waitFor(cdp, `!!document.querySelector('#v32frame').contentWindow.document.getElementById('btnOsp')`);
  await ev(cdp, `document.querySelector('#v32frame').contentWindow.document.getElementById('btnOsp').click()`);
  await waitFor(cdp, `(() => {
    const lib = JSON.parse(localStorage.getItem('okuma_lb3000_setups_v1'));
    const s = lib.items.find(x => x.name === 'PDPART');
    const e = s && s.project.igf.elems;
    return !!(e && e.length === 5 && e[0].x === 50 && e[1].z === 60 && e[2].x === 70 && e[2].z === 45 && e[4].x === 100);
  })()`);
  await ev(cdp, `document.querySelector('[data-step="4"]').click()`);
  await waitFor(cdp, `(() => {
    const sel = [...document.querySelectorAll('[data-pd="mach"]')].find(s => s.value === 'finOd');
    return !!(sel && document.querySelector('canvas.pdcv'));
  })()`);
  await ev(cdp, `(() => {
    const card = [...document.querySelectorAll('.pdcard')].find(c => c.querySelector('[data-pd="mach"]').value === 'finOd');
    card.querySelector('[data-pdact="focus"]').click();
    return true;
  })()`);
  await waitFor(cdp, `document.querySelector('.pdcard.on [data-pd="mach"]').value === 'finOd'`);
  const types = await ev(cdp, `document.querySelector('[data-pd="mach"]').innerText`);
  for (const name of ['ROUGH OD', 'FIN. OD', 'ROUGH O. FACE', 'FIN. O. FACE', 'ROUGH ID', 'FIN. ID', 'GROOVE OD', 'THREAD OD', 'DRILL CENTER', 'DRILL BLIND', 'CUTOFF', 'M DRILL']) {
    if (!types.includes(name)) throw new Error('Thiếu kiểu ' + name);
  }
  await ev(cdp, `document.querySelector('.pdcard.on [data-pd="mach"]').scrollIntoView({block:'center'})`);
  await sleep(250);
  shots.push(await shot(cdp, 'pd-type.png'));

  const tapped = await ev(cdp, `(() => {
    function clickEl(n) {
      const cv = document.querySelector('canvas.pdcv');
      const lay = cv && cv._lay;
      if (!lay) return 'no-lay';
      let hit = null;
      for (let i = 1; i < lay.prof.length; i++) {
        if (lay.prof[i].el !== n) continue;
        const a = lay.prof[i - 1], b = lay.prof[i];
        hit = { x: (lay.X(a.z) + lay.X(b.z)) / 2, y: (lay.Y(a.x / 2) + lay.Y(b.x / 2)) / 2 };
        break;
      }
      if (!hit) return 'miss' + n;
      const rect = cv.getBoundingClientRect();
      cv.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left + hit.x * rect.width / cv.width,
        clientY: rect.top + hit.y * rect.height / cv.height
      }));
      return 'ok';
    }
    return clickEl(2) + ',' + clickEl(4) + ',' + document.querySelector('[data-pd="from"]').value + '-' + document.querySelector('[data-pd="to"]').value + ',' + document.querySelector('[data-pdact="dir"]').textContent;
  })()`);
  if (!tapped.endsWith('2-4,Hướng Z− ← về mâm') && !/2-4,Hướng Z-/.test(tapped)) throw new Error('Chọn đoạn sai: ' + tapped);
  const paint = await ev(cdp, `(() => {
    const cv = document.querySelector('canvas.pdcv');
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let orange = 0, red = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r > 200 && g > 70 && g < 160 && b < 50) orange++;
      if (r > 160 && g < 70 && b < 70) red++;
    }
    return { orange, red };
  })()`);
  if (paint.orange < 40) throw new Error('Nét chọn không nổi: ' + JSON.stringify(paint));
  if (paint.red < 8) throw new Error('Thiếu mũi tên hướng: ' + JSON.stringify(paint));
  await ev(cdp, `document.querySelector('canvas.pdcv').scrollIntoView({block:'center'})`);
  await sleep(200);
  shots.push(await shot(cdp, 'pd-lines.png'));

  await ev(cdp, `(() => {
    const card = [...document.querySelectorAll('.pdcard')].find(c => c.querySelector('[data-pd="mach"]').value === 'roughOd');
    card.querySelector('[data-pdact="focus"]').click();
    return true;
  })()`);
  await waitFor(cdp, `document.querySelector('.pdcard.on [data-pd="mach"]').value === 'roughOd'`);
  await ev(cdp, `document.querySelector('[data-pdact="dir"]').click()`);
  await waitFor(cdp, `document.querySelector('[data-pdact="dir"]').textContent.includes('Z+')`);
  const warn = await ev(cdp, `document.querySelector('.pdcard.on [data-pdwarn]').textContent`);
  if (!/RH|tay phải/.test(warn)) throw new Error('Thiếu cảnh báo tay dao: ' + warn);
  await ev(cdp, `document.querySelector('[data-pdact="dir"]').scrollIntoView({block:'start'})`);
  await sleep(200);
  shots.push(await shot(cdp, 'pd-reversed.png'));

  await ev(cdp, `(() => { document.querySelector('#pdAddType').value = 'grooveOd'; document.querySelector('#pdAdd').click(); return true; })()`);
  await waitFor(cdp, `document.querySelector('.pdcard.on [data-pd="mach"]').value === 'grooveOd'`);
  await ev(cdp, `(() => {
    const from = document.querySelector('[data-pd="from"]');
    const to = document.querySelector('[data-pd="to"]');
    from.value = '3'; from.dispatchEvent(new Event('input', { bubbles: true }));
    to.value = '3'; to.dispatchEvent(new Event('input', { bubbles: true }));
    return from.value + '-' + to.value;
  })()`);
  const stored = await ev(cdp, `(() => {
    const lib = JSON.parse(localStorage.getItem('okuma_lb3000_setups_v1'));
    const s = lib.items.find(x => x.name === 'PDPART');
    const fin = s.project.ops.find(o => o.mach === 'finOd');
    const rough = s.project.ops.find(o => o.mach === 'roughOd');
    const gr = s.project.ops.find(o => o.mach === 'grooveOd');
    const xs = fin.pts.map(p => p.x);
    return {
      fin: fin.area.from + '-' + fin.area.to + ' ' + fin.area.dir,
      xmax: Math.max.apply(null, xs),
      xmin: Math.min.apply(null, xs),
      rough: rough.area.dir,
      groove: gr.area.from + '-' + gr.area.to,
      d2: gr.d2
    };
  })()`);
  if (stored.fin !== '2-4 Zm') throw new Error('Vùng tinh sai: ' + JSON.stringify(stored));
  if (stored.xmax > 70.01 || stored.xmin < 49.99) throw new Error('Biên dạng tinh không chỉ E2–E4: ' + JSON.stringify(stored));
  if (stored.rough !== 'Zp') throw new Error('Hướng thô chưa đảo: ' + JSON.stringify(stored));
  if (stored.groove !== '3-3') throw new Error('Rãnh không trên một phần tử: ' + JSON.stringify(stored));

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
  await ev(cdp, `document.querySelector('#sim3d').click()`);
  await sleep(700);
  await ev(cdp, `document.querySelector('#cvSim3d').scrollIntoView({block:'center'})`);
  await sleep(300);
  shots.push(await shot(cdp, 'pd-sim.png'));

  await ev(cdp, `document.querySelector('[data-step="7"]').click()`);
  await waitFor(cdp, `!!document.querySelector('#igfDl') && (document.querySelector('.simgate')||{}).textContent.includes('Đã mô phỏng')`);
  await ev(cdp, `(() => {
    const pre = document.querySelector('#code');
    const t = pre.textContent;
    const i = t.indexOf('FIN. OD');
    pre.scrollTop = Math.max(0, pre.scrollHeight * (i / t.length) - 30);
    pre.scrollIntoView({block:'center'});
    return true;
  })()`);
  await sleep(200);
  shots.push(await shot(cdp, 'pd-code.png'));
  await ev(cdp, `(() => {
    window.__dl = '';
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { const u = orig(b); if (b && b.text) b.text().then(t => { window.__dl = t; }); return u; };
    document.querySelector('#igfDl').click();
    return true;
  })()`);
  const exported = await waitFor(cdp, `window.__dl && window.__dl.includes('FIN. OD') ? window.__dl : ''`);
  const at = exported.indexOf('FIN. OD Z- E2-E4');
  if (at < 0) throw new Error('MIN thiếu FIN. OD Z- E2-E4:\\n' + exported.slice(0, 400));
  const rest = exported.slice(at);
  const next = rest.search(/\r?\nN\d+/);
  const block = rest.slice(0, next > 0 ? next : rest.length);
  if (!/X50\b/.test(block) || !/X70\b/.test(block) || !block.includes('G87')) throw new Error('Khối tinh sai:\\n' + block);
  if (/X100\b/.test(block)) throw new Error('Tinh E2–E4 vẫn có X100:\\n' + block);
  if (!exported.includes('ROUGH OD Z+')) throw new Error('Thiếu ROUGH OD Z+');
  if (!exported.includes('GROOVE OD X- E3') || !/G01 X/.test(exported.slice(exported.indexOf('GROOVE OD')))) throw new Error('Thiếu rãnh E3');
  if (!exported.includes('$PDPART.MIN%') || !exported.includes('OPDPART')) throw new Error('Sai tên chương trình');
  console.log(JSON.stringify({ ok: errors.length === 0, tapped, paint, stored, shots, errors, fin: block.split(/\r?\n/).slice(0, 12) }, null, 2));
  if (errors.length) process.exitCode = 1;
} catch (e) {
  console.error(e);
  try { shots.push(await shot(cdp, 'pd-fail.png')); } catch (err) { /* bỏ */ }
  console.log(JSON.stringify({ ok: false, shots, errors }, null, 2));
  process.exitCode = 1;
} finally {
  try { cdp.ws.close(); } catch (e) { /* bỏ */ }
  chrome.kill('SIGKILL'); spawnSync('rm', ['-rf', profile]); srv.kill('SIGKILL');
}
