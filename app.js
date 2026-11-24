// Theo dõi thi công bê tông – GitHub Pages + Firebase (đăng nhập Google, phân quyền theo hạng mục)
import { FIREBASE_CONFIG, OWNERS } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import * as fs from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = fs.getFirestore(app);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nf = (v, d = 3) => (v == null || isNaN(v)) ? "" : Number(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const iso = (t) => { t = new Date(t); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); };
const today = () => iso(Date.now());
const addD = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fd = (s) => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
const fds = (s) => s ? `${+s.slice(8, 10)}/${+s.slice(5, 7)}` : "";
const HE = { MONG: "Móng", DAM: "Dầm", COT: "Cột – vách", SAN: "Sàn" };
const tangName = (t) => !t ? "" : t === "BT LOT" ? "BT lót" : t === "Co cot" ? "Cổ cột" : String(t).replace(/^Tang/, "Tầng");
const planLabel = (p) => (HE[p.he] || p.he || "Mặt bằng") + (p.tang ? " – " + tangName(p.tang) : "");
const LN = { Mong: "Móng", Cot: "Cột", Vach: "Vách", Dam: "Dầm", San: "Sàn", "Lot mong": "BT lót móng", "Lot dam": "BT lót dầm", "Lot san": "BT lót sàn" };
const LORD = ["Lot mong", "Mong", "Lot dam", "Dam", "Cot", "Vach", "Lot san", "San"];
const TORD = (t) => t === "BT LOT" ? 0 : t === "Co cot" ? 1 : t === "" ? 0.5 : 2 + (parseFloat(String(t).replace(/\D+/g, "")) || 0);
const rowKey = (it) => it.loai.startsWith("Lot") ? it.loai + "|" : it.loai + "|" + it.tang;
const rowLabel = (k) => { const [l, t] = k.split("|"); return (LN[l] || l) + (t ? " – " + tangName(t) : ""); };
const rowSort = (a, b) => { const [la, ta] = a.split("|"), [lb, tb] = b.split("|"); return (LORD.indexOf(la) - LORD.indexOf(lb)) || (TORD(ta) - TORD(tb)); };
const rootOf = (id) => String(id).split(".")[0];
const vkOf = (it) => (it.vkt || 0) + (it.vkd || 0);
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40) || "hm";
const CHUNK = 400000;
const ROLE = { viewer: "Chỉ xem", editor: "Cập nhật", admin: "Quản trị" };
const LV = { viewer: 1, editor: 2, admin: 3 };


// ===================== Đăng nhập & quyền =====================
let ME = "", isOwner = false, MYG = {};          // MYG: {hmId | "_all": role}
let HMS = [], DATES = {}, HMCFG = {}, CFG = { ten: "Tên công trình", dia: "Địa điểm" };
// DATES[hm] = { b: {id: ngày BT}, v: {id: ngày VK}, c: {id: ngày CT} }
// HMCFG[hm] = { mode: "A" (VK, CT theo BT) | "B" (ngày riêng), k: {lot, bt, vk, ct} hệ số giá }
const KL = {}, GEO = {}, subs = { grants: null, hmAll: null, hm: {}, ngay: {}, hcfg: {}, cfg: null };
const lvAll = () => isOwner ? 3 : (LV[MYG._all] || 0);
const lvHM = (id) => isOwner ? 3 : Math.max(LV[MYG[id]] || 0, LV[MYG._all] || 0);
const canEdit = () => HM && lvHM(HM.id) >= 2;
const isAnyAdmin = () => isOwner || lvAll() >= 3 || Object.values(MYG).includes("admin");
const cfgOf = (hm) => { const c = HMCFG[hm] || {}; const k = c.k || {}; return { mode: c.mode === "B" ? "B" : "A", k: { lot: num1(k.lot), bt: num1(k.bt), vk: num1(k.vk), ct: num1(k.ct) } }; };
function num1(v) { v = +v; return isFinite(v) && v > 0 ? v : 1; }

$("gBtn").onclick = async () => { $("loginErr").textContent = ""; try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { $("loginErr").textContent = "Không đăng nhập được: " + (e.code || e.message); } };
$("outBtn").onclick = () => signOut(auth);
onAuthStateChanged(auth, (u) => {
  stopAll();
  if (!u) { $("login").hidden = false; $("loginMsg").textContent = "Đăng nhập bằng tài khoản Google (Gmail) đã được cấp quyền."; return; }
  ME = (u.email || "").toLowerCase(); isOwner = OWNERS.map((x) => x.toLowerCase()).includes(ME);
  $("login").hidden = true; $("meName").textContent = u.displayName || ME;
  start();
});
function stopAll() {
  const off = (f) => { try { f && f(); } catch (e) {} };
  off(subs.grants); off(subs.hmAll); off(subs.cfg); [subs.hm, subs.ngay, subs.hcfg].forEach((m) => Object.values(m).forEach(off));
  subs.grants = subs.hmAll = subs.cfg = null; subs.hm = {}; subs.ngay = {}; subs.hcfg = {};
  MYG = {}; HMS = []; DATES = {}; HMCFG = {}; HM = null;
}
function start() {
  subs.cfg = fs.onSnapshot(fs.doc(db, "cfg", "du-an"), (d) => { if (d.exists()) CFG = { ...CFG, ...d.data() }; renderTitle(); }, () => {});
  subs.grants = fs.onSnapshot(fs.query(fs.collection(db, "grants"), fs.where("email", "==", ME)), (s) => {
    MYG = {}; s.docs.forEach((d) => { const g = d.data(); MYG[g.hm] = g.role; });
    afterGrants();
  }, (e) => { setNote("Lỗi đọc quyền: " + e.code); if (isOwner) afterGrants(); });
}
function afterGrants() {
  const all = lvAll();
  $("meRole").textContent = isOwner ? "Chủ dự án" : all ? ROLE[MYG._all] + " (tất cả)" : Object.keys(MYG).length ? "Theo hạng mục" : "Chưa có quyền";
  $("usersBtn").hidden = !isAnyAdmin(); $("impBtn").hidden = !isAnyAdmin();
  $("restBtn").hidden = !(isOwner || all >= 2 || Object.values(MYG).some((r) => LV[r] >= 2));
  if (!isOwner && !Object.keys(MYG).length) { $("login").hidden = false; $("loginMsg").innerHTML = `Email <b>${esc(ME)}</b> chưa được cấp quyền xem dự án. Gửi email này cho quản trị viên để được thêm vào.`; return; }
  $("login").hidden = true;
  if (all >= 1) {
    if (!subs.hmAll) subs.hmAll = fs.onSnapshot(fs.collection(db, "hm"), (s) => { HMS = s.docs.map((d) => ({ id: d.id, ...d.data() })); sortHM(); syncNgay(); onHM(); }, (e) => setNote("Lỗi tải hạng mục: " + e.code));
  } else {
    if (subs.hmAll) { subs.hmAll(); subs.hmAll = null; }
    const want = Object.keys(MYG).filter((k) => k !== "_all");
    Object.keys(subs.hm).forEach((k) => { if (!want.includes(k)) { subs.hm[k](); delete subs.hm[k]; HMS = HMS.filter((h) => h.id !== k); } });
    want.forEach((k) => { if (!subs.hm[k]) subs.hm[k] = fs.onSnapshot(fs.doc(db, "hm", k), (d) => {
      HMS = HMS.filter((h) => h.id !== k); if (d.exists()) HMS.push({ id: k, ...d.data() }); sortHM(); syncNgay(); onHM(); }, () => {}); });
    if (!want.length) { HMS = []; onHM(); }
  }
  renderTitle(); refreshAll();
}
function sortHM() { HMS.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(b.name)); }
function syncNgay() {
  const ids = HMS.map((h) => h.id);
  Object.keys(subs.ngay).forEach((k) => { if (!ids.includes(k)) { subs.ngay[k](); delete subs.ngay[k]; delete DATES[k]; } });
  Object.keys(subs.hcfg).forEach((k) => { if (!ids.includes(k)) { subs.hcfg[k](); delete subs.hcfg[k]; delete HMCFG[k]; } });
  const clean = (o) => { const r = {}; Object.keys(o || {}).forEach((x) => { if (o[x]) r[x] = o[x]; }); return r; };
  ids.forEach((k) => {
    if (!subs.ngay[k]) subs.ngay[k] = fs.onSnapshot(fs.doc(db, "ngay", k), (d) => {
      const x = d.exists() ? d.data() : {}; DATES[k] = { b: clean(x.d), v: clean(x.dv), c: clean(x.dc) }; refreshAll(); }, () => {});
    if (!subs.hcfg[k]) subs.hcfg[k] = fs.onSnapshot(fs.doc(db, "hmcfg", k), (d) => { HMCFG[k] = d.exists() ? d.data() : {}; refreshAll(); renderModeUI(); }, () => {});
  });
}
let noteT = null;
function setNote(t) { $("note").textContent = t || ""; clearTimeout(noteT); if (t && !/…$/.test(t)) noteT = setTimeout(() => ($("note").textContent = ""), 7000); }

// ===================== Đọc / ghi dữ liệu =====================
async function loadChunks(meta, kind) {
  const s = await fs.getDocs(fs.collection(db, "hm", meta.id, kind));
  const docs = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.v === meta.v).sort((a, b) => a.id < b.id ? -1 : 1);
  if (docs.length !== meta[kind + "N"]) throw new Error("dữ liệu hạng mục đang được cập nhật, thử lại sau ít giây");
  return JSON.parse(docs.map((d) => d.s).join(""));
}
async function getKL(meta) {
  if (!KL[meta.id] || KL[meta.id].v !== meta.v) {
    const items = await loadChunks(meta, "kl"), by = {};
    items.forEach((it) => (by[it.id] = it));
    KL[meta.id] = { v: meta.v, items, by };
  }
  return KL[meta.id].items;
}
async function getGEO(meta) { if (!GEO[meta.id] || GEO[meta.id].v !== meta.v) GEO[meta.id] = { v: meta.v, g: await loadChunks(meta, "geo") }; return GEO[meta.id].g; }
const pad = (i) => "c" + String(i).padStart(3, "0");
async function saveHM(meta, items, geo, old) {
  const v = Date.now().toString(36), parts = { kl: JSON.stringify(items), geo: JSON.stringify(geo) };
  meta.v = v;
  for (const kind of ["kl", "geo"]) {
    const str = parts[kind], n = Math.max(1, Math.ceil(str.length / CHUNK));
    for (let i = 0; i < n; i++) { setNote(`Đang lưu ${kind === "kl" ? "khối lượng" : "mặt bằng"} ${i + 1}/${n}…`); await fs.setDoc(fs.doc(db, "hm", meta.id, kind, pad(i)), { v, s: str.slice(i * CHUNK, (i + 1) * CHUNK) }); }
    meta[kind + "N"] = n;
    for (let i = n; i < ((old && old[kind + "N"]) || 0); i++) await fs.deleteDoc(fs.doc(db, "hm", meta.id, kind, pad(i)));
  }
  await fs.setDoc(fs.doc(db, "hm", meta.id), meta); setNote("");
}
async function delHM(meta) {
  for (const kind of ["kl", "geo"]) for (let i = 0; i < (meta[kind + "N"] || 0); i++) await fs.deleteDoc(fs.doc(db, "hm", meta.id, kind, pad(i)));
  await fs.deleteDoc(fs.doc(db, "ngay", meta.id)).catch(() => {});
  await fs.deleteDoc(fs.doc(db, "hmcfg", meta.id)).catch(() => {});
  await fs.deleteDoc(fs.doc(db, "hm", meta.id));
}
const FIELD = { b: "d", v: "dv", c: "dc" };
// patch: {id: ngày | null}; kind: b | v | c
async function setDates(hmId, patch, kind = "b") {
  const cur = DATES[hmId] || (DATES[hmId] = { b: {}, v: {}, c: {} }), loc = { ...(cur[kind] || {}) };
  Object.entries(patch).forEach(([k, v]) => v ? (loc[k] = v) : delete loc[k]); cur[kind] = loc; refreshAll();
  const d = {}; Object.entries(patch).forEach(([k, v]) => (d[k] = v || fs.deleteField()));
  try { await fs.setDoc(fs.doc(db, "ngay", hmId), { [FIELD[kind]]: d, at: new Date().toISOString(), by: ME }, { merge: true }); }
  catch (e) { setNote("Không lưu được ngày: " + (e.code === "permission-denied" ? "bạn không có quyền cập nhật hạng mục này" : e.code || e.message)); }
}
async function saveCfg(o) { try { await fs.setDoc(fs.doc(db, "cfg", "du-an"), { ...CFG, ...o }); } catch (e) { setNote("Không lưu được: " + e.code); } }

