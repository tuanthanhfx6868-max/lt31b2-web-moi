# Trang web Trung đội B2 CSGT LT31

Đây là mã nguồn đầy đủ của trang web trung đội, đã chuyển sang dùng **Firebase** để lưu dữ liệu dùng chung
(thay cho `window.storage` chỉ chạy được bên trong Claude). Làm theo 3 bước dưới đây là có một trang web
thật, ai cũng vào được bằng một đường link.

Không cần biết lập trình — chỉ cần làm đúng theo từng bước, copy/paste là chạy.

---

## Bước 1 — Tạo project Firebase (lưu dữ liệu dùng chung)

1. Vào **https://console.firebase.google.com** → đăng nhập bằng tài khoản Google.
2. Bấm **"Add project" / "Tạo dự án"** → đặt tên (VD: `lt31b2`) → bấm tiếp cho đến khi tạo xong.
3. Trong project vừa tạo, ở menu bên trái chọn **Build → Firestore Database** → bấm **"Create database"**.
   - Chọn **"Start in test mode"** (chế độ thử nghiệm — cho phép đọc/ghi tự do trong 30 ngày).
   - Chọn khu vực gần nhất (VD: `asia-southeast1`) → **Enable**.
4. Sau khi tạo xong Firestore, vào **Project settings** (biểu tượng bánh răng ở góc trên bên trái) →
   cuộn xuống mục **"Your apps"** → bấm biểu tượng **`</>`** (Web) để đăng ký một ứng dụng web.
   - Đặt tên tuỳ ý (VD: `lt31b2-web`) → **Register app**.
   - Firebase sẽ hiện ra một đoạn mã `firebaseConfig` như sau — **copy toàn bộ đoạn này lại**:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "lt31b2-xxxxx.firebaseapp.com",
  projectId: "lt31b2-xxxxx",
  storageBucket: "lt31b2-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

5. Mở file `.env.example` trong dự án này, đổi tên thành `.env`, rồi điền các giá trị tương ứng:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=lt31b2-xxxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=lt31b2-xxxxx
VITE_FIREBASE_STORAGE_BUCKET=lt31b2-xxxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef123456
```

### ⚠️ Quan trọng — giới hạn quyền truy cập Firestore

"Test mode" cho phép **bất kỳ ai có link Firebase** đọc/ghi dữ liệu, không chỉ người vào trang web của bạn.
Sau khi mọi thứ chạy ổn, vào **Firestore Database → Rules** và dán quy tắc sau để giới hạn đúng 1 collection
mà trang web dùng (vẫn không cần đăng nhập Firebase, nhưng thu hẹp phạm vi hơn "test mode" mặc định):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /lt31b2/{docId} {
      allow read, write: if true;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Vì trang không dùng tài khoản Firebase Auth (chỉ dùng mật khẩu chung nội bộ), lớp học nên **giữ đường link
trang web không public tràn lan** (chỉ chia sẻ trong nhóm) để tránh người ngoài đoán được project và chỉnh sửa dữ liệu.

---

## Bước 1b — Bật tính năng tải ảnh/tệp trực tiếp từ máy (Cloudinary, miễn phí, không cần thẻ)

Mặc định, các mục Lịch học / Lịch trực / Tài liệu chỉ nhận **link có sẵn** (dán link Google Drive...).
Làm theo bước dưới đây để có thêm nút **"Tải ảnh / tệp từ máy"** — bấm là chọn ảnh/file ngay trên điện thoại,
không cần tự đi tìm link.

Dùng **Cloudinary** vì gói miễn phí không yêu cầu thẻ tín dụng (khác với Firebase Storage, dịch vụ này từ 2025
bắt buộc phải có thẻ liên kết dù không mất phí).

1. Vào **cloudinary.com** → **Sign up** (đăng ký bằng Google/GitHub/email đều được, không cần thẻ).
2. Sau khi đăng nhập, vào **Dashboard** (trang chính) → copy giá trị **"Cloud name"** hiện ngay trên đầu trang.
3. Vào **Settings (biểu tượng bánh răng) → Upload** → cuộn xuống mục **"Upload presets"** → **"Add upload preset"**.
   - Đặt **Signing Mode = Unsigned** (rất quan trọng — để trang web tải file lên thẳng mà không cần mật khẩu bí mật).
   - Đặt tên preset tuỳ ý (VD: `lt31b2_uploads`) → **Save**.
4. Mở file `.env` (đã tạo ở Bước 2) → điền thêm 2 dòng cuối:

```
VITE_CLOUDINARY_CLOUD_NAME=ten-cloud-cua-ban
VITE_CLOUDINARY_UPLOAD_PRESET=lt31b2_uploads
```

5. Nếu deploy trên Vercel, nhớ thêm luôn 2 biến này vào **Environment Variables** ở Bước 5 (mục Deploy).

Gói miễn phí của Cloudinary cho **25 credit/tháng** (đủ dùng cho khoảng vài trăm ảnh/tài liệu mỗi tháng —
dư sức cho quy mô một trung đội). Nếu chưa cấu hình bước này, trang vẫn hoạt động bình thường, chỉ là nút
"Tải ảnh/tệp từ máy" sẽ báo lỗi — mọi người vẫn dùng được cách dán link cũ.

---

## Bước 2 — Chạy thử ở máy tính (không bắt buộc, nhưng nên làm)

Cần cài **Node.js** (bản LTS) từ https://nodejs.org nếu máy chưa có.

```bash
npm install
npm run dev
```

Mở đường link hiện ra (thường là `http://localhost:5173`) để xem trang chạy đúng với Firebase chưa.

