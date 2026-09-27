# IGF Profile 3D Studio v32

Tệp gốc: `reference/IGF-Profile-3D-Studio-v32.html` (bản người dùng gửi, một file React + three.js, giao diện tiếng Việt, nền tối `#15171B`). Bản gắn vào ứng dụng Okuma là `v32/studio.html`, thêm cầu nối OSP.

## Màn hình

Một trang, không có router. Cột trái là dữ liệu, cột phải là hình. Dưới 760 px hai cột xếp dọc, phím F còn 4 cột.

- **BLANK / SETUP — PHÔI:** vật liệu (chữ tự do, mẫu S45C), OD, OL, lỗ trong ID (0 = đặc). Mặc định Ø80 × 100, ID 0.
- **START PT:** SX (đường kính) và SZ. Tab NGOÀI hoặc LỖ TRONG. Mặc định ngoài SX 0, SZ 0; lỗ trong SX 20, SZ 0. Z của mẫu đi về số âm (mặt đầu là 0).
- **Vát tự động C** và nút CHAMFER GENERATE.
- **MACHINING SECTION — BẢNG PHẦN TỬ:** NGOÀI / TRONG. Mỗi dòng có menu Sửa, Copy, Chèn, Xóa. Phần tử: F1 FACE (X), F2 TAPER (X, Z), F3 LONG (Z), F4 ARC CCW (X, Z, R), F5 ARC CW, F6 R-CHF (R), F7 C-CHF (C).
- **2D BIÊN DẠNG:** vẽ nhanh (chạm lên hình), bước kéo 0.001 / 0.01 / 0.1 / 1, hoàn tác ↶↷, gióng kích thước, xuất PDF và DXF (cung theo bán kính hoặc chuỗi điểm, độ mịn Thô–Siêu). Nhập DXF / DWG / SVG / CSV / TXT. Công tắc AI và ô khóa API Anthropic.
- **3D SẢN PHẨM:** khối đặc quay từ biên dạng. Cắt NGANG / DỌC / CẢ 2, hiện hoặc ẩn phôi, vật liệu bóng, STL, STEP, độ mịn 96–720. Nhập STL / STEP. Server CAD (OpenCASCADE) và độ mịn khi dựng lưới.
- **PHAY:** lỗ mặt đầu, lỗ ngang, rãnh, pocket mặt đầu, vát phẳng. Mỗi mục có số lượng, đường kính, vị trí, và Ø dao phay. Đây là hình 3D (boolean), không phải bảng dao T của IGF.
- Ghi chú khi xuất bản vẽ: làm sạch ba-via, R góc pocket = bán kính dao.

Không có `localStorage`. Không xuất chương trình NC. Xuất DXF (`igf_profile.dxf`), PDF (`igf_drawing.pdf`), STL (`igf_part.stl`), STEP (`igf_part.step`). Nút JSON trên bản đã gắn cầu nối là định dạng trao đổi mới `{v:32, blank, start, elements, inStart, inElements, mills, side}`.

## Cách gắn vào Okuma

Studio chạy trong iframe ở bước **Biên dạng tiện (TURNING SHAPE)**. Ứng dụng Okuma đẩy biên dạng hiện tại vào Studio khi iframe mở. Nút **ĐƯA VÀO OSP**, nút Lấy biên dạng, và lúc rời bước (nếu Studio đã đổi so với bản vừa đẩy) gửi hồ sơ về `project.igf`. Bản vừa đẩy mà không sửa thì không ghi đè — TEST1 giữ JUMP và góc côn.

- OD, OL, vật liệu nếu trùng bảng S45C / SCM440 / SUS304 / AL / FC250, ID phôi
- NGOÀI → `elems`, điểm đầu SX/SZ
- LỖ TRONG → `innerElems`, `inSx` / `inSz`
- Nếu Z lớn nhất ≤ 0 và có Z âm (quy ước mặt đầu = 0 của Studio), mốc Z chuyển sang mặt phải để `toGenZ` giữ nguyên số Z
- Phay lưu ở `igf.mills`

PROCESS DECIDE dùng cùng `decideProcesses`: tiện ngoài G85/G86 từ biên dạng ngoài, tiện trong từ biên dạng lỗ, rồi PROCESS EDIT, PROCESS TEST và PROGRAM CREATE như các setup khác. Một mô hình, một `compile()`.

Chọn iframe thay vì viết lại Studio: file gốc khoảng 830 KB (React, three.js, vẽ 2D, khối 3D, cắt, phay, DXF/PDF/STL/STEP). Viết lại sẽ mất đúng giao diện người dùng đang dùng. Cầu `postMessage` (`source: "okuma"` / `source: "igf32"`) không cần đụng bộ nhớ trong của React ngoài một nút và `window.__igf32`.

Bản offline một tệp nhét Studio vào blob URL của iframe, nên vẫn mở được khi không có `v32/studio.html` bên cạnh.

## Phần không đưa vào mã OSP

| Phần Studio | Lý do |
| --- | --- |
| AI, khóa API, server CAD | Cần mạng và khóa; không tham gia biên dạng đã nhập |
| STL / STEP dạng lưới | Không phải nét tiện FACE/LONG/TAPER |
| DXF, PDF, STL, STEP | Vẫn xuất trong Studio. Mã máy là `.MIN` của Okuma |
| Phay (lỗ mặt, lỗ ngang, rãnh, pocket, vát) | Hồ sơ là hình boolean 3D, không đủ tham số chu trình G181/G73. PROCESS DECIDE ghi một dòng chú thích `(STUDIO MILL …)`. Thêm dao động lực ở PROCESS EDIT |
| Bảng dao T1/T2 của IGF | Studio không có trang TOOL DATA. Bước Bảng dao của quy trình IGF-L giữ vai trò đó |
| Nền tối cho cả ứng dụng Okuma | Studio giữ nền tối. Các bước quản lý setup, kiểm tra và xuất mã giữ giao diện hiện tại để không đổi mô phỏng và lời nhắc chạy thử |