// ===================== Ngày, giá trị của một cấu kiện =====================
// ngày của công tác k (b/v/c) cho cấu kiện id trong hạng mục hm (chế độ A: VK, CT theo BT)
// ngày hiệu lực của công tác k (b / v / c / vc) – VK, CT: ngày riêng nếu có (chế độ B), không thì theo ngày đổ BT
function dateK(hm, id, k) {
  const D = DATES[hm] || {}, r = keyOf(hm, id), bt = (D.b || {})[r] || null;
  if (k === "b") return bt;
  if (k === "vc") { const v = dateK(hm, id, "v"), c = dateK(hm, id, "c"); return v && c ? (v > c ? v : c) : null; }
  if (cfgOf(hm).mode === "A") return bt;
  const own = (D[k] || {})[r] || null;            // ngày riêng: giữ nếu sớm hơn ngày đổ BT (đã báo ở kỳ trước thì ở lại kỳ đó)
  return own && bt ? (own < bt ? own : bt) : (own || bt);
}
const ownDate = (hm, id, k) => ((DATES[hm] || {})[k] || {})[keyOf(hm, id)] || null;
// khóa lưu ngày: UID cố định (cột Y của DANH_SACH) nếu có, không thì ID cấu kiện gốc
const ukey = (it) => it && it.uid ? "u" + it.uid : null;
function keyOf(hm, id) { const r = rootOf(id), it = ((KL[hm] || {}).by || {})[r]; return ukey(it) || r; }
function priceOf(hm, it) {   // đơn giá (đã nhân hệ số) theo cấu kiện gốc
  const by = (KL[hm] || {}).by || {}, p = by[rootOf(it.id)] || it, k = cfgOf(hm).k, lot = String(it.loai).startsWith("Lot");
  return { b: lot ? (p.gl || 0) * k.lot : (p.gb || 0) * k.bt, v: (p.gv || 0) * k.vk, c: (p.gc || 0) * k.ct };
}
const ctOf = (it) => it.ct || 0;

// ===================== Trạng thái giao diện =====================
let HM = null, ITEMS = [], BYID = {}, G = null, P = null, vb = null, view = "vMap", WORK = "tq";
try { WORK = localStorage.getItem("ttbt_work") || "tq"; } catch (e) {}
const sel = new Set(); let multi = false, boxMode = false, listN = 300;
const WN = { b: "Bê tông", v: "Ván khuôn", c: "Cốt thép", vc: "VK + CT", tq: "Tiến độ tổng hợp" };
const work = () => WORK;                                                   // chế độ tô màu đang xem
const wkind = () => (HM && cfgOf(HM.id).mode === "B" && WORK !== "tq") ? WORK : "b";   // công tác được ghi ngày
// Tiến độ tổng hợp (tính đến cuối kỳ): 0 chưa làm · 1 có VK · 2 có CT · 3 xong VK+CT · 4 đã đổ BT; d = ngày quyết định trạng thái
const STG = [["Chưa làm", "var(--none)"], ["Có ván khuôn", "#FFC000"], ["Có cốt thép", "#E03C31"], ["Xong VK + CT, chờ đổ BT", "#7030A0"], ["Đã đổ bê tông", "#00B050"]];
function stageOf(hm, id) {
  const { b } = per(), ok = (d) => d && d <= b ? d : null;
  const bt = ok(dateK(hm, id, "b")); if (bt) return { s: 4, d: bt };
  const v = ok(dateK(hm, id, "v")), c = ok(dateK(hm, id, "c"));
  if (v && c) return { s: 3, d: v > c ? v : c };
  if (v) return { s: 1, d: v }; if (c) return { s: 2, d: c };
  return { s: 0, d: null };
}
const dW = (id) => !HM ? null : work() === "tq" ? stageOf(HM.id, id).d : dateK(HM.id, id, work());
const per = () => ({ a: $("dFrom").value || "0000-01-01", b: $("dTo").value || "9999-12-31" });
function status(d) { const { a, b } = per(); if (!d || d > b) return 0; return d < a ? 1 : 2; }
const COL = ["var(--none)", "var(--done)", "var(--now)"];

function renderTitle() {
  document.title = view === "vRep" ? "Báo cáo – " + repTitle() : (HM ? HM.name + (P ? " · " + planLabel(P) : "") + " – " : "") + "Theo dõi thi công";
  $("proj").innerHTML = `<b>${esc(CFG.ten)}</b>${isOwner ? ' <button class="edit" id="editProj">Sửa</button>' : ""}`;
  $("proj").title = CFG.ten + " · " + CFG.dia;
  const b = $("editProj"); if (b) b.onclick = editProj;
}
function renderModeUI() {
  const B = HM && cfgOf(HM.id).mode === "B";
  $("workWrap").style.display = view !== "vRep" ? "" : "none";
  $("hmCfgBtn").hidden = !(HM && lvHM(HM.id) >= 1);
  if (HM) { const c = cfgOf(HM.id); $("hmCfgBtn").textContent = `Hệ số & chế độ (${c.mode === "B" ? "ngày riêng" : "theo BT"})`; }
}
$("workSel").value = WORK;
$("workSel").onchange = () => { WORK = $("workSel").value; try { localStorage.setItem("ttbt_work", WORK); } catch (e) {} refreshAll(); };
function onHM() {
  const cur = HM && HMS.find((h) => h.id === HM.id);
  $("hmSel").innerHTML = HMS.length ? HMS.map((h) => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join("") : `<option value="">(chưa có hạng mục)</option>`;
  if (!HMS.length) { HM = null; ITEMS = []; showEmpty(); renderTitle(); return; }
  let saved = null; try { saved = localStorage.getItem("ttbt_hm"); } catch (e) {}
  const want = cur || HMS.find((h) => h.id === saved) || HMS[0];
  $("hmSel").value = want.id;
  if (!HM || HM.id !== want.id || HM.v !== want.v) openHM(want.id); else { HM = want; renderTitle(); }
  renderRep();
}
$("hmSel").onchange = () => openHM($("hmSel").value);
async function openHM(id) {
  const meta = HMS.find((h) => h.id === id); if (!meta) return;
  HM = meta; sel.clear(); try { localStorage.setItem("ttbt_hm", id); } catch (e) {}
  renderModeUI();
  // danh sách hạng mục có thể được gửi lại (bộ nhớ đệm → máy chủ): chỉ bỏ dở khi người dùng đã chọn hạng mục / phiên bản khác
  const stale = () => !HM || HM.id !== meta.id || HM.v !== meta.v;
  const msg = (t) => { $("mapMsg").hidden = false; $("mapMsg").innerHTML = `<p class="empty">${t}</p>`; };
  msg(`Đang tải khối lượng ${esc(meta.name)}…`);
  try {
    ITEMS = await getKL(meta); if (stale()) return;
    BYID = KL[meta.id].by; ITEMS.forEach((it, i) => (it._i = i));
    msg(`Đang tải mặt bằng ${esc(meta.name)}…`);
    G = await getGEO(meta); if (stale()) return;
    $("mbSel").innerHTML = $("fsMb").innerHTML = G.plans.map((p) => `<option value="${esc(p.id)}">${esc(planLabel(p))}</option>`).join("");
    const firstDone = G.plans.find((p) => ITEMS.some((i) => i.mb === p.id && dW(i.id))) || G.plans[0];
    const keep = P && G.plans.find((p) => p.id === P.id);
    if (G.plans.length) showPlan((keep || firstDone).id); else { $("map").innerHTML = ""; msg("Hạng mục này không có mặt bằng – dùng tab Danh sách."); P = null; }
    initListFilters(); renderTitle(); refreshAll();
  } catch (e) { if (!stale()) msg(`Không tải được hạng mục: ${esc(e.message)} <button class="btn" id="retryHM">Thử lại</button>`); const rb = $("retryHM"); if (rb) rb.onclick = () => openHM(id); }
}
function showEmpty() {
  $("map").innerHTML = ""; $("mapMsg").hidden = false; P = null;
  $("mapMsg").innerHTML = lvAll() >= 3 ? `<div><h2 style="margin:0 0 6px">Chưa có hạng mục nào</h2><p class="empty">Nhập file Excel KL_DOT_*.xlsx (có sheet DANH_SACH, MB_…, _NEN; GAN_THEP nếu có thép & đơn giá) cho từng hạng mục.</p><p><button class="btn pri" id="e1">Nhập Excel</button></p></div>`
    : `<p class="empty">Chưa có hạng mục nào bạn được xem.</p>`;
  const e1 = $("e1"); if (e1) e1.onclick = () => $("impBtn").click();
  $("aside").innerHTML = ""; $("mbSel").innerHTML = "";
}
$("mbSel").onchange = () => showPlan($("mbSel").value);
// ===================== Mặt bằng =====================
function ring(a) { let s = ""; for (let i = 0; i < a.length; i += 2) s += (i ? "L" : "M") + a[i] + " " + (-a[i + 1]); return s + "Z"; }
function boxOf(k) { let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12; k.forEach((r) => { for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); } }); return { x0, y0, x1, y1 }; }
function showPlan(id) {
  P = G.plans.find((p) => p.id === id) || G.plans[0]; if (!P) return;
  $("mbSel").value = $("fsMb").value = P.id; $("mapMsg").hidden = true;
  [...sel].forEach((i) => { if ((BYID[i] || {}).mb !== P.id) sel.delete(i); });
  P._its = ITEMS.filter((i) => i.mb === P.id && G.shapes[i.id]);
  P._its.forEach((it) => (it._b = boxOf(G.shapes[it.id][0])));
  let B = P.box;
  if (!B) { const bs = P._its.map((i) => i._b); B = [Math.min(...bs.map((b) => b.x0)), Math.min(...bs.map((b) => b.y0)), Math.max(...bs.map((b) => b.x1)), Math.max(...bs.map((b) => b.y1))]; }
  P._B = { x: B[0], y: -B[3], w: B[2] - B[0], h: B[3] - B[1] };
  const L = P.L, Gd = P.G; let dl_ = "", dg = "", da = "";
  for (let i = 0; i < L.length; i += 4) dl_ += `M${L[i]} ${-L[i + 1]}L${L[i + 2]} ${-L[i + 3]}`;
  for (let i = 0; i < Gd.length; i += 5) { const s = `M${Gd[i]} ${-Gd[i + 1]}L${Gd[i + 2]} ${-Gd[i + 3]}`; if (Gd[i + 4]) da += s; else dg += s; }
  const txt = P.W.map((w) => `<text x="${w[0]}" y="${-w[1]}" font-size="${w[3]}" text-anchor="middle" dominant-baseline="middle"${w[2] ? ` transform="rotate(${-w[2]} ${w[0]} ${-w[1]})"` : ""}>${esc(w[4])}</text>`).join("");
  const ck = P._its.map((it) => { const sh = G.shapes[it.id]; return `<path class="ck" data-id="${esc(it.id)}" d="${sh[0].map(ring).join("") + (sh[1] || []).map(ring).join("")}"><title>${esc(it.ten)} ${esc(it.truc)}</title></path>`; }).join("");
  $("map").innerHTML = `<path class="gd" d="${dg}"/><path class="ax" d="${da}"/><path class="bg" d="${dl_}"/>${txt}<g id="cks">${ck}</g><g id="lbs"></g>`;
  renderTitle(); paint(); fit(); renderAside();
}
function paint() {
  if (!P || !$("cks")) return;
  const tq = work() === "tq", { a } = per();
  $("cks").querySelectorAll(".ck").forEach((el) => {
    const id = el.dataset.id;
    if (tq) { const g = stageOf(HM.id, id); el.style.fill = STG[g.s][1]; el.style.fillOpacity = g.s ? .85 : 1; el.classList.toggle("inp", !!(g.d && g.d >= a)); }
    else { const st = status(dW(id)); el.style.fill = COL[st]; el.style.fillOpacity = st ? .85 : 1; el.classList.remove("inp"); }
    el.classList.toggle("sel", sel.has(id));
  });
  labels();
}
function labels() {
  const m = $("lbl").value, g = $("lbs"); if (!g || !P) return; if (!m) { g.innerHTML = ""; return; }
  const W = P._B.w;
  g.innerHTML = P._its.map((it) => {
    const b = it._b, bw = b.x1 - b.x0, bh = b.y1 - b.y0, tall = bh > bw * 1.8, d = dW(it.id);
    const t = m === "ten" ? it.ten : m === "id" ? it.id : m === "truc" ? it.truc : (d && (work() === "tq" || status(d)) ? fds(d) : "");
    if (!t) return "";
    const fsz = Math.max(W / 450, Math.min(W / 110, (tall ? bw : bh) * .55, ((tall ? bh : bw) * 1.6) / String(t).length));
    const cx = (b.x0 + b.x1) / 2, cy = -(b.y0 + b.y1) / 2;
    return `<text class="lb" x="${cx}" y="${cy}" font-size="${fsz.toFixed(0)}" text-anchor="middle" dominant-baseline="middle"${tall ? ` transform="rotate(-90 ${cx} ${cy})"` : ""}>${esc(t)}</text>`;
  }).join("");
}
$("lbl").onchange = labels;

