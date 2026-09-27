#!/usr/bin/env node
/**
 * Build a single self-contained HTML file and a zip of the app.
 * Output (gitignored, rebuilt on every Pages deploy):
 *   download/okuma-app-offline.html
 *   download/okuma-app-offline.zip
 *   download/index.html
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'download');
const PAGES = 'https://thuannht78-prog.github.io/Okuma--app';
const SW_LINE = "if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { });";

const APP_FILES = [
  'index.html', 'style.css', 'gen.js', 'ui.js', 'sim3d.js', 'sw.js',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'README.md'
];

function read(name) {
  return fs.readFileSync(path.join(root, name));
}

function dataUri(name, mime) {
  return `data:${mime};base64,${read(name).toString('base64')}`;
}

function inlineScript(code) {
  const safe = code.replace(/<\/script/gi, '<\\/script');
  return `<script>\n${safe}\n</script>`;
}

function buildHtml() {
  let html = read('index.html').toString('utf8');
  const css = read('style.css').toString('utf8');
  let ui = read('ui.js').toString('utf8');
  const gen = read('gen.js').toString('utf8');
  const sim3d = read('sim3d.js').toString('utf8');

  if (!ui.includes(SW_LINE)) {
    throw new Error('Không thấy dòng đăng ký service worker trong ui.js — script build cần cập nhật.');
  }
  ui = ui.replace(SW_LINE, '/* Bản một tệp: không đăng ký service worker (không có sw.js; file:// không hỗ trợ). */');

  const replacements = [
    ['<link rel="manifest" href="./manifest.webmanifest">\n', ''],
    ['<link rel="icon" href="./icon.svg" type="image/svg+xml">', `<link rel="icon" href="${dataUri('icon.svg', 'image/svg+xml')}" type="image/svg+xml">\n<link rel="shortcut icon" href="${dataUri('icon.svg', 'image/svg+xml')}" type="image/svg+xml">`],
    ['<link rel="apple-touch-icon" href="./icon-192.png">', `<link rel="apple-touch-icon" href="${dataUri('icon-192.png', 'image/png')}">`],
    ['<link rel="stylesheet" href="./style.css">', `<style>\n${css}\n</style>`],
    ['<script src="./gen.js"></script>', inlineScript(gen)],
    ['<script src="./sim3d.js"></script>', inlineScript(sim3d)],
    ['<script src="./ui.js"></script>', inlineScript(ui)],
    ['href="./download/okuma-app-offline.html"', `href="${PAGES}/download/okuma-app-offline.html"`],
    ['href="./download/okuma-app-offline.zip"', `href="${PAGES}/download/okuma-app-offline.zip"`],
    ['<div id="offlineGet" class="offlineget">', '<div id="offlineGet" class="offlineget">\n  <p class="offnow"><b>Đây là bản một tệp.</b> Đang mở được khi không có mạng. Hai nút bên dưới chỉ để tải lại khi có mạng.</p>']
  ];
  for (const [from, to] of replacements) {
    if (!html.includes(from)) throw new Error('Không tìm thấy đoạn cần thay trong index.html: ' + from.slice(0, 80));
    html = html.replace(from, to);
  }
  if (!html.startsWith('<!doctype html>')) html = '<!-- okuma-offline-build: self-contained, no network -->\n' + html;
  else html = html.replace('<!doctype html>', '<!doctype html>\n<!-- okuma-offline-build: self-contained, no network -->');

  const banned = [
    /<script[^>]+src=/i,
    /<link[^>]+stylesheet[^>]+href="(?!data:)/i,
    /href="\.\/manifest/,
    /serviceWorker\.register/,
    /src="\.\/gen\.js"/,
    /src="\.\/sim3d\.js"/,
    /src="\.\/ui\.js"/
  ];
  for (const re of banned) {
    if (re.test(html)) throw new Error('HTML offline còn tham chiếu ngoài hoặc service worker: ' + re);
  }
  if (!html.includes('okuma_lb3000_v1') || !html.includes('Tải bản chạy offline')) {
    throw new Error('HTML offline thiếu ứng dụng hoặc nút tải.');
  }
  const scripts = [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map(m => m[1]);
  if (scripts.length !== 3) throw new Error('Cần đúng 3 script nhúng, thấy ' + scripts.length);
  scripts.forEach((code, i) => {
    const file = path.join(os.tmpdir(), `okuma-offline-check-${i}.js`);
    fs.writeFileSync(file, code);
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('Script nhúng lỗi cú pháp:\n' + r.stderr);
  });
  return html;
}

