import React, { useState, useEffect, useCallback, useId } from "react";
import { Shield, Users, CalendarDays, FolderOpen, Award, Wallet, MessageSquare, LogOut, Pin, Plus, Trash2, Star, ChevronRight, Loader2, X, DoorOpen, ClipboardCheck, CheckCircle2, Circle, Paperclip, MapPin, Image as ImageIcon, Menu, Heart, KeyRound, Pencil, Search } from "lucide-react";
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
};

const UNIT_PASSWORD_DEFAULT = "LT31B2"; // Mật khẩu chung mặc định — có thể đổi ngay trên web ở mục "Đổi mật khẩu"
const ADMIN_PASSWORD_DEFAULT = "LT31ADMIN"; // Mật khẩu quản trị mặc định — có thể đổi ngay trên web ở mục "Đổi mật khẩu"

/* ============ PHÂN QUYỀN ============
   admin      : đăng nhập bằng ADMIN_PASSWORD — toàn quyền, kể cả gán quyền cho người khác
   can_bo     : được quản trị gán — toàn quyền xoá/sửa nội dung, trừ việc gán quyền
   thanh_vien : mặc định — chỉ được thêm nội dung và xoá nội dung do chính mình đăng
*/
const normalizeName = (n) => (n || "").trim().toLowerCase();

// Kiểm tra một cái tên có phải Trung đội trưởng / Trung đội phó theo danh sách quân số hay không.
// Dùng chung cho việc phân quyền (useRole) và việc xác thực mật khẩu riêng khi đăng nhập (LoginGate).
function isCommandRoleForName(name, rosterItems) {
  const rosterMatch = (rosterItems || []).find((m) => normalizeName(m.name) === normalizeName(name));
  return Boolean(rosterMatch && (rosterMatch.role === "Trung đội trưởng" || rosterMatch.role === "Trung đội phó"));
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
.nav-item:hover:not(.nav-item-active) { background: rgba(255,255,255,0.06) !important; }
.icon-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 999px; flex-shrink: 0;
}
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

function useRole(user, isAdminLogin) {
  const { items: permissions, setItems: setPermissions, loading: permLoading } = useSharedList("permissions");
  const { items: rosterItems, loading: rosterLoading } = useSharedList("roster");

  const explicit = permissions.find((p) => normalizeName(p.name) === normalizeName(user));
  const rosterMatch = rosterItems.find((m) => normalizeName(m.name) === normalizeName(user));
  const isCommandRole = isCommandRoleForName(user, rosterItems);

  let role = "thanh_vien";
  if (isAdminLogin) role = "admin";
  else if (explicit) role = explicit.role;
  else if (isCommandRole) role = "can_bo";

  const perm = {
    name: user,
    role,
    isAdmin: role === "admin",
    canManage: role === "admin" || role === "can_bo",
    isCommandRole,
    title: rosterMatch?.role || null,
    isOwner: (ownerName) => normalizeName(ownerName) === normalizeName(user),
  };
  return { perm, permissions, setPermissions, permLoading: permLoading || rosterLoading };
}

