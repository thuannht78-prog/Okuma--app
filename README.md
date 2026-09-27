# Okuma--app

Okuma LB3000EX II / OSP-P300L – lập trình CNC (PWA, offline, không backend).

Mở `index.html` qua HTTP(S) (service worker cần https hoặc localhost). Toàn bộ logic ở `gen.js` (bộ sinh mã, chạy được cả bằng Node: `node -e "const O=require('./gen.js');console.log(O.compile(O.sampleProject()).text)"`), giao diện ở `ui.js`.

Tab **IGF** làm theo Advanced One-Touch IGF-L: phôi (BLANK/SETUP), biên dạng (TURNING SHAPE), quyết định nguyên công (PROCESS DECIDE), rồi tạo chương trình (PROGRAM CREATE).

Nguồn cú pháp đã đối chiếu: IGF-L OSP-P500L LE32-238-R1 (8/2023) và LE32-239-R1 (5/2023), Okuma Basic Programming Manual CNC Lathe (6/2005), tờ ví dụ dao động lực. Các mục chưa xác minh nằm trong tab "Tra cứu".

Trang GitHub Pages: https://thuannht78-prog.github.io/Okuma--app/

**CẢNH BÁO: phải chạy thử không phôi / mô phỏng trên máy trước khi cắt.**