// ---------- Zoom / kéo / quét chọn ----------
const box = $("mapBox"), svg = $("map");
function setVB() { svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); }
function fit() {
  if (!P) return; const r = box.getBoundingClientRect(), B = P._B, padk = 1.04;
  if (!r.width || !r.height) { vb = { ...B }; setVB(); return; }
  const k = Math.max((B.w * padk) / r.width, (B.h * padk) / r.height);
  vb = { w: r.width * k, h: r.height * k }; vb.x = B.x + B.w / 2 - vb.w / 2; vb.y = B.y + B.h / 2 - vb.h / 2; setVB();
}
function zoomAt(f, cx, cy) {
  const r = box.getBoundingClientRect(), fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
  const px = vb.x + fx * vb.w, py = vb.y + fy * vb.h; vb.w *= f; vb.h *= f; vb.x = px - fx * vb.w; vb.y = py - fy * vb.h; setVB();
}
function toPt(cx, cy) { const m = svg.getScreenCTM(); const p = svg.createSVGPoint(); p.x = cx; p.y = cy; const q = p.matrixTransform(m.inverse()); return { x: q.x, y: q.y }; }
const pts = new Map(); let drag = null, pinch = null;
box.addEventListener("wheel", (e) => { if (!vb) return; e.preventDefault(); zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY); }, { passive: false });
box.addEventListener("pointerdown", (e) => {
  if (!vb || e.target.closest(".zoom, .fsbar")) return;
  box.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false, t: e.target, add: e.ctrlKey || e.shiftKey || e.metaKey };
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; hideBox(); }
});
box.addEventListener("pointermove", (e) => {
  if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt(pinch.d / d, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch.d = d; return; }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  if (boxMode) { if (drag.moved) drawBox(drag, e.clientX, e.clientY); return; }
  if (drag.moved) box.classList.add("drag");
  const r = box.getBoundingClientRect(); vb.x = drag.vx - (dx / r.width) * vb.w; vb.y = drag.vy - (dy / r.height) * vb.h; setVB();
});
const up = (e) => {
  pts.delete(e.pointerId); box.classList.remove("drag");
  if (drag && e.type === "pointerup") {
    if (boxMode && drag.moved) boxSelect(drag, e.clientX, e.clientY);
    else if (!drag.moved) { const el = drag.t.closest && drag.t.closest(".ck"); if (el) pick(el.dataset.id, drag.add); else if (!multi && !drag.add) { sel.clear(); refreshSel(); } }
  }
  hideBox(); if (pts.size < 2) pinch = null; drag = null;
};
box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
function drawBox(g, cx, cy) {
  let b = $("selbox"); if (!b) { b = document.createElementNS("http://www.w3.org/2000/svg", "rect"); b.id = "selbox"; svg.appendChild(b); }
  const a = toPt(g.x, g.y), c = toPt(cx, cy);
  b.setAttribute("x", Math.min(a.x, c.x)); b.setAttribute("y", Math.min(a.y, c.y)); b.setAttribute("width", Math.abs(c.x - a.x)); b.setAttribute("height", Math.abs(c.y - a.y));
  b.setAttribute("class", cx < g.x ? "cross" : "");
}
function hideBox() { const b = $("selbox"); if (b) b.remove(); }
function boxSelect(g, cx, cy) {
  const a = toPt(g.x, g.y), c = toPt(cx, cy), cross = cx < g.x;
  const X0 = Math.min(a.x, c.x), X1 = Math.max(a.x, c.x), Y0 = -Math.max(a.y, c.y), Y1 = -Math.min(a.y, c.y);
  P._its.forEach((it) => { const b = it._b; const ok = cross ? !(b.x1 < X0 || b.x0 > X1 || b.y1 < Y0 || b.y0 > Y1) : (b.x0 >= X0 && b.x1 <= X1 && b.y0 >= Y0 && b.y1 <= Y1); if (ok) sel.add(it.id); });
  refreshSel();
}
$("zin").onclick = () => { const r = box.getBoundingClientRect(); zoomAt(1 / 1.4, r.left + r.width / 2, r.top + r.height / 2); };
$("zout").onclick = () => { const r = box.getBoundingClientRect(); zoomAt(1.4, r.left + r.width / 2, r.top + r.height / 2); };
$("zfit").onclick = fit;
let lastW = 0; const ro = new ResizeObserver(() => { const w = box.clientWidth; if (P && w && Math.abs(w - lastW) > 2) { lastW = w; fit(); } }); ro.observe(box);
function pick(id, add) {
  if (multi || add) { sel.has(id) ? sel.delete(id) : sel.add(id); } else { const only = sel.size === 1 && sel.has(id); sel.clear(); if (!only) sel.add(id); }
  refreshSel();
}
$("multiBtn").onclick = () => { multi = !multi; $("multiBtn").classList.toggle("on", multi); $("fsMulti").classList.toggle("on", multi); };
$("boxBtn").onclick = () => { boxMode = !boxMode; $("boxBtn").classList.toggle("on", boxMode); $("fsBox").classList.toggle("on", boxMode); box.classList.toggle("boxm", boxMode); };
// ---------- Toàn màn hình: chỉ giữ bản vẽ + bảng bên phải ----------
function setFull(on) {
  if (on && view !== "vMap") tab("vMap");
  document.body.classList.toggle("full", on);
  try { if (on && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
  setTimeout(fit, 120);
}
$("zfull").onclick = () => setFull(!document.body.classList.contains("full"));
$("fsExit").onclick = () => setFull(false);
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("full")) { document.body.classList.remove("full"); setTimeout(fit, 120); } });
$("fsMb").onchange = () => showPlan($("fsMb").value);
$("fsMulti").onclick = () => $("multiBtn").click();
$("fsBox").onclick = () => $("boxBtn").click();
$("fsClr").onclick = () => $("clrBtn").click();
$("clrBtn").onclick = () => { sel.clear(); refreshSel(); };


