/* Giao diện – Okuma LB3000EX II / OSP-P300L */
(function () {
  'use strict';
  const O = window.OKU, $ = s => document.querySelector(s);
  const OLD_KEY = 'okuma_lb3000_v1', LIB_KEY = 'okuma_lb3000_setups_v1';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let LIB = null, P = null, R = null, selId = null, igfStep = 1;

  function normalizeProject(j) {
    const p = {
      settings: Object.assign({}, O.DEFAULT_SETTINGS, (j && j.settings) || {}),
      ops: Array.isArray(j && j.ops) ? j.ops : [],
      igf: Object.assign({}, O.DEFAULT_IGF, (j && j.igf) || {})
    };
    if (p.settings.stockD) p.igf.od = p.settings.stockD;
    if (p.settings.stockL) p.igf.ol = p.settings.stockL;
    if (p.settings.material) p.igf.material = p.settings.material;
    if (p.settings.g50) p.igf.g50 = p.settings.g50;
    if (p.settings.jawLen) p.igf.jawL2 = p.settings.jawLen;
    if (p.settings.jawOd) p.igf.jawD3 = p.settings.jawOd;
    if (p.settings.tailDia) p.igf.tailD = p.settings.tailDia;
    return p;
  }
  function newId() { return Math.random().toString(36).slice(2, 10); }
  function makeSetup(name, project) {
    const now = Date.now();
    return { id: newId(), name: String(name || 'Sản phẩm mới').trim() || 'Sản phẩm mới', created: now, modified: now, step: 1, project: normalizeProject(project) };
  }
  function loadLib() {
    let lib = null;
    try { lib = JSON.parse(localStorage.getItem(LIB_KEY) || 'null'); } catch (e) { lib = null; }
    if (!lib || !Array.isArray(lib.items)) {
      lib = { v: 1, active: null, items: [] };
      try {
        const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
        if (old && Array.isArray(old.ops)) {
          const nm = (old.settings && (old.settings.comment || old.settings.progName)) || 'Setup đã lưu';
          lib.items.push(makeSetup(nm, old));
        }
      } catch (e) { /* bỏ bản cũ hỏng */ }
      try { localStorage.setItem(LIB_KEY, JSON.stringify(lib)); } catch (e) { /* bộ nhớ đầy */ }
    }
    lib.items.forEach(s => { s.project = normalizeProject(s.project); if (!s.id) s.id = newId(); });
    if (lib.active && !lib.items.some(s => s.id === lib.active)) lib.active = null;
    return lib;
  }
  function activeSetup() { return LIB.items.find(s => s.id === LIB.active) || null; }
  function persistLib() {
    const s = activeSetup();
    if (s) { s.project = JSON.parse(JSON.stringify(P)); s.modified = Date.now(); s.step = igfStep; }
    try { localStorage.setItem(LIB_KEY, JSON.stringify(LIB)); } catch (e) { /* bộ nhớ đầy */ }
    try { if (s) localStorage.setItem(OLD_KEY, JSON.stringify(P)); } catch (e) { /* bộ nhớ đầy */ }
  }
  function save() { persistLib(); refresh(); }
  LIB = loadLib();
  P = activeSetup() ? normalizeProject(activeSetup().project) : normalizeProject(null);
  if (activeSetup()) igfStep = activeSetup().step || 1;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); }

  // ---------- Thiết lập ----------
  const SET_FIELDS = [
    { k: 'progName', t: 'txt', label: 'Tên chương trình (chữ + số, dùng cho $TEN.MIN%)' },
    { k: 'comment', t: 'txt', label: 'Ghi chú / tên chi tiết' },
    { k: 'stockD', t: 'num', label: 'Ø phôi (mm)' }, { k: 'stockL', t: 'num', label: 'Chiều dài phôi nhô ra khỏi mâm (mm)' },
    { k: 'jawLen', t: 'num', label: 'Chiều dài chấu từ mặt mâm về phía phôi (mm) — cảnh báo va chạm' },
    { k: 'jawOd', t: 'num', label: 'Ø ngoài chấu mâm (mm) — vùng chấu khi mô phỏng' },
    { k: 'material', t: 'txt', label: 'Vật liệu' },
    { k: 'g50', t: 'num', label: 'G50 – giới hạn tốc độ trục chính (vòng/ph)' },
    { k: 'machMax', t: 'num', label: 'Tốc độ tối đa trục chính của máy (xem nhãn máy)' },
    { k: 'liveMax', t: 'num', label: 'Tốc độ tối đa dao động lực (xem nhãn máy)' },
    { k: 'homeX', t: 'num', label: 'Điểm thay dao X (đường kính, toạ độ phôi)' }, { k: 'homeZ', t: 'num', label: 'Điểm thay dao Z' },
    { k: 'endCode', t: 'sel', label: 'Kết thúc chương trình', opts: [['M02', 'M02'], ['M30', 'M30']] },
    { k: 'dollar', t: 'chk', label: 'Thêm dòng $TEN.MIN% (LE33-021 P-510) và % cuối. Dòng O + tên luôn được ghi (tối đa 8 ký tự, P-1/P-3).' },
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

  const MACHINE_FIELDS = SET_FIELDS.filter(fd => !['stockD', 'stockL', 'material', 'jawLen', 'jawOd'].includes(fd.k));
  function renderSettings() {
    const f = $('#setForm'); if (!f) return;
    f.innerHTML = MACHINE_FIELDS.map(fd => fieldHTML(fd, P.settings[fd.k], 's_')).join('');
    f.oninput = f.onchange = () => {
      MACHINE_FIELDS.forEach(fd => { const v = readField(fd, 's_', f); if (v !== undefined) P.settings[fd.k] = v; });
      igf().g50 = P.settings.g50;
      if (P.settings.tailDia !== '' && P.settings.tailDia != null) igf().tailD = P.settings.tailDia;
      save();
    };
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
    const ul = $('#igfOps') || $('#opsList'); if (!ul) return;
    const empty = $('#opsEmpty'); if (empty) empty.style.display = P.ops.length ? 'none' : 'block';
    const count = $('#opCount'); if (count) count.textContent = P.ops.length ? P.ops.length + ' nguyên công' : '';
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
    const sum = $('#sumWarn'); if (sum) sum.innerHTML = g.length ? `<ul class="wlist">${g.map(w => `<li class="${w.lvl}">${esc(w.msg)}</li>`).join('')}</ul>` : '';
  }
  function actOp(a, id) {
    const i = P.ops.findIndex(o => o.id === id); if (i < 0) return;
    if (a === 'up' && i > 0) [P.ops[i - 1], P.ops[i]] = [P.ops[i], P.ops[i - 1]];
    if (a === 'dn' && i < P.ops.length - 1) [P.ops[i + 1], P.ops[i]] = [P.ops[i], P.ops[i + 1]];
    if (a === 'ed') return openForm(P.ops[i]);
    if (a === 'cp') { const c = JSON.parse(JSON.stringify(P.ops[i])); c.id = Math.random().toString(36).slice(2, 9); P.ops.splice(i + 1, 0, c); toast('Đã nhân bản'); }
    if (a === 'tg') P.ops[i].on = P.ops[i].on === false;
    if (a === 'rm') { if (!confirm('Xóa nguyên công này?')) return; P.ops.splice(i, 1); }
    save();
    if (flowOn()) renderIgf();
  }

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
    thread: 'G71 X(Ø lát cuối) Z B D U H F + M32/M33/M34 + M73/M74/M75. LE33-021 P-174..P-182: X theo đường kính. Ren ngoài X = Ø danh nghĩa − H; ren trong X cuối = Ø lớn, điểm vào nhỏ hơn (ví dụ sách chỉ có ren ngoài). H tự tính: ngoài ≈ 1.2269×P, trong ≈ 1.0825×P. Vát: M23 bật, M22 tắt (P-167).',
    groove: 'Rãnh ngoài: dao cắt theo X; rãnh rộng hơn dao sẽ ăn nhiều nhát chồng 20%. G73 D theo đường kính (LE33-021 P-197, hình ghi D/2). G74 D là chiều sâu theo Z (P-200).',
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
      if (flowOn()) renderIgf();
    };
  }

  // ---------- Mã NC ----------
  function renderCode() {
    const box = $('#code'); if (!box || !R) return;
    const hl = R.map.find(x => x.id === selId);
    box.innerHTML = R.lines.map((l, i) => {
      let c = esc(l) || ' ';
      c = c.replace(/(\([^)]*\))/g, '<span class="cmt">$1</span>').replace(/\b(NAT\d+)\b/g, '<span class="nat">$1</span>').replace(/^(T\d{6})/, '<span class="tl">$1</span>');
      return `<span class="ln${hl && i >= hl.from && i < hl.to ? ' hl' : ''}">${c}</span>`;
    }).join('');
    const ne = R.warnings.filter(w => w.lvl === 'err').length, nw = R.warnings.filter(w => w.lvl === 'warn').length;
    const stat = $('#codeStat'); if (stat) stat.textContent = `${R.lines.length} dòng · ${ne} lỗi · ${nw} cảnh báo`;
    const warn = $('#codeWarn'); if (warn) warn.innerHTML = R.warnings.length ? `<details class="wdet" ${ne ? 'open' : ''}><summary>${ne ? '⛔ ' + ne + ' lỗi, ' : ''}⚠ ${nw} cảnh báo – bấm để xem</summary><ul class="wlist">${R.warnings.map(w => `<li class="${w.lvl}"><b>${w.idx != null ? '#' + (w.idx + 1) + ' ' : ''}${VI_LVL[w.lvl]}:</b> ${esc(w.msg)}</li>`).join('')}</ul></details>` : '';
    const fn = $('#fname'); if (fn && !fn.dataset.touched) fn.value = O.asc(P.settings.progName).replace(/[^A-Z0-9]/g, '') || 'PROG';
    const ig = $('#igfCode'); if (ig) ig.innerHTML = box.innerHTML;
    const iw = $('#igfCodeWarn'); if (iw) iw.innerHTML = $('#codeWarn').innerHTML;
    paintGate();
  }
  const fileName = () => (O.asc(($('#fname') && $('#fname').value) || P.settings.progName || '').replace(/[^A-Z0-9_-]/g, '') || 'PROG') + '.MIN';
  function projectSig() { return JSON.stringify({ s: P.settings, o: P.ops, g: P.igf }); }
  let simDoneSig = null;
  function simulated() { return simDoneSig === projectSig(); }
  function exportAllowed() {
    if (simulated()) return true;
    return confirm('Chưa mô phỏng (hoặc chương trình đã đổi sau lần mô phỏng). Vẫn xuất mã?\n\nNên mở bước Mô phỏng, chạy hết đường dao, rồi mới xuất. Trên máy vẫn phải chạy thử không phôi.');
  }
  function paintGate() {
    document.querySelectorAll('.simgate').forEach(g => {
      if (simulated()) {
        g.className = 'danger slim simgate gateok';
        g.textContent = 'Đã mô phỏng đường dao với dữ liệu hiện tại. Có thể xuất .MIN. Vẫn phải chạy thử không phôi trên máy.';
      } else {
        g.className = 'danger slim simgate';
        g.textContent = 'Chưa mô phỏng (hoặc đã sửa sau lần mô phỏng). Hãy chạy bước Mô phỏng trước khi xuất. Xuất lúc này sẽ hỏi lại.';
      }
    });
  }
  async function doCopyCode() {
    if (!exportAllowed()) return;
    try { await navigator.clipboard.writeText(R.text); toast('Đã sao chép ' + R.lines.length + ' dòng'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = R.text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Đã sao chép'); }
  }
  function doDownloadCode() {
    if (!exportAllowed()) return;
    const b = new Blob([R.text], { type: 'application/octet-stream' }); const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = fileName(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Đã tải ' + fileName());
  }
  async function doShareCode() {
    if (!exportAllowed()) return;
    try {
      const file = new File([R.text], fileName(), { type: 'text/plain' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: fileName() });
      else if (navigator.share) await navigator.share({ title: fileName(), text: R.text });
      else { await navigator.clipboard.writeText(R.text); toast('Thiết bị không hỗ trợ chia sẻ – đã sao chép'); }
    } catch (e) { if (e.name !== 'AbortError') toast('Không chia sẻ được: ' + e.message); }
  };

  // ---------- Xem trước ----------
  function renderPrevSel() {
    const s = $('#prevSel'); if (!s) return;
    s.innerHTML = `<option value="">— Tô sáng nguyên công —</option>` + P.ops.map((o, i) => `<option value="${o.id}" ${o.id === selId ? 'selected' : ''}>${i + 1}. ${esc(O.OPS[o.type].name)}</option>`).join('');
  }
  function num(v, d) { return v === '' || v == null || isNaN(Number(v)) ? d : Number(v); }
  function drawPreview() {
    const S = Object.assign({}, O.DEFAULT_SETTINGS, P.settings), D = num(S.stockD, 60), Rr = D / 2, Lg = num(S.stockL, 100);
    const ops = P.ops.filter(o => o.on !== false);
    const fz = ops.find(o => o.type === 'facing'); const zS = fz ? num(fz.zStock, 0) : 0;
    // ---- mặt cắt dọc
    const cv = $('#cvSide'); if (!cv) { syncPrev3d(); return; }
    syncCanvasBuffer(cv);
    const g = cv.getContext('2d'), Wd = cv.width, Ht = cv.height;
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
    if (simDriven && PATH && loadView().showPath !== false) {
      const px = Number(loadView().linePx) || 1.25;
      const scale = cv.width / Math.max(1, cv.clientWidth || cv.width);
      const lim = Math.min(sim.mi, PATH.moves.length);
      PATH.moves.slice(0, lim).forEach(m => {
        const rapid = m.kind === 'rapid';
        g.strokeStyle = rapid ? '#e8750a' : '#1565c0';
        g.lineWidth = Math.max(1, px * scale);
        g.globalAlpha = rapid ? 0.7 : 0.85;
        g.setLineDash(rapid ? [5, 4] : []);
        g.beginPath(); g.moveTo(X(m.z0), Y(m.r0)); g.lineTo(X(m.z1), Y(m.r1)); g.stroke();
      });
      g.globalAlpha = 1; g.setLineDash([]); g.lineWidth = 1;
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
    applyPrevView();
    syncPrev3d();
  }

  // ---------- Tra cứu ----------
  const SRC = 'Nguồn đã đối chiếu: OSP-P500 PROGRAMMING MANUAL, 2nd ed., LE33-021-R2 (Oct 2023) — tài liệu lập trình chuẩn; Advanced One-Touch IGF-L LE32-238-R1 (8/2023) và LE32-239-R1 (5/2023); Okuma Basic Programming Manual CNC Lathe (6/2005); tờ ví dụ dao động lực. Máy chủ là OSP-P300L trên LB3000EX II. Số trang P-… là trang in của LE33-021-R2. Mục ghi cho P500 mà P300L không có sẽ được chú thích.';
  const HELP = [
    ['Cấu trúc chương trình', [
      ['O + tên', 'Tên chương trình: chữ O rồi tối đa 8 ký tự (IGF LE32-238 tr.301, ví dụ O1234). Sách 2005 (Word Format) chỉ cho 1 chữ + 3 ký tự sau O. Ứng dụng cắt còn 8 ký tự và luôn ghi dòng này.', 'v'],
      ['$TEN.MIN%', 'LE33-021 P-510: dòng đầu tệp chính là $ + tên + .MIN rồi % (ví dụ $SHAFT-A. MIN %). Ứng dụng ghi liền $TEN.MIN%. Kết thúc tệp bằng % một dòng riêng. Tên sau O tối đa 8 ký tự (P-1, P-3).', 'v'],
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
      ['G85 NAT01 D F U W', 'Tiện thô thanh. LE33-021 P-312: G85 NAT D F U W. D và U theo đường kính, W theo Z. Ví dụ P-509 đặt G96/S/M và T trước G85, không nhét vào block G85. Bộ điều khiển tìm biên dạng theo tên NAT (P-315).', 'v'],
      ['G86 NAT01 D F U W', 'Tiện thô chép hình (phôi đúc/rèn).', 'v'],
      ['G87 NAT01', 'Tiện tinh theo biên dạng; bước tiến lấy từ trong biên dạng.', 'v'],
      ['NAT01 G81 … G80', 'Định nghĩa biên dạng dọc (G82: biên dạng ngang). Tên chuỗi bắt đầu bằng N.', 'v'],
      ['G02/G03 X Z I', 'Trong biên dạng tiện, bán kính ghi bằng I. Ví dụ IGF LE32-238 tr.333: G02 X98 Z25 I4 (trong G81…G80, gọi bởi G87). Cung phay trục Y dùng L (và J, K) — LE32-238 tr.359: G02 Y Z J K L.', 'v'],
      ['G41/G42 trong biên dạng', 'Bù mũi dao trong biên dạng LAP – một số máy báo lỗi cắt lẹm khi thô; tắt tùy chọn nếu gặp lỗi.', 'f'],
      ['M85', 'Không quay về điểm bắt đầu sau chu trình thô LAP.', 'v']]],
    ['Tiện ren', [
      ['G71 X Z B D U H F', 'Chu trình ren dọc, LE33-021 P-174..P-176 và P-182. X là đường kính lát cuối. D, U, H theo đường kính. Ví dụ P-176 là ren ngoài (X28 trên côn). M32/M33/M34 và M73/M74/M75: P-179..P-180.', 'v'],
      ['M32/M33/M34', 'LE33-021 P-179: M32 một sườn, M33 zíc zắc, M34 một sườn ngược. M73/M74/M75 là mẫu chia lát (P-180).', 'v'],
      ['M73/M74/M75', 'Mẫu chia lát. P-180 mô tả M73 lát D tới gần H−U nhưng không ghi alarm khi D > H−U — ứng dụng chỉ cảnh báo, không chặn xuất mã. H−U < 0 vẫn là lỗi (P-175).', 'v'],
      ['Ren trong G71', 'Cùng G71 (P-174). Không có ví dụ ren trong: P-176 chỉ ren ngoài. Ứng dụng đặt điểm vào nhỏ hơn và X cuối = đường kính lớn (P-182: X là đường kính lát cuối). H trong ≈ 1.0825×P. Cần chạy thử trên P300L.', 'f'],
      ['M22 / M23', 'LE33-021 P-76 mục 9 và P-167: M23 bật vát cuối ren, M22 tắt. P-175: có M23 mà không có L thì L = 1 bước. Ô vát bật → M23, tắt → M22. Bảng sách 2005 ghi ngược; mã xuất theo LE33-021, không đảo cực.', 'v']]],
    ['Rãnh / khoan tĩnh', [
      ['G73 X Z I K D L F E', 'Chu trình rãnh dọc (ăn dao theo X, dịch K theo Z).', 'v'],
      ['G74 X Z I K D L F E', 'Chu trình rãnh mặt / khoan (ăn dao theo Z). Bắt buộc có Z.', 'v'],
      ['D trong G73/G74', 'LE33-021 P-197: G73 D/DP là chiều sâu cắt; hình 7-54 ghi D/2 nên D theo đường kính. P-200: G74 D là chiều sâu mỗi nhát theo Z (hình không chia đôi). P-202: G74 luôn cần X và Z. Khoan tâm: G74 X0 Z D F.', 'v']]],
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
      ['X trong G138', 'Từ G138 đến G136, X theo bán kính. LE33-021 P-265 mục 4 (điểm về G118 trong chế độ trục Y) và IGF LE32-238 tr.353. Mặc định của ứng dụng là bán kính.', 'v'],
      ['G137', 'Chuyển đổi hệ tọa độ (nội suy cực) – ứng dụng không dùng.', 'f']]],
    ['Ụ động / chống tâm', [
      ['M56 / M55', 'Sách 2005, bảng mã M trang 2: M56 Tailstock spindle advance (tiến), M55 Tailstock spindle retract (lùi). IGF LE32-238 mục 22 gọi quy trình là TS ADVANCE / TS RETRACT, không in lại hai mã M này.', 'v'],
      ['G195 SP=n', 'LE33-021 P-673 chỉ ghi tên “NC tailstock multi sizing position”. Không có địa chỉ SP=. Ứng dụng vẫn xuất G195 SP=n khi chọn ụ NC và có số bộ, kèm cảnh báo. Kiểm tra trên OSP-P300L.', 'u'],
      ['M847', 'Ụ động NC về gốc – theo diễn đàn.', 'u'],
      ['M20 / M21', 'Sách 2005 trang 2: M20 Tailstock barrier Off, M21 Tailstock barrier On. IGF LE32-238 tr.306: vùng cấm bắt đầu bằng M21 và kết thúc bằng M20.', 'v'],
      ['M156 / M157', 'Bật / tắt khóa liên động làm việc có tâm (cẩn thận).', 'v'],
      ['LB3000EX II có ụ NC?', 'Tùy cấu hình đặt hàng (thủy lực hoặc NC). Chọn đúng loại trong Thiết lập.', 'u']]]
  ];
  function renderHelp() {
    const bd = { v: '<span class="bd v">Đã đối chiếu</span>', f: '<span class="bd f">Diễn đàn / suy luận</span>', u: '<span class="bd u">CHƯA XÁC MINH</span>' };
    $('#helpBody').innerHTML = `<p class="small muted">${esc(SRC)}</p>` +
      HELP.map(([t, rows]) => `<h3>${esc(t)}</h3><table class="htab">${rows.map(r => `<tr><td><code>${esc(r[0])}</code><br>${bd[r[2]]}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`).join('') +
      `<div class="danger mini">Mô phỏng IGF (2D và 3D) là ước lượng hình học: chạy nhanh / chạy dao, phôi bóc dần, chấu, chống tâm, ren, rãnh, lỗ dao động lực. Không phải bộ mô phỏng OSP và không biết hình dao thật. Luôn chạy thử không phôi trên máy.</div>`;
  }

  // ---------- IGF ----------
  let PATH = null, igfDidAuto = false;
  const sim = { play: false, mi: 0, u: 0, speed: 1, raf: 0, last: 0 };
  let simView = 'both', simSection = false, prevView = '2d', prevSection = false, simDriven = false;
  const VIEW_KEY = 'okuma_sim3d_colors';
  const VIEW_PRESETS = {
    thep: { name: 'Thép', stock: '#9eabb4', cut: '#7f8e9e', tool: '#e6c233', rapid: '#fa7a0d', feed: '#1f7af0', chuck: '#5c6b78', bg: '#e7eef4' },
    nhom: { name: 'Nhôm', stock: '#d5d8dc', cut: '#b7c0c8', tool: '#f0d35a', rapid: '#ff6a00', feed: '#1565c0', chuck: '#8d98a3', bg: '#f7f9fa' },
    dong: { name: 'Đồng', stock: '#c47a45', cut: '#a85a32', tool: '#f2e07a', rapid: '#ffb300', feed: '#0d47a1', chuck: '#6d4c41', bg: '#f6efe6' },
    toi: { name: 'Tối', stock: '#8a939c', cut: '#6e787f', tool: '#ffd54f', rapid: '#ff8a50', feed: '#64b5f6', chuck: '#455a64', bg: '#1c2830' },
    sang: { name: 'Sáng', stock: '#eceff1', cut: '#cfd8dc', tool: '#f9a825', rapid: '#ef6c00', feed: '#0277bd', chuck: '#90a4ae', bg: '#ffffff' }
  };
  const VIEW_DEFAULT = Object.assign({ invert: false, preset: 'thep', showPath: true, linePx: 1.25 }, VIEW_PRESETS.thep);
  function loadView() {
    const v = Object.assign({}, VIEW_DEFAULT);
    try {
      const j = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
      if (j && typeof j === 'object') Object.assign(v, j);
    } catch (e) { /* giữ mặc định */ }
    return v;
  }
  function paintColorInputs(v, src) {
    v = v || loadView();
    document.querySelectorAll('[data-c3]').forEach(el => { if (el !== src && v[el.dataset.c3]) el.value = v[el.dataset.c3]; });
    document.querySelectorAll('[data-c3inv]').forEach(el => { if (el !== src) el.checked = !!v.invert; });
    document.querySelectorAll('[data-c3preset]').forEach(el => el.classList.toggle('on', el.dataset.c3preset === v.preset));
  }
  function saveView(v, src) {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch (e) { /* bộ nhớ đầy */ }
    if (window.OKU3D) { window.OKU3D.setAppearance(v); window.OKU3D.setPathStyle(v); }
    paintColorInputs(v, src);
    paintPathControls(v);
  }
  function paintPathControls(v) {
    v = v || loadView();
    const on = v.showPath !== false;
    document.querySelectorAll('[data-sim="path"]').forEach(b => { b.textContent = on ? 'Ẩn đường dao' : 'Hiện đường dao'; b.classList.toggle('on', on); });
    document.querySelectorAll('[data-simlwlab]').forEach(el => { el.textContent = String(v.linePx == null ? 1.25 : v.linePx); });
    document.querySelectorAll('[data-simlw]').forEach(el => { if (el !== document.activeElement) el.value = v.linePx == null ? 1.25 : v.linePx; });
  }
  function simDockHTML(withIds) {
    const id = k => withIds ? ` id="${k}"` : '';
    const v = loadView();
    const px = v.linePx == null ? 1.25 : v.linePx;
    return `<div class="simdock">
      <div class="simbar">
        <button type="button" class="b1"${id('simPlay')} data-sim="play">▶ Chạy</button>
        <button type="button" class="b2"${id('simPause')} data-sim="pause">⏸ Dừng</button>
        <button type="button" class="b2"${id('simStep')} data-sim="step">Bước</button>
        <button type="button" class="b2"${id('simReset')} data-sim="reset">⟲ Đầu</button>
      </div>
      <div class="simdockrow"><span>Tốc độ <b${id('simSpdLab')} data-simspdlab>${sim.speed}×</b></span><input${id('simSpeed')} data-simspd type="range" min="0.25" max="4" step="0.25" value="${sim.speed}"></div>
      <p class="small"${id('simStatus')} data-simstat></p>
      <div class="chips"${id('simChips')} data-simchips></div>
      <div class="simdockrow">
        <button type="button" class="b2" data-sim="path">${v.showPath === false ? 'Hiện đường dao' : 'Ẩn đường dao'}</button>
        <span>Nét <b data-simlwlab>${px}</b></span>
        <input data-simlw type="range" min="0.75" max="3" step="0.25" value="${px}">
      </div>
    </div>`;
  }
  function colorPanelHTML() {
    const keys = [['stock', 'Màu phôi'], ['cut', 'Mặt đã cắt'], ['tool', 'Màu dao'], ['rapid', 'Chạy nhanh'], ['feed', 'Chạy dao'], ['chuck', 'Màu mâm / ụ'], ['bg', 'Nền']];
    return `<details class="c3panel"><summary>Màu mô phỏng</summary>
      <div class="simbar c3presets">${Object.keys(VIEW_PRESETS).map(k => `<button type="button" class="b2" data-c3preset="${k}">${VIEW_PRESETS[k].name}</button>`).join('')}<button type="button" class="b2" data-c3preset="reset">Mặc định</button></div>
      <label class="chk"><input type="checkbox" data-c3inv> Đảo chiều xoay</label>
      ${keys.map(([k, lab]) => `<label class="crow"><span>${lab}</span><input type="color" data-c3="${k}" value="${VIEW_DEFAULT[k]}"></label>`).join('')}
    </details>`;
  }
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
  function stopSim() { sim.play = false; if (sim.raf) cancelAnimationFrame(sim.raf); sim.raf = 0; }
  function applyIgf() {
    const d = O.decideProcesses(igf());
    if (!d.ops.length) return d;
    const ig = igf();
    P.settings.stockD = Number(ig.od) || P.settings.stockD;
    P.settings.stockL = Number(ig.ol) || P.settings.stockL;
    P.settings.material = ig.material || P.settings.material;
    P.settings.g50 = Number(ig.g50) || P.settings.g50;
    if (ig.tailD !== '' && ig.tailD != null) P.settings.tailDia = Number(ig.tailD) || P.settings.tailDia;
    P.settings.jawLen = Number(ig.jawL2) || P.settings.jawLen;
    P.settings.jawOd = Number(ig.jawD3) || P.settings.jawOd;
    if (ig.useCenter && P.settings.tail === 'none') P.settings.tail = 'quill';
    P.ops = d.ops;
    simDoneSig = null;
    renderSettings();
    return d;
  }
  function toolPos() {
    const mv = PATH && PATH.moves || [];
    if (!mv.length) return null;
    if (sim.mi >= mv.length) { const m = mv[mv.length - 1]; return { z: m.z1, r: m.r1, i: m.i, id: m.opId, tail: false, done: true, kind: 'feed' }; }
    const m = mv[sim.mi];
    const L = Math.hypot(m.z1 - m.z0, m.r1 - m.r0) || 1;
    const u = Math.max(0, Math.min(1, sim.u / L));
    return { z: m.z0 + (m.z1 - m.z0) * u, r: m.r0 + (m.r1 - m.r0) * u, i: m.i, id: m.opId, tail: m.tail, kind: m.kind };
  }
  function renderSimChrome() {
    const chipHtml = P.ops.map((op, i) => `<button type="button" class="${op.on === false ? 'off' : ''}" data-id="${op.id}">${i + 1}. ${esc(O.OPS[op.type] ? O.OPS[op.type].name : op.type)}</button>`).join('');
    const chipBoxes = document.querySelectorAll('[data-simchips]');
    if (!chipBoxes.length || !PATH) return;
    chipBoxes.forEach(chips => { chips.innerHTML = chipHtml; });
    const rows = (PATH.hits || []).map(h => ({ msg: h.msg, at: h.at, kind: h.kind }));
    (R && R.warnings || []).forEach(w => {
      if (w.lvl === 'info') return;
      if (!rows.some(r => r.msg === w.msg)) rows.push({ msg: (w.lvl === 'err' ? 'Lỗi: ' : 'Cảnh báo: ') + w.msg, at: 0, kind: w.lvl, always: true });
    });
    const box = $('#simHits');
    if (box) box.innerHTML = rows.length ? `<ul class="wlist" id="hitList">${rows.map(r => `<li class="${r.kind === 'err' ? 'err' : ''}" data-at="${r.at}" data-always="${r.always ? 1 : 0}">${esc(r.msg)}</li>`).join('')}</ul>` : `<p class="hint">Không thấy va chạm chấu, chống tâm, vượt hành trình, khỏa tới tâm hoặc cắt đứt khi chống tâm đang tiến.</p>`;
  }
  function paintSimStatus(pos) {
    const pct = PATH && PATH.moves.length ? Math.round(100 * Math.min(sim.mi, PATH.moves.length) / PATH.moves.length) : 0;
    const op = pos ? P.ops[pos.i] : null;
    const nm = op && O.OPS[op.type] ? O.OPS[op.type].name : '—';
    const stat = `${pct}% · ${pos && pos.done ? 'đã chạy hết' : sim.play ? 'đang chạy' : 'dừng'} · ${nm}` + (pos && !pos.done && pos.kind ? ` · ${pos.kind === 'rapid' ? 'chạy nhanh' : 'chạy dao'}` : '') + (pos && pos.tail ? ' · có chống tâm' : '');
    document.querySelectorAll('[data-simstat]').forEach(st => { st.textContent = stat; });
    document.querySelectorAll('[data-simchips] button').forEach(b => b.classList.toggle('on', !!(pos && b.dataset.id === pos.id)));
    document.querySelectorAll('#hitList li').forEach(li => { li.style.opacity = (li.dataset.always === '1' || Number(li.dataset.at) <= sim.mi) ? '1' : '0.4'; });
  }
  function syncCanvasBuffer(cv) {
    if (!cv || cv.clientWidth < 2 || cv.clientHeight < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(cv.clientWidth * dpr));
    const h = Math.max(2, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  function fitViewStack(bar, canvases, dock) {
    if (!bar || !dock || !canvases.length) return;
    const head = document.querySelector('header.bar');
    const tabs = document.querySelector('.tabs');
    const top = (head ? head.getBoundingClientRect().height : 56) + 6;
    const tabH = tabs ? Math.max(48, tabs.getBoundingClientRect().height) : 56;
    bar.style.scrollMarginTop = top + 'px';
    dock.style.scrollMarginBottom = (tabH + 8) + 'px';
    bar.scrollIntoView({ block: 'start', inline: 'nearest' });
    const limit = (tabs ? tabs.getBoundingClientRect().top : window.innerHeight) - 4;
    let extra = dock.getBoundingClientRect().height + 8;
    canvases.forEach(cv => {
      const wrap = cv.parentElement;
      if (!wrap) return;
      const cs = getComputedStyle(wrap);
      extra += (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
      Array.prototype.forEach.call(wrap.children, ch => {
        if (ch === cv) return;
        if (ch === dock || (ch.contains && ch.contains(dock))) return;
        extra += ch.getBoundingClientRect().height;
      });
    });
    const avail = limit - bar.getBoundingClientRect().bottom - extra;
    let each = Math.max(96, Math.floor(avail / canvases.length));
    canvases.forEach(cv => { cv.style.height = each + 'px'; });
    const over = dock.getBoundingClientRect().bottom - limit;
    if (over > 1) {
      each = Math.max(96, each - Math.ceil((over + 6) / canvases.length));
      canvases.forEach(cv => { cv.style.height = each + 'px'; });
    }
  }
  function flowOn() { const v = $('#v-flow'); return !!(v && v.classList.contains('on') && activeSetup()); }
  function simOn() { return flowOn() && igfStep === 5; }
  function fitSimFrame() {
    const view = $('#v-flow');
    if (!simOn() || !view) return;
    const bar = $('#simViewBar');
    const dock = view.querySelector('.simdock');
    const canvases = ['#cvSim', '#cvSim3d'].map(sel => $(sel)).filter(cv => cv && cv.parentElement && !cv.parentElement.hidden);
    fitViewStack(bar, canvases, dock);
  }
  function fitPrevFrame() {
    if (!simOn()) return;
    const bar = $('#prevViewBar');
    if (prevView === '3d') fitViewStack(bar, [$('#cvPrev3d')].filter(Boolean), document.querySelector('#prevDock3d .simdock'));
    else fitViewStack(bar, [$('#cvSide')].filter(Boolean), document.querySelector('#prevDock2d .simdock'));
  }
  function scheduleFitSim() {
    requestAnimationFrame(() => {
      fitSimFrame();
      if ($('#cvSim') && PATH) drawSim();
    });
  }
  function scheduleFitPrev() {
    requestAnimationFrame(() => {
      fitPrevFrame();
      if (simOn()) drawPreview();
    });
  }
  function drawSim() {
    if (!PATH) return;
    const cv = $('#cvSim');
    if (!cv) {
      paintSimStatus(toolPos());
      if (simOn() && !sim.play) drawPreview();
      return;
    }
    syncCanvasBuffer(cv);
    const g = cv.getContext('2d'), Wd = cv.width, Ht = cv.height;
    const S = Object.assign({}, O.DEFAULT_SETTINGS, P.settings);
    const stockR = PATH.blank.r, jawR = Math.max(PATH.chuck.jawR, stockR);
    const zmin = PATH.chuck.z - 8, zmax = Math.max(12, PATH.blank.z1 + 6);
    const rmax = jawR + 8;
    const sc = Math.min((Wd - 24) / Math.max(1, zmax - zmin), (Ht - 24) / (2 * rmax));
    const X = z => 12 + (z - zmin) * sc, Y = r => Ht / 2 - r * sc;
    g.clearRect(0, 0, Wd, Ht); g.fillStyle = '#fbfcfd'; g.fillRect(0, 0, Wd, Ht);
    g.setLineDash([8, 4]); g.strokeStyle = '#9ab'; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(Wd, Y(0)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#b0bec5';
    g.fillRect(X(zmin), Y(jawR), Math.max(1, X(PATH.chuck.z) - X(zmin)), Y(stockR * 0.2) - Y(jawR));
    g.fillRect(X(zmin), Y(-stockR * 0.2), Math.max(1, X(PATH.chuck.z) - X(zmin)), Y(-jawR) - Y(-stockR * 0.2));
    if (PATH.chuck.jawLen > 0) {
      g.fillStyle = '#90a4ae';
      const x0 = X(PATH.chuck.z), x1 = X(PATH.chuck.z + PATH.chuck.jawLen);
      g.fillRect(x0, Y(jawR), x1 - x0, Y(stockR) - Y(jawR));
      g.fillRect(x0, Y(-stockR), x1 - x0, Y(-jawR) - Y(-stockR));
    }
    g.fillStyle = '#eceff1';
    g.fillRect(X(PATH.blank.z0), Y(stockR), X(PATH.blank.z1) - X(PATH.blank.z0), Y(-stockR) - Y(stockR));
    g.strokeStyle = '#78909c'; g.setLineDash([4, 3]);
    g.strokeRect(X(PATH.blank.z0), Y(stockR), X(PATH.blank.z1) - X(PATH.blank.z0), Y(-stockR) - Y(stockR));
    g.setLineDash([]);
    function strokeMove(m) {
      const view = loadView();
      if (view.showPath === false) return;
      g.globalAlpha = 1; g.setLineDash([]);
      const rapid = m.kind === 'rapid';
      const cz = z => Math.max(zmin, Math.min(zmax, z));
      const cr = r => Math.max(-rmax, Math.min(rmax, r));
      const z0 = cz(m.z0), r0 = cr(m.r0), z1 = cz(m.z1), r1 = cr(m.r1);
      if (Math.hypot(z1 - z0, r1 - r0) < 0.05) return;
      const px = Number(view.linePx) || 1.25;
      const css = Math.max(1, cv.clientWidth || Wd);
      g.strokeStyle = rapid ? '#e8750a' : '#1565c0';
      g.lineWidth = Math.max(1, px * Wd / css);
      g.setLineDash(rapid ? [5, 4] : []);
      [1, -1].forEach(sg => {
        g.globalAlpha = sg < 0 ? 0.35 : (rapid ? 0.72 : 0.85);
        g.beginPath(); g.moveTo(X(z0), Y(sg * r0)); g.lineTo(X(z1), Y(sg * r1)); g.stroke();
      });
      g.globalAlpha = 1; g.setLineDash([]); g.lineWidth = 1;
    }
    const pos = toolPos();
    const shown = PATH.moves.slice(0, Math.min(sim.mi, PATH.moves.length));
    if (sim.mi < PATH.moves.length && pos) shown.push({ z0: PATH.moves[sim.mi].z0, r0: PATH.moves[sim.mi].r0, z1: pos.z, r1: pos.r, kind: PATH.moves[sim.mi].kind });
    shown.filter(m => m.kind === 'rapid').forEach(strokeMove);
    shown.filter(m => m.kind !== 'rapid').forEach(strokeMove);
    g.globalAlpha = 1; g.setLineDash([]); g.lineWidth = 1;
    if (PATH.finish && PATH.finish.length > 1) {
      [1, -1].forEach(sg => {
        g.beginPath(); PATH.finish.forEach((p, i) => { const x = X(p.z), y = Y(sg * p.r); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.strokeStyle = sg > 0 ? '#2e7d32' : '#81c784'; g.lineWidth = sg > 0 ? 2.4 : 1.3; g.stroke();
      });
      g.lineWidth = 1;
    }
    if (pos && pos.tail && S.tail !== 'none') {
      g.fillStyle = '#6a1b9acc';
      g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(9), Y(PATH.tailDia / 2)); g.lineTo(X(9), Y(-PATH.tailDia / 2)); g.closePath(); g.fill();
    }
    (PATH.hits || []).forEach(h => {
      if (h.at <= sim.mi) {
        g.strokeStyle = '#c62828'; g.lineWidth = 2;
        g.beginPath(); g.arc(X(h.z), Y(Math.max(-rmax, Math.min(rmax, h.r))), 7, 0, 7); g.stroke(); g.lineWidth = 1;
      }
    });
    if (pos) {
      const x = X(Math.max(zmin, Math.min(zmax, pos.z))), y = Y(Math.max(-rmax, Math.min(rmax, pos.r)));
      g.fillStyle = '#c62828'; g.beginPath(); g.moveTo(x + 9, y); g.lineTo(x - 4, y - 6); g.lineTo(x - 4, y + 6); g.closePath(); g.fill();
    }
    paintSimStatus(pos);
    syncSim3d(pos);
    if (simOn() && !sim.play) drawPreview();
  }
  function applySimView() {
    const w2 = $('#sim2dWrap'), w3 = $('#sim3dWrap');
    if (w2) w2.hidden = simView === '3d';
    if (w3) w3.hidden = simView === '2d';
    [['sim2d', '2d'], ['sim3d', '3d'], ['simBoth', 'both']].forEach(([id, v]) => { const b = $('#' + id); if (b) b.classList.toggle('on', simView === v); });
    const sb = $('#simSection'); if (sb) sb.classList.toggle('on', simSection);
  }
  function syncSim3d(pos) {
    const V = window.OKU3D; if (!V) return;
    const cv = $('#cvSim3d');
    const show = !!(cv && simView !== '2d' && simOn());
    if (!show) { if (V.current() === cv) V.unmount(); return; }
    const S = Object.assign({}, O.DEFAULT_SETTINGS, P.settings);
    V.mount(cv);
    V.setSection(simSection);
    V.setAppearance(loadView());
    V.setPathStyle(loadView());
    V.update({
      moves: PATH.moves, ops: P.ops, blank: PATH.blank, chuck: PATH.chuck,
      mi: sim.mi, u: sim.u, playing: sim.play,
      tailOn: !!(pos && pos.tail && S.tail !== 'none'), tailDia: PATH.tailDia
    });
  }
  function applyPrevView() {
    const w2 = $('#prev2dWrap'), w3 = $('#prev3dWrap');
    if (w2) w2.hidden = prevView === '3d';
    if (w3) w3.hidden = prevView !== '3d';
    const b2 = $('#prev2d'), b3 = $('#prev3d');
    if (b2) b2.classList.toggle('on', prevView === '2d');
    if (b3) b3.classList.toggle('on', prevView === '3d');
    const sb = $('#prevSection'); if (sb) sb.classList.toggle('on', prevSection);
  }
  function syncPrev3d() {
    const V = window.OKU3D; if (!V) return;
    const cv = $('#cvPrev3d');
    const show = !!(cv && prevView === '3d' && simOn());
    if (!show) { if (V.current() === cv) V.unmount(); return; }
    const path = O.buildToolpath(P);
    const S = Object.assign({}, O.DEFAULT_SETTINGS, P.settings);
    const last = path.moves.length ? path.moves[path.moves.length - 1] : null;
    V.mount(cv);
    V.setSection(prevSection);
    V.setAppearance(loadView());
    V.setPathStyle(loadView());
    const live = simDriven && PATH;
    V.update({
      moves: path.moves, ops: P.ops, blank: path.blank, chuck: path.chuck,
      mi: live ? sim.mi : path.moves.length, u: live ? sim.u : 0, playing: !!(live && sim.play),
      tailOn: !!(last && last.tail && S.tail !== 'none'), tailDia: path.tailDia
    });
  }
  function finishPlay() {
    stopSim(); if (!PATH) return; sim.mi = PATH.moves.length; sim.u = 0;
    simDoneSig = projectSig(); drawSim(); paintGate(); toast('Đã mô phỏng xong — có thể xuất mã');
  }
  function frame(ts) {
    if (!sim.play || !PATH) return;
    const dt = Math.min(0.05, (ts - (sim.last || ts)) / 1000); sim.last = ts;
    const m = PATH.moves[sim.mi];
    if (!m) { finishPlay(); return; }
    const L = Math.max(0.15, Math.hypot(m.z1 - m.z0, m.r1 - m.r0));
    sim.u += (m.kind === 'rapid' ? 220 : 55) * sim.speed * dt;
    if (sim.u >= L) { sim.u = 0; sim.mi++; if (sim.mi >= PATH.moves.length) { finishPlay(); return; } }
    drawSim(); sim.raf = requestAnimationFrame(frame);
  }
  function enterSim(reset) {
    stopSim();
    PATH = O.buildToolpath(P);
    if (reset) { sim.mi = 0; sim.u = 0; }
    renderSimChrome(); drawSim();
    scheduleFitSim();
  }
  const FLOW_STEPS = [
    [1, 'Thiết lập', 'BLANK/SETUP'],
    [2, 'Phôi', 'BLANK'],
    [3, 'Biên dạng', 'TURNING SHAPE'],
    [4, 'Nguyên công', 'PROCESS DECIDE'],
    [5, 'Mô phỏng', 'SIMULATION'],
    [6, 'Xuất code', 'PROGRAM CREATE']
  ];
  function stepDone(n) {
    const ig = igf();
    if (n === 1) return !!(P.settings.progName && String(P.settings.progName).trim());
    if (n === 2) return Number(ig.od) > 0 && Number(ig.ol) > 0;
    if (n === 3) return (ig.elems || []).length > 0;
    if (n === 4) return P.ops.length > 0;
    if (n === 5 || n === 6) return simulated();
    return false;
  }
  function paintFlowChrome() {
    const box = $('#flowSteps');
    if (box) {
      box.innerHTML = FLOW_STEPS.map(([n, t]) => {
        const on = n === igfStep ? ' on' : '';
        const ok = stepDone(n) ? ' ok' : '';
        return `<button type="button" data-step="${n}" class="${on}${ok}">${n}${stepDone(n) ? ' ✓' : ''}<br>${esc(t)}</button>`;
      }).join('');
    }
    const back = $('#flowBack'), next = $('#flowNext');
    if (back) back.disabled = igfStep <= 1;
    if (next) next.disabled = igfStep >= 6;
    const fab = $('#fab');
    if (fab) fab.hidden = !(flowOn() && igfStep === 4);
  }
  function setupMeta(s) {
    const p = (s && s.project) || {};
    const st = Object.assign({}, O.DEFAULT_SETTINGS, p.settings || {});
    const ig = Object.assign({}, O.DEFAULT_IGF, p.igf || {});
    const prog = O.asc(st.progName || '').replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PROG';
    const od = ig.od != null && ig.od !== '' ? ig.od : st.stockD;
    const ol = ig.ol != null && ig.ol !== '' ? ig.ol : st.stockL;
    let when = '';
    try { when = new Date(s.modified || s.created || Date.now()).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { when = ''; }
    return { prog: 'O' + prog, mat: ig.material || st.material || '', size: 'Ø' + od + ' × ' + ol, when };
  }
  function paintThumb(cv, s) {
    const g = cv.getContext('2d'); if (!g) return;
    const W = cv.width, H = cv.height;
    const p = normalizeProject(s.project);
    const D = Number(p.igf.od) || Number(p.settings.stockD) || 60;
    const L = Number(p.igf.ol) || Number(p.settings.stockL) || 80;
    const Rr = D / 2;
    g.fillStyle = '#e7eef4'; g.fillRect(0, 0, W, H);
    const zmin = -L - 10, zmax = 12, rmax = Rr + 8;
    const sc = Math.min((W - 10) / (zmax - zmin), (H - 10) / (2 * rmax));
    const X = z => 5 + (z - zmin) * sc, Y = r => H / 2 - r * sc;
    g.fillStyle = '#90a4ae';
    g.fillRect(X(zmin), Y(rmax * 0.92), Math.max(1, X(-L) - X(zmin)), Y(-rmax * 0.92) - Y(rmax * 0.92));
    g.fillStyle = '#cfd8dc';
    g.fillRect(X(-L), Y(Rr), Math.max(1, X(0) - X(-L)), Y(-Rr) - Y(Rr));
    g.strokeStyle = '#1565c0'; g.lineWidth = 2;
    g.strokeRect(X(-L), Y(Rr), Math.max(1, X(0) - X(-L)), Y(-Rr) - Y(Rr));
  }
  function renderSetups() {
    const ul = $('#setupList'); if (!ul) return;
    const items = LIB.items || [];
    const empty = $('#setupEmpty'); if (empty) empty.style.display = items.length ? 'none' : 'block';
    const count = $('#setupCount'); if (count) count.textContent = items.length ? items.length + ' setup' : '';
    ul.innerHTML = items.map(s => {
      const m = setupMeta(s);
      return `<li class="op setupcard${s.id === LIB.active ? ' on' : ''}" data-sid="${esc(s.id)}">
        <canvas class="thumb" width="192" height="112" data-thumb="${esc(s.id)}"></canvas>
        <div class="setupmeta">
          <b>${esc(s.name)}</b>
          <small>${esc(m.prog)} · ${esc(m.mat)} · ${esc(m.size)}</small>
          <small>${esc(m.when)}</small>
          <div class="setupacts">
            <button type="button" data-sa="open">Mở</button>
            <button type="button" data-sa="copy">Sao chép</button>
            <button type="button" data-sa="rename">Đổi tên</button>
            <button type="button" data-sa="del">Xóa</button>
            <button type="button" data-sa="exp">Xuất</button>
          </div>
        </div>
      </li>`;
    }).join('');
    ul.querySelectorAll('canvas.thumb').forEach(cv => {
      const s = items.find(x => x.id === cv.dataset.thumb);
      if (s) paintThumb(cv, s);
    });
  }
  function paintHeader() {
    const s = activeSetup();
    const flow = $('#v-flow') && $('#v-flow').classList.contains('on') && s;
    const step = FLOW_STEPS[Math.max(0, Math.min(5, igfStep - 1))];
    const title = $('#headTitle'), sub = $('#headSub');
    if (flow) {
      const m = setupMeta(s);
      if (title) title.textContent = s.name;
      if (sub) sub.textContent = m.prog + ' · ' + step[1] + ' (' + step[2] + ')';
      const fn = $('#flowName'); if (fn) fn.textContent = s.name;
    } else {
      if (title) title.textContent = 'Okuma LB3000EX II';
      if (sub) sub.textContent = 'OSP-P300L · Quản lý setup';
    }
  }
  function showView(id) {
    if (activeSetup()) persistLib();
    document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.v === id));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === id));
    if (id !== 'v-flow') stopSim();
    if (window.OKU3D) {
      const cur = window.OKU3D.current();
      if (id !== 'v-flow' && cur && (cur.id === 'cvSim3d' || cur.id === 'cvPrev3d')) window.OKU3D.unmount();
    }
    if (id === 'v-setup') renderSetups();
    if (id === 'v-flow') {
      const work = $('#flowWork'), empty = $('#flowEmpty');
      if (activeSetup()) {
        if (work) work.hidden = false;
        if (empty) empty.style.display = 'none';
        renderIgf();
      } else {
        if (work) work.hidden = true;
        if (empty) empty.style.display = 'block';
        const fab = $('#fab'); if (fab) fab.hidden = true;
      }
    }
    paintHeader();
    paintFlowChrome();
    window.scrollTo(0, 0);
  }
  function openSetup(id, step) {
    const s = LIB.items.find(x => x.id === id); if (!s) return;
    LIB.active = id;
    P = normalizeProject(s.project);
    igfStep = step || s.step || 1;
    if (igfStep < 1 || igfStep > 6) igfStep = 1;
    simDoneSig = null;
    persistLib();
    showView('v-flow');
  }
  function beginSetup(name, project, step) {
    const s = makeSetup(name, project);
    s.step = step || 1;
    LIB.items.unshift(s);
    LIB.active = s.id;
    P = normalizeProject(s.project);
    igfStep = s.step;
    simDoneSig = null;
    persistLib();
    showView('v-flow');
    return s;
  }
  function startTest1() {
    const ig = O.igfTutorial();
    const project = {
      settings: Object.assign({}, O.DEFAULT_SETTINGS, {
        progName: 'TEST1', comment: 'IGF TEST1',
        stockD: ig.od, stockL: ig.ol, material: ig.material,
        g50: ig.g50, jawLen: ig.jawL2, jawOd: ig.jawD3, tailDia: ig.tailD
      }),
      ops: [],
      igf: ig
    };
    const s = makeSetup('TEST1', project);
    s.step = 3;
    LIB.items.unshift(s);
    LIB.active = s.id;
    P = normalizeProject(s.project);
    igfStep = 3;
    simDoneSig = null;
    applyIgf();
    persistLib();
    showView('v-flow');
    toast('Đã tạo TEST1');
  }
  function downloadJson(obj, name) {
    const b = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function askName(title, value, okLabel, onOk) {
    openSheet(title, `<label class="fld"><span>Tên setup</span><input id="nameAsk" type="text" value="${esc(value)}"></label><div class="btns"><button type="button" class="b1" id="nameOk">${esc(okLabel || 'Lưu')}</button></div>`);
    const inp = $('#nameAsk');
    if (inp) { inp.focus(); inp.select(); }
    $('#nameOk').onclick = () => {
      const nm = ($('#nameAsk').value || '').trim();
      if (!nm) { alert('Nhập tên setup'); return; }
      closeSheet();
      onOk(nm);
    };
  }
  function copySetup(id) {
    if (activeSetup()) persistLib();
    const src = LIB.items.find(s => s.id === id); if (!src) return;
    const snap = JSON.parse(JSON.stringify(src.project));
    askName('Sao chép setup', src.name + ' (bản sao)', 'Sao chép', nm => {
      const s = makeSetup(nm, snap);
      const base = O.asc(nm).replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (base && s.project.settings) s.project.settings.progName = base;
      if (s.project.settings) s.project.settings.comment = nm;
      LIB.items.unshift(s);
      try { localStorage.setItem(LIB_KEY, JSON.stringify(LIB)); } catch (e) { /* bộ nhớ đầy */ }
      renderSetups();
      toast('Đã sao chép');
    });
  }
  function renameSetup(id) {
    const s = LIB.items.find(x => x.id === id); if (!s) return;
    askName('Đổi tên setup', s.name, 'Đổi tên', nm => {
      s.name = nm;
      s.modified = Date.now();
      try { localStorage.setItem(LIB_KEY, JSON.stringify(LIB)); } catch (e) { /* bộ nhớ đầy */ }
      renderSetups();
      paintHeader();
      toast('Đã đổi tên');
    });
  }
  function deleteSetup(id) {
    const s = LIB.items.find(x => x.id === id); if (!s) return;
    if (!confirm('Xóa setup “' + s.name + '”?')) return;
    LIB.items = LIB.items.filter(x => x.id !== id);
    if (LIB.active === id) {
      LIB.active = null;
      P = normalizeProject(null);
      igfStep = 1;
      simDoneSig = null;
    }
    try { localStorage.setItem(LIB_KEY, JSON.stringify(LIB)); } catch (e) { /* bộ nhớ đầy */ }
    renderSetups();
    toast('Đã xóa');
  }
  function exportOne(id) {
    if (activeSetup()) persistLib();
    const s = LIB.items.find(x => x.id === id); if (!s) return;
    const safe = O.asc(s.name).replace(/[^A-Z0-9_-]/g, '') || 'SETUP';
    downloadJson({ v: 1, name: s.name, step: s.step, project: s.project }, safe + '.json');
    toast('Đã xuất ' + s.name);
  }
  function exportAll() {
    if (activeSetup()) persistLib();
    downloadJson({
      v: 1,
      items: LIB.items.map(s => ({ name: s.name, step: s.step, project: s.project }))
    }, 'okuma-setups.json');
    toast('Đã xuất ' + LIB.items.length + ' setup');
  }
  function importPayload(j) {
    let list = [];
    if (j && Array.isArray(j.items)) {
      list = j.items.map(it => {
        const src = it.project || { settings: it.settings, ops: it.ops, igf: it.igf };
        const s = makeSetup(it.name || 'Nhập', src);
        if (it.step) s.step = it.step;
        return s;
      });
    } else if (j && j.project && (j.project.ops || j.project.settings || j.project.igf)) {
      const s = makeSetup(j.name || 'Nhập', j.project);
      if (j.step) s.step = j.step;
      list = [s];
    } else if (j && Array.isArray(j.ops)) {
      const nm = (j.settings && (j.settings.comment || j.settings.progName)) || 'Nhập';
      list = [makeSetup(nm, j)];
    } else throw new Error('Tệp không hợp lệ');
    list.forEach(s => LIB.items.unshift(s));
    try { localStorage.setItem(LIB_KEY, JSON.stringify(LIB)); } catch (e) { /* bộ nhớ đầy */ }
    return list.length;
  }
  function syncIgfToSettings() {
    const ig = igf();
    if (igfStep === 1) {
      if (ig.jawL2 !== '' && ig.jawL2 != null) P.settings.jawLen = Number(ig.jawL2) || P.settings.jawLen;
      if (ig.jawD3 !== '' && ig.jawD3 != null) P.settings.jawOd = Number(ig.jawD3) || P.settings.jawOd;
      if (ig.useCenter && P.settings.tail === 'none') P.settings.tail = 'quill';
      if (ig.tailD !== '' && ig.tailD != null) P.settings.tailDia = Number(ig.tailD) || P.settings.tailDia;
    }
    if (igfStep === 2) {
      if (ig.od !== '' && ig.od != null) P.settings.stockD = Number(ig.od) || P.settings.stockD;
      if (ig.ol !== '' && ig.ol != null) P.settings.stockL = Number(ig.ol) || P.settings.stockL;
      if (ig.material) P.settings.material = ig.material;
    }
  }
  function gripHTML(ig) {
    return `<h3>Kẹp phôi (ID/OD GRIP)</h3>
      <label class="fld"><span>Cách kẹp (ID/OD GRIP)</span><select data-k="grip"><option value="od" ${ig.grip !== 'id' ? 'selected' : ''}>Kẹp ngoài (OUTSIDE)</option><option value="id" ${ig.grip === 'id' ? 'selected' : ''}>Kẹp trong (INSIDE)</option></select></label>
      ${numInp('jawL2', ig.jawL2, 'Chiều dài chấu L2 (JAW SIZE L2)')}
      ${numInp('jawD3', ig.jawD3, ig.grip === 'id' ? 'Đường kính kẹp (L3)' : 'Đường kính chấu D3')}
      <label class="chk"><input type="checkbox" data-k="useCenter" ${ig.useCenter ? 'checked' : ''}> Dùng chống tâm (USE CENTER) — khoan tâm rồi tiến ụ (TS ADVANCE, M56)</label>
      ${ig.useCenter ? numInp('tailD', ig.tailD, 'Đường kính vùng mũi tâm (DIAMETER D)') : ''}
      <div class="grid2">${numInp('roughT', ig.roughT, 'Dao thô T (ROUGH OD)')}${numInp('finishT', ig.finishT, 'Dao tinh T (FINISH OD)')}</div>`;
  }
  function previewHTML() {
    return `<h3>Xem trước</h3>
      <p class="hint">Mặt cắt dọc và mặt đầu của các nguyên công. 3D dùng cùng đường dao với mô phỏng.</p>
      <div class="simbar" id="prevViewBar">
        <button type="button" class="b2${prevView === '2d' ? ' on' : ''}" id="prev2d">2D</button>
        <button type="button" class="b2${prevView === '3d' ? ' on' : ''}" id="prev3d">3D</button>
      </div>
      <label class="fld"><span>Tô sáng nguyên công</span><select id="prevSel"></select></label>
      <div id="prev2dWrap"${prevView === '3d' ? ' hidden' : ''}>
        <div class="cvwrap"><div class="cvt">Mặt cắt dọc</div><canvas id="cvSide" width="760" height="320"></canvas></div>
        <div id="prevDock2d"></div>
        <div class="cvwrap"><div class="cvt">Mặt đầu</div><canvas id="cvFace" width="760" height="320"></canvas></div>
      </div>
      <div id="prev3dWrap"${prevView === '3d' ? '' : ' hidden'}>
        <div class="cvwrap">
          <div class="cvt">Xem trước 3D</div>
          <canvas id="cvPrev3d" width="760" height="480"></canvas>
          <div class="simbar">
            <button type="button" class="b2${prevSection ? ' on' : ''}" id="prevSection">Mặt cắt</button>
            <button type="button" class="b2" id="prevCam">Đặt lại góc nhìn</button>
          </div>
        </div>
        <div id="prevDock3d"></div>
      </div>`;
  }
  function goStep(n) {
    n = Math.max(1, Math.min(6, Number(n) || 1));
    if (n !== 5) stopSim();
    igfStep = n;
    const s = activeSetup(); if (s) s.step = n;
    persistLib();
    renderIgf();
    const box = $('#flowSteps');
    if (box) box.scrollIntoView({ block: 'start', inline: 'nearest' });
  }
  function renderIgf() {
    const root = $('#igfRoot'); if (!root) return;
    if (window.OKU3D) {
      const cur = window.OKU3D.current();
      if (cur && (cur.id === 'cvSim3d' || cur.id === 'cvPrev3d')) window.OKU3D.unmount();
    }
    const ig = igf(), M = O.matOf(ig);
    const step = FLOW_STEPS[igfStep - 1];
    let body = `<h3>${step[0]}. ${esc(step[1])} (${esc(step[2])})</h3>`;
    if (igfStep === 1) {
      body += `<p class="hint">BLANK/SETUP: máy, bảng dao, mâm, ụ động và cách kẹp. Đường kính, chiều dài và vật liệu phôi nằm ở bước Phôi (BLANK).</p>
        <form id="setForm" class="form" autocomplete="off"></form>
        <form id="igfForm" class="form" autocomplete="off">${gripHTML(ig)}</form>`;
    } else if (igfStep === 2) {
      body += `<p class="hint">Phôi (BLANK): vật liệu (MATERIAL), hình phôi (SHAPE), kích thước và mốc Z (ZERO POINT REFERENCE). Z xuất ra chương trình lấy mặt phải của phôi làm Z0, Z âm về phía mâm.</p>
        <form id="igfForm" class="form" autocomplete="off">
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
        </form>`;
    } else if (igfStep === 3) {
      const pv = O.shapePreview(ig);
      body += `<p class="hint">Biên dạng tinh (TURNING SHAPE), một nét: điểm đầu (START PT. SX, SZ), chiều (DEF. DIR.), rồi FACE / TAPER / LONG / C-CHF / R-CHF. Vát và bo nằm giữa hai đoạn thẳng. Ví dụ sách LE32-239 mục 3 (phôi S45C, Ø100×82) tạo bằng nút ví dụ trên màn Quản lý setup.</p>
        <form id="igfForm" class="form" autocomplete="off">
        <div class="grid2">${numInp('sx', ig.sx, 'Điểm đầu X, Ø (START PT. SX)')}${numInp('sz', ig.sz, 'Điểm đầu Z (START PT. SZ)')}</div>
        <label class="fld"><span>Chiều định nghĩa (DEF. DIR.)</span><select data-k="dir"><option ${ig.dir !== 'CW' ? 'selected' : ''}>CCW</option><option ${ig.dir === 'CW' ? 'selected' : ''}>CW</option></select></label>
        <div class="cvwrap"><div class="cvt">Phôi (xám) và biên dạng tinh (xanh) · Z0 ở mặt phải</div><canvas id="igfCv" width="720" height="280"></canvas></div>
        ${(pv.notes || []).map(n => `<p class="opw warn">⚠ ${esc(n)}</p>`).join('')}
        <div id="elList">${(ig.elems || []).map(elCard).join('') || '<p class="empty">Chưa có đoạn nào. Thêm FACE, LONG…</p>'}</div>
        <div class="typegrid igfadd">${Object.keys(EL_VI).map(k => `<button type="button" class="typebtn" data-addel="${k}">${esc(EL_VI[k])}</button>`).join('')}</div>
        </form>`;
    } else if (igfStep === 4) {
      if (P.ops.length) igfDidAuto = true;
      else if ((ig.elems || []).length && !igfDidAuto) {
        const d = applyIgf();
        if (d.ops && d.ops.length) { igfDidAuto = true; persistLib(); }
      }
      const notes = O.decideProcesses(ig).notes || [];
      body += `<p class="hint">PROCESS DECIDE là danh sách nguyên công của setup này, gồm cả nguyên công thêm tay (dừng, mã thô, dao động lực). Sửa, thêm, xóa, nhân bản, đảo thứ tự, bật hoặc tắt. “Quyết định lại” ghi đè danh sách từ biên dạng.</p>
        <form id="igfForm" class="form" autocomplete="off">
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
        <div class="btns"><button type="button" class="b2" id="igfRedecide">Quyết định lại từ biên dạng</button><button type="button" class="b1" id="igfAdd">＋ Thêm nguyên công</button></div>
        ${notes.map(n => `<p class="hint">⚠ ${esc(n)}</p>`).join('')}
        <h3>Nguyên công (${P.ops.length})</h3>
        <div id="sumWarn"></div>
        <ol class="ops" id="igfOps"></ol>
        </form>`;
    } else if (igfStep === 5) {
      body += `<p class="hint">Nét đứt cam = chạy nhanh, nét liền xanh = chạy dao. Phôi tròn bóc dần theo cùng đường dao. Một ngón xoay theo tay, hai ngón vừa phóng vừa kéo.</p>
        <div class="simgate danger slim"></div>
        <form id="igfForm" class="form" autocomplete="off">
        <div class="simbar" id="simViewBar">
          <button type="button" class="b2${simView === '2d' ? ' on' : ''}" id="sim2d">2D</button>
          <button type="button" class="b2${simView === '3d' ? ' on' : ''}" id="sim3d">3D</button>
          <button type="button" class="b2${simView === 'both' ? ' on' : ''}" id="simBoth">Cả hai</button>
        </div>
        <div class="simstage">
          <div class="simviews">
            <div class="cvwrap" id="sim2dWrap"${simView === '3d' ? ' hidden' : ''}><div class="cvt">Mặt cắt dọc 2D · vùng phôi (không vẽ điểm thay dao)</div><canvas id="cvSim" width="760" height="420"></canvas></div>
            <div class="cvwrap" id="sim3dWrap"${simView === '2d' ? ' hidden' : ''}>
              <div class="cvt">Mô phỏng 3D · một ngón xoay, hai ngón phóng và kéo</div>
              <canvas id="cvSim3d" width="760" height="480"></canvas>
              <div class="simbar">
                <button type="button" class="b2${simSection ? ' on' : ''}" id="simSection">Mặt cắt</button>
                <button type="button" class="b2" id="simCam">Đặt lại góc nhìn</button>
              </div>
            </div>
          </div>
          ${simDockHTML(true)}
        </div>
        ${colorPanelHTML()}
        <p class="small muted">3D ước lượng tiện, rãnh, cắt đứt, khoan/tiện trong, ren và dao động lực. Không thay chạy thử không phôi trên máy.</p>
        <div class="legend"><span class="lg h">Chạy nhanh</span><span class="lg p">Chạy dao</span><span class="lg f">Biên dạng tinh</span><span class="lg t">Chống tâm</span></div>
        <div id="simHits"></div>
        ${previewHTML()}
        </form>`;
    } else {
      body += `<p class="hint">PROGRAM CREATE: mã dưới đây là compile() của đúng danh sách nguyên công trong setup. Xuất .MIN sau khi mô phỏng; nếu chưa chạy hết, ứng dụng sẽ hỏi lại.</p>
        <div class="simgate danger slim"></div>
        <form id="igfForm" class="form" autocomplete="off">
        <p>Phôi Ø${esc(ig.od)} × ${esc(ig.ol)} ${esc(ig.material)} · ${P.ops.length} nguyên công.</p>
        <label class="fld"><span>Tên tệp .MIN</span><input id="fname" type="text" value="${esc(O.asc(P.settings.progName).replace(/[^A-Z0-9]/g, '') || 'PROG')}"></label>
        <div class="btns">
          <button type="button" class="b1" id="btnCopy">Sao chép</button>
          <button type="button" class="b1" id="igfDl">Tải .MIN</button>
          <button type="button" class="b2" id="btnShare">Chia sẻ</button>
        </div>
        <p id="codeStat" class="small muted"></p>
        <div id="codeWarn"></div>
        <pre id="code" class="code"></pre>
        </form>`;
    }
    root.innerHTML = body;
    R = O.compile(P);
    paintFlowChrome();
    paintHeader();
    if (igfStep === 1) renderSettings();
    if (igfStep === 3) drawIgf();
    if (igfStep === 4) renderOps();
    paintColorInputs();
    paintPathControls();
    if (igfStep === 5) {
      const d2 = $('#prevDock2d'); if (d2) d2.innerHTML = simDockHTML(false);
      const d3 = $('#prevDock3d'); if (d3) d3.innerHTML = simDockHTML(false);
      paintPathControls();
      applySimView();
      applyPrevView();
      renderPrevSel();
      enterSim(true);
    }
    if (igfStep === 6 && R) renderCode();
    else paintGate();
    const form = $('#igfForm');
    if (!form) return;
    form.onsubmit = ev => ev.preventDefault();
    const read = () => {
      form.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k;
        if (el.type === 'checkbox') ig()[k] = el.checked;
        else if (['material', 'blankShape', 'blankId', 'zeroRef', 'grip', 'dir'].includes(k)) ig()[k] = el.value;
        else if (['vr', 'fr', 'dx', 'lx', 'lz', 'vf', 'ff'].includes(k)) { ig().mat = Object.assign({}, O.matOf(ig()), ig().mat || {}); ig().mat[k] = el.value === '' ? '' : Number(el.value); }
        else ig()[k] = el.value === '' ? '' : Number(el.value);
      });
      if (igfStep === 3) form.querySelectorAll('.el').forEach(card => {
        const e = ig().elems[Number(card.dataset.i)]; if (!e) return;
        card.querySelectorAll('[data-k]').forEach(inp => { e[inp.dataset.k] = inp.value === '' ? '' : Number(inp.value); });
      });
    };
    form.oninput = form.onchange = ev => {
      const t = ev.target;
      if (t && t.id === 'fname') { t.dataset.touched = '1'; return; }
      if (t && t.id === 'prevSel') { selId = t.value || null; drawPreview(); return; }
      if (t && t.hasAttribute('data-simspd')) {
        sim.speed = Number(t.value) || 1;
        document.querySelectorAll('[data-simspdlab]').forEach(el => { el.textContent = sim.speed + '×'; });
        document.querySelectorAll('[data-simspd]').forEach(el => { if (el !== t) el.value = String(sim.speed); });
        return;
      }
      if (t && t.hasAttribute('data-simlw')) {
        const v = loadView();
        v.linePx = Number(t.value) || 1.25;
        saveView(v, t);
        if ($('#cvSim')) drawSim();
        return;
      }
      if (t && (t.dataset.c3 || t.hasAttribute('data-c3inv'))) return;
      if (t && t.dataset && t.dataset.k && igfStep === 3 && t.closest('.el')) {
        read(); save(); drawIgf(); return;
      }
      read();
      syncIgfToSettings();
      save();
      if (t && ['blankId', 'blankShape', 'grip', 'useCenter'].includes(t.dataset.k)) renderIgf();
      else if (igfStep === 3) drawIgf();
    };
  }
  const flowClick = e => {
    if (e.target.id === 'flowToSetup' || (e.target.closest && e.target.closest('#flowToSetup'))) { showView('v-setup'); return; }
    if (e.target.id === 'flowBack') { goStep(igfStep - 1); return; }
    if (e.target.id === 'flowNext') { goStep(igfStep + 1); return; }
    const st = e.target.closest && e.target.closest('#flowSteps [data-step]');
    if (st) { goStep(Number(st.dataset.step)); return; }
    const add = e.target.closest && e.target.closest('[data-addel]');
    if (add) { igf().elems = igf().elems || []; igf().elems.push({ t: add.dataset.addel }); save(); renderIgf(); return; }
    const del = e.target.closest && e.target.closest('[data-del]');
    if (del) { igf().elems.splice(Number(del.dataset.del), 1); save(); renderIgf(); return; }
    const opb = e.target.closest && e.target.closest('#igfOps button[data-a]');
    if (opb) { actOp(opb.dataset.a, opb.closest('li.op').dataset.id); return; }
    if (e.target.id === 'igfRedecide') {
      const d0 = O.decideProcesses(igf());
      if (!d0.ops.length) { alert('Chưa đủ biên dạng ở bước Biên dạng.'); return; }
      if (P.ops.length && !confirm('Ghi đè danh sách nguyên công bằng kết quả quyết định từ biên dạng?')) return;
      const d = applyIgf(); save(); renderIgf(); toast('Đã quyết định ' + d.ops.length + ' nguyên công'); return;
    }
    if (e.target.id === 'igfAdd') { $('#fab').hidden = false; $('#fab').click(); return; }
    if (e.target.id === 'sim2d' || e.target.id === 'sim3d' || e.target.id === 'simBoth') {
      simView = e.target.id === 'sim2d' ? '2d' : e.target.id === 'sim3d' ? '3d' : 'both';
      applySimView(); drawSim(); scheduleFitSim(); return;
    }
    if (e.target.id === 'simSection') { simSection = !simSection; applySimView(); drawSim(); return; }
    if (e.target.id === 'simCam') { if (window.OKU3D) window.OKU3D.resetCam(); return; }
    if (e.target.id === 'prev2d') { prevView = '2d'; applyPrevView(); drawPreview(); scheduleFitPrev(); return; }
    if (e.target.id === 'prev3d') { prevView = '3d'; applyPrevView(); drawPreview(); scheduleFitPrev(); return; }
    if (e.target.id === 'prevSection') { prevSection = !prevSection; applyPrevView(); drawPreview(); return; }
    if (e.target.id === 'prevCam') { if (window.OKU3D) window.OKU3D.resetCam(); return; }
    if (e.target.id === 'btnCopy') { doCopyCode(); return; }
    if (e.target.id === 'btnDl' || e.target.id === 'igfDl') { doDownloadCode(); return; }
    if (e.target.id === 'btnShare') { doShareCode(); return; }
  };

  function refresh() {
    R = O.compile(P); renderOps(); renderCode(); renderPrevSel();
    paintFlowChrome();
    paintHeader();
    if (simOn() && !sim.play) drawPreview();
    if (igfStep === 5 && flowOn() && !sim.play && $('#cvSim')) {
      const prevMi = sim.mi;
      PATH = O.buildToolpath(P);
      if (prevMi > PATH.moves.length) sim.mi = PATH.moves.length;
      renderSimChrome(); drawSim();
    }
  }
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showView(b.dataset.v));
  $('#warnHide').onclick = () => { const w = $('#warnTop'); w.classList.toggle('col'); $('#warnHide').textContent = w.classList.contains('col') ? '▾' : '▴'; };
  $('#setupNew').onclick = () => askName('Tạo setup mới', 'Sản phẩm mới', 'Tạo', nm => {
    const prog = O.asc(nm).replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'NEW';
    beginSetup(nm, {
      settings: Object.assign({}, O.DEFAULT_SETTINGS, { progName: prog, comment: nm }),
      ops: [],
      igf: Object.assign({}, O.DEFAULT_IGF, { elems: [] })
    }, 1);
    toast('Đã tạo ' + nm);
  });
  $('#setupTest1').onclick = () => startTest1();
  $('#setupSample').onclick = () => {
    const proj = O.sampleProject();
    beginSetup(proj.settings.comment || 'Ví dụ mẫu', proj, 1);
    toast('Đã tạo ví dụ mẫu');
  };
  $('#setupExportAll').onclick = () => exportAll();
  $('#setupImport').onchange = e => {
    const fl = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!fl) return;
    fl.text().then(t => {
      const n = importPayload(JSON.parse(t));
      renderSetups();
      toast('Đã nhập ' + n + ' setup');
    }).catch(er => alert('Lỗi: ' + er.message));
  };
  $('#setupList').addEventListener('click', e => {
    const li = e.target.closest && e.target.closest('[data-sid]');
    if (!li) return;
    const id = li.dataset.sid;
    const btn = e.target.closest && e.target.closest('[data-sa]');
    if (!btn) { openSetup(id); return; }
    const a = btn.dataset.sa;
    if (a === 'open') openSetup(id);
    else if (a === 'copy') copySetup(id);
    else if (a === 'rename') renameSetup(id);
    else if (a === 'del') deleteSetup(id);
    else if (a === 'exp') exportOne(id);
  });
  const flow = $('#v-flow'); if (flow) flow.addEventListener('click', flowClick);
  function net() { const s = $('#netState'); s.textContent = navigator.onLine ? '● Online' : '● Offline'; s.style.background = navigator.onLine ? '#ffffff22' : '#e8750a'; }
  addEventListener('online', net); addEventListener('offline', net); net();
  renderHelp(); refresh(); renderSetups(); paintHeader();
  if (window.OKU3D) { window.OKU3D.setAppearance(loadView()); window.OKU3D.setPathStyle(loadView()); }
  document.addEventListener('input', e => {
    const t = e.target;
    if (!t || !t.dataset) return;
    if (t.hasAttribute('data-simspd')) {
      sim.speed = Number(t.value) || 1;
      document.querySelectorAll('[data-simspdlab]').forEach(el => { el.textContent = sim.speed + '×'; });
      document.querySelectorAll('[data-simspd]').forEach(el => { if (el !== t) el.value = String(sim.speed); });
      return;
    }
    if (t.hasAttribute('data-simlw')) {
      const v = loadView();
      v.linePx = Number(t.value) || 1.25;
      saveView(v, t);
      if ($('#cvSim')) drawSim();
      return;
    }
    if (t.dataset.c3) {
      const v = loadView();
      v[t.dataset.c3] = t.value;
      v.preset = '';
      saveView(v, t);
    } else if (t.hasAttribute('data-c3inv')) {
      const v = loadView();
      v.invert = !!t.checked;
      saveView(v, t);
    }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-c3preset]');
    if (b) {
      if (b.dataset.c3preset === 'reset') { saveView(Object.assign({}, VIEW_DEFAULT)); return; }
      const p = VIEW_PRESETS[b.dataset.c3preset];
      if (!p) return;
      saveView(Object.assign({}, loadView(), p, { preset: b.dataset.c3preset }));
      return;
    }
    const simBtn = e.target.closest && e.target.closest('[data-sim]');
    if (!simBtn) return;
    const act = simBtn.dataset.sim;
    if (!PATH) PATH = O.buildToolpath(P);
    if (act !== 'path') simDriven = true;
    if (act === 'play') {
      if (!PATH || !PATH.moves.length) { toast('Không có đường dao'); return; }
      if (sim.mi >= PATH.moves.length) { sim.mi = 0; sim.u = 0; }
      sim.play = true; sim.last = 0; if (sim.raf) cancelAnimationFrame(sim.raf); sim.raf = requestAnimationFrame(frame); return;
    }
    if (act === 'pause') { stopSim(); drawSim(); return; }
    if (act === 'step') {
      stopSim(); if (!PATH || !PATH.moves.length) return;
      if (sim.mi >= PATH.moves.length) { sim.mi = 0; sim.u = 0; }
      else { sim.mi++; sim.u = 0; if (sim.mi >= PATH.moves.length) { simDoneSig = projectSig(); paintGate(); toast('Đã mô phỏng xong — có thể xuất mã'); } }
      drawSim(); return;
    }
    if (act === 'reset') { stopSim(); sim.mi = 0; sim.u = 0; drawSim(); return; }
    if (act === 'path') {
      const v = loadView();
      v.showPath = v.showPath === false;
      saveView(v);
      if ($('#cvSim')) drawSim();
    }
  });
  addEventListener('resize', () => { if (simOn()) scheduleFitSim(); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { });
  (function bootHash() {
    const h = location.hash || '';
    if (h === '#help') { showView('v-help'); return; }
    if (!h || h === '#setup') return;
    let step = { '#set': 1, '#prev': 5, '#code': 6 }[h] || 0;
    const m = h.match(/^#(?:igf|flow)([1-6])?/);
    if (m) {
      if (/^#igf/.test(h) && m[1]) step = [0, 2, 3, 4, 5, 6][Number(m[1])] || 1;
      else step = m[1] ? Number(m[1]) : (igfStep || 1);
    }
    if (!activeSetup() || !step) return;
    igfStep = step;
    showView('v-flow');
  })();
  window.__okuOpenForm = i => openForm(P.ops[i]); window.__okuFab = () => $('#fab').click();
})();