function readme() {
  return `OKUMA LB3000EX II — BẢN CHẠY OFFLINE
=====================================

Trong gói này:
1) okuma-app-offline.html — MỘT tệp. Mở trực tiếp, không cần mạng, không cần cài đặt, không cần máy chủ.
2) app/ — cả thư mục ứng dụng (nhiều tệp). Dùng khi muốn cài ra màn hình chính. Tệp HTML đơn ở trên là cách chắc chắn nhất trên điện thoại.

CÁCH MỞ TRÊN ANDROID
- Chép hoặc tải okuma-app-offline.html vào máy.
- Mở trình quản lý tệp, chạm vào tệp, chọn Chrome (hoặc trình duyệt mặc định).
- Sau khi tệp đã nằm trong máy thì không cần Wi-Fi hay 4G.

CÁCH MỞ TRÊN IPHONE
- Đưa tệp vào ứng dụng Tệp (Files).
- Chạm okuma-app-offline.html và mở bằng Safari.
- Nếu Safari chỉ xem trước, bấm Chia sẻ rồi chọn Safari.

CÁCH MỞ TRÊN MÁY TÍNH (Windows / Mac)
- Nháy đúp okuma-app-offline.html, hoặc chuột phải → Mở bằng Chrome, Edge, Firefox hoặc Safari.
- Không cần cài server, không cần internet.

LƯU CHƯƠNG TRÌNH
Dữ liệu lưu trong trình duyệt của máy đó. Xóa dữ liệu trình duyệt sẽ mất bản đang soạn.
Nên xuất dự án (.json) hoặc tải tệp .MIN để giữ bản sao.

BẢN TRÊN MÀN HÌNH CHÍNH
Nếu đã mở trang web và chọn “Thêm vào màn hình chính” (Add to Home Screen), bản đó cũng chạy offline sau lần mở đầu tiên.

CẢNH BÁO
Phải chạy thử không phôi (dry run), override thấp, từng block hoặc mô phỏng trên máy trước khi cắt.
`;
}

function downloadIndex() {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tải bản chạy offline — Okuma LB3000EX II</title>
<style>
body{margin:0;background:#eef2f5;color:#14212b;font:16px/1.45 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:16px}
h1{font-size:22px;color:#0f3d5e}
a.btn{display:block;background:#e8750a;color:#fff;text-decoration:none;text-align:center;font-weight:700;padding:14px 12px;border-radius:10px;margin:10px 0}
a.zip{display:block;background:#fff;color:#0f3d5e;border:1px solid #d5dde3;text-decoration:none;text-align:center;font-weight:700;padding:12px;border-radius:10px}
p{color:#3d4d59}
.warn{background:#fff3e0;border-left:5px solid #c62828;padding:8px 10px;border-radius:8px}
</style>
</head>
<body>
<main>
<h1>Okuma LB3000EX II — bản chạy offline</h1>
<p class="warn">Phải chạy thử không phôi hoặc mô phỏng trên máy trước khi cắt.</p>
<a class="btn" href="./okuma-app-offline.html" download="okuma-app-offline.html">Tải bản chạy offline</a>
<a class="zip" href="./okuma-app-offline.zip" download="okuma-app-offline.zip">Tải gói zip</a>
<p><b>Android:</b> tải tệp HTML, mở bằng Chrome hoặc trình quản lý tệp.<br>
<b>iPhone:</b> nếu Safari mở luôn trang, bấm Chia sẻ → Lưu vào Tệp, rồi mở bằng Safari.<br>
<b>Windows/Mac:</b> nháy đúp tệp HTML.</p>
<p>Một tệp, không cần mạng và không cần máy chủ. Dữ liệu lưu trong trình duyệt. Bản đã thêm vào màn hình chính cũng chạy offline sau lần mở đầu.</p>
<p><a href="../">← Về ứng dụng</a></p>
</main>
</body>
</html>
`;
}

function buildZip(html) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'okuma-off-'));
  fs.writeFileSync(path.join(stage, 'README.txt'), readme());
  fs.writeFileSync(path.join(stage, 'okuma-app-offline.html'), html);
  const appDir = path.join(stage, 'app');
  fs.mkdirSync(path.join(appDir, 'samples'), { recursive: true });
  for (const name of APP_FILES) fs.copyFileSync(path.join(root, name), path.join(appDir, name));
  fs.cpSync(path.join(root, 'samples'), path.join(appDir, 'samples'), { recursive: true });
  const zipPath = path.join(outDir, 'okuma-app-offline.zip');
  const r = spawnSync('zip', ['-X', '-r', '-9', zipPath, 'README.txt', 'okuma-app-offline.html', 'app'], {
    cwd: stage, encoding: 'utf8'
  });
  fs.rmSync(stage, { recursive: true, force: true });
  if (r.status !== 0) throw new Error('zip thất bại:\n' + (r.stderr || r.stdout));
  const list = spawnSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
  const need = ['README.txt', 'okuma-app-offline.html', 'app/index.html', 'app/gen.js', 'app/ui.js', 'app/sim3d.js', 'app/sw.js', 'app/style.css', 'app/samples/LB3000A.MIN'];
  for (const n of need) {
    if (!list.stdout.includes(n)) throw new Error('Zip thiếu ' + n);
  }
}

const html = buildHtml();
fs.mkdirSync(outDir, { recursive: true });
const htmlPath = path.join(outDir, 'okuma-app-offline.html');
fs.writeFileSync(htmlPath, html);
fs.writeFileSync(path.join(outDir, 'index.html'), downloadIndex());
buildZip(html);
const htmlBytes = fs.statSync(htmlPath).size;
const zipBytes = fs.statSync(path.join(outDir, 'okuma-app-offline.zip')).size;
console.log(`okuma-app-offline.html ${htmlBytes} bytes`);
console.log(`okuma-app-offline.zip ${zipBytes} bytes`);