// ===================== Khối lượng & ô nhập ngày =====================
const QTY = { b: (i) => i.v || 0, v: (i) => vkOf(i), c: (i) => ctOf(i) };
// các cột khối lượng hiện ở bảng bên phải theo chế độ màu
const QCOL = { b: [["b", "m³", 3]], v: [["v", "m²", 2]], c: [["c", "kg", 0]], vc: [["v", "m²", 2], ["c", "kg", 0]] };
const UNIT = { b: "m³", v: "m²", c: "kg" };
const money = (v) => nf(v, 0);
function withSubs(ids) { const set = new Set(ids); return ITEMS.filter((i) => set.has(rootOf(i.id))); }
function sum(list, hm = HM && HM.id) {
  const s = { n: 0, v: 0, vk: 0, ct: 0, gt: 0 };
  list.forEach((i) => { if (!String(i.id).includes(".")) s.n++; const p = priceOf(hm, i);
    s.v += i.v || 0; s.vk += vkOf(i); s.ct += ctOf(i); s.gt += (i.v || 0) * p.b + vkOf(i) * p.v + ctOf(i) * p.c; });
  return s;
}
function assignHTML(where) {
  const ids = [...sel], its = ids.map((i) => BYID[i]).filter(Boolean), s = sum(withSubs(ids)), w = canEdit(), B = cfgOf(HM.id).mode === "B", k = wkind();
  if (!its.length) return `<div class="assign"><p class="empty" style="margin:0">${where === "map" ? "Bấm một cấu kiện (Ctrl/Shift hoặc “Chọn nhiều” để chọn thêm, “Quét chọn” để khoanh vùng)" : "Đánh dấu hộp kiểm ở các dòng"}${w ? " rồi nhập ngày." : ". Bạn chỉ có quyền xem hạng mục này."}</p></div>`;
  const ds = [...new Set(its.map((i) => dateK(HM.id, i.id, k) || ""))];
  const cnt = {}; its.forEach((i) => (cnt[i.ten] = (cnt[i.ten] || 0) + 1));
  const def = ds.length === 1 && ds[0] ? ds[0] : ($("dTo").value && $("dTo").value <= today() ? $("dTo").value : today());
  const own = k === "b" ? ds.some(Boolean) : its.some((i) => (k === "vc" ? ["v", "c"] : [k]).some((x) => ownDate(HM.id, i.id, x)));
  const lab = k === "b" ? (B ? "ngày đổ BT" : "ngày đổ BT (VK, CT theo BT)") : `ngày ${WN[k]}`;
  const hint = !B && ["v", "c", "vc"].includes(work()) ? `<div class="names">Chế độ A: chỉ ghi ngày đổ BT – VK, CT tự tính xong cùng ngày. Muốn ghi ngày VK/CT riêng: Hệ số & chế độ → B.</div>`
    : B && k !== "b" ? `<div class="names">Chưa ghi ngày riêng thì ${WN[k]} tính xong cùng ngày đổ BT.</div>`
    : B && work() === "tq" ? `<div class="names">Đang ghi ngày đổ BT. Muốn ghi ngày VK, CT riêng: chọn Hiển thị → Ván khuôn / Cốt thép / Xong VK + CT.</div>` : "";
  return `<div class="assign"><div style="display:flex;gap:14px;flex-wrap:wrap"><div><div class="empty">Đã chọn</div><div class="big">${its.length}</div></div><div><div class="empty">Bê tông</div><div class="big">${nf(s.v)} m³</div></div><div><div class="empty">Ván khuôn</div><div class="big">${nf(s.vk, 2)} m²</div></div><div><div class="empty">Cốt thép</div><div class="big">${nf(s.ct, 0)} kg</div></div><div><div class="empty">Giá trị</div><div class="big">${money(s.gt)} đ</div></div></div>
  <div class="names">${Object.entries(cnt).map(([x, n]) => esc(x) + (n > 1 ? " ×" + n : "")).join(", ")} · ${esc(lab)}: ${ds.length > 1 ? "<b>nhiều ngày khác nhau</b>" : ds[0] ? "<b>" + fd(ds[0]) + "</b>" : "<b>chưa có</b>"}</div>${hint}
  ${w ? `<div class="acts"><input type="date" class="aDate" value="${def}" aria-label="Ngày"><button class="btn pri aSet">Ghi ${esc(lab.replace(" (VK, CT theo BT)", ""))}</button><button class="btn aClr"${own ? "" : " disabled"}>${k === "b" ? "Xóa ngày BT" : "Xóa ngày riêng"}</button></div>` : ""}</div>`;
}
function bindAssign(root) {
  const b = root.querySelector(".aSet"); if (!b) return;
  const kinds = () => { const k = wkind(); return k === "vc" ? ["v", "c"] : [k]; };
  b.onclick = async () => { const d = root.querySelector(".aDate").value; if (!d) return; const p = {}; sel.forEach((id) => (p[keyOf(HM.id, id)] = d)); for (const k of kinds()) await setDates(HM.id, p, k); flash(b, "Đã ghi ✓"); };
  root.querySelector(".aClr").onclick = async () => { const p = {}; sel.forEach((id) => (p[keyOf(HM.id, id)] = null)); for (const k of kinds()) await setDates(HM.id, p, k); };
}
function renderAside() {
  if (!HM) return;
  if (!P) { $("aside").innerHTML = `<h2>${esc(HM.name)}</h2>${assignHTML("map")}`; bindAssign($("aside")); return; }
  if (work() === "tq") return renderAsideTQ();
  const k = work(), cols = QCOL[k], all = ITEMS.filter((i) => (BYID[rootOf(i.id)] || {}).mb === P.id);
  const mk = () => ({ n: 0, q: cols.map(() => 0), gt: 0 }), g = [mk(), mk(), mk()], T = mk(), { a, b } = per();
  all.forEach((i) => { const st = status(dateK(HM.id, i.id, k)), pr = priceOf(HM.id, i), one = String(i.id).includes(".") ? 0 : 1;
    [g[st], T].forEach((o) => { o.n += one; cols.forEach(([c], j) => { const q = QTY[c](i); o.q[j] += q; o.gt += q * pr[c]; }); }); });
  const lab = ["Chưa xong", "Xong trước kỳ", "Xong trong kỳ"];
  let h = `<h2>${esc(planLabel(P))}</h2><p class="empty" style="margin:0">${esc(HM.name)} · ${P._its.length} cấu kiện trên mặt bằng · màu: <b>${k === "b" ? "Đã đổ bê tông" : k === "vc" ? "Xong VK + CT" : WN[k]}</b></p>
  <h3>Chọn${canEdit() ? " và nhập ngày" : " cấu kiện"}</h3>${assignHTML("map")}`;
  const one = sel.size === 1 && BYID[[...sel][0]];
  if (one) { const it = one, sb = ITEMS.filter((x) => rootOf(x.id) === it.id && x.id !== it.id), p = priceOf(HM.id, it);
    const dt = (x) => { const e = dateK(HM.id, it.id, x), o = x === "b" ? e : ownDate(HM.id, it.id, x); return e ? fd(e) + (x !== "b" && e !== o ? " <small class=\"empty\">(theo BT)</small>" : "") : "–"; };
    h += `<h3>Chi tiết cấu kiện</h3><div class="kv"><span>ID / trục</span><span>${esc(it.id)} · ${esc(it.truc)}</span><span>Loại</span><span>${esc(LN[it.loai] || it.loai)} ${esc(tangName(it.tang))}</span>
    <span>Dài × rộng × cao</span><span>${[it.dai, it.rong, it.cao].map((v) => v == null ? "–" : nf(v, 2)).join(" × ")} m</span>
    <span>Thể tích BT</span><span><b>${nf(it.v)} m³</b> × ${money(p.b)}</span><span>Ván khuôn</span><span>${nf(vkOf(it), 2)} m² × ${money(p.v)}</span><span>Cốt thép</span><span>${nf(ctOf(it), 1)} kg × ${money(p.c)}</span>
    ${["b", "v", "c"].map((x) => `<span>Ngày ${WN[x].toLowerCase()}</span><span>${dt(x)}</span>`).join("")}
    ${sb.map((x) => `<span>${esc(x.id)} ${esc(x.ten)}</span><span>${nf(x.v)} m³</span>`).join("")}</div>`; }
  const qc = (o) => cols.map(([, , d], j) => `<td class="n">${nf(o.q[j], d)}</td>`).join("");
  h += `<h3>Kỳ ${a > "0001" ? fd(a) : "đầu"} → ${b < "9999" ? fd(b) : "nay"} · mặt bằng này</h3><table class="leg"><tr><td></td><td class="n">SL</td>${cols.map(([, u]) => `<td class="n">${u}</td>`).join("")}<td class="n">Giá trị (đ)</td></tr>
  ${[1, 2, 0].map((st) => `<tr><td><span class="sw" style="background:${COL[st]}"></span>${lab[st]}</td><td class="n">${g[st].n}</td>${qc(g[st])}<td class="n">${money(g[st].gt)}</td></tr>`).join("")}
  <tr><td><b>Cộng</b></td><td class="n"><b>${T.n}</b></td>${qc(T)}<td class="n"><b>${money(T.gt)}</b></td></tr></table>
  <div class="meter"><i style="width:${(g[1].n / (T.n || 1)) * 100}%;background:var(--done)"></i><i style="width:${(g[2].n / (T.n || 1)) * 100}%;background:var(--now)"></i></div>
  <p class="empty">Lũy kế đến cuối kỳ: ${nf(((g[1].gt + g[2].gt) / (T.gt || 1)) * 100, 1)}% giá trị · ${g[1].n + g[2].n}/${T.n} cấu kiện${T.gt ? "" : " · chưa có đơn giá (sheet GAN_THEP)"}</p>`;
  $("aside").innerHTML = h; bindAssign($("aside"));
}

function itemDetail() {
  const one = sel.size === 1 && BYID[[...sel][0]]; if (!one) return "";
  const it = one, sb = ITEMS.filter((x) => rootOf(x.id) === it.id && x.id !== it.id), p = priceOf(HM.id, it);
  const dt = (x) => { const e = dateK(HM.id, it.id, x), o = x === "b" ? e : ownDate(HM.id, it.id, x); return e ? fd(e) + (x !== "b" && e !== o ? " <small class=\"empty\">(theo BT)</small>" : "") : "–"; };
  return `<h3>Chi tiết cấu kiện</h3><div class="kv"><span>ID / trục</span><span>${esc(it.id)} · ${esc(it.truc)}</span><span>Loại</span><span>${esc(LN[it.loai] || it.loai)} ${esc(tangName(it.tang))}</span>
    <span>Dài × rộng × cao</span><span>${[it.dai, it.rong, it.cao].map((v) => v == null ? "–" : nf(v, 2)).join(" × ")} m</span>
    <span>Thể tích BT</span><span><b>${nf(it.v)} m³</b> × ${money(p.b)}</span><span>Ván khuôn</span><span>${nf(vkOf(it), 2)} m² × ${money(p.v)}</span><span>Cốt thép</span><span>${nf(ctOf(it), 1)} kg × ${money(p.c)}</span>
    ${["b", "v", "c"].map((x) => `<span>Ngày ${WN[x].toLowerCase()}</span><span>${dt(x)}</span>`).join("")}
    ${sb.map((x) => `<span>${esc(x.id)} ${esc(x.ten)}</span><span>${nf(x.v)} m³</span>`).join("")}</div>`;
}
function renderAsideTQ() {
  const all = ITEMS.filter((i) => (BYID[rootOf(i.id)] || {}).mb === P.id), { a, b } = per();
  const g = STG.map(() => ({ n: 0, ni: 0, gt: 0 })), T = { n: 0, ni: 0, gt: 0, tot: 0 };
  all.forEach((i) => {
    const one = String(i.id).includes(".") ? 0 : 1, pr = priceOf(HM.id, i), st = stageOf(HM.id, i.id);
    let done = 0; ["b", "v", "c"].forEach((c) => { const d = dateK(HM.id, i.id, c), q = QTY[c](i) * pr[c]; T.tot += q; if (d && d <= b) done += q; });
    const inp = st.d && st.d >= a ? one : 0;
    [g[st.s], T].forEach((o) => { o.n += one; o.ni += inp; o.gt += done; });
  });
  let h = `<h2>${esc(planLabel(P))}</h2><p class="empty" style="margin:0">${esc(HM.name)} · ${P._its.length} cấu kiện trên mặt bằng · màu: <b>Tiến độ tổng hợp</b> đến ${b < "9999" ? fd(b) : "nay"}</p>
  <h3>Chọn${canEdit() ? " và nhập ngày" : " cấu kiện"}</h3>${assignHTML("map")}${itemDetail()}
  <h3>Trạng thái đến ${b < "9999" ? fd(b) : "nay"} · viền đậm = làm trong kỳ ${a > "0001" ? fd(a) : ""}–${b < "9999" ? fd(b) : ""}</h3><table class="leg"><tr><td></td><td class="n">SL</td><td class="n">Trong kỳ</td><td class="n">Giá trị đã làm (đ)</td></tr>
  ${[4, 3, 2, 1, 0].map((s) => `<tr><td><span class="sw" style="background:${STG[s][1]}"></span>${STG[s][0]}</td><td class="n">${g[s].n}</td><td class="n">${g[s].ni || ""}</td><td class="n">${money(g[s].gt)}</td></tr>`).join("")}
  <tr><td><b>Cộng</b></td><td class="n"><b>${T.n}</b></td><td class="n"><b>${T.ni}</b></td><td class="n"><b>${money(T.gt)}</b></td></tr></table>
  <div class="meter">${[4, 3, 2, 1].map((s) => `<i style="width:${(g[s].n / (T.n || 1)) * 100}%;background:${STG[s][1]}"></i>`).join("")}</div>
  <p class="empty">Giá trị đã làm ${money(T.gt)} / ${money(T.tot)} đ (${nf((T.gt / (T.tot || 1)) * 100, 1)}%)${T.tot ? "" : " · chưa có đơn giá (sheet GAN_THEP)"}</p>`;
  $("aside").innerHTML = h; bindAssign($("aside"));
}

// ===================== Kỳ báo cáo =====================
function savePer() { try { localStorage.setItem("ttbt_per", JSON.stringify([$("dFrom").value, $("dTo").value])); } catch (e) {} }
function preset(k) {
  const t = today(); let a = t, b = t;
  if (k === "week") { const dw = new Date(t + "T00:00:00Z").getUTCDay(); a = addD(t, -((dw - 6 + 7) % 7)); b = addD(a, 6); }
  if (k === "month") { a = t.slice(0, 8) + "01"; b = t; }
  if (k === "all") { a = ""; b = t; }
  $("dFrom").value = a; $("dTo").value = b; savePer(); refreshAll();
}
document.querySelectorAll("[data-pre]").forEach((b) => (b.onclick = () => preset(b.dataset.pre)));
["dFrom", "dTo"].forEach((id) => $(id).addEventListener("change", () => { savePer(); refreshAll(); }));

// ---------- Chọn hạng mục báo cáo (tùy ý) ----------
let RSEL = new Set(); try { RSEL = new Set(JSON.parse(localStorage.getItem("ttbt_rsel") || "[]")); } catch (e) {}
const repList = () => { const l = HMS.filter((h) => RSEL.has(h.id)); return l.length ? l : HMS.filter((h) => HM && h.id === HM.id); };
const repTitle = () => { const l = repList(); return l.length && l.length === HMS.length && HMS.length > 1 ? "toàn dự án" : l.map((h) => h.name).join(", "); };
function renderScopeBtn() { const l = repList(); $("scopeBtn").textContent = `Hạng mục báo cáo: ${l.length === HMS.length && HMS.length > 1 ? "Toàn dự án" : l.length === 1 ? l[0].name : l.length + " hạng mục"} ▾`; }
$("scopeBtn").onclick = () => {
  const cur = new Set(repList().map((h) => h.id));
  $("ovl").innerHTML = `<div class="ov"><div class="dlg" style="max-width:440px"><h2>Chọn hạng mục báo cáo</h2>
  <div class="tools" style="margin:6px 0"><button class="btn" id="rsAll">Toàn dự án</button><button class="btn" id="rsNone">Bỏ chọn hết</button></div>
  ${HMS.map((h) => `<label style="display:flex;gap:10px;align-items:center;margin:8px 0;color:var(--ink);font-size:15px"><input type="checkbox" data-h="${esc(h.id)}" ${cur.has(h.id) ? "checked" : ""} style="width:20px;height:20px">${esc(h.name)}</label>`).join("")}
  <div class="acts"><button class="btn" id="rsNo">Hủy</button><button class="btn pri" id="rsOk">Xem báo cáo</button></div></div></div>`;
  const boxes = () => [...$("ovl").querySelectorAll("[data-h]")];
  $("rsAll").onclick = () => boxes().forEach((b) => (b.checked = true)); $("rsNone").onclick = () => boxes().forEach((b) => (b.checked = false));
  $("rsNo").onclick = () => ($("ovl").innerHTML = "");
  $("rsOk").onclick = () => { RSEL = new Set(boxes().filter((b) => b.checked).map((b) => b.dataset.h)); try { localStorage.setItem("ttbt_rsel", JSON.stringify([...RSEL])); } catch (e) {} $("ovl").innerHTML = ""; renderTitle(); renderRep(); };
};

