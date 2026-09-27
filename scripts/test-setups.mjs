#!/usr/bin/env node
/** Setup manager + IGF stepper. Phone 390×844, served and file://. */
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
  if (mode !== 'served') return null;
  fs.mkdirSync(shotDir, { recursive: true });
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(shotDir, name);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}
async function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'okuma-su-'));
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
function watch(cdp, errors) {
  cdp.on((method, params) => {
    if (method === 'Runtime.exceptionThrown') errors.push('exception: ' + (params.exceptionDetails && params.exceptionDetails.text));
    if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'assert')) {
      errors.push('console.' + params.type + ': ' + (params.args || []).map(a => a.value || a.description || '').join(' '));
    }
    if (method === 'Log.entryAdded' && params.entry && (params.entry.level === 'error' || params.entry.level === 'assert')) errors.push('log: ' + params.entry.text);
    if (method === 'Page.javascriptDialogOpening') cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  });
}
async function prep(cdp, offline) {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable'); await cdp.send('Network.enable');
  if (offline) await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
}
async function snapStep(cdp, n, file) {
  await ev(cdp, `document.querySelector('[data-step="${n}"]').click()`);
  await waitFor(cdp, `document.querySelector('#flowSteps button.on') && document.querySelector('#flowSteps button.on').dataset.step === '${n}'`);
  await sleep(120);
  await ev(cdp, `document.querySelector('#flowSteps').scrollIntoView({ block: 'start' })`);
  await sleep(180);
  return shot(cdp, file);
}

