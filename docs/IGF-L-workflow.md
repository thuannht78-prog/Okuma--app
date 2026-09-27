# Quy trình IGF-L mà ứng dụng bám theo

Nguồn:

- **LE32-239-R1** (May 2023), *ADVANCED ONE-TOUCH IGF-L Operation Manual BASIC/TUTORIAL*. Mục 3 là trình tự chuẩn, ví dụ TEST1 (S45C, phôi Ø100×82).
- **LE32-238-R1** (8/2023), *Operation REFERENCE Manual*. Đây là nguồn tên ô, đơn vị và giá trị mặc định.

Máy đích của ứng dụng vẫn là **LB3000EX II / OSP-P300L**. Một mô hình dữ liệu (`project.igf` + `project.ops`) và một `compile()` trong `gen.js`. Quản lý setup, mô phỏng 2D/3D, popup Hỗ trợ và xuất `.MIN` giữ nguyên.

Trình tự trong tệp PET theo mục 3 của LE32-239 (sửa nguyên công rồi mới kiểm tra). Mục lục đầu sách có chỗ ghi PROCESS TEST trước PROCESS EDIT; ứng dụng đi theo bài thực hành.

Tệp PET (NEW FILE / EDIT / COPY / RENAME / DELETE, LE32-239 P-14–16) là màn **Quản lý setup**, không phải một bước trong stepper.

## Thứ tự bước

| # | Tên IGF | Nhãn ứng dụng | Sách |
| --- | --- | --- | --- |
| — | File operation | Quản lý setup | LE32-239 P-14–16 |
| 1 | BLANK/SETUP | Phôi và đồ gá | LE32-239 P-17–19; LE32-238 P-84–95 |
| 2 | TOOL DATA | Bảng dao | LE32-239 P-13 (đăng ký trên NC trước khi lập trình) |
| 3 | TURNING SHAPE | Biên dạng tiện | LE32-239 P-20–38; LE32-238 P-96 |
| 4 | PROCESS DECIDE | Quyết định | LE32-239 P-39–44; LE32-238 P-170 |
| 5 | PROCESS EDIT | Sửa nguyên công | LE32-239 P-45–46; LE32-238 P-210 |
| 6 | PROCESS TEST | Kiểm tra | LE32-239 P-47–48; LE32-238 P-201 |
| 7 | PROGRAM CREATE | Tạo chương trình | LE32-239 P-49–50; LE32-238 P-299 |

Setup cũ (stepper 6 bước) được chuyển số bước khi mở: máy+phôi gộp về bước 1, biên dạng giữ bước 3, danh sách nguyên công sang bước 5, mô phỏng sang bước 6, xuất mã sang bước 7. Cờ `igf.flowV = 2` ngăn chuyển lần hai.

## Bước 1 — BLANK/SETUP

Một màn, ba tờ (BLANK, 1 SPINDLE, CENTER), đúng LE32-238 mục 6-1.

**BLANK** (P-85–87). Ví dụ TEST1 trong ngoặc.

| Ô | Ý nghĩa | Đơn vị / lựa chọn | Mặc định ứng dụng |
| --- | --- | --- | --- |
| MATERIAL | Vật liệu, lấy từ bảng MATERIAL DATA (LE32-238 P-10) | S45C, SCM440, SUS304, AL, FC250 | S45C |
| SHAPE | Hình phôi | ROUND BAR, FREE (ARBITRARY), UNIFORM STOCK (AVERAGE BLANK) | ROUND BAR |
| OD / OUTSIDE DIA. OD | Đường kính ngoài | mm, theo đường kính | 100 (TEST1) |
| LENGTH / OUTSIDE LENG. OL | Chiều dài phôi | mm | 82 (TEST1) |
| BLANK ID / INSIDE DIA. | Lỗ sẵn | NO INSIDE, ID THRU, ID BLIND | NO INSIDE |
| ID | Đường kính lỗ (khi có lỗ) | mm, đường kính | 0 |
| ID DEPTH | Sâu lỗ kín | mm | 0 |
| STCK RMV H | Dư đều khi UNIFORM STOCK (P-88) | mm | 1 |
| CORNER R | Bo góc phôi đều (P-88) | mm | 0 |
| ZERO POINT REFERENCE / BASE SURFACE | Mặt chuẩn Z=0 khi nhập hình | LEFT FACE (LEFT END) hoặc RIGHT FACE | LEFT FACE |
| ZERO POINT POSITION / ORIGIN POS. | Khoảng từ mặt chuẩn tới gốc | mm | 0 |
| SPINDLE MAX SPEED | G50 S trong chương trình. Máy lấy mặc định từ tham số nguyên No.1 | vòng/phút | 2500 |

