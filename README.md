# Okuma--app

Okuma LB3000EX II / OSP-P300L – lập trình CNC (PWA, offline, không backend).

Mở `index.html` qua HTTP(S) (service worker cần https hoặc localhost). Toàn bộ logic ở `gen.js` (bộ sinh mã, chạy được cả bằng Node: `node -e "const O=require('./gen.js');console.log(O.compile(O.sampleProject()).text)"`), giao diện ở `ui.js`.

Tab **IGF** và tab nguyên công dùng chung `project.ops` và `compile()` trong `gen.js`. IGF: phôi (BLANK), biên dạng (TURNING SHAPE), nguyên công sửa được (PROCESS DECIDE), mô phỏng đường dao 2D và khối 3D (`sim3d.js`, WebGL, không CDN), rồi xuất mã (PROGRAM CREATE). Xuất .MIN khi chưa mô phỏng xong sẽ hỏi lại. Xem trước cũng bật được khối 3D của thành phẩm.

Nguồn cú pháp: OSP-P500 PROGRAMMING MANUAL LE33-021-R2 (Oct 2023), IGF-L LE32-238-R1 và LE32-239-R1, Okuma Basic Programming Manual CNC Lathe (6/2005), tờ ví dụ dao động lực. Máy chủ là OSP-P300L. Mục còn nghi ngờ nằm trong tab "Tra cứu".

Trang GitHub Pages: https://thuannht78-prog.github.io/Okuma--app/

Bản một tệp (mở trực tiếp, không cần mạng): https://thuannht78-prog.github.io/Okuma--app/download/okuma-app-offline.html — gói zip: https://thuannht78-prog.github.io/Okuma--app/download/okuma-app-offline.zip. Workflow Pages chạy `node scripts/build-offline.mjs` mỗi lần đẩy lên `main`. Nút **Tải bản chạy offline** nằm trên đầu ứng dụng.

**CẢNH BÁO: phải chạy thử không phôi / mô phỏng trên máy trước khi cắt.**
