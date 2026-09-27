/* Okuma LB3000EX II / OSP-P300L — bộ sinh chương trình NC (không backend)
 * Cú pháp đối chiếu: OSP-P500 PROGRAMMING MANUAL LE33-021-R2 (Oct 2023),
 * Advanced One-Touch IGF-L (LE32-238-R1, LE32-239-R1), sách tiện 2005, tờ ví dụ dao động lực.
 * IGF và tab nguyên công dùng chung project.ops và hàm compile().
 * PHẢI chạy thử (dry run) / mô phỏng trên máy trước khi cắt thật. */
(function (root) {
  'use strict';
  const pad2 = n => String(Math.max(0, Math.min(99, Math.round(Number(n) || 0)))).padStart(2, '0');
  function f(n) {
    let v = Math.round(Number(n) * 1000) / 1000;
    if (!isFinite(v)) v = 0;
    if (Object.is(v, -0)) v = 0;
    return String(v);
  }
  function asc(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[()]/g, ' ').replace(/[^\x20-\x7E]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  }
  const cm = s => '(' + asc(s) + ')';
  const num = (v, d) => (v === '' || v == null || isNaN(Number(v))) ? d : Number(v);
  const deg = r => r * 180 / Math.PI;
  const normA = a => { a = a % 360; if (a < 0) a += 360; return Math.round(a * 1000) / 1000; };

  function parseList(t) {
    return String(t || '').split(/[;,\s]+/).map(s => s.trim()).filter(s => s !== '').map(Number).filter(v => isFinite(v));
  }
  function parsePts(t) { // "x,y; x,y"
    return String(t || '').split(/[;\n]+/).map(s => s.trim()).filter(Boolean).map(s => {
      const p = s.split(/[,\s]+/).map(Number); return { x: p[0], y: p[1] };
    }).filter(p => isFinite(p.x) && isFinite(p.y));
  }

  // ---------------- Thiết lập mặc định ----------------
  const DEFAULT_SETTINGS = {
    progName: 'LB3000A', comment: 'CHI TIET MAU', stockD: 60, stockL: 120, material: 'S45C',
    g50: 2500, machMax: 4500, liveMax: 6000, homeX: 300, homeZ: 300,
    dollar: true, endCode: 'M02', x138: 'radius', liveDir: 'M13', cDir: 'M15',
    tail: 'quill', tailSet: '', tailDia: 20, autoRetract: true, tailBarrier: false, coolant: true,
    jawLen: 20, jawOd: 90
  };

  // ---------------- Định nghĩa nguyên công (form) ----------------
  const T = (label, def) => ({ k: 'tool', t: 'int', label: label || 'Số dao (T, 1–12)', def: def || 1, min: 1, max: 12 });
  const OPS = {
    facing: { name: 'Khỏa mặt', icon: '⎸', group: 'Tiện', fields: [
      T(), { k: 'vc', t: 'num', label: 'Vận tốc cắt Vc (G96, m/ph)', def: 180 },
      { k: 'feed', t: 'num', label: 'Bước tiến thô F (mm/vòng)', def: 0.2 },
      { k: 'zStock', t: 'num', label: 'Lượng dư mặt đầu (mm, phôi ở Z+)', def: 1.5 },
      { k: 'doc', t: 'num', label: 'Chiều sâu mỗi lát (mm)', def: 1 },
      { k: 'finish', t: 'num', label: 'Lượng dư tinh (0 = không tinh)', def: 0.2 },
      { k: 'ffeed', t: 'num', label: 'Bước tiến tinh (mm/vòng)', def: 0.1 },
      { k: 'xStart', t: 'num', label: 'X bắt đầu (trống = Ø phôi + 4)', def: '' },
      { k: 'xEnd', t: 'num', label: 'X kết thúc (âm để qua tâm)', def: -1.6 },
      { k: 'dir', t: 'sel', label: 'Chiều quay trục chính', def: 'M03', opts: [['M03', 'M03 (thuận)'], ['M04', 'M04 (nghịch)']] }] },
    od: { name: 'Tiện ngoài (LAP)', icon: '◧', group: 'Tiện', fields: [
      T('Dao thô (T)', 1), { k: 'ftool', t: 'int', label: 'Dao tinh (T, trùng dao thô = cùng dao)', def: 2, min: 1, max: 12 },
      { k: 'mode', t: 'sel', label: 'Kiểu cắt thô', def: 'G85', opts: [['G85', 'G85 – tiện thô dọc (phôi thanh)'], ['G86', 'G86 – tiện chép hình (phôi đúc/rèn)'], ['none', 'Không thô – chỉ tinh G87']] },
      { k: 'vc', t: 'num', label: 'Vc thô (m/ph)', def: 200 }, { k: 'vcf', t: 'num', label: 'Vc tinh (m/ph)', def: 250 },
      { k: 'D', t: 'num', label: 'D – chiều sâu cắt thô (theo ĐƯỜNG KÍNH, mm)', def: 4 },
      { k: 'F', t: 'num', label: 'F – bước tiến thô (mm/vòng)', def: 0.25 },
      { k: 'U', t: 'num', label: 'U – dư tinh X (theo đường kính)', def: 0.4 },
      { k: 'W', t: 'num', label: 'W – dư tinh Z', def: 0.1 },
      { k: 'ff', t: 'num', label: 'Bước tiến tinh trong biên dạng (mm/vòng)', def: 0.1 },
      { k: 'comp', t: 'chk', label: 'Bù bán kính mũi dao G42/G40 trong biên dạng', def: true },
      { k: 'startZ', t: 'num', label: 'Z điểm bắt đầu chu trình', def: 2 },
      { k: 'startX', t: 'num', label: 'X điểm bắt đầu (trống = Ø phôi + 2)', def: '' },
      { k: 'useTail', t: 'chk', label: 'Gia công có chống tâm (tự tiến M56 nếu chưa)', def: false },
      { k: 'pts', t: 'pts', label: 'Biên dạng tinh (X đường kính, Z) – từ mặt đầu về phía mâm cặp', def: [
        { x: 36, z: 0, t: 'L', r: '' }, { x: 40, z: -2, t: 'L', r: '' }, { x: 40, z: -24, t: 'L', r: '' },
        { x: 48, z: -24, t: 'L', r: '' }, { x: 50, z: -25, t: 'L', r: '' }, { x: 50, z: -50, t: 'L', r: '' },
        { x: 56, z: -53, t: 'CW', r: 3 }, { x: 56, z: -75, t: 'L', r: '' }] }] },
    id: { name: 'Tiện trong (LAP)', icon: '◨', group: 'Tiện', fields: [
      T('Dao thô (T)', 7), { k: 'ftool', t: 'int', label: 'Dao tinh (T)', def: 7, min: 1, max: 12 },
      { k: 'mode', t: 'sel', label: 'Kiểu cắt thô', def: 'G85', opts: [['G85', 'G85 – tiện thô dọc'], ['G86', 'G86 – chép hình'], ['none', 'Không thô – chỉ tinh G87']] },
      { k: 'bore', t: 'num', label: 'Ø lỗ có sẵn / lỗ khoan (mm)', def: 12 },
      { k: 'vc', t: 'num', label: 'Vc thô (m/ph)', def: 150 }, { k: 'vcf', t: 'num', label: 'Vc tinh (m/ph)', def: 180 },
      { k: 'D', t: 'num', label: 'D – chiều sâu cắt thô (theo ĐƯỜNG KÍNH)', def: 2 },
      { k: 'F', t: 'num', label: 'F – bước tiến thô (mm/vòng)', def: 0.15 },
      { k: 'U', t: 'num', label: 'U – dư tinh X (đường kính)', def: 0.3 },
      { k: 'W', t: 'num', label: 'W – dư tinh Z', def: 0.05 },
      { k: 'ff', t: 'num', label: 'Bước tiến tinh (mm/vòng)', def: 0.08 },
      { k: 'comp', t: 'chk', label: 'Bù bán kính mũi dao G41/G40', def: true },
      { k: 'startZ', t: 'num', label: 'Z điểm bắt đầu', def: 2 },
      { k: 'startX', t: 'num', label: 'X điểm bắt đầu (trống = Ø lỗ − 1)', def: '' },
      { k: 'pts', t: 'pts', label: 'Biên dạng tinh lỗ (X đường kính, Z)', def: [
        { x: 18, z: 0, t: 'L', r: '' }, { x: 16, z: -1, t: 'L', r: '' }, { x: 16, z: -15, t: 'L', r: '' }] }] },
    thread: { name: 'Tiện ren (G71)', icon: '≋', group: 'Tiện', fields: [
      T('Số dao (T)', 4), { k: 'side', t: 'sel', label: 'Loại ren', def: 'OD', opts: [['OD', 'Ren ngoài'], ['ID', 'Ren trong']] },
      { k: 'dia', t: 'num', label: 'Đường kính danh nghĩa (mm)', def: 40 },
      { k: 'P', t: 'num', label: 'Bước ren / bước xoắn F (mm)', def: 1.5 },
      { k: 'zs', t: 'num', label: 'Z bắt đầu (≥ 3×bước)', def: 5 },
      { k: 'ze', t: 'num', label: 'Z kết thúc ren', def: -21 },
      { k: 'rpm', t: 'num', label: 'Tốc độ G97 (vòng/ph)', def: 800 },
      { k: 'H', t: 'num', label: 'H – chiều cao ren theo Ø (trống = tự tính)', def: '' },
      { k: 'D1', t: 'num', label: 'D – chiều sâu lát đầu (theo Ø)', def: 0.35 },
      { k: 'U', t: 'num', label: 'U – dư lát tinh (theo Ø)', def: 0.05 },
      { k: 'B', t: 'num', label: 'B – góc ăn dao (60 = hướng kính 1 phía)', def: 60 },
      { k: 'mm', t: 'sel', label: 'Kiểu ăn dao', def: 'M32', opts: [['M32', 'M32 – một sườn'], ['M33', 'M33 – zíc zắc'], ['M34', 'M34 – một sườn (ngược)']] },
      { k: 'pat', t: 'sel', label: 'Mẫu chia lát', def: 'M73', opts: [['M73', 'M73 – mẫu 1'], ['M74', 'M74 – mẫu 2'], ['M75', 'M75 – mẫu 3']] },
      { k: 'chamf', t: 'chk', label: 'Vát cuối ren M23 (tắt = M22)', def: false },
      { k: 'Q', t: 'int', label: 'Số đầu mối ren (1 = ren đơn)', def: 1, min: 1, max: 9 },
      { k: 'useTail', t: 'chk', label: 'Gia công có chống tâm', def: false }] },
    groove: { name: 'Cắt rãnh', icon: '⊔', group: 'Tiện', fields: [
      T('Số dao (T)', 3), { k: 'gt', t: 'sel', label: 'Loại rãnh', def: 'od', opts: [['od', 'Rãnh ngoài (hướng kính)'], ['face', 'Rãnh mặt đầu (dọc trục)']] },
      { k: 'cyc', t: 'sel', label: 'Cách lập trình', def: 'g01', opts: [['g01', 'G01 từng nhát (tường minh)'], ['cyc', 'Chu trình G73 (ngoài) / G74 (mặt)']] },
      { k: 'd1', t: 'num', label: 'Rãnh ngoài: Ø đỉnh | Rãnh mặt: Ø ngoài', def: 40 },
      { k: 'd2', t: 'num', label: 'Rãnh ngoài: Ø đáy | Rãnh mặt: Ø trong', def: 37 },
      { k: 'zr', t: 'num', label: 'Rãnh ngoài: Z cạnh phải | Rãnh mặt: Z mặt', def: -20 },
      { k: 'w', t: 'num', label: 'Rãnh ngoài: bề rộng | Rãnh mặt: chiều sâu', def: 4 },
      { k: 'tw', t: 'num', label: 'Bề rộng dao (mm)', def: 3 },
      { k: 'ref', t: 'sel', label: 'Điểm chuẩn dao', def: 'L', opts: [['L', 'Cạnh trái (phía mâm) / cạnh ngoài'], ['R', 'Cạnh phải / cạnh trong']] },
      { k: 'vc', t: 'num', label: 'Vc (m/ph)', def: 100 },
      { k: 'feed', t: 'num', label: 'Bước tiến (mm/vòng)', def: 0.06 },
      { k: 'peck', t: 'num', label: 'D — G73 theo ĐƯỜNG KÍNH (LE33-021 P-197, hình D/2); G74 theo Z (P-200). 0 = không mổ', def: 1 },
      { k: 'dwell', t: 'num', label: 'Dừng ở đáy E (0 = không)', def: 0 },
      { k: 'useTail', t: 'chk', label: 'Gia công có chống tâm', def: false }] },
    cutoff: { name: 'Cắt đứt', icon: '✂', group: 'Tiện', fields: [
      T('Số dao (T)', 12), { k: 'z', t: 'num', label: 'Z vị trí cắt (theo điểm chuẩn dao)', def: -83 },
      { k: 'dia', t: 'num', label: 'Ø tại chỗ cắt (trống = Ø phôi)', def: '' },
      { k: 'xEnd', t: 'num', label: 'X kết thúc (−1 = qua tâm; ống: Ø trong − 1)', def: -1 },
      { k: 'vc', t: 'num', label: 'Vc (m/ph)', def: 90 },
      { k: 'maxS', t: 'num', label: 'Giới hạn G50 khi cắt đứt (vòng/ph)', def: 1800 },
      { k: 'feed', t: 'num', label: 'Bước tiến (mm/vòng)', def: 0.06 },
      { k: 'xSlow', t: 'num', label: 'Giảm tốc tiến từ X =', def: 8 },
      { k: 'fSlow', t: 'num', label: 'Bước tiến gần tâm', def: 0.03 },
      { k: 'catcher', t: 'txt', label: 'Mã M máng hứng phôi (nếu có, VD: tùy máy)', def: '' }] },
    drill: { name: 'Khoan tâm / khoan lỗ tâm (dao tĩnh)', icon: '⇣', group: 'Khoan', fields: [
      T('Số dao (T)', 5), { k: 'isCenter', t: 'chk', label: 'Là mũi khoan tâm (để chống tâm)', def: true },
      { k: 'dia', t: 'num', label: 'Ø mũi khoan (mm) – để hiển thị', def: 5 },
      { k: 'zs', t: 'num', label: 'Z tiếp cận', def: 3 },
      { k: 'zb', t: 'num', label: 'Z đáy lỗ (âm)', def: -6 },
      { k: 'rpm', t: 'num', label: 'Tốc độ G97 (vòng/ph)', def: 1200 },
      { k: 'feed', t: 'num', label: 'Bước tiến (mm/vòng)', def: 0.08 },
      { k: 'peck', t: 'num', label: 'Khoan mổ G74: chiều sâu mỗi nhát (0 = G01 một lần)', def: 0 }] },
    lface: { name: 'Khoan mặt đầu (dao động lực, trục C/Y)', icon: '◎', group: 'Dao động lực', fields: [
      T('Số dao (T)', 8), { k: 'cyc', t: 'sel', label: 'Chu trình', def: 'G181', opts: [['G181', 'G181 – khoan'], ['G183', 'G183 – khoan sâu (mổ)'], ['G182', 'G182 – doa/bore'], ['G184', 'G184 – taro (đầu taro bù)'], ['G178', 'G178 – taro cứng đồng bộ']] },
      { k: 'pos', t: 'sel', label: 'Cách định vị lỗ', def: 'pcd', opts: [['pcd', 'Vòng chia PCD + chia đều (X, C)'], ['ang', 'PCD + danh sách góc C'], ['xyc', 'Tọa độ X,Y → đổi sang X,C (không cần trục Y)'], ['xyy', 'Tọa độ X,Y dùng trục Y (G138 G17)']] },
      { k: 'pcd', t: 'num', label: 'Ø vòng chia PCD (0 = tâm)', def: 28 },
      { k: 'n', t: 'int', label: 'Số lỗ chia đều', def: 4, min: 1, max: 72 },
      { k: 'c0', t: 'num', label: 'Góc C lỗ đầu (độ)', def: 45 },
      { k: 'angs', t: 'txt', label: 'Danh sách góc C (VD: 0,90,180)', def: '' },
      { k: 'xy', t: 'txt', label: 'Danh sách X,Y (bán kính, VD: 10,0; -10,5)', def: '' },
      { k: 'zTop', t: 'num', label: 'Z mặt lỗ', def: 0 },
      { k: 'depth', t: 'num', label: 'Chiều sâu lỗ (dương)', def: 12 },
      { k: 'clr', t: 'num', label: 'Khoảng hở bắt đầu cắt (mm)', def: 2 },
      { k: 'peck', t: 'num', label: 'G183: chiều sâu mỗi nhát D', def: 3 },
      { k: 'dwell', t: 'num', label: 'Dừng đáy E (giây, 0 = không)', def: 0 },
      { k: 'sb', t: 'num', label: 'Tốc độ dao SB= (vòng/ph)', def: 1800 },
      { k: 'fr', t: 'num', label: 'Bước tiến (mm/vòng) → F mm/ph = SB×f', def: 0.08 },
      { k: 'pitch', t: 'num', label: 'Taro: bước ren (mm)', def: 1 }] },
    lside: { name: 'Khoan mặt bên / hướng kính (dao động lực)', icon: '⊕', group: 'Dao động lực', fields: [
      T('Số dao (T)', 9), { k: 'cyc', t: 'sel', label: 'Chu trình', def: 'G181', opts: [['G181', 'G181 – khoan'], ['G183', 'G183 – khoan sâu'], ['G182', 'G182 – doa/bore'], ['G184', 'G184 – taro (đầu bù)'], ['G178', 'G178 – taro cứng']] },
      { k: 'dia', t: 'num', label: 'Ø phôi tại lỗ (trống = Ø phôi)', def: 50 },
      { k: 'zs', t: 'txt', label: 'Các vị trí Z (VD: -40 hoặc -30,-45)', def: '-40' },
      { k: 'n', t: 'int', label: 'Số lỗ chia đều quanh chu vi', def: 2, min: 1, max: 72 },
      { k: 'c0', t: 'num', label: 'Góc C lỗ đầu (độ)', def: 0 },
      { k: 'angs', t: 'txt', label: 'Hoặc danh sách góc C (ưu tiên nếu nhập)', def: '' },
      { k: 'y', t: 'num', label: 'Lệch tâm Y (0 = qua tâm; ≠0 dùng G138 G19)', def: 0 },
      { k: 'depth', t: 'num', label: 'Chiều sâu lỗ hướng kính (mm)', def: 8 },
      { k: 'clr', t: 'num', label: 'Khoảng hở bắt đầu cắt (bán kính, mm)', def: 2 },
      { k: 'peck', t: 'num', label: 'G183: chiều sâu mỗi nhát D', def: 3 },
      { k: 'dwell', t: 'num', label: 'Dừng đáy E (giây)', def: 0 },
      { k: 'sb', t: 'num', label: 'Tốc độ dao SB=', def: 1500 },
      { k: 'fr', t: 'num', label: 'Bước tiến (mm/vòng)', def: 0.08 },
      { k: 'pitch', t: 'num', label: 'Taro: bước ren (mm)', def: 1 },
      { k: 'useTail', t: 'chk', label: 'Gia công có chống tâm', def: false }] },
    mslot: { name: 'Phay rãnh mặt đầu (trục Y, G17)', icon: '▭', group: 'Dao động lực', fields: [
      T('Số dao (T)', 11), { k: 'td', t: 'num', label: 'Ø dao phay (mm)', def: 4 },
      { k: 'c', t: 'num', label: 'Góc C khóa khi phay (độ)', def: 0 },
      { k: 'x1', t: 'num', label: 'X1 (bán kính, mm)', def: 12 }, { k: 'y1', t: 'num', label: 'Y1', def: -4 },
      { k: 'x2', t: 'num', label: 'X2 (bán kính)', def: 12 }, { k: 'y2', t: 'num', label: 'Y2', def: 4 },
      { k: 'zTop', t: 'num', label: 'Z mặt', def: 0 }, { k: 'depth', t: 'num', label: 'Chiều sâu rãnh', def: 2 },
      { k: 'step', t: 'num', label: 'Chiều sâu mỗi lớp', def: 0.5 },
      { k: 'sb', t: 'num', label: 'SB= (vòng/ph)', def: 3000 },
      { k: 'feed', t: 'num', label: 'Bước tiến phay (mm/ph)', def: 120 },
      { k: 'pf', t: 'num', label: 'Bước tiến xuống dao (mm/ph)', def: 40 }] },
    mpocket: { name: 'Phay hốc chữ nhật mặt đầu (trục Y)', icon: '▣', group: 'Dao động lực', fields: [
      T('Số dao (T)', 11), { k: 'td', t: 'num', label: 'Ø dao phay (cắt tâm được)', def: 4 },
      { k: 'c', t: 'num', label: 'Góc C khóa (độ)', def: 0 },
      { k: 'cx', t: 'num', label: 'Tâm hốc X (bán kính)', def: -12 }, { k: 'cy', t: 'num', label: 'Tâm hốc Y', def: 0 },
      { k: 'lx', t: 'num', label: 'Kích thước theo X', def: 6 }, { k: 'ly', t: 'num', label: 'Kích thước theo Y', def: 8 },
      { k: 'zTop', t: 'num', label: 'Z mặt', def: 0 }, { k: 'depth', t: 'num', label: 'Chiều sâu hốc', def: 2 },
      { k: 'step', t: 'num', label: 'Chiều sâu mỗi lớp', def: 0.5 },
      { k: 'so', t: 'num', label: 'Bước ngang (% Ø dao)', def: 50 },
      { k: 'sb', t: 'num', label: 'SB=', def: 3000 }, { k: 'feed', t: 'num', label: 'Bước tiến (mm/ph)', def: 120 },
      { k: 'pf', t: 'num', label: 'Bước tiến xuống dao (mm/ph)', def: 30 }] },
    mflat: { name: 'Phay mặt phẳng cạnh (trục Y, G19)', icon: '▯', group: 'Dao động lực', fields: [
      T('Số dao (T)', 10), { k: 'td', t: 'num', label: 'Ø dao phay (dao hướng kính)', def: 10 },
      { k: 'c', t: 'num', label: 'Góc C của mặt phẳng (độ)', def: 90 },
      { k: 'dia', t: 'num', label: 'Ø phôi tại đoạn phay', def: 56 },
      { k: 'depth', t: 'num', label: 'Chiều sâu mặt phẳng (tính từ Ø ngoài, bán kính)', def: 3 },
      { k: 'z1', t: 'num', label: 'Z đầu phải của mặt phẳng', def: -56 },
      { k: 'z2', t: 'num', label: 'Z đầu trái của mặt phẳng', def: -70 },
      { k: 'step', t: 'num', label: 'Chiều sâu mỗi lớp', def: 1 },
      { k: 'so', t: 'num', label: 'Bước ngang theo Z (% Ø dao)', def: 60 },
      { k: 'sb', t: 'num', label: 'SB=', def: 2500 }, { k: 'feed', t: 'num', label: 'Bước tiến (mm/ph)', def: 200 },
      { k: 'pf', t: 'num', label: 'Bước tiến xuống dao (mm/ph)', def: 60 },
      { k: 'useTail', t: 'chk', label: 'Gia công có chống tâm', def: false }] },
    tailOn: { name: 'Chống tâm: TIẾN (M56)', icon: '▶', group: 'Ụ động', fields: [
      { k: 'note', t: 'txt', label: 'Ghi chú', def: '' }] },
    tailOff: { name: 'Chống tâm: LÙI (M55)', icon: '◀', group: 'Ụ động', fields: [
      { k: 'note', t: 'txt', label: 'Ghi chú', def: '' }] },
    stop: { name: 'Dừng chương trình (M00/M01)', icon: '⏸', group: 'Khác', fields: [
      { k: 'm', t: 'sel', label: 'Loại dừng', def: 'M01', opts: [['M00', 'M00 – dừng bắt buộc'], ['M01', 'M01 – dừng tùy chọn']] },
      { k: 'note', t: 'txt', label: 'Thông báo (ghi chú)', def: 'KIEM TRA KICH THUOC' }] },
    raw: { name: 'Mã tự nhập', icon: '✎', group: 'Khác', fields: [
      { k: 'code', t: 'area', label: 'Các dòng NC (mỗi dòng một block)', def: '' }] }
  };

  function newOp(type) {
    const o = { type, id: Math.random().toString(36).slice(2, 9), on: true };
    OPS[type].fields.forEach(fd => { o[fd.k] = JSON.parse(JSON.stringify(fd.def)); });
    return o;
  }

  // ---------------- Biên dạng (dùng chung cho xem trước) ----------------
  function arcCenter(p0, p1, r, cw) { // hệ tọa độ (z ngang, rad = x/2 dọc), cw theo nhìn +X lên, +Z sang phải
    const x0 = p0.z, y0 = p0.x / 2, x1 = p1.z, y1 = p1.x / 2;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, q = Math.hypot(dx, dy);
    if (q === 0 || Math.abs(r) < q / 2) return null;
    const h = Math.sqrt(r * r - (q / 2) * (q / 2));
    const s = cw ? -1 : 1;  // cw: tâm bên phải hướng chuyển động
    return { cx: mx - s * h * dy / q, cy: my + s * h * dx / q };
  }
  function profilePoly(pts) { // trả về các điểm (z, r) có nội suy cung
    const out = [];
    pts.forEach((p, i) => {
      if (i === 0 || p.t === 'L' || !p.r) { out.push({ z: p.z, r: p.x / 2 }); return; }
      const p0 = pts[i - 1], c = arcCenter(p0, p, Math.abs(Number(p.r)), p.t === 'CW');
      if (!c) { out.push({ z: p.z, r: p.x / 2 }); return; }
      let a0 = Math.atan2(p0.x / 2 - c.cy, p0.z - c.cx), a1 = Math.atan2(p.x / 2 - c.cy, p.z - c.cx);
      if (p.t === 'CW') { while (a1 > a0) a1 -= 2 * Math.PI; } else { while (a1 < a0) a1 += 2 * Math.PI; }
      for (let k = 1; k <= 16; k++) { const a = a0 + (a1 - a0) * k / 16; out.push({ z: c.cx + Math.abs(p.r) * Math.cos(a), r: c.cy + Math.abs(p.r) * Math.sin(a) }); }
    });
    return out;
  }

  // ---------------- Biên dịch ----------------
  function compile(project) {
    const S = Object.assign({}, DEFAULT_SETTINGS, project.settings || {});
    const ops = (project.ops || []).filter(o => o.on !== false);
    const L = []; const W = []; const map = [];
    const ctx = { tail: false, centerDrilled: false, nat: 0, seq: 0, curOp: null, g95: true };
    const hx = f(S.homeX), hz = f(S.homeZ);
    const stockD = num(S.stockD, 60);
    const push = (...a) => a.forEach(s => L.push(s));
    const warn = (lvl, msg) => W.push({ lvl, msg, op: ctx.curOp ? ctx.curOp.id : null, idx: ctx.idx });
    const cool = s => S.coolant ? s : null;
    const xv = r => S.x138 === 'radius' ? r : 2 * r;   // X trong G138: bán kính (LE33-021 P-265 mục 4; IGF LE32-238 tr.353)
    function note138() {
      if (S.x138 !== 'radius') warn('warn', 'G138: sách IGF LE32-238 tr.353 yêu cầu X theo BÁN KÍNH đến khi G136. Thiết lập đang xuất theo ĐƯỜNG KÍNH.');
    }
    const tcode = t => 'T' + pad2(t) + pad2(t) + pad2(t);

    function toolStart(t, title) {
      t = Math.round(num(t, 1));
      if (t < 1 || t > 12) warn('err', `Số dao T${t} ngoài 1–12 (ổ dao 12 vị trí).`);
      ctx.seq++;
      push('', `N${ctx.seq} ${cm(title + ' - T' + pad2(t))}`, `G00 X${hx} Z${hz}`, tcode(t));
    }
    function toolEnd() { push(`G00 X${hx} Z${hz}` + (S.coolant ? ' M09' : ''), 'M01'); }
    function spindleG96(vc, dir) {
      vc = num(vc, 0); if (vc <= 0) warn('err', 'Vận tốc cắt phải > 0.');
      push(`G96 S${f(vc)} ${dir || 'M03'}`); if (S.coolant) push('M08');
    }
    function tailAdvance(reason) {
      if (S.tail === 'none') { warn('err', 'Thiết lập máy: "Không dùng chống tâm" nhưng chương trình yêu cầu chống tâm.'); return; }
      if (!ctx.centerDrilled) warn('warn', 'Tiến chống tâm nhưng chưa thấy nguyên công khoan tâm trước đó – kiểm tra lỗ tâm.');
      push('', cm('CHONG TAM TIEN' + (reason ? ' - ' + reason : '')), `G00 X${hx} Z${hz}` + (S.coolant ? ' M09' : ''), 'M05');
      // LE33-021 P-673 chỉ đặt tên G195 “NC tailstock multi sizing position”. Địa chỉ SP= không có trong sách.
      if (S.tail === 'nc' && String(S.tailSet).trim() !== '') {
        push(`G195 SP=${Math.round(num(S.tailSet, 1))}`);
        warn('warn', 'G195 (LE33-021 P-673) không mô tả địa chỉ SP=. IGF LE32-238 cũng không in mã này. Kiểm tra trên OSP-P300L.');
      }
      push('M56');
      if (S.tailBarrier) push('M21');
      ctx.tail = true; ctx.tailWarned = false;
    }
    function tailRetract(reason) {
      push('', cm('CHONG TAM LUI' + (reason ? ' - ' + reason : '')), `G00 X${hx} Z${hz}` + (S.coolant ? ' M09' : ''), 'M05');
      if (S.tailBarrier) push('M20');
      push('M55');
      ctx.tail = false;
    }
    function needFree(what) {
      if (!ctx.tail) return;
      if (S.autoRetract) { warn('warn', `Chống tâm đang tiến → tự động LÙI (M55) trước khi ${what}.`); tailRetract('TRUOC ' + what); }
      else warn('err', `VA CHẠM: chống tâm đang tiến – không được ${what}. Thêm "Chống tâm: LÙI" trước nguyên công này.`);
    }
    function wantTail(op) {
      if (op.useTail && !ctx.tail) tailAdvance('THEO YEU CAU NGUYEN CONG');
      if (ctx.tail && !ctx.tailWarned) { ctx.tailWarned = true; warn('warn', 'Đang có chống tâm: kiểm tra khoảng hở giữa dao/đài dao và nòng ụ động khi tiếp cận gần mặt đầu (Z+) – áp dụng cho mọi nguyên công đến khi lùi chống tâm.'); }
    }
    function liveStart(sb, fz) {
      sb = num(sb, 0);
      if (sb <= 0) warn('err', 'Tốc độ dao động lực SB phải > 0.');
      if (sb > num(S.liveMax, 6000)) warn('warn', `SB=${sb} vượt tốc độ tối đa dao động lực đã khai (${S.liveMax}).`);
      push('M05', 'M110', S.cDir || 'M15', 'G94', `SB=${f(sb)} ${S.liveDir || 'M13'}`);
      if (S.coolant) push('M08');
    }
    function liveEnd() { push('M12', 'M146', 'M109', 'G95'); }

    // ---- header
    // LE33-021 P-510: tệp chính là "$" + tên + ".MIN%". P-1/P-3: khối O + tên, tối đa 8 ký tự, đứng riêng.
    const pname = (asc(S.progName).replace(/[^A-Z0-9]/g, '') || 'PROG').slice(0, 8);
    if ((asc(S.progName).replace(/[^A-Z0-9]/g, '') || 'PROG').length > 8) warn('warn', 'Tên chương trình (PROGRAM NAME) dài hơn 8 ký tự — IGF LE32-238 tr.301 chỉ cho phép tối đa 8. Đã cắt còn ' + pname + '.');
    if (S.dollar) push(`$${pname}.MIN%`);
    push('O' + pname);
    push(cm(S.progName + ' - ' + S.comment),
      cm('MAY OKUMA LB3000EX II - OSP-P300L'),
      cm(`PHOI D${f(stockD)} L${f(S.stockL)} ${S.material || ''}`),
      cm('TAO BOI OKUMA LAP TRINH - ' + (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(new Date())),
      cm('CANH BAO: PHAI CHAY THU KHONG PHOI / MO PHONG TRUOC KHI CAT'),
      'G95', `G50 S${f(S.g50)}`);
    if (num(S.g50, 0) > num(S.machMax, 99999)) W.push({ lvl: 'warn', msg: `G50 S${S.g50} lớn hơn tốc độ tối đa máy (${S.machMax}).` });

    // ---------------- Các bộ sinh ----------------
    var GEN = {
      facing(op) {
        const xe = num(op.xEnd, -1.6), xs = op.xStart === '' || op.xStart == null ? stockD + 4 : num(op.xStart, stockD + 4);
        if (ctx.tail && xe < num(S.tailDia, 20)) needFree('khỏa mặt vào tới tâm');
        else if (ctx.tail) warn('warn', 'Khỏa mặt khi có chống tâm: chỉ tới X' + f(xe) + ' – kiểm tra va chạm với mũi tâm.');
        toolStart(op.tool, 'KHOA MAT'); spindleG96(op.vc, op.dir);
        const zs = num(op.zStock, 1), doc = Math.max(0.05, num(op.doc, 1)), fin = Math.max(0, num(op.finish, 0));
        push(`G00 X${f(xs)} Z${f(zs + 2)}`);
        const levels = []; let z = zs - doc; while (z > fin + 1e-6) { levels.push(z); z -= doc; } levels.push(fin);
        if (zs <= 0) warn('warn', 'Lượng dư mặt = 0: chỉ chạy một lát tại Z0.');
        levels.forEach((zl, i) => {
          const last = i === levels.length - 1 && fin === 0;
          push(`G00 Z${f(zl)}`, `G01 X${f(xe)} F${f(last ? num(op.ffeed, op.feed) : op.feed)}`, `G00 Z${f(zl + 1)}`, `X${f(xs)}`);
        });
        if (fin > 0) push(`G00 Z0`, `G01 X${f(xe)} F${f(op.ffeed)}`, `G00 Z1`, `X${f(xs)}`);
        toolEnd();
      },
      od(op) { turnGen(op, false); },
      id(op) { turnGen(op, true); },
      thread(op) {
        wantTail(op);
        const P = num(op.P, 1.5), d = num(op.dia, 20), od = op.side !== 'ID';
        const H = op.H !== '' && op.H != null ? num(op.H, 0) : Math.round((od ? 1.2269 : 1.0825) * P * 1000) / 1000;
        const xf = od ? d - H : d; const xs = od ? d + 4 : d - H - 2;
        if (!od) needFree('tiện ren trong');
        const D1 = num(op.D1, 0.3), U = num(op.U, 0);
        // LE33-021 P-180 mô tả mẫu M73 (lát D tới gần H−U) nhưng không ghi alarm khi D > H−U.
        if (op.pat === 'M73' && H - U < D1 - 1e-9) warn('warn', `G71 mẫu M73 (LE33-021 P-180): D=${f(D1)} lớn hơn H−U=${f(H - U)}. Lát đầu có thể vượt phần còn lại.`);
        if (H - U < 0) warn('err', 'H − U phải ≥ 0 (LE33-021 P-175: U dư tinh, H cao ren, cả hai theo đường kính).');
        if (!od) warn('info', 'G71 ren trong: LE33-021 P-174 là chu trình ren dọc; ví dụ P-176 chỉ ren ngoài. X là đường kính lát cuối (P-182). Ren trong: X cuối = đường kính lớn, điểm vào nhỏ hơn. Không có mục riêng.');
        if (num(op.zs, 0) - num(op.ze, 0) <= 0) warn('err', 'Z bắt đầu phải lớn hơn Z kết thúc.');
        if (num(op.zs, 0) < 2 * P) warn('warn', 'Z bắt đầu nên cách mặt ren ≥ 2–3 lần bước để trục chính đồng bộ.');
        if (num(op.rpm, 0) * P > 3000) warn('warn', 'Tốc độ × bước lớn (tốc độ chạy dao > 3000 mm/ph) – kiểm tra giới hạn máy.');
        toolStart(op.tool, `REN ${od ? 'NGOAI' : 'TRONG'} ${f(d)}X${f(P)}`);
        push(`G97 S${f(op.rpm)} M03`); if (S.coolant) push('M08');
        push(`G00 X${f(xs)} Z${f(op.zs)}`);
        // LE33-021 P-167: M23 bật vát cuối ren, M22 tắt. P-175: M23 mà không có L thì L = 1 bước.
        let l = `G71 X${f(xf)} Z${f(op.ze)} B${f(op.B)} D${f(D1)} U${f(U)} H${f(H)} F${f(P)}`;
        if (num(op.Q, 1) > 1) l += ` Q${Math.round(op.Q)}`;
        l += ` ${op.mm} ${op.pat} ${op.chamf ? 'M23' : 'M22'}`;
        push(l, `G00 X${f(xs)} Z${f(op.zs)}`);
        toolEnd();
      },
      groove(op) {
        const face = op.gt === 'face', tw = num(op.tw, 3), w = num(op.w, 3), vc = op.vc;
        toolStartG();
        function toolStartG() {
          if (face) { if (num(op.d2, 0) < num(S.tailDia, 20)) needFree('cắt rãnh mặt gần tâm'); else if (ctx.tail) wantTail(op); }
          else wantTail(op);
        }
        if (face) {
          const Do = num(op.d1, 40), Di = num(op.d2, 30), zf = num(op.zr, 0), dep = w, zb = zf - dep;
          if ((Do - Di) / 2 < tw - 1e-6) warn('err', 'Rãnh mặt: bề rộng rãnh nhỏ hơn bề rộng dao.');
          // X là Ø của điểm chuẩn dao. Cạnh ngoài: dao chiếm [x-2tw, x]; cạnh trong: [x, x+2tw]
          const first = op.ref === 'L' ? Do : Di, last = op.ref === 'L' ? Di + 2 * tw : Do - 2 * tw;
          const xs = []; const stepD = 2 * tw * 0.8; const n = Math.max(1, Math.ceil(Math.abs(first - last) / stepD - 1e-9));
          for (let i = 0; i <= n; i++) xs.push(first + (last - first) * i / n);
          toolStart(op.tool, 'RANH MAT DAU'); spindleG96(vc, 'M03');
          push(`G00 X${f(first)} Z${f(zf + 2)}`);
          if (op.cyc === 'cyc') {
            let l = `G74 X${f(last)} Z${f(zb)} I${f(stepD)}`; if (num(op.peck, 0) > 0) l += ` D${f(op.peck)}`;
            l += ` F${f(op.feed)}`; if (num(op.dwell, 0) > 0) l += ` E${f(op.dwell)}`; push(l);
          } else xs.forEach(x => push(`G00 X${f(x)}`, `G01 Z${f(zb)} F${f(op.feed)}`, `G00 Z${f(zf + 2)}`));
          toolEnd(); return;
        }
        const dt = num(op.d1, stockD), db = num(op.d2, dt - 3), zr = num(op.zr, -10);
        if (w < tw - 1e-6) warn('err', 'Bề rộng rãnh nhỏ hơn bề rộng dao.');
        if (db >= dt) warn('err', 'Ø đáy rãnh phải nhỏ hơn Ø đỉnh.');
        const first = op.ref === 'L' ? zr - tw : zr, last = op.ref === 'L' ? zr - w : zr - w + tw;
        const step = tw * 0.8, n = Math.max(0, Math.ceil(Math.abs(first - last) / step - 1e-9));
        const zs = []; for (let i = 0; i <= n; i++) zs.push(n ? first + (last - first) * i / n : first);
        toolStart(op.tool, 'CAT RANH NGOAI'); spindleG96(vc, 'M03');
        push(`G00 X${f(dt + 4)} Z${f(first)}`);
        if (op.cyc === 'cyc') {
          // LE33-021 P-197: G73 K dịch Z, D/DP chiều sâu; hình 7-54 ghi D/2 nên D theo đường kính.
          let l = `G73 X${f(db)} Z${f(last)}`; if (zs.length > 1) l += ` K${f(Math.abs(first - last) / n)}`;
          if (num(op.peck, 0) > 0) l += ` D${f(op.peck)}`; l += ` F${f(op.feed)}`; if (num(op.dwell, 0) > 0) l += ` E${f(op.dwell)}`; push(l);
        } else zs.forEach(z => push(`G00 Z${f(z)}`, `G01 X${f(db)} F${f(op.feed)}`, `G00 X${f(dt + 4)}`));
        toolEnd();
      },
      cutoff(op) {
        needFree('cắt đứt (phôi sẽ bị kẹp giữa mâm và mũi tâm → gãy dao)');
        const d = op.dia === '' || op.dia == null ? stockD : num(op.dia, stockD);
        if (Math.abs(num(op.z, 0)) > num(S.stockL, 999)) warn('warn', 'Z cắt đứt vượt chiều dài phôi.');
        toolStart(op.tool, 'CAT DUT');
        push(`G50 S${f(op.maxS)}`); spindleG96(op.vc, 'M03');
        push(`G00 X${f(d + 4)} Z${f(op.z)}`);
        if (String(op.catcher || '').trim()) push(asc(op.catcher));
        const xs = num(op.xSlow, 8), xe = num(op.xEnd, -1);
        if (xs > xe) push(`G01 X${f(xs)} F${f(op.feed)}`, `X${f(xe)} F${f(op.fSlow)}`); else push(`G01 X${f(xe)} F${f(op.feed)}`);
        push(`G00 X${f(d + 4)}`, `G50 S${f(S.g50)}`);
        toolEnd();
      },
      drill(op) {
        needFree(op.isCenter ? 'khoan tâm' : 'khoan lỗ tâm');
        const zb = num(op.zb, -5), zs = num(op.zs, 3);
        if (zb >= 0) warn('err', 'Z đáy lỗ phải âm.');
        toolStart(op.tool, op.isCenter ? 'KHOAN TAM' : 'KHOAN LO D' + f(op.dia));
        push(`G97 S${f(op.rpm)} M03`); if (S.coolant) push('M08');
        push(`G00 X0 Z${f(zs)}`);
        // LE33-021 P-200/P-202: G74 — D là chiều sâu mỗi nhát theo Z; X và Z bắt buộc.
        if (num(op.peck, 0) > 0) push(`G74 X0 Z${f(zb)} D${f(op.peck)} F${f(op.feed)}`);
        else push(`G01 Z${f(zb)} F${f(op.feed)}`, `G00 Z${f(zs)}`);
        if (op.isCenter) ctx.centerDrilled = true;
        toolEnd();
      },
      lface(op) {
        needFree('gia công mặt đầu bằng dao động lực');
        let holes = [];
        if (op.pos === 'pcd') { const n = Math.max(1, Math.round(num(op.n, 1))); for (let i = 0; i < n; i++) holes.push({ X: num(op.pcd, 0), C: normA(num(op.c0, 0) + 360 * i / n) }); }
        else if (op.pos === 'ang') { holes = parseList(op.angs).map(a => ({ X: num(op.pcd, 0), C: normA(a) })); }
        else { const pts = parsePts(op.xy); holes = pts.map(p => ({ X: 2 * Math.hypot(p.x, p.y), C: normA(deg(Math.atan2(p.y, p.x))), x: p.x, y: p.y })); }
        if (!holes.length) { warn('err', 'Chưa có lỗ nào (kiểm tra danh sách góc / tọa độ).'); return; }
        holes.forEach(h => { if (h.X / 2 > stockD / 2) warn('warn', 'Có lỗ nằm ngoài Ø phôi.'); });
        const zt = num(op.zTop, 0), dep = num(op.depth, 5), clr = num(op.clr, 2), zst = zt + clr + 8, K = zst - (zt + clr), zb = zt - dep;
        const sb = num(op.sb, 1000);
        const F = (op.cyc === 'G184' || op.cyc === 'G178') ? num(op.pitch, 1) * sb : num(op.fr, 0.1) * sb;
        const extra = () => (op.cyc === 'G183' ? ` D${f(op.peck)}` : '') + (num(op.dwell, 0) > 0 && op.cyc !== 'G181' ? ` E${f(op.dwell)}` : '');
        toolStart(op.tool, `${op.cyc} MAT DAU ${holes.length} LO`);
        liveStart(sb);
        if (op.pos === 'xyy') {
          // LE33-021 P-238: trước G181–G184 trục C phải M146. Chu trình tự kẹp — không M147 trước.
          push('M146', `G138 C${f(num(op.c0, 0))}`, 'G17');
          note138();
          const c = f(num(op.c0, 0));
          const h0 = holes[0];
          push(`G00 X${f(xv(h0.x))} Y${f(h0.y)} Z${f(zst)}`);
          holes.forEach((h, i) => {
            if (i === 0) push(`${op.cyc} X${f(xv(h.x))} Y${f(h.y)} Z${f(zb)} C${c} K${f(K)} F${f(F)}${extra()}`);
            else push(`X${f(xv(h.x))} Y${f(h.y)}`);
          });
          push('G180', `G00 X${f(xv(h0.x))} Z${f(zst)}`, 'G00 Y0', 'G136');
        } else {
          push('M146'); // LE33-021 P-238
          push(`G00 X${f(holes[0].X)} Z${f(zst)} C${f(holes[0].C)}`);
          holes.forEach((h, i) => {
            if (i === 0) push(`${op.cyc} X${f(h.X)} Z${f(zb)} C${f(h.C)} K${f(K)} F${f(F)}${extra()}`);
            else push((h.X !== holes[i - 1].X ? `X${f(h.X)} ` : '') + `C${f(h.C)}`);
          });
          push('G180', `G00 X${f(holes[holes.length - 1].X)} Z${f(zst)}`);
        }
        liveEnd(); toolEnd();
      },
      lside(op) {
        wantTail(op);
        const d = op.dia === '' || op.dia == null ? stockD : num(op.dia, stockD);
        const zs = parseList(op.zs); if (!zs.length) { warn('err', 'Chưa nhập vị trí Z.'); return; }
        let angs = parseList(op.angs).map(normA);
        if (!angs.length) { const n = Math.max(1, Math.round(num(op.n, 1))); for (let i = 0; i < n; i++) angs.push(normA(num(op.c0, 0) + 360 * i / n)); }
        const clr = num(op.clr, 2), dep = num(op.depth, 5), xs = d + 2 * (clr + 6), I = 12, xb = d - 2 * dep;
        const sb = num(op.sb, 1000), y = num(op.y, 0);
        const F = (op.cyc === 'G184' || op.cyc === 'G178') ? num(op.pitch, 1) * sb : num(op.fr, 0.1) * sb;
        const extra = () => (op.cyc === 'G183' ? ` D${f(op.peck)}` : '') + (num(op.dwell, 0) > 0 && op.cyc !== 'G181' ? ` E${f(op.dwell)}` : '');
        if (xb < 0) warn('warn', 'Lỗ hướng kính vượt qua tâm.');
        toolStart(op.tool, `${op.cyc} MAT BEN ${zs.length * angs.length} LO`);
        liveStart(sb);
        if (y !== 0) {
          push('G138', 'G19');
          note138();
          const xsv = S.x138 === 'radius' ? xs / 2 : xs, xbv = S.x138 === 'radius' ? xb / 2 : xb, Iv = S.x138 === 'radius' ? I / 2 : I;
          push(`G00 X${f(xsv)} Y${f(y)} Z${f(zs[0])}`);
          zs.forEach(z => angs.forEach(c => push(`${op.cyc} X${f(xbv)} Y${f(y)} Z${f(z)} C${f(c)} I${f(Iv)} F${f(F)}${extra()}`)));
          push('G180', `G00 X${f(xsv)} Z${f(zs[zs.length - 1])}`, 'G00 Y0', 'G136');
        } else {
          push(`G00 X${f(xs)} Z${f(zs[0])} C${f(angs[0])}`);
          let first = true;
          zs.forEach((z, zi) => angs.forEach((c, ci) => {
            if (first) { push(`${op.cyc} X${f(xb)} Z${f(z)} C${f(c)} I${f(I)} F${f(F)}${extra()}`); first = false; }
            else push((ci === 0 ? `Z${f(z)} ` : '') + `C${f(c)}`);
          }));
          push('G180', `G00 X${f(xs)} Z${f(zs[zs.length - 1])}`);
        }
        liveEnd(); toolEnd();
      },
      mslot(op) {
        needFree('phay mặt đầu');
        const r = num(op.td, 4) / 2, x1 = num(op.x1, 0), y1 = num(op.y1, 0), x2 = num(op.x2, 0), y2 = num(op.y2, 0);
        if (Math.max(Math.hypot(x1, y1), Math.hypot(x2, y2)) + r > stockD / 2) warn('warn', 'Rãnh vượt ra ngoài Ø phôi.');
        const zt = num(op.zTop, 0), dep = num(op.depth, 1), st = Math.max(0.05, num(op.step, 0.5));
        millFaceStart(op, `PHAY RANH MAT DAU`);
        push(`G00 X${f(xv(x1))} Y${f(y1)} Z${f(zt + 3)}`, `G01 Z${f(zt + 0.5)} F${f(op.pf)}`);
        let z = zt, fwd = true;
        while (z > zt - dep + 1e-6) {
          z = Math.max(zt - dep, z - st);
          const a = fwd ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
          push(`G01 Z${f(z)} F${f(op.pf)}`, `G01 X${f(xv(a[2]))} Y${f(a[3])} F${f(op.feed)}`);
          fwd = !fwd;
        }
        push(`G00 Z${f(zt + 3)}`);
        millFaceEnd();
      },
      mpocket(op) {
        needFree('phay hốc mặt đầu');
        const r = num(op.td, 4) / 2, cx = num(op.cx, 0), cy = num(op.cy, 0), lx = num(op.lx, 10), ly = num(op.ly, 10);
        if (lx < 2 * r || ly < 2 * r) { warn('err', 'Hốc nhỏ hơn Ø dao.'); return; }
        const corners = [[cx - lx / 2, cy - ly / 2], [cx + lx / 2, cy - ly / 2], [cx + lx / 2, cy + ly / 2], [cx - lx / 2, cy + ly / 2]];
        if (Math.max(...corners.map(c => Math.hypot(c[0], c[1]))) > stockD / 2) warn('warn', 'Hốc vượt ra ngoài Ø phôi.');
        const zt = num(op.zTop, 0), dep = num(op.depth, 1), st = Math.max(0.05, num(op.step, 0.5));
        const so = Math.max(0.1, Math.min(0.9, num(op.so, 50) / 100)) * 2 * r;
        const xa = cx - lx / 2 + r, xb = cx + lx / 2 - r, ya = cy - ly / 2 + r, yb = cy + ly / 2 - r;
        millFaceStart(op, 'PHAY HOC MAT DAU');
        warn('warn', 'Phay hốc: xuống dao thẳng đứng – cần dao cắt tâm hoặc khoan lỗ mồi trước.');
        push(`G00 X${f(xv(xa))} Y${f(ya)} Z${f(zt + 3)}`, `G01 Z${f(zt + 0.5)} F${f(op.pf)}`);
        let z = zt;
        while (z > zt - dep + 1e-6) {
          z = Math.max(zt - dep, z - st);
          push(`G01 X${f(xv(xa))} Y${f(ya)} F${f(op.feed)}`, `G01 Z${f(z)} F${f(op.pf)}`);
          let y = ya, dir = 1; const rows = [];
          while (y < yb - 1e-6) { rows.push(y); y += so; } rows.push(yb);
          rows.forEach((yy, i) => {
            if (i > 0) push(`G01 Y${f(yy)} F${f(op.feed)}`);
            push(`G01 X${f(xv(dir > 0 ? xb : xa))} F${f(op.feed)}`); dir = -dir;
          });
          // chạy viền
          push(`G01 X${f(xv(xa))} Y${f(yb)}`, `Y${f(ya)}`, `X${f(xv(xb))}`, `Y${f(yb)}`, `X${f(xv(xa))}`);
        }
        push(`G00 Z${f(zt + 3)}`);
        millFaceEnd();
      },
      mflat(op) {
        wantTail(op);
        const R = num(op.dia, stockD) / 2, dep = num(op.depth, 1), r = num(op.td, 10) / 2;
        const z1 = num(op.z1, -5), z2 = num(op.z2, -20), st = Math.max(0.05, num(op.step, 1));
        const so = Math.max(0.1, Math.min(0.9, num(op.so, 60) / 100)) * 2 * r;
        const xf = R - dep; if (xf <= 0) { warn('err', 'Chiều sâu mặt phẳng quá lớn.'); return; }
        const half = Math.sqrt(Math.max(0, R * R - xf * xf)) + r + 2;
        const za = Math.min(z1, 0) - r, zb2 = z2 + r;
        const zl = []; if (za < zb2) { warn('err', 'Đoạn Z nhỏ hơn Ø dao.'); return; }
        const n = Math.max(0, Math.ceil((za - zb2) / so - 1e-9)); for (let i = 0; i <= n; i++) zl.push(n ? za + (zb2 - za) * i / n : za);
        if (z1 < 0) warn('warn', 'Mặt phẳng kín hai đầu: góc trong sẽ có bán kính = bán kính dao.');
        toolStart(op.tool, 'PHAY MAT PHANG CANH C' + f(op.c)); liveStart(op.sb);
        push('M146', `G138 C${f(op.c)}`, 'M147', 'G19');
        note138();
        push(`G00 X${f(xv(R + 5))} Y${f(-half)} Z${f(zl[0])}`);
        let x = R, side = -1;
        while (x > xf + 1e-6) {
          x = Math.max(xf, x - st);
          push(`G00 X${f(xv(R + 2))}`, `G00 Y${f(side * half)} Z${f(zl[0])}`, `G01 X${f(xv(x))} F${f(op.pf)}`);
          zl.forEach((zz, i) => { if (i > 0) push(`G01 Z${f(zz)} F${f(op.feed)}`); side = -side; push(`G01 Y${f(side * half)} F${f(op.feed)}`); });
        }
        push(`G00 X${f(xv(R + 5))}`, 'G00 Y0', 'G136');
        liveEnd(); toolEnd();
      },
      tailOn(op) { if (ctx.tail) warn('warn', 'Chống tâm đã tiến rồi.'); else tailAdvance(op.note); },
      tailOff(op) { if (!ctx.tail) warn('warn', 'Chống tâm chưa tiến – lệnh lùi thừa (vẫn xuất M55).'); tailRetract(op.note); },
      stop(op) { push('', cm(op.note || 'DUNG'), `G00 X${hx} Z${hz}`, op.m); },
      raw(op) { push(''); String(op.code || '').split(/\r?\n/).forEach(s => { if (s.trim()) push(s.replace(/[^\x20-\x7E]/g, '').toUpperCase()); }); warn('info', 'Mã tự nhập không được kiểm tra.'); }
    };
    function millFaceStart(op, title) {
      toolStart(op.tool, title + ' C' + f(op.c)); liveStart(op.sb);
      push('M146', `G138 C${f(op.c)}`, 'M147', 'G17');
      note138();
    }
    function millFaceEnd() { push('G00 Y0', 'G136'); liveEnd(); toolEnd(); }

    function turnGen(op, inner) {
      if (inner) needFree('tiện trong'); else wantTail(op);
      const pts = (op.pts || []).map(p => ({ x: num(p.x, 0), z: num(p.z, 0), t: p.t || 'L', r: p.r }));
      if (pts.length < 2) { warn('err', 'Biên dạng cần ít nhất 2 điểm.'); return; }
      const bore = num(op.bore, 10);
      const sx = op.startX === '' || op.startX == null ? (inner ? bore - 1 : stockD + 2) : num(op.startX, 0);
      const sz = num(op.startZ, 2);
      if (!inner) { if (pts.some(p => p.x > stockD)) warn('warn', 'Có điểm biên dạng lớn hơn Ø phôi.'); }
      else { if (pts.some(p => p.x < bore)) warn('warn', 'Có điểm biên dạng nhỏ hơn Ø lỗ sẵn.'); if (sx >= Math.min(...pts.map(p => p.x))) warn('err', 'X bắt đầu tiện trong phải nhỏ hơn Ø biên dạng.'); }
      if (pts[0].z > sz) warn('err', 'Điểm đầu biên dạng nằm ngoài điểm bắt đầu Z.');
      if (op.mode === 'G85') {
        for (let i = 1; i < pts.length; i++) {
          const bad = inner ? pts[i].x > pts[i - 1].x + 1e-9 : pts[i].x < pts[i - 1].x - 1e-9;
          if (bad || pts[i].z > pts[i - 1].z + 1e-9) { warn('warn', 'Biên dạng không đơn điệu (có hốc lõm/ngược chiều) – G85 có thể báo lỗi; cân nhắc G86.'); break; }
        }
      }
      if (num(op.D, 0) <= 0 && op.mode !== 'none') warn('err', 'D phải > 0.');
      ctx.nat++; const nm = 'NAT' + pad2(ctx.nat);
      const g4 = inner ? 'G41' : 'G42';
      const last = pts[pts.length - 1];
      const def = [`${nm} G81`, `G00 X${f(pts[0].x)}`];
      pts.forEach((p, i) => {
        if (i === 0) { def.push(`G01${op.comp ? ' ' + g4 : ''} Z${f(p.z)} F${f(op.ff)}`); return; }
        // Bán kính cung: ví dụ IGF LE32-238 tr.333 ghi I. LE33-021 P-35 định nghĩa L là bán kính, I/K là tâm.
        // Giữ I để khớp ví dụ IGF; nếu máy báo lỗi cung thì đổi I thành L.
        if (p.t !== 'L' && num(p.r, 0) > 0) def.push(`${p.t === 'CW' ? 'G02' : 'G03'} X${f(p.x)} Z${f(p.z)} I${f(p.r)}`);
        else def.push(`G01 X${f(p.x)} Z${f(p.z)}`);
      });
      const needExit = inner ? last.x > sx : last.x < sx;
      if (needExit || op.comp) def.push(`${op.comp ? 'G40 ' : ''}G01 X${f(sx)}`);
      def.push('G80');
      const title = inner ? 'TIEN TRONG' : 'TIEN NGOAI';
      const same = Math.round(num(op.tool)) === Math.round(num(op.ftool));
      if (op.mode !== 'none') {
        toolStart(op.tool, title + ' THO ' + op.mode); spindleG96(op.vc, 'M03');
        push(`G00 X${f(sx)} Z${f(sz)}`, `${op.mode} ${nm} D${f(op.D)} F${f(op.F)} U${f(op.U)} W${f(op.W)}`, ...def);
        if (same) { push(`G96 S${f(op.vcf)}`, `G00 X${f(sx)} Z${f(sz)}`, `G87 ${nm}`); toolEnd(); return; }
        toolEnd();
        toolStart(op.ftool, title + ' TINH G87'); spindleG96(op.vcf, 'M03');
        push(`G00 X${f(sx)} Z${f(sz)}`, `G87 ${nm}`); toolEnd();
      } else {
        toolStart(op.ftool, title + ' TINH G87'); spindleG96(op.vcf, 'M03');
        push(...def, `G00 X${f(sx)} Z${f(sz)}`, `G87 ${nm}`); toolEnd();
      }
    }

    ops.forEach((op, idx) => {
      ctx.curOp = op; ctx.idx = idx; const start = L.length;
      const meta = OPS[op.type]; if (!meta) return;
      try { GEN[op.type](op); } catch (e) { warn('err', 'Lỗi tạo mã: ' + e.message); }
      map.push({ id: op.id, from: start, to: L.length });
    });
    ctx.curOp = null;
    if (ctx.tail) W.push({ lvl: 'warn', msg: 'Cuối chương trình chống tâm vẫn đang TIẾN – nhớ lùi (M55) trước khi tháo phôi.' });
    push('', `G00 X${hx} Z${hz}` + (S.coolant ? ' M09' : ''), 'M05', S.endCode || 'M02');
    if (S.dollar) push('%');
    try {
      buildToolpath(project).hits.filter(h => h.kind === 'jaw' || h.kind === 'overX' || h.kind === 'overZ' || h.kind === 'overZmin').forEach(h => {
        if (!W.some(w => w.op === h.opId && w.msg === h.msg)) W.push({ lvl: 'warn', msg: h.msg, op: h.opId, idx: h.opIndex });
      });
    } catch (e) { W.push({ lvl: 'info', msg: 'Không dựng được đường dao mô phỏng: ' + e.message }); }

    return { lines: L, text: L.join('\r\n') + '\r\n', warnings: W, map, settings: S };
  }

  // Đường dao 2D cho mô phỏng IGF. Không xuất mã — compile() chỉ lấy cảnh báo hình học.
  // Va chạm ụ/khỏa tâm/cắt đứt đã có trong compile(); ở đây thêm chấu mâm và vượt hành trình.
  function buildToolpath(project) {
    const S = Object.assign({}, DEFAULT_SETTINGS, (project && project.settings) || {});
    const ops = (project && project.ops) || [];
    const stockD = num(S.stockD, 60), stockL = num(S.stockL, 100), stockR = stockD / 2;
    const jawLen = Math.max(0, num(S.jawLen, 20)), jawOd = num(S.jawOd, stockD + 30), jawFace = -stockL;
    const moves = [], hits = [];
    const seen = new Set();
    let z = num(S.homeZ, 300), r = num(S.homeX, 300) / 2, tail = false;
    function hit(i, op, kind, msg, zz, rr) {
      const key = (op && op.id) + '|' + kind;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push({ opIndex: i, opId: op && op.id, kind, msg, z: zz, r: rr, at: moves.length });
    }
    function consider(i, op, z1, r1, cutting) {
      const n = 8;
      for (let k = 0; k <= n; k++) {
        const zz = z + (z1 - z) * k / n;
        const rr = Math.abs(r + (r1 - r) * k / n);
        if (rr * 2 > num(S.homeX, 300) + 0.5) hit(i, op, 'overX', 'Hành trình: X vượt điểm thay dao (giới hạn X).', zz, rr);
        if (zz > num(S.homeZ, 300) + 0.5) hit(i, op, 'overZ', 'Hành trình: Z+ vượt điểm thay dao.', zz, rr);
        if (zz < jawFace - 1) hit(i, op, 'overZmin', 'Hành trình: dao vượt mặt mâm cặp (Z nhỏ hơn −chiều dài phôi).', zz, rr);
        if (cutting && zz >= jawFace - 0.05 && zz <= jawFace + jawLen + 0.05 && rr >= stockR - 0.4 && rr <= jawOd / 2 + 1)
          hit(i, op, 'jaw', 'Va chạm chấu mâm: dao đi trong vùng chấu (từ mặt mâm ra ' + f(jawLen) + ' mm, Ø chấu ' + f(jawOd) + ').', zz, rr);
        if (cutting && tail && rr < num(S.tailDia, 20) / 2 + 0.6 && zz > -2)
          hit(i, op, 'tail', 'Va chạm chống tâm: dao vào vùng mũi tâm (Ø ' + f(S.tailDia) + ') khi nòng đang tiến.', zz, rr);
      }
    }
    function go(i, op, kind, z1, r1) {
      consider(i, op, z1, r1, kind === 'feed');
      moves.push({ i, opId: op.id, kind, z0: z, r0: r, z1, r1, tail });
      z = z1; r = r1;
    }
    function home(i, op) { go(i, op, 'rapid', num(S.homeZ, 300), num(S.homeX, 300) / 2); }
    function engage() { tail = true; }
    function release() { tail = false; }
    function needFree(i, op, what) {
      if (!tail) return;
      if (S.autoRetract) release();
      else hit(i, op, 'tailBlock', 'Chống tâm đang tiến — không được ' + what + '.', z, r);
    }
    ops.forEach((op, i) => {
      if (!op || op.on === false || !OPS[op.type]) return;
      const t = op.type;
      if (t === 'tailOn') { engage(); return; }
      if (t === 'tailOff') { release(); return; }
      if (t === 'stop' || t === 'raw') return;
      if (op.useTail) engage();
      if (t === 'facing') {
        const xe = num(op.xEnd, -1.6), xs = op.xStart === '' || op.xStart == null ? stockD + 4 : num(op.xStart, stockD + 4);
        if (tail && xe < num(S.tailDia, 20)) {
          hit(i, op, 'faceTail', 'Khỏa mặt tới tâm (X' + f(xe) + ') trong khi chống tâm đang tiến.', 0, Math.max(0, xe) / 2);
          if (S.autoRetract) release();
        }
        const zs = num(op.zStock, 1), doc = Math.max(0.05, num(op.doc, 1)), fin = Math.max(0, num(op.finish, 0));
        home(i, op); go(i, op, 'rapid', zs + 2, xs / 2);
        const levels = []; let zl = zs - doc; while (zl > fin + 1e-6) { levels.push(zl); zl -= doc; } levels.push(fin);
        levels.forEach(lv => { go(i, op, 'rapid', lv, xs / 2); go(i, op, 'feed', lv, xe / 2); go(i, op, 'rapid', lv + 1, xe / 2); go(i, op, 'rapid', lv + 1, xs / 2); });
        if (fin > 0) { go(i, op, 'rapid', 0, xs / 2); go(i, op, 'feed', 0, xe / 2); go(i, op, 'rapid', 1, xs / 2); }
        home(i, op); return;
      }
      if (t === 'od' || t === 'id') {
        const inner = t === 'id';
        if (inner) needFree(i, op, 'tiện trong');
        const pts = (op.pts || []).map(p => ({ x: num(p.x, 0), z: num(p.z, 0), t: p.t || 'L', r: p.r })).filter(p => isFinite(p.x) && isFinite(p.z));
        if (pts.length < 2) return;
        const poly = profilePoly(pts);
        const bore = num(op.bore, 10) / 2;
        const sx = (op.startX === '' || op.startX == null ? (inner ? num(op.bore, 10) - 1 : stockD + 2) : num(op.startX, 0)) / 2;
        const sz = num(op.startZ, 2);
        home(i, op); go(i, op, 'rapid', sz, Math.max(0.2, sx));
        if (op.mode !== 'none') {
          const step = Math.max(0.2, num(op.D, 2) / 2);
          const rs = poly.map(p => p.r);
          const lvls = [];
          if (!inner) { for (let rr = stockR - step; rr > Math.min.apply(null, rs) + 0.05; rr -= step) lvls.push(rr); }
          else { for (let rr = bore + step; rr < Math.max.apply(null, rs) - 0.05; rr += step) lvls.push(rr); }
          lvls.forEach(rr => {
            let zEnd = poly[poly.length - 1].z;
            for (let k = 1; k < poly.length; k++) {
              const a = poly[k - 1], b = poly[k];
              const cross = inner ? (a.r >= rr && b.r <= rr) : (a.r <= rr && b.r >= rr);
              if (cross && Math.abs(b.r - a.r) > 1e-9) { zEnd = a.z + (b.z - a.z) * (rr - a.r) / (b.r - a.r); break; }
            }
            go(i, op, 'rapid', sz, rr); go(i, op, 'feed', zEnd, rr); go(i, op, 'rapid', sz, rr);
          });
        }
        go(i, op, 'rapid', sz, poly[0].r);
        poly.forEach(p => go(i, op, 'feed', p.z, Math.max(0, p.r)));
        go(i, op, 'rapid', sz, sx); home(i, op); return;
      }
      if (t === 'thread') {
        if (op.side === 'ID') needFree(i, op, 'tiện ren trong');
        const Pch = num(op.P, 1.5), d = num(op.dia, 20), odSide = op.side !== 'ID';
        const H = op.H !== '' && op.H != null ? num(op.H, 0) : (odSide ? 1.2269 : 1.0825) * Pch;
        const xf = (odSide ? d - H : d) / 2, xs = (odSide ? d + 4 : d - H - 2) / 2;
        const zs = num(op.zs, 5), ze = num(op.ze, -20);
        home(i, op); go(i, op, 'rapid', zs, xs);
        for (let k = 1; k <= 4; k++) { const rr = xs + (xf - xs) * k / 4; go(i, op, 'rapid', zs, rr); go(i, op, 'feed', ze, rr); go(i, op, 'rapid', zs, rr); }
        home(i, op); return;
      }
      if (t === 'groove') {
        const face = op.gt === 'face';
        if (face && num(op.d2, 0) < num(S.tailDia, 20)) needFree(i, op, 'cắt rãnh mặt gần tâm');
        home(i, op);
        if (face) {
          const Do = num(op.d1, 40) / 2, Di = num(op.d2, 30) / 2, zf = num(op.zr, 0), zb = zf - num(op.w, 3);
          go(i, op, 'rapid', zf + 2, Do); go(i, op, 'feed', zb, Do); go(i, op, 'rapid', zf + 2, Do);
          go(i, op, 'rapid', zf + 2, Di); go(i, op, 'feed', zb, Di);
        } else {
          const dt = num(op.d1, stockD) / 2, db = num(op.d2, stockD - 6) / 2, zr = num(op.zr, -10), w = num(op.w, 3);
          go(i, op, 'rapid', zr, dt + 2); go(i, op, 'feed', zr, db); go(i, op, 'rapid', zr, dt + 2);
          go(i, op, 'rapid', zr - w, dt + 2); go(i, op, 'feed', zr - w, db);
        }
        home(i, op); return;
      }
      if (t === 'cutoff') {
        if (tail) {
          hit(i, op, 'cutTail', 'Cắt đứt khi chống tâm đang tiến — phôi kẹt giữa mâm và mũi tâm.', num(op.z, -10), stockR);
          if (S.autoRetract) release();
        }
        const d = (op.dia === '' || op.dia == null ? stockD : num(op.dia, stockD)) / 2;
        const zz = num(op.z, -stockL + 20), xe = num(op.xEnd, -1) / 2;
        home(i, op); go(i, op, 'rapid', zz, d + 2); go(i, op, 'feed', zz, xe); go(i, op, 'rapid', zz, d + 2); home(i, op); return;
      }
      if (t === 'drill') {
        needFree(i, op, op.isCenter ? 'khoan tâm' : 'khoan lỗ');
        const zb = num(op.zb, -5), zs = num(op.zs, 3);
        home(i, op); go(i, op, 'rapid', zs, 0.3); go(i, op, 'feed', zb, 0.3); go(i, op, 'rapid', zs, 0.3); home(i, op); return;
      }
      if (t === 'lface' || t === 'mslot' || t === 'mpocket') {
        needFree(i, op, 'gia công mặt đầu');
        const zt = num(op.zTop, 0), dep = num(op.depth, 5);
        let rad = stockR * 0.45;
        if (t === 'lface') rad = Math.max(0, num(op.pcd, 20) / 2);
        if (t === 'mslot') rad = Math.hypot(num(op.x1, 0), num(op.y1, 0));
        if (t === 'mpocket') rad = Math.hypot(num(op.cx, 0), num(op.cy, 0));
        home(i, op); go(i, op, 'rapid', zt + 5, rad); go(i, op, 'feed', zt - dep, rad); go(i, op, 'rapid', zt + 5, rad); home(i, op); return;
      }
      if (t === 'lside' || t === 'mflat') {
        const d = (t === 'mflat' ? num(op.dia, stockD) : (op.dia === '' || op.dia == null ? stockD : num(op.dia, stockD))) / 2;
        const dep = num(op.depth, 5);
        let zs = t === 'lside' ? parseList(op.zs) : [num(op.z1, -20), num(op.z2, -40)];
        if (!zs.length) zs = [-20];
        home(i, op);
        zs.forEach(zz => { go(i, op, 'rapid', zz, d + 4); go(i, op, 'feed', zz, Math.max(0.5, d - dep)); go(i, op, 'rapid', zz, d + 4); });
        home(i, op);
      }
    });
    let finish = [];
    const odOp = ops.find(o => o && o.on !== false && o.type === 'od' && o.pts && o.pts.length > 1);
    if (odOp) finish = profilePoly(odOp.pts.map(p => ({ x: num(p.x, 0), z: num(p.z, 0), t: p.t || 'L', r: p.r })));
    const fz = ops.find(o => o && o.on !== false && o.type === 'facing');
    return {
      moves, hits, finish,
      blank: { r: stockR, z0: jawFace, z1: fz ? num(fz.zStock, 0) : 0 },
      chuck: { z: jawFace, jawLen, jawR: jawOd / 2, stockR },
      tailDia: num(S.tailDia, 20),
      home: { z: num(S.homeZ, 300), r: num(S.homeX, 300) / 2 }
    };
  }

  // ---------------- Dự án mẫu (đủ mọi nguyên công) ----------------
  function sampleProject() {
    const o = t => newOp(t);
    const ops = [];
    let a = o('facing'); ops.push(a);
    a = o('drill'); a.tool = 5; a.isCenter = true; a.dia = 5; a.zb = -6; ops.push(a);
    a = o('tailOn'); a.note = 'DO PHOI DAI'; ops.push(a);
    a = o('od'); a.useTail = true; ops.push(a);
    a = o('groove'); a.useTail = true; ops.push(a);
    a = o('thread'); a.useTail = true; ops.push(a);
    a = o('lside'); a.useTail = true; ops.push(a);
    a = o('mflat'); a.useTail = true; ops.push(a);
    a = o('tailOff'); ops.push(a);
    a = o('drill'); a.tool = 6; a.isCenter = false; a.dia = 12; a.zs = 3; a.zb = -20; a.rpm = 900; a.feed = 0.12; a.peck = 4; ops.push(a);
    a = o('id'); ops.push(a);
    a = o('lface'); a.cyc = 'G183'; ops.push(a);
    a = o('mslot'); ops.push(a);
    a = o('mpocket'); ops.push(a);
    a = o('stop'); a.m = 'M01'; a.note = 'KIEM TRA TRUOC KHI CAT DUT'; ops.push(a);
    a = o('cutoff'); ops.push(a);
    return { settings: Object.assign({}, DEFAULT_SETTINGS, { stockD: 60, stockL: 120 }), ops };
  }

  // ---------------- IGF (Advanced One-Touch IGF-L, LE32-239 / LE32-238) ----------------
  // PET: BLANK/SETUP → TOOL DATA → TURNING SHAPE → PROCESS DECIDE → PROCESS EDIT → PROCESS TEST → PROGRAM CREATE.
  const MATERIALS = {
    S45C: { name: 'S45C', vr: 180, fr: 0.25, dx: 3, lx: 0.2, lz: 0.1, vf: 220, ff: 0.12, gv: 110, gf: 0.08 },
    SCM440: { name: 'SCM440', vr: 160, fr: 0.22, dx: 2.5, lx: 0.2, lz: 0.1, vf: 200, ff: 0.1, gv: 100, gf: 0.07 },
    SUS304: { name: 'SUS304', vr: 120, fr: 0.15, dx: 2, lx: 0.15, lz: 0.08, vf: 150, ff: 0.08, gv: 80, gf: 0.05 },
    AL: { name: 'AL', vr: 300, fr: 0.3, dx: 4, lx: 0.2, lz: 0.1, vf: 400, ff: 0.15, gv: 200, gf: 0.1 },
    FC250: { name: 'FC250', vr: 140, fr: 0.2, dx: 3, lx: 0.2, lz: 0.1, vf: 160, ff: 0.1, gv: 90, gf: 0.07 }
  };
  const DEFAULT_IGF = {
    flowV: 2,
    material: 'S45C', mat: null,
    blankShape: 'round', od: 100, ol: 82,
    blankId: 'none', id: 0, idDepth: 0,
    zeroRef: 'left', zeroPos: 0, g50: 2500,
    grip: 'od',
    jawL1: 0, jawD1: 0, jawL2: 20, jawD2: 0, jawL3: 0, jawD3: 75, chuckCx: 0,
    useCenter: false,
    ctrL: 0, tailD: 20, ctrL1: 0, ctrD1: 0, ctrL2: 0, ctrD2: 0, ctrHole: 0, ctrZ: 0,
    uniformH: 1, cornerR: 0,
    sx: 0, sz: 80, dir: 'CCW',
    chamfer: 0, chfType: 'C',
    roughT: 1, finishT: 2, boreT: 7,
    tools: null,
    decidePattern: 'standard', decided: false,
    ddt: true, fileName: '',
    elems: [],
    inSx: 20, inSz: 0, innerElems: null, mills: null
  };
  function ensureTools(ig) {
    if (!ig) return [];
    if (!Array.isArray(ig.tools) || !ig.tools.length) {
      ig.tools = [
        { kind: 'single', angle: 80, edge: 5, role: 'ROUGH OD', role2: 'ROUGH FACE', t: num(ig.roughT, 1) || 1, offset: num(ig.roughT, 1) || 1 },
        { kind: 'single', angle: 55, edge: 3, role: 'FINISH OD', role2: 'FINISH FACE', t: num(ig.finishT, 2) || 2, offset: num(ig.finishT, 2) || 2 }
      ];
    }
    const rough = ig.tools.find(t => t && (t.role === 'ROUGH OD' || t.role2 === 'ROUGH OD')) || ig.tools[0];
    const fin = ig.tools.find(t => t && t !== rough && (t.role === 'FINISH OD' || t.role2 === 'FINISH OD')) || ig.tools[1] || ig.tools[0];
    if (rough && rough.t !== '' && rough.t != null) ig.roughT = Number(rough.t) || ig.roughT;
    if (fin && fin.t !== '' && fin.t != null) ig.finishT = Number(fin.t) || ig.finishT;
    const bore = ig.tools.find(t => t && (t.role === 'ROUGH ID' || t.role === 'FINISH ID'));
    if (bore && bore.t !== '' && bore.t != null) ig.boreT = Number(bore.t) || ig.boreT;
    return ig.tools;
  }
  function igfTutorial() {
    return Object.assign({}, DEFAULT_IGF, {
      material: 'S45C', od: 100, ol: 82, zeroRef: 'left', zeroPos: 0, g50: 2500,
      grip: 'od', jawL2: 20, jawD3: 75, useCenter: false,
      sx: 0, sz: 80, dir: 'CCW', roughT: 1, finishT: 2,
      elems: [
        { t: 'face', x: 60 },
        { t: 'cchf', c: 1 },
        { t: 'long', z: 55 },
        { t: 'taper', x: 70, ang: 165 },
        { t: 'long', z: 25 },
        { t: 'rchf', r: 5 },
        { t: 'face', x: 100 },
        { t: 'jump' }
      ]
    });
  }
  function matOf(igf) {
    const base = MATERIALS[igf.material] || MATERIALS.S45C;
    return Object.assign({}, base, igf.mat || {});
  }
  function rightFaceZ(igf) {
    const ol = num(igf.ol, 0), zp = num(igf.zeroPos, 0);
    return igf.zeroRef === 'left' ? ol - zp : zp;
  }
  function toGenZ(z, igf) { return z - rightFaceZ(igf); }

  function cornerCut(p0, p1, p2, kind, val) {
    const d1 = { z: p1.z - p0.z, r: p1.r - p0.r }, d2 = { z: p2.z - p1.z, r: p2.r - p1.r };
    const l1 = Math.hypot(d1.z, d1.r), l2 = Math.hypot(d2.z, d2.r);
    if (l1 < 1e-9 || l2 < 1e-9) return null;
    const u1 = { z: d1.z / l1, r: d1.r / l1 }, u2 = { z: d2.z / l2, r: d2.r / l2 };
    const cross = u1.z * u2.r - u1.r * u2.z;
    const cos = Math.max(-1, Math.min(1, u1.z * u2.z + u1.r * u2.r));
    const ang = Math.acos(cos);
    if (ang < 1e-3 || Math.abs(Math.PI - ang) < 1e-3) return null;
    const C = Math.abs(num(val, 0));
    if (C <= 0) return null;
    const tlen = kind === 'r' ? C / Math.tan(ang / 2) : C;
    if (tlen >= l1 - 1e-6 || tlen >= l2 - 1e-6) return null;
    const a = { z: p1.z - u1.z * tlen, r: p1.r - u1.r * tlen };
    const b = { z: p1.z + u2.z * tlen, r: p1.r + u2.r * tlen };
    const cw = cross < 0;
    return { a, b, cw, r: kind === 'r' ? C : 0 };
  }
  function resolveElems(igf, elems, sx, sz) {
    const notes = [];
    const raw = [{ z: num(sz, 0), r: num(sx, 0) / 2, arc: null }];
    let pend = null;
    elems.forEach(e => {
      if (!e || e.t === 'jump') return;
      if (e.t === 'cchf' || e.t === 'rchf') { pend = e; return; }
      const cur = raw[raw.length - 1];
      let nz = cur.z, nr = cur.r, arc = null;
      if (e.t === 'face') { nr = num(e.x, cur.r * 2) / 2; if (e.z !== '' && e.z != null) nz = num(e.z, cur.z); }
      else if (e.t === 'long') { nz = num(e.z, cur.z); if (e.x !== '' && e.x != null) nr = num(e.x, cur.r * 2) / 2; }
      else if (e.t === 'taper') {
        const hasX = e.x !== '' && e.x != null, hasZ = e.z !== '' && e.z != null, hasA = e.ang !== '' && e.ang != null;
        if (hasX && hasZ) { nr = num(e.x) / 2; nz = num(e.z); }
        else if (hasX && hasA) {
          const ang = num(e.ang) * Math.PI / 180, dr = num(e.x) / 2 - cur.r;
          const s = Math.sin(ang);
          nr = num(e.x) / 2;
          nz = Math.abs(s) < 1e-6 ? cur.z : cur.z + dr * Math.cos(ang) / s;
        } else { if (hasX) nr = num(e.x) / 2; if (hasZ) nz = num(e.z); }
      } else if (e.t === 'cw' || e.t === 'ccw') {
        nr = num(e.x, cur.r * 2) / 2; nz = num(e.z, cur.z);
        arc = { t: e.t === 'cw' ? 'CW' : 'CCW', r: num(e.r, 0) };
      } else return;
      if (pend && raw.length >= 2) {
        const cut = cornerCut(raw[raw.length - 2], cur, { z: nz, r: nr }, pend.t === 'rchf' ? 'r' : 'c', pend.t === 'rchf' ? pend.r : pend.c);
        if (cut) {
          raw.pop();
          raw.push({ z: cut.a.z, r: cut.a.r, arc: null });
          raw.push({ z: cut.b.z, r: cut.b.r, arc: cut.r ? { t: cut.cw ? 'CW' : 'CCW', r: cut.r } : null });
        } else notes.push(pend.t === 'rchf' ? 'Bo tròn (R-CHF) không đặt được — cạnh quá ngắn.' : 'Vát (C-CHF) không đặt được — cạnh quá ngắn.');
        pend = null;
      } else if (pend) { notes.push('Vát/bo không đứng đầu biên dạng (IGF: không nối với điểm đầu).'); pend = null; }
      raw.push({ z: nz, r: nr, arc });
    });
    if (pend) notes.push('Vát/bo cuối biên dạng chưa có đoạn kế tiếp.');
    const pts = raw.map((p, i) => ({ x: Math.round(p.r * 2 * 1000) / 1000, z: Math.round(p.z * 1000) / 1000, t: i && p.arc ? p.arc.t : 'L', r: i && p.arc ? p.arc.r : '' }));
    return { pts, notes };
  }
  function shapePreview(igf) {
    const g = igf || DEFAULT_IGF;
    const sh = resolveElems(g, g.elems || [], g.sx, g.sz);
    const pts = sh.pts.map(p => ({ x: p.x, z: toGenZ(p.z, g), t: p.t, r: p.r }));
    return { pts, notes: sh.notes, zRight: 0, blankR: num(g.od, 0) / 2, blankL: num(g.ol, 0) };
  }
  function monotonicX(pts, inner) {
    for (let i = 1; i < pts.length; i++) {
      const bad = inner ? pts[i].x > pts[i - 1].x + 1e-6 : pts[i].x < pts[i - 1].x - 1e-6;
      if (bad) return false;
    }
    return true;
  }
  function decideProcesses(igf) {
    const g = Object.assign({}, DEFAULT_IGF, igf || {});
    ensureTools(g);
    if (igf) { igf.tools = g.tools; igf.roughT = g.roughT; igf.finishT = g.finishT; igf.boreT = g.boreT; }
    const M = matOf(g);
    const sh = resolveElems(g, g.elems || [], g.sx, g.sz);
    const notes = sh.notes.slice();
    if (g.decidePattern && g.decidePattern !== 'standard') {
      notes.push('Mẫu PROCESS DECIDE đã lưu. Ứng dụng vẫn chọn G85 khi X đơn điệu và G86 khi không. Bốn sổ quy tắc IGF không được mô phỏng.');
    }
    const innerElems = Array.isArray(g.innerElems) ? g.innerElems : [];
    if (sh.pts.length < 2 && innerElems.length < 1) return { ops: [], notes: notes.concat(['Biên dạng (TURNING SHAPE) cần ít nhất một đoạn sau điểm đầu.']), preview: [] };
    let pts = sh.pts.map(p => ({ x: p.x, z: toGenZ(p.z, g), t: p.t, r: p.r }));
    const zMax = pts.length ? Math.max(...pts.map(p => p.z)) : 0;
    const shift = (zMax < -1e-6 || zMax > 1e-6) ? zMax : 0;
    if (shift) pts = pts.map(p => ({ x: p.x, z: Math.round((p.z - shift) * 1000) / 1000, t: p.t, r: p.r }));
    const faceStock = Math.max(0, Math.round((-zMax) * 1000) / 1000);
    const ops = [];
    const add = (type, patch) => { const o = newOp(type); Object.assign(o, patch); ops.push(o); };
    if (pts.length >= 2 && faceStock > 0.02) add('facing', { tool: g.roughT, vc: M.vr, feed: M.fr, ffeed: M.ff, zStock: faceStock, doc: Math.max(0.5, M.dx / 2), finish: Math.min(0.2, faceStock), xEnd: Math.min(0, pts[0].x) - 1 });
    if (g.useCenter) {
      add('drill', { tool: 5, isCenter: true, dia: num(g.tailD, 20) > 8 ? 5 : 4, zs: 3, zb: -6, rpm: 1000, feed: 0.08, peck: 0 });
      add('tailOn', { note: 'USE CENTER' });
    }
    const U = Math.round(num(M.lx, 0.2) * 2 * 1000) / 1000;
    let mode = '';
    if (pts.length >= 2) {
      mode = monotonicX(pts, false) ? 'G85' : 'G86';
      if (mode === 'G86') notes.push('Biên dạng không đơn điệu theo X — PROCESS DECIDE chọn chu trình chép hình G86 (COPYING).');
      add('od', {
        tool: g.roughT, ftool: g.finishT, mode, vc: M.vr, vcf: M.vf,
        D: M.dx, F: M.fr, U, W: M.lz, ff: M.ff, comp: true,
        startZ: Math.max(2, faceStock + 1), startX: '', useTail: !!g.useCenter, pts
      });
    }
    if (innerElems.length) {
      const inn = resolveElems(g, innerElems, g.inSx, g.inSz);
      notes.push.apply(notes, inn.notes.map(n => '[LỖ TRONG] ' + n));
      let ipts = inn.pts.map(p => ({ x: p.x, z: Math.round((toGenZ(p.z, g) - shift) * 1000) / 1000, t: p.t, r: p.r }));
      if (ipts.length >= 2) {
        const modeI = monotonicX(ipts, true) ? 'G85' : 'G86';
        if (modeI === 'G86') notes.push('Biên dạng lỗ không đơn điệu theo X — tiện trong dùng G86.');
        const bore = num(g.id, 0) > 0 ? num(g.id, 0) : Math.min.apply(null, ipts.map(p => p.x));
        add('id', {
          tool: g.boreT, ftool: g.boreT, mode: modeI, bore,
          vc: M.vr, vcf: M.vf, D: Math.max(1, M.dx * 0.8), F: M.fr, U, W: M.lz, ff: M.ff, comp: true,
          startZ: 2, startX: '', useTail: false, pts: ipts
        });
      }
    }
    const mills = Array.isArray(g.mills) ? g.mills : [];
    if (mills.length) {
      notes.push('Studio có ' + mills.length + ' phần tử phay (lỗ, rãnh, pocket, vát). Chúng được ghi chú trong chương trình; chu trình dao động lực thêm ở PROCESS EDIT.');
      const line = mills.map(m => String(m.type || 'MILL')).join(' ');
      add('raw', { code: '(STUDIO MILL ' + line + ')' });
    }
    if (g.blankId === 'thru' || g.blankId === 'blind') {
      const bore = num(g.id, 0);
      const depth = g.blankId === 'blind' ? Math.min(num(g.ol, 10), num(g.idDepth, num(g.ol, 10))) : Math.min(num(g.ol, 10), num(g.ol, 10) - 5);
      if (bore > 0) {
        if (g.useCenter) add('tailOff', { note: 'TRUOC KHOAN LO' });
        add('drill', { tool: 6, isCenter: false, dia: bore, zs: 3, zb: -Math.abs(depth), rpm: Math.round(Math.min(1500, 1000 * M.vr / Math.max(bore, 8))), feed: Math.min(0.2, M.fr), peck: Math.max(3, bore) });
        notes.push('Phôi có lỗ (BLANK ID): đã thêm khoan. Biên dạng lỗ tinh cần thêm nguyên công tiện trong (ID) nếu lỗ thành phẩm lớn hơn lỗ phôi.');
      }
    }
    if (g.useCenter && !ops.some(o => o.type === 'tailOff')) add('tailOff', { note: 'KET THUC' });
    return { ops, notes, preview: pts, faceStock, mode, mat: M };
  }

  const API = { OPS, DEFAULT_SETTINGS, newOp, compile, sampleProject, profilePoly, parseList, parsePts, asc, f, buildToolpath,
    MATERIALS, DEFAULT_IGF, igfTutorial, ensureTools, matOf, shapePreview, decideProcesses, resolveElems, toGenZ };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.OKU = API;
})(this);