---

## Bước 3 — Đưa lên mạng bằng Vercel (miễn phí)

1. Tạo tài khoản GitHub (nếu chưa có) tại https://github.com, tạo một **repository** mới (VD: `lt31b2-web`).
2. Đẩy toàn bộ thư mục này lên repository đó (dùng GitHub Desktop nếu không quen dùng dòng lệnh git).
3. Vào **https://vercel.com** → đăng nhập bằng GitHub → **"Add New Project"** → chọn repository vừa tạo.
4. Ở bước cấu hình, Vercel sẽ tự nhận diện đây là dự án **Vite** — không cần chỉnh gì thêm.
5. Bấm vào mục **"Environment Variables"** và điền đúng 6 biến giống hệt trong file `.env` của bạn
   (đây là bước quan trọng nhất — nếu quên, trang sẽ không kết nối được Firebase):
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_CLOUDINARY_CLOUD_NAME` (nếu đã làm Bước 1b)
   - `VITE_CLOUDINARY_UPLOAD_PRESET` (nếu đã làm Bước 1b)
6. Bấm **Deploy**. Sau khoảng 1 phút, Vercel sẽ đưa ra một đường link dạng `lt31b2-web.vercel.app`.

Gửi đường link này cho cả trung đội — ai cũng vào được bằng điện thoại hoặc máy tính, đăng nhập bằng
mật khẩu chung như bình thường.

Mỗi lần bạn sửa code và đẩy lên GitHub, Vercel sẽ **tự động deploy lại** bản mới, không cần làm lại từ đầu.

---

## Đổi mật khẩu chung / mật khẩu quản trị

Mở file `src/App.jsx`, tìm 2 dòng gần đầu file:

```js
const UNIT_PASSWORD = "LT31B2";
const ADMIN_PASSWORD = "LT31ADMIN";
```

Sửa thành mật khẩu bạn muốn, lưu lại, đẩy lên GitHub — Vercel sẽ tự cập nhật.

---

## Những gì đã thay đổi so với bản chạy trong Claude

- `window.storage` (chỉ hoạt động trong môi trường Claude Artifacts) đã được thay bằng **Firestore**,
  dùng `onSnapshot` để đồng bộ theo thời gian thực: một người thêm/sửa/xoá, người khác thấy ngay lập tức
  mà không cần tải lại trang — còn tốt hơn bản gốc.
- Toàn bộ giao diện, tính năng, phân quyền (quản trị / cán bộ / thành viên) giữ nguyên 100%.
- Mục **Sao lưu & khôi phục dữ liệu** trong tab Phân quyền vẫn hoạt động bình thường, chỉ đổi nguồn dữ liệu
  sang Firestore.

---

## Cần thêm tên miền riêng (VD: `trungdoib2.vn`)?

Vercel cho gắn tên miền riêng miễn phí (chỉ tốn tiền mua tên miền, khoảng 200-300 nghìn/năm tuỳ nhà cung cấp).
Vào **Project → Settings → Domains** trong Vercel để thêm, có hướng dẫn trỏ DNS chi tiết ngay trên đó.
