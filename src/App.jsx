import React, { useState, useEffect, useCallback, useId, useRef } from "react";
import { Shield, Users, CalendarDays, FolderOpen, Award, Wallet, MessageSquare, LogOut, Pin, Plus, Trash2, Star, ChevronRight, Loader2, X, DoorOpen, ClipboardCheck, CheckCircle2, Circle, Paperclip, MapPin, Image as ImageIcon, Menu, Heart, KeyRound, Pencil, Search, Lock, Unlock, Eye, EyeOff, Upload, FileSpreadsheet, Download } from "lucide-react";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import crest from "./assets/crest.png";

/* ============ THEME =============
   Nền hồ sơ giấy cũ, xanh cảnh phục, vàng CSGT, đỏ hiệu lệnh, vàng sao.
   Display: Oswald (nhãn, tiêu đề, kiểu bảng công vụ)
   Body: Be Vietnam Pro (đọc tiếng Việt tốt)
   Mono: Roboto Mono (số hiệu, ngày tháng, mã số)
*/
const T = {
  paper: "#EDE6D6",
  paperDark: "#E2D9C4",
  green: "#1F3328",
  greenDark: "#131F19",
  amber: "#E3A73E",
  amberDark: "#B9822A",
  red: "#A02334",
  gold: "#C9A227",
  ink: "#20241F",
  inkSoft: "#5B5F52",
  selectBg: "#DCEAFC",
  selectBorder: "#2F6FBF",
};

// Trộn thêm hiệu ứng tô xanh nước biển khi dòng đang được chọn (dùng chung cho mọi danh sách)
function withSelect(style, selected) {
  return selected
    ? { ...style, background: T.selectBg, boxShadow: `inset 0 0 0 2px ${T.selectBorder}` }
    : style;
}

const UNIT_PASSWORD_DEFAULT = "LT31B2"; // Mật khẩu chung mặc định — có thể đổi ngay trên web ở mục "Đổi mật khẩu"
const ADMIN_PASSWORD_DEFAULT = "LT31ADMIN"; // Mật khẩu quản trị mặc định — có thể đổi ngay trên web ở mục "Đổi mật khẩu"

/* ============ PHÂN QUYỀN ============
   admin      : đăng nhập bằng ADMIN_PASSWORD — toàn quyền, kể cả gán quyền cho người khác
   can_bo     : được quản trị gán — toàn quyền xoá/sửa nội dung, trừ việc gán quyền
   thanh_vien : mặc định — chỉ được thêm nội dung và xoá nội dung do chính mình đăng
*/
const normalizeName = (n) => (n || "").trim().toLowerCase();

// Tải file thật sự về máy (giống Zalo/Messenger) thay vì chỉ mở tab mới xem ảnh.
// Cách đáng tin cậy nhất với ảnh lưu trên Cloudinary: chèn cờ `fl_attachment` vào URL để chính
// Cloudinary trả file kèm header Content-Disposition: attachment — trình duyệt (kể cả điện thoại)
// sẽ tải file thật về máy/thư viện ảnh. Bấm phải thực hiện NGAY lúc người dùng bấm (không chờ fetch xong)
// để điện thoại không chặn vì mất "cử chỉ người dùng". Với file không phải Cloudinary thì tải qua blob.
function forceDownload(url, filename) {
  if (!url) return;
  const cloudinaryMatch = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video|raw)\/upload\/)(.*)$/);
  if (cloudinaryMatch) {
    const dlUrl = `${cloudinaryMatch[1]}fl_attachment/${cloudinaryMatch[2]}`;
    const a = document.createElement("a");
    a.href = dlUrl;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  fetch(url, { mode: "cors" })
    .then((res) => { if (!res.ok) throw new Error("fetch failed"); return res.blob(); })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename || url.split("/").pop().split("?")[0] || "tai-ve";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
    })
    .catch(() => window.open(url, "_blank"));
}

// Kiểm tra một cái tên có phải Trung đội trưởng / Trung đội phó theo danh sách quân số hay không.
// Dùng chung cho việc phân quyền (useRole) và việc xác thực mật khẩu riêng khi đăng nhập (LoginGate).
function isCommandRoleForName(name, rosterItems) {
  const rosterMatch = (rosterItems || []).find((m) => normalizeName(m.name) === normalizeName(name));
  return Boolean(rosterMatch && (hasRole(rosterMatch.role, "Trung đội trưởng") || hasRole(rosterMatch.role, "Trung đội phó")));
}

// Kiểm tra một cái tên có phải Trung đội trưởng/phó HOẶC Tiểu đội trưởng/phó hay không —
// dùng riêng để cấp quyền vào "Phòng trò chuyện chỉ huy" (rộng hơn isCommandRoleForName ở trên).
function isSquadCommandRoleForName(name, rosterItems) {
  const rosterMatch = (rosterItems || []).find((m) => normalizeName(m.name) === normalizeName(name));
  const COMMAND_CHAT_ROLES = ["Trung đội trưởng", "Trung đội phó", "Tiểu đội trưởng", "Tiểu đội phó"];
  return Boolean(rosterMatch && COMMAND_CHAT_ROLES.some((r) => hasRole(rosterMatch.role, r)));
}

const FONT_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Be+Vietnam+Pro:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;600&display=swap');
.f-display { font-family: 'Oswald', sans-serif; letter-spacing: 0.02em; }
.f-body { font-family: 'Be Vietnam Pro', sans-serif; }
.f-mono { font-family: 'Roboto Mono', monospace; }
.paper-tex {
  background-color: ${T.paper};
  background-image:
    radial-gradient(${T.paperDark} 0.6px, transparent 0.6px);
  background-size: 14px 14px;
}
.stamp-border { border: 1.5px solid ${T.gold}; }
.scrollbar-thin::-webkit-scrollbar { width: 6px; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: ${T.green}; border-radius: 4px; }

/* ---- Nâng cấp giao diện ---- */
.card-sheet {
  box-shadow: 0 2px 6px rgba(19,31,25,0.08), 0 14px 30px -14px rgba(19,31,25,0.22);
}
.card-item {
  box-shadow: 0 1px 2px rgba(19,31,25,0.05), 0 5px 14px -6px rgba(19,31,25,0.14);
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}
.card-item:hover {
  box-shadow: 0 2px 4px rgba(19,31,25,0.07), 0 8px 18px -6px rgba(19,31,25,0.18);
}
.input-plain:focus {
  box-shadow: 0 0 0 3px rgba(227,167,62,0.35);
  border-color: ${T.green};
}
.btn-press { transition: filter 0.15s ease, transform 0.1s ease; }
.btn-press:hover { filter: brightness(1.08); }
.btn-press:active { transform: translateY(1px); }
.nav-item { transition: background-color 0.15s ease, border-color 0.15s ease; position: relative; }
/* Kẻ đường phân cách cho mọi bảng trong web — áp class "table-lines" vào thẻ <table> */
.table-lines { border-collapse: collapse; }
.table-lines th, .table-lines td { border-bottom: 1px solid #E2D9C4; }
.table-lines thead tr { border-bottom: 2px solid #C9A227; }
.table-lines tbody tr:last-child td { border-bottom: none; }
/* Kẻ bảng đầy đủ (cả dòng lẫn cột) — dùng cho Danh sách trực */
.table-grid th, .table-grid td { border-right: 1px solid #E2D9C4; }
.table-grid th:last-child, .table-grid td:last-child { border-right: none; }
.table-grid thead th { border-right: 1px solid rgba(237,230,214,0.35); }
.table-grid thead th:last-child { border-right: none; }
.nav-item:hover:not(.nav-item-active) { background: rgba(255,255,255,0.06) !important; }
.icon-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 999px; flex-shrink: 0;
}
.icon-badge-sm { width: 21px; height: 21px; }
:focus-visible { outline: 2px solid ${T.amber}; outline-offset: 2px; }
.drawer-backdrop { transition: opacity 0.25s ease; }
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; }
}
`;

/* ============ EMBLEM (huy hiệu Trường Đại học Cảnh sát nhân dân) ============ */
function Emblem({ size = 56, ring = false }) {
  const img = (
    <img
      src={crest}
      alt="Huy hiệu Trường Đại học Cảnh sát nhân dân"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain", display: "block" }}
    />
  );
  if (!ring) return img;
  const pad = Math.round(size * 0.16);
  return (
    <div
      style={{
        width: size + pad * 2,
        height: size + pad * 2,
        borderRadius: "999px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: T.greenDark,
        border: `1px solid ${T.gold}`,
        boxShadow: "0 2px 6px rgba(0,0,0,0.35), inset 0 0 0 3px rgba(227,167,62,0.12)",
      }}
    >
      {img}
    </div>
  );
}

/* ============ SEAL (con dấu tròn trang trí — điểm nhấn thị giác) ============ */
function Seal({ size = 130, opacity = 1 }) {
  const rid = useId().replace(/[:]/g, "");
  const label = "TRUNG ĐỘI B2 · CSGT · LT31 · ĐẠI HỌC CẢNH SÁT NHÂN DÂN · ";
  return (
    <div style={{ position: "relative", width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 200 200" width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <path id={`sealpath-${rid}`} d="M 100,100 m -80,0 a 80,80 0 1,1 160,0 a 80,80 0 1,1 -160,0" />
        </defs>
        <circle cx="100" cy="100" r="94" fill="none" stroke={T.red} strokeWidth="1.2" opacity={opacity} />
        <circle cx="100" cy="100" r="63" fill="none" stroke={T.red} strokeWidth="1" opacity={opacity} />
        <text fontSize="10.5" fill={T.red} letterSpacing="1.5" opacity={opacity}>
          <textPath href={`#sealpath-${rid}`} startOffset="0%">{label}</textPath>
        </text>
      </svg>
      <img
        src={crest}
        alt=""
        style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: size * 0.46, height: "auto",
          opacity,
        }}
      />
    </div>
  );
}

/* ============ CORNER MARKS (góc chỉ dẫn kiểu hồ sơ công vụ) ============ */
function CornerMarks({ inset = 10, length = 18, color }) {
  const c = color || T.gold;
  const base = { position: "absolute", width: length, height: length, borderColor: c };
  return (
    <>
      <span style={{ ...base, top: inset, left: inset, borderTop: `2px solid ${c}`, borderLeft: `2px solid ${c}` }} />
      <span style={{ ...base, top: inset, right: inset, borderTop: `2px solid ${c}`, borderRight: `2px solid ${c}` }} />
      <span style={{ ...base, bottom: inset, left: inset, borderBottom: `2px solid ${c}`, borderLeft: `2px solid ${c}` }} />
      <span style={{ ...base, bottom: inset, right: inset, borderBottom: `2px solid ${c}`, borderRight: `2px solid ${c}` }} />
    </>
  );
}

/* ============ STORAGE HOOK (Firestore) ============
   Mỗi "key" tương ứng với một document trong collection "lt31b2".
   Dùng onSnapshot để đồng bộ real-time: một người thêm/xoá, mọi người khác
   thấy ngay lập tức mà không cần tải lại trang.
*/
/* ============ BÁO LỖI TRỰC TIẾP TRÊN MÀN HÌNH (không cần mở DevTools) ============ */
let _globalErrors = [];
let _errorListeners = [];
function reportGlobalError(message) {
  const entry = { id: Date.now() + Math.random(), message };
  _globalErrors = [..._globalErrors, entry].slice(-4);
  _errorListeners.forEach((fn) => fn(_globalErrors));
}
function useGlobalErrors() {
  const [errors, setErrors] = useState(_globalErrors);
  useEffect(() => {
    _errorListeners.push(setErrors);
    return () => { _errorListeners = _errorListeners.filter((fn) => fn !== setErrors); };
  }, []);
  const dismiss = (id) => {
    _globalErrors = _globalErrors.filter((e) => e.id !== id);
    setErrors(_globalErrors);
  };
  return { errors, dismiss };
}
function ErrorBanner() {
  const { errors, dismiss } = useGlobalErrors();
  if (errors.length === 0) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999 }} className="p-2 space-y-1.5">
      {errors.map((e) => (
        <div
          key={e.id}
          className="f-body text-xs px-4 py-3 flex items-start justify-between gap-3"
          style={{ background: T.red, color: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}
        >
          <span className="flex-1"><b>Lỗi kết nối dữ liệu:</b> {e.message}</span>
          <button onClick={() => dismiss(e.id)} style={{ color: "#fff" }} aria-label="Đóng"><X size={15} /></button>
        </div>
      ))}
    </div>
  );
}

function useSharedList(key) {
  const [items, setItemsState] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const ref = doc(db, "lt31b2", key);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          try {
            setItemsState(data.value ? JSON.parse(data.value) : []);
          } catch (e) {
            setItemsState([]);
          }
        } else {
          setItemsState([]);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        const msg = `Đọc "${key}" thất bại — ${err?.code || ""} ${err?.message || err}`;
        setError(msg);
        setLoading(false);
        reportGlobalError(msg);
      }
    );
    return () => unsub();
  }, [key]);

  const persist = async (next) => {
    setItemsState(next);
    try {
      const ref = doc(db, "lt31b2", key);
      await setDoc(ref, { value: JSON.stringify(next) });
    } catch (e) {
      const msg = `Lưu "${key}" thất bại — ${e?.code || ""} ${e?.message || e}`;
      setError(msg);
      reportGlobalError(msg);
    }
  };

  return { items, setItems: persist, loading, error, reload: () => {} };
}

function useAuthConfig() {
  const [config, setConfigState] = useState({ unitPassword: UNIT_PASSWORD_DEFAULT, adminPassword: ADMIN_PASSWORD_DEFAULT, memberPasswords: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "lt31b2", "authConfig");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists() && snap.data().value) {
          try {
            const parsed = JSON.parse(snap.data().value);
            setConfigState({
              unitPassword: parsed.unitPassword || UNIT_PASSWORD_DEFAULT,
              adminPassword: parsed.adminPassword || ADMIN_PASSWORD_DEFAULT,
              // Mật khẩu đăng nhập riêng cho từng Trung đội trưởng / Trung đội phó (khoá theo tên đã chuẩn hoá)
              memberPasswords: parsed.memberPasswords || {},
            });
          } catch (e) {
            // giữ mặc định nếu dữ liệu lỗi
          }
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const update = async (next) => {
    setConfigState(next);
    try {
      await setDoc(doc(db, "lt31b2", "authConfig"), { value: JSON.stringify(next) });
      return true;
    } catch (e) {
      const msg = `Đổi mật khẩu thất bại — ${e?.code || ""} ${e?.message || e}`;
      reportGlobalError(msg);
      return false;
    }
  };

  return { config, setConfig: update, loading };
}

/* ============ CẤU HÌNH DÙNG CHUNG (1 tài liệu duy nhất — dùng cho khoá đăng ký, thủ quỹ...) ============ */
function useSingleDoc(key, defaultValue) {
  const [value, setValueState] = useState(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "lt31b2", key);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists() && snap.data().value) {
          try {
            setValueState({ ...defaultValue, ...JSON.parse(snap.data().value) });
          } catch (e) {
            // giữ mặc định nếu dữ liệu lỗi
          }
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = async (next) => {
    setValueState(next);
    try {
      await setDoc(doc(db, "lt31b2", key), { value: JSON.stringify(next) });
      return true;
    } catch (e) {
      reportGlobalError(`Lưu "${key}" thất bại — ${e?.code || ""} ${e?.message || e}`);
      return false;
    }
  };

  return { value, setValue: update, loading };
}

/* ============ THÔNG BÁO SỐ MỚI TRÊN THANH ĐIỀU HƯỚNG (giống Zalo) ============
   Mỗi người dùng có một "trạng thái đã xem" riêng (lưu theo tên đăng nhập, tách biệt với người khác)
   ghi lại thời điểm gần nhất họ mở từng mục. Số thông báo = số mục có trong danh sách được TẠO SAU
   thời điểm đó. Khi người dùng bấm vào mục nào, thời điểm "đã xem" của mục đó được cập nhật ngay
   lập tức → số thông báo biến mất, để biết mục nào mới mà mình chưa xem qua.
*/
function useSeenState(user) {
  const key = normalizeName(user);
  const docId = `seen_${key || "khach"}`;
  const [seen, setSeenState] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!key) { setSeenState({}); setLoading(false); return; }
    setLoading(true);
    const ref = doc(db, "lt31b2", docId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists() && snap.data().value) {
          try { setSeenState(JSON.parse(snap.data().value)); } catch (e) { setSeenState({}); }
        } else {
          setSeenState({});
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [key, docId]);

  const markSeen = async (tabId) => {
    const next = { ...seen, [tabId]: Date.now() };
    setSeenState(next);
    try {
      await setDoc(doc(db, "lt31b2", docId), { value: JSON.stringify(next) });
    } catch (e) {
      const msg = `Cập nhật trạng thái đã xem thất bại — ${e?.code || ""} ${e?.message || e}`;
      reportGlobalError(msg);
    }
  };

  return { seen, markSeen, loading };
}

// Lấy thời điểm tạo của 1 mục: ưu tiên createdAt (nếu có), không thì dùng id (vì id trong app này luôn là Date.now())
const itemCreatedAt = (o) => new Date(o?.createdAt || o?.id || 0).getTime();
// Đếm số mục được tạo SAU thời điểm "đã xem" (sinceTs) — dùng để hiển thị số thông báo mới
const countNewSince = (items, sinceTs) => (items || []).filter((it) => itemCreatedAt(it) > (sinceTs || 0)).length;

// Lấy ngày hôm nay (yyyy-mm-dd) và TỰ CẬP NHẬT khi đồng hồ sang ngày mới, kể cả khi người dùng
// mở tab trình duyệt xuyên đêm không tắt / không tải lại trang. Nếu chỉ tính "today" một lần lúc
// mount (như cách làm cũ), các màn hình mở từ tối hôm trước sẽ bị kẹt mãi ở ngày cũ.
function useLiveToday() {
  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    const id = setInterval(() => {
      const t = new Date().toISOString().slice(0, 10);
      setToday((prev) => (prev === t ? prev : t));
    }, 30 * 1000); // kiểm tra mỗi 30 giây — đủ nhanh để nhận ngày mới, không tốn tài nguyên
    return () => clearInterval(id);
  }, []);
  return today;
}