async function runPage(cdp, errors, tag) {
  await ev(cdp, `(() => {
    localStorage.removeItem('okuma_lb3000_setups_v1');
    localStorage.setItem('okuma_lb3000_v1', JSON.stringify({
      settings: { progName: 'MIGRATE1', comment: 'Da luu', stockD: 55, stockL: 90, material: 'AL' },
      ops: []
    }));
    return true;
  })()`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('#setupList li')`);
  const migrated = await ev(cdp, `document.querySelector('#setupList').textContent`);
  if (!migrated.includes('Da luu')) errors.push(tag + ' không chuyển setup cũ: ' + migrated);
  await ev(cdp, `document.querySelector('#setupList [data-sa="open"]').click()`);
  await waitFor(cdp, `!!document.querySelector('#setForm')`);
  await ev(cdp, `document.querySelector('[data-step="2"]').click()`);
  await waitFor(cdp, `!!document.querySelector('[data-k="od"]')`);
  const od = await ev(cdp, `document.querySelector('[data-k="od"]').value`);
  if (String(od) !== '55') errors.push(tag + ' phôi migrate không phải Ø55: ' + od);
  await ev(cdp, `document.querySelector('#flowToSetup').click()`);
  await waitFor(cdp, `!!document.querySelector('#setupNew') && document.querySelector('#v-setup').classList.contains('on')`);

  await ev(cdp, `document.querySelector('#setupTest1').click()`);
  await waitFor(cdp, `!!document.querySelector('#igfCv') && document.querySelector('#headTitle').textContent === 'TEST1'`);
  const shots = {};
  shots.s1 = await snapStep(cdp, 1, 'step-1-thiet-lap.png');
  const machine = await ev(cdp, `!!document.querySelector('#setForm') && !!document.querySelector('[data-k="grip"]')`);
  if (!machine) errors.push(tag + ' bước Thiết lập thiếu máy hoặc kẹp');
  shots.s2 = await snapStep(cdp, 2, 'step-2-phoi.png');
  const blank = await ev(cdp, `document.querySelector('[data-k="od"]').value + 'x' + document.querySelector('[data-k="ol"]').value`);
  if (blank !== '100x82') errors.push(tag + ' TEST1 phôi sai: ' + blank);
  shots.s3 = await snapStep(cdp, 3, 'step-3-bien-dang.png');
  const shape = await ev(cdp, `document.querySelectorAll('#elList .el').length`);
  if (shape < 3) errors.push(tag + ' biên dạng TEST1 trống');
  shots.s4 = await snapStep(cdp, 4, 'step-4-nguyen-cong.png');
  const ops = await ev(cdp, `document.querySelectorAll('#igfOps li.op').length`);
  if (ops < 1) errors.push(tag + ' không có nguyên công');
  shots.s5 = await snapStep(cdp, 5, 'step-5-mo-phong.png');
  await waitFor(cdp, `!!document.querySelector('#cvSim') && !!document.querySelector('#simPlay')`);
  const sim = await ev(cdp, `(() => {
    const btn = document.querySelector('#simStep');
    let n = 0;
    while (n < 5000) {
      const t = (document.querySelector('#simStatus') || {}).textContent || '';
      if (t.includes('đã chạy hết')) return { n, t };
      btn.click(); n++;
    }
    return { n, t: (document.querySelector('#simStatus') || {}).textContent || '' };
  })()`);
  if (!sim.t.includes('đã chạy hết')) errors.push(tag + ' mô phỏng không xong: ' + sim.t);
  shots.s6 = await snapStep(cdp, 6, 'step-6-xuat-code.png');
  await waitFor(cdp, `!!document.querySelector('#safeExport') && document.querySelector('#safeExport').textContent.includes('dry run')`);
  await ev(cdp, `document.querySelector('#safeExport').scrollIntoView({ block: 'center' })`);
  await sleep(150);
  shots.remind = await shot(cdp, 'step-6-safety-reminder.png');
  await waitFor(cdp, `!!document.querySelector('#igfDl') && (document.querySelector('.simgate')||{}).textContent.includes('Đã mô phỏng')`);
  await ev(cdp, `(() => {
    window.__dl = '';
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { const u = orig(b); if (b && b.text) b.text().then(t => { window.__dl = t; }); return u; };
    document.querySelector('#igfDl').click();
    return true;
  })()`);
  const exported = await waitFor(cdp, `window.__dl && window.__dl.length > 20 ? window.__dl.slice(0, 800) : ''`);
  if (!/OTEST1/.test(exported) || !/G50|G00/.test(exported)) errors.push(tag + ' .MIN sai: ' + exported.slice(0, 180));

  await ev(cdp, `document.querySelector('#flowToSetup').click()`);
  await waitFor(cdp, `document.querySelector('#v-setup').classList.contains('on')`);
  await ev(cdp, `document.querySelector('#setupNew').click()`);
  await waitFor(cdp, `!!document.querySelector('#nameAsk')`);
  await ev(cdp, `(() => { const el = document.querySelector('#nameAsk'); el.value = 'Truc A'; document.querySelector('#nameOk').click(); return true; })()`);
  await waitFor(cdp, `document.querySelector('#headTitle').textContent === 'Truc A' && !!document.querySelector('#setForm')`);
  await ev(cdp, `document.querySelector('#flowToSetup').click()`);
  await waitFor(cdp, `document.querySelectorAll('#setupList li').length >= 3`);
  await ev(cdp, `window.scrollTo(0, 0)`);
  await sleep(150);
  const clean = await ev(cdp, `(() => {
    const head = document.querySelector('header.bar').getBoundingClientRect();
    const title = document.querySelector('#v-setup h2').getBoundingClientRect();
    const warn = document.querySelector('#warnTop');
    const off = document.querySelector('#offlineGet');
    return {
      titleTop: title.top, headBottom: head.bottom,
      warnVisible: warn.getClientRects().length > 0,
      offVisible: off.getClientRects().length > 0,
      inPopup: !!document.querySelector('#support #warnTop') && !!document.querySelector('#support #offlineGet')
    };
  })()`);
  if (clean.warnVisible || clean.offVisible) errors.push(tag + ' cảnh báo hoặc thẻ offline còn trên màn hình chính');
  if (!clean.inPopup) errors.push(tag + ' thiếu nội dung trong Hỗ trợ');
  if (!(clean.titleTop >= clean.headBottom - 2 && clean.titleTop < clean.headBottom + 36)) errors.push(tag + ' danh sách setup không sát đầu trang: ' + JSON.stringify(clean));
  shots.clean = await shot(cdp, 'setup-start-clean.png');
  shots.manager = shots.clean;
  await ev(cdp, `document.querySelector('#btnSupport').click()`);
  await waitFor(cdp, `document.querySelector('#support').hidden === false && document.querySelector('#warnTop').getClientRects().length > 0`);
  await sleep(200);
  shots.helpTop = await shot(cdp, 'help-popup-top.png');
  const help = await ev(cdp, `(() => {
    const t = document.querySelector('#support').innerText;
    const a = document.querySelector('#btnOfflineHtml');
    const note = document.querySelector('#offlineNote');
    return { hasWarn: t.includes('BẮT BUỘC'), hasDl: !!(a && a.offsetParent), href: a ? a.href : '', hasGuide: t.includes('TURNING SHAPE'), note: note ? note.textContent : '' };
  })()`);
  if (!help.hasWarn || !help.hasGuide) errors.push(tag + ' popup Hỗ trợ thiếu nội dung: ' + JSON.stringify(help));
  if (help.note) {
    if (!help.note.includes('bản một tệp') || help.hasDl) errors.push(tag + ' bản offline vẫn hiện nút tải: ' + JSON.stringify(help));
  } else if (!help.hasDl || !help.href.endsWith('/download/okuma-app-offline.html')) errors.push(tag + ' sai nút tải offline: ' + JSON.stringify(help));
  await ev(cdp, `document.querySelector('#supportIn').scrollTop = document.querySelector('#supportIn').scrollHeight`);
  await sleep(200);
  shots.helpScroll = await shot(cdp, 'help-popup-scrolled.png');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 40, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 200, y: 40, button: 'left', clickCount: 1 });
  await waitFor(cdp, `document.querySelector('#support').hidden === true`);

  await ev(cdp, `(() => {
    const li = [...document.querySelectorAll('#setupList li')].find(n => n.textContent.includes('TEST1') && !n.textContent.includes('bản sao'));
    li.querySelector('[data-sa="copy"]').click();
    return true;
  })()`);
  await waitFor(cdp, `!!document.querySelector('#nameAsk') && document.querySelector('#sheetTitle').textContent.includes('Sao chép')`);
  await sleep(200);
  shots.copy = await shot(cdp, 'setup-copy-dialog.png');
  await ev(cdp, `(() => { document.querySelector('#nameAsk').value = 'Ban sao TEST1'; document.querySelector('#nameOk').click(); return true; })()`);
  await waitFor(cdp, `document.querySelector('#sheet').hidden === true && [...document.querySelectorAll('#setupList li')].some(n => n.textContent.includes('Ban sao TEST1'))`);

  await ev(cdp, `(() => {
    const li = [...document.querySelectorAll('#setupList li')].find(n => n.textContent.includes('Ban sao TEST1'));
    li.querySelector('[data-sa="rename"]').click();
    return true;
  })()`);
  await waitFor(cdp, `!!document.querySelector('#nameAsk')`);
  await ev(cdp, `(() => { document.querySelector('#nameAsk').value = 'TEST1 doi ten'; document.querySelector('#nameOk').click(); return true; })()`);
  await waitFor(cdp, `[...document.querySelectorAll('#setupList li')].some(n => n.textContent.includes('TEST1 doi ten'))`);

  const beforeDel = await ev(cdp, `document.querySelectorAll('#setupList li').length`);
  await ev(cdp, `(() => {
    const li = [...document.querySelectorAll('#setupList li')].find(n => n.textContent.includes('Da luu'));
    li.querySelector('[data-sa="del"]').click();
    return true;
  })()`);
  await waitFor(cdp, `document.querySelectorAll('#setupList li').length === ${beforeDel - 1}`);
  const names = await ev(cdp, `[...document.querySelectorAll('#setupList b')].map(b => b.textContent).join('|')`);
  if (names.includes('Da luu')) errors.push(tag + ' chưa xóa Da luu: ' + names);

  await ev(cdp, `(() => {
    window.__json = '';
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { const u = orig(b); if (b && b.text) b.text().then(t => { window.__json = t; }); return u; };
    document.querySelector('#setupExportAll').click();
    return true;
  })()`);
  const dumped = await waitFor(cdp, `window.__json && window.__json.includes('TEST1') ? window.__json : ''`);
  let parsed = null;
  try { parsed = JSON.parse(dumped); } catch (e) { errors.push(tag + ' JSON xuất hỏng'); }
  if (!parsed || !Array.isArray(parsed.items) || parsed.items.length < 2) errors.push(tag + ' xuất thiếu danh sách');
  const n0 = await ev(cdp, `document.querySelectorAll('#setupList li').length`);
  await ev(cdp, `(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([window.__json], 'okuma-setups.json', { type: 'application/json' }));
    const input = document.querySelector('#setupImport');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitFor(cdp, `document.querySelectorAll('#setupList li').length > ${n0}`);
  const nav = await ev(cdp, `[...document.querySelectorAll('.tabs button')].map(b => b.textContent.replace(/\\s+/g,' ').trim()).join('|')`);
  if (!nav.includes('Setup') || !nav.includes('Quy trình') || !nav.includes('Tra cứu')) errors.push(tag + ' nav sai: ' + nav);
  const marks = await ev(cdp, `(() => { document.querySelector('.tabs button[data-v="v-flow"]').click(); return [...document.querySelectorAll('#flowSteps button')].map(b => b.className + ':' + b.textContent.replace(/\\s+/g,' ')).join(' || '); })()`);
  if (!/ok/.test(marks)) errors.push(tag + ' thiếu dấu hoàn thành: ' + marks);
  return { migrated: true, blank, shape, ops, sim, exportHead: exported.split(/\n/).slice(0, 4), names, imported: true, shots };
}

async function runServed() {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  await sleep(250);
  const errors = [];
  const { chrome, profile, cdp } = await launchChrome();
  watch(cdp, errors);
  try {
    await prep(cdp, false);
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8765/' });
    await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('#setupNew')`);
    const page = await runPage(cdp, errors, 'served');
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
  const errors = [];
  const { chrome, profile, cdp } = await launchChrome();
  watch(cdp, errors);
  try {
    await prep(cdp, true);
    await cdp.send('Page.navigate', { url: 'file://' + htmlPath });
    await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('#setupNew')`);
    const online = await ev(cdp, `navigator.onLine`);
    const page = await runPage(cdp, errors, 'file');
    if (online !== false) errors.push('onLine=' + online);
    console.log(JSON.stringify({ ok: errors.length === 0, online, page, errors }, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    try { cdp.ws.close(); } catch (e) { /* bỏ */ }
    chrome.kill('SIGKILL');
    spawnSync('rm', ['-rf', profile]);
  }
}
if (mode === 'file') runFile().catch(e => { console.error(e); process.exit(1); });
else runServed().catch(e => { console.error(e); process.exit(1); });
