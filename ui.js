/* Giao diện – Okuma LB3000EX II / OSP-P300L */
(function () {
  'use strict';
  const O = window.OKU, $ = s => document.querySelector(s), KEY = 'okuma_lb3000_v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let P = load(); let R = null; let selId = null;

  function load() {
    try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.ops) { j.settings = Object.assign({}, O.DEFAULT_SETTINGS, j.settings); j.igf = Object.assign({}, O.DEFAULT_IGF, j.igf || {}); return j; } } catch (e) { }
    return { settings: Object.assign({}, O.DEFAULT_SETTINGS), ops: [], igf: Object.assign({}, O.DEFAULT_IGF) };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { } refresh(); }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); }

  // ---------- Thiết lập ----------
  const SET_FIELDS = [
    { k: 'progName', t: 'txt', label: 'Tên chương trình (chữ + số, dùng cho $TEN.MIN%)' },
    { k: 'comment', t: 'txt', label: 'Ghi chú / tên chi tiết' },
    { k: 'stockD', t: 'num', label: 'Ø phôi (mm)' }, { k: 'stockL', t: 'num', label: 'Chiều dài phôi nhô ra khỏi mâm (mm)' },
    { k: 'material', t: 'txt', label: 'Vật liệu' },
    { k: 'g50', t: 'num', label: 'G50 – giới hạn tốc độ trục chính (vòng/ph)' },
    { k: 'machMax', t: 'num', label: 'Tốc độ tối đa trục chính của máy (xem nhãn máy)' },
    { k: 'liveMax', t: 'num', label: 'Tốc độ tối đa dao động lực (xem nhãn máy)' },
    { k: 'homeX', t: 'num', label: 'Điểm thay dao X (đường kính, toạ độ phôi)' }, { k: 'homeZ', t: 'num', label: 'Điểm thay dao Z' },
    { k: 'endCode', t: 'sel', label: 'Kết thúc chương trình', opts: [['M02', 'M02'], ['M30', 'M30']] },
    { k: 'dollar', t: 'chk', label: 'Thêm dòng $TEN.MIN% (định dạng tệp — chưa thấy trong 4 sách đã tải) và % cuối. Dòng O + tên luôn được ghi (IGF, tối đa 8 ký tự).' },
    { k: 'coolant', t: 'chk', label: 'Dùng tưới nguội M08/M09' },
    { k: 'liveDir', t: 'sel', label: 'Chiều quay dao động lực', opts: [['M13', 'M13 (thuận)'], ['M14', 'M14 (nghịch)']] },
    { k: 'cDir', t: 'sel', label: 'Chiều định vị trục C', opts: [['M15', 'M15 (chiều +)'], ['M16', 'M16 (chiều −)']] },
    { k: 'x138', t: 'sel', label: 'Giá trị X khi bật trục Y (G138) đến G136', opts: [['radius', 'Bán kính — IGF LE32-238 tr.353'], ['diameter', 'Đường kính (trái sách, chỉ dùng nếu máy báo lỗi)']] },
    { k: 'tail', t: 'sel', label: 'Ụ động / chống tâm', opts: [['none', 'Không dùng'], ['quill', 'Nòng ụ động thủy lực (M56 tiến / M55 lùi)'], ['nc', 'Ụ động NC lập trình được (G195 SP= + M56/M55)']] },
    { k: 'tailSet', t: 'num', label: 'Ụ động NC: số bộ vị trí SP= (trống = không xuất G195)' },
    { k: 'tailDia', t: 'num', label: 'Ø vùng mũi chống tâm – khỏa mặt/rãnh mặt nhỏ hơn Ø này sẽ va chạm' },
    { k: 'autoRetract', t: 'chk', label: 'Tự động LÙI chống tâm trước nguyên công bị vướng (khỏa tâm, khoan tâm, tiện trong, mặt đầu, cắt đứt)' },
    { k: 'tailBarrier', t: 'chk', label: 'Bật vùng cấm ụ động M21 khi tiến / M20 khi lùi (cần cài đặt vùng cấm trên máy)' }
  ];

  function fieldHTML(fd, v, pre) {
    const id = pre + fd.k;
    if (fd.t === 'chk') return `<label class="chk"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}> ${esc(fd.label)}</label>`;
    if (fd.t === 'sel') return `<label class="fld"><span>${esc(fd.label)}</span><select id="${id}">${fd.opts.map(o => `<option value="${o[0]}" ${String(v) === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
    if (fd.t === 'area') return `<label class="fld"><span>${esc(fd.label)}</span><textarea id="${id}" spellcheck="false">${esc(v)}</textarea></label>`;
    if (fd.t === 'pts') return `<div class="fld"><span>${esc(fd.label)}</span><table class="pts" id="${id}"><thead><tr><th style="width:24%">X (Ø)</th><th style="width:24%">Z</th><th style="width:22%">Kiểu</th><th style="width:20%">R</th><th></th></tr></thead><tbody>${(v || []).map(ptRow).join('')}</tbody></table><div class="btns"><button type="button" class="b2" data-addpt="${id}">＋ Thêm điểm</button></div><div class="hint">Điểm đầu = điểm bắt đầu biên dạng trên mặt đầu. G02/G03 xuất bán kính bằng chữ I (ví dụ IGF: G02 X98 Z25 I4, LE32-238 tr.333). Nhìn +X lên, +Z sang phải: góc lượn lõm ở chân vai (đi −Z rồi lên +X) thường là G02. Chương trình tự thêm đoạn thoát ra X bắt đầu ở cuối.</div></div>`;
    const typ = fd.t === 'txt' ? 'text' : 'number';
    const im = fd.t === 'int' ? 'numeric' : 'decimal';
    return `<label class="fld"><span>${esc(fd.label)}</span><input id="${id}" type="${typ}" ${typ === 'number' ? `inputmode="${im}" step="any"` : ''} value="${esc(v)}"></label>`;
  }
  function ptRow(p) {
    p = p || { x: '', z: '', t: 'L', r: '' };
    return `<tr><td><input type="number" step="any" inputmode="decimal" value="${esc(p.x)}"></td><td><input type="number" step="any" inputmode="decimal" value="${esc(p.z)}"></td><td><select><option value="L" ${p.t === 'L' ? 'selected' : ''}>G01</option><option value="CW" ${p.t === 'CW' ? 'selected' : ''}>G02</option><option value="CCW" ${p.t === 'CCW' ? 'selected' : ''}>G03</option></select></td><td><input type="number" step="any" inputmode="decimal" value="${esc(p.r)}"></td><td><button type="button" data-delpt>✕</button></td></tr>`;
  }
  function readField(fd, pre, root) {
    const el = root.querySelector('#' + pre + fd.k); if (!el) return undefined;
    if (fd.t === 'chk') return el.checked;
    if (fd.t === 'pts') return [...el.querySelectorAll('tbody tr')].map(tr => { const i = tr.querySelectorAll('input,select'); return { x: i[0].value === '' ? '' : Number(i[0].value), z: i[1].value === '' ? '' : Number(i[1].value), t: i[2].value, r: i[3].value === '' ? '' : Number(i[3].value) }; }).filter(p => p.x !== '' && p.z !== '');
    if (fd.t === 'num' || fd.t === 'int') return el.value === '' ? '' : Number(el.value);
    return el.value;
  }
  function bindPts(root) {
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-addpt]'); if (a) { root.querySelector('#' + a.dataset.addpt + ' tbody').insertAdjacentHTML('beforeend', ptRow()); }
      const d = e.target.closest('[data-delpt]'); if (d) d.closest('tr').remove();
    });
  }

  function renderSettings() {
    const f = $('#setForm'); f.innerHTML = SET_FIELDS.map(fd => fieldHTML(fd, P.settings[fd.k], 's_')).join('');
    f.oninput = f.onchange = () => { SET_FIELDS.forEach(fd => { const v = readField(fd, 's_', f); if (v !== undefined) P.settings[fd.k] = v; }); save(); };
  }

  // ---------- Danh sách ----------
  function summary(op) {
    const t = n => 'T' + String(n).padStart(2, '0');
    switch (op.type) {
      case 'facing': return `${t(op.tool)} · Vc${op.vc} · dư ${op.zStock} · F${op.feed}`;
      case 'od': case 'id': return `${t(op.tool)}→${t(op.ftool)} · ${op.mode} · D${op.D} U${op.U} W${op.W} · ${(op.pts || []).length} điểm`;
      case 'thread': return `${t(op.tool)} · ${op.side === 'ID' ? 'Trong' : 'Ngoài'} M${op.dia}×${op.P} · Z${op.zs}→${op.ze}`;
      case 'groove': return `${t(op.tool)} · ${op.gt === 'face' ? 'Mặt' : 'Ngoài'} Ø${op.d1}/${op.d2} · rộng/sâu ${op.w}`;
      case 'cutoff': return `${t(op.tool)} · Z${op.z} · G50 S${op.maxS}`;
      case 'drill': return `${t(op.tool)} · Ø${op.dia} · Z${op.zb}${op.peck > 0 ? ' · G74 mổ ' + op.peck : ''}`;
      case 'lface': return `${t(op.tool)} · ${op.cyc} · ${op.pos === 'pcd' ? op.n + ' lỗ PCD' + op.pcd : op.pos} · sâu ${op.depth} · SB${op.sb}`;
      case 'lside': return `${t(op.tool)} · ${op.cyc} · Z${op.zs} · ${op.angs || op.n + ' lỗ'} · sâu ${op.depth}`;
      case 'mslot': return `${t(op.tool)} · Ø${op.td} · (${op.x1},${op.y1})→(${op.x2},${op.y2}) · sâu ${op.depth}`;
      case 'mpocket': return `${t(op.tool)} · ${op.lx}×${op.ly} tâm (${op.cx},${op.cy}) · sâu ${op.depth}`;
      case 'mflat': return `${t(op.tool)} · C${op.c} · sâu ${op.depth} · Z${op.z1}→${op.z2}`;
      case 'stop': return `${op.m} ${op.note || ''}`;
      case 'raw': return (op.code || '').split('\n')[0];
      default: return op.note || '';
    }
  }
  const VI_LVL = { err: 'LỖI', warn: 'Cảnh báo', info: 'Ghi chú' };
  function renderOps() {
    const ul = $('#opsList'); $('#opsEmpty').style.display = P.ops.length ? 'none' : 'block';
    $('#opCount').textContent = P.ops.length ? P.ops.length + ' nguyên công' : '';
    let tail = false;
    ul.innerHTML = P.ops.map((op, i) => {
      const m = O.OPS[op.type]; const ws = R ? R.warnings.filter(w => w.op === op.id) : [];
      const cls = ws.some(w => w.lvl === 'err') ? 'err' : ws.some(w => w.lvl === 'warn') ? 'wrn' : '';
      if (op.on !== false) { if (op.type === 'tailOn' || (op.useTail && P.settings.tail !== 'none')) tail = true; if (op.type === 'tailOff') tail = false; if (ws.some(w => /tự động LÙI/.test(w.msg))) tail = false; }
      return `<li class="op ${cls} ${op.on === false ? 'off' : ''} ${/tail/.test(op.type) ? 'tail' : ''}" data-id="${op.id}">
        <div class="oph"><span class="opn">${i + 1}</span><div class="opt"><b>${m.icon} ${esc(m.name)}${tail && op.type !== 'tailOn' && op.on !== false ? '<span class="tstate">có chống tâm</span>' : ''}</b><small>${esc(summary(op))}</small></div></div>
        ${ws.length ? `<ul class="opw">${ws.map(w => `<li class="${w.lvl}">${w.lvl === 'err' ? '⛔' : w.lvl === 'warn' ? '⚠' : 'ℹ'} ${esc(w.msg)}</li>`).join('')}</ul>` : ''}
        <div class="opb"><button data-a="up" aria-label="Lên">↑</button><button data-a="dn" aria-label="Xuống">↓</button><button data-a="ed">Sửa</button><button data-a="cp">Chép</button><button data-a="tg">${op.on === false ? 'Bật' : 'Tắt'}</button><button data-a="rm" aria-label="Xóa">🗑</button></div></li>`;
    }).join('');
    const g = R ? R.warnings.filter(w => !w.op) : [];
    $('#sumWarn').innerHTML = g.length ? `<ul class="wlist">${g.map(w => `<li class="${w.lvl}">${esc(w.msg)}</li>`).join('')}</ul>` : '';
  }
  $('#opsList').addEventListener('click', e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const id = b.closest('li.op').dataset.id, i = P.ops.findIndex(o => o.id === id); if (i < 0) return;
    const a = b.dataset.a;
    if (a === 'up' && i > 0) [P.ops[i - 1], P.ops[i]] = [P.ops[i], P.ops[i - 1]];
    if (a === 'dn' && i < P.ops.length - 1) [P.ops[i + 1], P.ops[i]] = [P.ops[i], P.ops[i + 1]];
    if (a === 'ed') return openForm(P.ops[i]);
    if (a === 'cp') { const c = JSON.parse(JSON.stringify(P.ops[i])); c.id = Math.random().toString(36).slice(2, 9); P.ops.splice(i + 1, 0, c); toast('Đã nhân bản'); }
    if (a === 'tg') P.ops[i].on = P.ops[i].on === false;
    if (a === 'rm') { if (!confirm('Xóa nguyên công này?')) return; P.ops.splice(i, 1); }
    save();
  });

  // ---------- Bảng chọn / form ----------
  function openSheet(title, html) { $('#sheetTitle').textContent = title; $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; $('#sheetBody').scrollTop = 0; }
  function closeSheet() { $('#sheet').hidden = true; }
  $('#sheetClose').onclick = closeSheet;
  $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
  $('#fab').onclick = () => {
    const groups = {}; Object.entries(O.OPS).forEach(([k, m]) => (groups[m.group] = groups[m.group] || []).push([k, m]));
    openSheet('Thêm nguyên công', Object.entries(groups).map(([g, arr]) => `<div class="grp">${esc(g)}</div><div class="typegrid">${arr.map(([k, m]) => `<button class="typebtn" data-type="${k}"><i>${m.icon}</i>${esc(m.name)}</button>`).join('')}</div>`).join(''));
    $('#sheetBody').onclick = e => { const b = e.target.closest('[data-type]'); if (b) openForm(O.newOp(b.dataset.type), true); };
  };
  const HINTS = {
    facing: 'Khỏa mặt nhiều lát từ Z+ (lượng dư) về Z0 bằng G96. Nếu đang có chống tâm và X kết thúc nhỏ hơn Ø vùng mũi tâm, chương trình sẽ báo lỗi hoặc tự lùi chống tâm.',
    od: 'LAP: G85/G86 NATxx D F U W gọi chu trình thô; biên dạng tinh nằm giữa NATxx G81 … G80; G87 NATxx chạy tinh. D và U tính theo ĐƯỜNG KÍNH. Bước tiến tinh nằm trong biên dạng.',
    id: 'Giống tiện ngoài nhưng biên dạng trong (Ø giảm dần vào trong), bù G41. Cần lỗ có sẵn/khoan trước. Không làm được khi có chống tâm.',
    thread: 'G71 X(Ø chân ren) Z(điểm cuối) B(góc) D(lát đầu, Ø) U(dư tinh, Ø) H(cao ren, Ø) F(bước) + M32/M33/M34 + M73/M74/M75. Chế độ G95, G97 tốc độ cố định. H tự tính: ngoài 1.2269×P, trong 1.0825×P.',
    groove: 'Rãnh ngoài: dao cắt theo X; rãnh rộng hơn dao sẽ ăn nhiều nhát chồng 20%. Chu trình G73/G74: D là chiều sâu mỗi nhát mổ – kiểm tra kỹ nghĩa các từ trên máy.',
    cutoff: 'Cắt đứt bắt buộc chống tâm đã LÙI. G50 riêng để giới hạn tốc độ khi dao vào gần tâm, sau đó khôi phục G50 chung.',
    drill: 'Mũi khoan tĩnh trên đài dao, trục chính quay (G97). Khoan mổ dùng G74 X0 Z D F. Đánh dấu “khoan tâm” để cho phép tiến chống tâm sau đó.',
    lface: 'Dao động lực dọc trục: M110 (nối trục C, block riêng) → G94 → SB= M13 → G181/G183/G184 X(Ø vòng lỗ) Z(đáy) C(góc) K(khoảng chạy nhanh) F(mm/ph) → các dòng C tiếp theo → G180 → M12, M109, G95. Chu trình tự kẹp/nhả trục C.',
    lside: 'Dao động lực hướng kính: G181 X(Ø đáy lỗ) Z C I(khoảng chạy nhanh theo Ø) F. Lệch tâm Y ≠ 0 dùng G138 + G19; X trong G138 là bán kính (LE32-238 tr.353).',
    mslot: 'Phay trục Y: M110, M146 (nhả trục C), G138 C (vào chế độ Y và ghi góc C), M147 (kẹp), G17, phay G01, rồi Y0 và G136. M146 = nhả, M147 = kẹp (tờ ví dụ dao động lực).',
    mpocket: 'Hốc chữ nhật zíc-zắc + chạy viền, từng lớp. Xuống dao thẳng – dùng dao cắt tâm hoặc khoan mồi.',
    mflat: 'Mặt phẳng trên mặt trụ bằng dao hướng kính, G138 + G19 (mặt YZ), đi dao theo Y, bước theo Z, từng lớp theo X.',
    tailOn: 'Xuất: về điểm thay dao, M05 (trục chính phải dừng khi tiến/lùi nòng), [G195 SP=n nếu ụ NC], M56. Cần lỗ tâm trước.',
    tailOff: 'Xuất: về điểm thay dao, M05, M55 (lùi nòng ụ động). Bắt buộc trước khi cắt đứt, khoan/khỏa tâm, tiện trong.',
    stop: 'Dừng để đo/kiểm tra. M01 chỉ dừng khi bật công tắc Optional Stop.', raw: 'Mã tự do – không được kiểm tra. Chữ sẽ đổi thành IN HOA không dấu.'
  };
  function openForm(op, isNew) {
    const m = O.OPS[op.type];
    const html = `<div class="hint">${esc(HINTS[op.type] || '')}</div><form id="opForm" class="form" autocomplete="off">${m.fields.map(fd => fieldHTML(fd, op[fd.k], 'f_')).join('')}</form><div class="btns"><button id="opSave" class="b1">${isNew ? 'Thêm vào danh sách' : 'Lưu thay đổi'}</button></div>`;
    openSheet(m.name, html);
    const form = $('#opForm'); bindPts(form);
    $('#sheetBody').onclick = null;
    $('#opSave').onclick = () => {
      m.fields.forEach(fd => { const v = readField(fd, 'f_', form); if (v !== undefined) op[fd.k] = v; });
      if (isNew) P.ops.push(op); else { const i = P.ops.findIndex(o => o.id === op.id); if (i >= 0) P.ops[i] = op; }
      selId = op.id; closeSheet(); save(); toast(isNew ? 'Đã thêm: ' + m.name : 'Đã lưu');
    };
  }

  // ---------- Mã NC ----------
  function renderCode() {
    const box = $('#code'); const hl = R.map.find(x => x.id === selId);
    box.innerHTML = R.lines.map((l, i) => {
      let c = esc(l) || ' ';
      c = c.replace(/(\([^)]*\))/g, '<span class="cmt">$1</span>').replace(/\b(NAT\d+)\b/g, '<span class="nat">$1</span>').replace(/^(T\d{6})/, '<span class="tl">$1</span>');
      return `<span class="ln${hl && i >= hl.from && i < hl.to ? ' hl' : ''}">${c}</span>`;
    }).join('');
    const ne = R.warnings.filter(w => w.lvl === 'err').length, nw = R.warnings.filter(w => w.lvl === 'warn').length;
    $('#codeStat').textContent = `${R.lines.length} dòng · ${ne} lỗi · ${nw} cảnh báo`;
    $('#codeWarn').innerHTML = R.warnings.length ? `<details class="wdet" ${ne ? 'open' : ''}><summary>${ne ? '⛔ ' + ne + ' lỗi, ' : ''}⚠ ${nw} cảnh báo – bấm để xem</summary><ul class="wlist">${R.warnings.map(w => `<li class="${w.lvl}"><b>${w.idx != null ? '#' + (w.idx + 1) + ' ' : ''}${VI_LVL[w.lvl]}:</b> ${esc(w.msg)}</li>`).join('')}</ul></details>` : '';
    if (!$('#fname').dataset.touched) $('#fname').value = O.asc(P.settings.progName).replace(/[^A-Z0-9]/g, '') || 'PROG';
  }
  $('#fname').oninput = e => { e.target.dataset.touched = 1; };
  const fileName = () => (O.asc($('#fname').value).replace(/[^A-Z0-9_-]/g, '') || 'PROG') + '.MIN';
  $('#btnCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(R.text); toast('Đã sao chép ' + R.lines.length + ' dòng'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = R.text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Đã sao chép'); }
  };
  $('#btnDl').onclick = () => {
    const b = new Blob([R.text], { type: 'application/octet-stream' }); const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = fileName(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Đã tải ' + fileName());
  };
  $('#btnShare').onclick = async () => {
    try {
      const file = new File([R.text], fileName(), { type: 'text/plain' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: fileName() });
      else if (navigator.share) await navigator.share({ title: fileName(), text: R.text });
      else { await navigator.clipboard.writeText(R.text); toast('Thiết bị không hỗ trợ chia sẻ – đã sao chép'); }
    } catch (e) { if (e.name !== 'AbortError') toast('Không chia sẻ được: ' + e.message); }
  };

  // ---------- Xem trước ----------
  function renderPrevSel() {
    const s = $('#prevSel'); s.innerHTML = `<option value="">— Tô sáng nguyên công —</option>` + P.ops.map((o, i) => `<option value="${o.id}" ${o.id === selId ? 'selected' : ''}>${i + 1}. ${esc(O.OPS[o.type].name)}</option>`).join('');
  }
  $('#prevSel').onchange = e => { selId = e.target.value || null; drawPreview(); renderCode(); };
  function num(v, d) { return v === '' || v == null || isNaN(Number(v)) ? d : Number(v); }
  function drawPreview() {
    const S = Object.assign({}, O.DEFAULT_SETTINGS, P.settings), D = num(S.stockD, 60), Rr = D / 2, Lg = num(S.stockL, 100);
    const ops = P.ops.filter(o => o.on !== false);
    const fz = ops.find(o => o.type === 'facing'); const zS = fz ? num(fz.zStock, 0) : 0;
    // ---- mặt cắt dọc
    const cv = $('#cvSide'), g = cv.getContext('2d'), Wd = cv.width, Ht = cv.height;
    g.clearRect(0, 0, Wd, Ht); g.fillStyle = '#fbfcfd'; g.fillRect(0, 0, Wd, Ht);
    const zmin = -Lg - 12, zmax = 22, rmax = Rr + 8;
    const sc = Math.min((Wd - 20) / (zmax - zmin), (Ht - 20) / (2 * rmax));
    const X = z => 10 + (z - zmin) * sc, Y = r => Ht / 2 - r * sc;
    // tâm
    g.setLineDash([10, 4, 2, 4]); g.strokeStyle = '#9ab'; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(Wd, Y(0)); g.stroke(); g.setLineDash([]);
    // mâm cặp
    g.fillStyle = '#b0bec5'; g.fillRect(X(zmin), Y(rmax), X(-Lg) - X(zmin), Y(Rr * 0.55) - Y(rmax)); g.fillRect(X(zmin), Y(-Rr * 0.55), X(-Lg) - X(zmin), Y(-rmax) - Y(-Rr * 0.55));
    // phôi
    g.fillStyle = '#eceff1'; g.fillRect(X(-Lg), Y(Rr), X(zS) - X(-Lg), Y(-Rr) - Y(Rr));
    g.strokeStyle = '#78909c'; g.setLineDash([5, 4]); g.strokeRect(X(-Lg), Y(Rr), X(zS) - X(-Lg), Y(-Rr) - Y(Rr)); g.setLineDash([]);
    g.fillStyle = '#546e7a'; g.font = '13px sans-serif'; g.fillText(`Phôi Ø${D} × ${Lg}`, X(-Lg) + 4, Y(Rr) - 5); g.fillText('Z0', X(0) - 8, Y(-Rr) + 16);
    g.strokeStyle = '#90a4ae'; g.beginPath(); g.moveTo(X(0), Y(Rr + 4)); g.lineTo(X(0), Y(-Rr - 4)); g.stroke();
    let tailOn = false;
    const line = (pts, col, w, dash, mirror) => {
      [1, -1].forEach(sg => {
        if (sg < 0 && !mirror) return;
        g.strokeStyle = col; g.lineWidth = w * (sg < 0 ? 0.6 : 1); g.globalAlpha = sg < 0 ? 0.45 : 1; g.setLineDash(dash || []);
        g.beginPath(); pts.forEach((p, i) => { const x = X(p.z), y = Y(sg * p.r); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      }); g.globalAlpha = 1; g.setLineDash([]); g.lineWidth = 1;
    };
    ops.forEach(op => {
      const hi = op.id === selId, col = hi ? '#e8750a' : null;
      if (op.type === 'tailOn' || op.useTail) tailOn = true; if (op.type === 'tailOff') tailOn = tailOn;
      if (op.type === 'facing') {
        const doc = Math.max(0.05, num(op.doc, 1)); for (let z = zS - doc; z > 0; z -= doc) line([{ z, r: Rr + 1 }, { z, r: 0 }], col || '#9aa9b5', 1, [3, 3], true);
        line([{ z: 0, r: Rr + 2 }, { z: 0, r: Math.max(0, num(op.xEnd, 0) / 2) }], col || '#1565c0', 2, null, true);
      }
      if (op.type === 'od' || op.type === 'id') {
        const inner = op.type === 'id', pts = (op.pts || []).filter(p => p.x !== '' && p.z !== '');
        if (pts.length < 2) return;
        const poly = O.profilePoly(pts.map(p => ({ x: +p.x, z: +p.z, t: p.t, r: p.r })));
        const sz = num(op.startZ, 2);
        if (op.mode !== 'none') { // lát thô
          const d = Math.max(0.2, num(op.D, 2)) / 2; const bore = num(op.bore, 10) / 2;
          const lvls = []; if (!inner) { for (let r = Rr - d; r > Math.min(...poly.map(p => p.r)) - 1e-6; r -= d) lvls.push(r); } else { for (let r = bore + d; r < Math.max(...poly.map(p => p.r)) + 1e-6; r += d) lvls.push(r); }
          lvls.forEach(r => {
            let zEnd = null; for (let i = 1; i < poly.length; i++) { const a = poly[i - 1], b = poly[i]; const cross = inner ? (a.r >= r && b.r <= r) || (a.r > r && b.r < r) : (a.r <= r && b.r >= r); if (cross && b.r !== a.r) { zEnd = a.z + (b.z - a.z) * (r - a.r) / (b.r - a.r); break; } }
            if (zEnd == null) zEnd = poly[poly.length - 1].z;
            line([{ z: sz, r }, { z: zEnd, r }], hi ? '#f3b27a' : '#b8c4cc', 1, null, true);
          });
        }
        line([{ z: sz, r: poly[0].r }, ...poly], col || '#1565c0', 2.4, null, true);
      }
      if (op.type === 'thread') {
        const d = num(op.dia, 20) / 2, P2 = Math.max(0.3, num(op.P, 1.5)), h = (op.side === 'ID' ? 0.54 : 0.61) * P2, zs = Math.min(0, num(op.zs, 0)), ze = num(op.ze, -10);
        const pts = []; let k = 0; for (let z = zs; z >= ze; z -= P2 / 2) pts.push({ z, r: op.side === 'ID' ? d - (k++ % 2 ? h : 0) : d - (k++ % 2 ? h : 0) });
        line(pts, col || '#2e7d32', 1.5, null, true);
      }
      if (op.type === 'groove') {
        g.fillStyle = hi ? '#e8750a' : '#37474f';
        if (op.gt === 'face') { const zf = num(op.zr, 0), a = num(op.d2, 10) / 2, b = num(op.d1, 20) / 2, dep = num(op.w, 2); [1, -1].forEach(s => { g.globalAlpha = s > 0 ? 1 : .45; g.fillRect(X(zf - dep), Y(s > 0 ? b : -a), X(zf) - X(zf - dep), Math.abs(Y(b) - Y(a))); }); }
        else { const zr = num(op.zr, 0), w = num(op.w, 3), a = num(op.d2, D - 3) / 2, b = num(op.d1, D) / 2; [1, -1].forEach(s => { g.globalAlpha = s > 0 ? 1 : .45; g.fillRect(X(zr - w), Y(s > 0 ? b : -a), X(zr) - X(zr - w), Math.abs(Y(b) - Y(a))); }); }
        g.globalAlpha = 1;
      }
      if (op.type === 'cutoff') { const z = num(op.z, -Lg); line([{ z, r: Rr + 6 }, { z, r: -Rr - 6 }], col || '#c62828', 2, [8, 4], false); g.fillStyle = col || '#c62828'; g.fillText('Cắt đứt', X(z) - 22, Y(Rr + 6) - 3); }
      if (op.type === 'drill') { const r = num(op.dia, 5) / 2, zb = num(op.zb, -5); g.fillStyle = hi ? '#e8750a' : '#cfd8dc'; g.fillRect(X(zb), Y(r), X(0) - X(zb), Y(-r) - Y(r)); g.strokeStyle = '#78909c'; g.strokeRect(X(zb), Y(r), X(0) - X(zb), Y(-r) - Y(r)); }
      if (op.type === 'lface') {
        const dep = num(op.depth, 5), zt = num(op.zTop, 0); let rs = [];
        if (op.pos === 'pcd' || op.pos === 'ang') rs = [num(op.pcd, 0) / 2]; else rs = O.parsePts(op.xy).map(p => Math.hypot(p.x, p.y));
        g.fillStyle = hi ? '#e8750a' : '#6d4c41'; rs.forEach(r => { g.fillRect(X(zt - dep), Y(r + 1.5), X(zt) - X(zt - dep), 3 * sc); });
      }
      if (op.type === 'lside') {
        const d = num(op.dia, D) / 2, dep = num(op.depth, 5); g.fillStyle = hi ? '#e8750a' : '#6d4c41';
        O.parseList(op.zs).forEach(z => { g.fillRect(X(z - 1.5), Y(d), 3 * sc, dep * sc); });
      }
      if (op.type === 'mflat') { const r = num(op.dia, D) / 2 - num(op.depth, 1); line([{ z: num(op.z1, 0), r }, { z: num(op.z2, -10), r }], col || '#8e24aa', 3, null, false); }
    });
    // chống tâm
    const anyTail = ops.some(o => o.type === 'tailOn' || o.useTail);
    if (anyTail && S.tail !== 'none') {
      g.fillStyle = '#6a1b9aaa'; g.beginPath(); g.moveTo(X(-1.5), Y(0)); g.lineTo(X(8), Y(5)); g.lineTo(X(8), Y(-5)); g.closePath(); g.fill();
      g.fillRect(X(8), Y(9), X(zmax) - X(8), Y(-9) - Y(9)); g.fillStyle = '#6a1b9a'; g.fillText('Chống tâm', X(2), Y(9) - 5);
    }
    // ---- mặt đầu
    const cf = $('#cvFace'), h = cf.getContext('2d'), W2 = cf.width, H2 = cf.height;
    h.clearRect(0, 0, W2, H2); h.fillStyle = '#fbfcfd'; h.fillRect(0, 0, W2, H2);
    const s2 = (Math.min(W2, H2) / 2 - 30) / (Rr + 4), cx = W2 / 2, cy = H2 / 2;
    const FX = x => cx + x * s2, FY = y => cy - y * s2;
    h.fillStyle = '#eceff1'; h.beginPath(); h.arc(cx, cy, Rr * s2, 0, 7); h.fill(); h.strokeStyle = '#78909c'; h.stroke();
    // profile rings
    const od = ops.find(o => o.type === 'od'); if (od) { const xs = [...new Set((od.pts || []).map(p => +p.x))]; h.strokeStyle = '#90caf9'; xs.forEach(x => { h.beginPath(); h.arc(cx, cy, x / 2 * s2, 0, 7); h.stroke(); }); }
    const idp = ops.find(o => o.type === 'id'); if (idp) { const xm = Math.max(...(idp.pts || []).map(p => +p.x)); h.fillStyle = '#fff'; h.beginPath(); h.arc(cx, cy, xm / 2 * s2, 0, 7); h.fill(); h.strokeStyle = '#1565c0'; h.stroke(); }
    const dr = ops.filter(o => o.type === 'drill' && !o.isCenter); dr.forEach(o => { h.fillStyle = '#fff'; h.beginPath(); h.arc(cx, cy, num(o.dia, 5) / 2 * s2, 0, 7); h.fill(); h.stroke(); });
    h.setLineDash([6, 3, 2, 3]); h.strokeStyle = '#9ab'; h.beginPath(); h.moveTo(10, cy); h.lineTo(W2 - 10, cy); h.moveTo(cx, 10); h.lineTo(cx, H2 - 10); h.stroke(); h.setLineDash([]);
    h.fillStyle = '#546e7a'; h.font = '13px sans-serif'; h.fillText('C0 / +X', W2 - 62, cy - 6); h.fillText('C90 / +Y', cx + 6, 22);
    ops.forEach(op => {
      const hi = op.id === selId;
      if (op.type === 'lface') {
        let pts = [];
        if (op.pos === 'pcd') { const n = Math.max(1, num(op.n, 1)); for (let i = 0; i < n; i++) { const a = (num(op.c0, 0) + 360 * i / n) * Math.PI / 180; pts.push([num(op.pcd, 0) / 2 * Math.cos(a), num(op.pcd, 0) / 2 * Math.sin(a)]); } }
        else if (op.pos === 'ang') O.parseList(op.angs).forEach(a => { a *= Math.PI / 180; pts.push([num(op.pcd, 0) / 2 * Math.cos(a), num(op.pcd, 0) / 2 * Math.sin(a)]); });
        else O.parsePts(op.xy).forEach(p => pts.push([p.x, p.y]));
        if (op.pos === 'pcd' || op.pos === 'ang') { h.setLineDash([4, 4]); h.strokeStyle = '#a1887f'; h.beginPath(); h.arc(cx, cy, num(op.pcd, 0) / 2 * s2, 0, 7); h.stroke(); h.setLineDash([]); }
        pts.forEach((p, i) => { h.fillStyle = hi ? '#e8750a' : '#6d4c41'; h.beginPath(); h.arc(FX(p[0]), FY(p[1]), Math.max(4, 2.5 * s2), 0, 7); h.fill(); h.fillStyle = '#333'; h.fillText(String(i + 1), FX(p[0]) + 7, FY(p[1]) - 7); });
      }
      if (op.type === 'mslot') { h.strokeStyle = hi ? '#e8750a' : '#2e7d32'; h.lineCap = 'round'; h.lineWidth = num(op.td, 4) * s2; h.beginPath(); h.moveTo(FX(num(op.x1, 0)), FY(num(op.y1, 0))); h.lineTo(FX(num(op.x2, 0)), FY(num(op.y2, 0))); h.stroke(); h.lineWidth = 1; }
      if (op.type === 'mpocket') { h.fillStyle = hi ? '#e8750a' : '#2e7d32'; const lx = num(op.lx, 5), ly = num(op.ly, 5); h.fillRect(FX(num(op.cx, 0) - lx / 2), FY(num(op.cy, 0) + ly / 2), lx * s2, ly * s2); }
      if (op.type === 'lside') {
        let angs = O.parseList(op.angs); if (!angs.length) { const n = Math.max(1, num(op.n, 1)); for (let i = 0; i < n; i++) angs.push(num(op.c0, 0) + 360 * i / n); }
        const d = num(op.dia, D) / 2, dep = num(op.depth, 5), y = num(op.y, 0);
        angs.forEach(a => { a *= Math.PI / 180; const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux; h.strokeStyle = hi ? '#e8750a' : '#6d4c41'; h.lineWidth = 5; h.beginPath(); h.moveTo(FX(d * ux + y * vx), FY(d * uy + y * vy)); h.lineTo(FX((d - dep) * ux + y * vx), FY((d - dep) * uy + y * vy)); h.stroke(); h.lineWidth = 1; });
      }
      if (op.type === 'mflat') {
        const R0 = num(op.dia, D) / 2, xf = R0 - num(op.depth, 1), a = num(op.c, 0) * Math.PI / 180, half = Math.sqrt(Math.max(0, R0 * R0 - xf * xf));
        const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux; h.strokeStyle = hi ? '#e8750a' : '#8e24aa'; h.lineWidth = 3;
        h.beginPath(); h.moveTo(FX(xf * ux - half * vx), FY(xf * uy - half * vy)); h.lineTo(FX(xf * ux + half * vx), FY(xf * uy + half * vy)); h.stroke(); h.lineWidth = 1;
      }
    });
  }

  // ---------- Tra cứu ----------
  const SRC = 'Nguồn đã đối chiếu: (1) Advanced One-Touch IGF-L OSP-P500L, Operation Reference, LE32-238-R1, 8/2023; (2) Operation Manual Basic/Tutorial, LE32-239-R1, 5/2023; (3) Okuma Basic Programming Manual, CNC Lathe, June 2005; (4) tờ ví dụ chương trình dao động lực (có bảng mã M). Máy chủ là OSP-P300L — sách IGF ghi cho OSP-P500L, cú pháp chu trình LAP lấy từ sách 2005.';
  const HELP = [
    ['Cấu trúc chương trình', [
      ['O + tên', 'Tên chương trình: chữ O rồi tối đa 8 ký tự (IGF LE32-238 tr.301, ví dụ O1234). Sách 2005 (Word Format) chỉ cho 1 chữ + 3 ký tự sau O. Ứng dụng cắt còn 8 ký tự và luôn ghi dòng này.', 'v'],
      ['$TEN.MIN%', 'Dòng đầu tệp khi truyền chương trình. Không thấy trong 4 tài liệu đã tải — vẫn là tùy chọn trong Thiết lập. Kết thúc tệp bằng % một dòng riêng.', 'u'],
      ['( ... )', 'Ghi chú – ứng dụng tự đổi thành IN HOA không dấu.', 'v'],
      ['M02 / M30', 'Kết thúc chương trình (reset, quay về đầu).', 'v'],
      ['M00 / M01', 'Dừng bắt buộc / dừng tùy chọn.', 'v'],
      ['T010101', 'Sơ đồ sách 2005 (mục bù mũi dao) ghi ba nhóm: OFFSET NO., TOOL NO., TOOL NOSE RADIUS COMPENSATION NO. Ví dụ LAP trong sách và IGF (LE32-238 tr.332) dùng T020202. Ứng dụng đặt cả ba nhóm bằng số trạm, nên thứ tự không đổi chữ số. Hủy bù trên máy vẫn phải xem trang TOOL DATA.', 'v'],
      ['G00 X Z', 'Chạy nhanh; X theo đường kính. Nên về điểm an toàn trước khi quay đài dao.', 'v']]],
    ['Trục chính & chạy dao', [
      ['G50 S', 'Giới hạn tốc độ trục chính tối đa (bắt buộc trước G96).', 'v'],
      ['G96 S / G97 S', 'Tốc độ cắt không đổi (m/ph) / tốc độ vòng cố định (vòng/ph).', 'v'],
      ['M03 / M04 / M05', 'Trục chính thuận / nghịch / dừng.', 'v'],
      ['G95 / G94', 'Bước tiến mm/vòng / mm/phút. Chu trình khoan dao động lực G181–G184 chỉ nhận G94.', 'v'],
      ['M08 / M09', 'Tưới nguội bật/tắt. Sách 2005, bảng mã M trang 2: M08 Coolant On, M09 Coolant Off.', 'v']]],
    ['LAP – tiện biên dạng', [
      ['G85 NAT01 D F U W', 'Tiện thô thanh (ROUND BAR). Sách 2005, mục LAP: D là chiều sâu cắt theo đường kính (D4 = 4 mm on diameter), U là dư tinh theo đường kính (U0.4), W là dư tinh Z. IGF chọn ROUND BAR hay COPYING bằng tham số 84 (LE32-238 tr.45).', 'v'],
      ['G86 NAT01 D F U W', 'Tiện thô chép hình (phôi đúc/rèn).', 'v'],
      ['G87 NAT01', 'Tiện tinh theo biên dạng; bước tiến lấy từ trong biên dạng.', 'v'],
      ['NAT01 G81 … G80', 'Định nghĩa biên dạng dọc (G82: biên dạng ngang). Tên chuỗi bắt đầu bằng N.', 'v'],
      ['G02/G03 X Z I', 'Trong biên dạng tiện, bán kính ghi bằng I. Ví dụ IGF LE32-238 tr.333: G02 X98 Z25 I4 (trong G81…G80, gọi bởi G87). Cung phay trục Y dùng L (và J, K) — LE32-238 tr.359: G02 Y Z J K L.', 'v'],
      ['G41/G42 trong biên dạng', 'Bù mũi dao trong biên dạng LAP – một số máy báo lỗi cắt lẹm khi thô; tắt tùy chọn nếu gặp lỗi.', 'f'],
      ['M85', 'Không quay về điểm bắt đầu sau chu trình thô LAP.', 'v']]],
    ['Tiện ren', [
      ['G71 X Z B D U H F', 'Chu trình ren dọc. Sách 2005 xác nhận M32/M33/M34, M73/M74/M75 và Q (số đầu mối), J (số ren trong khoảng F). Trang hình không đọc được nghĩa X/D/U/H cho ren trong hay ren ngoài — D, U, H vẫn xuất theo đường kính như bản trước.', 'u'],
      ['M32/M33/M34', 'Sách 2005 trang hình ren: M32 ăn sườn trái, M33 zíc zắc, M34 ăn sườn phải. M73 chiều sâu giảm dần, M74 đều, M75 giảm dần.', 'v'],
      ['M73/M74/M75', 'Mẫu chia lát. M73 trong ứng dụng vẫn kiểm tra H − U ≥ D.', 'v'],
      ['Ren trong G71', 'Các trang chu trình ren của sách 2005 là hình, không đọc được câu “X ren trong”. Ứng dụng vẫn đặt X = Ø danh nghĩa với ren trong và X = Ø danh nghĩa − H với ren ngoài. Phải đối chiếu trên máy.', 'u'],
      ['M22 / M23', 'Sách 2005 trang 2 ghi M22 Chamfering On, M23 Chamfering Off. Cách này ngược với OSP-P200L mà ứng dụng đang dùng (M23 = bật vát ren). Không đổi mã xuất ra. Kiểm tra một block ren trên máy trước khi tin.', 'u']]],
    ['Rãnh / khoan tĩnh', [
      ['G73 X Z I K D L F E', 'Chu trình rãnh dọc (ăn dao theo X, dịch K theo Z).', 'v'],
      ['G74 X Z I K D L F E', 'Chu trình rãnh mặt / khoan (ăn dao theo Z). Bắt buộc có Z.', 'v'],
      ['D trong G73/G74', 'Ví dụ sách 2005: G73 X40 Z53 D4 I16 F0.15 E0.5 và G74 X0 Z30 K20 D15 I30 F0.1. Trang không nói D là bán kính hay đường kính. (G190 trục Y thì ghi D theo bán kính — LE32-238 tr.355 — đó là chu trình khác.)', 'u']]],
    ['Dao động lực, trục C', [
      ['M110 / M109', 'Nối trục C (block riêng) / trả về điều khiển trục chính.', 'v'],
      ['M146 / M147', 'M146 = nhả trục C, M147 = kẹp trục C. Tờ ví dụ dao động lực, bảng mã M: “M146 C-axis unclamp”, “M147 C-axis clamp (built in fixed cycle)”. IGF LE32-238 tr.51 gọi M147 là lệnh kẹp. Chu trình G181 tự kẹp; phay G01 thì ứng dụng nhả (M146), ghi G138 C, rồi kẹp (M147).', 'v'],
      ['M15 / M16', 'Định vị trục C chiều + / chiều −.', 'v'],
      ['SB= M13/M14/M12', 'Tốc độ dao động lực; quay thuận / nghịch / dừng. SB phải đứng trước hoặc cùng block M13.', 'v'],
      ['G181 X Z C K F', 'Khoan mặt đầu: X Ø vị trí, Z đáy, K khoảng chạy nhanh từ điểm bắt đầu (dương). Lỗ tiếp theo: chỉ ghi C (và X nếu đổi).', 'v'],
      ['G181 X Z C I F', 'Khoan hướng kính: X Ø đáy lỗ, I khoảng chạy nhanh theo X (Ø).', 'v'],
      ['G182 / G183 D / G184', 'Doa / khoan sâu (D mỗi nhát, L lùi) / taro đầu bù (F = bước × SB).', 'v'],
      ['G178 / G179', 'Taro cứng đồng bộ – cần option và tham số; kiểm tra.', 'f'],
      ['G180', 'Hủy chu trình (block riêng); block ngay sau phải có cả X và Z.', 'v'],
      ['Ghi C trên dòng chu trình', 'Theo báo cáo diễn đàn, P300L cần C ngay trên dòng G181 (ứng dụng luôn ghi).', 'f']]],
    ['Trục Y & phay', [
      ['G138 / G136', 'Bật / hủy chế độ trục Y. IGF LE32-238 tr.353: G138 C (góc C nằm trên block G138); hủy G136 trước khi về điểm thay dao.', 'v'],
      ['G17 / G19', 'Mặt XY (mặt đầu) / YZ (mặt bên). IGF tr.356 xuất G19 khi phay rãnh cạnh trục Y.', 'v'],
      ['X trong G138', 'Từ G138 đến G136, X phải ghi theo bán kính. IGF LE32-238 tr.353: “the X value must be specified in radius until G136”. Mặc định của ứng dụng là bán kính.', 'v'],
      ['G137', 'Chuyển đổi hệ tọa độ (nội suy cực) – ứng dụng không dùng.', 'f']]],
    ['Ụ động / chống tâm', [
      ['M56 / M55', 'Sách 2005, bảng mã M trang 2: M56 Tailstock spindle advance (tiến), M55 Tailstock spindle retract (lùi). IGF LE32-238 mục 22 gọi quy trình là TS ADVANCE / TS RETRACT, không in lại hai mã M này.', 'v'],
      ['G195 SP=n', 'Ụ động NC: IGF tr.369 có mục IN-POSITION STATE NO. nhưng không in mã G195. Vẫn lấy từ ví dụ diễn đàn LB3000 — chưa thấy trong 4 tài liệu này.', 'u'],
      ['M847', 'Ụ động NC về gốc – theo diễn đàn.', 'u'],
      ['M20 / M21', 'Sách 2005 trang 2: M20 Tailstock barrier Off, M21 Tailstock barrier On. IGF LE32-238 tr.306: vùng cấm bắt đầu bằng M21 và kết thúc bằng M20.', 'v'],
      ['M156 / M157', 'Bật / tắt khóa liên động làm việc có tâm (cẩn thận).', 'v'],
      ['LB3000EX II có ụ NC?', 'Tùy cấu hình đặt hàng (thủy lực hoặc NC). Chọn đúng loại trong Thiết lập.', 'u']]]
  ];
  function renderHelp() {
    const bd = { v: '<span class="bd v">Đã đối chiếu</span>', f: '<span class="bd f">Diễn đàn / suy luận</span>', u: '<span class="bd u">CHƯA XÁC MINH</span>' };
    $('#helpBody').innerHTML = `<p class="small muted">${esc(SRC)}</p>` +
      HELP.map(([t, rows]) => `<h3>${esc(t)}</h3><table class="htab">${rows.map(r => `<tr><td><code>${esc(r[0])}</code><br>${bd[r[2]]}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`).join('') +
      `<div class="danger mini">Giới hạn: không mô phỏng đường chạy dao thực của bộ điều khiển; không kiểm tra va chạm đài dao/mâm cặp; không có option máy cụ thể (bộ bắt phôi, cần gạt phôi, ụ NC). Luôn chạy thử.</div>`;
  }

  // ---------- IGF ----------
  let igfStep = 1;
  const EL_VI = { face: 'Mặt đầu (FACE)', long: 'Dọc trục (LONG)', taper: 'Côn (TAPER)', cchf: 'Vát (C-CHF)', rchf: 'Bo tròn (R-CHF)', cw: 'Cung thuận (CW)', ccw: 'Cung ngược (CCW)', jump: 'Nhảy (JUMP)' };
  function igf() { if (!P.igf) P.igf = Object.assign({}, O.DEFAULT_IGF); return P.igf; }
  function numInp(k, v, label) {
    return `<label class="fld"><span>${esc(label)}</span><input data-k="${k}" type="number" inputmode="decimal" step="any" value="${esc(v ?? '')}"></label>`;
  }
  function elCard(e, i) {
    const bits = [];
    if (e.t === 'face') bits.push(numInp('x', e.x, 'Điểm cuối X, Ø (END PT. X)'));
    if (e.t === 'long') bits.push(numInp('z', e.z, 'Điểm cuối Z (END PT. Z)'));
    if (e.t === 'taper') { bits.push(numInp('x', e.x, 'Điểm cuối X, Ø (END PT. X)')); bits.push(numInp('z', e.z, 'Điểm cuối Z (bỏ trống nếu có góc)')); bits.push(numInp('ang', e.ang, 'Góc với trục Z, độ (Z ANGLE A)')); }
    if (e.t === 'cchf') bits.push(numInp('c', e.c, 'Cỡ vát C (CHAMFER SIZE C)'));
    if (e.t === 'rchf') bits.push(numInp('r', e.r, 'Bán kính R (RADIUS R)'));
    if (e.t === 'cw' || e.t === 'ccw') { bits.push(numInp('x', e.x, 'Điểm cuối X, Ø')); bits.push(numInp('z', e.z, 'Điểm cuối Z')); bits.push(numInp('r', e.r, 'Bán kính R')); }
    return `<div class="el" data-i="${i}"><div class="elh"><b>${i + 1}. ${esc(EL_VI[e.t] || e.t)}</b><button type="button" data-del="${i}" aria-label="Xóa">✕</button></div>${bits.join('')}</div>`;
  }
  function drawIgf() {
    const cv = $('#igfCv'); if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const ig = igf(), pv = O.shapePreview(ig);
    g.clearRect(0, 0, W, H); g.fillStyle = '#fbfcfd'; g.fillRect(0, 0, W, H);
    const D = Number(ig.od) || 60, Rr = D / 2, Lg = Number(ig.ol) || 80;
    const zs = pv.pts.map(p => p.z), rs = pv.pts.map(p => p.x / 2);
    const zmin = Math.min(-Lg - 4, ...(zs.length ? zs : [0])) - 4, zmax = Math.max(8, ...(zs.length ? zs : [0])) + 6;
    const rmax = Math.max(Rr, ...(rs.length ? rs : [0])) + 6;
    const sc = Math.min((W - 16) / (zmax - zmin), (H - 16) / (2 * rmax));
    const X = z => 8 + (z - zmin) * sc, Y = r => H / 2 - r * sc;
    g.fillStyle = '#eceff1'; g.fillRect(X(-Lg), Y(Rr), X(0) - X(-Lg), Y(-Rr) - Y(Rr));
    g.strokeStyle = '#90a4ae'; g.setLineDash([4, 3]); g.strokeRect(X(-Lg), Y(Rr), X(0) - X(-Lg), Y(-Rr) - Y(Rr)); g.setLineDash([]);
    g.strokeStyle = '#9ab'; g.setLineDash([8, 4]); g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); g.stroke(); g.setLineDash([]);
    if (pv.pts.length > 1) {
      g.strokeStyle = '#1565c0'; g.lineWidth = 2.2; g.beginPath();
      pv.pts.forEach((p, i) => { const x = X(p.z), y = Y(p.x / 2); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke(); g.lineWidth = 1;
    }
    g.fillStyle = '#546e7a'; g.font = '12px sans-serif'; g.fillText('Z0', X(0) + 2, Y(0) - 4);
  }
  function renderIgf() {
    const root = $('#igfRoot'); if (!root) return;
    const ig = igf(), M = O.matOf(ig);
    const steps = [['1', 'Phôi'], ['2', 'Hình'], ['3', 'Nguyên công'], ['4', 'Tạo mã']];
    let body = '';
    if (igfStep === 1) {
      body = `<p class="hint">Bước này là màn BLANK/SETUP của IGF: vật liệu (MATERIAL), hình phôi (SHAPE), mốc Z (ZERO POINT REFERENCE) và kẹp (ID/OD GRIP). Số liệu cắt là giá trị xưởng — sách chỉ liệt kê các mục, không in bảng số của máy.</p>
        <label class="fld"><span>Vật liệu (MATERIAL)</span><select data-k="material">${Object.keys(O.MATERIALS).map(k => `<option ${ig.material === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label class="fld"><span>Hình phôi (SHAPE)</span><select data-k="blankShape"><option value="round" ${ig.blankShape !== 'uniform' ? 'selected' : ''}>Thanh tròn (ROUND BAR)</option><option value="uniform" ${ig.blankShape === 'uniform' ? 'selected' : ''}>Phôi đều dư (UNIFORM STOCK)</option></select></label>
        ${numInp('od', ig.od, 'Đường kính ngoài, Ø (OUTSIDE DIA. OD)')}
        ${numInp('ol', ig.ol, 'Chiều dài phôi (OUTSIDE LENG. OL)')}
        <label class="fld"><span>Lỗ sẵn trên phôi (BLANK ID)</span><select data-k="blankId"><option value="none" ${ig.blankId === 'none' ? 'selected' : ''}>Không lỗ (NO INSIDE)</option><option value="thru" ${ig.blankId === 'thru' ? 'selected' : ''}>Lỗ suốt (ID THRU)</option><option value="blind" ${ig.blankId === 'blind' ? 'selected' : ''}>Lỗ kín (ID BLIND)</option></select></label>
        ${ig.blankId !== 'none' ? numInp('id', ig.id, 'Đường kính lỗ phôi, Ø (ID)') : ''}
        ${ig.blankId === 'blind' ? numInp('idDepth', ig.idDepth, 'Chiều sâu lỗ kín (ID DEPTH)') : ''}
        ${ig.blankShape === 'uniform' ? numInp('uniformH', ig.uniformH, 'Dư đều quanh thành phẩm (STCK RMV H)') : ''}
        <label class="fld"><span>Mốc Z (ZERO POINT REFERENCE)</span><select data-k="zeroRef"><option value="left" ${ig.zeroRef !== 'right' ? 'selected' : ''}>Mặt trái — phía mâm (LEFT FACE)</option><option value="right" ${ig.zeroRef === 'right' ? 'selected' : ''}>Mặt phải — phía ụ (RIGHT FACE)</option></select></label>
        ${numInp('zeroPos', ig.zeroPos, 'Vị trí mốc so với mặt chuẩn (ZERO POINT POSITION)')}
        <p class="small muted">Z xuất ra chương trình lấy mặt phải của phôi làm Z0, Z âm về phía mâm — cùng quy ước tab Nguyên công.</p>
        ${numInp('g50', ig.g50, 'Tốc độ trục chính tối đa (SPINDLE MAX SPEED) → G50')}
        <label class="fld"><span>Cách kẹp (ID/OD GRIP)</span><select data-k="grip"><option value="od" ${ig.grip !== 'id' ? 'selected' : ''}>Kẹp ngoài (OUTSIDE)</option><option value="id" ${ig.grip === 'id' ? 'selected' : ''}>Kẹp trong (INSIDE)</option></select></label>
        ${numInp('jawL2', ig.jawL2, 'Chiều dài chấu L2 (JAW SIZE L2)')}
        ${numInp('jawD3', ig.jawD3, ig.grip === 'id' ? 'Đường kính kẹp (L3)' : 'Đường kính chấu D3')}
        <label class="chk"><input type="checkbox" data-k="useCenter" ${ig.useCenter ? 'checked' : ''}> Dùng chống tâm (USE CENTER) — khoan tâm rồi tiến ụ (TS ADVANCE, M56)</label>
        ${ig.useCenter ? numInp('tailD', ig.tailD, 'Đường kính vùng mũi tâm (DIAMETER D)') : ''}
        <div class="grid2">${numInp('roughT', ig.roughT, 'Dao thô T (ROUGH OD)')}${numInp('finishT', ig.finishT, 'Dao tinh T (FINISH OD)')}</div>`;
    } else if (igfStep === 2) {
      const pv = O.shapePreview(ig);
      body = `<p class="hint">Định nghĩa biên dạng tinh (TURNING SHAPE) một nét, như IGF: điểm đầu (START PT. SX, SZ), chiều (DEF. DIR.), rồi FACE / TAPER / LONG / C-CHF / R-CHF. Vát và bo nằm giữa hai đoạn thẳng. Ví dụ trong sách LE32-239 mục 3 (phôi S45C, Ø100×82).</p>
        <div class="grid2">${numInp('sx', ig.sx, 'Điểm đầu X, Ø (START PT. SX)')}${numInp('sz', ig.sz, 'Điểm đầu Z (START PT. SZ)')}</div>
        <label class="fld"><span>Chiều định nghĩa (DEF. DIR.)</span><select data-k="dir"><option ${ig.dir !== 'CW' ? 'selected' : ''}>CCW</option><option ${ig.dir === 'CW' ? 'selected' : ''}>CW</option></select></label>
        <div class="cvwrap"><div class="cvt">Phôi (xám) và biên dạng tinh (xanh) · Z0 ở mặt phải</div><canvas id="igfCv" width="720" height="280"></canvas></div>
        ${(pv.notes || []).map(n => `<p class="opw warn">⚠ ${esc(n)}</p>`).join('')}
        <div id="elList">${(ig.elems || []).map(elCard).join('') || '<p class="empty">Chưa có đoạn nào. Thêm FACE, LONG… hoặc nạp ví dụ trong sách.</p>'}</div>
        <div class="typegrid igfadd">${Object.keys(EL_VI).map(k => `<button type="button" class="typebtn" data-addel="${k}">${esc(EL_VI[k])}</button>`).join('')}</div>`;
    } else if (igfStep === 3) {
      const d = O.decideProcesses(ig);
      body = `<p class="hint">PROCESS DECIDE: IGF tự chia vùng gia công, chọn chu trình, dao và chế độ cắt từ biên dạng + vật liệu. Sửa chế độ cắt của vật liệu bên dưới rồi xem lại danh sách. Bấm sang bước 4 để ghi vào danh sách nguyên công.</p>
        <h3>Chế độ cắt ${esc(ig.material)} (MATERIAL DATA)</h3>
        <div class="grid2">
          ${numInp('vr', M.vr, 'Vc thô m/ph (CUT. SPEED VR)')}
          ${numInp('fr', M.fr, 'Bước tiến thô (FEEDRATE FR)')}
          ${numInp('dx', M.dx, 'Chiều sâu cắt theo Ø (CUTTING DEPTH DX)')}
          ${numInp('lx', M.lx, 'Dư tinh hướng kính (LX) — U = 2×LX')}
          ${numInp('lz', M.lz, 'Dư tinh Z (LZ)')}
          ${numInp('vf', M.vf, 'Vc tinh (FINISH CUTTING SPEED VF)')}
          ${numInp('ff', M.ff, 'Bước tiến tinh (FEEDRATE F)')}
        </div>
        <h3>Nguyên công sẽ tạo (${d.ops.length})</h3>
        ${d.notes.map(n => `<p class="hint">⚠ ${esc(n)}</p>`).join('')}
        <ol class="ops">${d.ops.map((o, i) => `<li class="op"><div class="oph"><span class="opn">${i + 1}</span><div class="opt"><b>${esc(O.OPS[o.type].icon)} ${esc(O.OPS[o.type].name)}</b><small>${esc(summary(o))}</small></div></div></li>`).join('') || '<li class="empty">Chưa đủ biên dạng.</li>'}</ol>`;
    } else {
      const d = O.decideProcesses(ig);
      body = `<p class="hint">PROGRAM CREATE: ghi các nguyên công vừa quyết định vào tab Nguyên công và sinh file .MIN (có dòng O + tên). Trên máy IGF, phải mô phỏng rồi chạy không phôi trước khi cắt — LE32-239, mục an toàn.</p>
        <div class="danger slim">⚠ Sau khi tạo mã, vẫn phải chạy thử không phôi hoặc mô phỏng trên OSP trước khi cắt.</div>
        <p>Sẽ ghi <b>${d.ops.length}</b> nguyên công cho phôi Ø${esc(ig.od)} × ${esc(ig.ol)} ${esc(ig.material)}. Danh sách nguyên công hiện có (${P.ops.length}) sẽ bị thay.</p>
        <button type="button" class="b1" id="igfCreate">Tạo chương trình (PROGRAM CREATE)</button>`;
    }
    root.innerHTML = `<div class="igfsteps">${steps.map(([n, t]) => `<button type="button" data-step="${n}" class="${Number(n) === igfStep ? 'on' : ''}">${n} ${esc(t)}</button>`).join('')}</div>
      <div class="btns"><button type="button" class="b2" id="igfDemo">Nạp ví dụ trong sách (TEST1)</button></div>
      <form id="igfForm" class="form" autocomplete="off">${body}</form>`;
    if (igfStep === 2) drawIgf();
    const form = $('#igfForm');
    const read = () => {
      form.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k;
        if (el.type === 'checkbox') ig()[k] = el.checked;
        else if (['material', 'blankShape', 'blankId', 'zeroRef', 'grip', 'dir'].includes(k)) ig()[k] = el.value;
        else if (['vr', 'fr', 'dx', 'lx', 'lz', 'vf', 'ff'].includes(k)) { ig().mat = Object.assign({}, O.matOf(ig()), ig().mat || {}); ig().mat[k] = el.value === '' ? '' : Number(el.value); }
        else ig()[k] = el.value === '' ? '' : Number(el.value);
      });
      if (igfStep === 2) form.querySelectorAll('.el').forEach(card => {
        const e = ig().elems[Number(card.dataset.i)]; if (!e) return;
        card.querySelectorAll('[data-k]').forEach(inp => { e[inp.dataset.k] = inp.value === '' ? '' : Number(inp.value); });
      });
    };
    form.oninput = form.onchange = ev => {
      if (ev.target && ev.target.dataset && ev.target.dataset.k && igfStep === 2 && ev.target.closest('.el')) {
        read(); save(); drawIgf(); return;
      }
      read(); save();
      if (ev.target && ['blankId', 'blankShape', 'grip', 'useCenter', 'material'].includes(ev.target.dataset.k)) renderIgf();
      else if (igfStep === 2) drawIgf();
    };
  }
  const igfRootClick = e => {
    const st = e.target.closest('[data-step]'); if (st) { igfStep = Number(st.dataset.step); renderIgf(); return; }
    if (e.target.id === 'igfDemo') {
      P.igf = O.igfTutorial(); igfStep = 2; save(); renderIgf(); toast('Đã nạp ví dụ TEST1 (LE32-239)'); return;
    }
    const add = e.target.closest('[data-addel]'); if (add) { igf().elems = igf().elems || []; igf().elems.push({ t: add.dataset.addel }); save(); renderIgf(); return; }
    const del = e.target.closest('[data-del]'); if (del) { igf().elems.splice(Number(del.dataset.del), 1); save(); renderIgf(); return; }
    if (e.target.id === 'igfCreate') {
      const d = O.decideProcesses(igf());
      if (!d.ops.length) { alert('Chưa có nguyên công. Hãy định nghĩa biên dạng ở bước 2.'); return; }
      if (P.ops.length && !confirm('Thay danh sách nguyên công hiện tại bằng kết quả IGF?')) return;
      const ig = igf();
      P.settings.stockD = Number(ig.od) || P.settings.stockD;
      P.settings.stockL = Number(ig.ol) || P.settings.stockL;
      P.settings.material = ig.material || P.settings.material;
      P.settings.g50 = Number(ig.g50) || P.settings.g50;
      P.settings.tailDia = Number(ig.tailD) || P.settings.tailDia;
      if (ig.useCenter && P.settings.tail === 'none') P.settings.tail = 'quill';
      P.ops = d.ops; renderSettings(); save(); toast('Đã tạo ' + d.ops.length + ' nguyên công');
      document.querySelector('.tabs button[data-v="v-ops"]').click();
    }
  };

  // ---------- chung ----------
  function refresh() {
    R = O.compile(P); renderOps(); renderCode(); renderPrevSel();
    if ($('#v-prev').classList.contains('on')) drawPreview();
  }
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === b.dataset.v));
    $('#fab').style.display = b.dataset.v === 'v-ops' ? '' : 'none';
    if (b.dataset.v === 'v-prev') drawPreview();
    if (b.dataset.v === 'v-igf') renderIgf();
    window.scrollTo(0, 0);
  });
  $('#warnHide').onclick = () => { const w = $('#warnTop'); w.classList.toggle('col'); $('#warnHide').textContent = w.classList.contains('col') ? '▾' : '▴'; };
  $('#btnSample').onclick = () => { if (P.ops.length && !confirm('Thay danh sách hiện tại bằng ví dụ mẫu?')) return; P = O.sampleProject(); renderSettings(); save(); toast('Đã nạp ví dụ mẫu'); };
  $('#btnClear').onclick = () => { if (!confirm('Xóa hết nguyên công?')) return; P.ops = []; save(); };
  $('#btnExport').onclick = () => { const b = new Blob([JSON.stringify(P, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (P.settings.progName || 'du-an') + '.json'; a.click(); };
  $('#fileImport').onchange = e => { const fl = e.target.files[0]; if (!fl) return; fl.text().then(t => { const j = JSON.parse(t); if (!j.ops) throw new Error('Tệp không hợp lệ'); j.settings = Object.assign({}, O.DEFAULT_SETTINGS, j.settings); j.igf = Object.assign({}, O.DEFAULT_IGF, j.igf || {}); P = j; renderSettings(); save(); toast('Đã nhập dự án'); }).catch(er => alert('Lỗi: ' + er.message)); };
  function net() { const s = $('#netState'); s.textContent = navigator.onLine ? '● Online' : '● Offline'; s.style.background = navigator.onLine ? '#ffffff22' : '#e8750a'; }
  addEventListener('online', net); addEventListener('offline', net); net();
  if (!P.ops.length && !localStorage.getItem(KEY)) P = O.sampleProject();
  renderSettings(); renderHelp(); refresh();
  const igfBox = $('#igfRoot'); if (igfBox) igfBox.addEventListener('click', igfRootClick);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { });
  // mở tab theo hash (dùng cho chụp màn hình)
  let hv = { '#code': 'v-code', '#prev': 'v-prev', '#set': 'v-set', '#help': 'v-help' }[location.hash];
  if (/^#igf/.test(location.hash || '')) {
    hv = 'v-igf';
    const m = location.hash.match(/^#igf([1-4])/);
    if (m) igfStep = Number(m[1]);
    if (/demo/.test(location.hash) || /^#igf[2-4]/.test(location.hash)) {
      if (!(igf().elems || []).length) P.igf = O.igfTutorial();
    }
  }
  if (hv) document.querySelector(`.tabs button[data-v="${hv}"]`).click();
  window.__okuOpenForm = i => openForm(P.ops[i]); window.__okuFab = () => $('#fab').click();
})();
