#!/usr/bin/env node
/**
 * Open download/okuma-app-offline.html via file:// in headless Chrome
 * with the network disabled. Checks IGF, process edit, simulation,
 * .MIN export, localStorage, and that the page logs no console errors.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'download', 'okuma-app-offline.html');
const shotDir = '/opt/cursor/artifacts/screenshots';
const fileUrl = 'file://' + htmlPath;

// A real network namespace makes navigator.onLine false. CDP's offline
// emulation blocks HTTP but leaves onLine true in this Chrome build.
if (process.env.OKUMA_OFFLINE_NS !== '1' && !process.env.OKUMA_OFFLINE_NO_NS) {
  const { spawnSync } = await import('node:child_process');
  const script = fileURLToPath(import.meta.url);
  const r = spawnSync('unshare', [
    '--net', '--map-root-user', 'bash', '-c',
    '(ip link set lo up || /usr/sbin/ifconfig lo up) && OKUMA_OFFLINE_NS=1 node ' + JSON.stringify(script)
  ], { stdio: 'inherit' });
  process.exit(r.status == null ? 1 : r.status);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.method + ' ' + JSON.stringify(msg.error)));
        else resolve(msg.result || {});
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg.method, msg.params || {});
      }
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
    ws.addEventListener('error', () => reject(new Error('websocket error ' + url)));
  });
  return new CDP(ws);
}

async function waitFor(cdp, expr, timeout = 8000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval ' + JSON.stringify(r.exceptionDetails));
    last = r.result.value;
    if (last) return last;
    await sleep(40);
  }
  throw new Error('Hết giờ chờ: ' + expr + ' giá trị cuối=' + last);
}

async function ev(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true
  });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error(d.text + ' ' + (d.exception && d.exception.description || ''));
  }
  return r.result.value;
}

async function shot(cdp, name) {
  fs.mkdirSync(shotDir, { recursive: true });
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(shotDir, name);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

async function main() {
  if (!fs.existsSync(htmlPath)) throw new Error('Chưa có ' + htmlPath + ' — chạy node scripts/build-offline.mjs');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'okuma-chrome-'));
  const chromeBin = fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : 'google-chrome';
  const chrome = spawn(chromeBin, [
    '--headless=new',
    '--disable-gpu',
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

  const errors = [];
  const requests = [];
  const dialogs = [];
  let cdp;
  try {
    let port = 0;
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 80 && !port; i++) {
      if (fs.existsSync(portFile)) port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
      else await sleep(100);
    }
    if (!port) throw new Error('Chrome không mở cổng gỡ lỗi');
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find(t => t.type === 'page');
    if (!page) throw new Error('Không có tab');
    cdp = await connect(page.webSocketDebuggerUrl);
    cdp.on((method, params) => {
      if (method === 'Runtime.exceptionThrown') errors.push('exception: ' + (params.exceptionDetails && params.exceptionDetails.text));
      if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert')) {
        const text = (params.args || []).map(a => a.value || a.description || '').join(' ');
        errors.push('console.' + params.type + ': ' + text);
      }
      if (method === 'Log.entryAdded' && params.entry && (params.entry.level === 'error' || params.entry.level === 'assert')) {
        errors.push('log: ' + params.entry.text + ' ' + (params.entry.url || ''));
      }
      if (method === 'Network.requestWillBeSent') requests.push(params.request.url);
      if (method === 'Network.loadingFailed') errors.push('netfail: ' + params.errorText + ' ' + params.type);
      if (method === 'Page.javascriptDialogOpening') {
        dialogs.push(params.message);
        cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(e => errors.push('dialog: ' + e.message));
      }
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
    });
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true
    });
    await cdp.send('Page.navigate', { url: fileUrl });
    await waitFor(cdp, 'document.readyState === "complete" && !!document.querySelector("#btnSupport")');
    await sleep(200);
    await ev(cdp, `document.querySelector('#btnSupport').click()`);
    await waitFor(cdp, `document.querySelector('#support').hidden === false && !!document.querySelector('#offlineNote')`);

    const offline = await ev(cdp, 'navigator.onLine');
    const proto = await ev(cdp, 'location.protocol');
    const btn = await ev(cdp, `(() => {
      const a = document.querySelector('#btnOfflineHtml');
      const z = document.querySelector('#btnOfflineZip');
      const note = document.querySelector('#offlineNote');
      const box = document.querySelector('#offlineBtns');
      return { text: a.textContent, href: a.href, zip: z.href, note: note.textContent, hidden: !!box.hidden, sw: 'serviceWorker' in navigator };
    })()`);
    if (!btn.note.includes('bản một tệp')) throw new Error('Thiếu ghi chú bản offline: ' + btn.note);
    if (!btn.hidden) throw new Error('Nút tải vẫn hiện trên bản một tệp');
    if (btn.text !== 'Tải bản chạy offline') throw new Error('Sai nhãn nút: ' + btn.text);
    if (!btn.href.endsWith('/download/okuma-app-offline.html')) throw new Error('Sai link HTML: ' + btn.href);
    if (!btn.zip.endsWith('/download/okuma-app-offline.zip')) throw new Error('Sai link zip: ' + btn.zip);
    const shotBtn = await shot(cdp, 'offline-download-button.png');
    await ev(cdp, `document.querySelector('#supportClose').click()`);

    await ev(cdp, `document.querySelector('#setupTest1').click()`);
    await waitFor(cdp, `!!document.querySelector('#igfCv')`);
    const shape = await ev(cdp, `(() => {
      const cv = document.querySelector('#igfCv');
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let diff = 0; const b0 = d[0], b1 = d[1], b2 = d[2];
      for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i]-b0)+Math.abs(d[i+1]-b1)+Math.abs(d[i+2]-b2) > 12) diff++;
      return { w: cv.width, h: cv.height, diff };
    })()`);
    if (!shape.diff) throw new Error('Canvas IGF trống');

    await ev(cdp, `document.querySelector('[data-step="5"]').click()`);
    await waitFor(cdp, `document.querySelectorAll('#igfOps button[data-a="ed"]').length > 0`);
    const before = await ev(cdp, `document.querySelector('#igfOps li small').textContent`);
    await ev(cdp, `document.querySelector('#igfOps button[data-a="ed"]').click()`);
    await waitFor(cdp, `!!document.querySelector('#f_feed')`);
    await ev(cdp, `(() => { const el = document.querySelector('#f_feed'); el.value = '0.33'; el.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#opSave').click(); return true; })()`);
    await waitFor(cdp, `document.querySelector('#sheet').hidden === true && (document.querySelector('#igfOps li small')||{}).textContent && (document.querySelector('#igfOps li small').textContent).includes('F0.33')`);
    const after = await ev(cdp, `document.querySelector('#igfOps li small').textContent`);
    const stored = await ev(cdp, `(() => { const lib = JSON.parse(localStorage.getItem('okuma_lb3000_setups_v1')); const s = lib.items.find(x => x.name === 'TEST1') || lib.items[0]; return s.project.ops[0].feed; })()`);
    if (stored !== 0.33) throw new Error('localStorage không lưu feed, giá trị=' + stored);

    await ev(cdp, `document.querySelector('[data-step="6"]').click()`);
    await waitFor(cdp, `!!document.querySelector('#cvSim') && !!document.querySelector('#simStep')`);
    const sim = await ev(cdp, `(() => {
      const btn = document.querySelector('#simStep');
      let n = 0;
      while (n < 5000) {
        const t = (document.querySelector('#simStatus') || {}).textContent || '';
        if (t.includes('đã chạy hết')) return { n, t };
        btn.click();
        n++;
      }
      return { n, t: (document.querySelector('#simStatus') || {}).textContent || '' };
    })()`);
    if (!sim.t.includes('đã chạy hết')) throw new Error('Mô phỏng không xong: ' + sim.t);
    await ev(cdp, `document.querySelector('#cvSim').scrollIntoView({ block: 'center' })`);
    await sleep(100);
    const shotApp = await shot(cdp, 'offline-file-open.png');

    await ev(cdp, `document.querySelector('[data-step="7"]').click()`);
    await waitFor(cdp, `!!document.querySelector('#igfDl') && (document.querySelector('.simgate')||{}).textContent && document.querySelector('.simgate').textContent.includes('Đã mô phỏng')`);
    await ev(cdp, `(() => {
      window.__dl = '';
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (b) => { const u = orig(b); if (b && b.text) b.text().then(t => { window.__dl = t; }); return u; };
      document.querySelector('#igfDl').click();
      return true;
    })()`);
    const exported = await waitFor(cdp, `window.__dl && window.__dl.length > 20 ? window.__dl.slice(0, 1500) : ''`);
    if (!exported.includes('F0.33')) throw new Error('File .MIN không có F0.33:\\n' + exported);
    if (!exported.includes('$TEST1.MIN%') || !/G50|G00|OTEST1/.test(exported)) throw new Error('File .MIN không giống chương trình OSP:\\n' + exported);

    await cdp.send('Page.reload', { ignoreCache: true });
    await waitFor(cdp, `document.readyState === "complete" && !!document.querySelector('#setupList li')`);
    const stored2 = await ev(cdp, `(() => { const lib = JSON.parse(localStorage.getItem('okuma_lb3000_setups_v1')); const s = lib.items.find(x => x.name === 'TEST1') || lib.items[0]; return s.project.ops[0].feed; })()`);
    if (stored2 !== 0.33) throw new Error('Sau khi tải lại, feed mất: ' + stored2);

    const httpReqs = requests.filter(u => /^https?:/i.test(u));
    if (httpReqs.length) errors.push('Đã gọi mạng: ' + httpReqs.join(' | '));
    if (proto !== 'file:') errors.push('protocol=' + proto);
    if (offline !== false) errors.push('navigator.onLine=' + offline + ' (mong đợi false khi cắt mạng)');
    const badDialog = dialogs.filter(m => /Chưa mô phỏng/.test(m));
    if (badDialog.length) errors.push('Xuất mã khi chưa mô phỏng: ' + badDialog.join(' / '));
    if (!/TEST1/.test(await ev(cdp, `(document.querySelector('#setupList')||{}).textContent || ''`))) errors.push('Sau khi tải lại không thấy setup TEST1');

    const report = {
      ok: errors.length === 0,
      protocol: proto,
      onLine: offline,
      button: btn,
      shape,
      summaryBefore: before,
      summaryAfter: after,
      sim,
      exportHead: exported.split(/\r?\n/).slice(0, 8),
      storedAfterReload: stored2,
      dialogs,
      httpRequests: httpReqs,
      errors,
      screenshots: [shotBtn, shotApp]
    };
    console.log(JSON.stringify(report, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    try { if (cdp) cdp.ws.close(); } catch (e) { /* ignore */ }
    chrome.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
