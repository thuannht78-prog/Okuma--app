/* Giao diện – Okuma LB3000EX II / OSP-P300L */
(function () {
  'use strict';
  const O = window.OKU, $ = s => document.querySelector(s), KEY = 'okuma_lb3000_v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let P = load(); let R = null; let selId = null;

  function load() {
    try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.ops) { j.settings = Object.assign({}, O.DEFAULT_SETTINGS, j.settings); return j; } } catch (e) { }
    return { settings: Object.assign({}, O.DEFAULT_SETTINGS), ops: [] };
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
    { k: 'dollar', t: 'chk', label: 'Thêm dòng đầu $TEN.MIN% và % cuối (định dạng tệp OSP)' },
    { k: 'coolant', t: 'chk', label: 'Dùng tưới nguội M08/M09' },
    { k: 'liveDir', t: 'sel', label: 'Chiều quay dao động lực', opts: [['M13', 'M13 (thuận)'], ['M14', 'M14 (nghịch)']] },
    { k: 'cDir', t: 'sel', label: 'Chiều định vị trục C', opts: [['M15', 'M15 (chiều +)'], ['M16', 'M16 (chiều −)']] },
    { k: 'x138', t: 'sel', label: 'Giá trị X trong chế độ trục Y (G138) – CHƯA XÁC MINH', opts: [['radius', 'Bán kính (theo tài liệu đào tạo Okuma)'], ['diameter', 'Đường kính']] },
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
    if (fd.t === 'pts') return `<div class="fld"><span>${esc(fd.label)}</span><table class="pts" id="${id}"><thead><tr><th style="width:24%">X (Ø)</th><th style="width:24%">Z</th><th style="width:22%">Kiểu</th><th style="width:20%">R</th><th></th></tr></thead><tbody>${(v || []).map(ptRow).join('')}</tbody></table><div class="btns"><button type="button" class="b2" data-addpt="${id}">＋ Thêm điểm</button></div><div class="hint">Điểm đầu = điểm bắt đầu biên dạng trên mặt đầu (VD: đầu vát). G02/G03 = cung tròn bán kính R (xuất từ L), nhìn +X lên, +Z sang phải: góc lượn LÕM ở chân vai (đi −Z rồi lên +X) thường là G02, bo tròn mép LỒI là G03 – kiểm tra lại ở tab Xem trước. Chương trình tự thêm đoạn thoát ra X bắt đầu ở cuối.</div></div>`;
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
    lside: 'Dao động lực hướng kính: G181 X(Ø đáy lỗ) Z C I(khoảng chạy nhanh theo Ø) F. Lệch tâm Y ≠ 0 sẽ dùng G138 + G19 (CHƯA XÁC MINH cách tính X trong G138).',
    mslot: 'Phay bằng trục Y: M110, khóa trục C (M146 nhả → G00 C → M147 kẹp), G138 (chế độ trục Y), G17 (mặt XY), phay G01 X Y Z, sau đó Y0 → G136 hủy.',
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
  const HELP = [
    ['Cấu trúc chương trình', [
      ['$TEN.MIN%', 'Dòng đầu tệp OSP khi truyền/đọc tệp; kết thúc bằng % riêng một dòng. Tên bắt đầu bằng chữ.', 'f'],
      ['( ... )', 'Ghi chú – ứng dụng tự đổi thành IN HOA không dấu.', 'v'],
      ['M02 / M30', 'Kết thúc chương trình (reset, quay về đầu).', 'v'],
      ['M00 / M01', 'Dừng bắt buộc / dừng tùy chọn.', 'v'],
      ['T010101', 'Gọi dao 6 chữ số: số bù dao, số dao, số bù bán kính mũi (ứng dụng đặt cả 3 = số trạm). Thứ tự 3 cặp số – xem trang tool data của máy.', 'f'],
      ['G00 X Z', 'Chạy nhanh; X theo đường kính. Nên về điểm an toàn trước khi quay đài dao.', 'v']]],
    ['Trục chính & chạy dao', [
      ['G50 S', 'Giới hạn tốc độ trục chính tối đa (bắt buộc trước G96).', 'v'],
      ['G96 S / G97 S', 'Tốc độ cắt không đổi (m/ph) / tốc độ vòng cố định (vòng/ph).', 'v'],
      ['M03 / M04 / M05', 'Trục chính thuận / nghịch / dừng.', 'v'],
      ['G95 / G94', 'Bước tiến mm/vòng / mm/phút. Chu trình khoan dao động lực G181–G184 chỉ nhận G94.', 'v'],
      ['M08 / M09', 'Tưới nguội bật/tắt (mã M thông dụng; theo cấu hình máy).', 'f']]],
    ['LAP – tiện biên dạng', [
      ['G85 NAT01 D F U W', 'Gọi chu trình tiện thô dọc; D, U theo đường kính (gia số), W theo Z. Không đặt S/T/M trong block G85.', 'v'],
      ['G86 NAT01 D F U W', 'Tiện thô chép hình (phôi đúc/rèn).', 'v'],
      ['G87 NAT01', 'Tiện tinh theo biên dạng; bước tiến lấy từ trong biên dạng.', 'v'],
      ['NAT01 G81 … G80', 'Định nghĩa biên dạng dọc (G82: biên dạng ngang). Tên chuỗi bắt đầu bằng N.', 'v'],
      ['G02/G03 X Z L', 'Cung tròn với bán kính L (theo ví dụ diễn đàn Okuma).', 'f'],
      ['G41/G42 trong biên dạng', 'Bù mũi dao trong biên dạng LAP – một số máy báo lỗi cắt lẹm khi thô; tắt tùy chọn nếu gặp lỗi.', 'f'],
      ['M85', 'Không quay về điểm bắt đầu sau chu trình thô LAP.', 'v']]],
    ['Tiện ren', [
      ['G71 X Z B D U H F', 'Chu trình ren dọc: X Ø cuối, Z điểm cuối, B góc ăn dao, D lát đầu (Ø), U dư tinh (Ø), H cao ren (Ø), F bước. A/I: ren côn. Q: số mối.', 'v'],
      ['M32/M33/M34', 'Ăn dao một sườn / zíc zắc / một sườn ngược.', 'v'],
      ['M73/M74/M75', 'Mẫu chia lát 1/2/3. M73 yêu cầu H − U ≥ D.', 'v'],
      ['M22/M23', 'Tắt/bật vát cuối ren (L = chiều dài vát).', 'v'],
      ['Ren trong G71', 'Cách tính X cho ren trong (X = Ø đáy ren trong) – suy luận, chưa có ví dụ.', 'u']]],
    ['Rãnh / khoan tĩnh', [
      ['G73 X Z I K D L F E', 'Chu trình rãnh dọc (ăn dao theo X, dịch K theo Z).', 'v'],
      ['G74 X Z I K D L F E', 'Chu trình rãnh mặt / khoan (ăn dao theo Z). Bắt buộc có Z.', 'v'],
      ['D trong G73/G74', 'Chiều sâu mỗi nhát – theo bán kính hay đường kính chưa rõ.', 'u']]],
    ['Dao động lực, trục C', [
      ['M110 / M109', 'Nối trục C (block riêng) / trả về điều khiển trục chính.', 'v'],
      ['M146 / M147', 'Nhả / kẹp trục C (sách P200L có 1 câu ghi ngược, bảng mã & ví dụ ghi M147 = kẹp).', 'f'],
      ['M15 / M16', 'Định vị trục C chiều + / chiều −.', 'v'],
      ['SB= M13/M14/M12', 'Tốc độ dao động lực; quay thuận / nghịch / dừng. SB phải đứng trước hoặc cùng block M13.', 'v'],
      ['G181 X Z C K F', 'Khoan mặt đầu: X Ø vị trí, Z đáy, K khoảng chạy nhanh từ điểm bắt đầu (dương). Lỗ tiếp theo: chỉ ghi C (và X nếu đổi).', 'v'],
      ['G181 X Z C I F', 'Khoan hướng kính: X Ø đáy lỗ, I khoảng chạy nhanh theo X (Ø).', 'v'],
      ['G182 / G183 D / G184', 'Doa / khoan sâu (D mỗi nhát, L lùi) / taro đầu bù (F = bước × SB).', 'v'],
      ['G178 / G179', 'Taro cứng đồng bộ – cần option và tham số; kiểm tra.', 'f'],
      ['G180', 'Hủy chu trình (block riêng); block ngay sau phải có cả X và Z.', 'v'],
      ['Ghi C trên dòng chu trình', 'Theo báo cáo diễn đàn, P300L cần C ngay trên dòng G181 (ứng dụng luôn ghi).', 'f']]],
    ['Trục Y & phay', [
      ['G138 / G136', 'Bật chế độ trục Y / hủy (hủy tại vị trí an toàn, Y0).', 'f'],
      ['G17 / G19', 'Mặt phẳng XY (mặt đầu) / YZ (mặt bên) trong chế độ trục Y.', 'f'],
      ['X trong G138', 'Tài liệu đào tạo Okuma nói X chuyển sang bán kính – chọn trong Thiết lập. CHƯA XÁC MINH trên LB3000EX II.', 'u'],
      ['G137', 'Chuyển đổi hệ tọa độ (nội suy cực) – ứng dụng không dùng.', 'f']]],
    ['Ụ động / chống tâm', [
      ['M56 / M55', 'Tiến / lùi nòng ụ động (có trong sách P200L). Trục chính phải dừng (M166 khóa liên động).', 'v'],
      ['G195 SP=n', 'Ụ động NC: chọn bộ vị trí n (VTSWP/VTSAP/VTSRT). Theo ví dụ diễn đàn LB3000.', 'f'],
      ['M847', 'Ụ động NC về gốc – theo diễn đàn.', 'u'],
      ['M20 / M21', 'Tắt / bật vùng cấm ụ động.', 'v'],
      ['M156 / M157', 'Bật / tắt khóa liên động làm việc có tâm (cẩn thận).', 'v'],
      ['LB3000EX II có ụ NC?', 'Tùy cấu hình đặt hàng (thủy lực hoặc NC). Chọn đúng loại trong Thiết lập.', 'u']]]
  ];
  function renderHelp() {
    const bd = { v: '<span class="bd v">Sách P200L</span>', f: '<span class="bd f">Diễn đàn / suy luận</span>', u: '<span class="bd u">CHƯA XÁC MINH</span>' };
    $('#helpBody').innerHTML = `<p class="small muted">Nguồn: sách lập trình Okuma OSP-P200L (5238-E, đời trước P300L – cú pháp tương tự) và ví dụ từ diễn đàn/post-processor LB3000. Mục “CHƯA XÁC MINH” phải đối chiếu với sách OSP-P300L của máy.</p>` +
      HELP.map(([t, rows]) => `<h3>${esc(t)}</h3><table class="htab">${rows.map(r => `<tr><td><code>${esc(r[0])}</code><br>${bd[r[2]]}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`).join('') +
      `<div class="danger mini">Giới hạn: không mô phỏng đường chạy dao thực của bộ điều khiển; không kiểm tra va chạm đài dao/mâm cặp; không có option máy cụ thể (bộ bắt phôi, cần gạt phôi, ụ NC). Luôn chạy thử.</div>`;
  }

  // ---------- chung ----------
  function refresh() {
    R = O.compile(P); renderOps(); renderCode(); renderPrevSel();
    if ($('#v-prev').classList.contains('on')) drawPreview();
  }
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === b.dataset.v));
    $('#fab').style.display = b.dataset.v === 'v-ops' ? '' : 'none';
    if (b.dataset.v === 'v-prev') drawPreview(); window.scrollTo(0, 0);
  });
  $('#warnHide').onclick = () => { const w = $('#warnTop'); w.classList.toggle('col'); $('#warnHide').textContent = w.classList.contains('col') ? '▾' : '▴'; };
  $('#btnSample').onclick = () => { if (P.ops.length && !confirm('Thay danh sách hiện tại bằng ví dụ mẫu?')) return; P = O.sampleProject(); renderSettings(); save(); toast('Đã nạp ví dụ mẫu'); };
  $('#btnClear').onclick = () => { if (!confirm('Xóa hết nguyên công?')) return; P.ops = []; save(); };
  $('#btnExport').onclick = () => { const b = new Blob([JSON.stringify(P, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (P.settings.progName || 'du-an') + '.json'; a.click(); };
  $('#fileImport').onchange = e => { const fl = e.target.files[0]; if (!fl) return; fl.text().then(t => { const j = JSON.parse(t); if (!j.ops) throw new Error('Tệp không hợp lệ'); j.settings = Object.assign({}, O.DEFAULT_SETTINGS, j.settings); P = j; renderSettings(); save(); toast('Đã nhập dự án'); }).catch(er => alert('Lỗi: ' + er.message)); };
  function net() { const s = $('#netState'); s.textContent = navigator.onLine ? '● Online' : '● Offline'; s.style.background = navigator.onLine ? '#ffffff22' : '#e8750a'; }
  addEventListener('online', net); addEventListener('offline', net); net();
  if (!P.ops.length && !localStorage.getItem(KEY)) P = O.sampleProject();
  renderSettings(); renderHelp(); refresh();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { });
  // mở tab theo hash (dùng cho chụp màn hình)
  const hv = { '#code': 'v-code', '#prev': 'v-prev', '#set': 'v-set', '#help': 'v-help' }[location.hash];
  if (hv) document.querySelector(`.tabs button[data-v="${hv}"]`).click();
  window.__okuOpenForm = i => openForm(P.ops[i]); window.__okuFab = () => $('#fab').click();
})();