/* ============ SMALL UI HELPERS ============ */
function SectionHeader({ icon: Icon, eyebrow, title, action }) {
  return (
    <div className="flex items-center justify-between mb-5 pb-4 flex-wrap gap-3" style={{ borderBottom: `1px solid ${T.paperDark}` }}>
      <div>
        <div className="f-mono text-xs tracking-widest uppercase" style={{ color: T.amberDark }}>{eyebrow}</div>
        <h2 className="f-display text-2xl md:text-3xl font-semibold flex items-center gap-2.5 mt-0.5" style={{ color: T.green }}>
          <Icon size={22} /> {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function Btn({ children, onClick, variant = "solid", type = "button", disabled }) {
  const base = "f-display text-sm tracking-wide uppercase px-4 py-2 flex items-center gap-2 disabled:opacity-50 btn-press";
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
  const [form, setForm] = useState({ title: "", body: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const todaySchedule = schedule.items.filter((s) => s.date === today);
  const chuaVe = outings.items.filter((o) => o.ngay === today && o.trangThai === "Chưa về");

  const add = async () => {
    if (!form.title.trim()) { setWarn("Vui lòng nhập Tiêu đề trước khi lưu."); return; }
    setWarn("");
    const entry = { id: Date.now(), title: form.title, body: form.body, author: user, date: new Date().toISOString(), pinned: false };
    await setItems([entry, ...items]);
    setForm({ title: "", body: "" });
    setShowForm(false);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const togglePin = async (id) => setItems(items.map((i) => (i.id === id ? { ...i, pinned: !i.pinned } : i)));
  const toggleReaction = async (id) => setItems(items.map((a) => {
    if (a.id !== id) return a;
    const reactions = a.reactions || [];
    const mine = reactions.includes(user);
    return { ...a, reactions: mine ? reactions.filter((n) => n !== user) : [...reactions, user] };
  }));
  const canDelete = (a) => perm.canManage || perm.isOwner(a.author);

  const sorted = [...items].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.date) - new Date(a.date)));

  return (
    <div>
      <SectionHeader icon={Shield} eyebrow="Trang chủ" title="Thông báo trung đội"
        action={perm.canManage && <Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Đăng thông báo</Btn>} />

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
          <Btn onClick={add}>Đăng</Btn>
        </div>
      )}

      {loading ? <LoadingRow /> : sorted.length === 0 ? <EmptyState text="Chưa có thông báo nào." /> : (
        <div className="space-y-3">
          {sorted.map((a) => (
            <div key={a.id} className="p-4" style={{ background: "#fff", borderLeft: `4px solid ${a.pinned ? T.amber : T.green}` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {a.pinned && <Pin size={14} style={{ color: T.amberDark }} />}
                    <h3 className="f-display font-semibold" style={{ color: T.green }}>{a.title}</h3>
                  </div>
                  <p className="f-body text-sm mt-1 whitespace-pre-wrap" style={{ color: T.ink }}>{a.body}</p>
                  <div className="f-mono text-[11px] mt-2" style={{ color: T.inkSoft }}>{a.author} · {new Date(a.date).toLocaleString("vi-VN")}</div>
                  <ReactionBar reactions={a.reactions} user={user} onToggle={() => toggleReaction(a.id)} />
                </div>
                <div className="flex gap-2 shrink-0">
                  {perm.canManage && <button onClick={() => togglePin(a.id)} title="Ghim"><Star size={16} style={{ color: a.pinned ? T.amberDark : "#C9BFA5" }} /></button>}
                  {canDelete(a) && <button onClick={() => remove(a.id)} title="Xoá"><Trash2 size={16} style={{ color: T.red }} /></button>}
                </div>
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

const ROSTER_ROLE_OPTIONS = [
  "Trung đội trưởng", "Trung đội phó",
  "Tiểu đội trưởng", "Tiểu đội phó",
  "Bí thư chi bộ", "Phó bí thư chi bộ",
  "Chi uỷ viên chi bộ", "Thư ký chi bộ",
  "Bí thư chi đoàn", "Phó bí thư chi đoàn",
  "Uỷ viên chi đoàn", "Cán bộ",
];

/* ============ TAB: QUÂN SỐ ============
   - Thêm/Xoá thành viên: Quản trị, Trung đội trưởng/phó, Cán bộ được gán quyền (perm.canManage).
   - Sửa thông tin từng người:
       + Quản trị, Trung đội trưởng, Trung đội phó: sửa được TOÀN BỘ thông tin của bất kỳ ai.
       + Thành viên khác: chỉ sửa được thông tin của CHÍNH MÌNH (khi có sai sót cần điều chỉnh),
         và không được đổi Chức vụ / Tiểu đội của bản thân (những mục này do chỉ huy quyết định).
*/
function RosterTab({ perm, user }) {
  const { items, setItems, loading } = useSharedList("roster");
  const [form, setForm] = useState({ stt: "", msv: "", name: "", role: "Cán bộ", tieuDoi: "1", phone: "", dob: "" });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [warn, setWarn] = useState("");
  const [editWarn, setEditWarn] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  const add = async () => {
    if (!form.name.trim()) { setWarn("Vui lòng nhập Họ và tên trước khi lưu."); return; }
    setWarn("");
    await setItems([...items, { id: Date.now(), ...form }]);
    setForm({ stt: "", msv: "", name: "", role: "Cán bộ", tieuDoi: "1", phone: "", dob: "" });
    setShowForm(false);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));

  // Quyền sửa toàn bộ thông tin của mọi người trong trung đội
  const canEditAll = perm.isAdmin || perm.isCommandRole;
  // Sửa được dòng của chính mình (dù không phải chỉ huy)
  const canEditRow = (m) => canEditAll || perm.isOwner(m.name);

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditForm({ stt: m.stt || "", msv: m.msv || "", name: m.name || "", role: m.role || "Cán bộ", tieuDoi: m.tieuDoi || "1", phone: m.phone || "", dob: m.dob || "" });
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

  return (
    <div>
      <SectionHeader icon={Users} eyebrow={`Quân số: ${items.length}`} title="Danh sách trung đội"
        action={perm.canManage && <Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Thêm thành viên</Btn>} />

      <div className="flex justify-end mb-3 -mt-2">
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
        <div className="mb-4 relative">
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

      {perm.canManage && showForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={warn} /></div>
          <Field label="Số thứ tự (STT)"><input type="number" className={inputCls} style={inputStyle} value={form.stt} onChange={(e) => setForm({ ...form, stt: e.target.value })} placeholder="VD: 1" /></Field>
          <Field label="Mã số học viên"><input className={inputCls} style={inputStyle} value={form.msv} onChange={(e) => setForm({ ...form, msv: e.target.value })} /></Field>
          <Field label="Họ và tên" required><input className={inputCls} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Chức vụ">
            <select className={inputCls} style={inputStyle} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROSTER_ROLE_OPTIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Tiểu đội">
            <select className={inputCls} style={inputStyle} value={form.tieuDoi} onChange={(e) => setForm({ ...form, tieuDoi: e.target.value })}>
              <option value="1">Tiểu đội 1</option><option value="2">Tiểu đội 2</option>
              <option value="3">Tiểu đội 3</option><option value="4">Tiểu đội 4</option>
            </select>
          </Field>
          <Field label="Số điện thoại"><input className={inputCls} style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Ngày tháng năm sinh"><input type="date" className={inputCls} style={inputStyle} value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
          <div className="md:col-span-2"><Btn onClick={add}>Lưu</Btn></div>
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
            <select className={inputCls} style={inputStyle} value={editForm.role} disabled={!canEditAll} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
              {ROSTER_ROLE_OPTIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
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
        <EmptyState text="Không tìm thấy quân nhân nào khớp với từ khoá tìm kiếm." />
      ) : (
        <div className="overflow-x-auto stamp-border" style={{ background: "#fff" }}>
          <table className="w-full text-sm f-body">
            <thead>
              <tr className="f-mono text-[11px] uppercase tracking-wider" style={{ background: T.green, color: T.paper }}>
                <th className="text-left px-3 py-2">STT</th>
                <th className="text-left px-3 py-2">Mã số</th><th className="text-left px-3 py-2">Họ tên</th>
                <th className="text-left px-3 py-2">Chức vụ</th><th className="text-left px-3 py-2">Tiểu đội</th>
                <th className="text-left px-3 py-2">Ngày sinh</th>
                <th className="text-left px-3 py-2">SĐT</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 ? T.paper : "#fff" }}>
                  <td className="px-3 py-2 f-mono">{m.stt || "—"}</td>
                  <td className="px-3 py-2 f-mono">{m.msv || "—"}</td>
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  <td className="px-3 py-2">{m.role}</td>
                  <td className="px-3 py-2 f-mono">{m.tieuDoi ? `TĐ${m.tieuDoi}` : "—"}</td>
                  <td className="px-3 py-2 f-mono">{formatDob(m.dob)}</td>
                  <td className="px-3 py-2 f-mono">{m.phone || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2.5">
                      {canEditRow(m) && (
                        <button onClick={() => startEdit(m)} title="Sửa thông tin">
                          <Pencil size={14} style={{ color: T.green }} />
                        </button>
                      )}
                      {perm.canManage && (
                        <button onClick={() => remove(m.id)} title="Xoá">
                          <Trash2 size={14} style={{ color: T.red }} />
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
    </div>
  );
}

/* ============ TAB: LỊCH HỌC ============ */
function StudyScheduleTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("schedule");
  const [form, setForm] = useState({ date: "", type: "Học", title: "", note: "", url: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");
  const typeColor = { "Học": T.green, "Thi": T.amberDark };
  const isImage = (u) => /\.(png|jpe?g|gif|webp)$/i.test(u || "");

  const add = async () => {
    if (!form.title.trim() || !form.date) { setWarn("Vui lòng nhập đủ Ngày và Tiêu đề trước khi lưu."); return; }
    setWarn("");
    await setItems([...items, { id: Date.now(), ...form, by: user }]);
    setForm({ date: "", type: "Học", title: "", note: "", url: "" });
    setShowForm(false);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const sorted = items.filter((i) => i.type === "Học" || i.type === "Thi").sort((a, b) => new Date(a.date) - new Date(b.date));

  // ---- Phụ lục lịch tuần (ảnh/file có khoảng ngày) ----
  const appendix = useSharedList("studyAppendix");
  const [aForm, setAForm] = useState({ title: "", type: "Lịch học", from: "", to: "", url: "", note: "" });
  const [showAForm, setShowAForm] = useState(false);
  const [aWarn, setAWarn] = useState("");

  const addAppendix = async () => {
    if (!aForm.title.trim() || !aForm.from || !aForm.to) { setAWarn("Vui lòng nhập đủ Tên phụ lục, Áp dụng từ ngày và Đến ngày trước khi lưu."); return; }
    setAWarn("");
    await appendix.setItems([{ id: Date.now(), ...aForm, by: user }, ...appendix.items]);
    setAForm({ title: "", type: "Lịch học", from: "", to: "", url: "", note: "" });
    setShowAForm(false);
  };
  const removeAppendix = async (id) => appendix.setItems(appendix.items.filter((i) => i.id !== id));
  const sortedAppendix = [...appendix.items].sort((a, b) => new Date(b.from) - new Date(a.from));

  return (
    <div>
      <SectionHeader icon={CalendarDays} eyebrow="Lịch" title="Lịch học & lịch thi"
        action={perm.canManage && <Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Thêm mục lịch</Btn>} />

      {perm.canManage && showForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={warn} /></div>
          <Field label="Ngày" required><input type="date" className={inputCls} style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Loại">
            <select className={inputCls} style={inputStyle} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Học</option><option>Thi</option>
            </select>
          </Field>
          <Field label="Tiêu đề" required><input className={inputCls} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Ghi chú"><input className={inputCls} style={inputStyle} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <div className="md:col-span-2">
            <Field label="Link ảnh lịch học / lịch thi / file đính kèm (Google Drive, ảnh chụp TKB…)">
              <input className={inputCls} style={inputStyle} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
              <UploadField onUploaded={(url) => setForm((f) => ({ ...f, url }))} />
            </Field>
          </div>
          <div className="md:col-span-2"><Btn onClick={add}>Lưu</Btn></div>
        </div>
      )}

      {loading ? <LoadingRow /> : sorted.length === 0 ? <EmptyState text="Chưa có lịch học/thi nào." /> : (
        <div className="space-y-2 mb-8">
          {sorted.map((s) => (
            <div key={s.id} className="flex items-start gap-4 p-3 flex-wrap" style={{ background: "#fff", borderLeft: `4px solid ${typeColor[s.type] || T.green}` }}>
              <div className="f-mono text-xs w-24 shrink-0 pt-0.5" style={{ color: T.inkSoft }}>{new Date(s.date).toLocaleDateString("vi-VN")}</div>
              <span className="f-display text-[10px] uppercase tracking-wider px-2 py-0.5 shrink-0" style={{ background: typeColor[s.type] || T.green, color: "#fff" }}>{s.type}</span>
              <div className="flex-1 min-w-[140px]">
                <div className="f-body font-medium text-sm" style={{ color: T.ink }}>{s.title}</div>
                {s.note && <div className="f-body text-xs" style={{ color: T.inkSoft }}>{s.note}</div>}
                {s.url && (
                  isImage(s.url) ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="block mt-2">
                      <img src={s.url} alt={s.title} className="max-w-[200px] max-h-40 stamp-border" />
                    </a>
                  ) : (
                    <a href={s.url} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all mt-1 inline-flex items-center gap-1" style={{ color: T.green }}>
                      <Paperclip size={12} /> Xem file đính kèm
                    </a>
                  )
                )}
              </div>
              {perm.canManage && <button onClick={() => remove(s.id)}><Trash2 size={14} style={{ color: T.red }} /></button>}
            </div>
          ))}
        </div>
      )}

      {/* ---- Phụ lục lịch tuần ---- */}
      <SectionHeader icon={ImageIcon} eyebrow="Phụ lục" title="Phụ lục lịch học / lịch thi theo tuần"
        action={perm.canManage && <Btn onClick={() => setShowAForm((s) => !s)}><Plus size={16} /> Thêm phụ lục</Btn>} />

      {perm.canManage && showAForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={aWarn} /></div>
          <div className="md:col-span-2"><Field label="Tên phụ lục" required><input className={inputCls} style={inputStyle} value={aForm.title} onChange={(e) => setAForm({ ...aForm, title: e.target.value })} placeholder="VD: Lịch học tuần 3 tháng 7" /></Field></div>
          <Field label="Loại">
            <select className={inputCls} style={inputStyle} value={aForm.type} onChange={(e) => setAForm({ ...aForm, type: e.target.value })}>
              <option>Lịch học</option><option>Lịch thi</option>
            </select>
          </Field>
          <div />
          <Field label="Áp dụng từ ngày" required><input type="date" className={inputCls} style={inputStyle} value={aForm.from} onChange={(e) => setAForm({ ...aForm, from: e.target.value })} /></Field>
          <Field label="Đến ngày" required><input type="date" className={inputCls} style={inputStyle} value={aForm.to} onChange={(e) => setAForm({ ...aForm, to: e.target.value })} /></Field>
          <div className="md:col-span-2">
            <Field label="Link ảnh hoặc file lịch tuần (chụp bảng lịch, Google Drive…)">
              <input className={inputCls} style={inputStyle} value={aForm.url} onChange={(e) => setAForm({ ...aForm, url: e.target.value })} placeholder="https://…" />
              <UploadField onUploaded={(url) => setAForm((f) => ({ ...f, url }))} />
            </Field>
          </div>
          <div className="md:col-span-2"><Field label="Ghi chú"><input className={inputCls} style={inputStyle} value={aForm.note} onChange={(e) => setAForm({ ...aForm, note: e.target.value })} /></Field></div>
          <div className="md:col-span-2"><Btn onClick={addAppendix}>Lưu phụ lục</Btn></div>
        </div>
      )}

      {appendix.loading ? <LoadingRow /> : sortedAppendix.length === 0 ? <EmptyState text="Chưa có phụ lục lịch tuần nào." /> : (
        <div className="space-y-3">
          {sortedAppendix.map((a) => (
            <div key={a.id} className="p-4" style={{ background: "#fff", borderLeft: `4px solid ${a.type === "Lịch thi" ? T.amberDark : T.green}` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="f-display text-[10px] uppercase tracking-wider px-2 py-0.5" style={{ background: a.type === "Lịch thi" ? T.amberDark : T.green, color: "#fff" }}>{a.type}</span>
                    <h3 className="f-display font-semibold text-sm" style={{ color: T.green }}>{a.title}</h3>
                  </div>
                  <div className="f-mono text-[11px] mt-1" style={{ color: T.inkSoft }}>
                    Áp dụng {new Date(a.from).toLocaleDateString("vi-VN")} → {new Date(a.to).toLocaleDateString("vi-VN")}
                  </div>
                  {a.note && <div className="f-body text-xs mt-1" style={{ color: T.inkSoft }}>{a.note}</div>}
                  {a.url && (
                    isImage(a.url) ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className="block mt-2">
                        <img src={a.url} alt={a.title} className="max-w-full sm:max-w-xs max-h-64 stamp-border" />
                      </a>
                    ) : (
                      <a href={a.url} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all mt-2 inline-flex items-center gap-1" style={{ color: T.green }}>
                        <Paperclip size={12} /> Xem file phụ lục
                      </a>
                    )
                  )}
                </div>
                {perm.canManage && <button onClick={() => removeAppendix(a.id)}><Trash2 size={14} style={{ color: T.red }} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ TAB: LỊCH TRỰC (+ PHÂN CÔNG TRỰC CHỐT) ============ */
function DutyScheduleTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("schedule");
  const [form, setForm] = useState({ date: "", type: "Trực ban", title: "", note: "", url: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");
  const isImage = (u) => /\.(png|jpe?g|gif|webp)$/i.test(u || "");

  const add = async () => {
    if (!form.title.trim() || !form.date) { setWarn("Vui lòng nhập đủ Ngày và Tiêu đề trước khi lưu."); return; }
    setWarn("");
    await setItems([...items, { id: Date.now(), ...form, type: "Trực ban", by: user }]);
    setForm({ date: "", type: "Trực ban", title: "", note: "", url: "" });
    setShowForm(false);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const sorted = items.filter((i) => i.type === "Trực ban").sort((a, b) => new Date(a.date) - new Date(b.date));

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
  const sortedCheckpoints = [...checkpoint.items].sort((a, b) => new Date(a.ngay) - new Date(b.ngay));

  return (
    <div>
      <SectionHeader icon={CalendarDays} eyebrow="Lịch" title="Lịch trực ban"
        action={perm.canManage && <Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Thêm lịch trực</Btn>} />

      {perm.canManage && showForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={warn} /></div>
          <Field label="Ngày" required><input type="date" className={inputCls} style={inputStyle} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Tiêu đề" required><input className={inputCls} style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Ghi chú"><input className={inputCls} style={inputStyle} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <Field label="Link ảnh/file đính kèm">
            <input className={inputCls} style={inputStyle} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
            <UploadField onUploaded={(url) => setForm((f) => ({ ...f, url }))} />
          </Field>
          <div className="md:col-span-2"><Btn onClick={add}>Lưu</Btn></div>
        </div>
      )}

      {loading ? <LoadingRow /> : sorted.length === 0 ? <EmptyState text="Chưa có lịch trực nào." /> : (
        <div className="space-y-2 mb-8">
          {sorted.map((s) => (
            <div key={s.id} className="flex items-start gap-4 p-3 flex-wrap" style={{ background: "#fff", borderLeft: `4px solid ${T.red}` }}>
              <div className="f-mono text-xs w-24 shrink-0 pt-0.5" style={{ color: T.inkSoft }}>{new Date(s.date).toLocaleDateString("vi-VN")}</div>
              <div className="flex-1 min-w-[140px]">
                <div className="f-body font-medium text-sm" style={{ color: T.ink }}>{s.title}</div>
                {s.note && <div className="f-body text-xs" style={{ color: T.inkSoft }}>{s.note}</div>}
                {s.url && (
                  isImage(s.url) ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="block mt-2">
                      <img src={s.url} alt={s.title} className="max-w-[200px] max-h-40 stamp-border" />
                    </a>
                  ) : (
                    <a href={s.url} target="_blank" rel="noreferrer" className="f-mono text-xs underline break-all mt-1 inline-flex items-center gap-1" style={{ color: T.green }}>
                      <Paperclip size={12} /> Xem file đính kèm
                    </a>
                  )
                )}
              </div>
              {perm.canManage && <button onClick={() => remove(s.id)}><Trash2 size={14} style={{ color: T.red }} /></button>}
            </div>
          ))}
        </div>
      )}

      {/* ---- Phân công trực chốt ---- */}
      <SectionHeader icon={MapPin} eyebrow="Phân công" title="Trực chốt theo tiểu đội"
        action={perm.canManage && <Btn onClick={() => setShowCForm((s) => !s)}><Plus size={16} /> Phân công chốt</Btn>} />

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
        <div className="overflow-x-auto stamp-border" style={{ background: "#fff" }}>
          <table className="w-full text-sm f-body">
            <thead>
              <tr className="f-mono text-[11px] uppercase tracking-wider" style={{ background: T.green, color: T.paper }}>
                <th className="text-left px-3 py-2">Ngày</th><th className="text-left px-3 py-2">Chốt</th>
                <th className="text-left px-3 py-2">Tiểu đội</th><th className="text-left px-3 py-2">Ca trực</th>
                <th className="text-left px-3 py-2">Ghi chú</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sortedCheckpoints.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 ? T.paper : "#fff" }}>
                  <td className="px-3 py-2 f-mono">{new Date(c.ngay).toLocaleDateString("vi-VN")}</td>
                  <td className="px-3 py-2 font-medium">{c.chotLabel}</td>
                  <td className="px-3 py-2 f-mono">TĐ{c.tieuDoi}</td>
                  <td className="px-3 py-2 f-mono">{c.ca || "—"}</td>
                  <td className="px-3 py-2" style={{ color: T.inkSoft }}>{c.ghiChu || "—"}</td>
                  <td className="px-3 py-2 text-right">{perm.canManage && <button onClick={() => removeCheckpoint(c.id)}><Trash2 size={14} style={{ color: T.red }} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============ TAB: ĐĂNG KÝ RA NGOÀI ============ */
function OutingTab({ user, perm }) {
  const { items, setItems, loading } = useSharedList("outings");
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ name: "", namSinh: "", tieuDoi: "1", lyDo: "", ngay: today, gioDi: "", gioVeDuKien: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");

  const add = async () => {
    if (!form.name.trim() || !form.lyDo.trim()) { setWarn("Vui lòng nhập đủ Họ và tên và Lý do ra ngoài trước khi lưu."); return; }
    setWarn("");
    await setItems([{ id: Date.now(), ...form, dangKyBoi: user, trangThai: "Chưa về", gioVeThucTe: "" }, ...items]);
    setForm({ name: "", namSinh: "", tieuDoi: "1", lyDo: "", ngay: today, gioDi: "", gioVeDuKien: "" });
    setShowForm(false);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));
  const markBack = async (id) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    await setItems(items.map((i) => (i.id === id ? { ...i, trangThai: "Đã về", gioVeThucTe: `${hh}:${mm}` } : i)));
  };

  const todays = items.filter((i) => i.ngay === today);
  const others = items.filter((i) => i.ngay !== today);
  const chuaVe = todays.filter((i) => i.trangThai === "Chưa về").length;
  const canAct = (o) => perm.canManage || perm.isOwner(o.dangKyBoi);

  const Row = ({ o }) => (
    <div className="flex items-start justify-between gap-3 p-3" style={{ background: "#fff", borderLeft: `4px solid ${o.trangThai === "Đã về" ? T.green : T.red}` }}>
      <div>
        <div className="f-body text-sm font-medium" style={{ color: T.ink }}>{o.name} <span className="f-mono text-xs" style={{ color: T.inkSoft }}>· {o.namSinh || "—"} · TĐ{o.tieuDoi}</span></div>
        <div className="f-body text-xs mt-0.5" style={{ color: T.inkSoft }}>{o.lyDo}</div>
        <div className="f-mono text-[11px] mt-1" style={{ color: T.inkSoft }}>
          {new Date(o.ngay).toLocaleDateString("vi-VN")} · Ra lúc {o.gioDi || "—"} · Dự kiến về {o.gioVeDuKien || "—"}
          {o.trangThai === "Đã về" && <> · Đã về lúc {o.gioVeThucTe}</>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="f-display text-[10px] uppercase tracking-wider px-2 py-1" style={{ background: o.trangThai === "Đã về" ? T.green : T.red, color: "#fff" }}>{o.trangThai}</span>
        {o.trangThai !== "Đã về" && canAct(o) && (
          <button onClick={() => markBack(o.id)} title="Xác nhận đã về"><CheckCircle2 size={18} style={{ color: T.green }} /></button>
        )}
        {canAct(o) && <button onClick={() => remove(o.id)}><Trash2 size={14} style={{ color: T.red }} /></button>}
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader icon={DoorOpen} eyebrow={`Hôm nay: ${todays.length} lượt · ${chuaVe} chưa về`} title="Đăng ký ra ngoài"
        action={<Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Đăng ký</Btn>} />

      {showForm && (
        <div className="stamp-border p-4 mb-5 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ background: "#fff" }}>
          <div className="md:col-span-2"><FormWarning message={warn} /></div>
          <Field label="Họ và tên" required><input className={inputCls} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
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
          <div className="md:col-span-2"><Btn onClick={add}>Đăng ký</Btn></div>
        </div>
      )}

      {loading ? <LoadingRow /> : items.length === 0 ? <EmptyState text="Chưa có đăng ký ra ngoài nào." /> : (
        <div>
          <div className="f-display text-sm uppercase tracking-wider mb-2" style={{ color: T.amberDark }}>Hôm nay</div>
          {todays.length === 0 ? <EmptyState text="Chưa có ai đăng ký ra ngoài hôm nay." /> : (
            <div className="space-y-2 mb-6">{todays.map((o) => <Row key={o.id} o={o} />)}</div>
          )}
          {others.length > 0 && (
            <>
              <div className="f-display text-sm uppercase tracking-wider mb-2" style={{ color: T.amberDark }}>Các ngày khác</div>
              <div className="space-y-2">{others.map((o) => <Row key={o.id} o={o} />)}</div>
            </>
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
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const STATUSES = ["Có mặt", "Vắng", "Phép", "Không phép", "Ốm"];
  const statusColor = { "Có mặt": T.green, "Vắng": "#8A8F76", "Phép": T.amberDark, "Không phép": T.red, "Ốm": "#7A5C9E" };

  // Chỉ Quản trị, Trung đội trưởng, Trung đội phó được điểm danh dùm cả trung đội.
  // Tài khoản thành viên khác chỉ thấy và điểm danh được đúng mục của chính mình.
  const canMarkAll = perm.isAdmin || perm.isCommandRole;
  const markableRoster = canMarkAll ? roster.items : roster.items.filter((m) => perm.isOwner(m.name));

  const recordFor = (memberId) => items.find((r) => r.date === date && r.memberId === memberId);

  const setStatus = async (member, status) => {
    const existing = recordFor(member.id);
    if (existing) {
      await setItems(items.map((r) => (r.id === existing.id ? { ...r, status, by: user } : r)));
    } else {
      await setItems([...items, { id: Date.now() + Math.random(), date, memberId: member.id, name: member.name, status, by: user }]);
    }
  };

  const dayRecords = items.filter((r) => r.date === date);
  const total = roster.items.length;
  const coMat = dayRecords.filter((r) => r.status === "Có mặt").length;
  const summary = STATUSES.map((s) => ({ status: s, count: dayRecords.filter((r) => r.status === s).length }));
  const chuaDiemDanh = Math.max(0, total - dayRecords.length);

  const stats = roster.items.map((m) => {
    const recs = items.filter((r) => r.memberId === m.id);
    const present = recs.filter((r) => r.status === "Có mặt").length;
    const pct = recs.length ? Math.round((present / recs.length) * 100) : null;
    return { ...m, pct, total: recs.length };
  });

  return (
    <div>
      <SectionHeader icon={ClipboardCheck} eyebrow={total ? `Có mặt: ${coMat}/${total}` : "Chưa có quân số"} title="Điểm danh hằng ngày"
        action={<input type="date" className={`${inputCls} !w-auto`} style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />} />

      {roster.items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-6">
          {summary.map((s) => (
            <div key={s.status} className="p-3 text-center" style={{ background: "#fff", borderTop: `3px solid ${statusColor[s.status]}` }}>
              <div className="f-display text-2xl font-semibold" style={{ color: statusColor[s.status] }}>{s.count}</div>
              <div className="f-mono text-[10px] uppercase tracking-wider mt-0.5" style={{ color: T.inkSoft }}>{s.status}</div>
            </div>
          ))}
          <div className="p-3 text-center" style={{ background: "#fff", borderTop: `3px solid #C9BFA5` }}>
            <div className="f-display text-2xl font-semibold" style={{ color: T.inkSoft }}>{chuaDiemDanh}</div>
            <div className="f-mono text-[10px] uppercase tracking-wider mt-0.5" style={{ color: T.inkSoft }}>Chưa điểm danh</div>
          </div>
        </div>
      )}

      {!canMarkAll && (
        <p className="f-body text-xs mb-3 italic" style={{ color: T.inkSoft }}>
          Bạn chỉ điểm danh được cho chính mình. Việc điểm danh dùm cả trung đội chỉ dành cho Quản trị, Trung đội trưởng, Trung đội phó.
        </p>
      )}

      {roster.loading || loading ? <LoadingRow /> : roster.items.length === 0 ? (
        <EmptyState text="Chưa có dữ liệu quân số — vào mục Quân số để thêm thành viên trước." />
      ) : markableRoster.length === 0 ? (
        <EmptyState text="Không tìm thấy tên của bạn trong danh sách quân số — liên hệ chỉ huy để được thêm vào Quân số." />
      ) : (
        <div className="space-y-2 mb-8">
          {markableRoster.map((m) => {
            const rec = recordFor(m.id);
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 p-3 flex-wrap" style={{ background: "#fff" }}>
                <div className="f-body text-sm font-medium" style={{ color: T.ink }}>{m.name} <span className="f-mono text-xs" style={{ color: T.inkSoft }}>· TĐ{m.tieuDoi || "—"}</span></div>
                <div className="flex gap-1.5 flex-wrap">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(m, s)}
                      className="f-display text-[11px] uppercase tracking-wider px-2.5 py-1 flex items-center gap-1"
                      style={{
                        background: rec?.status === s ? statusColor[s] : "transparent",
                        color: rec?.status === s ? "#fff" : statusColor[s],
                        border: `1px solid ${statusColor[s]}`,
                      }}
                    >
                      {rec?.status === s ? <CheckCircle2 size={12} /> : <Circle size={12} />} {s}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {roster.items.length > 0 && (
        <>
          <div className="f-display text-sm uppercase tracking-wider mb-2" style={{ color: T.amberDark }}>Tỷ lệ chuyên cần (tổng)</div>
          <div className="overflow-x-auto stamp-border" style={{ background: "#fff" }}>
            <table className="w-full text-sm f-body">
              <thead>
                <tr className="f-mono text-[11px] uppercase tracking-wider" style={{ background: T.green, color: T.paper }}>
                  <th className="text-left px-3 py-2">Họ tên</th><th className="text-left px-3 py-2">Số lần điểm danh</th><th className="text-left px-3 py-2">% có mặt</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((m, i) => (
                  <tr key={m.id} style={{ background: i % 2 ? T.paper : "#fff" }}>
                    <td className="px-3 py-2 font-medium">{m.name}</td>
                    <td className="px-3 py-2 f-mono">{m.total}</td>
                    <td className="px-3 py-2 f-mono font-semibold" style={{ color: m.pct === null ? T.inkSoft : m.pct >= 90 ? T.green : m.pct >= 70 ? T.amberDark : T.red }}>
                      {m.pct === null ? "—" : `${m.pct}%`}
                    </td>
                  </tr>
                ))}
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
                  <div key={d.id} className="flex items-center justify-between p-3" style={{ background: "#fff" }}>
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
          <table className="w-full text-sm f-body">
            <thead>
              <tr className="f-mono text-[11px] uppercase tracking-wider" style={{ background: T.green, color: T.paper }}>
                <th className="text-left px-3 py-2">Họ tên</th><th className="text-left px-3 py-2">Hạng mục</th>
                <th className="text-left px-3 py-2">Điểm</th><th className="text-left px-3 py-2">Ghi chú</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s, i) => (
                <tr key={s.id} style={{ background: i % 2 ? T.paper : "#fff" }}>
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
  const [form, setForm] = useState({ type: "Thu", amount: "", desc: "" });
  const [showForm, setShowForm] = useState(false);
  const [warn, setWarn] = useState("");

  const add = async () => {
    if (!form.amount || !form.desc.trim()) { setWarn("Vui lòng nhập đủ Số tiền và Nội dung trước khi lưu."); return; }
    setWarn("");
    await setItems([{ id: Date.now(), ...form, by: user, date: new Date().toISOString() }, ...items]);
    setForm({ type: "Thu", amount: "", desc: "" });
    setShowForm(false);
  };
  const remove = async (id) => setItems(items.filter((i) => i.id !== id));

  const total = items.reduce((sum, f) => sum + (f.type === "Thu" ? 1 : -1) * Number(f.amount || 0), 0);
  const fmt = (n) => n.toLocaleString("vi-VN") + " đ";

  return (
    <div>
      <SectionHeader icon={Wallet} eyebrow="Tài chính" title="Quỹ trung đội"
        action={perm.canManage && <Btn onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Ghi thu/chi</Btn>} />

      <div className="stamp-border p-4 mb-5 flex items-center justify-between" style={{ background: "#fff" }}>
        <span className="f-body text-sm" style={{ color: T.inkSoft }}>Số dư hiện tại</span>
        <span className="f-display text-2xl font-semibold" style={{ color: total >= 0 ? T.green : T.red }}>{fmt(total)}</span>
      </div>

      {perm.canManage && showForm && (
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
            <div key={f.id} className="flex items-center justify-between p-3" style={{ background: "#fff", borderLeft: `4px solid ${f.type === "Thu" ? T.green : T.red}` }}>
              <div>
                <div className="f-body text-sm font-medium" style={{ color: T.ink }}>{f.desc}</div>
                <div className="f-mono text-[11px]" style={{ color: T.inkSoft }}>{f.by} · {new Date(f.date).toLocaleDateString("vi-VN")}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="f-mono font-semibold" style={{ color: f.type === "Thu" ? T.green : T.red }}>{f.type === "Thu" ? "+" : "−"}{fmt(Number(f.amount))}</span>
                {perm.canManage && <button onClick={() => remove(f.id)}><Trash2 size={14} style={{ color: T.red }} /></button>}
              </div>
            </div>
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
              <div key={poll.id} className="p-4" style={{ background: "#fff", borderLeft: `4px solid ${poll.closed ? T.inkSoft : T.green}` }}>
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
  const [replyOpen, setReplyOpen] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [warn, setWarn] = useState("");
  const [replyWarn, setReplyWarn] = useState("");

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

  return (
    <div>
      <SectionHeader icon={MessageSquare} eyebrow="Trao đổi" title="Bảng tin trung đội" />

      <div className="stamp-border p-4 mb-5" style={{ background: "#fff" }}>
        <FormWarning message={warn} />
        <textarea rows={2} className={inputCls} style={inputStyle} placeholder="Viết gì đó cho cả trung đội…" value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="mt-2"><Btn onClick={post}>Đăng</Btn></div>
      </div>

      {loading ? <LoadingRow /> : items.length === 0 ? <EmptyState text="Chưa có bài đăng nào." /> : (
        <div className="space-y-3">
          {items.map((p) => (
            <div key={p.id} className="p-4" style={{ background: "#fff" }}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="f-display font-semibold text-sm" style={{ color: T.green }}>{p.author}</div>
                  <p className="f-body text-sm mt-1" style={{ color: T.ink }}>{p.content}</p>
                  <div className="f-mono text-[11px] mt-1" style={{ color: T.inkSoft }}>{new Date(p.date).toLocaleString("vi-VN")}</div>
                </div>
                {(perm.canManage || perm.isOwner(p.author)) && <button onClick={() => remove(p.id)}><Trash2 size={14} style={{ color: T.red }} /></button>}
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
  "announcements", "schedule", "studyAppendix", "checkpoints",
  "outings", "attendance", "docs", "scores",
  "fund", "posts", "polls", "roster", "permissions", "authConfig",
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
            <input className={inputCls} style={inputStyle} value={unitPw} onChange={(e) => setUnitPw(e.target.value)} />
          </Field>
          <Field label="Mật khẩu quản trị (đăng nhập được toàn quyền)" required>
            <input className={inputCls} style={inputStyle} value={adminPw} onChange={(e) => setAdminPw(e.target.value)} />
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
            <input className={inputCls} style={inputStyle} value={ownPw} onChange={(e) => setOwnPw(e.target.value)} />
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
          <table className="w-full text-sm f-body">
            <thead>
              <tr className="f-mono text-[11px] uppercase tracking-wider" style={{ background: T.green, color: T.paper }}>
                <th className="text-left px-3 py-2">Họ tên</th><th className="text-left px-3 py-2">Vai trò</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((p, i) => (
                <tr key={p.id} style={{ background: i % 2 ? T.paper : "#fff" }}>
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
  { id: "outing", label: "Ra ngoài", icon: DoorOpen },
  { id: "attendance", label: "Điểm danh", icon: ClipboardCheck },
  { id: "docs", label: "Tài liệu", icon: FolderOpen },
  { id: "scores", label: "Điểm rèn luyện", icon: Award },
  { id: "fund", label: "Quỹ trung đội", icon: Wallet },
  { id: "poll", label: "Lấy ý kiến", icon: ClipboardCheck },
  { id: "board", label: "Bảng tin", icon: MessageSquare },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [tab, setTab] = useState("home");
  const [navOpen, setNavOpen] = useState(false);

  const { perm, permissions, setPermissions, permLoading } = useRole(user, isAdminLogin);

  if (!user) return <LoginGate onLogin={(name, admin) => { setUser(name); setIsAdminLogin(!!admin); }} />;

  const roleBadge = { admin: "Quản trị", can_bo: "Cán bộ", thanh_vien: "Thành viên" };

  const renderTab = () => {
    switch (tab) {
      case "home": return <AnnouncementsTab user={user} perm={perm} />;
      case "roster": return <RosterTab perm={perm} user={user} />;
      case "study": return <StudyScheduleTab user={user} perm={perm} />;
      case "duty": return <DutyScheduleTab user={user} perm={perm} />;
      case "outing": return <OutingTab user={user} perm={perm} />;
      case "attendance": return <AttendanceTab user={user} perm={perm} />;
      case "docs": return <DocsTab user={user} perm={perm} />;
      case "scores": return <ScoresTab perm={perm} />;
      case "fund": return <FundTab user={user} perm={perm} />;
      case "poll": return <PollTab user={user} perm={perm} />;
      case "board": return <BoardTab user={user} perm={perm} />;
      case "permissions": return <PermissionsTab permissions={permissions} setPermissions={setPermissions} permLoading={permLoading} />;
      case "password": return <PasswordTab user={user} perm={perm} />;
      default: return null;
    }
  };

  const visibleTabs = [
    ...TABS,
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

        {/* Sidebar nav — trượt ra trên di động, cố định trên desktop */}
        <nav
          className={`fixed md:static inset-y-0 left-0 z-50 md:z-auto w-64 md:w-56 shrink-0 flex flex-col transform transition-transform duration-300 md:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{ background: T.green, minHeight: "100vh" }}
        >
          <div className="flex items-center justify-between px-5 py-3.5 md:hidden" style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
            <span className="f-display text-xs uppercase tracking-widest" style={{ color: T.amber }}>Danh mục</span>
            <button onClick={() => setNavOpen(false)} style={{ color: T.paper }} aria-label="Đóng menu">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setNavOpen(false); }}
                  className={`nav-item w-full flex items-center gap-3 px-5 py-3 f-display text-sm uppercase tracking-wide text-left ${active ? "nav-item-active" : ""}`}
                  style={{
                    background: active ? T.amber : "transparent",
                    color: active ? T.greenDark : T.paper,
                    borderLeft: active ? `4px solid ${T.gold}` : "4px solid transparent",
                  }}
                >
                  <span
                    className="icon-badge"
                    style={{ background: active ? "rgba(19,31,25,0.12)" : "rgba(255,255,255,0.08)" }}
                  >
                    <Icon size={14} />
                  </span>
                  {t.label}
                </button>
              );
            })}
          </div>

          <div
            className="flex items-center gap-2.5 px-5 py-4"
            style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}
          >
            <Emblem size={26} />
            <span className="f-mono text-[9.5px] uppercase tracking-widest" style={{ color: "rgba(237,230,214,0.6)" }}>
              LT31 · B2 · CSGT
            </span>
          </div>
        </nav>

        {/* Content — bọc trong khung "tờ giấy" nổi khối */}
        <main className="flex-1 min-w-0 p-4 md:p-8">
          <div
            className="max-w-4xl mx-auto p-5 md:p-9 card-sheet"
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