// Cấu hình khoá đăng ký ra ngoài: khoá thủ công (manualLock) và/hoặc khoá tự động đến 1 thời điểm (lockAt, chuỗi datetime-local)
// lockSetOn (yyyy-mm-dd): ngày mà khoá thủ công được BẬT — dùng để tự động coi như đã mở khoá khi sang ngày mới,
// tránh việc khoá thủ công "quên" không mở sẽ chặn đăng ký mãi mãi những ngày sau đó.
function useOutingLock() {
  const [config, setConfigState] = useState({ manualLock: false, lockAt: "", lockSetOn: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "lt31b2", "outingLock");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists() && snap.data().value) {
          try {
            const parsed = JSON.parse(snap.data().value);
            setConfigState({
              manualLock: Boolean(parsed.manualLock),
              lockAt: parsed.lockAt || "",
              lockSetOn: parsed.lockSetOn || "",
            });
          } catch (e) {
            // giữ mặc định nếu dữ liệu lỗi
          }
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const update = async (next) => {
    // Lưu lại trạng thái cũ để hoàn tác nếu lưu Firestore thất bại — tránh trường hợp người bấm khoá
    // thấy giao diện của MÌNH báo "đã khoá" trong khi dữ liệu chưa thực sự lưu được, khiến người khác
    // vẫn đăng ký được bình thường mà chỉ huy tưởng đã khoá.
    const prev = config;
    setConfigState(next);
    try {
      await setDoc(doc(db, "lt31b2", "outingLock"), { value: JSON.stringify(next) });
      return true;
    } catch (e) {
      setConfigState(prev);
      const msg = `Cập nhật khoá đăng ký thất bại — ${e?.code || ""} ${e?.message || e}. Khoá CHƯA được lưu, vui lòng thử lại.`;
      reportGlobalError(msg);
      return false;
    }
  };

  return { config, setConfig: update, loading };
}

// Ảnh chụp danh sách ra ngoài đã được lãnh đạo ký duyệt — lưu riêng theo từng ngày (date: yyyy-mm-dd)
function useOutingApprovalPhoto(date) {
  const docId = `outingPhoto_${date || "none"}`;
  const [data, setData] = useState({ url: "", uploadedBy: "", uploadedAt: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const ref = doc(db, "lt31b2", docId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists() && snap.data().value) {
          try { setData(JSON.parse(snap.data().value)); } catch (e) { setData({ url: "", uploadedBy: "", uploadedAt: "" }); }
        } else {
          setData({ url: "", uploadedBy: "", uploadedAt: "" });
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [docId]);

  const save = async (next) => {
    setData(next);
    try {
      await setDoc(doc(db, "lt31b2", docId), { value: JSON.stringify(next) });
      return true;
    } catch (e) {
      const msg = `Lưu ảnh danh sách ký duyệt thất bại — ${e?.code || ""} ${e?.message || e}`;
      reportGlobalError(msg);
      return false;
    }
  };

  return { data, save, loading };
}

function useRole(user, isAdminLogin) {
  const { items: permissions, setItems: setPermissions, loading: permLoading } = useSharedList("permissions");
  const { items: rosterItems, loading: rosterLoading } = useSharedList("roster");
  const { value: fundConfig, loading: fundConfigLoading } = useSingleDoc("fundConfig", {
    treasurerName: "", bankAccount: "", bankName: "", qrUrl: "",
  });

  const explicit = permissions.find((p) => normalizeName(p.name) === normalizeName(user));
  const rosterMatch = rosterItems.find((m) => normalizeName(m.name) === normalizeName(user));
  const isCommandRole = isCommandRoleForName(user, rosterItems);
  const isTreasurer = Boolean(fundConfig.treasurerName && normalizeName(fundConfig.treasurerName) === normalizeName(user));

  let role = "thanh_vien";
  if (isAdminLogin) role = "admin";
  else if (explicit) role = explicit.role;
  else if (isCommandRole) role = "can_bo";

  const canManage = role === "admin" || role === "can_bo";

  const perm = {
    name: user,
    role,
    isAdmin: role === "admin",
    canManage,
    // Thủ quỹ chỉ có quyền quản lý riêng mục Quỹ trung đội, không có quyền ở các mục khác
    isTreasurer,
    canManageFund: canManage || isTreasurer,
    isCommandRole,
    // Quyền vào "Phòng trò chuyện chỉ huy": Quản trị, Trung đội trưởng/phó, Tiểu đội trưởng/phó
    canAccessCommandChat: role === "admin" || isSquadCommandRoleForName(user, rosterItems),
    title: rosterMatch?.role || null,
    isOwner: (ownerName) => normalizeName(ownerName) === normalizeName(user),
  };
  return { perm, permissions, setPermissions, permLoading: permLoading || rosterLoading || fundConfigLoading };
}

/* ============ SMALL UI HELPERS ============ */
function SectionHeader({ icon: Icon, eyebrow, title, action, compact }) {
  return (
    <div className={compact ? "flex items-center justify-between mb-3 pb-2.5 flex-wrap gap-2" : "flex items-center justify-between mb-5 pb-4 flex-wrap gap-3"} style={{ borderBottom: `1px solid ${T.paperDark}` }}>
      <div>
        <div className={compact ? "f-mono text-[10px] tracking-widest uppercase" : "f-mono text-xs tracking-widest uppercase"} style={{ color: T.amberDark }}>{eyebrow}</div>
        <h2 className={compact ? "f-display text-base md:text-lg font-semibold flex items-center gap-1.5 mt-0.5" : "f-display text-2xl md:text-3xl font-semibold flex items-center gap-2.5 mt-0.5"} style={{ color: T.green }}>
          <Icon size={compact ? 16 : 22} /> {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function Btn({ children, onClick, variant = "solid", type = "button", disabled, size }) {
  const base = size === "sm"
    ? "f-display text-[11px] tracking-wide uppercase px-2.5 py-1.5 flex items-center gap-1.5 disabled:opacity-50 btn-press"
    : "f-display text-sm tracking-wide uppercase px-4 py-2 flex items-center gap-2 disabled:opacity-50 btn-press";
  const style =
    variant === "solid"
      ? { background: T.green, color: T.paper, boxShadow: "0 1px 2px rgba(19,31,25,0.25)" }
      : variant === "danger"
      ? { background: "transparent", color: T.red, border: `1.5px solid ${T.red}` }
      : { background: "transparent", color: T.green, border: `1.5px solid ${T.green}` };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={base} style={style}>
      {children}
    </button>
  );
}

function Field({ label, children, required }) {
  return (
    <label className="block mb-3">
      <span className="f-mono text-[11px] uppercase tracking-widest block mb-1" style={{ color: T.inkSoft }}>
        {label}
        {required && <span style={{ color: T.red }} title="Bắt buộc nhập"> *</span>}
      </span>
      {children}
    </label>
  );
}
const inputStyle = { background: "#fff", border: `1px solid #C9BFA5`, color: T.ink };
const inputCls = "f-body w-full px-3 py-2 outline-none text-sm rounded-sm input-plain";

// Ô nhập mật khẩu có nút con mắt để ẩn/hiện nội dung — mặc định ẩn (dạng dấu chấm) để bảo mật,
// bấm vào mắt để xem lại mật khẩu vừa nhập trước khi lưu.
function PasswordInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        className={inputCls}
        style={{ ...inputStyle, paddingRight: 36 }}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2"
        style={{ color: T.inkSoft }}
        title={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

/* ============ CẢNH BÁO THIẾU TRƯỜNG BẮT BUỘC (hiện ngay trong form khi bấm Lưu mà chưa nhập đủ) ============ */
function FormWarning({ message }) {
  if (!message) return null;
  return (
    <div
      className="f-body text-xs px-3 py-2.5 mb-3 flex items-start gap-2"
      style={{ background: "#FCEBEA", color: T.red, border: `1px solid ${T.red}` }}
      role="alert"
    >
      <span className="shrink-0">⚠</span> <span>{message}</span>
    </div>
  );
}

function LoadingRow() {
  return <div className="flex items-center gap-2 f-body text-sm py-6" style={{ color: T.inkSoft }}><Loader2 size={16} className="animate-spin" /> Đang tải dữ liệu…</div>;
}

/* ============ THẢ TIM (dùng chung cho Thông báo & Bảng tin) ============ */
function ReactionBar({ reactions = [], user, onToggle }) {
  const mine = reactions.includes(user);
  return (
    <button
      onClick={onToggle}
      type="button"
      className="flex items-center gap-1.5 mt-2 f-body text-xs btn-press"
      style={{ color: mine ? T.red : T.inkSoft }}
      title={reactions.length > 0 ? reactions.join(", ") : "Thả tim"}
    >
      <Heart size={14} fill={mine ? T.red : "none"} strokeWidth={2} />
      {reactions.length > 0 ? reactions.length : "Thích"}
    </button>
  );
}

function EmptyState({ text }) {
  return <div className="f-body text-sm italic py-8 text-center" style={{ color: T.inkSoft }}>{text}</div>;
}

/* ============ UPLOAD FIELD (tải ảnh/tệp trực tiếp từ máy — dùng Cloudinary) ============ */
function UploadField({ onUploaded }) {
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [errMsg, setErrMsg] = useState("");
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  const configured = Boolean(cloudName && uploadPreset);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!configured) {
      setStatus("error");
      setErrMsg("Chưa cấu hình Cloudinary (xem README).");
      return;
    }
    setStatus("uploading");
    try {
      // Ảnh/video dùng đúng loại resource; còn lại (pdf, doc, docx, xlsx…) dùng "raw" —
      // nếu gửi sai loại, Cloudinary sẽ từ chối các file không phải ảnh/video.
      const resourceType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "raw";
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", uploadPreset);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.secure_url) {
        onUploaded(data.secure_url);
        setStatus("done");
      } else {
        setStatus("error");
        setErrMsg(data?.error?.message || "Không rõ nguyên nhân, thử lại.");
      }
    } catch (err) {
      setStatus("error");
      setErrMsg(String(err?.message || err));
    }
  };

  return (
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
      <label
        className="f-display text-[11px] uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5 cursor-pointer btn-press"
        style={{ border: `1px solid ${T.green}`, color: T.green }}
      >
        {status === "uploading" ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
        {status === "uploading" ? "Đang tải lên…" : "Tải ảnh / tệp từ máy"}
        <input
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          className="hidden"
          onChange={handleFile}
          disabled={status === "uploading"}
        />
      </label>
      {status === "done" && (
        <span className="f-body text-xs flex items-center gap-1" style={{ color: T.green }}>
          <CheckCircle2 size={13} /> Đã tải lên
        </span>
      )}
      {status === "error" && (
        <span className="f-body text-xs" style={{ color: T.red }}>{errMsg}</span>
      )}
    </div>
  );
}

/* ============ LOGIN GATE ============ */
function LoginGate({ onLogin }) {
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const { config } = useAuthConfig();
  const { items: rosterItems } = useSharedList("roster");

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr("Nhập họ tên của bạn để hệ thống ghi nhận.");
      return;
    }
    // Mật khẩu quản trị luôn đăng nhập được với quyền cao nhất, bất kể tên nhập vào.
    if (pw === config.adminPassword) {
      onLogin(name.trim(), true);
      return;
    }

    // Trung đội trưởng / Trung đội phó: nếu đã tự đặt mật khẩu riêng (ở mục Đổi mật khẩu)
    // thì phải đăng nhập bằng mật khẩu riêng đó, không dùng chung mật khẩu trung đội nữa.
    const isCommand = isCommandRoleForName(name, rosterItems);
    const individualPw = config.memberPasswords?.[normalizeName(name)];
    if (isCommand && individualPw) {
      if (pw !== individualPw) {
        setErr("Mật khẩu không đúng. Liên hệ quản trị để được cấp lại mật khẩu riêng.");
        return;
      }
      onLogin(name.trim(), false);
      return;
    }

    if (pw !== config.unitPassword) {
      setErr("Mật khẩu không đúng. Liên hệ lớp trưởng/quản trị để lấy mật khẩu.");
      return;
    }
    onLogin(name.trim(), false);
  };

  return (
    <div className="min-h-screen paper-tex flex items-center justify-center px-4 py-10">
      <style>{FONT_STYLE}</style>
      <ErrorBanner />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md overflow-hidden card-sheet"
        style={{ background: "#fff", border: `1px solid ${T.paperDark}` }}
      >
        {/* Dải ruy băng đỏ trên cùng, kiểu bìa hồ sơ công vụ */}
        <div
          className="f-mono text-center text-[10px] tracking-[0.25em] uppercase py-2"
          style={{ background: T.red, color: "#fff" }}
        >
          Hệ thống quản lý nội bộ trung đội
        </div>
        <div style={{ height: 3, background: T.gold }} />

        <div className="relative px-8 pt-8 pb-8">
          <CornerMarks inset={14} length={16} />

          {/* Con dấu mờ phía sau làm nền trang trí */}
          <div style={{ position: "absolute", top: -10, right: -18, pointerEvents: "none" }}>
            <Seal size={150} opacity={0.06} />
          </div>

          <div className="relative flex flex-col items-center mb-6">
            <Emblem size={92} />
            <div className="f-mono text-[10.5px] tracking-[0.22em] uppercase mt-4" style={{ color: T.amberDark }}>
              Trường Đại học Cảnh sát nhân dân
            </div>
            <div className="f-mono text-[9.5px] tracking-[0.18em] uppercase" style={{ color: T.inkSoft }}>
              People's Police University
            </div>
            <h1 className="f-display text-2xl font-semibold text-center mt-2" style={{ color: T.green }}>
              TRUNG ĐỘI B2 CSGT LT31
            </h1>
            <div className="flex items-center gap-2 my-3">
              <span style={{ width: 24, height: 1, background: T.gold }} />
              <span style={{ width: 5, height: 5, transform: "rotate(45deg)", background: T.gold }} />
              <span style={{ width: 24, height: 1, background: T.gold }} />
            </div>
            <div className="f-body text-xs" style={{ color: T.inkSoft }}>Cổng truy cập nội bộ trung đội</div>
          </div>

          <div className="relative">
            <Field label="Họ và tên" required>
              <input className={inputCls} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nguyễn Văn A" />
            </Field>
            <Field label="Mật khẩu (chung trung đội hoặc quản trị)">
              <input type="password" className={inputCls} style={inputStyle} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
            </Field>

            {err && (
              <div className="f-body text-xs mb-3 px-3 py-2 flex items-start gap-2" style={{ color: T.red, background: "#F7E3E6", borderLeft: `3px solid ${T.red}` }}>
                {err}
              </div>
            )}

            <button
              type="submit"
              className="f-display w-full py-2.5 tracking-wide uppercase text-sm btn-press"
              style={{ background: T.green, color: T.paper, boxShadow: "0 2px 6px rgba(19,31,25,0.3)" }}
            >
              Vào trang trung đội
            </button>
            <p className="f-body text-[11px] mt-4 text-center" style={{ color: T.inkSoft }}>
              Dữ liệu trên trang này dùng chung cho cả trung đội. Quyền thêm/xoá nội dung tuỳ theo vai trò được quản trị gán.
            </p>
            <p className="f-mono text-[10.5px] mt-3 text-center uppercase tracking-widest" style={{ color: T.inkSoft }}>
              Quản trị hệ thống: <span style={{ color: T.green, fontWeight: 600 }}>ĐẶNG TUẤN THANH</span>
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ============ TAB: THÔNG BÁO (HOME) ============ */
function AnnouncementsTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("announcements");
  const schedule = useSharedList("schedule");
  const outings = useSharedList("outings");
  const [form, setForm] = useState({ title: "", body: "", url: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");
  const isImage = (u) => /\.(png|jpe?g|gif|webp)$/i.test(u || "");

  const today = new Date().toISOString().slice(0, 10);
  const todaySchedule = schedule.items.filter((s) => s.date === today);
  const chuaVe = outings.items.filter((o) => o.ngay === today && o.duyet === "Đã duyệt" && o.trangThai === "Chưa về");

  const add = async () => {
    if (!form.title.trim()) { setWarn("Vui lòng nhập Tiêu đề trước khi lưu."); return; }
    setWarn("");
    const entry = { id: Date.now(), title: form.title, body: form.body, url: form.url, author: user, date: new Date().toISOString(), pinned: false };
    await setItems([entry, ...items]);
    setForm({ title: "", body: "", url: "" });
    setShowForm(false);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const [pinWarn, setPinWarn] = useState("");
  const togglePin = async (id) => {
    const target = items.find((i) => i.id === id);
    if (!target) return;
    if (!target.pinned && items.filter((i) => i.pinned).length >= 10) {
      setPinWarn("Chỉ được ghim tối đa 10 thông báo. Hãy bỏ ghim bớt trước khi ghim thêm.");
      return;
    }
    setPinWarn("");
    await setItems(items.map((i) => (i.id === id ? { ...i, pinned: !i.pinned, pinnedAt: !i.pinned ? Date.now() : null } : i)));
  };
  const toggleReaction = async (id) => setItems(items.map((a) => {
    if (a.id !== id) return a;
    const reactions = a.reactions || [];
    const mine = reactions.includes(user);
    return { ...a, reactions: mine ? reactions.filter((n) => n !== user) : [...reactions, user] };
  }));
  const canDelete = (a) => perm.canManage || perm.isOwner(a.author);
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = (id) => setSelectedId((s) => (s === id ? null : id));

  // ---- Sửa thông báo (chỉ huy) ----
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", body: "", url: "" });
  const [editWarn, setEditWarn] = useState("");
  const startEdit = (a, e) => { e.stopPropagation(); setEditingId(a.id); setEditForm({ title: a.title || "", body: a.body || "", url: a.url || "" }); setEditWarn(""); };
  const cancelEdit = (e) => { e?.stopPropagation(); setEditingId(null); setEditWarn(""); };
  const saveEdit = async (id, e) => {
    e.stopPropagation();
    if (!editForm.title.trim()) { setEditWarn("Vui lòng nhập Tiêu đề trước khi lưu."); return; }
    setEditWarn("");
    await setItems(items.map((i) => (i.id === id ? { ...i, title: editForm.title, body: editForm.body, url: editForm.url, editedAt: new Date().toISOString() } : i)));
    setEditingId(null);
  };

  const sorted = [...items].sort((a, b) => {
    const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    if (a.pinned && b.pinned) return (a.pinnedAt || 0) - (b.pinnedAt || 0);
    return new Date(b.date) - new Date(a.date);
  });
  const pinRank = {};
  sorted.filter((a) => a.pinned).forEach((a, idx) => { pinRank[a.id] = idx + 1; });

  return (
    <div>
      <SectionHeader icon={Shield} eyebrow="Trang chủ" title="Thông báo trung đội"
        action={perm.canManage && <Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Đăng thông báo</Btn>} />

      {pinWarn && <FormWarning message={pinWarn} />}

      {(todaySchedule.length > 0 || chuaVe.length > 0) && (
        <div className="mb-5 space-y-2">
          {todaySchedule.map((s) => (
            <div key={s.id} className="f-body text-sm px-4 py-2.5 flex items-center gap-2" style={{ background: T.amber, color: T.greenDark }}>
              <CalendarDays size={16} /> <b className="f-display uppercase text-xs tracking-wide">Hôm nay · {s.type}:</b> {s.title}
            </div>
          ))}
          {chuaVe.length > 0 && (
            <div className="f-body text-sm px-4 py-2.5 flex items-center gap-2" style={{ background: T.red, color: "#fff" }}>
              <DoorOpen size={16} /> <b className="f-display uppercase text-xs tracking-wide">{chuaVe.length} người chưa về:</b> {chuaVe.map((o) => o.name).join(", ")}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="stamp-border p-4 mb-5" style={{ background: "#fff" }}>
          <FormWarning message={warn} />
          <Field label="Tiêu đề" required><input className={inputCls} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Nội dung"><textarea rows={3} className={inputCls} style={inputStyle} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <Field label="Đính kèm ảnh/file hoặc link (không bắt buộc)">
            <input className={inputCls} style={inputStyle} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
            <UploadField onUploaded={(url) => setForm((f) => ({ ...f, url }))} />
            {form.url && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {isImage(form.url) ? (
                  <img src={form.url} alt="Đính kèm" className="max-w-[140px] max-h-28 stamp-border" />
                ) : (
                  <a href={form.url} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all inline-flex items-center gap-1" style={{ color: T.green }}>
                    <Paperclip size={12} /> Xem file/link vừa nhập
                  </a>
                )}
                <button onClick={() => setForm((f) => ({ ...f, url: "" }))} title="Bỏ đính kèm"><X size={14} style={{ color: T.red }} /></button>
              </div>
            )}
          </Field>
          <Btn onClick={add}>Đăng</Btn>
        </div>
      )}

      {loading ? <LoadingRow /> : sorted.length === 0 ? <EmptyState text="Chưa có thông báo nào." /> : (
        <div className="space-y-3">
          {sorted.map((a) => (
            <div
              key={a.id}
              onClick={() => toggleSelect(a.id)}
              className="p-4 cursor-pointer"
              style={withSelect({ background: "#fff", borderLeft: `4px solid ${a.pinned ? T.amber : T.green}` }, selectedId === a.id)}
            >
              <div className="flex items-start justify-between gap-3">
                {editingId === a.id ? (
                  <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                    <FormWarning message={editWarn} />
                    <Field label="Tiêu đề" required><input className={inputCls} style={inputStyle} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></Field>
                    <Field label="Nội dung"><textarea rows={3} className={inputCls} style={inputStyle} value={editForm.body} onChange={(e) => setEditForm({ ...editForm, body: e.target.value })} /></Field>
                    <Field label="Đính kèm ảnh/file hoặc link (không bắt buộc)">
                      <input className={inputCls} style={inputStyle} value={editForm.url} onChange={(e) => setEditForm({ ...editForm, url: e.target.value })} placeholder="https://…" />
                      <UploadField onUploaded={(url) => setEditForm((f) => ({ ...f, url }))} />
                      {editForm.url && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {isImage(editForm.url) ? (
                            <img src={editForm.url} alt="Đính kèm" className="max-w-[140px] max-h-28 stamp-border" />
                          ) : (
                            <a href={editForm.url} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all inline-flex items-center gap-1" style={{ color: T.green }}>
                              <Paperclip size={12} /> Xem file/link vừa nhập
                            </a>
                          )}
                          <button onClick={() => setEditForm((f) => ({ ...f, url: "" }))} title="Bỏ đính kèm"><X size={14} style={{ color: T.red }} /></button>
                        </div>
                      )}
                    </Field>
                    <div className="flex items-center gap-2">
                      <Btn onClick={(e) => saveEdit(a.id, e)}>Lưu thay đổi</Btn>
                      <button className="f-mono text-xs uppercase tracking-wider" style={{ color: T.inkSoft }} onClick={cancelEdit}>Huỷ</button>
                    </div>
                  </div>
                ) : (
                <div>
                  <div className="flex items-center gap-2">
                    {a.pinned && (
                      <span className="f-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 inline-flex items-center gap-1" style={{ background: T.amber, color: T.greenDark }}>
                        <Pin size={11} /> Ghim #{pinRank[a.id]}
                      </span>
                    )}
                    <h3 className="f-display font-semibold" style={{ color: T.green }}>{a.title}</h3>
                  </div>
                  <p className="f-body text-sm mt-1 whitespace-pre-wrap" style={{ color: T.ink }}>{a.body}</p>
                  {a.url && (
                    isImage(a.url) ? (
                      <div className="mt-2">
                        <a href={a.url} target="_blank" rel="noreferrer" className="block" onClick={(e) => e.stopPropagation()}>
                          <img src={a.url} alt="Đính kèm" className="max-w-[220px] max-h-48 stamp-border" />
                        </a>
                        <a href={a.url} onClick={(e) => { e.preventDefault(); e.stopPropagation(); forceDownload(a.url, a.title); }} className="f-mono text-xs underline inline-flex items-center gap-1 mt-1.5 cursor-pointer" style={{ color: T.green }}>
                          <Download size={12} /> Tải ảnh về máy
                        </a>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <a href={a.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="f-mono text-xs underline break-all inline-flex items-center gap-1" style={{ color: T.green }}>
                          <Paperclip size={12} /> Mở link / xem file
                        </a>
                        <a href={a.url} onClick={(e) => { e.preventDefault(); e.stopPropagation(); forceDownload(a.url, a.title); }} className="f-mono text-xs underline inline-flex items-center gap-1 cursor-pointer" style={{ color: T.green }}>
                          <Download size={12} /> Tải file về máy
                        </a>
                      </div>
                    )
                  )}
                  <div className="f-mono text-[11px] mt-2" style={{ color: T.inkSoft }}>
                    {a.author} · {new Date(a.date).toLocaleString("vi-VN")}{a.editedAt ? " · đã chỉnh sửa" : ""}
                  </div>
                  <ReactionBar reactions={a.reactions} user={user} onToggle={() => toggleReaction(a.id)} />
                </div>
                )}
                {editingId !== a.id && (
                <div className="flex gap-2 shrink-0">
                  {perm.canManage && <button onClick={() => togglePin(a.id)} title={a.pinned ? "Bỏ ghim" : "Ghim"}><Star size={16} fill={a.pinned ? T.amberDark : "none"} style={{ color: a.pinned ? T.amberDark : "#C9BFA5", filter: a.pinned ? `drop-shadow(0 0 4px ${T.amber})` : "none", transition: "all .15s" }} /></button>}
                  {perm.canManage && <button onClick={(e) => startEdit(a, e)} title="Sửa"><Pencil size={16} style={{ color: T.green }} /></button>}
                  {canDelete(a) && <button onClick={() => remove(a.id)} title="Xoá"><Trash2 size={16} style={{ color: T.red }} /></button>}
                </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ TAB: QUÂN SỐ ============ */
// Định dạng ngày sinh dd/mm/yyyy để hiển thị trong bảng (input lưu dạng yyyy-mm-dd)
function formatDob(dob) {
  if (!dob) return "—";
  const parts = String(dob).split("-");
  if (parts.length !== 3) return dob;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}
// Lấy Năm sinh (yyyy) từ dob dạng yyyy-mm-dd trong Quân số, dùng khi đưa người vào Danh sách trực.
function yearFromDob(dob) {
  if (!dob) return "";
  const parts = String(dob).split("-");
  return parts.length === 3 ? parts[0] : String(dob);
}

const ROSTER_ROLE_OPTIONS = [
  "Trung đội trưởng", "Trung đội phó",
  "Tiểu đội trưởng", "Tiểu đội phó",
  "Bí thư chi bộ", "Phó bí thư chi bộ",
  "Chi uỷ viên chi bộ", "Thư ký chi bộ",
  "Bí thư chi đoàn", "Phó bí thư chi đoàn",
  "Uỷ viên chi đoàn", "Thành viên",
];
// Chức vụ có thể gồm nhiều chức danh, lưu dạng chuỗi phân tách bởi dấu phẩy (VD: "Tiểu đội trưởng, Bí thư chi đoàn")
function roleList(roleStr) {
  return String(roleStr || "").split(",").map((s) => s.trim()).filter(Boolean);
}
function hasRole(roleStr, target) {
  return roleList(roleStr).includes(target);
}
// Hiển thị thân thiện: chức danh mặc định "Cán bộ" (không giữ chức vụ riêng) hiển thị là "Thành viên"
function roleDisplay(roleStr) {
  const list = roleList(roleStr).map((r) => (r === "Cán bộ" ? "Thành viên" : r));
  return list.length ? list.join(" · ") : "Thành viên";
}
// Ô chọn nhiều chức danh (tối đa `max`), dùng cho cả form Thêm và Sửa thành viên
function RoleMultiSelect({ value, onChange, disabled, max = 3 }) {
  const [open, setOpen] = useState(false);
  const selected = roleList(value);
  const toggle = (r) => {
    if (disabled) return;
    let next;
    if (selected.includes(r)) next = selected.filter((x) => x !== r);
    else { if (selected.length >= max) return; next = [...selected, r]; }
    onChange(next.length ? next.join(", ") : "Thành viên");
  };
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={inputCls}
        style={{ ...inputStyle, textAlign: "left", cursor: disabled ? "not-allowed" : "pointer" }}
      >
        {selected.length ? roleDisplay(value) : "Chọn chức vụ..."}
      </button>
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto stamp-border" style={{ background: "#fff" }}>
          {ROSTER_ROLE_OPTIONS.map((r) => (
            <label key={r} className="flex items-center gap-2 px-3 py-1.5 text-xs f-body cursor-pointer" style={{ borderBottom: `1px solid ${T.paperDark}` }}>
              <input type="checkbox" checked={selected.includes(r)} onChange={() => toggle(r)} disabled={!selected.includes(r) && selected.length >= max} />
              {r}
            </label>
          ))}
          <div className="px-3 py-1.5 f-mono text-[10px] flex items-center justify-between" style={{ color: T.inkSoft }}>
            <span>Chọn tối đa {max} chức vụ</span>
            <button type="button" className="underline" onClick={() => setOpen(false)}>Xong</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Ô chọn tên trong Quân số dạng dropdown tuỳ biến — tự cuộn gọn khi danh sách dài hơn 6 dòng
function RosterNameSelect({ value, options, onChange, placeholder = "— Chọn tên trong Quân số —" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);
  const current = options.find((o) => o.value === value);
  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={inputCls}
        style={{ ...inputStyle, textAlign: "left", cursor: "pointer" }}
      >
        {current ? current.label : placeholder}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto stamp-border" style={{ background: "#fff" }}>
          <div
            className="px-3 py-1.5 text-xs f-body cursor-pointer"
            style={{ borderBottom: `1px solid ${T.paperDark}`, color: T.inkSoft }}
            onClick={() => { onChange(""); setOpen(false); }}
          >
            {placeholder}
          </div>
          {options.map((o, i) => (
            <div
              key={o.value + "-" + i}
              className="px-3 py-1.5 text-xs f-body cursor-pointer"
              style={{
                borderBottom: `1px solid ${T.paperDark}`,
                background: value === o.value ? "#DCE9FA" : "transparent",
              }}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ TAB: QUÂN SỐ ============
   - Thêm/Xoá thành viên: Quản trị, Trung đội trưởng/phó, Cán bộ được gán quyền (perm.canManage).
   - Sửa thông tin từng người:
       + Quản trị, Trung đội trưởng, Trung đội phó: sửa được TOÀN BỘ thông tin của bất kỳ ai.
       + Thành viên khác: chỉ sửa được thông tin của CHÍNH MÌNH (khi có sai sót cần điều chỉnh),
         và không được đổi Chức vụ / Tiểu đội của bản thân (những mục này do chỉ huy quyết định).
*/
/* ============ NHẬP QUÂN SỐ TỪ ẢNH/TỆP ============
   - Từ file Excel (.xlsx/.xls) hoặc CSV: đọc trực tiếp trong trình duyệt (không cần AI), người dùng
     tự chọn cột nào ứng với thông tin nào (STT, Họ tên, Chức vụ...), tick chọn dòng cần lấy rồi xác nhận.
   - Từ ảnh chụp danh sách: dùng AI đọc chữ (OCR) qua API riêng /api/ocr-roster (cần cấu hình
     ANTHROPIC_API_KEY trên server — xem hướng dẫn hiện ngay trong khung nếu chưa cấu hình).
*/
const ROSTER_IMPORT_FIELDS = [
  { key: "", label: "— Bỏ qua cột này —" },
  { key: "stt", label: "STT" },
  { key: "msv", label: "Mã số" },
  { key: "name", label: "Họ và tên" },
  { key: "role", label: "Chức vụ" },
  { key: "tieuDoi", label: "Tiểu đội" },
  { key: "dob", label: "Ngày sinh" },
  { key: "phone", label: "SĐT" },
];
function guessRosterField(header) {
  const h = String(header || "").toLowerCase();
  if (/stt|số\s*thứ\s*tự/.test(h)) return "stt";
  if (/mã\s*số|msv/.test(h)) return "msv";
  if (/họ.*tên|^tên$|full\s*name|^name$/.test(h)) return "name";
  if (/chức\s*vụ|role/.test(h)) return "role";
  if (/tiểu\s*đội|squad/.test(h)) return "tieuDoi";
  if (/ngày\s*sinh|năm\s*sinh|dob|birth/.test(h)) return "dob";
  if (/sđt|điện\s*thoại|phone|sdt/.test(h)) return "phone";
  return "";
}
// Chuẩn hoá ngày sinh về dạng yyyy-mm-dd (lưu trong Quân số) từ các định dạng phổ biến dd/mm/yyyy, d-m-yyyy...
function normalizeDobInput(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return s;
}
// CSV parser đơn giản, có hỗ trợ field trong dấu ngoặc kép (chứa dấu phẩy/xuống dòng)
function parseCSVText(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* bỏ qua */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}
// Tải thư viện đọc file Excel (SheetJS) từ CDN khi cần dùng, chỉ tải một lần
let _xlsxLoadPromise = null;
function loadXLSXLib() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxLoadPromise) return _xlsxLoadPromise;
  _xlsxLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Không tải được thư viện đọc Excel — kiểm tra kết nối mạng."));
    document.head.appendChild(script);
  });
  return _xlsxLoadPromise;
}

function RosterImportPanel({ existingItems, onConfirm, onClose }) {
  const [srcMode, setSrcMode] = useState("file"); // "file" | "image"

  // ---- Nguồn: file Excel/CSV ----
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState([]); // mảng các mảng ô (kể cả dòng tiêu đề nếu có)
  const [hasHeader, setHasHeader] = useState(true);
  const [colMap, setColMap] = useState([]); // field key theo từng cột
  const [fileErr, setFileErr] = useState("");
  const [fileBusy, setFileBusy] = useState(false);

  const handleFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileErr(""); setFileBusy(true);
    try {
      const isCsv = /\.csv$/i.test(file.name);
      let rows = [];
      if (isCsv) {
        const text = await file.text();
        rows = parseCSVText(text);
      } else {
        const XLSX = await loadXLSXLib();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })
          .map((r) => r.map((c) => String(c ?? "")))
          .filter((r) => r.some((c) => String(c).trim() !== ""));
      }
      if (rows.length === 0) { setFileErr("Không đọc được dữ liệu nào từ file này."); setFileBusy(false); return; }
      const colCount = Math.max(...rows.map((r) => r.length));
      const headerRow = rows[0] || [];
      setColMap(Array.from({ length: colCount }, (_, i) => guessRosterField(headerRow[i])));
      setRawRows(rows);
      setFileName(file.name);
      setSelectedRows({});
    } catch (err) {
      setFileErr(`Đọc file thất bại — ${err?.message || err}`);
    }
    setFileBusy(false);
  };

  const dataRows = hasHeader ? rawRows.slice(1) : rawRows;
  const mappedFileRows = dataRows.map((r) => {
    const o = { stt: "", msv: "", name: "", role: "", tieuDoi: "", dob: "", phone: "" };
    colMap.forEach((key, i) => { if (key && r[i] !== undefined) o[key] = String(r[i]).trim(); });
    if (o.dob) o.dob = normalizeDobInput(o.dob);
    return o;
  });

  // ---- Nguồn: ảnh chụp (OCR - AI) ----
  const [imageUrl, setImageUrl] = useState("");
  const [ocrRows, setOcrRows] = useState(null); // null = chưa đọc; [] = đọc rồi nhưng rỗng
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrErr, setOcrErr] = useState("");
  const [ocrNotConfigured, setOcrNotConfigured] = useState(false);

  const runOCR = async () => {
    if (!imageUrl) return;
    setOcrBusy(true); setOcrErr(""); setOcrNotConfigured(false); setOcrRows(null);
    try {
      const res = await fetch("/api/ocr-roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      if (res.status === 404) { setOcrNotConfigured(true); setOcrBusy(false); return; }
      const data = await res.json();
      if (!res.ok) {
        if (data?.notConfigured) setOcrNotConfigured(true);
        else setOcrErr(data?.error || "Đọc ảnh thất bại, thử lại.");
        setOcrBusy(false);
        return;
      }
      const rows = Array.isArray(data.rows) ? data.rows : [];
      setOcrRows(rows.map((r) => ({
        stt: String(r.stt ?? "").trim(),
        msv: String(r.msv ?? "").trim(),
        name: String(r.name ?? "").trim(),
        role: String(r.role ?? "").trim(),
        tieuDoi: String(r.tieuDoi ?? "").trim(),
        dob: normalizeDobInput(r.dob),
        phone: String(r.phone ?? "").trim(),
      })));
      setSelectedRows({});
    } catch (err) {
      setOcrNotConfigured(true);
    }
    setOcrBusy(false);
  };

  const editOcrRow = (idx, key, value) => {
    setOcrRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  };

  // ---- Dòng đang xem (tuỳ theo nguồn) + tick chọn dòng cần lấy ----
  const previewRows = srcMode === "file" ? mappedFileRows : (ocrRows || []);
  const [selectedRows, setSelectedRows] = useState({});
  const existingNameSet = new Set(existingItems.map((m) => normalizeName(m.name)));
  const isDup = (name) => name && existingNameSet.has(normalizeName(name));

  useEffect(() => {
    // Mặc định tick tất cả dòng có Họ tên, trừ dòng trùng tên đã có sẵn trong Quân số
    const next = {};
    previewRows.forEach((r, i) => { next[i] = Boolean(r.name) && !isDup(r.name); });
    setSelectedRows(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappedFileRows.length, ocrRows]);

  const toggleRow = (i) => setSelectedRows((s) => ({ ...s, [i]: !s[i] }));
  const checkedCount = Object.values(selectedRows).filter(Boolean).length;

  const confirmImport = () => {
    const chosen = previewRows.filter((r, i) => selectedRows[i] && r.name);
    if (chosen.length === 0) return;
    onConfirm(chosen.map((r, idx) => ({
      id: Date.now() + idx,
      stt: r.stt || "",
      msv: r.msv || "",
      name: r.name,
      role: r.role || "Thành viên",
      tieuDoi: r.tieuDoi || "1",
      phone: r.phone || "",
      dob: r.dob || "",
    })));
  };

  return (
    <div className="stamp-border p-3 mb-3" style={{ background: "#fff" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <span className="f-display text-[11.5px] uppercase tracking-wider" style={{ color: T.amberDark }}>
          Nhập Quân số từ ảnh / tệp
        </span>
        <button onClick={onClose} title="Đóng"><X size={16} style={{ color: T.inkSoft }} /></button>
      </div>

      <div className="flex gap-2 mb-3">
        <Btn size="sm" variant={srcMode === "file" ? "solid" : "outline"} onClick={() => setSrcMode("file")}>
          <FileSpreadsheet size={13} /> Từ file Excel/CSV
        </Btn>
        <Btn size="sm" variant={srcMode === "image" ? "solid" : "outline"} onClick={() => setSrcMode("image")}>
          <ImageIcon size={13} /> Từ ảnh chụp (AI đọc chữ)
        </Btn>
      </div>

      {srcMode === "file" ? (
        <div>
          <p className="f-body text-[11px] italic mb-2" style={{ color: T.inkSoft }}>
            Chọn file Excel (.xlsx/.xls) hoặc CSV — đọc trực tiếp trong trình duyệt, không cần AI, chính xác 100%
            theo đúng dữ liệu trong file. Sau khi đọc xong, bạn chọn cột nào ứng với thông tin nào rồi tick dòng cần lấy.
          </p>
          <label className="f-display text-[11px] uppercase tracking-wider px-3 py-1.5 inline-flex items-center gap-1.5 cursor-pointer btn-press" style={{ border: `1px solid ${T.green}`, color: T.green }}>
            {fileBusy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {fileBusy ? "Đang đọc file…" : "Chọn file từ máy"}
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFilePicked} />
          </label>
          {fileName && <span className="f-body text-[11px] ml-2" style={{ color: T.inkSoft }}>Đã chọn: {fileName}</span>}
          {fileErr && <div className="f-body text-xs mt-2" style={{ color: T.red }}>{fileErr}</div>}

          {rawRows.length > 0 && (
            <>
              <label className="flex items-center gap-2 mt-3 f-body text-xs cursor-pointer" style={{ color: T.ink }}>
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                Dòng đầu tiên là tiêu đề cột (không lấy làm dữ liệu)
              </label>

              <div className="f-mono text-[10.5px] uppercase tracking-widest mt-3 mb-1" style={{ color: T.amberDark }}>Chọn cột nào ứng với thông tin nào</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
                {colMap.map((val, i) => (
                  <div key={i}>
                    <div className="f-body text-[10px] truncate mb-0.5" style={{ color: T.inkSoft }} title={rawRows[0]?.[i]}>
                      Cột {i + 1}{hasHeader && rawRows[0]?.[i] ? `: "${rawRows[0][i]}"` : ""}
                    </div>
                    <select
                      className={inputCls}
                      style={{ ...inputStyle, fontSize: "11.5px", padding: "4px 6px" }}
                      value={val}
                      onChange={(e) => setColMap((cm) => cm.map((v, ci) => (ci === i ? e.target.value : v)))}
                    >
                      {ROSTER_IMPORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div>
          <p className="f-body text-[11px] italic mb-2" style={{ color: T.inkSoft }}>
            Tải lên ảnh chụp danh sách (chữ in hoặc viết tay) — hệ thống dùng AI đọc chữ (OCR) để lấy thông tin.
            Tính năng này cần cấu hình API riêng trên máy chủ; nếu chưa cấu hình, hệ thống sẽ báo rõ bên dưới.
          </p>
          <UploadField onUploaded={(url) => { setImageUrl(url); setOcrRows(null); setOcrErr(""); setOcrNotConfigured(false); }} />
          {imageUrl && (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <img src={imageUrl} alt="Ảnh danh sách" className="w-16 h-16 object-cover stamp-border" />
              <Btn size="sm" onClick={runOCR} disabled={ocrBusy}>
                {ocrBusy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                {ocrBusy ? "Đang đọc ảnh…" : "Đọc dữ liệu từ ảnh"}
              </Btn>
            </div>
          )}
          {ocrNotConfigured && (
            <div className="f-body text-xs mt-3 p-2.5" style={{ background: "#F7E3E6", color: T.red, borderLeft: `3px solid ${T.red}` }}>
              Chưa cấu hình tính năng đọc ảnh (OCR) trên máy chủ. Cần thêm file API <code>api/ocr-roster.js</code> và
              biến môi trường <code>ANTHROPIC_API_KEY</code> trong cài đặt dự án trên Vercel rồi triển khai lại.
              Trong lúc chờ cấu hình, bạn có thể dùng cách "Từ file Excel/CSV" ở trên — làm được ngay, không cần AI.
            </div>
          )}
          {ocrErr && <div className="f-body text-xs mt-2" style={{ color: T.red }}>{ocrErr}</div>}
        </div>
      )}

      {previewRows.length > 0 && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 mt-4 mb-1.5">
            <span className="f-mono text-[11px] uppercase tracking-widest" style={{ color: T.amberDark }}>
              Xem trước — tick chọn dòng cần lấy ({checkedCount}/{previewRows.length})
            </span>
          </div>
          <div className="overflow-x-auto overflow-y-auto stamp-border" style={{ background: "#fff", maxHeight: 320 }}>
            <table className="w-full text-xs f-body table-lines table-grid">
              <thead>
                <tr className="f-mono text-[10px] uppercase tracking-wider" style={{ background: T.green, color: T.paper, position: "sticky", top: 0, zIndex: 1 }}>
                  <th className="px-2 py-1.5 w-8"></th>
                  <th className="text-left px-2 py-1.5">STT</th>
                  <th className="text-left px-2 py-1.5">Mã số</th>
                  <th className="text-left px-2 py-1.5 min-w-[110px]">Họ và tên</th>
                  <th className="text-left px-2 py-1.5">Chức vụ</th>
                  <th className="text-left px-2 py-1.5">Tiểu đội</th>
                  <th className="text-left px-2 py-1.5">Ngày sinh</th>
                  <th className="text-left px-2 py-1.5">SĐT</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 ? T.paper : "#fff" }}>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={Boolean(selectedRows[i])} onChange={() => toggleRow(i)} /></td>
                    {srcMode === "image" ? (
                      <>
                        <td className="px-1 py-1"><input className={inputCls} style={{ ...inputStyle, fontSize: "11px", padding: "3px 5px", width: 44 }} value={r.stt} onChange={(e) => editOcrRow(i, "stt", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className={inputCls} style={{ ...inputStyle, fontSize: "11px", padding: "3px 5px", width: 60 }} value={r.msv} onChange={(e) => editOcrRow(i, "msv", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className={inputCls} style={{ ...inputStyle, fontSize: "11px", padding: "3px 5px", minWidth: 110 }} value={r.name} onChange={(e) => editOcrRow(i, "name", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className={inputCls} style={{ ...inputStyle, fontSize: "11px", padding: "3px 5px", minWidth: 90 }} value={r.role} onChange={(e) => editOcrRow(i, "role", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className={inputCls} style={{ ...inputStyle, fontSize: "11px", padding: "3px 5px", width: 44 }} value={r.tieuDoi} onChange={(e) => editOcrRow(i, "tieuDoi", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className={inputCls} style={{ ...inputStyle, fontSize: "11px", padding: "3px 5px", width: 90 }} value={r.dob} onChange={(e) => editOcrRow(i, "dob", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className={inputCls} style={{ ...inputStyle, fontSize: "11px", padding: "3px 5px", width: 90 }} value={r.phone} onChange={(e) => editOcrRow(i, "phone", e.target.value)} /></td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-1.5 f-mono">{r.stt || "—"}</td>
                        <td className="px-2 py-1.5 f-mono">{r.msv || "—"}</td>
                        <td className="px-2 py-1.5 font-medium">
                          {r.name || <span className="italic" style={{ color: T.inkSoft }}>(thiếu tên — sẽ bị bỏ qua)</span>}
                          {isDup(r.name) && <span className="ml-1.5 f-mono text-[9.5px]" style={{ color: T.red }}>· Trùng tên đã có</span>}
                        </td>
                        <td className="px-2 py-1.5">{r.role || "—"}</td>
                        <td className="px-2 py-1.5 f-mono">{r.tieuDoi || "—"}</td>
                        <td className="px-2 py-1.5 f-mono">{formatDob(r.dob) || "—"}</td>
                        <td className="px-2 py-1.5 f-mono">{r.phone || "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Btn onClick={confirmImport} disabled={checkedCount === 0}>
              <CheckCircle2 size={14} /> Xác nhận, thêm {checkedCount} người vào Quân số
            </Btn>
            <Btn variant="outline" onClick={onClose}>Huỷ</Btn>
          </div>
        </>
      )}
    </div>
  );
}

function RosterTab({ perm, user }) {
  const { items, setItems, loading } = useSharedList("roster");
  const [form, setForm] = useState({ stt: "", msv: "", name: "", role: "Thành viên", tieuDoi: "1", phone: "", dob: "" });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [warn, setWarn] = useState("");
  const [editWarn, setEditWarn] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedSquad, setSelectedSquad] = useState("1");
  const [showImport, setShowImport] = useState(false);

  // Ô riêng ghi thông tin liên hệ Trung đội trưởng (Họ và tên, SĐT) — chỉ huy tự tuỳ chỉnh nhập
  const { value: leaderInfo, setValue: setLeaderInfo, loading: leaderLoading } = useSingleDoc("rosterLeaderInfo", {
    leaderName: "", leaderPhone: "",
  });
  const canEditLeaderInfo = perm.isAdmin || perm.isCommandRole;
  const [leaderForm, setLeaderForm] = useState(leaderInfo);
  const [showLeaderForm, setShowLeaderForm] = useState(false);
  useEffect(() => { setLeaderForm(leaderInfo); }, [leaderInfo.leaderName, leaderInfo.leaderPhone]);
  const saveLeaderInfo = async () => {
    await setLeaderInfo(leaderForm);
    setShowLeaderForm(false);
  };

  // Quyền sửa toàn bộ thông tin của mọi người trong trung đội (chỉ huy)
  const canEditAll = perm.isAdmin || perm.isCommandRole;

  // ---- Bật/tắt cho phép thành viên tự nhập thông tin của mình vào danh sách ----
  // Khi chỉ huy (Quản trị / Trung đội trưởng / Trung đội phó) bật chế độ này: mọi thành viên (kể cả chưa
  // có quyền quản lý) đều có thể tự thêm thông tin của chính mình vào danh sách. Khi tắt (mặc định),
  // chỉ Quản trị/Cán bộ được gán quyền mới thêm được thành viên mới — còn việc sửa thì ai có tên sẵn
  // trong danh sách chỉ người đó (hoặc chỉ huy) mới sửa được, như bình thường.
  const { value: selfEntryCfg, setValue: setSelfEntryCfg, loading: selfEntryLoading } = useSingleDoc("rosterSelfEntry", { open: false });
  const selfEntryOpen = Boolean(selfEntryCfg.open);
  const toggleSelfEntry = async () => { await setSelfEntryCfg({ open: !selfEntryOpen }); };
  const hasOwnEntry = items.some((m) => perm.isOwner(m.name));
  const canSelfAdd = selfEntryOpen && !perm.canManage && !hasOwnEntry;
  const canAddMember = perm.canManage || canSelfAdd;

  const openForm = () => {
    setForm(
      canSelfAdd
        ? { stt: "", msv: "", name: user, role: "Thành viên", tieuDoi: "1", phone: "", dob: "" }
        : { stt: "", msv: "", name: "", role: "Thành viên", tieuDoi: "1", phone: "", dob: "" }
    );
    setWarn("");
    setShowForm(true);
  };

  const add = async () => {
    if (!canAddMember) { setWarn("Bạn không có quyền thêm thành viên vào lúc này."); return; }
    const missing =
      !String(form.stt).trim() || !form.name.trim() || !form.role.trim() ||
      !form.tieuDoi.trim() || !form.phone.trim() || !form.dob.trim();
    if (missing) { setWarn("Bạn chưa nhập gì — vui lòng điền đầy đủ các mục có dấu * trước khi lưu."); return; }
    // Thành viên tự nhập (không có quyền quản lý) chỉ được thêm đúng thông tin của chính mình
    const finalForm = perm.canManage ? form : { ...form, name: user };
    if (items.some((m) => normalizeName(m.name) === normalizeName(finalForm.name))) {
      setWarn(`Thành viên "${finalForm.name}" đã có tên trong danh sách — không thể lưu trùng.`);
      return;
    }
    setWarn("");
    await setItems([...items, { id: Date.now(), ...finalForm }]);
    setForm({ stt: "", msv: "", name: "", role: "Thành viên", tieuDoi: "1", phone: "", dob: "" });
    setShowForm(false);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = (id) => setSelectedId((s) => (s === id ? null : id));

  // Sửa được dòng của chính mình (dù không phải chỉ huy)
  const canEditRow = (m) => canEditAll || perm.isOwner(m.name);

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditForm({ stt: m.stt || "", msv: m.msv || "", name: m.name || "", role: m.role || "Thành viên", tieuDoi: m.tieuDoi || "1", phone: m.phone || "", dob: m.dob || "" });
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  const saveEdit = async () => {
    if (!editForm.name.trim()) { setEditWarn("Vui lòng nhập Họ và tên trước khi lưu."); return; }
    setEditWarn("");
    const original = items.find((i) => i.id === editingId);
    if (!original) return;
    // Chỉ Quản trị / TĐT / TĐP mới được đổi Chức vụ và Tiểu đội; người tự sửa chỉ đổi các thông tin cá nhân.
    const merged = canEditAll
      ? { ...original, stt: editForm.stt, msv: editForm.msv, name: editForm.name, role: editForm.role, tieuDoi: editForm.tieuDoi, phone: editForm.phone, dob: editForm.dob }
      : { ...original, stt: editForm.stt, msv: editForm.msv, name: editForm.name, phone: editForm.phone, dob: editForm.dob };
    await setItems(items.map((i) => (i.id === editingId ? merged : i)));
    cancelEdit();
  };

  // Sắp xếp theo STT tăng dần (người chưa nhập STT sẽ xếp cuối bảng)
  const sortedItems = [...items].sort((a, b) => {
    const na = a.stt === "" || a.stt === undefined || a.stt === null ? Infinity : Number(a.stt);
    const nb = b.stt === "" || b.stt === undefined || b.stt === null ? Infinity : Number(b.stt);
    if (na !== nb) return na - nb;
    return 0;
  });

  // Lọc theo ô tìm kiếm (không phân biệt hoa/thường), tìm theo mọi thông tin hiển thị trên bảng
  const q = search.trim().toLowerCase();
  const filteredItems = q
    ? sortedItems.filter((m) => {
        const haystack = [m.stt, m.msv, m.name, m.role, m.tieuDoi ? `tiểu đội ${m.tieuDoi}` : "", m.phone, formatDob(m.dob)]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : sortedItems;

  // ---- Danh sách theo tiểu đội: tự động lấy dữ liệu từ danh sách trung đội, chia theo 4 tiểu đội ----
  // Thứ tự trong mỗi tiểu đội: #1 = Tiểu đội trưởng, #2 = Tiểu đội phó, còn lại là thành viên đánh số
  // tiếp theo tăng dần (3, 4, 5…) theo đúng thứ tự STT của danh sách trung đội. Trung đội trưởng/phó
  // thuộc tiểu đội nào thì được xếp vào phần thành viên của tiểu đội đó, kèm chú thích đúng chức vụ
  // của họ (không chiếm vị trí Tiểu đội trưởng/phó).
  const squadAll = sortedItems.filter((m) => (m.tieuDoi || "1") === selectedSquad);
  const squadLeader = squadAll.filter((m) => hasRole(m.role, "Tiểu đội trưởng"));
  const squadDeputy = squadAll.filter((m) => hasRole(m.role, "Tiểu đội phó"));
  const squadOthers = squadAll.filter((m) => !hasRole(m.role, "Tiểu đội trưởng") && !hasRole(m.role, "Tiểu đội phó"));
  const squadOrdered = [...squadLeader, ...squadDeputy, ...squadOthers];
  // Tổng quân số của từng tiểu đội (1 → 4), hiển thị kèm nút chọn tiểu đội
  const squadCounts = ["1", "2", "3", "4"].reduce((acc, s) => {
    acc[s] = items.filter((m) => (m.tieuDoi || "1") === s).length;
    return acc;
  }, {});

  return (
    <div>
      <SectionHeader compact icon={Users} eyebrow={`Quân số: ${items.length}`} title="Danh sách trung đội"
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {canAddMember && (
              <Btn size="sm" variant="outline" onClick={() => setShowImport((s) => !s)}>
                <Upload size={14} /> Nhập từ ảnh/tệp
              </Btn>
            )}
            {canAddMember && (
              <Btn size="sm" onClick={() => (showForm ? setShowForm(false) : openForm())}><Plus size={14} /> {perm.canManage ? "Thêm thành viên" : "Thêm thông tin của tôi"}</Btn>
            )}
          </div>
        } />

      {canAddMember && showImport && (
        <RosterImportPanel
          existingItems={items}
          onClose={() => setShowImport(false)}
          onConfirm={async (newRows) => {
            const filtered = newRows.filter((r) => !items.some((m) => normalizeName(m.name) === normalizeName(r.name)));
            await setItems([...items, ...filtered]);
            setShowImport(false);
          }}
        />
      )}

      {/* ---- Bật/tắt cho phép thành viên tự nhập thông tin của mình ---- */}
      {canEditAll && (
        <div className="stamp-border p-3 mb-3" style={{ background: "#FBF3DD" }}>
          <div className="f-display text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.amberDark }}>Cho phép tự nhập thông tin quân số</div>
          <div className="flex flex-wrap items-center gap-3">
            <Btn size="sm" variant={selfEntryOpen ? "danger" : "outline"} onClick={toggleSelfEntry} disabled={selfEntryLoading}>
              {selfEntryOpen ? "Đang mở — bấm để đóng" : "Mở cho thành viên tự nhập"}
            </Btn>
          </div>
          <p className="f-body text-[10.5px] leading-snug mt-1.5" style={{ color: T.inkSoft }}>
            Khi mở, mọi thành viên (kể cả chưa được gán quyền quản lý) có thể tự thêm thông tin của chính mình
            vào danh sách quân số. Khi đóng (mặc định), chỉ Quản trị / Cán bộ được gán quyền mới thêm được
            thành viên mới — còn việc sửa thông tin từng dòng thì chỉ người có tên sẵn trong danh sách (hoặc chỉ huy)
            mới sửa được của chính dòng đó.
          </p>
        </div>
      )}

      {selfEntryOpen && !perm.canManage && (
        <div className="f-body text-xs mb-3 px-3 py-2 flex items-center gap-2" style={{ background: T.amber, color: T.greenDark }}>
          <Users size={14} />
          {hasOwnEntry
            ? <span>Chỉ huy đang cho phép tự nhập thông tin — bạn đã có thông tin trong danh sách, bấm biểu tượng bút chì ở dòng của mình để chỉnh sửa.</span>
            : <span>Chỉ huy đang cho phép tự nhập thông tin — bấm "Thêm thông tin của tôi" để tự thêm thông tin của bạn vào danh sách.</span>}
        </div>
      )}

      {/* ---- Ô riêng: thông tin liên hệ Trung đội trưởng ---- */}
      <div className="stamp-border p-3 mb-3" style={{ background: "#fff" }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="f-display text-[11.5px] uppercase tracking-wider" style={{ color: T.amberDark }}>Liên hệ Trung đội trưởng</span>
          {canEditLeaderInfo && (
            <Btn size="sm" variant="outline" onClick={() => setShowLeaderForm((s) => !s)}>
              <Pencil size={12} /> {leaderInfo.leaderName ? "Sửa thông tin" : "Nhập thông tin"}
            </Btn>
          )}
        </div>

        {canEditLeaderInfo && showLeaderForm && (
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2.5 p-2.5" style={{ background: T.paper, border: `1px solid ${T.paperDark}` }}>
            <Field label="Họ và tên Trung đội trưởng">
              <input className={inputCls} style={inputStyle} value={leaderForm.leaderName} onChange={(e) => setLeaderForm({ ...leaderForm, leaderName: e.target.value })} placeholder="VD: Nguyễn Văn A" />
            </Field>
            <Field label="Số điện thoại liên hệ">
              <input className={inputCls} style={inputStyle} value={leaderForm.leaderPhone} onChange={(e) => setLeaderForm({ ...leaderForm, leaderPhone: e.target.value })} placeholder="VD: 0912345678" />
            </Field>
            <div className="md:col-span-2"><Btn size="sm" onClick={saveLeaderInfo}>Lưu thông tin</Btn></div>
          </div>
        )}

        {!leaderLoading && !showLeaderForm && (
          leaderInfo.leaderName ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1.5">
              <span className="f-body text-xs" style={{ color: T.ink }}>
                Trung đội trưởng: <b>{leaderInfo.leaderName}</b>
              </span>
              {leaderInfo.leaderPhone && (
                <span className="f-mono text-[10.5px]" style={{ color: T.inkSoft }}>SĐT: {leaderInfo.leaderPhone}</span>
              )}
            </div>
          ) : (
            <div className="f-body text-[10.5px] italic mt-1.5" style={{ color: T.inkSoft }}>Chưa cập nhật thông tin liên hệ Trung đội trưởng.</div>
          )
        )}
      </div>

      <div className="flex justify-end mb-1.5 -mt-1">
        <button
          onClick={() => setSearchOpen((s) => { const next = !s; if (!next) setSearch(""); return next; })}
          title="Tìm kiếm"
          aria-label="Tìm kiếm"
          className="p-2 rounded-full btn-press"
          style={{ background: searchOpen ? T.amber : "transparent", color: searchOpen ? T.greenDark : T.green, border: `1px solid ${T.green}` }}
        >
          <Search size={16} />
        </button>
      </div>

      {searchOpen && (
        <div className="mb-2.5 relative">
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.inkSoft }} />
          <input
            autoFocus
            className={inputCls}
            style={{ ...inputStyle, paddingLeft: 32 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo STT, mã số, họ tên, chức vụ, tiểu đội, SĐT, ngày sinh…"
          />
        </div>
      )}

      {canAddMember && showForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={warn} /></div>
          <Field label="Số thứ tự (STT)" required><input type="number" className={inputCls} style={inputStyle} value={form.stt} onChange={(e) => setForm({ ...form, stt: e.target.value })} placeholder="VD: 1" /></Field>
          <Field label="Mã số học viên"><input className={inputCls} style={inputStyle} value={form.msv} onChange={(e) => setForm({ ...form, msv: e.target.value })} /></Field>
          <Field label="Họ và tên" required>
            <input className={inputCls} style={inputStyle} value={form.name} disabled={!perm.canManage} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Chức vụ" required>
            <RoleMultiSelect value={form.role} onChange={(v) => setForm({ ...form, role: v })} />
          </Field>
          <Field label="Tiểu đội" required>
            <select className={inputCls} style={inputStyle} value={form.tieuDoi} onChange={(e) => setForm({ ...form, tieuDoi: e.target.value })}>
              <option value="1">Tiểu đội 1</option><option value="2">Tiểu đội 2</option>
              <option value="3">Tiểu đội 3</option><option value="4">Tiểu đội 4</option>
            </select>
          </Field>
          <Field label="Số điện thoại" required><input className={inputCls} style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Ngày tháng năm sinh" required><input type="date" className={inputCls} style={inputStyle} value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
          {!perm.canManage && (
            <div className="md:col-span-2 f-body text-xs italic" style={{ color: T.inkSoft }}>
              Bạn đang tự nhập thông tin của chính mình — riêng Họ và tên được khoá theo đúng tên đăng nhập.
            </div>
          )}
          <div className="md:col-span-2"><Btn onClick={add}>{perm.canManage ? "Lưu" : "Lưu thông tin của tôi"}</Btn></div>
        </div>
      )}

      {editingId && editForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#FBF3DD" }}>
          <div className="md:col-span-2 f-display text-xs uppercase tracking-widest" style={{ color: T.amberDark }}>
            Đang chỉnh sửa thông tin: {editForm.name || "—"}
          </div>
          <div className="md:col-span-2"><FormWarning message={editWarn} /></div>
          <Field label="Số thứ tự (STT)"><input type="number" className={inputCls} style={inputStyle} value={editForm.stt} onChange={(e) => setEditForm({ ...editForm, stt: e.target.value })} placeholder="VD: 1" /></Field>
          <Field label="Mã số học viên"><input className={inputCls} style={inputStyle} value={editForm.msv} onChange={(e) => setEditForm({ ...editForm, msv: e.target.value })} /></Field>
          <Field label="Họ và tên" required><input className={inputCls} style={inputStyle} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
          <Field label="Chức vụ">
            <RoleMultiSelect value={editForm.role} onChange={(v) => setEditForm({ ...editForm, role: v })} disabled={!canEditAll} />
          </Field>
          <Field label="Tiểu đội">
            <select className={inputCls} style={inputStyle} value={editForm.tieuDoi} disabled={!canEditAll} onChange={(e) => setEditForm({ ...editForm, tieuDoi: e.target.value })}>
              <option value="1">Tiểu đội 1</option><option value="2">Tiểu đội 2</option>
              <option value="3">Tiểu đội 3</option><option value="4">Tiểu đội 4</option>
            </select>
          </Field>
          <Field label="Số điện thoại"><input className={inputCls} style={inputStyle} value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></Field>
          <Field label="Ngày tháng năm sinh"><input type="date" className={inputCls} style={inputStyle} value={editForm.dob} onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })} /></Field>
          {!canEditAll && (
            <div className="md:col-span-2 f-body text-xs italic" style={{ color: T.inkSoft }}>
              Bạn chỉ có thể tự điều chỉnh thông tin cá nhân của mình khi có sai sót. Chức vụ và Tiểu đội do Quản trị / Trung đội trưởng / Trung đội phó thay đổi.
            </div>
          )}
          <div className="md:col-span-2 flex gap-2">
            <Btn onClick={saveEdit}>Lưu thay đổi</Btn>
            <Btn variant="outline" onClick={cancelEdit}>Huỷ</Btn>
          </div>
        </div>
      )}

      {loading ? <LoadingRow /> : items.length === 0 ? <EmptyState text="Chưa có dữ liệu quân số." /> : filteredItems.length === 0 ? (
        <EmptyState text="Không tìm thấy thành viên nào khớp với từ khoá tìm kiếm." />
      ) : (
        <div className="overflow-x-auto overflow-y-auto stamp-border card-sheet" style={{ background: "#fff", maxHeight: 370 }}>
          <table className="w-full f-body table-lines" style={{ fontSize: "12.5px" }}>
            <thead>
              <tr className="f-mono text-[9.5px] uppercase tracking-widest" style={{ background: T.green, color: T.paper, position: "sticky", top: 0, zIndex: 1 }}>
                <th className="text-left px-2.5 py-2 w-8" style={{ borderRight: "1px solid rgba(237,230,214,0.25)" }}>STT</th>
                <th className="text-left px-2.5 py-2" style={{ borderRight: "1px solid rgba(237,230,214,0.25)" }}>Mã số</th>
                <th className="text-left px-2.5 py-2 min-w-[110px]" style={{ borderRight: "1px solid rgba(237,230,214,0.25)" }}>Họ tên</th>
                <th className="text-left px-2.5 py-2 min-w-[90px]" style={{ borderRight: "1px solid rgba(237,230,214,0.25)" }}>Chức vụ</th>
                <th className="text-left px-2.5 py-2 whitespace-nowrap" style={{ borderRight: "1px solid rgba(237,230,214,0.25)" }}>Tiểu đội</th>
                <th className="text-left px-2.5 py-2" style={{ borderRight: "1px solid rgba(237,230,214,0.25)" }}>Năm sinh</th>
                <th className="text-left px-2.5 py-2" style={{ borderRight: "1px solid rgba(237,230,214,0.25)" }}>SĐT</th>
                <th className="px-2.5 py-2 w-14"></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((m, i) => (
                <tr
                  key={m.id}
                  onClick={() => toggleSelect(m.id)}
                  className="cursor-pointer"
                  style={withSelect({ background: i % 2 ? T.paper : "#fff", borderBottom: `1px solid ${T.paperDark}` }, selectedId === m.id)}
                >
                  <td className="px-2.5 py-2 f-mono font-bold" style={{ color: T.ink, borderRight: `1px solid ${T.paperDark}` }}>{m.stt || "—"}</td>
                  <td className="px-2.5 py-2 f-mono" style={{ color: T.inkSoft, borderRight: `1px solid ${T.paperDark}` }}>{m.msv || "—"}</td>
                  <td className="px-2.5 py-2 font-bold text-[11px] leading-tight" style={{ borderRight: `1px solid ${T.paperDark}` }}>{m.name}</td>
                  <td className="px-2.5 py-2 text-[11px] leading-tight" style={{ color: T.inkSoft, borderRight: `1px solid ${T.paperDark}` }}>{roleDisplay(m.role)}</td>
                  <td className="px-2.5 py-2 f-mono whitespace-nowrap" style={{ borderRight: `1px solid ${T.paperDark}` }}>{m.tieuDoi ? `Tiểu đội ${m.tieuDoi}` : "—"}</td>
                  <td className="px-2.5 py-2 f-mono" style={{ borderRight: `1px solid ${T.paperDark}` }}>{formatDob(m.dob)}</td>
                  <td className="px-2.5 py-2 f-mono" style={{ borderRight: `1px solid ${T.paperDark}` }}>{m.phone || "—"}</td>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {canEditRow(m) && (
                        <button onClick={() => startEdit(m)} title="Sửa thông tin">
                          <Pencil size={13} style={{ color: T.green }} />
                        </button>
                      )}
                      {perm.canManage && (
                        <button onClick={() => remove(m.id)} title="Xoá">
                          <Trash2 size={13} style={{ color: T.red }} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Danh sách theo tiểu đội (tự động lấy dữ liệu từ danh sách trung đội ở trên) ---- */}
      <div className="my-8" style={{ borderTop: `1px dashed ${T.paperDark}` }} />
      <SectionHeader icon={Users} eyebrow={`Tiểu đội ${selectedSquad}: ${squadOrdered.length} thành viên`} title="Danh sách tiểu đội" />
      <p className="f-body text-xs mb-4 -mt-2" style={{ color: T.inkSoft }}>
        Số 1 là Tiểu đội trưởng, số 2 là Tiểu đội phó, còn lại là thành viên đánh số tiếp theo tăng dần. Riêng Trung đội trưởng / Trung đội phó
        thuộc tiểu đội nào sẽ được xếp vào thành viên của tiểu đội đó, kèm chú thích đúng chức vụ của họ.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {["1", "2", "3", "4"].map((s) => (
          <button
            key={s}
            onClick={() => setSelectedSquad(s)}
            className="f-display text-xs uppercase tracking-wide px-4 py-2 btn-press rounded-sm inline-flex items-center gap-1.5"
            style={{
              background: selectedSquad === s ? T.amber : "transparent",
              color: selectedSquad === s ? T.greenDark : T.green,
              border: `1px solid ${T.green}`,
            }}
          >
            Tiểu đội {s}
            <span
              className="f-mono inline-flex items-center justify-center rounded-full"
              style={{
                background: selectedSquad === s ? T.greenDark : T.green,
                color: T.paper,
                minWidth: 18, height: 18, fontSize: 9.5, fontWeight: 700, padding: "0 4px",
              }}
            >
              {squadCounts[s]}
            </span>
          </button>
        ))}
      </div>

      {loading ? <LoadingRow /> : squadOrdered.length === 0 ? (
        <EmptyState text={`Chưa có thành viên nào thuộc Tiểu đội ${selectedSquad}.`} />
      ) : (
        <div className="stamp-border card-sheet" style={{ background: "#fff" }}>
          {squadOrdered.map((m, i) => {
            const isSquadCommand = hasRole(m.role, "Tiểu đội trưởng") || hasRole(m.role, "Tiểu đội phó");
            const isPlatoonCommand = hasRole(m.role, "Trung đội trưởng") || hasRole(m.role, "Trung đội phó");
            return (
              <div
                key={m.id}
                onClick={() => toggleSelect(m.id)}
                className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap cursor-pointer"
                style={withSelect({ borderBottom: i < squadOrdered.length - 1 ? `1px solid ${T.paperDark}` : "none" }, selectedId === m.id)}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="f-mono text-xs font-semibold w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: isSquadCommand ? T.amber : "rgba(31,51,40,0.08)",
                      color: isSquadCommand ? T.greenDark : T.green,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <div className="f-body text-sm font-medium flex items-center gap-1.5 flex-wrap" style={{ color: T.ink }}>
                      {m.name}
                      {isPlatoonCommand && (
                        <span
                          className="f-display text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
                          style={{ background: T.green, color: T.paper }}
                        >
                          {roleDisplay(m.role)}
                        </span>
                      )}
                    </div>
                    <div className="f-mono text-[10.5px]" style={{ color: T.inkSoft }}>
                      {!isPlatoonCommand ? roleDisplay(m.role) : "Thành viên"}{m.msv ? ` · ${m.msv}` : ""}
                    </div>
                  </div>
                </div>
                <div className="f-mono text-xs shrink-0" style={{ color: T.inkSoft }}>{m.phone || "—"}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============ TAB: LỊCH HỌC ============ */
/* ============ TAB: LỊCH HỌC / LỊCH THI (chỉ còn phụ lục theo tuần) ============
   Giống hệt cơ chế của "Trực cuối tuần": mỗi phụ lục có khoảng ngày áp dụng (từ ngày → đến ngày).
   Hệ thống tự chọn phụ lục "hiện hành" theo ngày hôm nay; khi qua ngày cuối cùng của phụ lục hiện tại,
   tự động chuyển sang phụ lục kế tiếp (nếu đã tạo) — nhưng vẫn chọn lại được để xem các tuần cũ.
   Sửa (bút chì) chỉ dành cho chỉ huy (Quản trị / Trung đội trưởng / Trung đội phó) khi có sai sót.
*/
function StudyScheduleTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("studyAppendix");
  return (
    <div>
      <StudyAppendixSection
        user={user} perm={perm} loading={loading} allItems={items} setAllItems={setItems}
        type="Lịch học" icon={CalendarDays} title="Phụ lục lịch học theo tuần" accent={T.green}
      />
      <div className="my-8" style={{ borderTop: `1px dashed ${T.paperDark}` }} />
      <StudyAppendixSection
        user={user} perm={perm} loading={loading} allItems={items} setAllItems={setItems}
        type="Lịch thi" icon={ClipboardCheck} title="Phụ lục lịch thi theo tuần" accent={T.amberDark}
      />
    </div>
  );
}

/* ============ PHỤ LỤC LỊCH HỌC / LỊCH THI THEO TUẦN (tách riêng, mỗi loại tự theo dõi tuần hiện tại) ============
   Giống hệt cơ chế của "Trực cuối tuần": mỗi phụ lục có khoảng ngày áp dụng (từ ngày → đến ngày).
   Hệ thống tự chọn phụ lục "hiện hành" theo ngày hôm nay (riêng cho từng loại Lịch học / Lịch thi);
   khi qua ngày cuối cùng của phụ lục hiện tại, tự động chuyển sang phụ lục kế tiếp (nếu đã tạo)
   — nhưng vẫn chọn lại được để xem các tuần cũ. Sửa (bút chì) chỉ dành cho chỉ huy khi có sai sót.
*/
function StudyAppendixSection({ user, perm, loading, allItems, setAllItems, type, icon: Icon, title, accent }) {
  const items = allItems.filter((e) => (e.type || "Lịch học") === type);
  const [form, setForm] = useState({ title: "", from: "", to: "", url: "", note: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editErr, setEditErr] = useState("");
  const isImage = (u) => /\.(png|jpe?g|gif|webp)$/i.test(u || "");

  // Chỉ chỉ huy (Quản trị / Trung đội trưởng / Trung đội phó) mới sửa được phụ lục khi có sai sót
  const canEdit = perm.isAdmin || perm.isCommandRole;

  const todayStr = new Date().toISOString().slice(0, 10);

  // Phụ lục "hiện hành" theo ngày hôm nay: đang trong khoảng áp dụng → nếu không có thì phụ lục gần nhất sắp tới →
  // nếu cũng không có thì phụ lục gần nhất vừa hết hạn → cuối cùng là phụ lục đầu tiên nếu chỉ có 1.
  const computeCurrentId = (list) => {
    if (list.length === 0) return null;
    const active = list.find((e) => e.from && e.to && e.from <= todayStr && todayStr <= e.to);
    if (active) return active.id;
    const upcoming = [...list].filter((e) => e.from > todayStr).sort((a, b) => a.from.localeCompare(b.from))[0];
    if (upcoming) return upcoming.id;
    const past = [...list].filter((e) => e.to < todayStr).sort((a, b) => b.to.localeCompare(a.to))[0];
    return past ? past.id : list[0].id;
  };

  const currentId = computeCurrentId(items);
  const [viewId, setViewId] = useState(currentId);
  const prevCurrentRef = useRef(currentId);

  useEffect(() => {
    // Đang xem đúng phụ lục hiện hành cũ, và phụ lục hiện hành vừa đổi (qua ngày mới / vừa tạo phụ lục mới) → tự chuyển theo
    if (viewId === prevCurrentRef.current && currentId !== prevCurrentRef.current) {
      setViewId(currentId);
    }
    // Phụ lục đang xem đã bị xoá → quay về phụ lục hiện hành
    if (viewId && !items.find((e) => e.id === viewId)) {
      setViewId(currentId);
    }
    prevCurrentRef.current = currentId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, items.length]);

  const add = async () => {
    if (!form.title.trim() || !form.from || !form.to) { setWarn("Vui lòng nhập đủ Tên phụ lục, Áp dụng từ ngày và Đến ngày trước khi lưu."); return; }
    setWarn("");
    const newEntry = { id: Date.now(), ...form, type, by: user };
    await setAllItems([newEntry, ...allItems]);
    setForm({ title: "", from: "", to: "", url: "", note: "" });
    setShowForm(false);
    setViewId(newEntry.id);
  };
  const remove = async (id) => setAllItems(allItems.filter((i) => i.id !== id));

  const startEdit = (a) => {
    setEditingId(a.id);
    setEditForm({ title: a.title || "", from: a.from || "", to: a.to || "", url: a.url || "", note: a.note || "" });
    setEditErr("");
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); setEditErr(""); };
  const saveEdit = async () => {
    if (!editForm.title.trim() || !editForm.from || !editForm.to) { setEditErr("Vui lòng nhập đủ Tên phụ lục, Áp dụng từ ngày và Đến ngày (mục có dấu *) trước khi lưu."); return; }
    setEditErr("");
    await setAllItems(allItems.map((i) => (i.id === editingId ? { ...i, ...editForm } : i)));
    cancelEdit();
  };

  // Danh sách để chọn lại (mới nhất trước)
  const sortedEntries = [...items].sort((a, b) => (b.from || "").localeCompare(a.from || ""));
  const viewEntry = items.find((e) => e.id === viewId) || null;
  const entryLabel = (e) =>
    `${e.title || "—"} (${e.from ? new Date(e.from).toLocaleDateString("vi-VN") : "—"} → ${e.to ? new Date(e.to).toLocaleDateString("vi-VN") : "—"})` +
    (e.to && e.to < todayStr ? "  (đã qua)" : e.from && e.from > todayStr ? "  (sắp tới)" : "  (tuần hiện tại)");

  return (
    <div>
      <SectionHeader icon={Icon} eyebrow="Phụ lục" title={title}
        action={perm.canManage && <Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Thêm phụ lục</Btn>} />

      {perm.canManage && showForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={warn} /></div>
          <div className="md:col-span-2"><Field label="Tên phụ lục" required><input className={inputCls} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={type === "Lịch thi" ? "VD: Lịch thi tuần 3 tháng 7" : "VD: Lịch học tuần 3 tháng 7"} /></Field></div>
          <Field label="Áp dụng từ ngày" required><input type="date" className={inputCls} style={inputStyle} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></Field>
          <Field label="Đến ngày" required><input type="date" className={inputCls} style={inputStyle} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
          <div className="md:col-span-2">
            <Field label="Link ảnh hoặc file lịch tuần (chụp bảng lịch, Google Drive…)">
              <input className={inputCls} style={inputStyle} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
              <UploadField onUploaded={(url) => setForm((f) => ({ ...f, url }))} />
            </Field>
          </div>
          <div className="md:col-span-2"><Field label="Ghi chú"><input className={inputCls} style={inputStyle} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field></div>
          <div className="md:col-span-2"><Btn onClick={add}>Lưu phụ lục</Btn></div>
        </div>
      )}

      {loading ? <LoadingRow /> : items.length === 0 ? <EmptyState text={type === "Lịch thi" ? "Chưa có phụ lục lịch thi theo tuần nào." : "Chưa có phụ lục lịch học theo tuần nào."} /> : (
        <>
          <div className="mb-4 max-w-md">
            <Field label="Xem theo tuần (tự chuyển sang tuần hiện tại khi hết hạn — chọn lại để xem tuần cũ)">
              <select className={inputCls} style={inputStyle} value={viewId || ""} onChange={(e) => setViewId(Number(e.target.value))}>
                {sortedEntries.map((e) => (
                  <option key={e.id} value={e.id}>{entryLabel(e)}</option>
                ))}
              </select>
            </Field>
          </div>

          {viewEntry && editingId === viewEntry.id && editForm ? (
            <div className="stamp-border p-4 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#FBF3DD" }}>
              <div className="md:col-span-2 f-display text-xs uppercase tracking-widest" style={{ color: T.amberDark }}>Đang sửa phụ lục (khắc phục sai sót)</div>
              <div className="md:col-span-2"><FormWarning message={editErr} /></div>
              <div className="md:col-span-2"><Field label="Tên phụ lục" required><input className={inputCls} style={inputStyle} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></Field></div>
              <Field label="Áp dụng từ ngày" required><input type="date" className={inputCls} style={inputStyle} value={editForm.from} onChange={(e) => setEditForm({ ...editForm, from: e.target.value })} /></Field>
              <Field label="Đến ngày" required><input type="date" className={inputCls} style={inputStyle} value={editForm.to} onChange={(e) => setEditForm({ ...editForm, to: e.target.value })} /></Field>
              <div className="md:col-span-2">
                <Field label="Link ảnh hoặc file lịch tuần">
                  <input className={inputCls} style={inputStyle} value={editForm.url} onChange={(e) => setEditForm({ ...editForm, url: e.target.value })} placeholder="https://…" />
                  <UploadField onUploaded={(url) => setEditForm((f) => ({ ...f, url }))} />
                </Field>
              </div>
              <div className="md:col-span-2"><Field label="Ghi chú"><input className={inputCls} style={inputStyle} value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} /></Field></div>
              <div className="md:col-span-2 flex gap-2"><Btn onClick={saveEdit}>Lưu thay đổi</Btn><Btn variant="outline" onClick={cancelEdit}>Huỷ</Btn></div>
            </div>
          ) : viewEntry ? (
            <div className="p-4" style={{ background: "#fff", borderLeft: `4px solid ${accent}` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="f-display text-[10px] uppercase tracking-wider px-2 py-0.5" style={{ background: accent, color: "#fff" }}>{type}</span>
                    <h3 className="f-display font-semibold text-sm" style={{ color: T.green }}>{viewEntry.title}</h3>
                  </div>
                  <div className="f-mono text-[11px] mt-1" style={{ color: T.inkSoft }}>
                    Áp dụng {new Date(viewEntry.from).toLocaleDateString("vi-VN")} → {new Date(viewEntry.to).toLocaleDateString("vi-VN")}
                  </div>
                  {viewEntry.note && <div className="f-body text-xs mt-1" style={{ color: T.inkSoft }}>{viewEntry.note}</div>}
                  {viewEntry.url && (
                    isImage(viewEntry.url) ? (
                      <div className="mt-2">
                        <a href={viewEntry.url} target="_blank" rel="noreferrer" className="block">
                          <img src={viewEntry.url} alt={viewEntry.title} className="max-w-full sm:max-w-xs max-h-64 stamp-border" />
                        </a>
                        <a href={viewEntry.url} onClick={(e) => { e.preventDefault(); forceDownload(viewEntry.url, viewEntry.title); }} className="f-mono text-[11px] underline inline-flex items-center gap-1 mt-1.5 cursor-pointer" style={{ color: T.green }}>
                          <Download size={11} /> Tải ảnh về máy
                        </a>
                      </div>
                    ) : (
                      <a href={viewEntry.url} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all mt-2 inline-flex items-center gap-1" style={{ color: T.green }}>
                        <Paperclip size={12} /> Xem file phụ lục
                      </a>
                    )
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canEdit && <button onClick={() => startEdit(viewEntry)} title="Sửa phụ lục khi có sai sót"><Pencil size={14} style={{ color: T.green }} /></button>}
                  {perm.canManage && <button onClick={() => remove(viewEntry.id)} title="Xoá"><Trash2 size={14} style={{ color: T.red }} /></button>}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ============ TAB: LỊCH TRỰC (+ PHÂN CÔNG TRỰC CHỐT) ============ */
function DutyScheduleTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("schedule");
  const roster = useSharedList("roster");
  const [warn, setWarn] = useState("");
  const isImage = (u) => /\.(png|jpe?g|gif|webp)$/i.test(u || "");

  // ---- Trực chỉ huy trung đội ----
  // Chọn người trực chỉ huy từ danh sách Trung đội trưởng/Trung đội phó có sẵn trong Quân số (không tự nhập tên).
  // Mỗi lượt trực có khung thời gian (từ giờ/ngày → đến giờ/ngày). Khi ngày hệ thống qua khỏi "đến ngày",
  // trang tự động chuyển sang lượt trực hiện hành/kế tiếp — giống Phụ lục trực cuối tuần.
  // Dữ liệu các lượt trực cũ KHÔNG bị xoá — được giữ lại để quy trách nhiệm, chỉ xem lại chứ không xoá được.
  const commanderCandidates = roster.items.filter((m) => hasRole(m.role, "Trung đội trưởng") || hasRole(m.role, "Trung đội phó"));
  const duty = items.filter((i) => i.type === "Trực ban");
  const todayStr = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({ commanderName: "", fromDate: "", fromTime: "07:00", toDate: "", toTime: "07:00", ghiChu: "", url: "" });
  const [showForm, setShowForm] = useState(false);

  const computeCurrentId = (list) => {
    if (list.length === 0) return null;
    const active = list.find((e) => e.fromDate && e.toDate && e.fromDate <= todayStr && todayStr <= e.toDate);
    if (active) return active.id;
    const upcoming = [...list].filter((e) => e.fromDate > todayStr).sort((a, b) => a.fromDate.localeCompare(b.fromDate))[0];
    if (upcoming) return upcoming.id;
    const past = [...list].filter((e) => e.toDate < todayStr).sort((a, b) => b.toDate.localeCompare(a.toDate))[0];
    return past ? past.id : list[0].id;
  };

  const currentDutyId = computeCurrentId(duty);
  const [viewDutyId, setViewDutyId] = useState(currentDutyId);
  const prevDutyDefaultRef = useRef(currentDutyId);

  useEffect(() => {
    if (viewDutyId === prevDutyDefaultRef.current && currentDutyId !== prevDutyDefaultRef.current) {
      setViewDutyId(currentDutyId);
    }
    if (viewDutyId && !duty.find((e) => e.id === viewDutyId)) {
      setViewDutyId(currentDutyId);
    }
    prevDutyDefaultRef.current = currentDutyId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDutyId, duty.length]);

  const add = async () => {
    if (!form.commanderName || !form.fromDate || !form.toDate) {
      setWarn("Vui lòng chọn đủ Trực chỉ huy, Từ ngày và Đến ngày trước khi lưu.");
      return;
    }
    setWarn("");
    const newEntry = { id: Date.now(), ...form, type: "Trực ban", by: user };
    await setItems([...items, newEntry]);
    setForm({ commanderName: "", fromDate: "", fromTime: "07:00", toDate: "", toTime: "07:00", ghiChu: "", url: "" });
    setShowForm(false);
    setViewDutyId(newEntry.id);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));

  const sortedDuty = [...duty].sort((a, b) => (b.fromDate || "").localeCompare(a.fromDate || ""));
  const viewDuty = duty.find((e) => e.id === viewDutyId) || null;
  const dutyLabel = (e) => {
    const roleOf = roster.items.find((m) => normalizeName(m.name) === normalizeName(e.commanderName))?.role || "";
    const status = e.toDate && e.toDate < todayStr ? "  (đã qua)" : e.fromDate && e.fromDate > todayStr ? "  (sắp tới)" : "  (đang diễn ra)";
    return `${e.fromTime || "—"} ${e.fromDate ? new Date(e.fromDate).toLocaleDateString("vi-VN") : "—"} → ${e.toTime || "—"} ${e.toDate ? new Date(e.toDate).toLocaleDateString("vi-VN") : "—"} · ${e.commanderName || "—"}${roleOf ? ` (${roleOf})` : ""}${status}`;
  };

  // ---- Phân công trực chốt ----
  const checkpoint = useSharedList("checkpoints");
  const CHOT_LIST = Array.from({ length: 10 }, (_, i) => String(i + 1));
  const [cForm, setCForm] = useState({ chot: "1", chotKhac: "", tieuDoi: "1", ngay: "", ca: "", ghiChu: "" });
  const [showCForm, setShowCForm] = useState(false);
  const [cWarn, setCWarn] = useState("");

  const addCheckpoint = async () => {
    const chotLabel = cForm.chot === "Khác" ? (cForm.chotKhac.trim() || "Khác") : `Chốt ${cForm.chot}`;
    if (!cForm.ngay) { setCWarn("Vui lòng chọn Ngày trực trước khi lưu."); return; }
    setCWarn("");
    await checkpoint.setItems([...checkpoint.items, { id: Date.now(), ...cForm, chotLabel }]);
    setCForm({ chot: "1", chotKhac: "", tieuDoi: "1", ngay: "", ca: "", ghiChu: "" });
    setShowCForm(false);
  };
  const removeCheckpoint = async (id) => checkpoint.setItems(checkpoint.items.filter((i) => i.id !== id));
  const sortedCheckpoints = [...checkpoint.items].sort((a, b) => (b.ngay || "").localeCompare(a.ngay || "") || (itemCreatedAt(b) - itemCreatedAt(a)));
  const [selectedCpId, setSelectedCpId] = useState(null);
  const toggleSelectCp = (id) => setSelectedCpId((s) => (s === id ? null : id));

  // Sửa phân công trực chốt khi có sai sót (chỉ huy sửa được)
  const [editingCpId, setEditingCpId] = useState(null);
  const [editCpForm, setEditCpForm] = useState({ chot: "1", chotKhac: "", tieuDoi: "1", ngay: "", ca: "", ghiChu: "" });
  const [editCpWarn, setEditCpWarn] = useState("");
  const startEditCheckpoint = (c) => {
    setEditingCpId(c.id);
    const isKnownChot = CHOT_LIST.includes(String(c.chot));
    setEditCpForm({
      chot: isKnownChot ? String(c.chot) : "Khác",
      chotKhac: isKnownChot ? "" : (c.chotLabel || ""),
      tieuDoi: c.tieuDoi || "1",
      ngay: c.ngay || "",
      ca: c.ca || "",
      ghiChu: c.ghiChu || "",
    });
    setEditCpWarn("");
  };
  const cancelEditCheckpoint = () => { setEditingCpId(null); setEditCpWarn(""); };
  const saveEditCheckpoint = async () => {
    if (!editCpForm.ngay) { setEditCpWarn("Vui lòng chọn Ngày trực trước khi lưu."); return; }
    setEditCpWarn("");
    const chotLabel = editCpForm.chot === "Khác" ? (editCpForm.chotKhac.trim() || "Khác") : `Chốt ${editCpForm.chot}`;
    await checkpoint.setItems(checkpoint.items.map((i) => (i.id === editingCpId ? { ...i, ...editCpForm, chotLabel } : i)));
    setEditingCpId(null);
  };

  return (
    <div>
      <SectionHeader compact icon={Shield} eyebrow="Phân công" title="Trực chỉ huy trung đội"
        action={perm.canManage && <Btn size="sm" onClick={() => setShowForm((s) => !s)}><Plus size={14} /> Tạo lượt trực mới</Btn>} />

      {perm.canManage && showForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={warn} /></div>
          <div className="md:col-span-2">
            <Field label="Trực chỉ huy (chọn từ Trung đội trưởng/Trung đội phó trong Quân số)" required>
              <select className={inputCls} style={inputStyle} value={form.commanderName} onChange={(e) => setForm({ ...form, commanderName: e.target.value })}>
                <option value="">— Chọn người trực chỉ huy —</option>
                {commanderCandidates.map((m) => (
                  <option key={m.id} value={m.name}>{m.name} ({roleDisplay(m.role)})</option>
                ))}
              </select>
            </Field>
            {commanderCandidates.length === 0 && (
              <div className="f-body text-[11px] italic mt-1" style={{ color: T.red }}>
                Chưa có ai được gán chức vụ Trung đội trưởng/Trung đội phó trong tab Quân số — hãy cập nhật chức vụ trước.
              </div>
            )}
          </div>
          <Field label="Từ ngày" required><input type="date" className={inputCls} style={inputStyle} value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} /></Field>
          <Field label="Từ giờ"><input type="time" className={inputCls} style={inputStyle} value={form.fromTime} onChange={(e) => setForm({ ...form, fromTime: e.target.value })} /></Field>
          <Field label="Đến ngày" required><input type="date" className={inputCls} style={inputStyle} value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} /></Field>
          <Field label="Đến giờ"><input type="time" className={inputCls} style={inputStyle} value={form.toTime} onChange={(e) => setForm({ ...form, toTime: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="Ghi chú"><input className={inputCls} style={inputStyle} value={form.ghiChu} onChange={(e) => setForm({ ...form, ghiChu: e.target.value })} /></Field></div>
          <div className="md:col-span-2">
            <Field label="Link ảnh/file đính kèm">
              <input className={inputCls} style={inputStyle} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
              <UploadField onUploaded={(url) => setForm((f) => ({ ...f, url }))} />
            </Field>
          </div>
          <div className="md:col-span-2"><Btn onClick={add}>Lưu lượt trực</Btn></div>
        </div>
      )}

      {loading || roster.loading ? <LoadingRow /> : duty.length === 0 ? <EmptyState text="Chưa có lượt trực chỉ huy nào." /> : (
        <div className="mb-8">
          <div className="mb-2.5 max-w-lg">
            <label className="block mb-3">
              <span className="f-mono text-[10px] uppercase tracking-widest block mb-1" style={{ color: T.inkSoft }}>
                Xem lượt trực (chọn lại lượt trước để xem — dữ liệu cũ được giữ để quy trách nhiệm)
              </span>
              <select className={inputCls} style={{ ...inputStyle, fontSize: "12px", padding: "5px 8px" }} value={viewDutyId || ""} onChange={(e) => setViewDutyId(Number(e.target.value))}>
                {sortedDuty.map((e) => (
                  <option key={e.id} value={e.id}>{dutyLabel(e)}</option>
                ))}
              </select>
            </label>
          </div>

          {viewDuty && (() => {
            const isPast = viewDuty.toDate && viewDuty.toDate < todayStr;
            const roleOf = roster.items.find((m) => normalizeName(m.name) === normalizeName(viewDuty.commanderName))?.role || "";
            return (
              <div className="p-3" style={{ background: "#fff", borderLeft: `4px solid ${isPast ? T.inkSoft : T.red}` }}>
                <div className="f-mono text-[10.5px]" style={{ color: T.inkSoft }}>
                  {viewDuty.fromTime || "—"} {viewDuty.fromDate ? new Date(viewDuty.fromDate).toLocaleDateString("vi-VN") : "—"}
                  {" → "}
                  {viewDuty.toTime || "—"} {viewDuty.toDate ? new Date(viewDuty.toDate).toLocaleDateString("vi-VN") : "—"}
                  {isPast && <span className="ml-2 f-mono uppercase tracking-wider" style={{ color: T.amberDark }}>· Đã qua — lưu để quy trách nhiệm</span>}
                </div>
                <div className="f-body text-sm font-semibold mt-1" style={{ color: T.ink }}>
                  {viewDuty.commanderName || "—"} {roleOf && <span className="f-mono text-[10.5px] font-normal" style={{ color: T.inkSoft }}>({roleOf})</span>}
                </div>
                {viewDuty.ghiChu && <div className="f-body text-xs mt-1" style={{ color: T.inkSoft }}>{viewDuty.ghiChu}</div>}
                {viewDuty.url && (
                  isImage(viewDuty.url) ? (
                    <a href={viewDuty.url} target="_blank" rel="noreferrer" className="block mt-2">
                      <img src={viewDuty.url} alt="Đính kèm" className="max-w-[220px] max-h-48 stamp-border" />
                    </a>
                  ) : (
                    <a href={viewDuty.url} target="_blank" rel="noreferrer" className="f-mono text-[10.5px] underline break-all mt-2 inline-flex items-center gap-1" style={{ color: T.green }}>
                      <Paperclip size={11} /> Xem file đính kèm
                    </a>
                  )
                )}
                <div className="mt-2.5">
                  {perm.canManage && (
                    isPast ? (
                      <span className="f-mono text-[10px] italic" style={{ color: T.inkSoft }}>Đã kết thúc — không thể xoá để quy trách nhiệm</span>
                    ) : (
                      <button onClick={() => remove(viewDuty.id)} className="inline-flex items-center gap-1 f-mono text-[10.5px]" style={{ color: T.red }}>
                        <Trash2 size={12} /> Xoá lượt trực này
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ---- Phân công trực chốt ---- */}
      <SectionHeader compact icon={MapPin} eyebrow="Phân công" title="Trực chốt theo tiểu đội"
        action={perm.canManage && <Btn size="sm" onClick={() => setShowCForm((s) => !s)}><Plus size={14} /> Phân công chốt</Btn>} />

      {perm.canManage && showCForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={cWarn} /></div>
          <Field label="Chốt số">
            <select className={inputCls} style={inputStyle} value={cForm.chot} onChange={(e) => setCForm({ ...cForm, chot: e.target.value })}>
              {CHOT_LIST.map((c) => <option key={c} value={c}>Chốt {c}</option>)}
              <option value="Khác">Khác (tự nhập)</option>
            </select>
          </Field>
          {cForm.chot === "Khác" && (
            <Field label="Tên chốt (tự nhập)"><input className={inputCls} style={inputStyle} value={cForm.chotKhac} onChange={(e) => setCForm({ ...cForm, chotKhac: e.target.value })} placeholder="VD: Chốt cổng phụ" /></Field>
          )}
          <Field label="Tiểu đội trực">
            <select className={inputCls} style={inputStyle} value={cForm.tieuDoi} onChange={(e) => setCForm({ ...cForm, tieuDoi: e.target.value })}>
              <option value="1">Tiểu đội 1</option><option value="2">Tiểu đội 2</option>
              <option value="3">Tiểu đội 3</option><option value="4">Tiểu đội 4</option>
            </select>
          </Field>
          <Field label="Ngày trực" required><input type="date" className={inputCls} style={inputStyle} value={cForm.ngay} onChange={(e) => setCForm({ ...cForm, ngay: e.target.value })} /></Field>
          <Field label="Ca trực (VD: 06:00–12:00)"><input className={inputCls} style={inputStyle} value={cForm.ca} onChange={(e) => setCForm({ ...cForm, ca: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="Ghi chú"><input className={inputCls} style={inputStyle} value={cForm.ghiChu} onChange={(e) => setCForm({ ...cForm, ghiChu: e.target.value })} /></Field></div>
          <div className="md:col-span-2"><Btn onClick={addCheckpoint}>Lưu phân công</Btn></div>
        </div>
      )}

      {checkpoint.loading ? <LoadingRow /> : sortedCheckpoints.length === 0 ? <EmptyState text="Chưa có phân công trực chốt nào." /> : (
        <div className="overflow-x-auto overflow-y-auto stamp-border mb-8" style={{ background: "#fff", maxHeight: 290 }}>
          <table className="w-full text-xs f-body table-lines">
            <thead>
              <tr className="f-mono text-[10px] uppercase tracking-wider" style={{ background: T.green, color: T.paper, position: "sticky", top: 0, zIndex: 1 }}>
                <th className="text-left px-2.5 py-1.5 w-8">STT</th>
                <th className="text-left px-2.5 py-1.5">Ngày</th><th className="text-left px-2.5 py-1.5">Chốt</th>
                <th className="text-left px-2.5 py-1.5">Tiểu đội</th><th className="text-left px-2.5 py-1.5">Ca trực</th>
                <th className="text-left px-2.5 py-1.5">Ghi chú</th><th className="px-2.5 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {sortedCheckpoints.map((c, i) => (
                editingCpId === c.id ? (
                  <tr key={c.id} style={{ background: T.paper }}>
                    <td className="px-2.5 py-1.5 f-mono">{i + 1}</td>
                    <td colSpan={6} className="px-3 py-3">
                      <FormWarning message={editCpWarn} />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Field label="Chốt số">
                          <select className={inputCls} style={inputStyle} value={editCpForm.chot} onChange={(e) => setEditCpForm({ ...editCpForm, chot: e.target.value })}>
                            {CHOT_LIST.map((ch) => <option key={ch} value={ch}>Chốt {ch}</option>)}
                            <option value="Khác">Khác (tự nhập)</option>
                          </select>
                        </Field>
                        {editCpForm.chot === "Khác" && (
                          <Field label="Tên chốt (tự nhập)"><input className={inputCls} style={inputStyle} value={editCpForm.chotKhac} onChange={(e) => setEditCpForm({ ...editCpForm, chotKhac: e.target.value })} /></Field>
                        )}
                        <Field label="Tiểu đội trực">
                          <select className={inputCls} style={inputStyle} value={editCpForm.tieuDoi} onChange={(e) => setEditCpForm({ ...editCpForm, tieuDoi: e.target.value })}>
                            <option value="1">Tiểu đội 1</option><option value="2">Tiểu đội 2</option>
                            <option value="3">Tiểu đội 3</option><option value="4">Tiểu đội 4</option>
                          </select>
                        </Field>
                        <Field label="Ngày trực" required><input type="date" className={inputCls} style={inputStyle} value={editCpForm.ngay} onChange={(e) => setEditCpForm({ ...editCpForm, ngay: e.target.value })} /></Field>
                        <Field label="Ca trực"><input className={inputCls} style={inputStyle} value={editCpForm.ca} onChange={(e) => setEditCpForm({ ...editCpForm, ca: e.target.value })} /></Field>
                        <Field label="Ghi chú"><input className={inputCls} style={inputStyle} value={editCpForm.ghiChu} onChange={(e) => setEditCpForm({ ...editCpForm, ghiChu: e.target.value })} /></Field>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Btn onClick={saveEditCheckpoint}>Lưu</Btn>
                        <Btn variant="outline" onClick={cancelEditCheckpoint}>Huỷ</Btn>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} onClick={() => toggleSelectCp(c.id)} className="cursor-pointer" style={withSelect({ background: i % 2 ? T.paper : "#fff" }, selectedCpId === c.id)}>
                    <td className="px-2.5 py-1.5 f-mono font-semibold" style={{ color: T.amberDark }}>{i + 1}</td>
                    <td className="px-2.5 py-1.5 f-mono">{new Date(c.ngay).toLocaleDateString("vi-VN")}</td>
                    <td className="px-2.5 py-1.5 font-medium">{c.chotLabel}</td>
                    <td className="px-2.5 py-1.5 f-mono">TĐ{c.tieuDoi}</td>
                    <td className="px-2.5 py-1.5 f-mono">{c.ca || "—"}</td>
                    <td className="px-2.5 py-1.5" style={{ color: T.inkSoft }}>{c.ghiChu || "—"}</td>
                    <td className="px-2.5 py-1.5">
                      <div className="flex items-center justify-end gap-2">
                        {perm.canManage && (
                          <button onClick={() => startEditCheckpoint(c)} title="Sửa thông tin (khi có sai sót)">
                            <Pencil size={13} style={{ color: T.green }} />
                          </button>
                        )}
                        {perm.canManage && <button onClick={() => removeCheckpoint(c.id)} title="Xoá"><Trash2 size={13} style={{ color: T.red }} /></button>}
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Phụ lục trực cuối tuần (thời gian nghỉ) ---- */}
      <WeekendRestAppendix user={user} perm={perm} />
    </div>
  );
}

/* ============ PHỤ LỤC TRỰC CUỐI TUẦN (thời gian trực, danh sách theo tiểu đội) ============
   - Mỗi đợt có khoảng thời gian trực riêng (từ ngày/giờ → đến ngày/giờ).
   - Khi ngày hiện tại đã qua khỏi "Ngày kết thúc trực" của đợt đang xem, hệ thống tự động chuyển
     sang đợt hiện hành/kế tiếp (giống cơ chế "qua 0h ngày mới" của tab Đăng ký ra ngoài).
   - Các đợt trước đó KHÔNG bị xoá — vẫn chọn lại được trong ô "Xem đợt trực" để quản lý học viên
     (giống hệt cách "Xem theo ngày" ở tab Đăng ký ra ngoài).
*/
function WeekendRestAppendix({ user, perm }) {
  const { items, setItems, loading } = useSharedList("weekendRest");
  const { items: rosterItems } = useSharedList("roster");
  // File ký duyệt của lãnh đạo lưu Ở KHO RIÊNG (weekendApprovals), tách biệt hoàn toàn khỏi dữ liệu
  // Danh sách trực (members) của từng đợt — mỗi bên tự thêm/sửa/xoá độc lập, không đụng vào nhau.
  const approvals = useSharedList("weekendApprovals");
  const [form, setForm] = useState({ fromDate: "", fromTime: "17:00", toDate: "", toTime: "21:00", url: "", ghiChu: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");

  const todayStr = new Date().toISOString().slice(0, 10);

  // Đợt "hiện hành" theo ngày hôm nay: đang trong khoảng → nếu không có thì đợt gần nhất sắp tới →
  // nếu cũng không có thì đợt gần nhất vừa kết thúc → cuối cùng là đợt đầu tiên nếu chỉ có 1 đợt.
  const computeCurrentId = (list) => {
    if (list.length === 0) return null;
    const active = list.find((e) => e.fromDate && e.toDate && e.fromDate <= todayStr && todayStr <= e.toDate);
    if (active) return active.id;
    const upcoming = [...list].filter((e) => e.fromDate > todayStr).sort((a, b) => a.fromDate.localeCompare(b.fromDate))[0];
    if (upcoming) return upcoming.id;
    const past = [...list].filter((e) => e.toDate < todayStr).sort((a, b) => b.toDate.localeCompare(a.toDate))[0];
    return past ? past.id : list[0].id;
  };

  const currentId = computeCurrentId(items);
  const [viewEntryId, setViewEntryId] = useState(currentId);
  const prevCurrentRef = useRef(currentId);

  useEffect(() => {
    // Đang xem đúng đợt mặc định cũ và đợt mặc định vừa đổi (qua ngày mới / vừa tạo đợt mới) → tự chuyển theo
    if (viewEntryId === prevCurrentRef.current && currentId !== prevCurrentRef.current) {
      setViewEntryId(currentId);
    }
    // Đợt đang xem đã bị xoá → quay về đợt hiện hành
    if (viewEntryId && !items.find((e) => e.id === viewEntryId)) {
      setViewEntryId(currentId);
    }
    prevCurrentRef.current = currentId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, items]);

  const create = async () => {
    if (!form.fromDate || !form.toDate) { setWarn("Vui lòng nhập đủ Ngày bắt đầu trực và Ngày kết thúc trực trước khi lưu."); return; }
    setWarn("");
    const newEntry = { id: Date.now(), ...form, by: user, members: [] };
    await setItems([newEntry, ...items]);
    setForm({ fromDate: "", fromTime: "17:00", toDate: "", toTime: "21:00", url: "", ghiChu: "" });
    setShowForm(false);
    setViewEntryId(newEntry.id);
  };
  const removeEntry = async (id) => setItems(items.filter((e) => e.id !== id));

  // Danh sách để chọn lại (mới nhất trước)
  const sortedEntries = [...items].sort((a, b) => (b.fromDate || "").localeCompare(a.fromDate || ""));
  const viewEntry = items.find((e) => e.id === viewEntryId) || null;
  const entryLabel = (e) =>
    `${e.fromTime || "17:00"} ${e.fromDate ? new Date(e.fromDate).toLocaleDateString("vi-VN") : "—"} → ${e.toTime || "21:00"} ${e.toDate ? new Date(e.toDate).toLocaleDateString("vi-VN") : "—"}` +
    (e.toDate && e.toDate < todayStr ? "  (đã qua)" : e.fromDate && e.fromDate > todayStr ? "  (sắp tới)" : "  (đang diễn ra)");

  return (
    <div>
      <SectionHeader icon={CalendarDays} eyebrow="Phụ lục" title="Trực Cuối Tuần — Thời Gian Trực"
        action={perm.canManage && <Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Tạo đợt trực</Btn>} />

      {perm.canManage && showForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={warn} /></div>
          <Field label="Ngày bắt đầu trực" required>
            <input type="date" className={inputCls} style={inputStyle} value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} />
          </Field>
          <Field label="Giờ bắt đầu trực (mặc định 17:00, có thể đổi)">
            <input type="time" className={inputCls} style={inputStyle} value={form.fromTime} onChange={(e) => setForm({ ...form, fromTime: e.target.value })} />
          </Field>
          <Field label="Ngày kết thúc trực" required>
            <input type="date" className={inputCls} style={inputStyle} value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
          </Field>
          <Field label="Giờ kết thúc trực (mặc định 21:00, có thể đổi)">
            <input type="time" className={inputCls} style={inputStyle} value={form.toTime} onChange={(e) => setForm({ ...form, toTime: e.target.value })} />
          </Field>
          <div className="md:col-span-2"><Field label="Ghi chú"><input className={inputCls} style={inputStyle} value={form.ghiChu} onChange={(e) => setForm({ ...form, ghiChu: e.target.value })} /></Field></div>
          <div className="md:col-span-2">
            <Field label="Link ảnh/file đính kèm (tuỳ ý)">
              <input className={inputCls} style={inputStyle} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
              <UploadField onUploaded={(url) => setForm((f) => ({ ...f, url }))} />
            </Field>
          </div>
          <div className="md:col-span-2"><Btn onClick={create}>Tạo đợt trực</Btn></div>
        </div>
      )}

      {loading ? <LoadingRow /> : items.length === 0 ? <EmptyState text="Chưa có đợt trực cuối tuần nào." /> : (
        <>
          <div className="mb-4 max-w-md">
            <Field label="Xem đợt trực (chọn lại đợt trước để xem/quản lý học viên)">
              <select className={inputCls} style={inputStyle} value={viewEntryId || ""} onChange={(e) => setViewEntryId(Number(e.target.value))}>
                {sortedEntries.map((e) => (
                  <option key={e.id} value={e.id}>{entryLabel(e)}</option>
                ))}
              </select>
            </Field>
          </div>

          {viewEntry && (
            <WeekendEntryCard key={viewEntry.id} entry={viewEntry} entries={items} setEntries={setItems} perm={perm} user={user} onRemoveEntry={removeEntry} rosterItems={rosterItems} approvals={approvals} />
          )}
        </>
      )}
    </div>
  );
}

function WeekendEntryCard({ entry, entries, setEntries, perm, user, onRemoveEntry, rosterItems, approvals }) {
  const [showMForm, setShowMForm] = useState(false);
  const [mWarn, setMWarn] = useState("");
  const isImage = (u) => /\.(png|jpe?g|gif|webp)$/i.test(u || "");

  // File ký duyệt của lãnh đạo — dữ liệu độc lập, tra theo entryId trong kho riêng "weekendApprovals"
  // (không còn nằm chung trong object đợt trực / Danh sách trực nữa). Vẫn đọc entry.approvalUrl cũ
  // (nếu có, từ dữ liệu trước khi tách) làm phương án dự phòng để không mất dữ liệu đã lưu trước đó.
  const approvalRecord = (approvals.items || []).find((a) => a.entryId === entry.id) || null;
  const approvalUrl = approvalRecord?.url || entry.approvalUrl || "";
  const approvalUploadedBy = approvalRecord?.uploadedBy || entry.approvalUploadedBy || "";
  const approvalUploadedAt = approvalRecord?.uploadedAt || entry.approvalUploadedAt || "";
  const [approvalUrlInput, setApprovalUrlInput] = useState(approvalUrl);

  useEffect(() => { setApprovalUrlInput(approvalUrl); }, [entry.id, approvalUrl]);

  // Thêm người vào Danh sách trực: tick chọn (nhiều) người có sẵn trong Quân số — không nhập tay.
  // Thông tin Họ và tên / Năm sinh / Tiểu đội / SĐT được lấy tự động từ Quân số.
  const [selectedRosterIds, setSelectedRosterIds] = useState([]);
  const existingNames = new Set((entry.members || []).map((m) => normalizeName(m.hoTen)));
  const availableRoster = [...(rosterItems || [])]
    .filter((r) => !existingNames.has(normalizeName(r.name)))
    .sort((a, b) => Number(a.tieuDoi || 1) - Number(b.tieuDoi || 1) || String(a.name).localeCompare(String(b.name), "vi"));
  const toggleRosterSelect = (id) => setSelectedRosterIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const addSelectedMembers = async () => {
    if (selectedRosterIds.length === 0) {
      setMWarn("Vui lòng tick chọn ít nhất một người từ Quân số trước khi thêm vào danh sách trực.");
      return;
    }
    setMWarn("");
    const chosen = (rosterItems || []).filter((r) => selectedRosterIds.includes(r.id));
    const newMembers = chosen.map((r, idx) => ({
      id: Date.now() + idx,
      hoTen: r.name || "",
      namSinh: yearFromDob(r.dob),
      tieuDoi: r.tieuDoi || "1",
      phone: r.phone || "",
    }));
    const next = entries.map((e) => (e.id === entry.id ? { ...e, members: [...(e.members || []), ...newMembers] } : e));
    await setEntries(next);
    setSelectedRosterIds([]);
    setShowMForm(false);
  };
  const removeMember = async (mid) => {
    const next = entries.map((e) => (e.id === entry.id ? { ...e, members: (e.members || []).filter((m) => m.id !== mid) } : e));
    await setEntries(next);
  };
  // Sửa thông tin thành viên khi chỉ huy phát hiện sai sót (họ tên/năm sinh/tiểu đội/SĐT)
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editMForm, setEditMForm] = useState({ hoTen: "", namSinh: "", tieuDoi: "1", phone: "" });
  const [editMWarn, setEditMWarn] = useState("");
  const startEditMember = (m) => {
    setEditingMemberId(m.id);
    setEditMForm({ hoTen: m.hoTen || "", namSinh: m.namSinh || "", tieuDoi: m.tieuDoi || "1", phone: m.phone || "" });
    setEditMWarn("");
  };
  const cancelEditMember = () => { setEditingMemberId(null); setEditMWarn(""); };
  const saveEditMember = async () => {
    if (!editMForm.hoTen.trim() || !editMForm.namSinh.trim()) {
      setEditMWarn("Vui lòng nhập đủ Họ và tên, Năm sinh trước khi lưu.");
      return;
    }
    setEditMWarn("");
    const next = entries.map((e) => (e.id === entry.id ? { ...e, members: (e.members || []).map((m) => (m.id === editingMemberId ? { ...m, ...editMForm } : m)) } : e));
    await setEntries(next);
    setEditingMemberId(null);
  };
  // File ký duyệt của lãnh đạo cho riêng tuần/đợt trực này — lưu vào kho "weekendApprovals" riêng,
  // hoàn toàn tách biệt khỏi dữ liệu Danh sách trực (members) của đợt trực.
  const saveApproval = async (url) => {
    setApprovalUrlInput(url);
    const rest = (approvals.items || []).filter((a) => a.entryId !== entry.id);
    const record = { id: approvalRecord?.id || Date.now(), entryId: entry.id, url, uploadedBy: user, uploadedAt: new Date().toISOString() };
    await approvals.setItems([...rest, record]);
  };
  const clearApproval = async () => {
    setApprovalUrlInput("");
    await approvals.setItems((approvals.items || []).filter((a) => a.entryId !== entry.id));
  };
  const sortedMembers = [...(entry.members || [])].sort((a, b) => Number(a.tieuDoi) - Number(b.tieuDoi));
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const toggleSelectMember = (id) => setSelectedMemberId((s) => (s === id ? null : id));

  return (
    <div className="stamp-border p-4" style={{ background: "#fff" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="f-display font-semibold text-sm flex items-center gap-2" style={{ color: T.green }}>
            <CalendarDays size={15} />
            Trực từ {entry.fromTime || "17:00"} ngày {entry.fromDate ? new Date(entry.fromDate).toLocaleDateString("vi-VN") : "—"}
            {" → "}
            {entry.toTime || "21:00"} ngày {entry.toDate ? new Date(entry.toDate).toLocaleDateString("vi-VN") : "—"}
          </div>
          {entry.ghiChu && <div className="f-body text-xs mt-1" style={{ color: T.inkSoft }}>{entry.ghiChu}</div>}
          {entry.url && (
            isImage(entry.url) ? (
              <a href={entry.url} target="_blank" rel="noreferrer" className="block mt-2">
                <img src={entry.url} alt="Phụ lục" className="max-w-[220px] max-h-48 stamp-border" />
              </a>
            ) : (
              <a href={entry.url} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all mt-1 inline-flex items-center gap-1" style={{ color: T.green }}>
                <Paperclip size={12} /> Xem file đính kèm
              </a>
            )
          )}
        </div>
        {perm.canManage && (
          <button onClick={() => onRemoveEntry(entry.id)} title="Xoá đợt trực"><Trash2 size={15} style={{ color: T.red }} /></button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <span className="f-mono text-[13px] uppercase tracking-widest font-bold" style={{ color: T.amberDark }}>
          Danh sách trực ({sortedMembers.length} người)
        </span>
        {perm.canManage && (
          <Btn variant="outline" onClick={() => setShowMForm((s) => !s)}><Plus size={14} /> Thêm người</Btn>
        )}
      </div>

      {perm.canManage && showMForm && (
        <div className="mt-3 p-3" style={{ background: T.paper, border: `1px solid ${T.paperDark}` }}>
          <FormWarning message={mWarn} />
          <div className="f-body text-[11px] italic mb-2" style={{ color: T.inkSoft }}>
            Tick chọn một hoặc nhiều người từ Quân số để đưa vào Danh sách trực — Họ và tên, Năm sinh, Tiểu đội, SĐT sẽ tự động lấy theo Quân số.
          </div>
          {availableRoster.length === 0 ? (
            <div className="f-body text-xs italic py-2 text-center" style={{ color: T.inkSoft }}>
              Tất cả thành viên trong Quân số đã có trong danh sách trực đợt này.
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto" style={{ border: `1px solid ${T.paperDark}`, background: "#fff" }}>
              {availableRoster.map((r) => (
                <label key={r.id} className="flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer" style={{ borderBottom: `1px solid ${T.paperDark}` }}>
                  <input type="checkbox" checked={selectedRosterIds.includes(r.id)} onChange={() => toggleRosterSelect(r.id)} />
                  <span className="f-body text-xs font-medium" style={{ color: T.ink }}>{r.name}</span>
                  <span className="f-mono text-[10.5px]" style={{ color: T.inkSoft }}>
                    · TĐ{r.tieuDoi || "—"}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-3">
            <Btn onClick={addSelectedMembers}>Xác nhận, thêm vào danh sách trực ({selectedRosterIds.length})</Btn>
            <Btn variant="outline" onClick={() => { setShowMForm(false); setSelectedRosterIds([]); setMWarn(""); }}>Huỷ</Btn>
          </div>
        </div>
      )}

      <div className="mt-4 p-3" style={{ background: T.paper, border: `1px solid ${T.paperDark}` }}>
        <div className="f-mono text-[11px] uppercase tracking-widest flex items-center gap-1.5 mb-2" style={{ color: T.amberDark }}>
          <Paperclip size={13} /> File ký duyệt của lãnh đạo (tuần này)
        </div>
        {approvalUrl ? (
          <div>
            {isImage(approvalUrl) ? (
              <a href={approvalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-2 py-1.5" style={{ border: `1px solid ${T.paperDark}`, background: "#fff" }}>
                <img src={approvalUrl} alt="Đã ký duyệt" className="w-12 h-12 object-cover stamp-border" />
                <span className="f-mono text-xs underline inline-flex items-center gap-1" style={{ color: T.green }}>
                  <Paperclip size={12} /> Xem ảnh đã ký duyệt
                </span>
              </a>
            ) : (
              <a href={approvalUrl} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all inline-flex items-center gap-1" style={{ color: T.green }}>
                <Paperclip size={12} /> Xem file đã ký duyệt
              </a>
            )}
            <div className="f-body text-[11px] mt-1" style={{ color: T.inkSoft }}>
              Tải lên bởi {approvalUploadedBy || "—"} lúc {approvalUploadedAt ? new Date(approvalUploadedAt).toLocaleString("vi-VN") : "—"}
            </div>
            {perm.canManage && (
              <button onClick={clearApproval} className="f-mono text-[10.5px] underline mt-1" style={{ color: T.red }}>Xoá file đã ký duyệt</button>
            )}
          </div>
        ) : (
          <div className="f-body text-xs italic" style={{ color: T.inkSoft }}>Chưa có file ký duyệt của lãnh đạo cho tuần này.</div>
        )}
        {perm.canManage && (
          <div className="mt-2">
            <input className={inputCls} style={inputStyle} value={approvalUrlInput} onChange={(e) => setApprovalUrlInput(e.target.value)} placeholder="https://…" />
            <div className="flex items-center gap-2 mt-1.5">
              <UploadField onUploaded={(url) => saveApproval(url)} />
              <Btn variant="outline" onClick={() => saveApproval(approvalUrlInput)}>Lưu link</Btn>
            </div>
          </div>
        )}
      </div>

      {sortedMembers.length === 0 ? (
        <div className="f-body text-xs italic py-4 text-center" style={{ color: T.inkSoft }}>Chưa có ai trong danh sách trực đợt này.</div>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm f-body table-lines table-grid" style={{ fontSize: "12.5px" }}>
            <thead>
              <tr className="f-mono text-[10px] uppercase tracking-wider" style={{ background: T.green, color: T.paper }}>
                <th className="text-left px-2 py-1.5 w-8">STT</th>
                <th className="text-left px-2 py-1.5 min-w-[100px]">Họ và tên</th>
                <th className="text-left px-2 py-1.5">Năm sinh</th>
                <th className="text-left px-2 py-1.5">Tiểu đội</th>
                <th className="text-left px-2 py-1.5 min-w-[120px]">SĐT</th>
                <th className="px-2 py-1.5 w-14"></th>
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((m, i) => (
                editingMemberId === m.id ? (
                  <tr key={m.id} style={{ background: T.paper }}>
                    <td className="px-2 py-1.5 f-mono">{i + 1}</td>
                    <td colSpan={5} className="px-2 py-2.5">
                      <FormWarning message={editMWarn} />
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input className={inputCls} style={inputStyle} value={editMForm.hoTen} onChange={(e) => setEditMForm({ ...editMForm, hoTen: e.target.value })} placeholder="Họ và tên" />
                        <input className={inputCls} style={inputStyle} value={editMForm.namSinh} onChange={(e) => setEditMForm({ ...editMForm, namSinh: e.target.value })} placeholder="Năm sinh" />
                        <select className={inputCls} style={inputStyle} value={editMForm.tieuDoi} onChange={(e) => setEditMForm({ ...editMForm, tieuDoi: e.target.value })}>
                          <option value="1">Tiểu đội 1</option><option value="2">Tiểu đội 2</option>
                          <option value="3">Tiểu đội 3</option><option value="4">Tiểu đội 4</option>
                        </select>
                        <input className={inputCls} style={inputStyle} value={editMForm.phone} onChange={(e) => setEditMForm({ ...editMForm, phone: e.target.value })} placeholder="SĐT" />
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Btn onClick={saveEditMember}>Lưu</Btn>
                        <Btn variant="outline" onClick={cancelEditMember}>Huỷ</Btn>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} onClick={() => toggleSelectMember(m.id)} className="cursor-pointer" style={withSelect({ background: i % 2 ? T.paper : "#fff" }, selectedMemberId === m.id)}>
                    <td className="px-2 py-1.5 f-mono">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium">{m.hoTen}</td>
                    <td className="px-2 py-1.5 f-mono">{m.namSinh}</td>
                    <td className="px-2 py-1.5 f-mono">TĐ{m.tieuDoi}</td>
                    <td className="px-2 py-1.5 f-mono">{m.phone || "—"}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-2">
                        {perm.canManage && (
                          <button onClick={() => startEditMember(m)} title="Sửa thông tin (khi có sai sót)">
                            <Pencil size={13} style={{ color: T.green }} />
                          </button>
                        )}
                        {perm.canManage && <button onClick={() => removeMember(m.id)} title="Xoá"><Trash2 size={13} style={{ color: T.red }} /></button>}
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============ TAB: LỊCH NGHỈ (Nghỉ cuối tuần) ============
   Chức năng giống hệt phụ lục "Trực cuối tuần" (tab Lịch trực), chỉ đổi tên hiển thị:
     "Trực cuối tuần" → "Nghỉ cuối tuần", "Danh sách trực" → "Danh sách nghỉ".
   Khác biệt duy nhất: KHÔNG tạo đợt nghỉ / KHÔNG thêm người thủ công ở đây — mọi thứ được liên kết
   trực tiếp với "Danh sách trung đội" (Quân số) và phụ lục "Trực cuối tuần":
     - Thời gian từng đợt nghỉ lấy y hệt từ các đợt đã tạo bên "Trực cuối tuần".
     - "Danh sách nghỉ" = toàn bộ Quân số, TRỪ những người đã có trong "Danh sách trực" của đúng đợt đó
       (khớp theo Họ và tên) — phần còn lại tự động là người nghỉ, không cần nhập tay.
   Trạng thái "Thẻ ra vào cổng" của từng người trong Danh sách nghỉ vẫn thao tác được như cũ, lưu kèm
   ngay trên đợt nghỉ đó (trong phụ lục Trực cuối tuần) nên luôn đồng bộ 2 bên.
*/
function WeekendOffTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("weekendRest");
  const { items: rosterItems, loading: rosterLoading } = useSharedList("roster");
  // File ký duyệt của lãnh đạo ở TRANG NGHỈ dùng kho riêng "weekendOffApprovals" — độc lập hoàn toàn
  // với file ký duyệt bên trang Trực ("weekendApprovals") và với Danh sách trực/nghỉ. Tự thêm/sửa/xoá
  // riêng ở đây, không ảnh hưởng và không lấy chung nội dung với bên Trực.
  const offApprovals = useSharedList("weekendOffApprovals");

  const todayStr = new Date().toISOString().slice(0, 10);

  const computeCurrentId = (list) => {
    if (list.length === 0) return null;
    const active = list.find((e) => e.fromDate && e.toDate && e.fromDate <= todayStr && todayStr <= e.toDate);
    if (active) return active.id;
    const upcoming = [...list].filter((e) => e.fromDate > todayStr).sort((a, b) => a.fromDate.localeCompare(b.fromDate))[0];
    if (upcoming) return upcoming.id;
    const past = [...list].filter((e) => e.toDate < todayStr).sort((a, b) => b.toDate.localeCompare(a.toDate))[0];
    return past ? past.id : list[0].id;
  };

  const currentId = computeCurrentId(items);
  const [viewEntryId, setViewEntryId] = useState(currentId);
  const prevCurrentRef = useRef(currentId);

  useEffect(() => {
    if (viewEntryId === prevCurrentRef.current && currentId !== prevCurrentRef.current) {
      setViewEntryId(currentId);
    }
    if (viewEntryId && !items.find((e) => e.id === viewEntryId)) {
      setViewEntryId(currentId);
    }
    prevCurrentRef.current = currentId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, items]);

  const sortedEntries = [...items].sort((a, b) => (b.fromDate || "").localeCompare(a.fromDate || ""));
  const viewEntry = items.find((e) => e.id === viewEntryId) || null;
  const entryLabel = (e) =>
    `${e.fromTime || "17:00"} ${e.fromDate ? new Date(e.fromDate).toLocaleDateString("vi-VN") : "—"} → ${e.toTime || "21:00"} ${e.toDate ? new Date(e.toDate).toLocaleDateString("vi-VN") : "—"}` +
    (e.toDate && e.toDate < todayStr ? "  (đã qua)" : e.fromDate && e.fromDate > todayStr ? "  (sắp tới)" : "  (đang diễn ra)");

  const isImage = (u) => /\.(png|jpe?g|gif|webp)$/i.test(u || "");

  // Danh sách nghỉ = Quân số - Danh sách trực (của đúng đợt đang xem), khớp theo Họ và tên.
  const dutyNameSet = new Set((viewEntry?.members || []).map((m) => normalizeName(m.hoTen)));
  const restMembers = rosterItems.filter((r) => !dutyNameSet.has(normalizeName(r.name)));
  const sortedRestMembers = [...restMembers].sort((a, b) => Number(a.tieuDoi) - Number(b.tieuDoi));

  const viewOffApproval = (offApprovals.items || []).find((a) => a.entryId === viewEntry?.id) || null;
  const viewApprovalUrl = viewOffApproval?.url || "";
  const viewApprovalUploadedBy = viewOffApproval?.uploadedBy || "";
  const viewApprovalUploadedAt = viewOffApproval?.uploadedAt || "";
  const [offApprovalUrlInput, setOffApprovalUrlInput] = useState(viewApprovalUrl);
  useEffect(() => { setOffApprovalUrlInput(viewApprovalUrl); }, [viewEntry?.id, viewApprovalUrl]);

  const saveOffApproval = async (url) => {
    if (!viewEntry) return;
    setOffApprovalUrlInput(url);
    const rest = (offApprovals.items || []).filter((a) => a.entryId !== viewEntry.id);
    const record = { id: viewOffApproval?.id || Date.now(), entryId: viewEntry.id, url, uploadedBy: user, uploadedAt: new Date().toISOString() };
    await offApprovals.setItems([...rest, record]);
  };
  const clearOffApproval = async () => {
    if (!viewEntry) return;
    setOffApprovalUrlInput("");
    await offApprovals.setItems((offApprovals.items || []).filter((a) => a.entryId !== viewEntry.id));
  };

  const canApprove = perm.isAdmin || perm.isCommandRole;
  const setRestThe = async (rosterId, trangThai) => {
    if (!viewEntry) return;
    const nextRestStatus = { ...(viewEntry.restStatus || {}), [rosterId]: trangThai };
    const next = items.map((e) => (e.id === viewEntry.id ? { ...e, restStatus: nextRestStatus } : e));
    await setItems(next);
  };

  return (
    <div>
      <SectionHeader icon={CalendarDays} eyebrow="Phụ lục" title="Nghỉ cuối tuần — thời gian nghỉ" />

      <p className="f-body text-xs mb-4" style={{ color: T.inkSoft }}>
        Danh sách nghỉ được lấy tự động từ Quân số, trừ đi những người đã có trong Danh sách trực ở phụ lục
        "Trực cuối tuần" (tab Lịch trực) — không cần tạo đợt nghỉ hay thêm người ở đây. Muốn tạo đợt nghỉ
        mới hoặc thêm/sửa Danh sách trực, vào tab <b>Lịch trực → Trực cuối tuần</b>.
      </p>

      {(loading || rosterLoading) ? <LoadingRow /> : items.length === 0 ? (
        <EmptyState text="Chưa có đợt nghỉ cuối tuần nào — vào tab Lịch trực → Trực cuối tuần để tạo đợt nghỉ." />
      ) : (
        <>
          <div className="mb-4 max-w-md">
            <Field label="Xem đợt nghỉ">
              <select className={inputCls} style={inputStyle} value={viewEntryId || ""} onChange={(e) => setViewEntryId(Number(e.target.value))}>
                {sortedEntries.map((e) => (
                  <option key={e.id} value={e.id}>{entryLabel(e)}</option>
                ))}
              </select>
            </Field>
          </div>

          {viewEntry && (
            <div className="stamp-border p-4" style={{ background: "#fff" }}>
              <div className="f-display font-semibold text-sm flex items-center gap-2" style={{ color: T.green }}>
                <CalendarDays size={15} />
                Nghỉ từ {viewEntry.fromTime || "17:00"} ngày {viewEntry.fromDate ? new Date(viewEntry.fromDate).toLocaleDateString("vi-VN") : "—"}
                {" → "}
                {viewEntry.toTime || "21:00"} ngày {viewEntry.toDate ? new Date(viewEntry.toDate).toLocaleDateString("vi-VN") : "—"}
              </div>
              {viewEntry.ghiChu && <div className="f-body text-xs mt-1" style={{ color: T.inkSoft }}>{viewEntry.ghiChu}</div>}
              {viewEntry.url && (
                isImage(viewEntry.url) ? (
                  <a href={viewEntry.url} target="_blank" rel="noreferrer" className="block mt-2">
                    <img src={viewEntry.url} alt="Phụ lục" className="max-w-[220px] max-h-48 stamp-border" />
                  </a>
                ) : (
                  <a href={viewEntry.url} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all mt-1 inline-flex items-center gap-1" style={{ color: T.green }}>
                    <Paperclip size={12} /> Xem file đính kèm
                  </a>
                )
              )}

              <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                <span className="f-mono text-[13px] uppercase tracking-widest font-bold" style={{ color: T.amberDark }}>
                  Danh sách nghỉ ({sortedRestMembers.length} người)
                </span>
              </div>

              <div className="mt-3 p-3" style={{ background: T.paper, border: `1px solid ${T.paperDark}` }}>
                <div className="f-mono text-[11px] uppercase tracking-widest flex items-center gap-1.5 mb-2" style={{ color: T.amberDark }}>
                  <Paperclip size={13} /> File ký duyệt của lãnh đạo (tuần này)
                </div>
                {viewApprovalUrl ? (
                  <div>
                    {isImage(viewApprovalUrl) ? (
                      <a href={viewApprovalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-2 py-1.5" style={{ border: `1px solid ${T.paperDark}`, background: "#fff" }}>
                        <img src={viewApprovalUrl} alt="Đã ký duyệt" className="w-12 h-12 object-cover stamp-border" />
                        <span className="f-mono text-xs underline inline-flex items-center gap-1" style={{ color: T.green }}>
                          <Paperclip size={12} /> Xem ảnh đã ký duyệt
                        </span>
                      </a>
                    ) : (
                      <a href={viewApprovalUrl} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all inline-flex items-center gap-1" style={{ color: T.green }}>
                        <Paperclip size={12} /> Xem file đã ký duyệt
                      </a>
                    )}
                    <div className="f-body text-[11px] mt-1" style={{ color: T.inkSoft }}>
                      Tải lên bởi {viewApprovalUploadedBy || "—"} lúc {viewApprovalUploadedAt ? new Date(viewApprovalUploadedAt).toLocaleString("vi-VN") : "—"}
                    </div>
                    {canApprove && (
                      <button onClick={clearOffApproval} className="f-mono text-[10.5px] underline mt-1" style={{ color: T.red }}>Xoá file đã ký duyệt</button>
                    )}
                  </div>
                ) : (
                  <div className="f-body text-xs italic" style={{ color: T.inkSoft }}>Chưa có file ký duyệt của lãnh đạo cho tuần này.</div>
                )}
                {canApprove && (
                  <div className="mt-2">
                    <input className={inputCls} style={inputStyle} value={offApprovalUrlInput} onChange={(e) => setOffApprovalUrlInput(e.target.value)} placeholder="https://…" />
                    <div className="flex items-center gap-2 mt-1.5">
                      <UploadField onUploaded={(url) => saveOffApproval(url)} />
                      <Btn variant="outline" onClick={() => saveOffApproval(offApprovalUrlInput)}>Lưu link</Btn>
                    </div>
                  </div>
                )}
              </div>

              {sortedRestMembers.length === 0 ? (
                <div className="f-body text-xs italic py-4 text-center" style={{ color: T.inkSoft }}>Không có ai trong danh sách nghỉ đợt này.</div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto mt-3" style={{ maxHeight: 460 }}>
                  <table className="w-full text-sm f-body table-lines table-grid" style={{ fontSize: "12.5px" }}>
                    <thead>
                      <tr className="f-mono text-[10px] uppercase tracking-wider" style={{ background: T.green, color: T.paper }}>
                        <th className="text-left px-2 py-1.5 w-8 sticky top-0" style={{ background: T.green }}>STT</th>
                        <th className="text-left px-2 py-1.5 min-w-[100px] sticky top-0" style={{ background: T.green }}>Họ và tên</th>
                        <th className="text-left px-2 py-1.5 sticky top-0" style={{ background: T.green }}>Năm sinh</th>
                        <th className="text-left px-2 py-1.5 sticky top-0" style={{ background: T.green }}>Tiểu đội</th>
                        <th className="text-left px-2 py-1.5 min-w-[170px] sticky top-0" style={{ background: T.green }}>Thẻ ra vào cổng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRestMembers.map((m, i) => (
                        <tr key={m.id} style={{ background: i % 2 ? T.paper : "#fff" }}>
                          <td className="px-2 py-1.5 f-mono">{i + 1}</td>
                          <td className="px-2 py-1.5 font-medium">{m.name}</td>
                          <td className="px-2 py-1.5 f-mono">{formatDob(m.dob)}</td>
                          <td className="px-2 py-1.5 f-mono">TĐ{m.tieuDoi}</td>
                          <td className="px-2 py-1.5">
                            <TheTrangThaiBadge
                              o={{ id: m.id, theTrangThai: (viewEntry.restStatus || {})[m.id] || "chua_nhan" }}
                              canAct={perm.canManage || perm.isOwner(m.name)}
                              canApprove={canApprove}
                              setThe={setRestThe}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============ TAB: ĐĂNG KÝ RA NGOÀI ============ */
/* ============ TAB: ĐĂNG KÝ RA NGOÀI ============
   - Mỗi đăng ký lưu kèm createdAt (thời điểm tạo) để xếp STT theo đúng thứ tự đăng ký trước/sau (tính riêng theo từng ngày).
   - Quản trị / Trung đội trưởng / Trung đội phó / Cán bộ (perm.canManage) có thể khoá đăng ký:
       + Khoá thủ công: bật/tắt ngay lập tức.
       + Khoá tự động: đặt một thời điểm, quá giờ đó hệ thống tự khoá, không cho tạo đăng ký mới nữa.
     Khi bị khoá, ai cũng thấy thông báo "Đã hết thời gian đăng ký" và không thể mở form đăng ký.
*/
/* ============ TAB: ĐĂNG KÝ RA NGOÀI ============
   Quy trình:
   1) Thành viên tự đăng ký → vào hàng "Chờ duyệt".
   2) Quản trị / Trung đội trưởng / Trung đội phó (canApprove) duyệt hoặc từ chối từng đăng ký.
      Họ cũng có thể tự thêm thẳng một người được ra ngoài (tự động ở trạng thái "Đã duyệt"),
      và sửa/đổi tên người đi (dùng khi đổi ý hoặc 2 thành viên đổi suất cho nhau) mà không cần xoá đăng ký cũ.
   3) "Danh sách chốt" = tất cả đăng ký đã Duyệt trong ngày — đây là danh sách chính thức ai được ra ngoài hôm đó.
   4) Qua 0h ngày mới, "today" tự đổi sang ngày kế tiếp nên mọi người lại đăng ký từ đầu; các ngày cũ chỉ cần
      chọn ngày ở ô "Xem theo ngày" là xem lại được danh sách chốt/đã duyệt/chờ duyệt của ngày đó.
*/
/* Huy hiệu trạng thái Thẻ ra vào cổng — chỉ 1 trạng thái tại 1 thời điểm, có bước chỉ huy xác nhận đã trả */
function TheTrangThaiBadge({ o, canAct, canApprove, setThe }) {
  const st = o.theTrangThai || "chua_nhan";
  const LABEL = { chua_nhan: "Chưa nhận thẻ", da_nhan: "Đã nhận thẻ", cho_xac_nhan_tra: "Chờ chỉ huy xác nhận", da_tra: "Đã trả thẻ" };
  const BG = { chua_nhan: "#EDE6D2", da_nhan: T.amberDark, cho_xac_nhan_tra: T.amber, da_tra: T.green };
  const FG = { chua_nhan: T.inkSoft, da_nhan: "#fff", cho_xac_nhan_tra: T.ink, da_tra: "#fff" };

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span
        className="f-mono text-[8.5px] uppercase tracking-wider px-1 py-0.5 rounded-sm inline-flex items-center gap-0.5"
        style={{ background: BG[st], color: FG[st], border: `1px solid ${BG[st]}` }}
      >
        {st === "da_tra" ? <CheckCircle2 size={9} /> : <Circle size={9} />} {LABEL[st]}
      </span>

      {canAct && st === "chua_nhan" && (
        <button onClick={() => setThe(o.id, "da_nhan")} className="f-mono text-[8.5px] font-bold underline btn-press" style={{ color: T.red }}>
          Đánh dấu đã nhận thẻ
        </button>
      )}

      {canAct && st === "da_nhan" && (
        <button onClick={() => setThe(o.id, "cho_xac_nhan_tra")} className="f-mono text-[8.5px] font-bold underline btn-press" style={{ color: T.green }}>
          Báo đã trả thẻ
        </button>
      )}

      {st === "cho_xac_nhan_tra" && canApprove && (
        <>
          <button onClick={() => setThe(o.id, "da_tra")} title="Xác nhận đã trả thẻ ra vào cổng"><CheckCircle2 size={12} style={{ color: T.green }} /></button>
          <button onClick={() => setThe(o.id, "da_nhan")} title="Chưa trả — vẫn đang giữ thẻ"><X size={12} style={{ color: T.red }} /></button>
        </>
      )}
      {st === "cho_xac_nhan_tra" && !canApprove && canAct && (
        <button onClick={() => setThe(o.id, "da_nhan")} className="f-mono text-[8.5px] underline btn-press" style={{ color: T.inkSoft }}>
          Huỷ báo (chưa trả)
        </button>
      )}

      {st === "da_tra" && canApprove && (
        <button onClick={() => setThe(o.id, "da_nhan")} title="Sửa lại nếu tick nhầm" className="f-mono text-[8.5px] underline btn-press" style={{ color: T.inkSoft }}>
          Sửa lại
        </button>
      )}
    </span>
  );
}

function OutingTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("outings");
  const roster = useSharedList("roster");
  const rosterSorted = [...roster.items].sort((a, b) => (Number(a.tieuDoi) - Number(b.tieuDoi)) || String(a.name).localeCompare(String(b.name), "vi"));
  const lock = useOutingLock();
  const today = useLiveToday();
  const [viewDate, setViewDate] = useState(today);
  // Nếu người dùng đang xem đúng "hôm nay" (chưa tự tay chọn ngày khác) mà đồng hồ vừa sang ngày mới,
  // tự động đưa viewDate theo ngày mới — tránh trường hợp mở app/tab qua đêm không tắt, danh sách
  // "Chờ duyệt" bị kẹt hiện mãi đăng ký của ngày cũ. Nếu người dùng đang cố ý xem 1 ngày cũ khác thì
  // không tự động kéo họ về hôm nay (vẫn có nút "Về hôm nay" để chủ động quay lại).
  const prevTodayRef = useRef(today);
  useEffect(() => {
    if (viewDate === prevTodayRef.current) setViewDate(today);
    prevTodayRef.current = today;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);
  const approvalPhoto = useOutingApprovalPhoto(viewDate);
  const [form, setForm] = useState({ name: "", namSinh: "", tieuDoi: "1", lyDo: "", ngay: today, gioDi: "", gioVeDuKien: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editErr, setEditErr] = useState("");
  const [lockAtInput, setLockAtInput] = useState(lock.config.lockAt || "");

  useEffect(() => { setLockAtInput(lock.config.lockAt || ""); }, [lock.config.lockAt]);

  // Chỉ Quản trị / Trung đội trưởng / Trung đội phó được phê duyệt, thêm thẳng hoặc đổi tên người ra ngoài
  const canApprove = perm.isAdmin || perm.isCommandRole;

  const nowTs = new Date();
  // Khoá hẹn giờ chỉ còn hiệu lực nếu thời điểm hẹn (lockAt) rơi đúng NGÀY HÔM NAY và đã tới giờ —
  // qua ngày mới, dù nowTs vẫn "sau" lockAt về mặt số học, khoá này tự coi như hết hạn (mở lại).
  const scheduledDateStr = lock.config.lockAt ? lock.config.lockAt.slice(0, 10) : "";
  const scheduledLocked = Boolean(lock.config.lockAt) && scheduledDateStr === today && nowTs >= new Date(lock.config.lockAt);
  // Khoá thủ công chỉ còn hiệu lực nếu được BẬT đúng vào hôm nay (lockSetOn === today) —
  // qua ngày mới mà chỉ huy quên mở, hệ thống tự coi như đã mở, không cần ai bấm tay.
  const manualLockActive = Boolean(lock.config.manualLock) && lock.config.lockSetOn === today;
  const isLocked = manualLockActive || scheduledLocked;
  const lockMessage = manualLockActive
    ? "Đăng ký ra ngoài đang bị khoá thủ công. Vui lòng liên hệ chỉ huy."
    : scheduledLocked
    ? `Đã hết thời gian đăng ký (khoá tự động lúc ${new Date(lock.config.lockAt).toLocaleString("vi-VN")}).`
    : "";

  const toggleManualLock = async () => {
    // Dùng trạng thái HIỆU LỰC (đã tính theo ngày) để quyết định bật/tắt, không dùng thẳng cờ thô
    // lock.config.manualLock — vì cờ đó có thể vẫn là "true" cũ từ hôm trước dù đã tự hết hiệu lực,
    // nếu dùng thẳng sẽ khiến bấm "Khoá ngay" lại vô tình ghi đè thành mở khoá.
    const turningOn = !manualLockActive;
    await lock.setConfig({ ...lock.config, manualLock: turningOn, lockSetOn: turningOn ? today : lock.config.lockSetOn });
  };
  const saveScheduledLock = async () => { await lock.setConfig({ ...lock.config, lockAt: lockAtInput }); };
  const clearScheduledLock = async () => { setLockAtInput(""); await lock.setConfig({ ...lock.config, lockAt: "" }); };

  const openForm = () => {
    setForm({ name: "", namSinh: "", tieuDoi: "1", lyDo: "", ngay: viewDate || today, gioDi: "", gioVeDuKien: "" });
    setWarn("");
    setShowForm(true);
  };

  const add = async () => {
    // Khi đã khoá, chỉ Quản trị / Trung đội trưởng / Trung đội phó mới được thêm thẳng người ra ngoài
    // (dành cho trường hợp có nhu cầu phát sinh mà không đăng ký kịp); thành viên thường vẫn bị chặn.
    if (isLocked && !canApprove) { setWarn("Đã hết thời gian đăng ký ra ngoài — không thể tạo đăng ký mới. Liên hệ Trung đội trưởng/phó nếu có nhu cầu phát sinh."); return; }
    if (!form.name.trim() || !form.lyDo.trim()) { setWarn("Vui lòng nhập đủ Họ và tên và Lý do ra ngoài trước khi lưu."); return; }
    // Tránh trùng lặp: cùng một người, cùng một ngày, đang Chờ duyệt hoặc đã Đã duyệt thì không cho tạo đăng ký mới nữa.
    const trung = items.some((o) => {
      const st = o.duyet || "Chờ duyệt";
      return o.ngay === form.ngay && normalizeName(o.name) === normalizeName(form.name) && (st === "Chờ duyệt" || st === "Đã duyệt");
    });
    if (trung) {
      setWarn(`"${form.name}" đã có đăng ký ra ngoài ngày ${new Date(form.ngay).toLocaleDateString("vi-VN")} đang Chờ duyệt hoặc đã Đã duyệt — không thể tạo trùng.`);
      return;
    }
    setWarn("");
    // Quản trị / TĐT / TĐP tự thêm người thì coi như đã duyệt luôn; thành viên tự đăng ký thì vào hàng chờ duyệt.
    await setItems([
      {
        id: Date.now(), ...form, dangKyBoi: user, trangThai: "Chưa về", gioVeThucTe: "",
        createdAt: new Date().toISOString(),
        duyet: canApprove ? "Đã duyệt" : "Chờ duyệt",
        duyetBoi: canApprove ? user : "",
      },
      ...items,
    ]);
    setShowForm(false);
  };

  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const markBack = async (id) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    await setItems(items.map((i) => (i.id === id ? { ...i, trangThai: "Đã về", gioVeThucTe: `${hh}:${mm}` } : i)));
  };
  const setDuyet = async (id, duyet) => {
    await setItems(items.map((i) => (i.id === id ? { ...i, duyet, duyetBoi: user } : i)));
  };
  // Trạng thái thẻ ra vào cổng: chỉ 1 trạng thái tại 1 thời điểm (không tick song song 2 cái)
  // chua_nhan -> da_nhan -> cho_xac_nhan_tra (chờ chỉ huy xác nhận) -> da_tra
  const setThe = async (id, trangThai) => {
    await setItems(items.map((i) => (i.id === id ? { ...i, theTrangThai: trangThai } : i)));
  };

  const saveApprovalPhoto = async (url) => {
    await approvalPhoto.save({ url, uploadedBy: user, uploadedAt: new Date().toISOString() });
  };
  const removeApprovalPhoto = async () => {
    await approvalPhoto.save({ url: "", uploadedBy: "", uploadedAt: "" });
  };

  const startEdit = (o) => {
    setEditingId(o.id);
    setEditForm({ name: o.name || "", namSinh: o.namSinh || "", tieuDoi: o.tieuDoi || "1", lyDo: o.lyDo || "", ngay: o.ngay || today, gioDi: o.gioDi || "", gioVeDuKien: o.gioVeDuKien || "" });
    setEditErr("");
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); setEditErr(""); };
  const saveEdit = async () => {
    if (!editForm.name.trim() || !editForm.lyDo.trim()) { setEditErr("Vui lòng nhập đủ Họ và tên và Lý do ra ngoài (mục có dấu *) trước khi lưu."); return; }
    setEditErr("");
    await setItems(items.map((i) => (i.id === editingId ? { ...i, ...editForm } : i)));
    cancelEdit();
  };

  // STT tính theo thứ tự thời gian đăng ký (createdAt), riêng cho từng ngày, để biết ai đăng ký trước/sau
  const createdTime = (o) => new Date(o.createdAt || o.id).getTime();
  const sttMap = {};
  {
    const counters = {};
    [...items].sort((a, b) => createdTime(a) - createdTime(b)).forEach((o) => {
      counters[o.ngay] = (counters[o.ngay] || 0) + 1;
      sttMap[o.id] = counters[o.ngay];
    });
  }

  const dayItems = items.filter((i) => i.ngay === viewDate).sort((a, b) => createdTime(a) - createdTime(b));
  const pending = dayItems.filter((o) => (o.duyet || "Chờ duyệt") === "Chờ duyệt");
  const approved = dayItems.filter((o) => o.duyet === "Đã duyệt");
  const rejected = dayItems.filter((o) => o.duyet === "Từ chối");
  const chuaVe = approved.filter((i) => i.trangThai === "Chưa về").length;
  const canAct = (o) => perm.canManage || perm.isOwner(o.dangKyBoi);
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = (id) => setSelectedId((s) => (s === id ? null : id));

  const duyetColor = { "Chờ duyệt": T.amberDark, "Đã duyệt": T.green, "Từ chối": T.red };

  const Row = ({ o }) => {
    if (editingId === o.id && editForm) {
      return (
        <div className="stamp-border p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5" style={{ background: "#FBF3DD" }}>
          <div className="md:col-span-2"><FormWarning message={editErr} /></div>
          <Field label="Họ và tên (đổi tên/đổi người ra)" required><input className={inputCls} style={inputStyle} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
          <Field label="Năm sinh"><input className={inputCls} style={inputStyle} value={editForm.namSinh} onChange={(e) => setEditForm({ ...editForm, namSinh: e.target.value })} /></Field>
          <Field label="Tiểu đội">
            <select className={inputCls} style={inputStyle} value={editForm.tieuDoi} onChange={(e) => setEditForm({ ...editForm, tieuDoi: e.target.value })}>
              <option value="1">Tiểu đội 1</option><option value="2">Tiểu đội 2</option>
              <option value="3">Tiểu đội 3</option><option value="4">Tiểu đội 4</option>
            </select>
          </Field>
          <Field label="Ngày ra ngoài"><input type="date" className={inputCls} style={inputStyle} value={editForm.ngay} onChange={(e) => setEditForm({ ...editForm, ngay: e.target.value })} /></Field>
          <Field label="Giờ đi"><input type="time" className={inputCls} style={inputStyle} value={editForm.gioDi} onChange={(e) => setEditForm({ ...editForm, gioDi: e.target.value })} /></Field>
          <Field label="Giờ dự kiến về"><input type="time" className={inputCls} style={inputStyle} value={editForm.gioVeDuKien} onChange={(e) => setEditForm({ ...editForm, gioVeDuKien: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="Lý do ra ngoài" required><input className={inputCls} style={inputStyle} value={editForm.lyDo} onChange={(e) => setEditForm({ ...editForm, lyDo: e.target.value })} /></Field></div>
          <div className="md:col-span-2 flex gap-2"><Btn onClick={saveEdit}>Lưu thay đổi</Btn><Btn variant="outline" onClick={cancelEdit}>Huỷ</Btn></div>
        </div>
      );
    }
    return (
      <div
        onClick={() => toggleSelect(o.id)}
        className="flex items-start justify-between gap-2 py-1.5 px-2 flex-wrap cursor-pointer"
        style={withSelect({ background: "#fff", borderLeft: `3px solid ${duyetColor[o.duyet || "Chờ duyệt"]}` }, selectedId === o.id)}
      >
        <div className="flex items-start gap-2">
          <div className="f-mono text-[10.5px] font-semibold shrink-0 w-6 text-center pt-0.5" style={{ color: T.amberDark }}>#{sttMap[o.id] || "—"}</div>
          <div>
            <div className="f-body text-xs font-medium flex items-center gap-1 flex-wrap leading-tight" style={{ color: T.ink }}>
              {o.name}
              <span className="f-mono text-[10.5px]" style={{ color: T.inkSoft }}>· {o.namSinh || "—"} · TĐ{o.tieuDoi}</span>
            </div>
            <div className="f-body text-[10.5px] leading-tight" style={{ color: T.inkSoft }}>{o.lyDo}</div>
            <div className="f-mono text-[10px] leading-tight" style={{ color: T.inkSoft }}>
              {new Date(o.ngay).toLocaleDateString("vi-VN")} · Ra lúc {o.gioDi || "—"} · Dự kiến về {o.gioVeDuKien || "—"}
              {o.trangThai === "Đã về" && <> · Đã về lúc {o.gioVeThucTe}</>}
            </div>
            <div className="f-mono text-[9px] italic leading-tight" style={{ color: T.inkSoft }}>
              Đăng ký lúc {new Date(o.createdAt || o.id).toLocaleString("vi-VN")} · bởi {o.dangKyBoi || "—"}
              {o.duyetBoi && o.duyet !== "Chờ duyệt" && <> · {o.duyet === "Đã duyệt" ? "duyệt" : "từ chối"} bởi {o.duyetBoi}</>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {o.duyet === "Đã duyệt" && (
            <TheTrangThaiBadge o={o} canAct={canAct(o)} canApprove={canApprove} setThe={setThe} />
          )}
          <span className="f-display text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: duyetColor[o.duyet || "Chờ duyệt"], color: "#fff" }}>{o.duyet || "Chờ duyệt"}</span>
          {o.duyet === "Đã duyệt" && (
            <span className="f-display text-[9px] uppercase tracking-wider px-1.5 py-0.5" style={{ background: o.trangThai === "Đã về" ? T.green : "#8A8F76", color: "#fff" }}>{o.trangThai}</span>
          )}
          {canApprove && (o.duyet || "Chờ duyệt") === "Chờ duyệt" && (
            <>
              <button onClick={() => setDuyet(o.id, "Đã duyệt")} title="Duyệt cho ra ngoài"><CheckCircle2 size={15} style={{ color: T.green }} /></button>
              <button onClick={() => setDuyet(o.id, "Từ chối")} title="Từ chối"><X size={15} style={{ color: T.red }} /></button>
            </>
          )}
          {canApprove && o.duyet === "Từ chối" && (
            <button onClick={() => setDuyet(o.id, "Chờ duyệt")} title="Đưa lại vào hàng chờ duyệt"><Circle size={13} style={{ color: T.amberDark }} /></button>
          )}
          {o.duyet === "Đã duyệt" && o.trangThai !== "Đã về" && canAct(o) && (
            <button onClick={() => markBack(o.id)} title="Xác nhận đã về"><CheckCircle2 size={15} style={{ color: T.green }} /></button>
          )}
          {canApprove && <button onClick={() => startEdit(o)} title="Sửa / đổi tên người ra ngoài"><Pencil size={12} style={{ color: T.green }} /></button>}
          {canAct(o) && <button onClick={() => remove(o.id)} title="Xoá"><Trash2 size={12} style={{ color: T.red }} /></button>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <SectionHeader icon={DoorOpen} eyebrow={`${new Date(viewDate).toLocaleDateString("vi-VN")}: ${approved.length} đã chốt · ${pending.length} chờ duyệt · ${chuaVe} chưa về`} title="Đăng ký ra ngoài"
        action={<Btn onClick={openForm} disabled={isLocked && !canApprove}><Plus size={16} /> {canApprove ? "Thêm người ra ngoài" : "Đăng ký"}</Btn>} />

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <Field label="Xem theo ngày">
          <input type="date" className={inputCls} style={inputStyle} value={viewDate} onChange={(e) => setViewDate(e.target.value)} />
        </Field>
        {viewDate !== today && <Btn variant="outline" onClick={() => setViewDate(today)}>Về hôm nay</Btn>}
      </div>

      {isLocked && (
        <div className="f-body text-[11px] mb-3 px-2.5 py-1.5 flex items-center gap-1.5 flex-wrap" style={{ background: T.red, color: "#fff" }}>
          <DoorOpen size={12} /> <b className="f-display uppercase text-[9.5px] tracking-wide">Đã hết thời gian đăng ký:</b> {lockMessage}
          {canApprove && <span className="italic text-[10px]"> Riêng bạn (Quản trị/Trung đội trưởng/phó) vẫn thêm người ra ngoài được bình thường.</span>}
        </div>
      )}

      {perm.canManage && (
        <div className="stamp-border p-2.5 mb-3" style={{ background: "#FBF3DD" }}>
          <div className="f-display text-[9px] uppercase tracking-widest mb-1.5" style={{ color: T.amberDark }}>Khoá đăng ký ra ngoài</div>
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <Btn variant={manualLockActive ? "danger" : "outline"} onClick={toggleManualLock}>
              {manualLockActive ? "Đang khoá thủ công — bấm để mở khoá" : "Khoá đăng ký ngay (thủ công)"}
            </Btn>
          </div>
          <div className="flex flex-wrap items-end gap-1.5">
            <Field label="Tự động khoá đến thời điểm">
              <input type="datetime-local" className={inputCls} style={inputStyle} value={lockAtInput} onChange={(e) => setLockAtInput(e.target.value)} />
            </Field>
            <Btn onClick={saveScheduledLock}>Lưu giờ khoá</Btn>
            {lock.config.lockAt && <Btn variant="outline" onClick={clearScheduledLock}>Xoá giờ khoá</Btn>}
          </div>
          <p className="f-body text-[9.5px] leading-snug mt-1.5" style={{ color: T.inkSoft }}>
            Đến đúng thời điểm đã đặt, hệ thống sẽ tự động khoá — thành viên không tự đăng ký được nữa, nhưng Quản trị/Trung đội trưởng/phó
            vẫn thêm thẳng người ra ngoài được (dành cho trường hợp phát sinh không kịp đăng ký). Qua 0h ngày mới, mọi người lại đăng ký từ đầu như bình thường.
          </p>
        </div>
      )}

      {showForm && (!isLocked || canApprove) && (
        <div className="stamp-border p-3 mb-3 grid grid-cols-1 md:grid-cols-2 gap-2" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={warn} /></div>
          {canApprove && isLocked && (
            <div className="md:col-span-2 f-body text-[10.5px] px-2.5 py-1.5" style={{ color: T.red, background: "#F7E3E6", borderLeft: `3px solid ${T.red}` }}>
              Đăng ký đang bị khoá đối với thành viên — bạn thêm thẳng người này với vai trò chỉ huy, đăng ký sẽ tự động ở trạng thái "Đã duyệt".
            </div>
          )}
          {canApprove && !isLocked && (
            <div className="md:col-span-2 f-body text-[10.5px] italic" style={{ color: T.inkSoft }}>
              Bạn thêm trực tiếp nên đăng ký này sẽ tự động ở trạng thái "Đã duyệt".
            </div>
          )}
          <Field label="Họ và tên" required>
            <RosterNameSelect
              value={form.name}
              options={rosterSorted.map((m) => ({ value: m.name, label: `${m.name} (TĐ${m.tieuDoi || "—"})` }))}
              onChange={(name) => {
                const chosen = roster.items.find((m) => m.name === name);
                setForm({
                  ...form,
                  name,
                  namSinh: chosen ? yearFromDob(chosen.dob) : form.namSinh,
                  tieuDoi: chosen ? (chosen.tieuDoi || "1") : form.tieuDoi,
                });
              }}
            />
          </Field>
          <Field label="Năm sinh"><input className={inputCls} style={inputStyle} value={form.namSinh} onChange={(e) => setForm({ ...form, namSinh: e.target.value })} placeholder="VD: 2004" /></Field>
          <Field label="Tiểu đội">
            <select className={inputCls} style={inputStyle} value={form.tieuDoi} onChange={(e) => setForm({ ...form, tieuDoi: e.target.value })}>
              <option value="1">Tiểu đội 1</option><option value="2">Tiểu đội 2</option>
              <option value="3">Tiểu đội 3</option><option value="4">Tiểu đội 4</option>
            </select>
          </Field>
          <Field label="Ngày ra ngoài"><input type="date" className={inputCls} style={inputStyle} value={form.ngay} onChange={(e) => setForm({ ...form, ngay: e.target.value })} /></Field>
          <Field label="Giờ đi"><input type="time" className={inputCls} style={inputStyle} value={form.gioDi} onChange={(e) => setForm({ ...form, gioDi: e.target.value })} /></Field>
          <Field label="Giờ dự kiến về"><input type="time" className={inputCls} style={inputStyle} value={form.gioVeDuKien} onChange={(e) => setForm({ ...form, gioVeDuKien: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="Lý do ra ngoài" required><input className={inputCls} style={inputStyle} value={form.lyDo} onChange={(e) => setForm({ ...form, lyDo: e.target.value })} placeholder="VD: Khám bệnh, mua đồ dùng cá nhân…" /></Field></div>
          <div className="md:col-span-2 flex gap-2"><Btn onClick={add}>{canApprove ? "Thêm & duyệt luôn" : "Đăng ký"}</Btn><Btn variant="outline" onClick={() => setShowForm(false)}>Huỷ</Btn></div>
        </div>
      )}

      {loading ? <LoadingRow /> : dayItems.length === 0 ? (
        <EmptyState text={`Chưa có đăng ký ra ngoài nào cho ngày ${new Date(viewDate).toLocaleDateString("vi-VN")}.`} />
      ) : (
        <div className="space-y-3.5">
          <div>
            <div className="f-display text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: T.green }}>
              <CheckCircle2 size={13} /> Danh sách chốt được ra ngoài ({approved.length})
            </div>
            {approved.length === 0 ? (
              <EmptyState text="Chưa có ai được duyệt cho ngày này." />
            ) : (
              <div className="divide-y" style={{ borderColor: T.paperDark }}>{approved.map((o) => <Row key={o.id} o={o} />)}</div>
            )}
          </div>

          <div>
            <div className="f-display text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: T.amberDark }}>
              <Paperclip size={13} /> Ảnh danh sách đã ký duyệt (lãnh đạo)
            </div>
            {approvalPhoto.loading ? <LoadingRow /> : approvalPhoto.data.url ? (
              <div className="stamp-border p-2.5" style={{ background: "#fff" }}>
                <a href={approvalPhoto.data.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-2 py-1.5" style={{ border: `1px solid ${T.paperDark}`, background: "#fff" }}>
                  <img src={approvalPhoto.data.url} alt="Danh sách ra ngoài đã ký duyệt" className="w-12 h-12 object-cover stamp-border" />
                  <span className="f-mono text-xs underline inline-flex items-center gap-1" style={{ color: T.green }}>
                    <Paperclip size={12} /> Xem ảnh danh sách đã ký duyệt
                  </span>
                </a>
                <div className="f-mono text-[9px] mt-1.5" style={{ color: T.inkSoft }}>
                  Tải lên bởi {approvalPhoto.data.uploadedBy || "—"} lúc {approvalPhoto.data.uploadedAt ? new Date(approvalPhoto.data.uploadedAt).toLocaleString("vi-VN") : "—"}
                </div>
                {canApprove && (
                  <button onClick={removeApprovalPhoto} className="f-display text-[10px] uppercase tracking-wider mt-1.5 flex items-center gap-1" style={{ color: T.red }}>
                    <Trash2 size={11} /> Xoá ảnh, tải lại
                  </button>
                )}
              </div>
            ) : canApprove ? (
              <div className="stamp-border p-2.5" style={{ background: "#fff" }}>
                <p className="f-body text-[10.5px] mb-1 leading-snug" style={{ color: T.inkSoft }}>
                  Chụp/tải ảnh tờ danh sách giấy đã có chữ ký duyệt của lãnh đạo cho ngày {new Date(viewDate).toLocaleDateString("vi-VN")}, để lưu làm bằng chứng đối chiếu.
                </p>
                <UploadField onUploaded={saveApprovalPhoto} />
              </div>
            ) : (
              <EmptyState text="Chưa có ảnh danh sách ký duyệt cho ngày này." />
            )}
          </div>

          {pending.length > 0 && (
            <div>
              <div className="f-display text-xs uppercase tracking-wider mb-1.5" style={{ color: T.amberDark }}>Chờ duyệt ({pending.length})</div>
              <div className="divide-y" style={{ borderColor: T.paperDark }}>{pending.map((o) => <Row key={o.id} o={o} />)}</div>
            </div>
          )}

          {rejected.length > 0 && (
            <div>
              <div className="f-display text-xs uppercase tracking-wider mb-1.5" style={{ color: T.red }}>Đã từ chối ({rejected.length})</div>
              <div className="divide-y" style={{ borderColor: T.paperDark }}>{rejected.map((o) => <Row key={o.id} o={o} />)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============ TAB: ĐIỂM DANH ============ */
function AttendanceTab({ user, perm }) {
  const roster = useSharedList("roster");
  const { items, setItems, loading } = useSharedList("attendance");
  const [selectedStatId, setSelectedStatId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const STATUSES = ["Có mặt", "Vắng", "Phép", "Không phép", "Ốm"];
  const statusColor = { "Có mặt": T.green, "Vắng": "#8A8F76", "Phép": T.amberDark, "Không phép": T.red, "Ốm": "#7A5C9E" };

  // Chỉ Quản trị, Trung đội trưởng, Trung đội phó được điểm danh dùm cả trung đội.
  // Tài khoản thành viên khác chỉ thấy và điểm danh được đúng mục của chính mình.
  const canMarkAll = perm.isAdmin || perm.isCommandRole;
  const markableRoster = [...(canMarkAll ? roster.items : roster.items.filter((m) => perm.isOwner(m.name)))]
    .sort((a, b) => Number(a.stt || 9999) - Number(b.stt || 9999));

  const recordFor = (memberId) => items.find((r) => r.date === date && r.memberId === memberId);

  const setStatus = async (member, status) => {
    const existing = recordFor(member.id);
    if (existing) {
      await setItems(items.map((r) => (r.id === existing.id ? { ...r, status, by: user } : r)));
    } else {
      await setItems([...items, { id: Date.now() + Math.random(), date, memberId: member.id, name: member.name, status, by: user }]);
    }
  };

  const startEditNote = (member) => {
    const rec = recordFor(member.id);
    setEditingNoteId(member.id);
    setNoteDraft(rec?.note || "");
  };

  const saveNote = async (member) => {
    const existing = recordFor(member.id);
    if (existing) {
      await setItems(items.map((r) => (r.id === existing.id ? { ...r, note: noteDraft } : r)));
    } else {
      await setItems([...items, { id: Date.now() + Math.random(), date, memberId: member.id, name: member.name, status: null, note: noteDraft, by: user }]);
    }
    setEditingNoteId(null);
  };

  const dayRecords = items.filter((r) => r.date === date);
  const total = roster.items.length;
  const coMat = dayRecords.filter((r) => r.status === "Có mặt").length;
  const summary = STATUSES.map((s) => ({ status: s, count: dayRecords.filter((r) => r.status === s).length }));
  const chuaDiemDanh = Math.max(0, total - dayRecords.length);

  const diligenceNotes = useSharedList("attendanceNotes");
  const diligenceNoteFor = (memberId) => diligenceNotes.items.find((n) => n.memberId === memberId)?.note || "";
  const [editingStatNoteId, setEditingStatNoteId] = useState(null);
  const [statNoteDraft, setStatNoteDraft] = useState("");
  const startEditStatNote = (m) => {
    setEditingStatNoteId(m.id);
    setStatNoteDraft(diligenceNoteFor(m.id));
  };
  const saveStatNote = async (m) => {
    const rest = (diligenceNotes.items || []).filter((n) => n.memberId !== m.id);
    const record = diligenceNotes.items.find((n) => n.memberId === m.id);
    await diligenceNotes.setItems([...rest, { id: record?.id || Date.now(), memberId: m.id, note: statNoteDraft }]);
    setEditingStatNoteId(null);
  };

  const stats = [...roster.items]
    .map((m) => {
      const recs = items.filter((r) => r.memberId === m.id);
      const present = recs.filter((r) => r.status === "Có mặt").length;
      const pct = recs.length ? Math.round((present / recs.length) * 100) : null;
      return { ...m, pct, total: recs.length };
    })
    .sort((a, b) => b.total - a.total || Number(a.stt || 9999) - Number(b.stt || 9999));

  return (
    <div>
      <SectionHeader compact icon={ClipboardCheck} eyebrow={total ? `Có mặt: ${coMat}/${total}` : "Chưa có quân số"} title="Điểm danh hằng ngày"
        action={<input type="date" className={`${inputCls} !w-auto`} style={{ ...inputStyle, fontSize: "12px", padding: "5px 8px" }} value={date} onChange={(e) => setDate(e.target.value)} />} />

      {roster.items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5 mb-4">
          {summary.map((s) => (
            <div key={s.status} className="p-2 text-center" style={{ background: "#fff", borderTop: `3px solid ${statusColor[s.status]}` }}>
              <div className="f-display text-base font-semibold" style={{ color: statusColor[s.status] }}>{s.count}</div>
              <div className="f-mono text-[9px] uppercase tracking-wider mt-0.5" style={{ color: T.inkSoft }}>{s.status}</div>
            </div>
          ))}
          <div className="p-2 text-center" style={{ background: "#fff", borderTop: `3px solid #C9BFA5` }}>
            <div className="f-display text-base font-semibold" style={{ color: T.inkSoft }}>{chuaDiemDanh}</div>
            <div className="f-mono text-[9px] uppercase tracking-wider mt-0.5" style={{ color: T.inkSoft }}>Chưa điểm danh</div>
          </div>
        </div>
      )}

      {!canMarkAll && (
        <p className="f-body text-[10.5px] mb-2.5 italic" style={{ color: T.inkSoft }}>
          Bạn chỉ điểm danh được cho chính mình. Việc điểm danh dùm cả trung đội chỉ dành cho Quản trị, Trung đội trưởng, Trung đội phó.
        </p>
      )}

      {roster.loading || loading ? <LoadingRow /> : roster.items.length === 0 ? (
        <EmptyState text="Chưa có dữ liệu quân số — vào mục Quân số để thêm thành viên trước." />
      ) : markableRoster.length === 0 ? (
        <EmptyState text="Không tìm thấy tên của bạn trong danh sách quân số — liên hệ chỉ huy để được thêm vào Quân số." />
      ) : (
        <div className="overflow-x-auto overflow-y-auto mb-8 stamp-border" style={{ background: "#fff", maxHeight: 545 }}>
          <table className="w-full text-xs f-body table-lines table-grid">
            <thead>
              <tr className="f-mono text-[10px] uppercase tracking-wider" style={{ background: T.green, color: T.paper, position: "sticky", top: 0, zIndex: 1 }}>
                <th className="text-left px-2 py-1.5 w-8">STT</th>
                <th className="text-left px-2 py-1.5 min-w-[110px]">Họ và tên</th>
                <th className="text-left px-2 py-1.5">Tiểu đội</th>
                <th className="text-left px-2 py-1.5 min-w-[240px]">Trạng thái</th>
                <th className="px-2 py-1.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {markableRoster.map((m, i) => {
                const rec = recordFor(m.id);
                const editing = editingNoteId === m.id;
                return (
                  <React.Fragment key={m.id}>
                    <tr style={{ background: i % 2 ? T.paper : "#fff" }}>
                      <td className="px-2 py-1.5 f-mono font-bold">{m.stt || i + 1}</td>
                      <td className="px-2 py-1.5 font-medium">
                        {m.name}
                        {rec?.note && !editing && (
                          <div className="f-body text-[10px] italic mt-0.5" style={{ color: T.inkSoft }}>Ghi chú: {rec.note}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 f-mono">TĐ{m.tieuDoi || "—"}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1 flex-wrap">
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              onClick={() => setStatus(m, s)}
                              className="f-display text-[9.5px] uppercase tracking-wider px-2 py-0.5 flex items-center gap-1"
                              style={{
                                background: rec?.status === s ? statusColor[s] : "transparent",
                                color: rec?.status === s ? "#fff" : statusColor[s],
                                border: `1px solid ${statusColor[s]}`,
                              }}
                            >
                              {rec?.status === s ? <CheckCircle2 size={10} /> : <Circle size={10} />} {s}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => (editing ? setEditingNoteId(null) : startEditNote(m))} title="Sửa ghi chú">
                          <Pencil size={13} style={{ color: T.green }} />
                        </button>
                      </td>
                    </tr>
                    {editing && (
                      <tr style={{ background: T.paper }}>
                        <td colSpan={5} className="px-2 py-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              className={inputCls}
                              style={{ ...inputStyle, fontSize: "11px", padding: "4px 8px", maxWidth: 320 }}
                              placeholder="Ghi chú / lý do (VD: xin phép về quê, ốm sốt...)"
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                            />
                            <Btn size="sm" onClick={() => saveNote(m)}>Lưu</Btn>
                            <Btn size="sm" variant="outline" onClick={() => setEditingNoteId(null)}>Huỷ</Btn>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {roster.items.length > 0 && (
        <>
          <div className="f-display text-xs uppercase tracking-wider mb-2" style={{ color: T.amberDark }}>Tỷ lệ chuyên cần (tổng)</div>
          <div className="overflow-x-auto overflow-y-auto stamp-border" style={{ background: "#fff", maxHeight: 290 }}>
            <table className="w-full text-xs f-body table-lines table-grid">
              <thead>
                <tr className="f-mono text-[10px] uppercase tracking-wider" style={{ background: T.green, color: T.paper, position: "sticky", top: 0, zIndex: 1 }}>
                  <th className="text-left px-2.5 py-1.5 w-8">STT</th><th className="text-left px-2.5 py-1.5">Họ tên</th><th className="text-left px-2.5 py-1.5">Số lần điểm danh</th><th className="text-left px-2.5 py-1.5">% có mặt</th><th className="text-left px-2.5 py-1.5 min-w-[160px]">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((m, i) => {
                  const editingStat = editingStatNoteId === m.id;
                  return (
                    <React.Fragment key={m.id}>
                      <tr onClick={() => setSelectedStatId((s) => (s === m.id ? null : m.id))} className="cursor-pointer" style={withSelect({ background: i % 2 ? T.paper : "#fff" }, selectedStatId === m.id)}>
                        <td className="px-2.5 py-1.5 f-mono font-bold">{m.stt || i + 1}</td>
                        <td className="px-2.5 py-1.5 font-medium">{m.name}</td>
                        <td className="px-2.5 py-1.5 f-mono">{m.total}</td>
                        <td className="px-2.5 py-1.5 f-mono font-semibold" style={{ color: m.pct === null ? T.inkSoft : m.pct >= 90 ? T.green : m.pct >= 70 ? T.amberDark : T.red }}>
                          {m.pct === null ? "—" : `${m.pct}%`}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="f-body text-[11px]" style={{ color: T.inkSoft }}>{diligenceNoteFor(m.id) || "—"}</span>
                            {canMarkAll && (
                              <button onClick={(e) => { e.stopPropagation(); editingStat ? setEditingStatNoteId(null) : startEditStatNote(m); }} title="Sửa ghi chú">
                                <Pencil size={12} style={{ color: T.green }} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {editingStat && (
                        <tr style={{ background: T.paper }} onClick={(e) => e.stopPropagation()}>
                          <td colSpan={5} className="px-2.5 py-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                className={inputCls}
                                style={{ ...inputStyle, fontSize: "11px", padding: "4px 8px", maxWidth: 320 }}
                                placeholder="Ghi chú chuyên cần (VD: nghỉ ốm dài ngày, đã báo phép...)"
                                value={statNoteDraft}
                                onChange={(e) => setStatNoteDraft(e.target.value)}
                              />
                              <Btn size="sm" onClick={() => saveStatNote(m)}>Lưu</Btn>
                              <Btn size="sm" variant="outline" onClick={() => setEditingStatNoteId(null)}>Huỷ</Btn>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ============ TAB: TÀI LIỆU ============ */
function DocsTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("docs");
  const [form, setForm] = useState({ subject: "", title: "", url: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");

  const add = async () => {
    if (!form.title.trim()) { setWarn("Vui lòng nhập Tên tài liệu trước khi lưu."); return; }
    setWarn("");
    await setItems([{ id: Date.now(), ...form, by: user, date: new Date().toISOString() }, ...items]);
    setForm({ subject: "", title: "", url: "" });
    setShowForm(false);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = (id) => setSelectedId((s) => (s === id ? null : id));

  const bySubject = items.reduce((acc, d) => {
    const k = d.subject || "Khác";
    (acc[k] = acc[k] || []).push(d);
    return acc;
  }, {});

  return (
    <div>
      <SectionHeader icon={FolderOpen} eyebrow="Kho lưu trữ" title="Tài liệu học tập"
        action={<Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Thêm tài liệu</Btn>} />

      {showForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-3"><FormWarning message={warn} /></div>
          <Field label="Môn học"><input className={inputCls} style={inputStyle} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
          <Field label="Tên tài liệu" required><input className={inputCls} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Đường dẫn (link)">
            <input className={inputCls} style={inputStyle} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <UploadField onUploaded={(url) => setForm((f) => ({ ...f, url }))} />
          </Field>
          <div className="md:col-span-3"><Btn onClick={add}>Lưu</Btn></div>
        </div>
      )}

      {loading ? <LoadingRow /> : items.length === 0 ? <EmptyState text="Chưa có tài liệu nào." /> : (
        <div className="space-y-5">
          {Object.entries(bySubject).map(([subj, docs]) => (
            <div key={subj}>
              <div className="f-display text-sm uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: T.amberDark }}><ChevronRight size={14} />{subj}</div>
              <div className="space-y-2">
                {docs.map((d) => (
                  <div key={d.id} onClick={() => toggleSelect(d.id)} className="flex items-center justify-between p-3 cursor-pointer" style={withSelect({ background: "#fff" }, selectedId === d.id)}>
                    <div>
                      <div className="f-body text-sm font-medium" style={{ color: T.ink }}>{d.title}</div>
                      {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all" style={{ color: T.green }}>{d.url}</a>}
                    </div>
                    {(perm.canManage || perm.isOwner(d.by)) && <button onClick={() => remove(d.id)}><Trash2 size={14} style={{ color: T.red }} /></button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ TAB: ĐIỂM RÈN LUYỆN ============ */
function ScoresTab({ perm }) {
  const { items, setItems, loading } = useSharedList("scores");
  const [form, setForm] = useState({ name: "", category: "Học tập", score: "", note: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");

  const add = async () => {
    if (!form.name.trim() || form.score === "") { setWarn("Vui lòng nhập đủ Họ tên và Điểm trước khi lưu."); return; }
    setWarn("");
    await setItems([{ id: Date.now(), ...form, date: new Date().toISOString() }, ...items]);
    setForm({ name: "", category: "Học tập", score: "", note: "" });
    setShowForm(false);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = (id) => setSelectedId((s) => (s === id ? null : id));

  return (
    <div>
      <SectionHeader icon={Award} eyebrow="Đánh giá" title="Điểm rèn luyện"
        action={perm.canManage && <Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Ghi điểm</Btn>} />

      {perm.canManage && showForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={warn} /></div>
          <Field label="Họ tên" required><input className={inputCls} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Hạng mục">
            <select className={inputCls} style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>Học tập</option><option>Chấp hành điều lệnh</option><option>Thể lực</option><option>Kỷ luật</option>
            </select>
          </Field>
          <Field label="Điểm" required><input type="number" className={inputCls} style={inputStyle} value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} /></Field>
          <Field label="Ghi chú"><input className={inputCls} style={inputStyle} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <div className="md:col-span-2"><Btn onClick={add}>Lưu</Btn></div>
        </div>
      )}

      {loading ? <LoadingRow /> : items.length === 0 ? <EmptyState text="Chưa có điểm nào được ghi." /> : (
        <div className="overflow-x-auto stamp-border" style={{ background: "#fff" }}>
          <table className="w-full text-sm f-body table-lines">
            <thead>
              <tr className="f-mono text-[11px] uppercase tracking-wider" style={{ background: T.green, color: T.paper }}>
                <th className="text-left px-3 py-2">Họ tên</th><th className="text-left px-3 py-2">Hạng mục</th>
                <th className="text-left px-3 py-2">Điểm</th><th className="text-left px-3 py-2">Ghi chú</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s, i) => (
                <tr key={s.id} onClick={() => toggleSelect(s.id)} className="cursor-pointer" style={withSelect({ background: i % 2 ? T.paper : "#fff" }, selectedId === s.id)}>
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2">{s.category}</td>
                  <td className="px-3 py-2 f-mono font-semibold" style={{ color: T.green }}>{s.score}</td>
                  <td className="px-3 py-2" style={{ color: T.inkSoft }}>{s.note}</td>
                  <td className="px-3 py-2 text-right">{perm.canManage && <button onClick={() => remove(s.id)}><Trash2 size={14} style={{ color: T.red }} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============ TAB: QUỸ TRUNG ĐỘI ============ */
function FundTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("fund");
  const { value: fundConfig, setValue: setFundConfig, loading: cfgLoading } = useSingleDoc("fundConfig", {
    treasurerName: "", bankAccount: "", bankName: "", qrUrl: "",
  });
  const [form, setForm] = useState({ type: "Thu", amount: "", desc: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editErr, setEditErr] = useState("");

  const [cfgForm, setCfgForm] = useState(fundConfig);
  const [showCfgForm, setShowCfgForm] = useState(false);
  useEffect(() => { setCfgForm(fundConfig); }, [fundConfig.treasurerName, fundConfig.bankAccount, fundConfig.bankName, fundConfig.qrUrl]);

  const add = async () => {
    if (!form.amount || !form.desc.trim()) { setWarn("Vui lòng nhập đủ Số tiền và Nội dung trước khi lưu."); return; }
    setWarn("");
    await setItems([{ id: Date.now(), ...form, by: user, date: new Date().toISOString() }, ...items]);
    setForm({ type: "Thu", amount: "", desc: "" });
    setShowForm(false);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const saveCfg = async () => {
    await setFundConfig(cfgForm);
    setShowCfgForm(false);
  };

  // Sửa giao dịch khi ghi nhầm — chỉ Chỉ huy / Thủ quỹ (perm.canManageFund) mới sửa được, không ai khác điều chỉnh được
  const startEdit = (f) => {
    setEditingId(f.id);
    setEditForm({ type: f.type || "Thu", amount: f.amount || "", desc: f.desc || "" });
    setEditErr("");
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); setEditErr(""); };
  const saveEdit = async () => {
    if (!editForm.amount || !editForm.desc.trim()) { setEditErr("Vui lòng nhập đủ Số tiền và Nội dung (mục có dấu *) trước khi lưu."); return; }
    setEditErr("");
    await setItems(items.map((i) => (i.id === editingId ? { ...i, ...editForm } : i)));
    cancelEdit();
  };

  const total = items.reduce((sum, f) => sum + (f.type === "Thu" ? 1 : -1) * Number(f.amount || 0), 0);
  const fmt = (n) => n.toLocaleString("vi-VN") + " đ";
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = (id) => setSelectedId((s) => (s === id ? null : id));

  return (
    <div>
      <SectionHeader icon={Wallet} eyebrow="Tài chính" title="Quỹ trung đội"
        action={perm.canManageFund && <Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Ghi thu/chi</Btn>} />

      <div className="stamp-border p-4 mb-5 flex items-center justify-between" style={{ background: "#fff" }}>
        <span className="f-body text-sm" style={{ color: T.inkSoft }}>Số dư hiện tại</span>
        <span className="f-display text-2xl font-semibold" style={{ color: total >= 0 ? T.green : T.red }}>{fmt(total)}</span>
      </div>

      {/* ---- Thông tin thủ quỹ ---- */}
      <div className="stamp-border p-4 mb-5" style={{ background: "#fff" }}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <span className="f-display text-sm uppercase tracking-wider" style={{ color: T.amberDark }}>Thủ quỹ trung đội</span>
          {perm.canManage && (
            <Btn variant="outline" onClick={() => setShowCfgForm((s) => !s)}>
              <Users size={14} /> {fundConfig.treasurerName ? "Đổi thủ quỹ" : "Chỉ định thủ quỹ"}
            </Btn>
          )}
        </div>

        {perm.canManage && showCfgForm && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 p-3" style={{ background: T.paper, border: `1px solid ${T.paperDark}` }}>
            <div className="md:col-span-2">
              <Field label="Họ và tên thủ quỹ (chỉ huy điền — đúng tên đăng nhập của người đó)">
                <input className={inputCls} style={inputStyle} value={cfgForm.treasurerName} onChange={(e) => setCfgForm({ ...cfgForm, treasurerName: e.target.value })} placeholder="VD: Nguyễn Văn A" />
              </Field>
            </div>
            <Field label="Số tài khoản ngân hàng">
              <input className={inputCls} style={inputStyle} value={cfgForm.bankAccount} onChange={(e) => setCfgForm({ ...cfgForm, bankAccount: e.target.value })} placeholder="VD: 0123456789" />
            </Field>
            <Field label="Tên ngân hàng">
              <input className={inputCls} style={inputStyle} value={cfgForm.bankName} onChange={(e) => setCfgForm({ ...cfgForm, bankName: e.target.value })} placeholder="VD: Vietcombank" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Ảnh mã QR tài khoản ngân hàng">
                {cfgForm.qrUrl && (
                  <a href={cfgForm.qrUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-2 py-1.5 mb-1.5" style={{ border: `1px solid ${T.paperDark}`, background: "#fff" }}>
                    <img src={cfgForm.qrUrl} alt="Mã QR đã tải lên" className="w-12 h-12 object-cover stamp-border" />
                    <span className="f-mono text-xs underline inline-flex items-center gap-1" style={{ color: T.green }}>
                      <Paperclip size={12} /> Xem ảnh đã tải lên
                    </span>
                  </a>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <UploadField onUploaded={(url) => setCfgForm((f) => ({ ...f, qrUrl: url }))} />
                  {cfgForm.qrUrl && (
                    <button onClick={() => setCfgForm((f) => ({ ...f, qrUrl: "" }))} className="f-mono text-[10.5px] underline" style={{ color: T.red }}>Xoá ảnh, tải lại</button>
                  )}
                </div>
              </Field>
            </div>
            <div className="md:col-span-2"><Btn onClick={saveCfg}>Lưu thông tin thủ quỹ</Btn></div>
          </div>
        )}

        {!cfgLoading && !showCfgForm && (
          fundConfig.treasurerName ? (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1">
                <div className="f-body text-sm" style={{ color: T.ink }}>
                  Phụ trách: <b>{fundConfig.treasurerName}</b>
                  {perm.name && normalizeName(perm.name) === normalizeName(fundConfig.treasurerName) && (
                    <span className="f-display text-[10px] uppercase tracking-wider px-2 py-0.5 ml-2" style={{ background: T.amber, color: T.greenDark }}>Đây là bạn</span>
                  )}
                </div>
                {fundConfig.bankAccount && (
                  <div className="f-mono text-xs mt-1" style={{ color: T.inkSoft }}>
                    STK: {fundConfig.bankAccount}{fundConfig.bankName ? ` · ${fundConfig.bankName}` : ""}
                  </div>
                )}
              </div>
              {fundConfig.qrUrl && (
                <a href={fundConfig.qrUrl} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={fundConfig.qrUrl} alt="Mã QR tài khoản" className="w-24 h-24 object-cover stamp-border" style={{ background: "#fff" }} />
                </a>
              )}
            </div>
          ) : (
            <div className="f-body text-xs italic mt-2" style={{ color: T.inkSoft }}>Chưa chỉ định thủ quỹ.</div>
          )
        )}
      </div>

      {perm.canManageFund && showForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-3 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-3"><FormWarning message={warn} /></div>
          <Field label="Loại">
            <select className={inputCls} style={inputStyle} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Thu</option><option>Chi</option>
            </select>
          </Field>
          <Field label="Số tiền (đ)" required><input type="number" className={inputCls} style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Nội dung" required><input className={inputCls} style={inputStyle} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} /></Field>
          <div className="md:col-span-3"><Btn onClick={add}>Lưu</Btn></div>
        </div>
      )}

      {loading ? <LoadingRow /> : items.length === 0 ? <EmptyState text="Chưa có giao dịch nào." /> : (
        <div className="space-y-2">
          {items.map((f) => (
            editingId === f.id && editForm ? (
              <div key={f.id} className="stamp-border p-3 grid grid-cols-1 md:grid-cols-3 gap-2.5" style={{ background: "#FBF3DD" }}>
                <div className="md:col-span-3"><FormWarning message={editErr} /></div>
                <Field label="Loại">
                  <select className={inputCls} style={inputStyle} value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}>
                    <option>Thu</option><option>Chi</option>
                  </select>
                </Field>
                <Field label="Số tiền (đ)" required><input type="number" className={inputCls} style={inputStyle} value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} /></Field>
                <Field label="Nội dung" required><input className={inputCls} style={inputStyle} value={editForm.desc} onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })} /></Field>
                <div className="md:col-span-3 flex gap-2"><Btn onClick={saveEdit}>Lưu thay đổi</Btn><Btn variant="outline" onClick={cancelEdit}>Huỷ</Btn></div>
              </div>
            ) : (
              <div
                key={f.id}
                onClick={() => toggleSelect(f.id)}
                className="flex items-center justify-between p-3 cursor-pointer"
                style={withSelect({ background: "#fff", borderLeft: `4px solid ${f.type === "Thu" ? T.green : T.red}` }, selectedId === f.id)}
              >
                <div>
                  <div className="f-body text-sm font-medium" style={{ color: T.ink }}>{f.desc}</div>
                  <div className="f-mono text-[11px]" style={{ color: T.inkSoft }}>{f.by} · {new Date(f.date).toLocaleDateString("vi-VN")}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="f-mono font-semibold" style={{ color: f.type === "Thu" ? T.green : T.red }}>{f.type === "Thu" ? "+" : "−"}{fmt(Number(f.amount))}</span>
                  {perm.canManageFund && <button onClick={() => startEdit(f)} title="Sửa khi ghi nhầm"><Pencil size={14} style={{ color: T.green }} /></button>}
                  {perm.canManageFund && <button onClick={() => remove(f.id)} title="Xoá"><Trash2 size={14} style={{ color: T.red }} /></button>}
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ TAB: LẤY Ý KIẾN (BIỂU QUYẾT) ============ */
function PollTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("polls");
  const [form, setForm] = useState({ question: "", options: ["", ""], note: "", allowMulti: false });
  const [showForm, setShowForm] = useState(false);
  const [openResults, setOpenResults] = useState({});
  const [warn, setWarn] = useState("");

  const updateOption = (idx, val) => {
    const next = [...form.options];
    next[idx] = val;
    setForm({ ...form, options: next });
  };
  const addOption = () => setForm({ ...form, options: [...form.options, ""] });
  const removeOption = (idx) => setForm({ ...form, options: form.options.filter((_, i) => i !== idx) });

  const create = async () => {
    const cleanOptions = form.options.map((o) => o.trim()).filter(Boolean);
    if (!form.question.trim() || cleanOptions.length < 2) {
      setWarn("Vui lòng nhập Vấn đề cần lấy ý kiến và ít nhất 2 phương án trước khi lưu.");
      return;
    }
    setWarn("");
    const entry = {
      id: Date.now(),
      question: form.question.trim(),
      note: form.note.trim(),
      options: cleanOptions,
      allowMulti: form.allowMulti,
      author: user,
      date: new Date().toISOString(),
      closed: false,
      votes: {}, // { "Tên người": ["Phương án A", ...] }
    };
    await setItems([entry, ...items]);
    setForm({ question: "", options: ["", ""], note: "", allowMulti: false });
    setShowForm(false);
  };

  const remove = async (id) => setItems(items.filter((p) => p.id !== id));
  const toggleClose = async (id) => setItems(items.map((p) => (p.id === id ? { ...p, closed: !p.closed } : p)));

  const vote = async (poll, option) => {
    if (poll.closed) return;
    const mine = poll.votes[user] || [];
    let nextMine;
    if (poll.allowMulti) {
      nextMine = mine.includes(option) ? mine.filter((o) => o !== option) : [...mine, option];
    } else {
      nextMine = mine.includes(option) ? [] : [option];
    }
    const nextVotes = { ...poll.votes, [user]: nextMine };
    await setItems(items.map((p) => (p.id === poll.id ? { ...p, votes: nextVotes } : p)));
  };

  const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = (id) => setSelectedId((s) => (s === id ? null : id));

  return (
    <div>
      <SectionHeader icon={ClipboardCheck} eyebrow="Biểu quyết" title="Lấy ý kiến trung đội"
        action={perm.canManage && <Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Tạo vấn đề mới</Btn>} />

      {perm.canManage && showForm && (
        <div className="stamp-border p-4 mb-5" style={{ background: "#fff" }}>
          <FormWarning message={warn} />
          <Field label="Vấn đề cần lấy ý kiến" required>
            <input className={inputCls} style={inputStyle} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="VD: Chọn địa điểm liên hoan cuối kỳ" />
          </Field>
          <Field label="Ghi chú thêm (không bắt buộc)">
            <input className={inputCls} style={inputStyle} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="VD: Hạn chốt ý kiến trước 20h thứ Sáu" />
          </Field>
          <span className="f-mono text-[11px] uppercase tracking-widest block mb-1.5" style={{ color: T.inkSoft }}>Các phương án <span style={{ color: T.red }} title="Bắt buộc nhập ít nhất 2 phương án">*</span></span>
          <div className="space-y-2 mb-2">
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={inputCls} style={inputStyle} value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Phương án ${i + 1}`}
                />
                {form.options.length > 2 && (
                  <button onClick={() => removeOption(i)} type="button"><Trash2 size={15} style={{ color: T.red }} /></button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addOption} className="f-mono text-xs uppercase tracking-wider mb-3 flex items-center gap-1" style={{ color: T.green }}>
            <Plus size={13} /> Thêm phương án
          </button>
          <label className="f-body text-xs flex items-center gap-2 mb-4" style={{ color: T.inkSoft }}>
            <input type="checkbox" checked={form.allowMulti} onChange={(e) => setForm({ ...form, allowMulti: e.target.checked })} />
            Cho phép chọn nhiều phương án cùng lúc
          </label>
          <Btn onClick={create}>Đăng để lấy ý kiến</Btn>
        </div>
      )}

      {loading ? <LoadingRow /> : sorted.length === 0 ? <EmptyState text="Chưa có vấn đề nào cần lấy ý kiến." /> : (
        <div className="space-y-4">
          {sorted.map((poll) => {
            const totalVoters = Object.keys(poll.votes || {}).filter((n) => (poll.votes[n] || []).length > 0).length;
            const counts = poll.options.map((opt) => {
              const c = Object.values(poll.votes || {}).filter((v) => v.includes(opt)).length;
              return { opt, c };
            });
            const maxC = Math.max(1, ...counts.map((x) => x.c));
            const mine = (poll.votes && poll.votes[user]) || [];
            const showResults = openResults[poll.id] || poll.closed || perm.canManage;

            return (
              <div
                key={poll.id}
                onClick={() => toggleSelect(poll.id)}
                className="p-4 cursor-pointer"
                style={withSelect({ background: "#fff", borderLeft: `4px solid ${poll.closed ? T.inkSoft : T.green}` }, selectedId === poll.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="f-display font-semibold" style={{ color: T.green }}>{poll.question}</h3>
                      {poll.closed && (
                        <span className="f-display text-[10px] uppercase tracking-wider px-2 py-0.5" style={{ background: T.inkSoft, color: "#fff" }}>Đã chốt</span>
                      )}
                    </div>
                    {poll.note && <p className="f-body text-xs mt-1" style={{ color: T.inkSoft }}>{poll.note}</p>}
                    <div className="f-mono text-[11px] mt-1" style={{ color: T.inkSoft }}>
                      {poll.author} · {new Date(poll.date).toLocaleString("vi-VN")} · {totalVoters} người đã cho ý kiến
                    </div>
                  </div>
                  {perm.canManage && (
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => toggleClose(poll.id)} title={poll.closed ? "Mở lại" : "Chốt kết quả"}>
                        <CheckCircle2 size={16} style={{ color: poll.closed ? T.inkSoft : T.green }} />
                      </button>
                      <button onClick={() => remove(poll.id)} title="Xoá"><Trash2 size={16} style={{ color: T.red }} /></button>
                    </div>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {poll.options.map((opt) => {
                    const picked = mine.includes(opt);
                    const info = counts.find((c) => c.opt === opt);
                    const pct = showResults ? Math.round((info.c / maxC) * 100) : 0;
                    return (
                      <button
                        key={opt}
                        type="button"
                        disabled={poll.closed}
                        onClick={() => vote(poll, opt)}
                        className="w-full text-left relative overflow-hidden f-body text-sm px-3 py-2 disabled:cursor-not-allowed"
                        style={{ border: `1px solid ${picked ? T.green : "#C9BFA5"}`, background: "#fff" }}
                      >
                        {showResults && (
                          <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: picked ? "rgba(31,51,40,0.14)" : "rgba(227,167,62,0.18)", transition: "width 0.3s ease" }} />
                        )}
                        <div className="relative flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2" style={{ color: T.ink }}>
                            {picked ? <CheckCircle2 size={15} style={{ color: T.green }} /> : <Circle size={15} style={{ color: "#C9BFA5" }} />}
                            {opt}
                          </span>
                          {showResults && <span className="f-mono text-xs shrink-0" style={{ color: T.inkSoft }}>{info.c} phiếu</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {!showResults && (
                  <button
                    className="f-mono text-xs mt-2.5 uppercase tracking-wider"
                    style={{ color: T.green }}
                    onClick={() => setOpenResults((s) => ({ ...s, [poll.id]: true }))}
                  >
                    Xem kết quả hiện tại
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============ TAB: BẢNG TIN / GÓP Ý ============ */
function BoardTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("posts");
  const [content, setContent] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [replyOpen, setReplyOpen] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyAttachUrl, setReplyAttachUrl] = useState("");
  const [warn, setWarn] = useState("");
  const [replyWarn, setReplyWarn] = useState("");
  const isImage = (u) => /\.(png|jpe?g|gif|webp)$/i.test(u || "");

  const post = async () => {
    if (!content.trim() && !attachUrl) { setWarn("Vui lòng nhập nội dung hoặc đính kèm ảnh/file trước khi đăng."); return; }
    setWarn("");
    await setItems([{ id: Date.now(), author: user, content, url: attachUrl, date: new Date().toISOString(), replies: [] }, ...items]);
    setContent("");
    setAttachUrl("");
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const reply = async (id) => {
    if (!replyText.trim() && !replyAttachUrl) { setReplyWarn("Vui lòng nhập nội dung hoặc đính kèm ảnh/file trước khi gửi."); return; }
    setReplyWarn("");
    await setItems(items.map((p) => p.id === id ? { ...p, replies: [...p.replies, { author: user, content: replyText, url: replyAttachUrl, date: new Date().toISOString() }] } : p));
    setReplyText("");
    setReplyAttachUrl("");
    setReplyOpen(null);
  };
  const toggleReaction = async (id) => setItems(items.map((p) => {
    if (p.id !== id) return p;
    const reactions = p.reactions || [];
    const mine = reactions.includes(user);
    return { ...p, reactions: mine ? reactions.filter((n) => n !== user) : [...reactions, user] };
  }));
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = (id) => setSelectedId((s) => (s === id ? null : id));

  // ---- Ghim tin nhắn quan trọng (tối đa 10, dành cho chỉ huy) ----
  const [pinWarn, setPinWarn] = useState("");
  const togglePin = async (id, e) => {
    e.stopPropagation();
    const target = items.find((i) => i.id === id);
    if (!target) return;
    if (!target.pinned && items.filter((i) => i.pinned).length >= 10) {
      setPinWarn("Chỉ được ghim tối đa 10 tin nhắn. Hãy bỏ ghim bớt trước khi ghim thêm.");
      return;
    }
    setPinWarn("");
    await setItems(items.map((i) => (i.id === id ? { ...i, pinned: !i.pinned, pinnedAt: !i.pinned ? Date.now() : null } : i)));
  };
  const [editingPostId, setEditingPostId] = useState(null);
  const [editPostContent, setEditPostContent] = useState("");
  const [editPostUrl, setEditPostUrl] = useState("");
  const startEditPost = (p, e) => { e.stopPropagation(); setEditingPostId(p.id); setEditPostContent(p.content || ""); setEditPostUrl(p.url || ""); };
  const cancelEditPost = (e) => { e?.stopPropagation(); setEditingPostId(null); setEditPostContent(""); setEditPostUrl(""); };
  const saveEditPost = async (id, e) => {
    e.stopPropagation();
    if (!editPostContent.trim() && !editPostUrl) return;
    await setItems(items.map((p) => p.id === id ? { ...p, content: editPostContent, url: editPostUrl, editedAt: new Date().toISOString() } : p));
    setEditingPostId(null);
    setEditPostContent("");
    setEditPostUrl("");
  };

  // ---- Sửa / xoá trả lời của chính mình ----
  const [editingReply, setEditingReply] = useState(null); // { postId, idx }
  const [editReplyContent, setEditReplyContent] = useState("");
  const [editReplyUrl, setEditReplyUrl] = useState("");
  const startEditReply = (postId, idx, r, e) => { e.stopPropagation(); setEditingReply({ postId, idx }); setEditReplyContent(r.content || ""); setEditReplyUrl(r.url || ""); };
  const cancelEditReply = (e) => { e?.stopPropagation(); setEditingReply(null); setEditReplyContent(""); setEditReplyUrl(""); };
  const saveEditReply = async (e) => {
    e.stopPropagation();
    if (!editingReply) return;
    const { postId, idx } = editingReply;
    if (!editReplyContent.trim() && !editReplyUrl) return;
    await setItems(items.map((p) => p.id === postId ? { ...p, replies: p.replies.map((r, i) => i === idx ? { ...r, content: editReplyContent, url: editReplyUrl, editedAt: new Date().toISOString() } : r) } : p));
    setEditingReply(null);
    setEditReplyContent("");
    setEditReplyUrl("");
  };
  const deleteReply = async (postId, idx, e) => {
    e.stopPropagation();
    await setItems(items.map((p) => p.id === postId ? { ...p, replies: p.replies.filter((_, i) => i !== idx) } : p));
  };

  // Link tải ảnh về máy/thư viện ảnh — bấm là tải/lưu ảnh thật sự về máy, giống Zalo.
  const DownloadLink = ({ url, label = "Tải ảnh về máy", size = 11, className = "" }) => (
    <a
      href={url}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); forceDownload(url); }}
      className={`f-mono underline inline-flex items-center gap-1 cursor-pointer ${className}`}
      style={{ color: T.green, fontSize: size + 1 }}
    >
      <Download size={size} /> {label}
    </a>
  );

  const sortedPosts = [...items].sort((a, b) => {
    const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    if (a.pinned && b.pinned) return (a.pinnedAt || 0) - (b.pinnedAt || 0);
    return 0;
  });
  const pinRank = {};
  sortedPosts.filter((p) => p.pinned).forEach((p, idx) => { pinRank[p.id] = idx + 1; });

  return (
    <div>
      <SectionHeader icon={MessageSquare} eyebrow="Trao đổi" title="Phòng trò chuyện chung Trung đội" />

      {pinWarn && <FormWarning message={pinWarn} />}

      <div className="stamp-border p-4 mb-5" style={{ background: "#fff" }}>
        <FormWarning message={warn} />
        <textarea rows={2} className={inputCls} style={inputStyle} placeholder="Viết gì đó cho cả trung đội…" value={content} onChange={(e) => setContent(e.target.value)} />
        <UploadField onUploaded={setAttachUrl} />
        {attachUrl && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {isImage(attachUrl) ? (
              <img src={attachUrl} alt="Đính kèm" className="max-w-[140px] max-h-28 stamp-border" />
            ) : (
              <a href={attachUrl} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all inline-flex items-center gap-1" style={{ color: T.green }}>
                <Paperclip size={12} /> Xem file vừa tải lên
              </a>
            )}
            <button onClick={() => setAttachUrl("")} title="Bỏ đính kèm"><X size={14} style={{ color: T.red }} /></button>
          </div>
        )}
        <div className="mt-2"><Btn onClick={post}>Đăng</Btn></div>
      </div>

      {loading ? <LoadingRow /> : items.length === 0 ? <EmptyState text="Chưa có bài đăng nào." /> : (
        <div className="space-y-3">
          {sortedPosts.map((p) => (
            <div key={p.id} onClick={() => toggleSelect(p.id)} className="p-4 cursor-pointer" style={withSelect({ background: "#fff", borderLeft: p.pinned ? `4px solid ${T.amber}` : "none" }, selectedId === p.id)}>
              {editingPostId === p.id ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="f-display font-semibold text-sm mb-1.5" style={{ color: T.green }}>{p.author}</div>
                  <textarea rows={2} className={inputCls} style={inputStyle} value={editPostContent} onChange={(e) => setEditPostContent(e.target.value)} placeholder="Nội dung…" />
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <UploadField onUploaded={setEditPostUrl} />
                    {editPostUrl && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {isImage(editPostUrl) ? (
                          <img src={editPostUrl} alt="Đính kèm" className="max-w-[120px] max-h-24 stamp-border" />
                        ) : (
                          <a href={editPostUrl} target="_blank" rel="noreferrer" className="f-mono text-[10.5px] underline break-all inline-flex items-center gap-1" style={{ color: T.green }}>
                            <Paperclip size={11} /> Xem file
                          </a>
                        )}
                        <button onClick={() => setEditPostUrl("")} title="Bỏ đính kèm"><X size={13} style={{ color: T.red }} /></button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Btn onClick={(e) => saveEditPost(p.id, e)}>Lưu</Btn>
                    <button className="f-mono text-xs uppercase tracking-wider" style={{ color: T.inkSoft }} onClick={cancelEditPost}>Huỷ</button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-start">
                  <div>
                    {p.pinned && (
                      <span className="f-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 inline-flex items-center gap-1 mb-1" style={{ background: T.amber, color: T.greenDark }}>
                        <Pin size={11} /> Ghim #{pinRank[p.id]}
                      </span>
                    )}
                    <div className="f-display font-semibold text-sm" style={{ color: T.green }}>
                      {p.author}
                    </div>
                    <p className="f-body text-sm mt-1 whitespace-pre-wrap" style={{ color: T.ink }}>{p.content}</p>
                    {p.url && (
                      isImage(p.url) ? (
                        <div className="mt-2">
                          <a href={p.url} target="_blank" rel="noreferrer" className="block" onClick={(e) => e.stopPropagation()}>
                            <img src={p.url} alt="Đính kèm" className="max-w-[220px] max-h-48 stamp-border" />
                          </a>
                          <DownloadLink url={p.url} className="mt-1" />
                        </div>
                      ) : (
                        <a href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="f-mono text-xs underline break-all mt-1 inline-flex items-center gap-1" style={{ color: T.green }}>
                          <Paperclip size={12} /> Xem file đính kèm
                        </a>
                      )
                    )}
                    <div className="f-mono text-[11px] mt-1" style={{ color: T.inkSoft }}>
                      {new Date(p.date).toLocaleString("vi-VN")}{p.editedAt ? " · đã chỉnh sửa" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {perm.canManage && <button onClick={(e) => togglePin(p.id, e)} title={p.pinned ? "Bỏ ghim" : "Ghim tin nhắn quan trọng"}><Star size={14} fill={p.pinned ? T.amberDark : "none"} style={{ color: p.pinned ? T.amberDark : "#C9BFA5", filter: p.pinned ? `drop-shadow(0 0 4px ${T.amber})` : "none", transition: "all .15s" }} /></button>}
                    {(perm.canManage || perm.isOwner(p.author)) && (
                      <>
                        {perm.isOwner(p.author) && <button onClick={(e) => startEditPost(p, e)} title="Sửa"><Pencil size={13} style={{ color: T.inkSoft }} /></button>}
                        <button onClick={(e) => { e.stopPropagation(); remove(p.id); }} title="Xoá"><Trash2 size={14} style={{ color: T.red }} /></button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <ReactionBar reactions={p.reactions} user={user} onToggle={() => toggleReaction(p.id)} />

              {p.replies.length > 0 && (
                <div className="mt-3 ml-4 pl-3 space-y-2 overflow-y-auto" style={{ borderLeft: `2px solid ${T.paperDark}`, maxHeight: p.replies.length > 10 ? 320 : "none" }}>
                  {p.replies.map((r, idx) => (
                    <div key={idx}>
                      {editingReply && editingReply.postId === p.id && editingReply.idx === idx ? (
                        <div onClick={(e) => e.stopPropagation()}>
                          <span className="f-display text-xs font-semibold" style={{ color: T.amberDark }}>{r.author}</span>
                          <input className={inputCls} style={{ ...inputStyle, marginTop: 4 }} value={editReplyContent} onChange={(e) => setEditReplyContent(e.target.value)} placeholder="Trả lời…" />
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <UploadField onUploaded={setEditReplyUrl} />
                            {editReplyUrl && (
                              <div className="flex items-center gap-2 flex-wrap">
                                {isImage(editReplyUrl) ? (
                                  <img src={editReplyUrl} alt="Đính kèm" className="max-w-[100px] max-h-20 stamp-border" />
                                ) : (
                                  <a href={editReplyUrl} target="_blank" rel="noreferrer" className="f-mono text-[10px] underline break-all inline-flex items-center gap-1" style={{ color: T.green }}>
                                    <Paperclip size={10} /> Xem file
                                  </a>
                                )}
                                <button onClick={() => setEditReplyUrl("")} title="Bỏ đính kèm"><X size={12} style={{ color: T.red }} /></button>
                              </div>
                            )}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <Btn onClick={saveEditReply}>Lưu</Btn>
                            <button className="f-mono text-[10.5px] uppercase tracking-wider" style={{ color: T.inkSoft }} onClick={cancelEditReply}>Huỷ</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="f-display text-xs font-semibold" style={{ color: T.amberDark }}>{r.author}</span>
                            <span className="f-body text-xs ml-2" style={{ color: T.ink }}>{r.content}</span>
                            {r.editedAt && <span className="f-mono text-[9.5px] ml-1.5" style={{ color: T.inkSoft }}>(đã sửa)</span>}
                            {r.url && (
                              isImage(r.url) ? (
                                <div className="mt-1.5">
                                  <a href={r.url} target="_blank" rel="noreferrer" className="block" onClick={(e) => e.stopPropagation()}>
                                    <img src={r.url} alt="Đính kèm" className="max-w-[160px] max-h-36 stamp-border" />
                                  </a>
                                  <DownloadLink url={r.url} size={10} className="mt-1" />
                                </div>
                              ) : (
                                <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="f-mono text-[10.5px] underline break-all mt-1 ml-2 inline-flex items-center gap-1" style={{ color: T.green }}>
                                  <Paperclip size={11} /> Xem file đính kèm
                                </a>
                              )
                            )}
                          </div>
                          {(perm.canManage || perm.isOwner(r.author)) && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {perm.isOwner(r.author) && <button onClick={(e) => startEditReply(p.id, idx, r, e)} title="Sửa"><Pencil size={11} style={{ color: T.inkSoft }} /></button>}
                              <button onClick={(e) => deleteReply(p.id, idx, e)} title="Xoá"><Trash2 size={12} style={{ color: T.red }} /></button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {replyOpen === p.id ? (
                <div className="mt-2">
                  {replyOpen === p.id && <FormWarning message={replyWarn} />}
                  <div className="flex gap-2">
                    <input className={inputCls} style={inputStyle} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Trả lời…" />
                    <Btn onClick={() => reply(p.id)}>Gửi</Btn>
                  </div>
                  <UploadField onUploaded={setReplyAttachUrl} />
                  {replyAttachUrl && (
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      {isImage(replyAttachUrl) ? (
                        <img src={replyAttachUrl} alt="Đính kèm" className="max-w-[120px] max-h-24 stamp-border" />
                      ) : (
                        <a href={replyAttachUrl} target="_blank" rel="noreferrer" className="f-mono text-[10.5px] underline break-all inline-flex items-center gap-1" style={{ color: T.green }}>
                          <Paperclip size={11} /> Xem file vừa tải lên
                        </a>
                      )}
                      <button onClick={() => setReplyAttachUrl("")} title="Bỏ đính kèm"><X size={13} style={{ color: T.red }} /></button>
                    </div>
                  )}
                </div>
              ) : (
                <button className="f-mono text-xs mt-2 uppercase tracking-wider" style={{ color: T.green }} onClick={(e) => { e.stopPropagation(); setReplyOpen(p.id); setReplyWarn(""); setReplyAttachUrl(""); }}>Trả lời</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ TAB: PHÒNG TRÒ CHUYỆN CHỈ HUY ============
   Chỉ Quản trị, Trung đội trưởng/phó, Tiểu đội trưởng/phó mới vào được (perm.canAccessCommandChat).
   Dữ liệu lưu riêng ở "commandChat", tách biệt hoàn toàn với "posts" (Phòng trò chuyện chung),
   nên thành viên thường không xem/gửi được dù có cố tình truy cập.
*/
function CommandChatTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("commandChat");
  const [content, setContent] = useState("");
  const [replyOpen, setReplyOpen] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [warn, setWarn] = useState("");
  const [replyWarn, setReplyWarn] = useState("");

  // Chốt chặn an toàn: dù có cách nào chuyển được vào tab này, không có quyền thì cũng không thấy nội dung
  if (!perm.canAccessCommandChat) {
    return (
      <div>
        <SectionHeader icon={Lock} eyebrow="Giới hạn truy cập" title="Phòng trò chuyện chỉ huy" />
        <div className="stamp-border p-6 text-center" style={{ background: "#fff" }}>
          <Lock size={28} className="mx-auto mb-2" style={{ color: T.inkSoft }} />
          <p className="f-body text-sm" style={{ color: T.inkSoft }}>
            Mục này chỉ dành cho Trung đội trưởng, Trung đội phó, Tiểu đội trưởng, Tiểu đội phó và Quản trị.
          </p>
        </div>
      </div>
    );
  }

  const post = async () => {
    if (!content.trim()) { setWarn("Vui lòng nhập nội dung trước khi đăng."); return; }
    setWarn("");
    await setItems([{ id: Date.now(), author: user, content, date: new Date().toISOString(), replies: [] }, ...items]);
    setContent("");
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const reply = async (id) => {
    if (!replyText.trim()) { setReplyWarn("Vui lòng nhập nội dung trả lời trước khi gửi."); return; }
    setReplyWarn("");
    await setItems(items.map((p) => p.id === id ? { ...p, replies: [...p.replies, { author: user, content: replyText, date: new Date().toISOString() }] } : p));
    setReplyText("");
    setReplyOpen(null);
  };
  const toggleReaction = async (id) => setItems(items.map((p) => {
    if (p.id !== id) return p;
    const reactions = p.reactions || [];
    const mine = reactions.includes(user);
    return { ...p, reactions: mine ? reactions.filter((n) => n !== user) : [...reactions, user] };
  }));
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = (id) => setSelectedId((s) => (s === id ? null : id));

  return (
    <div>
      <SectionHeader icon={Lock} eyebrow="Riêng chỉ huy" title="Phòng trò chuyện chỉ huy" />

      <div className="f-body text-xs mb-5 px-4 py-2.5 flex items-center gap-2" style={{ background: T.green, color: T.paper }}>
        <Lock size={14} />
        Chỉ Trung đội trưởng, Trung đội phó, Tiểu đội trưởng, Tiểu đội phó và Quản trị mới xem và trao đổi được ở đây.
      </div>

      <div className="stamp-border p-4 mb-5" style={{ background: "#fff" }}>
        <FormWarning message={warn} />
        <textarea rows={2} className={inputCls} style={inputStyle} placeholder="Trao đổi riêng với chỉ huy…" value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="mt-2"><Btn onClick={post}>Đăng</Btn></div>
      </div>

      {loading ? <LoadingRow /> : items.length === 0 ? <EmptyState text="Chưa có nội dung trao đổi nào." /> : (
        <div className="space-y-3">
          {items.map((p) => (
            <div key={p.id} onClick={() => toggleSelect(p.id)} className="p-4 cursor-pointer" style={withSelect({ background: "#fff" }, selectedId === p.id)}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="f-display font-semibold text-sm" style={{ color: T.green }}>{p.author}</div>
                  <p className="f-body text-sm mt-1" style={{ color: T.ink }}>{p.content}</p>
                  <div className="f-mono text-[11px] mt-1" style={{ color: T.inkSoft }}>{new Date(p.date).toLocaleString("vi-VN")}</div>
                </div>
                {(perm.isAdmin || perm.isOwner(p.author)) && <button onClick={() => remove(p.id)}><Trash2 size={14} style={{ color: T.red }} /></button>}
              </div>

              <ReactionBar reactions={p.reactions} user={user} onToggle={() => toggleReaction(p.id)} />

              {p.replies.length > 0 && (
                <div className="mt-3 ml-4 pl-3 space-y-2" style={{ borderLeft: `2px solid ${T.paperDark}` }}>
                  {p.replies.map((r, idx) => (
                    <div key={idx}>
                      <span className="f-display text-xs font-semibold" style={{ color: T.amberDark }}>{r.author}</span>
                      <span className="f-body text-xs ml-2" style={{ color: T.ink }}>{r.content}</span>
                    </div>
                  ))}
                </div>
              )}

              {replyOpen === p.id ? (
                <div className="mt-2">
                  {replyOpen === p.id && <FormWarning message={replyWarn} />}
                  <div className="flex gap-2">
                    <input className={inputCls} style={inputStyle} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Trả lời…" />
                    <Btn onClick={() => reply(p.id)}>Gửi</Btn>
                  </div>
                </div>
              ) : (
                <button className="f-mono text-xs mt-2 uppercase tracking-wider" style={{ color: T.green }} onClick={() => { setReplyOpen(p.id); setReplyWarn(""); }}>Trả lời</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ TAB: PHÂN QUYỀN (chỉ quản trị) ============ */
const ALL_DATA_KEYS = [
  "announcements", "schedule", "studyAppendix", "checkpoints", "weekendRest", "weekendApprovals", "weekendOffApprovals",
  "outings", "outingLock", "attendance", "attendanceNotes", "docs", "scores",
  "fund", "fundConfig", "posts", "commandChat", "polls", "roster", "rosterLeaderInfo", "rosterSelfEntry", "permissions", "authConfig",
];

function BackupSection() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const exportBackup = async () => {
    setBusy(true);
    setStatus("Đang gom dữ liệu…");
    try {
      const data = {};
      for (const k of ALL_DATA_KEYS) {
        try {
          const snap = await getDoc(doc(db, "lt31b2", k));
          data[k] = snap.exists() && snap.data().value ? JSON.parse(snap.data().value) : [];
        } catch (e) {
          data[k] = [];
        }
      }
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sao-luu-lt31b2-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("Đã tải file sao lưu về máy.");
    } catch (e) {
      setStatus("Lỗi khi sao lưu, thử lại nhé.");
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (file) => {
    if (!file) return;
    setBusy(true);
    setStatus("Đang khôi phục dữ liệu…");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = parsed.data || parsed; // hỗ trợ cả file cũ không có bọc "data"
      let count = 0;
      for (const k of ALL_DATA_KEYS) {
        if (data[k] !== undefined) {
          await setDoc(doc(db, "lt31b2", k), { value: JSON.stringify(data[k]) });
          count++;
        }
      }
      setStatus(`Đã khôi phục ${count} mục dữ liệu.`);
    } catch (e) {
      setStatus("File không hợp lệ hoặc lỗi khi khôi phục.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stamp-border p-4 mb-5" style={{ background: "#fff" }}>
      <div className="f-display text-sm uppercase tracking-wider mb-2" style={{ color: T.amberDark }}>Sao lưu & khôi phục dữ liệu</div>
      <p className="f-body text-xs mb-3" style={{ color: T.inkSoft }}>
        Dữ liệu trang này đã được lưu trữ dùng chung trên Firebase, đồng bộ theo thời gian thực và không mất khi đăng xuất.
        Mục này chỉ để tải thêm một bản sao ra máy tính phòng trường hợp cần lưu trữ ngoài hoặc khôi phục lại.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Btn onClick={exportBackup} disabled={busy}><Paperclip size={16} /> Xuất file sao lưu (.json)</Btn>
        <label className="f-display text-sm tracking-wide uppercase px-4 py-2 flex items-center gap-2 cursor-pointer" style={{ background: "transparent", color: T.green, border: `1.5px solid ${T.green}` }}>
          <Plus size={16} /> Nhập file khôi phục
          <input type="file" accept="application/json" className="hidden" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) restoreBackup(f); }} />
        </label>
      </div>
      {status && <div className="f-body text-xs mt-3" style={{ color: T.inkSoft }}>{status}</div>}
    </div>
  );
}

/* ============ TAB: ĐỔI MẬT KHẨU ============
   - Quản trị (admin): quyền cao nhất — đổi được cả mật khẩu chung trung đội và mật khẩu quản trị.
   - Trung đội trưởng / Trung đội phó: chỉ đổi được mật khẩu đăng nhập riêng của chính mình,
     không được xem hay đổi mật khẩu chung, càng không được xem/đổi mật khẩu quản trị.
*/
function PasswordTab({ user, perm }) {
  const { config, setConfig, loading } = useAuthConfig();
  const [unitPw, setUnitPw] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [ownPw, setOwnPw] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const normalized = normalizeName(user);

  useEffect(() => {
    setUnitPw(config.unitPassword);
    setAdminPw(config.adminPassword);
    setOwnPw(config.memberPasswords?.[normalized] || config.unitPassword);
  }, [config.unitPassword, config.adminPassword, config.memberPasswords, normalized]);

  const [warn, setWarn] = useState("");

  const saveAdmin = async () => {
    if (!unitPw.trim() || !adminPw.trim()) { setWarn("Vui lòng nhập đủ cả Mật khẩu chung trung đội và Mật khẩu quản trị trước khi lưu."); return; }
    setWarn("");
    setSaving(true);
    const ok = await setConfig({ ...config, unitPassword: unitPw.trim(), adminPassword: adminPw.trim() });
    setSaving(false);
    setStatus(ok ? "Đã lưu mật khẩu mới. Áp dụng ngay từ lần đăng nhập tiếp theo." : "Lưu thất bại, thử lại nhé.");
    setTimeout(() => setStatus(""), 4000);
  };

  const saveOwn = async () => {
    if (!ownPw.trim()) { setWarn("Vui lòng nhập mật khẩu trước khi lưu."); return; }
    setWarn("");
    setSaving(true);
    const nextMemberPasswords = { ...(config.memberPasswords || {}), [normalized]: ownPw.trim() };
    const ok = await setConfig({ ...config, memberPasswords: nextMemberPasswords });
    setSaving(false);
    setStatus(ok ? "Đã lưu mật khẩu riêng của bạn. Lần đăng nhập tiếp theo hãy dùng mật khẩu này." : "Lưu thất bại, thử lại nhé.");
    setTimeout(() => setStatus(""), 4000);
  };

  return (
    <div>
      <SectionHeader icon={KeyRound} eyebrow="Bảo mật" title="Đổi mật khẩu" />
      {loading ? (
        <LoadingRow />
      ) : perm.isAdmin ? (
        <div className="stamp-border p-4" style={{ background: "#fff" }}>
          <p className="f-body text-xs mb-4" style={{ color: T.inkSoft }}>
            Bạn là Quản trị — quyền cao nhất, đổi được cả mật khẩu chung trung đội và mật khẩu quản trị.
            Mật khẩu mới áp dụng ngay từ lần đăng nhập tiếp theo của mọi người trong trung đội.
          </p>
          <FormWarning message={warn} />
          <Field label="Mật khẩu chung trung đội (dùng để đăng nhập thường)" required>
            <PasswordInput value={unitPw} onChange={(e) => setUnitPw(e.target.value)} />
          </Field>
          <Field label="Mật khẩu quản trị (đăng nhập được toàn quyền)" required>
            <PasswordInput value={adminPw} onChange={(e) => setAdminPw(e.target.value)} />
          </Field>
          <Btn onClick={saveAdmin} disabled={saving}>{saving ? "Đang lưu…" : "Lưu mật khẩu"}</Btn>
          {status && <div className="f-body text-xs mt-3" style={{ color: T.green }}>{status}</div>}
        </div>
      ) : (
        <div className="stamp-border p-4" style={{ background: "#fff" }}>
          <p className="f-body text-xs mb-4" style={{ color: T.inkSoft }}>
            Bạn là Trung đội trưởng/phó — chỉ đổi được mật khẩu đăng nhập riêng của chính mình.
            Bạn không có quyền xem hay đổi mật khẩu chung trung đội, và càng không có quyền xem hay đổi mật khẩu quản trị.
          </p>
          <FormWarning message={warn} />
          <Field label={`Mật khẩu đăng nhập riêng của bạn (${user})`} required>
            <PasswordInput value={ownPw} onChange={(e) => setOwnPw(e.target.value)} />
          </Field>
          <Btn onClick={saveOwn} disabled={saving}>{saving ? "Đang lưu…" : "Lưu mật khẩu"}</Btn>
          {status && <div className="f-body text-xs mt-3" style={{ color: T.green }}>{status}</div>}
        </div>
      )}
    </div>
  );
}

function PermissionsTab({ permissions, setPermissions, permLoading }) {
  const roster = useSharedList("roster");
  const [nameInput, setNameInput] = useState("");
  const [roleInput, setRoleInput] = useState("can_bo");
  const [warn, setWarn] = useState("");

  const grant = async () => {
    const nm = nameInput.trim();
    if (!nm) { setWarn("Vui lòng nhập Họ và tên trước khi gán quyền."); return; }
    setWarn("");
    const rest = permissions.filter((p) => normalizeName(p.name) !== normalizeName(nm));
    await setPermissions([...rest, { id: Date.now(), name: nm, role: roleInput }]);
    setNameInput("");
  };
  const revoke = async (id) => setPermissions(permissions.filter((p) => p.id !== id));
  const [selectedId, setSelectedId] = useState(null);
  const toggleSelect = (id) => setSelectedId((s) => (s === id ? null : id));

  const roleLabel = { can_bo: "Cán bộ (được xoá mọi nội dung)", thanh_vien: "Thành viên (chỉ thêm, tự xoá bài của mình)" };

  return (
    <div>
      <SectionHeader icon={Shield} eyebrow="Chỉ quản trị" title="Phân quyền thành viên" />

      <BackupSection />

      <div className="stamp-border p-4 mb-5" style={{ background: "#fff" }}>
        <p className="f-body text-xs mb-3" style={{ color: T.inkSoft }}>
          Mặc định, chỉ <b>Quản trị</b>, người có chức vụ <b>Trung đội trưởng</b> / <b>Trung đội phó</b> (lấy theo mục Quân số),
          hoặc người được gán quyền <b>Cán bộ</b> ở đây mới được thêm/xoá/sửa nội dung trên toàn trang.
          Người còn lại (Thành viên) chỉ được thêm nội dung mới và tự xoá nội dung do chính mình đăng.
          Nhập đúng họ tên mà người đó dùng để đăng nhập, rồi chọn vai trò — áp dụng ngay từ lần đăng nhập tiếp theo của họ.
        </p>
        <FormWarning message={warn} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <Field label="Họ và tên" required>
            <input list="roster-names" className={inputCls} style={inputStyle} value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="VD: Nguyễn Văn A" />
            <datalist id="roster-names">
              {roster.items.map((m) => <option key={m.id} value={m.name} />)}
            </datalist>
          </Field>
          <Field label="Vai trò">
            <select className={inputCls} style={inputStyle} value={roleInput} onChange={(e) => setRoleInput(e.target.value)}>
              <option value="can_bo">Cán bộ</option>
              <option value="thanh_vien">Thành viên</option>
            </select>
          </Field>
          <div><Btn onClick={grant}>Gán quyền</Btn></div>
        </div>
      </div>

      {permLoading ? <LoadingRow /> : permissions.length === 0 ? (
        <EmptyState text="Chưa gán quyền cho ai — mọi người hiện đều là Thành viên mặc định." />
      ) : (
        <div className="overflow-x-auto stamp-border" style={{ background: "#fff" }}>
          <table className="w-full text-sm f-body table-lines">
            <thead>
              <tr className="f-mono text-[11px] uppercase tracking-wider" style={{ background: T.green, color: T.paper }}>
                <th className="text-left px-3 py-2">Họ tên</th><th className="text-left px-3 py-2">Vai trò</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((p, i) => (
                <tr key={p.id} onClick={() => toggleSelect(p.id)} className="cursor-pointer" style={withSelect({ background: i % 2 ? T.paper : "#fff" }, selectedId === p.id)}>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2">{roleLabel[p.role] || p.role}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => revoke(p.id)} title="Gỡ quyền (về Thành viên mặc định)"><Trash2 size={14} style={{ color: T.red }} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============ MAIN APP ============ */
const TABS = [
  { id: "home", label: "Thông báo", icon: Shield },
  { id: "roster", label: "Quân số", icon: Users },
  { id: "study", label: "Lịch học", icon: CalendarDays },
  { id: "duty", label: "Lịch trực", icon: MapPin },
  { id: "restLeave", label: "Lịch nghỉ", icon: CalendarDays },
  { id: "outing", label: "Đăng ký ra ngoài", icon: DoorOpen },
  { id: "attendance", label: "Điểm danh", icon: ClipboardCheck },
  { id: "docs", label: "Tài liệu", icon: FolderOpen },
  { id: "scores", label: "Điểm rèn luyện", icon: Award },
  { id: "fund", label: "Quỹ trung đội", icon: Wallet },
  { id: "poll", label: "Lấy ý kiến", icon: ClipboardCheck },
  { id: "board", label: "Phòng trò chuyện chung Trung đội", icon: MessageSquare },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [tab, setTab] = useState("home");
  const [navOpen, setNavOpen] = useState(false);
  // Tên + SĐT chủ nhiệm trung đội, hiện dưới tên trung đội ở thanh đầu trang — chỉ huy nhập/sửa được.
  const { value: advisorInfo, setValue: setAdvisorInfo } = useSingleDoc("advisorInfo", { name: "", phone: "" });
  const [editingAdvisor, setEditingAdvisor] = useState(false);
  const [advisorForm, setAdvisorForm] = useState({ name: "", phone: "" });

  const { perm, permissions, setPermissions, permLoading } = useRole(user, isAdminLogin);

  // Dữ liệu của các phụ lục (trừ Quân số) — dùng để đếm "số thông báo mới" trên thanh điều hướng, kiểu như Zalo.
  const announcementsList = useSharedList("announcements");
  const scheduleList = useSharedList("schedule"); // dùng chung cho cả Lịch học/thi và Lịch trực ban
  const studyAppendixList = useSharedList("studyAppendix");
  const checkpointsList = useSharedList("checkpoints");
  const outingsList = useSharedList("outings");
  const attendanceList = useSharedList("attendance");
  const docsList = useSharedList("docs");
  const scoresList = useSharedList("scores");
  const fundList = useSharedList("fund");
  const pollsList = useSharedList("polls");
  const postsList = useSharedList("posts");
  const seenState = useSeenState(user);

  const unreadCounts = {
    home: countNewSince(announcementsList.items, seenState.seen.home),
    study: countNewSince(studyAppendixList.items, seenState.seen.study),
    duty:
      countNewSince(scheduleList.items.filter((s) => s.type === "Trực ban"), seenState.seen.duty) +
      countNewSince(checkpointsList.items, seenState.seen.duty),
    outing: countNewSince(outingsList.items, seenState.seen.outing),
    attendance: countNewSince(attendanceList.items, seenState.seen.attendance),
    docs: countNewSince(docsList.items, seenState.seen.docs),
    scores: countNewSince(scoresList.items, seenState.seen.scores),
    fund: countNewSince(fundList.items, seenState.seen.fund),
    poll: countNewSince(pollsList.items, seenState.seen.poll),
    board: countNewSince(postsList.items, seenState.seen.board),
  };

  const goToTab = (tabId) => {
    setTab(tabId);
    setNavOpen(false);
    if (unreadCounts[tabId] > 0) seenState.markSeen(tabId);
  };

  if (!user) return <LoginGate onLogin={(name, admin) => { setUser(name); setIsAdminLogin(!!admin); }} />;

  const roleBadge = { admin: "Quản trị", can_bo: "Cán bộ", thanh_vien: "Thành viên" };

  // Chỉ Quản trị / Cán bộ / Trung đội trưởng-phó (perm.canManage) được sửa tên + SĐT chủ nhiệm trung đội.
  const canEditAdvisor = perm.canManage;
  const startEditAdvisor = () => {
    setAdvisorForm({ name: advisorInfo.name || "", phone: advisorInfo.phone || "" });
    setEditingAdvisor(true);
  };
  const cancelEditAdvisor = () => setEditingAdvisor(false);
  const saveAdvisor = async () => {
    await setAdvisorInfo({ name: advisorForm.name.trim(), phone: advisorForm.phone.trim() });
    setEditingAdvisor(false);
  };

  const renderTab = () => {
    switch (tab) {
      case "home": return <AnnouncementsTab user={user} perm={perm} />;
      case "roster": return <RosterTab perm={perm} user={user} />;
      case "study": return <StudyScheduleTab user={user} perm={perm} />;
      case "restLeave": return <WeekendOffTab user={user} perm={perm} />;
      case "duty": return <DutyScheduleTab user={user} perm={perm} />;
      case "outing": return <OutingTab user={user} perm={perm} />;
      case "attendance": return <AttendanceTab user={user} perm={perm} />;
      case "docs": return <DocsTab user={user} perm={perm} />;
      case "scores": return <ScoresTab perm={perm} />;
      case "fund": return <FundTab user={user} perm={perm} />;
      case "poll": return <PollTab user={user} perm={perm} />;
      case "board": return <BoardTab user={user} perm={perm} />;
      case "commandChat": return <CommandChatTab user={user} perm={perm} />;
      case "permissions": return <PermissionsTab permissions={permissions} setPermissions={setPermissions} permLoading={permLoading} />;
      case "password": return <PasswordTab user={user} perm={perm} />;
      default: return null;
    }
  };

  const visibleTabs = [
    ...TABS,
    ...(perm.canAccessCommandChat ? [{ id: "commandChat", label: "Phòng trò chuyện chỉ huy", icon: Lock }] : []),
    ...(perm.isAdmin || perm.isCommandRole ? [{ id: "password", label: "Đổi mật khẩu", icon: KeyRound }] : []),
    ...(perm.isAdmin ? [{ id: "permissions", label: "Phân quyền", icon: Shield }] : []),
  ];
  const roleIcon = { admin: Star, can_bo: Shield, thanh_vien: Users };
  const RoleIcon = roleIcon[perm.role] || Users;

  return (
    <div className="min-h-screen paper-tex f-body" style={{ color: T.ink }}>
      <style>{FONT_STYLE}</style>
      <ErrorBanner />

      {/* Letterhead */}
      <header
        className="flex items-center justify-between px-4 md:px-6 py-3 relative z-30"
        style={{ background: `linear-gradient(180deg, ${T.green}, ${T.greenDark})`, borderBottom: `2px solid ${T.gold}` }}
      >
        <div className="flex items-center gap-3">
          <button className="md:hidden p-1.5 -ml-1" onClick={() => setNavOpen(true)} style={{ color: T.paper }} aria-label="Mở menu">
            <Menu size={22} />
          </button>
          <Emblem size={38} ring />
          <div>
            <div className="f-mono text-[9.5px] tracking-[0.2em] uppercase" style={{ color: T.amber }}>Đại học Cảnh sát nhân dân</div>
            <div className="f-display text-sm md:text-base font-semibold tracking-wide" style={{ color: T.paper }}>TRUNG ĐỘI B2 CSGT LT31</div>
            {editingAdvisor ? (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <input
                  className="f-body text-[10.5px] px-1.5 py-0.5 rounded-sm w-28 input-plain"
                  style={{ background: "rgba(255,255,255,0.92)", color: T.ink, border: "none" }}
                  placeholder="Tên chủ nhiệm"
                  value={advisorForm.name}
                  onChange={(e) => setAdvisorForm({ ...advisorForm, name: e.target.value })}
                />
                <input
                  className="f-mono text-[10.5px] px-1.5 py-0.5 rounded-sm w-24 input-plain"
                  style={{ background: "rgba(255,255,255,0.92)", color: T.ink, border: "none" }}
                  placeholder="Số điện thoại"
                  value={advisorForm.phone}
                  onChange={(e) => setAdvisorForm({ ...advisorForm, phone: e.target.value })}
                />
                <button onClick={saveAdvisor} title="Lưu"><CheckCircle2 size={15} style={{ color: T.amber }} /></button>
                <button onClick={cancelEditAdvisor} title="Huỷ"><X size={15} style={{ color: T.paper }} /></button>
              </div>
            ) : (
              (advisorInfo.name || advisorInfo.phone || canEditAdvisor) && (
                <div className="f-mono text-[10px] mt-0.5" style={{ color: "rgba(237,230,214,0.75)" }}>
                  {advisorInfo.name || advisorInfo.phone ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>CHỦ NHIỆM TĐ: {advisorInfo.name || "—"}</span>
                      {canEditAdvisor && (
                        <button onClick={startEditAdvisor} title="Sửa thông tin chủ nhiệm trung đội">
                          <Pencil size={10} style={{ color: T.amber }} />
                        </button>
                      )}
                      <span className="basis-full">SỐ ĐT: {advisorInfo.phone || "—"}</span>
                    </div>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="italic">Chưa có thông tin chủ nhiệm trung đội</span>
                      {canEditAdvisor && (
                        <button onClick={startEditAdvisor} title="Sửa thông tin chủ nhiệm trung đội">
                          <Pencil size={10} style={{ color: T.amber }} />
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <span className="f-body text-sm hidden sm:flex items-center gap-2" style={{ color: T.paper }}>
            Xin chào, <b>{user}</b>
            <span
              className="f-display text-[10px] uppercase tracking-wider pl-1.5 pr-2.5 py-1 inline-flex items-center gap-1 rounded-full"
              style={{ background: T.amber, color: T.greenDark }}
            >
              <RoleIcon size={11} /> {perm.isCommandRole && perm.title ? perm.title : roleBadge[perm.role]}
            </span>
          </span>
          <button
            onClick={() => { setUser(null); setIsAdminLogin(false); }}
            className="f-display text-xs uppercase flex items-center gap-1.5 px-3 py-1.5 btn-press rounded-sm"
            style={{ color: T.paper, border: `1px solid ${T.amber}` }}
          >
            <LogOut size={14} /> <span className="hidden sm:inline">Thoát</span>
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Lớp phủ mờ khi mở menu trên di động */}
        {navOpen && (
          <div
            className="fixed inset-0 z-40 md:hidden drawer-backdrop"
            style={{ background: "rgba(19,31,25,0.55)" }}
            onClick={() => setNavOpen(false)}
          />
        )}

        {/* Sidebar nav — trượt ra trên di động, dính cố định theo chiều cao màn hình trên desktop
             để luôn thấy hết toàn bộ danh mục + logo tên lớp ở dưới cùng, không cần cuộn cả trang */}
        <nav
          className={`fixed md:sticky md:top-0 inset-y-0 left-0 z-50 md:z-auto w-64 md:w-56 shrink-0 flex flex-col transform transition-transform duration-300 md:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{ background: T.green, height: "100vh" }}
        >
          <div className="flex items-center justify-between px-5 py-3 md:hidden" style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
            <span className="f-display text-xs uppercase tracking-widest" style={{ color: T.amber }}>Danh mục</span>
            <button onClick={() => setNavOpen(false)} style={{ color: T.paper }} aria-label="Đóng menu">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin py-0.5">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              const count = unreadCounts[t.id] || 0;
              return (
                <button
                  key={t.id}
                  onClick={() => goToTab(t.id)}
                  className={`nav-item w-full flex items-center gap-2.5 px-4 py-2 f-display text-[12.5px] uppercase tracking-wide text-left ${active ? "nav-item-active" : ""}`}
                  style={{
                    background: active ? T.amber : "transparent",
                    color: active ? T.greenDark : T.paper,
                    borderLeft: active ? `4px solid ${T.gold}` : "4px solid transparent",
                  }}
                >
                  <span
                    className="icon-badge icon-badge-sm"
                    style={{ background: active ? "rgba(19,31,25,0.12)" : "rgba(255,255,255,0.08)" }}
                  >
                    <Icon size={12} />
                  </span>
                  <span className="flex-1 leading-tight">{t.label}</span>
                  {count > 0 && (
                    <span
                      className="f-mono shrink-0 inline-flex items-center justify-center rounded-full"
                      style={{ background: T.red, color: "#fff", minWidth: 17, height: 17, fontSize: 9.5, fontWeight: 700, padding: "0 5px" }}
                      title={`${count} mục mới chưa xem`}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            className="flex items-center gap-2.5 px-5 py-3 shrink-0"
            style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}
          >
            <Emblem size={24} />
            <span className="f-mono text-[9.5px] uppercase tracking-widest" style={{ color: "rgba(237,230,214,0.6)" }}>
              LT31 · B2 · CSGT
            </span>
          </div>
        </nav>

        {/* Content — bọc trong khung "tờ giấy" nổi khối */}
        <main className="flex-1 min-w-0 p-4 md:p-8">
          <div
            className="max-w-6xl mx-auto p-5 md:p-9 card-sheet"
            style={{ background: T.paper, border: `1px solid ${T.paperDark}`, borderTop: `3px solid ${T.gold}` }}
          >
            {renderTab()}
          </div>
        </main>
      </div>

      <footer className="text-center f-mono text-[11px] py-4 space-y-1" style={{ color: T.inkSoft }}>
        <div>Trung đội B2 CSGT LT31 — Đại học Cảnh sát nhân dân</div>
        <div className="uppercase tracking-widest">
          Quản trị hệ thống: <span style={{ color: T.green, fontWeight: 600 }}>ĐẶNG TUẤN THANH</span>
        </div>
      </footer>
    </div>
  );
}