Z xuất ra chương trình lấy mặt phải phôi làm Z0, Z âm về phía mâm.

**1 SPINDLE** (P-91). TEST1: OUTSIDE, L2 = 20, D3 = 75.

| Ô | Khi hiện |
| --- | --- |
| ID/OD GRIP CHG. | OUTSIDE hoặc INSIDE |
| JAW SIZE L1, D1 | luôn |
| JAW SIZE (Z DIR.) L2, D2 | luôn |
| L3 | chỉ khi INSIDE |
| D3 | chỉ khi OUTSIDE |
| CHUCKING DIA. CX | luôn |

**CENTER** (P-92).

| Ô | Ghi chú |
| --- | --- |
| USE CENTER | USE / NOT USE |
| CENTER LENGTH L, DIAMETER D | kích thước mũi tâm |
| LENGTH L1, DIAMETER D1, LENGTH L2, DIAMETER D2 | thân tâm |
| CENTER HOLE DIA. D3 | lỗ tâm |
| Tailstock position Z | vị trí ụ |

L2, D2 và D3 lỗ tâm trên máy mặc định từ tham số kích thước No.9–11. Ứng dụng để 0 cho đến khi nhập.

Tiến/lùi ụ (TS ADVANCE / TS RETRACT, M56/M55) là nguyên công, LE32-238 mục 22 P-368, không nằm trên tờ CENTER.

**Khối “Máy OSP”** (điểm thay dao, tưới nguội, ụ nòng thủy lực hay ụ NC, hành trình) không có trên màn IGF. Giữ trong `<details>` để mã OSP-P300L và mô phỏng không mất dữ liệu cũ.

## Bước 2 — TOOL DATA

LE32-239 P-13, đăng ký ở chế độ NC tool data, mục “For One Touch IGF Advance” (T No., Offset No., nhóm bù, trục giám sát).

Ví dụ sách:

| | TOOL TYPE | TOOL ANGLE | EDGE ANGLE | PROCESS KIND | T No. | OFFSET No. |
| --- | --- | --- | --- | --- | --- | --- |
| Dao 1 | Single | 80 | 5 | ROUGH OD, ROUGH FACE | 1 | 1 |
| Dao 2 | Single | 55 | 3 | FINISH OD, FINISH FACE | 2 | 2 |

Số T của dao ROUGH OD và FINISH OD ghi vào `roughT` / `finishT` để PROCESS DECIDE dùng. Setup cũ không có `tools[]` thì tạo hai dao này từ `roughT` / `finishT` đang lưu.

## Bước 3 — TURNING SHAPE

Điểm đầu START PT. SX, SZ (TEST1: 0 và 80), DEF. DIR. CCW hoặc CW, rồi từng phần tử: FACE, TAPER, LONG, C-CHF, R-CHF, cung CW/CCW, JUMP.

TEST1 (LE32-239 P-20–34): FACE X60, C-CHF C1, LONG Z55, TAPER X70 góc 165, LONG Z25, R-CHF R5, FACE X100, JUMP (phím E trên máy chép điểm đầu 0, 80).

CHAMFERING và CHF TYPE (C hoặc R) là vát ren tự động. 0 nghĩa là không vát; mặc định máy lấy từ tham số kích thước No.13.

Vát và bo đứng giữa hai đoạn thẳng. Ứng dụng tính lại điểm nếu cạnh đủ dài.

## Bước 4 — PROCESS DECIDE

F6 PROCESS DECIDE, chọn PATTERN, F7 EXECUTE. Thông báo PROCESS DECIDE FINISHED.

Bốn mẫu (LE32-239 P-41):

- Standard
- LONG CUTTING PRIORITY
- FACE CUTTING PRIORITY
- ROUGH: STANDARD / FINISH: LONG CUTTING PRIORITY

Bốn sổ quy tắc (P-40–41): PRIORITY TOOL DATA, FACE/LONG JUDGEMENT DATA, INSIDE MACH. DATA, SHAPE OUTPUT/TOOL TURNING POSITION DATA.

Chế độ cắt lấy từ MATERIAL DATA (LE32-238 P-10): VR, FR, DX, LX, LZ, VF, FF. Bảng trong ứng dụng là giá trị điển hình cho S45C, SCM440, SUS304, AL, FC250; sửa được trên bước này và đưa vào nguyên công khi EXECUTE.

Lần đầu vào bước, nếu đã có biên dạng mà chưa có nguyên công, ứng dụng tự EXECUTE.

## Bước 5 — PROCESS EDIT

F5 SHEET EDIT: chèn, xóa, đảo, sao chép. Sửa từng nguyên công (hình, chế độ cắt, hoặc mã NC). Nguyên công thêm tay (dừng, mã thô, dao động lực) nằm ở đây. EXECUTE lại sẽ ghi đè danh sách.

