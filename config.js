// ===== Cấu hình dự án – chỉ sửa file này =====
// Mã kết nối Firebase (lấy ở Firebase > Cài đặt dự án > Ứng dụng của bạn)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDORhNDHUSlLh0sYl9zWnro6V5mIual-RU",
  authDomain: "theo-doi-thi-cong.firebaseapp.com",
  projectId: "theo-doi-thi-cong",
  storageBucket: "theo-doi-thi-cong.firebasestorage.app",
  messagingSenderId: "83184908639",
  appId: "1:83184908639:web:5fc28a7b544786640a9eea",
};

// Gmail quản trị cao nhất (toàn quyền). Viết chữ thường.
// Phải trùng với danh sách trong quy tắc Firestore (firestore.rules).
export const OWNERS = ["danglongxdbmt@gmail.com"];