// ===================== Báo cáo =====================
const RF = ["n", "bt", "btP", "btI", "vk", "vkP", "vkI", "ct", "ctP", "ctI", "gt", "gtP", "gIb", "gIv", "gIc"];
function repRows(hm) {
  const rows = {};
  KL[hm].items.forEach((it) => {
    const key = rowKey(it), r = rows[key] || (rows[key] = Object.fromEntries([["k", key], ...RF.map((f) => [f, 0])]));
    if (!String(it.id).includes(".")) r.n++;
    const p = priceOf(hm, it);
    [["b", "bt"], ["v", "vk"], ["c", "ct"]].forEach(([k, f]) => {
      const q = QTY[k](it), val = q * p[k], st = status(dateK(hm, it.id, k));
      r[f] += q; r.gt += val;
      if (st === 1) { r[f + "P"] += q; r.gtP += val; } else if (st === 2) { r[f + "I"] += q; r["gI" + k] += val; }
    });
  });
  return Object.values(rows).sort((x, y) => rowSort(x.k, y.k));
}
function addRow(t, r) { RF.forEach((f) => (t[f] = (t[f] || 0) + r[f])); return t; }
const gIn = (r) => r.gIb + r.gIv + r.gIc;
const pct = (a, b) => nf((a / (b || 1)) * 100, 1) + "%";
const trKL = (r, label, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="n">${r.n}</td><td class="n">${nf(r.bt)}</td><td class="n"><b>${nf(r.btI)}</b></td><td class="n">${nf(r.btP + r.btI)}</td><td class="n">${nf(r.bt - r.btP - r.btI)}</td><td class="n">${pct(r.btP + r.btI, r.bt)}</td><td class="n">${nf(r.vk, 2)}</td><td class="n"><b>${nf(r.vkI, 2)}</b></td><td class="n">${nf(r.vkP + r.vkI, 2)}</td><td class="n">${nf(r.ct, 0)}</td><td class="n"><b>${nf(r.ctI, 0)}</b></td><td class="n">${nf(r.ctP + r.ctI, 0)}</td></tr>`;
const trGT = (r, label, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="n">${money(r.gt)}</td><td class="n">${money(r.gtP)}</td><td class="n">${money(r.gIb)}</td><td class="n">${money(r.gIv)}</td><td class="n">${money(r.gIc)}</td><td class="n"><b>${money(gIn(r))}</b></td><td class="n">${money(r.gtP + gIn(r))}</td><td class="n">${money(r.gt - r.gtP - gIn(r))}</td><td class="n">${pct(r.gtP + gIn(r), r.gt)}</td></tr>`;
let REP = null;
async function renderRep() {
  renderScopeBtn();
  if (view !== "vRep") return;
  const page = $("repPage"); if (!HMS.length) { page.innerHTML = `<p class="empty">Chưa có hạng mục nào để báo cáo.</p>`; return; }
  const list = repList(); if (!list.length) return;
  if (list.some((h) => !KL[h.id] || KL[h.id].v !== h.v)) { page.innerHTML = `<p class="empty">Đang tải khối lượng ${list.length} hạng mục…</p>`; try { for (const h of list) await getKL(h); } catch (e) { page.innerHTML = `<p class="empty">Lỗi: ${esc(e.message)}</p>`; return; } }
  const { a, b } = per(), groups = list.map((h) => ({ h, rows: repRows(h.id) }));
  const T = {}; groups.forEach((g) => g.rows.forEach((r) => addRow(T, r)));
  // chi tiết theo ngày
  const det = {};
  list.forEach((h) => KL[h.id].items.forEach((it) => {
    const p = priceOf(h.id, it);
    ["b", "v", "c"].forEach((k) => { const d = dateK(h.id, it.id, k); if (!d || d < a || d > b) return;
      const key = d + "|" + h.id + "|" + rowKey(it), r = det[key] || (det[key] = { d, h, k: rowKey(it), bt: 0, vk: 0, ct: 0, gt: 0, c: {}, ids: new Set() });
      const q = QTY[k](it); r[{ b: "bt", v: "vk", c: "ct" }[k]] += q; r.gt += q * p[k];
      if (!String(it.id).includes(".") && !r.ids.has(it.id)) { r.ids.add(it.id); r.c[it.ten] = (r.c[it.ten] || 0) + 1; } });
  }));
  const detail = Object.values(det).sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : (x.h.order ?? 0) - (y.h.order ?? 0) || rowSort(x.k, y.k));
  REP = { groups, T, detail, list };
  const multiHM = list.length > 1, days = new Set(detail.map((r) => r.d)).size, noPrice = !T.gt;
  const hKL = `<thead><tr><th rowspan="2">Hạng mục / cấu kiện</th><th rowspan="2">SL</th><th colspan="5">Bê tông (m³)</th><th colspan="3">Ván khuôn (m²)</th><th colspan="3">Cốt thép (kg)</th></tr><tr><th>Tổng</th><th>Trong kỳ</th><th>Lũy kế</th><th>Còn lại</th><th>% HT</th><th>Tổng</th><th>Trong kỳ</th><th>Lũy kế</th><th>Tổng</th><th>Trong kỳ</th><th>Lũy kế</th></tr></thead>`;
  const hGT = `<thead><tr><th rowspan="2">Hạng mục / cấu kiện</th><th rowspan="2">Tổng giá trị</th><th rowspan="2">Trước kỳ</th><th colspan="4">Trong kỳ</th><th rowspan="2">Lũy kế</th><th rowspan="2">Còn lại</th><th rowspan="2">% HT</th></tr><tr><th>Bê tông</th><th>Ván khuôn</th><th>Cốt thép</th><th>Cộng</th></tr></thead>`;
  let bKL = "", bGT = "";
  groups.forEach((g) => { const st = {}; g.rows.forEach((r) => addRow(st, r));
    if (multiHM) { bKL += trKL(st, esc(g.h.name), "hm"); bGT += trGT(st, esc(g.h.name), "hm"); }
    g.rows.forEach((r) => { const l = (multiHM ? "&nbsp;&nbsp;" : "") + esc(rowLabel(r.k)); bKL += trKL(r, l); bGT += trGT(r, l); }); });
  const tl = multiHM ? "Tổng cộng " + (list.length === HMS.length ? "dự án" : list.length + " hạng mục") : "Tổng cộng " + esc(list[0].name);
  bKL += trKL(T, tl, "tot"); bGT += trGT(T, tl, "tot");
  const modes = [...new Set(list.map((h) => cfgOf(h.id).mode))];
  page.innerHTML = `<h2>Kỳ ${a > "0001" ? fd(a) : "khởi công"} – ${b < "9999" ? fd(b) : "nay"}: giá trị thực hiện ${money(gIn(T))} đ</h2>
  <p class="lead">${esc(repTitle())} · ${days} ngày có thi công trong kỳ · ${modes.length === 1 ? (modes[0] === "B" ? "BT, VK, CT theo ngày riêng" : "VK, CT tính theo ngày đổ BT") : "chế độ khác nhau theo hạng mục"}. Giá trị = khối lượng × đơn giá (GAN_THEP) × hệ số hạng mục.${noPrice ? " <b>Chưa có đơn giá – nhập vào sheet GAN_THEP rồi Nhập Excel lại.</b>" : ""}</p>
  <div class="cards"><div class="card"><div class="t">Giá trị trong kỳ</div><div class="v">${money(gIn(T))} đ</div><div class="t">BT ${money(T.gIb)} · VK ${money(T.gIv)} · CT ${money(T.gIc)}</div></div>
  <div class="card"><div class="t">Giá trị lũy kế đến ${b < "9999" ? fd(b) : "nay"}</div><div class="v">${money(T.gtP + gIn(T))} đ</div><div class="t">${pct(T.gtP + gIn(T), T.gt)} của ${money(T.gt)} đ</div></div>
  <div class="card"><div class="t">Bê tông trong kỳ</div><div class="v">${nf(T.btI, 2)} m³</div><div class="t">Lũy kế ${nf(T.btP + T.btI, 2)} m³</div></div>
  <div class="card"><div class="t">VK / Cốt thép trong kỳ</div><div class="v">${nf(T.vkI, 0)} m² · ${nf(T.ctI / 1000, 2)} t</div><div class="t">Lũy kế ${nf(T.vkP + T.vkI, 0)} m² · ${nf((T.ctP + T.ctI) / 1000, 2)} t</div></div></div>
  <div class="tools"><b>Giá trị thực hiện (đồng)</b><span class="sp"></span><button class="btn" id="cpGT">Sao chép sang Excel</button><button class="btn" id="xRep">Xuất Excel</button></div>
  <div class="scroll"><table class="tbl" id="gtTbl">${hGT}<tbody>${bGT}</tbody></table></div>
  <div class="tools"><b>Khối lượng thực hiện</b><span class="sp"></span><button class="btn" id="cpKL">Sao chép</button></div>
  <div class="scroll"><table class="tbl" id="klTbl">${hKL}<tbody>${bKL}</tbody></table></div>
  <div class="tools"><b>Chi tiết theo ngày trong kỳ</b><span class="sp"></span><button class="btn" id="cpDet">Sao chép</button></div>
  ${detail.length ? `<div class="scroll"><table class="tbl" id="detTbl"><thead><tr><th>Ngày</th>${multiHM ? "<th>Hạng mục</th>" : ""}<th>Cấu kiện</th><th>SL</th><th>Tên cấu kiện</th><th>BT (m³)</th><th>VK (m²)</th><th>CT (kg)</th><th>Giá trị (đ)</th></tr></thead><tbody>${detail.map((r) => `<tr><td>${fd(r.d)}</td>${multiHM ? `<td>${esc(r.h.name)}</td>` : ""}<td>${esc(rowLabel(r.k))}</td><td class="n">${r.ids.size}</td><td>${esc(Object.entries(r.c).map(([k, n]) => k + (n > 1 ? " ×" + n : "")).join(", "))}</td><td class="n">${nf(r.bt)}</td><td class="n">${nf(r.vk, 2)}</td><td class="n">${nf(r.ct, 0)}</td><td class="n">${money(r.gt)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Không có công tác nào trong kỳ này.</p>`}`;
  $("cpGT").onclick = (e) => copyTable($("gtTbl"), e.target); $("cpKL").onclick = (e) => copyTable($("klTbl"), e.target);
  $("cpDet").onclick = (e) => $("detTbl") && copyTable($("detTbl"), e.target); $("xRep").onclick = exportExcel;
}

// ===================== Danh sách (hộp kiểm) =====================
function initListFilters() {
  const ks = [...new Set(ITEMS.filter((i) => !String(i.id).includes(".")).map(rowKey))].sort(rowSort);
  $("fGrp").innerHTML = `<option value="">Mọi cấu kiện</option>` + ks.map((k) => `<option value="${esc(k)}">${esc(rowLabel(k))}</option>`).join("");
}
function listItems() {
  const q = $("q").value.trim().toLowerCase(), g = $("fGrp").value, f = $("fSt").value;
  return ITEMS.filter((i) => !String(i.id).includes(".") && (!g || rowKey(i) === g) && (!q || (i.id + " " + i.ten + " " + i.truc).toLowerCase().includes(q)) &&
    (!f || (f === "no" ? !dW(i.id) : f === "yes" ? !!dW(i.id) : status(dW(i.id)) === 2)));
}
function renderList() {
  if (view !== "vList" || !HM) return;
  const f = listItems(), allOn = f.length && f.every((i) => sel.has(i.id)), B = cfgOf(HM.id).mode === "B";
  const agg = {}; ITEMS.forEach((i) => { const r = rootOf(i.id), p = priceOf(HM.id, i); const o = agg[r] || (agg[r] = { v: 0, vk: 0, ct: 0, gt: 0 }); o.v += i.v || 0; o.vk += vkOf(i); o.ct += ctOf(i); o.gt += (i.v || 0) * p.b + vkOf(i) * p.v + ctOf(i) * p.c; });
  const dcell = (id, k) => { const d = dateK(HM.id, id, k); if (!d) return ""; const fb = k !== "b" && d !== ownDate(HM.id, id, k); return `<span class="sw" style="background:${COL[status(d)]}"></span>${fd(d)}${fb ? ' <small class="empty">BT</small>' : ""}`; };
  $("listTbl").innerHTML = `<thead><tr><th class="c"><input type="checkbox" id="chkAll" ${allOn ? "checked" : ""} aria-label="Chọn tất cả dòng đang lọc"></th><th>ID</th><th>Cấu kiện</th><th>Tên</th><th>Trục</th><th>Ngày BT</th>${B ? "<th>Ngày VK</th><th>Ngày CT</th>" : ""}<th>BT m³</th><th>VK m²</th><th>CT kg</th><th>Giá trị (đ)</th><th>Mặt bằng</th></tr></thead><tbody>${f.slice(0, listN).map((i) => { const on = sel.has(i.id), o = agg[i.id];
    return `<tr class="${on ? "chk" : ""}" data-id="${esc(i.id)}"><td class="c"><input type="checkbox" ${on ? "checked" : ""} aria-label="Chọn ${esc(i.ten)}"></td><td>${esc(i.id)}</td><td>${esc(rowLabel(rowKey(i)))}</td><td>${esc(i.ten)}</td><td>${esc(i.truc)}</td><td>${dcell(i.id, "b")}</td>${B ? `<td>${dcell(i.id, "v")}</td><td>${dcell(i.id, "c")}</td>` : ""}<td class="n">${nf(o.v)}</td><td class="n">${nf(o.vk, 2)}</td><td class="n">${nf(o.ct, 0)}</td><td class="n">${money(o.gt)}</td><td>${i.mb && G && G.shapes[i.id] ? `<button class="edit" data-go="${esc(i.id)}">Xem</button>` : ""}</td></tr>`; }).join("")}</tbody>`;
  $("more").hidden = f.length <= listN; $("more").textContent = `Hiện thêm (còn ${f.length - listN} dòng)`;
  $("listAssign").innerHTML = assignHTML("list"); bindAssign($("listAssign"));
  $("chkAll").onchange = (e) => { f.forEach((i) => e.target.checked ? sel.add(i.id) : sel.delete(i.id)); refreshSel(); };
}
$("listTbl").addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]"); if (go) { const it = BYID[go.dataset.go]; sel.clear(); sel.add(it.id); tab("vMap"); showPlan(it.mb); focusItem(it); refreshSel(); return; }
  const tr = e.target.closest("tbody tr"); if (!tr) return; const id = tr.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); refreshSel();
});
["q", "fGrp", "fSt"].forEach((id) => $(id).addEventListener("input", () => { listN = 300; renderList(); }));
$("more").onclick = () => { listN += 500; renderList(); };
function focusItem(it) { const b = it._b || boxOf(G.shapes[it.id][0]), w = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 14, r = box.getBoundingClientRect(); if (!r.width) return; const k = w / Math.min(r.width, r.height); vb = { w: r.width * k, h: r.height * k }; vb.x = (b.x0 + b.x1) / 2 - vb.w / 2; vb.y = -(b.y0 + b.y1) / 2 - vb.h / 2; setVB(); }

// ===================== Làm mới / tab =====================
function refreshSel() { paint(); renderAside(); renderList(); }
function refreshAll() { paint(); renderAside(); renderList(); renderRep(); }
function tab(v) {
  view = v; document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  document.querySelectorAll(".view").forEach((s) => s.classList.toggle("on", s.id === v));
  $("mapTools").style.display = v === "vMap" ? "contents" : "none"; $("repTools").style.display = v === "vRep" ? "contents" : "none";
  renderModeUI(); renderTitle(); if (v === "vMap" && P) requestAnimationFrame(fit); renderRep(); renderList();
}
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => tab(b.dataset.v)));
async function copyTable(t, btn) { const tsv = [...t.rows].map((r) => [...r.cells].map((c) => c.textContent.trim()).join("\t")).join("\n"); try { await navigator.clipboard.writeText(tsv); flash(btn, "Đã sao chép ✓"); } catch (e) { flash(btn, "Không sao chép được"); } }
function flash(b, t) { const o = b.textContent; b.textContent = t; setTimeout(() => (b.textContent = o), 1500); }

// ===================== Hệ số giá & chế độ theo dõi (theo hạng mục) =====================
$("hmCfgBtn").onclick = () => {
  if (!HM) return; const c = cfgOf(HM.id), w = lvHM(HM.id) >= 3, dis = w ? "" : " disabled";
  $("ovl").innerHTML = `<div class="ov"><div class="dlg"><h2>Hệ số giá & chế độ – ${esc(HM.name)}</h2>
  <p class="empty">Đơn giá lấy từ sheet GAN_THEP (cột F–I) của file Excel. Giá trị = khối lượng × đơn giá × hệ số.${w ? "" : " Bạn chỉ xem được (cần quyền Quản trị hạng mục để sửa)."}</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px">
  ${[["lot", "BT lót"], ["bt", "Bê tông"], ["vk", "Ván khuôn"], ["ct", "Cốt thép"]].map(([k, l]) => `<label style="margin:0">${l}<input type="number" step="0.001" min="0" data-k="${k}" value="${c.k[k]}" style="width:100%"${dis}></label>`).join("")}</div>
  <label style="margin-top:16px">Chế độ theo dõi</label>
  <label style="display:flex;gap:8px;align-items:flex-start;color:var(--ink)"><input type="radio" name="md" value="A" ${c.mode === "A" ? "checked" : ""}${dis}> <span><b>A – VK, CT ăn theo bê tông:</b> chỉ nhập ngày đổ BT; ván khuôn, cốt thép tính xong cùng ngày.</span></label>
  <label style="display:flex;gap:8px;align-items:flex-start;color:var(--ink)"><input type="radio" name="md" value="B" ${c.mode === "B" ? "checked" : ""}${dis}> <span><b>B – Có ngày riêng:</b> ghi thêm ngày VK, CT, VK+CT riêng (chọn ở ô Hiển thị). Đổ BT thì VK, CT chưa có ngày riêng tự xong cùng ngày BT; ngày riêng sớm hơn BT giữ nguyên ở kỳ đó.</span></label>
  <div class="acts"><button class="btn" id="hcNo">Đóng</button>${w ? `<button class="btn pri" id="hcOk">Lưu</button>` : ""}</div></div></div>`;
  $("hcNo").onclick = () => ($("ovl").innerHTML = "");
  if (w) $("hcOk").onclick = async () => {
    const k = {}; $("ovl").querySelectorAll("[data-k]").forEach((i) => (k[i.dataset.k] = num1(i.value)));
    const mode = $("ovl").querySelector("[name=md]:checked").value;
    $("hcOk").disabled = true;
    try {
      await fs.setDoc(fs.doc(db, "hmcfg", HM.id), { k, mode, at: new Date().toISOString(), by: ME }, { merge: true });
      $("ovl").innerHTML = "";
    } catch (e) { $("hcOk").disabled = false; setNote("Không lưu được: " + (e.code === "permission-denied" ? "không có quyền (cần cập nhật quy tắc Firestore cho hmcfg)" : e.code)); }
  };
};

// ===================== Xuất Excel (kiêm sao lưu ngày) =====================
async function exportExcel(e) {
  const btn = e && e.target;
  if (!window.XLSX) { if (btn) flash(btn, "Chưa tải được thư viện Excel"); return; }
  if (view !== "vRep" || !REP) { const v = view; view = "vRep"; await renderRep(); view = v; }
  if (!REP) return;
  const { a, b } = per(), X = XLSX, wb = X.utils.book_new(), R = REP, r3 = (v) => +(+v).toFixed(3), r0 = (v) => Math.round(v);
  const ttl = `KỲ ${a > "0001" ? fd(a) : ""} - ${b < "9999" ? fd(b) : ""} · ${repTitle()}`;
  const gt = [[`GIÁ TRỊ THỰC HIỆN ${ttl}`], [CFG.ten], [], ["Hạng mục / cấu kiện", "Tổng giá trị", "Trước kỳ", "Trong kỳ - BT", "Trong kỳ - VK", "Trong kỳ - CT", "Trong kỳ - Cộng", "Lũy kế", "Còn lại", "% HT"]];
  const kl = [[`KHỐI LƯỢNG THỰC HIỆN ${ttl}`], [CFG.ten], [], ["Hạng mục / cấu kiện", "SL", "BT tổng (m3)", "BT trong kỳ", "BT lũy kế", "BT còn lại", "VK tổng (m2)", "VK trong kỳ", "VK lũy kế", "CT tổng (kg)", "CT trong kỳ", "CT lũy kế"]];
  const rg = (r, l) => [l, r0(r.gt), r0(r.gtP), r0(r.gIb), r0(r.gIv), r0(r.gIc), r0(gIn(r)), r0(r.gtP + gIn(r)), r0(r.gt - r.gtP - gIn(r)), +((r.gtP + gIn(r)) / (r.gt || 1)).toFixed(4)];
  const rk = (r, l) => [l, r.n, r3(r.bt), r3(r.btI), r3(r.btP + r.btI), r3(r.bt - r.btP - r.btI), r3(r.vk), r3(r.vkI), r3(r.vkP + r.vkI), r3(r.ct), r3(r.ctI), r3(r.ctP + r.ctI)];
  R.groups.forEach((g) => { const st = {}; g.rows.forEach((r) => addRow(st, r)); gt.push(rg(st, g.h.name)); kl.push(rk(st, g.h.name)); g.rows.forEach((r) => { gt.push(rg(r, "   " + rowLabel(r.k))); kl.push(rk(r, "   " + rowLabel(r.k))); }); });
  gt.push(rg(R.T, "TỔNG CỘNG")); kl.push(rk(R.T, "TỔNG CỘNG"));
  const s1 = X.utils.aoa_to_sheet(gt); s1["!cols"] = [{ wch: 30 }, ...Array(9).fill({ wch: 15 })]; X.utils.book_append_sheet(wb, s1, "GiaTri");
  const s2 = X.utils.aoa_to_sheet(kl); s2["!cols"] = [{ wch: 30 }, ...Array(11).fill({ wch: 12 })]; X.utils.book_append_sheet(wb, s2, "KhoiLuong");
  const t3 = [["Ngày", "Hạng mục", "Cấu kiện", "SL", "Tên", "BT (m3)", "VK (m2)", "CT (kg)", "Giá trị (đ)"], ...R.detail.map((r) => [fd(r.d), r.h.name, rowLabel(r.k), r.ids.size, Object.entries(r.c).map(([k, n]) => k + (n > 1 ? " x" + n : "")).join(", "), r3(r.bt), r3(r.vk), r3(r.ct), r0(r.gt)])];
  const s3 = X.utils.aoa_to_sheet(t3); s3["!cols"] = [{ wch: 11 }, { wch: 18 }, { wch: 20 }, { wch: 6 }, { wch: 50 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }]; X.utils.book_append_sheet(wb, s3, "ChiTietKy");
  // DanhSach: ngày BT/VK/CT của mọi cấu kiện (bản sao lưu – nạp lại bằng "Nạp ngày từ file")
  const t4 = [["Hạng mục", "ID", "Loại", "Tầng", "Tên", "Trục", "BT (m3)", "VK (m2)", "CT (kg)", "Ngày BT", "Ngày VK", "Ngày CT", "Mã hạng mục", "UID"]];
  R.list.forEach((h) => { const D = DATES[h.id] || {}; KL[h.id].items.forEach((i) => { const r = keyOf(h.id, i.id); t4.push([h.name, i.id, LN[i.loai] || i.loai, tangName(i.tang), i.ten, i.truc, i.v || 0, r3(vkOf(i)), r3(ctOf(i)), fd((D.b || {})[r] || ""), fd((D.v || {})[r] || ""), fd((D.c || {})[r] || ""), h.id, String(i.id).includes(".") ? "" : (i.uid || "")]); }); });
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(t4), "DanhSach");
  X.writeFile(wb, `BaoCao_${(a > "0001" ? a : "dau").replace(/-/g, "")}_${(b < "9999" ? b : today()).replace(/-/g, "")}.xlsx`);
  if (btn) flash(btn, "Đã xuất ✓");
}
$("expBtn").onclick = exportExcel;

// ---------- Nạp ngày từ file sao lưu ----------
$("restBtn").onclick = () => { $("restFile").value = ""; $("restFile").click(); };
$("restFile").onchange = async () => {
  const f = $("restFile").files[0]; if (!f) return;
  try {
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" }), ws = wb.Sheets.DanhSach;
    if (!ws) throw new Error("file không có sheet DanhSach (dùng file xuất từ nút Xuất Excel)");
    const all = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }), hd = all[0].map((x) => String(x).trim());
    const col = (n) => hd.indexOf(n), cHM = col("Mã hạng mục"), cName = col("Hạng mục"), cId = col("ID"), cUid = col("UID");
    const cK = { b: col("Ngày BT") >= 0 ? col("Ngày BT") : col("Ngày đổ"), v: col("Ngày VK"), c: col("Ngày CT") };
    const plan = {}, hmOf = (r) => HMS.find((x) => x.id === r[cHM]) || HMS.find((x) => x.name === r[cName]);
    for (const h of new Set(all.slice(1).map(hmOf).filter((h) => h && lvHM(h.id) >= 2))) await getKL(h);
    all.slice(1).forEach((r) => {
      const h = hmOf(r); if (!h || lvHM(h.id) < 2) return;
      const id0 = String(r[cId]); if (!id0 || id0.includes(".")) return;
      const by = KL[h.id].by, u = cUid >= 0 ? String(r[cUid]).trim() : "";
      const it = u ? KL[h.id].items.find((x) => String(x.uid) === u) : by[id0];
      if (!it) return; const id = keyOf(h.id, it.id);
      Object.entries(cK).forEach(([k, c]) => { if (c < 0) return; const m = String(r[c]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return;
        const d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; if (((DATES[h.id] || {})[k] || {})[id] === d) return;
        ((plan[h.id] = plan[h.id] || {})[k] = plan[h.id][k] || {})[id] = d; });
    });
    const ks = Object.keys(plan);
    $("ovl").innerHTML = `<div class="ov"><div class="dlg"><h2>Nạp ngày từ file</h2><p class="empty">${esc(f.name)}</p>
    ${ks.length ? `<p>Sẽ ghi:</p><ul>${ks.map((k) => `<li>${esc(HMS.find((h) => h.id === k).name)}: ${Object.entries(plan[k]).map(([kk, o]) => Object.keys(o).length + " ngày " + WN[kk].toLowerCase()).join(", ")}</li>`).join("")}</ul><p class="empty">Chỉ ghi các ngày khác hiện tại; không xóa ngày đang có.</p>` : `<p>Không có ngày nào cần cập nhật (hoặc bạn không có quyền cập nhật các hạng mục trong file).</p>`}
    <div class="acts"><button class="btn" id="rNo">Đóng</button>${ks.length ? `<button class="btn pri" id="rOk">Ghi ngày</button>` : ""}</div></div></div>`;
    $("rNo").onclick = () => ($("ovl").innerHTML = "");
    if (ks.length) $("rOk").onclick = async () => { $("rOk").disabled = true; for (const k of ks) for (const [kk, o] of Object.entries(plan[k])) await setDates(k, o, kk); $("ovl").innerHTML = ""; setNote("Đã nạp ngày từ file"); };
  } catch (e) { setNote("Nạp ngày lỗi: " + e.message); }
};

// ===================== Nhập Excel hạng mục =====================
function parseWB(X, wb, name) {
  const rows = (n) => wb.Sheets[n] ? X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }) : [];
  const num = (v) => (v === null || v === "" || isNaN(+v)) ? null : Math.round(+v * 1e4) / 1e4;
  const r1 = (v) => (v === null || v === "" || isNaN(+v)) ? null : Math.round(+v * 10) / 10;
  const poly = (s) => { if (!s) return null; const rs = String(s).split("|").map((x) => { const o = []; x.replace(/^#/, "").split(";").forEach((p) => { const a = p.trim().split(/\s+/); if (a.length > 1 && !isNaN(+a[0]) && !isNaN(+a[1])) o.push(r1(a[0]), r1(a[1])); }); return o.length ? o : null; }).filter(Boolean); return rs.length ? rs : null; };
  if (!wb.Sheets.DANH_SACH) throw new Error("File không có sheet DANH_SACH");
  // GAN_THEP: ID | Ten | KL BT | Thep kg/1CK | SL | Gia BT lot | Gia BT | Gia VK | Gia CT  (dữ liệu từ dòng 7)
  const GT = {}; let hasGT = false;
  rows("GAN_THEP").slice(6).forEach((r) => { if (r[0] === null || r[0] === "") return; hasGT = true; GT[String(r[0]).trim()] = { kg1: num(r[3]) || 0, gl: num(r[5]), gb: num(r[6]), gv: num(r[7]), gc: num(r[8]) }; });
  const items = rows("DANH_SACH").slice(4).filter((r) => r[0] !== null && r[0] !== "").map((r) => {
    const id = String(r[0]).trim(), sl = num(r[4]) || 1, g = GT[id], it = { id, loai: r[1] || "", tang: r[2] || "", ten: String(r[3] ?? "").trim(), sl: num(r[4]), dai: num(r[5]), rong: num(r[6]), cao: num(r[7]), cv: num(r[10]), dt: num(r[11]), v: num(r[12]), vkt: num(r[13]), vkd: num(r[14]), dot: typeof r[15] === "number" ? Math.trunc(r[15]) : (r[15] && !isNaN(+r[15]) ? +r[15] : null), mb: r[16] || "", k: poly(r[21]), h: poly(r[22]), truc: r[26] || "", cd: r[28] ?? null };
    if (!id.includes(".")) {
      if (r[24] !== null && r[24] !== "") it.uid = String(r[24]).trim();
      const ct = g ? g.kg1 * sl : num(r[29]); if (ct) it.ct = Math.round(ct * 1000) / 1000;
      if (g) ["gl", "gb", "gv", "gc"].forEach((f) => { if (g[f]) it[f] = g[f]; });
    }
    return it; });
  const plans = wb.SheetNames.filter((n) => n.startsWith("MB_")).map((n) => { const a = rows(n); return { id: n, title: (a[0] || [])[0] || n, he: (a[0] || [])[25] || "", tang: (a[1] || [])[25] || "", L: [], G: [], W: [], box: null }; });
  const pm = Object.fromEntries(plans.map((p) => [p.id, p]));
  rows("_NEN").slice(1).forEach((r) => { const p = pm[r[0]]; if (!p) return; const t = r[1];
    if (t === "L") p.L.push(r1(r[2]), r1(r[3]), r1(r[4]), r1(r[5])); else if (t === "G") p.G.push(r1(r[2]), r1(r[3]), r1(r[4]), r1(r[5]), +r[6] || 0);
    else if (t === "W") p.W.push([r1(r[2]), r1(r[3]), r1(r[4]) || 0, r1(r[5]) || 300, String(r[6] ?? "")]); else if (t === "H") p.box = [r1(r[2]), r1(r[3]), r1(r[4]), r1(r[5])]; });
  return { file: name, items, plans, hasGT };
}
function split(d) {
  const shapes = {}, items = d.items.map((it) => { const { k, h, tx, ty, _i, _b, ...rest } = it; if (k) shapes[it.id] = h ? [k, h] : [k]; return rest; });
  const plans = d.plans.filter((p) => items.some((i) => i.mb === p.id && shapes[i.id])).map(({ id, title, he, tang, L, G, W, box }) => ({ id, title, he, tang, L, G, W, box }));
  return { items, geo: { plans, shapes } };
}
$("impBtn").onclick = () => { $("impFile").value = ""; $("impFile").click(); };
$("impFile").onchange = async () => {
  const f = $("impFile").files[0]; if (!f) return;
  setNote("Đang đọc " + f.name + "…");
  try { if (!window.XLSX) throw new Error("chưa tải được thư viện đọc Excel");
    const d = parseWB(XLSX, XLSX.read(await f.arrayBuffer(), { type: "array" }), f.name); setNote(""); importDlg(d, f.name.replace(/\.[^.]+$/, "").replace(/^KL_DOT_/i, "")); }
  catch (e) { setNote("Nhập Excel lỗi: " + e.message); }
};
function importDlg(d, defName) {
  const dots = [...new Set(d.items.map((i) => i.dot).filter((x) => x != null))].sort((a, b) => a - b);
  const nShape = d.items.filter((i) => i.k && i.mb).length, ct = d.items.reduce((s, i) => s + (i.ct || 0), 0);
  const nPrice = d.items.filter((i) => i.gb || i.gl).length, nPar = d.items.filter((i) => !i.id.includes(".")).length;
  const mine = HMS.filter((h) => lvHM(h.id) >= 3);
  $("ovl").innerHTML = `<div class="ov"><div class="dlg" role="dialog" aria-modal="true"><h2>Nhập hạng mục từ Excel</h2>
  <p class="empty" style="margin:0">${esc(d.file)} · ${d.items.length} dòng khối lượng · ${nShape} cấu kiện có hình · ${d.plans.length} mặt bằng</p>
  <p class="empty" style="margin:4px 0 0">${d.hasGT ? `Sheet GAN_THEP: cốt thép <b>${nf(ct, 0)} kg</b> · đơn giá BT có ở <b>${nPrice}/${nPar}</b> cấu kiện` : "Không có sheet GAN_THEP (chưa có thép, đơn giá) – chạy macro GanThep trong Excel nếu cần."}</p>
  <label for="hmName">Tên hạng mục</label><input type="text" id="hmName" list="hmNames" value="${esc(HMS.find((h) => h.file === d.file)?.name || defName)}">
  <datalist id="hmNames">${mine.map((h) => `<option value="${esc(h.name)}">`).join("")}</datalist>
  <p class="empty" id="hmWarn"></p><div id="cmp"></div>
  ${dots.length ? `<label>File còn cột Đợt cũ – nhập ngày đổ cho từng đợt để chuyển sang ngày (để trống nếu bỏ qua). Chỉ áp cho cấu kiện chưa có ngày.</label>${dots.map((x) => `<div class="dotrow"><span>Đợt ${x}</span><input type="date" data-dot="${x}"> <small class="empty">${d.items.filter((i) => i.dot === x && !String(i.id).includes(".")).length} cấu kiện</small></div>`).join("")}` : ""}
  <div class="acts"><button class="btn" id="dlgNo">Hủy</button><button class="btn pri" id="dlgOk">Lưu hạng mục</button></div>
  ${isOwner && HMS.length ? `<div class="hmlist"><b style="font-size:14px">Hạng mục đã có</b>${HMS.map((h) => `<div><span>${esc(h.name)} <small class="empty">${esc(h.file || "")}</small></span><button class="btn red" data-del="${esc(h.id)}">Xóa</button></div>`).join("")}</div>` : ""}
  </div></div>`;
  let ok = false, mig = null, cmpFor = null;
  const warn = () => { const n = $("hmName").value.trim(), ex = HMS.find((h) => h.name.toLowerCase() === n.toLowerCase());
    ok = !!n && (ex ? lvHM(ex.id) >= 3 : lvAll() >= 3);
    $("hmWarn").textContent = !n ? "Nhập tên hạng mục." : ex ? (lvHM(ex.id) >= 3 ? "Trùng tên hạng mục đã có: sẽ thay khối lượng, thép, đơn giá & mặt bằng; giữ ngày đã nhập (khớp theo UID) và hệ số." : "Bạn không có quyền Quản trị hạng mục này.") : (lvAll() >= 3 ? "Sẽ tạo hạng mục mới." : "Chỉ chủ dự án / quản trị tất cả hạng mục mới tạo được hạng mục mới. Chọn tên hạng mục bạn quản trị.");
    $("dlgOk").disabled = !ok;
    if (ok && ex) { if (cmpFor !== ex.id) compare(ex); } else { mig = null; cmpFor = null; $("cmp").innerHTML = ""; } };
  // so sánh với dữ liệu đang có: giữ / thêm / mất cấu kiện, chuyển ngày sang khóa mới
  async function compare(ex) {
    cmpFor = ex.id; mig = null; $("dlgOk").disabled = true; $("cmp").innerHTML = `<p class="empty">Đang so sánh với dữ liệu đang có…</p>`;
    try {
      const oldItems = await getKL(ex); if (cmpFor !== ex.id) return;
      const par = (l) => l.filter((i) => !String(i.id).includes(".")), oldP = par(oldItems), newP = par(d.items);
      const oldHasUid = oldP.some((o) => o.uid), byU = {}, byI = {};
      oldP.forEach((o) => { if (o.uid) byU[o.uid] = o; byI[o.id] = o; });
      const pairs = [], used = new Set();
      newP.forEach((n) => { const o = n.uid && oldHasUid ? byU[n.uid] : byI[n.id]; if (o && !used.has(o.id)) { used.add(o.id); pairs.push([o, n]); } });
      const okey = (o) => ukey(o) || o.id, nkey = (n) => ukey(n) || n.id, D = DATES[ex.id] || {}, newD = { b: {}, v: {}, c: {} }, consumed = new Set();
      ["b", "v", "c"].forEach((k) => { const src = D[k] || {};
        pairs.forEach(([o, n]) => { consumed.add(okey(o)); if (src[okey(o)]) newD[k][nkey(n)] = src[okey(o)]; });
        Object.keys(src).forEach((key) => { if (!consumed.has(key) && !(key in newD[k])) newD[k][key] = src[key]; }); });
      const lost = oldP.filter((o) => !used.has(o.id)), lostDated = lost.filter((o) => ["b", "v", "c"].some((k) => (D[k] || {})[okey(o)]));
      const changed = ["b", "v", "c"].some((k) => JSON.stringify(Object.entries(newD[k]).sort()) !== JSON.stringify(Object.entries(D[k] || {}).sort()));
      mig = { ex, newD, changed };
      $("cmp").innerHTML = `<div class="assign" style="margin-top:6px"><b>So với dữ liệu đang có</b> (khớp theo ${oldHasUid ? "UID" : "ID – lần đầu chuyển sang UID"}):<br>
        giữ <b>${pairs.length}</b> · thêm mới <b>${newP.length - pairs.length}</b> · không còn trong file <b>${lost.length}</b>${lostDated.length ? ` · <b style="color:#c0392b">${lostDated.length} cấu kiện đã có ngày bị mất</b>` : ""}
        ${lostDated.length ? `<div class="names">${lostDated.slice(0, 40).map((o) => esc(`${o.ten} (${o.truc || "ID " + o.id})`)).join(", ")}${lostDated.length > 40 ? "…" : ""}<br>Ngày của các cấu kiện này vẫn được lưu riêng nhưng không còn hiện. Kiểm tra lại file nếu không định xóa chúng.</div>` : ""}
        ${!oldHasUid && newP.some((n) => n.uid) ? `<div class="names">Lần này ngày được chuyển từ khóa ID sang UID – hãy dùng đúng file đang dùng (chưa sửa) để chuyển chính xác.</div>` : ""}</div>`;
      $("dlgOk").disabled = !ok;
    } catch (e) { $("cmp").innerHTML = `<p class="empty">Không so sánh được: ${esc(e.message)}</p>`; $("dlgOk").disabled = !ok; }
  }
  $("hmName").oninput = warn; warn();
  $("dlgNo").onclick = () => ($("ovl").innerHTML = "");
  $("ovl").querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!b.classList.contains("arm")) { b.classList.add("arm"); b.textContent = "Bấm lần nữa để xóa hẳn"; return; }
    const h = HMS.find((x) => x.id === b.dataset.del); b.disabled = true; try { await delHM(h); b.closest("div").remove(); } catch (e) { b.textContent = "Lỗi xóa: " + e.code; }
  }));
  $("dlgOk").onclick = async () => {
    if (!ok) return;
    const name = $("hmName").value.trim(), old = HMS.find((h) => h.name.toLowerCase() === name.toLowerCase());
    const id = old ? old.id : (HMS.some((h) => h.id === slug(name)) ? slug(name) + "-" + Date.now().toString(36).slice(-4) : slug(name));
    const dd = {}; $("ovl").querySelectorAll("[data-dot]").forEach((i) => { if (i.value) dd[i.dataset.dot] = i.value; });
    $("dlgOk").disabled = true; $("dlgOk").textContent = "Đang lưu…";
    try {
      const { items, geo } = split(d);
      const meta = { id, name, file: d.file, order: old ? (old.order ?? 0) : HMS.length, nItems: items.length, at: new Date().toISOString(), by: ME };
      await saveHM(meta, items, geo, old);
      if (old && mig && mig.ex.id === old.id && mig.changed) {
        DATES[id] = mig.newD;
        await fs.setDoc(fs.doc(db, "ngay", id), { d: mig.newD.b, dv: mig.newD.v, dc: mig.newD.c, at: new Date().toISOString(), by: ME });
      }
      const have = (DATES[id] || {}).b || {}, p = {};
      items.forEach((i) => { const k = ukey(i) || i.id; if (!String(i.id).includes(".") && i.dot != null && dd[i.dot] && !have[k]) p[k] = dd[i.dot]; });
      if (Object.keys(p).length) await setDates(id, p, "b");
      $("ovl").innerHTML = ""; try { localStorage.setItem("ttbt_hm", id); } catch (e) {}
      HM = null; if (!HMS.find((h) => h.id === id)) setNote("Đã lưu – đang tải hạng mục…");
    } catch (e) { $("dlgOk").disabled = false; $("dlgOk").textContent = "Lưu hạng mục"; $("hmWarn").textContent = "Lỗi lưu: " + (e.code === "permission-denied" ? "không có quyền" : e.code || e.message); }
  };
}
function editProj() {
  $("ovl").innerHTML = `<div class="ov"><div class="dlg"><h2>Thông tin dự án</h2><label for="pTen">Tên công trình</label><input type="text" id="pTen" value="${esc(CFG.ten)}"><label for="pDia">Địa điểm</label><input type="text" id="pDia" value="${esc(CFG.dia)}"><div class="acts"><button class="btn" id="pNo">Hủy</button><button class="btn pri" id="pOk">Lưu</button></div></div></div>`;
  $("pNo").onclick = () => ($("ovl").innerHTML = ""); $("pOk").onclick = () => { saveCfg({ ten: $("pTen").value.trim(), dia: $("pDia").value.trim() }); $("ovl").innerHTML = ""; };
}

// ===================== Quản lý người dùng & phân quyền =====================
$("usersBtn").onclick = openUsers;
let GR = [];
async function loadGrants() {
  if (isOwner) { const s = await fs.getDocs(fs.collection(db, "grants")); GR = s.docs.map((d) => d.data()); return; }
  const adm = HMS.filter((h) => lvHM(h.id) >= 3).map((h) => h.id); GR = [];
  for (const h of adm) { const s = await fs.getDocs(fs.query(fs.collection(db, "grants"), fs.where("hm", "==", h))); GR.push(...s.docs.map((d) => d.data())); }
}
async function openUsers() {
  $("ovl").innerHTML = `<div class="ov"><div class="dlg" style="max-width:1000px"><h2>Người dùng & phân quyền</h2><p class="empty">Đang tải…</p></div></div>`;
  try { await loadGrants(); } catch (e) { $("ovl").innerHTML = ""; setNote("Không đọc được danh sách quyền: " + e.code); return; }
  renderUsers();
}
function renderUsers() {
  const cols = isOwner ? [{ id: "_all", name: "Tất cả hạng mục" }, ...HMS] : HMS.filter((h) => lvHM(h.id) >= 3);
  const emails = [...new Set(GR.map((g) => g.email))].sort();
  const rOf = (em, h) => (GR.find((g) => g.email === em && g.hm === h) || {}).role || "";
  const opts = (cur, h) => { const list = isOwner ? ["", "viewer", "editor", "admin"] : ["", "viewer", "editor"];
    if (!isOwner && cur === "admin") return `<span class="tag">Quản trị</span>`;
    return `<select data-h="${esc(h)}">${list.map((r) => `<option value="${r}"${r === cur ? " selected" : ""}>${r ? ROLE[r] : "—"}</option>`).join("")}</select>`; };
  $("ovl").innerHTML = `<div class="ov"><div class="dlg" style="max-width:1000px"><h2>Người dùng & phân quyền</h2>
  <p class="empty">Chỉ xem: xem mặt bằng, báo cáo, xuất Excel · Cập nhật: nhập ngày đổ · Quản trị: nhập Excel hạng mục, cấp quyền Xem/Cập nhật trong hạng mục đó${isOwner ? " · Cột “Tất cả hạng mục” áp cho mọi hạng mục, kể cả hạng mục thêm sau; quyền riêng từng hạng mục được lấy mức cao hơn." : "."}</p>
  <form id="addU" class="tools" style="margin:12px 0"><input type="text" id="newEm" placeholder="email@gmail.com" style="min-width:240px"><button class="btn pri">Thêm người</button><span class="empty">Người được thêm đăng nhập bằng đúng email này (Google).</span></form>
  <div class="scroll"><table class="tbl utbl"><thead><tr><th>Email</th>${cols.map((c) => `<th>${esc(c.name)}</th>`).join("")}<th></th></tr></thead>
  <tbody>${emails.map((em) => `<tr data-em="${esc(em)}"><td>${esc(em)}</td>${cols.map((c) => `<td>${opts(rOf(em, c.id), c.id)}</td>`).join("")}<td>${isOwner ? `<button class="btn red" data-rm="1">Xóa</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="${cols.length + 2}" class="empty">Chưa có ai.</td></tr>`}</tbody></table></div>
  <div class="acts"><button class="btn" id="uClose">Đóng</button></div></div></div>`;
  $("uClose").onclick = () => ($("ovl").innerHTML = "");
  $("addU").onsubmit = (e) => { e.preventDefault(); const em = $("newEm").value.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { flash($("addU").querySelector("button"), "Email không hợp lệ"); return; }
    if (!emails.includes(em)) { GR.push({ email: em, hm: "__none", role: "" }); } renderUsers(); };
  $("ovl").querySelectorAll("select[data-h]").forEach((s) => (s.onchange = async () => {
    const em = s.closest("tr").dataset.em, h = s.dataset.h, role = s.value, ref = fs.doc(db, "grants", h + "__" + em);
    s.disabled = true;
    try { if (role) await fs.setDoc(ref, { hm: h, email: em, role, by: ME, at: new Date().toISOString() }); else await fs.deleteDoc(ref);
      GR = GR.filter((g) => !(g.email === em && g.hm === h)); if (role) GR.push({ hm: h, email: em, role }); s.disabled = false; }
    catch (e) { s.disabled = false; setNote("Không lưu được quyền: " + e.code); }
  }));
  $("ovl").querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
    if (!b.classList.contains("arm")) { b.classList.add("arm"); b.textContent = "Bấm lần nữa"; return; }
    const em = b.closest("tr").dataset.em;
    for (const g of GR.filter((x) => x.email === em && x.hm !== "__none")) await fs.deleteDoc(fs.doc(db, "grants", g.hm + "__" + em)).catch(() => {});
    GR = GR.filter((x) => x.email !== em); renderUsers();
  }));
}

// ===================== Khởi động =====================
try { const p = JSON.parse(localStorage.getItem("ttbt_per") || "null"); if (p) { $("dFrom").value = p[0]; $("dTo").value = p[1]; } } catch (e) {}
if (!$("dTo").value) { $("dFrom").value = today().slice(0, 8) + "01"; $("dTo").value = today(); }