## Bước 6 — PROCESS TEST

F6 PROCESS TEST, F1 START, chạy hết, F8 QUIT. Ứng dụng dùng mô phỏng 2D/3D hiện có (cùng đường dao, màu, va chạm ước lượng). Một dòng nhắc chạy thử không phôi nằm trên bước này.

## Bước 7 — PROGRAM CREATE

| Ô | Giới hạn | Ví dụ sách | Ứng dụng |
| --- | --- | --- | --- |
| FILE NAME | 16 ký tự chữ và số | TEST1 | lưu `fileName`; TEST1 để trống thì lấy tên chương trình |
| DDT FILE | YES / NO | YES | lưu cờ, không ghi tệp DDT |
| PROGRAM NAME | chữ O + tối đa 8 ký tự | O1234 | setup TEST1 giữ TEST1 → tệp `$TEST1.MIN%` / `OTEST1` |

Xuất `.MIN` sau khi mô phỏng. Chưa chạy hết thì hỏi lại. Một dòng nhắc dry run nằm trên bước này.

## Phần làm đủ và phần giản

**Làm theo sách, trong phạm vi một điện thoại và OSP-P300L**

- Đúng tên và thứ tự bảy bước, cộng màn quản lý tệp.
- Cùng nhóm ô BLANK / 1 SPINDLE / CENTER, cùng mặc định TEST1.
- Biên dạng từng phần tử, kể cả vát và bo giữa hai đoạn.
- EXECUTE tạo nguyên công từ vật liệu và số T của dao thô/tinh.
- Sửa, thêm, xóa nguyên công; mô phỏng; xuất `.MIN`.
- Setup cũ vẫn mở: Ø, chiều dài, vật liệu, G50, chấu L2/D3, ụ được copy sang cấu trúc mới.

**Giản hoặc chưa làm, và vì sao**

| Phần sách | Cách ứng dụng xử lý | Lý do |
| --- | --- | --- |
| FREE SHAPE vẽ phôi từng đoạn (P-90) | Lưu lựa chọn; mô phỏng vẫn dùng thanh tròn OD × LENGTH | Biên dạng phôi tự do là một trình vẽ thứ hai; điện thoại đã có trình vẽ thành phẩm |
| UNIFORM STOCK, F6 AVE. BLANK GENERATE (P-88) | Lưu STCK RMV H và CORNER R; không tạo lại phôi từ hình tinh | Luật “không phủ vùng không gia công / JUMP” cần hình phôi riêng |
| CHAMFERING tự chèn vát ren | Lưu C hoặc R; không chèn vào nét | Vát ren gắn với nguyên công ren, không phải mọi nét TEST1 |
| Bốn mẫu PATTERN và bốn sổ quy tắc | Lưu mẫu. Luật quyết định vẫn là: X đơn điệu → G85, không đơn điệu → G86 | Sổ quy tắc là bảng tham số máy, không có trong hai PDF ở mức đủ để tái lập từng nhánh |
| CHUCKING ERROR, UNMACHINED ERROR (P-42–44) | Không kiểm hình học kẹp hay vùng chưa cắt | Cần góc mũi dao thật và giao hình chấu với nét; mô phỏng hiện chỉ cảnh báo va chạm đơn giản |
| L1, D1, D2, CX và các kích thước tâm ngoài DIAMETER D | Có ô, có lưu. Va chạm dùng L2, D3 và DIAMETER D | Mô phỏng 2D/3D chỉ có một hình chấu chữ nhật và một đường kính mũi tâm |
| DDT FILE | Lưu YES/NO, không xuất tệp | Ứng dụng xuất một `.MIN` cho OSP-P300L |
| Tên chương trình ví dụ O1234 | TEST1 vẫn là OTEST1 | Đổi sẽ làm gãy tệp mẫu và bài kiểm đã khóa `$TEST1.MIN%` |
| Nhiều vùng gia công, trục Y, xoắn, trục phụ, cấp phôi, giá đỡ, đo | Không phải bước IGF riêng | Một số nguyên công dao động lực vẫn thêm tay ở PROCESS EDIT |
| EXPAND SETTINGS (gốc lập trình khác gốc hình, mặt chấu, khoảng hở phôi, P-93–95) và đọc DDT (P-95) | Không có màn | Ít dùng; gốc chương trình của ứng dụng cố định ở mặt phải phôi |

Mô phỏng vẫn là ước lượng hình học (lưới khoảng 1,2 mm dọc trục và 0,75 mm hướng kính, ren là nét xoắn, lỗ khoan chỉ một phần, rãnh/hốc vẽ chứ không trừ khối). Không thay chạy thử không phôi trên máy.
