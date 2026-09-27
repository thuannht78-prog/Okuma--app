# Okuma--app

Okuma LB3000EX II / OSP-P300L – lập trình CNC (PWA, offline, không backend).

Mở `index.html` qua HTTP(S) (service worker cần https hoặc localhost). Toàn bộ logic ở `gen.js` (bộ sinh mã, chạy được cả bằng Node: `node -e "const O=require('./gen.js');console.log(O.compile(O.sampleProject()).text)"`), giao diện ở `ui.js`.

Nguồn cú pháp: sách lập trình Okuma OSP-P200L (5238-E) trên ManualsLib + ví dụ diễn đàn Practical Machinist / Autodesk post LB3000 / eMastercam (ụ động NC).
Các mục chưa xác minh được đánh dấu trong tab "Tra cứu".

Trang GitHub Pages: https://thuannht78-prog.github.io/Okuma--app/

**CẢNH BÁO: phải chạy thử không phôi / mô phỏng trên máy trước khi cắt.**
