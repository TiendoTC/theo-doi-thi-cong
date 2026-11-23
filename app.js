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
let HMS = [], DATES = {}, CFG = { ten: "Tên công trình", dia: "Địa điểm" };
const KL = {}, GEO = {}, subs = { grants: null, hmAll: null, hm: {}, ngay: {}, cfg: null };
const lvAll = () => isOwner ? 3 : (LV[MYG._all] || 0);
const lvHM = (id) => isOwner ? 3 : Math.max(LV[MYG[id]] || 0, LV[MYG._all] || 0);
const canEdit = () => HM && lvHM(HM.id) >= 2;
const isAnyAdmin = () => isOwner || lvAll() >= 3 || Object.values(MYG).includes("admin");

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
  off(subs.grants); off(subs.hmAll); off(subs.cfg); Object.values(subs.hm).forEach(off); Object.values(subs.ngay).forEach(off);
  subs.grants = subs.hmAll = subs.cfg = null; subs.hm = {}; subs.ngay = {};
  MYG = {}; HMS = []; DATES = {}; HM = null;
}
function start() {
  subs.cfg = fs.onSnapshot(fs.doc(db, "cfg", "du-an"), (d) => { if (d.exists()) CFG = { ...CFG, ...d.data() }; renderTitle(); }, () => {});
  subs.grants = fs.onSnapshot(fs.query(fs.collection(db, "grants"), fs.where("email", "==", ME)), (s) => {
    MYG = {}; s.docs.forEach((d) => { const g = d.data(); MYG[g.hm] = g.role; });
    afterGrants();
  }, (e) => setNote("Lỗi đọc quyền: " + e.code));
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
  ids.forEach((k) => { if (!subs.ngay[k]) subs.ngay[k] = fs.onSnapshot(fs.doc(db, "ngay", k), (d) => {
    const o = {}; const dd = (d.exists() && d.data().d) || {}; Object.keys(dd).forEach((x) => { if (dd[x]) o[x] = dd[x]; }); DATES[k] = o; refreshAll(); }, () => {}); });
}
function setNote(t) { $("note").textContent = t; }

// ===================== Đọc / ghi dữ liệu =====================
async function loadChunks(meta, kind) {
  const s = await fs.getDocs(fs.collection(db, "hm", meta.id, kind));
  const docs = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.v === meta.v).sort((a, b) => a.id < b.id ? -1 : 1);
  if (docs.length !== meta[kind + "N"]) throw new Error("dữ liệu hạng mục đang được cập nhật, thử lại sau ít giây");
  return JSON.parse(docs.map((d) => d.s).join(""));
}
async function getKL(meta) { if (!KL[meta.id] || KL[meta.id].v !== meta.v) KL[meta.id] = { v: meta.v, items: await loadChunks(meta, "kl") }; return KL[meta.id].items; }
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
  await fs.deleteDoc(fs.doc(db, "hm", meta.id));
}
async function setDates(hmId, patch) {
  const loc = { ...(DATES[hmId] || {}) }; Object.entries(patch).forEach(([k, v]) => v ? (loc[k] = v) : delete loc[k]); DATES[hmId] = loc; refreshAll();
  const d = {}; Object.entries(patch).forEach(([k, v]) => (d[k] = v || fs.deleteField()));
  try { await fs.setDoc(fs.doc(db, "ngay", hmId), { d, at: new Date().toISOString(), by: ME }, { merge: true }); }
  catch (e) { setNote("Không lưu được ngày: " + (e.code === "permission-denied" ? "bạn không có quyền cập nhật hạng mục này" : e.code || e.message)); }
}
async function saveCfg(o) { try { await fs.setDoc(fs.doc(db, "cfg", "du-an"), { ...CFG, ...o }); } catch (e) { setNote("Không lưu được: " + e.code); } }

// ===================== Trạng thái giao diện =====================
let HM = null, ITEMS = [], BYID = {}, G = null, P = null, vb = null, view = "vMap", scope = "cur";
const sel = new Set(); let multi = false, boxMode = false, listN = 300;
const dOf = (id) => (DATES[HM && HM.id] || {})[rootOf(id)] || null;
const per = () => ({ a: $("dFrom").value || "0000-01-01", b: $("dTo").value || "9999-12-31" });
function status(d) { const { a, b } = per(); if (!d || d > b) return 0; return d < a ? 1 : 2; }
const COL = ["var(--none)", "var(--done)", "var(--now)"];

function renderTitle() {
  const t = view === "vRep" ? "Báo cáo khối lượng bê tông – " + (scope === "all" ? "toàn dự án" : (HM ? HM.name : "")) : "Theo dõi công tác thi công " + (P ? planLabel(P) : "bê tông") + (HM ? " " + HM.name : "");
  $("title").textContent = t;
  $("proj").innerHTML = `Công trình: <b>${esc(CFG.ten)}</b> · ${esc(CFG.dia)}${isOwner ? ' <button class="edit" id="editProj">Sửa</button>' : ""}${HM ? ` · <span class="tag">${esc(ROLE[["", "viewer", "editor", "admin"][lvHM(HM.id)]] || "")}</span>` : ""}`;
  const b = $("editProj"); if (b) b.onclick = editProj;
}
function onHM() {
  const cur = HM && HMS.find((h) => h.id === HM.id);
  $("hmSel").innerHTML = HMS.length ? HMS.map((h) => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join("") : `<option value="">(chưa có hạng mục)</option>`;
  if (!HMS.length) { HM = null; ITEMS = []; showEmpty(); renderTitle(); return; }
  let saved = null; try { saved = localStorage.getItem("ttbt_hm"); } catch (e) {}
  const want = cur || HMS.find((h) => h.id === saved) || HMS[0];
  $("hmSel").value = want.id;
  if (!HM || HM.id !== want.id || HM.v !== want.v) openHM(want.id); else { HM = want; renderTitle(); }
}
$("hmSel").onchange = () => openHM($("hmSel").value);
async function openHM(id) {
  const meta = HMS.find((h) => h.id === id); if (!meta) return;
  HM = meta; sel.clear(); try { localStorage.setItem("ttbt_hm", id); } catch (e) {}
  $("mapMsg").hidden = false; $("mapMsg").innerHTML = `<p class="empty">Đang tải ${esc(meta.name)}…</p>`;
  try {
    ITEMS = await getKL(meta); if (HM !== meta) return;
    BYID = {}; ITEMS.forEach((it, i) => { it._i = i; BYID[it.id] = it; });
    G = await getGEO(meta); if (HM !== meta) return;
    $("mbSel").innerHTML = G.plans.map((p) => `<option value="${esc(p.id)}">${esc(planLabel(p))}</option>`).join("");
    const firstDone = G.plans.find((p) => ITEMS.some((i) => i.mb === p.id && dOf(i.id))) || G.plans[0];
    const keep = P && G.plans.find((p) => p.id === P.id);
    if (G.plans.length) showPlan((keep || firstDone).id); else { $("map").innerHTML = ""; $("mapMsg").innerHTML = `<p class="empty">Hạng mục này không có mặt bằng – dùng tab Danh sách.</p>`; P = null; }
    initListFilters(); renderTitle(); refreshAll();
  } catch (e) { $("mapMsg").innerHTML = `<p class="empty">Không tải được hạng mục: ${esc(e.message)}</p>`; }
}
function showEmpty() {
  $("map").innerHTML = ""; $("mapMsg").hidden = false; P = null;
  $("mapMsg").innerHTML = lvAll() >= 3 ? `<div><h2 style="margin:0 0 6px">Chưa có hạng mục nào</h2><p class="empty">Nhập file Excel KL_DOT_*.xlsx (có sheet DANH_SACH, MB_…, _NEN) cho từng hạng mục.</p><p><button class="btn pri" id="e1">Nhập Excel</button></p></div>`
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
  $("mbSel").value = P.id; $("mapMsg").hidden = true;
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
  $("cks").querySelectorAll(".ck").forEach((el) => {
    const id = el.dataset.id, st = status(dOf(id));
    el.style.fill = COL[st]; el.style.fillOpacity = st ? .85 : 1; el.classList.toggle("sel", sel.has(id));
  });
  labels();
}
function labels() {
  const m = $("lbl").value, g = $("lbs"); if (!g || !P) return; if (!m) { g.innerHTML = ""; return; }
  const W = P._B.w;
  g.innerHTML = P._its.map((it) => {
    const b = it._b, bw = b.x1 - b.x0, bh = b.y1 - b.y0, tall = bh > bw * 1.8, d = dOf(it.id);
    const t = m === "ten" ? it.ten : m === "id" ? it.id : m === "truc" ? it.truc : (d && status(d) ? fds(d) : "");
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
  if (!vb || e.target.closest(".zoom")) return;
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
$("multiBtn").onclick = () => { multi = !multi; $("multiBtn").classList.toggle("on", multi); };
$("boxBtn").onclick = () => { boxMode = !boxMode; $("boxBtn").classList.toggle("on", boxMode); box.classList.toggle("boxm", boxMode); };
$("clrBtn").onclick = () => { sel.clear(); refreshSel(); };

// ===================== Khối lượng & ô nhập ngày =====================
function withSubs(ids) { const set = new Set(ids); return ITEMS.filter((i) => set.has(rootOf(i.id))); }
function sum(list) { const s = { n: 0, v: 0, vk: 0 }; list.forEach((i) => { if (!String(i.id).includes(".")) s.n++; s.v += i.v || 0; s.vk += vkOf(i); }); return s; }
function assignHTML(where) {
  const ids = [...sel], its = ids.map((i) => BYID[i]).filter(Boolean), s = sum(withSubs(ids)), w = canEdit();
  if (!its.length) return `<div class="assign"><p class="empty" style="margin:0">${where === "map" ? "Bấm một cấu kiện (Ctrl/Shift hoặc “Chọn nhiều” để chọn thêm, “Quét chọn” để khoanh vùng)" : "Đánh dấu hộp kiểm ở các dòng"}${w ? " rồi nhập ngày đổ bê tông." : ". Bạn chỉ có quyền xem hạng mục này."}</p></div>`;
  const ds = [...new Set(its.map((i) => dOf(i.id) || ""))];
  const cnt = {}; its.forEach((i) => (cnt[i.ten] = (cnt[i.ten] || 0) + 1));
  const def = ds.length === 1 && ds[0] ? ds[0] : ($("dTo").value && $("dTo").value <= today() ? $("dTo").value : today());
  return `<div class="assign"><div style="display:flex;gap:16px;flex-wrap:wrap"><div><div class="empty">Đã chọn</div><div class="big">${its.length}</div></div><div><div class="empty">Bê tông</div><div class="big">${nf(s.v)} m³</div></div><div><div class="empty">Ván khuôn</div><div class="big">${nf(s.vk, 2)} m²</div></div></div>
  <div class="names">${Object.entries(cnt).map(([k, n]) => esc(k) + (n > 1 ? " ×" + n : "")).join(", ")}${ds.length > 1 ? " · <b>nhiều ngày khác nhau</b>" : ds[0] ? " · đổ ngày <b>" + fd(ds[0]) + "</b>" : " · <b>chưa đổ</b>"}</div>
  ${w ? `<div class="acts"><input type="date" class="aDate" value="${def}" aria-label="Ngày đổ bê tông"><button class="btn pri aSet">Ghi ngày đổ</button><button class="btn aClr"${ds.some(Boolean) ? "" : " disabled"}>Xóa ngày</button></div>` : ""}</div>`;
}
function bindAssign(root) {
  const b = root.querySelector(".aSet"); if (!b) return;
  b.onclick = () => { const d = root.querySelector(".aDate").value; if (!d) return; const p = {}; sel.forEach((id) => (p[rootOf(id)] = d)); setDates(HM.id, p); flash(b, "Đã ghi ✓"); };
  root.querySelector(".aClr").onclick = () => { const p = {}; sel.forEach((id) => (p[rootOf(id)] = null)); setDates(HM.id, p); };
}
function renderAside() {
  if (!P || !HM) { if (HM && !P) { $("aside").innerHTML = `<h2>${esc(HM.name)}</h2>`; } return; }
  const all = ITEMS.filter((i) => (BYID[rootOf(i.id)] || {}).mb === P.id);
  const g = [0, 1, 2].map((st) => sum(all.filter((i) => status(dOf(i.id)) === st))), tot = sum(all), { a, b } = per();
  const lab = ["Chưa đổ", "Đã đổ trước kỳ", "Đổ trong kỳ"];
  let h = `<h2>${esc(planLabel(P))}</h2><p class="empty" style="margin:0">${esc(HM.name)} · ${P._its.length} cấu kiện trên mặt bằng</p>
  <h3>Chọn${canEdit() ? " và nhập ngày đổ bê tông" : " cấu kiện"}</h3>${assignHTML("map")}`;
  const one = sel.size === 1 && BYID[[...sel][0]];
  if (one) { const it = one, sb = ITEMS.filter((x) => rootOf(x.id) === it.id && x.id !== it.id);
    h += `<h3>Chi tiết cấu kiện</h3><div class="kv"><span>ID / trục</span><span>${esc(it.id)} · ${esc(it.truc)}</span><span>Loại</span><span>${esc(LN[it.loai] || it.loai)} ${esc(tangName(it.tang))}</span>
    <span>Dài × rộng × cao</span><span>${[it.dai, it.rong, it.cao].map((v) => v == null ? "–" : nf(v, 2)).join(" × ")} m</span><span>Diện tích</span><span>${nf(it.dt)} m²</span>
    <span>Thể tích BT</span><span><b>${nf(it.v)} m³</b></span><span>VK thành / đáy</span><span>${nf(it.vkt, 2)} / ${it.vkd ? nf(it.vkd, 2) : "–"} m²</span>${sb.map((x) => `<span>${esc(x.id)} ${esc(x.ten)}</span><span>${nf(x.v)} m³</span>`).join("")}</div>`; }
  h += `<h3>Kỳ ${a > "0000" ? fd(a) : "đầu"} → ${b < "9999" ? fd(b) : "nay"} · mặt bằng này</h3><table class="leg"><tr><td></td><td class="n">SL</td><td class="n">BT m³</td><td class="n">VK m²</td></tr>
  ${[1, 2, 0].map((st) => `<tr><td><span class="sw" style="background:${COL[st]}"></span>${lab[st]}</td><td class="n">${g[st].n}</td><td class="n">${nf(g[st].v)}</td><td class="n">${nf(g[st].vk, 2)}</td></tr>`).join("")}
  <tr><td><b>Cộng</b></td><td class="n"><b>${tot.n}</b></td><td class="n"><b>${nf(tot.v)}</b></td><td class="n"><b>${nf(tot.vk, 2)}</b></td></tr></table>
  <div class="meter"><i style="width:${(g[1].v / (tot.v || 1)) * 100}%;background:var(--done)"></i><i style="width:${(g[2].v / (tot.v || 1)) * 100}%;background:var(--now)"></i></div>
  <p class="empty">Lũy kế đến cuối kỳ: ${nf(((g[1].v + g[2].v) / (tot.v || 1)) * 100, 1)}% khối lượng bê tông</p>`;
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
document.querySelectorAll("#scope button").forEach((b) => (b.onclick = () => { scope = b.dataset.s; document.querySelectorAll("#scope button").forEach((x) => x.classList.toggle("on", x === b)); renderTitle(); renderRep(); }));

// ===================== Báo cáo =====================
function repRows(items, dates) {
  const { a, b } = per(), rows = {};
  items.forEach((it) => {
    const k = rowKey(it), d = dates[rootOf(it.id)] || null, r = rows[k] || (rows[k] = { k, n: 0, bt: 0, pre: 0, inn: 0, vk: 0, vkin: 0, vkc: 0 });
    const v = it.v || 0, w = vkOf(it); if (!String(it.id).includes(".")) r.n++;
    r.bt += v; r.vk += w;
    if (d && d <= b) { if (d < a) r.pre += v; else { r.inn += v; r.vkin += w; } r.vkc += w; }
  });
  return Object.values(rows).sort((x, y) => rowSort(x.k, y.k));
}
function addRow(t, r) { ["n", "bt", "pre", "inn", "vk", "vkin", "vkc"].forEach((f) => (t[f] = (t[f] || 0) + r[f])); return t; }
const trRep = (r, label, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="n">${r.n}</td><td class="n">${nf(r.bt)}</td><td class="n">${nf(r.pre)}</td><td class="n"><b>${nf(r.inn)}</b></td><td class="n">${nf(r.pre + r.inn)}</td><td class="n">${nf(r.bt - r.pre - r.inn)}</td><td class="n">${nf(((r.pre + r.inn) / (r.bt || 1)) * 100, 1)}%</td><td class="n">${nf(r.vk, 2)}</td><td class="n"><b>${nf(r.vkin, 2)}</b></td><td class="n">${nf(r.vkc, 2)}</td></tr>`;
let REP = null;
async function renderRep() {
  if (view !== "vRep") return;
  const page = $("repPage"); if (!HMS.length) { page.innerHTML = `<p class="empty">Chưa có hạng mục nào để báo cáo.</p>`; return; }
  const list = scope === "all" ? HMS : HMS.filter((h) => HM && h.id === HM.id);
  if (!list.length) return;
  if (list.some((h) => !KL[h.id] || KL[h.id].v !== h.v)) { page.innerHTML = `<p class="empty">Đang tải khối lượng ${list.length} hạng mục…</p>`; try { for (const h of list) await getKL(h); } catch (e) { page.innerHTML = `<p class="empty">Lỗi: ${esc(e.message)}</p>`; return; } }
  const { a, b } = per(), groups = list.map((h) => ({ h, rows: repRows(KL[h.id].items, DATES[h.id] || {}) }));
  const T = {}; groups.forEach((g) => g.rows.forEach((r) => addRow(T, r)));
  const detail = [];
  list.forEach((h) => { const dts = DATES[h.id] || {}, m = {};
    KL[h.id].items.forEach((it) => { const d = dts[rootOf(it.id)]; if (!d || d < a || d > b) return; const k = d + "|" + rowKey(it); const r = m[k] || (m[k] = { d, h, k: rowKey(it), n: 0, v: 0, vk: 0, c: {} }); r.v += it.v || 0; r.vk += vkOf(it); if (!String(it.id).includes(".")) { r.n++; r.c[it.ten] = (r.c[it.ten] || 0) + 1; } });
    detail.push(...Object.values(m)); });
  detail.sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : rowSort(x.k, y.k));
  REP = { groups, T, detail, list };
  const days = new Set(detail.map((r) => r.d)).size;
  const head = `<thead><tr><th rowspan="2">Hạng mục / cấu kiện</th><th rowspan="2">SL</th><th colspan="6">Bê tông (m³)</th><th colspan="3">Ván khuôn (m²)</th></tr><tr><th>Tổng</th><th>Trước kỳ</th><th>Trong kỳ</th><th>Lũy kế</th><th>Còn lại</th><th>% HT</th><th>Tổng</th><th>Trong kỳ</th><th>Lũy kế</th></tr></thead>`;
  let body = "";
  groups.forEach((g) => { const st = {}; g.rows.forEach((r) => addRow(st, r));
    if (list.length > 1) body += trRep(st, esc(g.h.name), "hm");
    body += g.rows.map((r) => trRep(r, (list.length > 1 ? "&nbsp;&nbsp;" : "") + esc(rowLabel(r.k)))).join(""); });
  body += trRep(T, list.length > 1 ? "Tổng cộng dự án" : "Tổng cộng " + esc(list[0].name), "tot");
  page.innerHTML = `<h2>Kỳ ${a > "0000" ? fd(a) : "khởi công"} – ${b < "9999" ? fd(b) : "nay"}: đổ ${nf(T.inn, 2)} m³ bê tông, ván khuôn ${nf(T.vkin, 2)} m²</h2>
  <p class="lead">${esc(scope === "all" ? "Toàn dự án · " + list.length + " hạng mục bạn được xem" : list[0].name)} · ${days} ngày có đổ bê tông trong kỳ. Ván khuôn tính theo cấu kiện đã đổ bê tông.</p>
  <div class="cards"><div class="card"><div class="t">Bê tông trong kỳ</div><div class="v">${nf(T.inn, 2)} m³</div></div><div class="card"><div class="t">Lũy kế đến ${b < "9999" ? fd(b) : "nay"}</div><div class="v">${nf(T.pre + T.inn, 2)} m³</div><div class="t">${nf(((T.pre + T.inn) / (T.bt || 1)) * 100, 1)}% của ${nf(T.bt, 2)} m³</div></div><div class="card"><div class="t">Ván khuôn trong kỳ</div><div class="v">${nf(T.vkin, 2)} m²</div><div class="t">Lũy kế ${nf(T.vkc, 2)} m²</div></div><div class="card"><div class="t">Bê tông còn lại</div><div class="v">${nf(T.bt - T.pre - T.inn, 2)} m³</div></div></div>
  <div class="tools"><b>Tổng hợp khối lượng theo kỳ</b><span class="sp"></span><button class="btn" id="cpRep">Sao chép sang Excel</button><button class="btn" id="xRep">Xuất Excel</button></div>
  <div class="scroll"><table class="tbl" id="repTbl">${head}<tbody>${body}</tbody></table></div>
  <div class="tools"><b>Chi tiết đổ bê tông trong kỳ</b><span class="sp"></span><button class="btn" id="cpDet">Sao chép</button></div>
  ${detail.length ? `<div class="scroll"><table class="tbl" id="detTbl"><thead><tr><th>Ngày đổ</th>${list.length > 1 ? "<th>Hạng mục</th>" : ""}<th>Cấu kiện</th><th>SL</th><th>Tên cấu kiện</th><th>BT (m³)</th><th>VK (m²)</th></tr></thead><tbody>${detail.map((r) => `<tr><td>${fd(r.d)}</td>${list.length > 1 ? `<td>${esc(r.h.name)}</td>` : ""}<td>${esc(rowLabel(r.k))}</td><td class="n">${r.n}</td><td>${esc(Object.entries(r.c).map(([k, n]) => k + (n > 1 ? " ×" + n : "")).join(", "))}</td><td class="n">${nf(r.v)}</td><td class="n">${nf(r.vk, 2)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">Không có cấu kiện nào đổ bê tông trong kỳ này.</p>`}`;
  $("cpRep").onclick = (e) => copyTable($("repTbl"), e.target); $("cpDet").onclick = (e) => $("detTbl") && copyTable($("detTbl"), e.target);
  $("xRep").onclick = exportExcel;
}

// ===================== Danh sách (hộp kiểm) =====================
function initListFilters() {
  const ks = [...new Set(ITEMS.filter((i) => !String(i.id).includes(".")).map(rowKey))].sort(rowSort);
  $("fGrp").innerHTML = `<option value="">Mọi cấu kiện</option>` + ks.map((k) => `<option value="${esc(k)}">${esc(rowLabel(k))}</option>`).join("");
}
function listItems() {
  const q = $("q").value.trim().toLowerCase(), g = $("fGrp").value, f = $("fSt").value;
  return ITEMS.filter((i) => !String(i.id).includes(".") && (!g || rowKey(i) === g) && (!q || (i.id + " " + i.ten + " " + i.truc).toLowerCase().includes(q)) &&
    (!f || (f === "no" ? !dOf(i.id) : f === "yes" ? !!dOf(i.id) : status(dOf(i.id)) === 2)));
}
function renderList() {
  if (view !== "vList" || !HM) return;
  const f = listItems(), allOn = f.length && f.every((i) => sel.has(i.id));
  const subV = {}; ITEMS.forEach((i) => { const r = rootOf(i.id); subV[r] = subV[r] || { v: 0, vk: 0 }; subV[r].v += i.v || 0; subV[r].vk += vkOf(i); });
  $("listTbl").innerHTML = `<thead><tr><th class="c"><input type="checkbox" id="chkAll" ${allOn ? "checked" : ""} aria-label="Chọn tất cả dòng đang lọc"></th><th>ID</th><th>Cấu kiện</th><th>Tên</th><th>Trục</th><th>Ngày đổ</th><th>BT m³</th><th>VK m²</th><th>Mặt bằng</th></tr></thead><tbody>${f.slice(0, listN).map((i) => { const d = dOf(i.id), st = status(d), on = sel.has(i.id);
    return `<tr class="${on ? "chk" : ""}" data-id="${esc(i.id)}"><td class="c"><input type="checkbox" ${on ? "checked" : ""} aria-label="Chọn ${esc(i.ten)}"></td><td>${esc(i.id)}</td><td>${esc(rowLabel(rowKey(i)))}</td><td>${esc(i.ten)}</td><td>${esc(i.truc)}</td><td>${d ? `<span class="sw" style="background:${COL[st]}"></span>${fd(d)}` : ""}</td><td class="n">${nf(subV[i.id].v)}</td><td class="n">${nf(subV[i.id].vk, 2)}</td><td>${i.mb && G && G.shapes[i.id] ? `<button class="edit" data-go="${esc(i.id)}">Xem</button>` : ""}</td></tr>`; }).join("")}</tbody>`;
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
  renderTitle(); if (v === "vMap" && P) requestAnimationFrame(fit); renderRep(); renderList();
}
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => tab(b.dataset.v)));
async function copyTable(t, btn) { const tsv = [...t.rows].map((r) => [...r.cells].map((c) => c.textContent.trim()).join("\t")).join("\n"); try { await navigator.clipboard.writeText(tsv); flash(btn, "Đã sao chép ✓"); } catch (e) { flash(btn, "Không sao chép được"); } }
function flash(b, t) { const o = b.textContent; b.textContent = t; setTimeout(() => (b.textContent = o), 1500); }

// ===================== Xuất Excel (kiêm sao lưu ngày đổ) =====================
async function exportExcel(e) {
  const btn = e && e.target;
  if (!window.XLSX) { if (btn) flash(btn, "Chưa tải được thư viện Excel"); return; }
  if (view !== "vRep" || !REP) { const v = view; view = "vRep"; await renderRep(); view = v; }
  if (!REP) return;
  const { a, b } = per(), X = XLSX, wb = X.utils.book_new(), R = REP;
  const t1 = [[`BÁO CÁO KHỐI LƯỢNG BÊ TÔNG KỲ ${a > "0000" ? fd(a) : ""} - ${b < "9999" ? fd(b) : ""}`], [CFG.ten], [], ["Hạng mục / cấu kiện", "SL", "BT tổng", "BT trước kỳ", "BT trong kỳ", "BT lũy kế", "BT còn lại", "% HT", "VK tổng", "VK trong kỳ", "VK lũy kế"]];
  const rr = (r, l) => [l, r.n, +r.bt.toFixed(3), +r.pre.toFixed(3), +r.inn.toFixed(3), +(r.pre + r.inn).toFixed(3), +(r.bt - r.pre - r.inn).toFixed(3), +(((r.pre + r.inn) / (r.bt || 1))).toFixed(4), +r.vk.toFixed(3), +r.vkin.toFixed(3), +r.vkc.toFixed(3)];
  R.groups.forEach((g) => { const st = {}; g.rows.forEach((r) => addRow(st, r)); t1.push(rr(st, g.h.name)); g.rows.forEach((r) => t1.push(rr(r, "   " + rowLabel(r.k)))); });
  t1.push(rr(R.T, "TỔNG CỘNG"));
  const s1 = X.utils.aoa_to_sheet(t1); s1["!cols"] = [{ wch: 30 }, ...Array(10).fill({ wch: 12 })]; X.utils.book_append_sheet(wb, s1, "TongHop");
  const t2 = [["Ngày đổ", "Hạng mục", "Cấu kiện", "SL", "Tên", "BT (m3)", "VK (m2)"], ...R.detail.map((r) => [fd(r.d), r.h.name, rowLabel(r.k), r.n, Object.entries(r.c).map(([k, n]) => k + (n > 1 ? " x" + n : "")).join(", "), +r.v.toFixed(3), +r.vk.toFixed(3)])];
  const s2 = X.utils.aoa_to_sheet(t2); s2["!cols"] = [{ wch: 11 }, { wch: 18 }, { wch: 20 }, { wch: 6 }, { wch: 50 }, { wch: 10 }, { wch: 10 }]; X.utils.book_append_sheet(wb, s2, "ChiTietKy");
  // DanhSach: ngày đổ lũy kế của mọi cấu kiện (dùng làm bản sao lưu, nạp lại bằng nút "Nạp ngày từ file")
  const t3 = [["Hạng mục", "ID", "Loại", "Tầng", "Tên", "Trục", "BT (m3)", "VK (m2)", "Ngày đổ", "Mã hạng mục"]];
  R.list.forEach((h) => { const dts = DATES[h.id] || {}; KL[h.id].items.forEach((i) => t3.push([h.name, i.id, LN[i.loai] || i.loai, tangName(i.tang), i.ten, i.truc, i.v || 0, +vkOf(i).toFixed(3), fd(dts[rootOf(i.id)] || ""), h.id])); });
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(t3), "DanhSach");
  X.writeFile(wb, `BaoCao_BT_${(a > "0000" ? a : "dau").replace(/-/g, "")}_${(b < "9999" ? b : today()).replace(/-/g, "")}.xlsx`);
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
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }).slice(1), plan = {};
    rows.forEach((r) => {
      const h = HMS.find((x) => x.id === r[9]) || HMS.find((x) => x.name === r[0]); if (!h || lvHM(h.id) < 2) return;
      const id = rootOf(r[1]); if (!id || String(r[1]).includes(".")) return;
      const m = String(r[8]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return;
      const d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      if ((DATES[h.id] || {})[id] === d) return;
      (plan[h.id] = plan[h.id] || {})[id] = d;
    });
    const ks = Object.keys(plan);
    $("ovl").innerHTML = `<div class="ov"><div class="dlg"><h2>Nạp ngày đổ từ file</h2><p class="empty">${esc(f.name)}</p>
    ${ks.length ? `<p>Sẽ ghi ngày cho:</p><ul>${ks.map((k) => `<li>${esc(HMS.find((h) => h.id === k).name)}: ${Object.keys(plan[k]).length} cấu kiện</li>`).join("")}</ul><p class="empty">Chỉ ghi các ngày khác với hiện tại; không xóa ngày đang có.</p>` : `<p>Không có ngày nào cần cập nhật (hoặc bạn không có quyền cập nhật các hạng mục trong file).</p>`}
    <div class="acts"><button class="btn" id="rNo">Đóng</button>${ks.length ? `<button class="btn pri" id="rOk">Ghi ngày</button>` : ""}</div></div></div>`;
    $("rNo").onclick = () => ($("ovl").innerHTML = "");
    if (ks.length) $("rOk").onclick = async () => { $("rOk").disabled = true; for (const k of ks) await setDates(k, plan[k]); $("ovl").innerHTML = ""; setNote("Đã nạp ngày từ file"); };
  } catch (e) { setNote("Nạp ngày lỗi: " + e.message); }
};

// ===================== Nhập Excel hạng mục =====================
function parseWB(X, wb, name) {
  const rows = (n) => wb.Sheets[n] ? X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }) : [];
  const num = (v) => (v === null || v === "" || isNaN(+v)) ? null : Math.round(+v * 1e4) / 1e4;
  const r1 = (v) => (v === null || v === "" || isNaN(+v)) ? null : Math.round(+v * 10) / 10;
  const poly = (s) => { if (!s) return null; const rs = String(s).split("|").map((x) => { const o = []; x.replace(/^#/, "").split(";").forEach((p) => { const a = p.trim().split(/\s+/); if (a.length > 1 && !isNaN(+a[0]) && !isNaN(+a[1])) o.push(r1(a[0]), r1(a[1])); }); return o.length ? o : null; }).filter(Boolean); return rs.length ? rs : null; };
  if (!wb.Sheets.DANH_SACH) throw new Error("File không có sheet DANH_SACH");
  const items = rows("DANH_SACH").slice(4).filter((r) => r[0] !== null && r[0] !== "").map((r) => ({ id: String(r[0]), loai: r[1] || "", tang: r[2] || "", ten: String(r[3] ?? "").trim(), sl: num(r[4]), dai: num(r[5]), rong: num(r[6]), cao: num(r[7]), cv: num(r[10]), dt: num(r[11]), v: num(r[12]), vkt: num(r[13]), vkd: num(r[14]), dot: typeof r[15] === "number" ? Math.trunc(r[15]) : (r[15] && !isNaN(+r[15]) ? +r[15] : null), mb: r[16] || "", k: poly(r[21]), h: poly(r[22]), truc: r[26] || "", cd: r[28] ?? null }));
  const plans = wb.SheetNames.filter((n) => n.startsWith("MB_")).map((n) => { const a = rows(n); return { id: n, title: (a[0] || [])[0] || n, he: (a[0] || [])[25] || "", tang: (a[1] || [])[25] || "", L: [], G: [], W: [], box: null }; });
  const pm = Object.fromEntries(plans.map((p) => [p.id, p]));
  rows("_NEN").slice(1).forEach((r) => { const p = pm[r[0]]; if (!p) return; const t = r[1];
    if (t === "L") p.L.push(r1(r[2]), r1(r[3]), r1(r[4]), r1(r[5])); else if (t === "G") p.G.push(r1(r[2]), r1(r[3]), r1(r[4]), r1(r[5]), +r[6] || 0);
    else if (t === "W") p.W.push([r1(r[2]), r1(r[3]), r1(r[4]) || 0, r1(r[5]) || 300, String(r[6] ?? "")]); else if (t === "H") p.box = [r1(r[2]), r1(r[3]), r1(r[4]), r1(r[5])]; });
  return { file: name, items, plans };
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
  const nShape = d.items.filter((i) => i.k && i.mb).length;
  const mine = HMS.filter((h) => lvHM(h.id) >= 3);
  $("ovl").innerHTML = `<div class="ov"><div class="dlg" role="dialog" aria-modal="true"><h2>Nhập hạng mục từ Excel</h2>
  <p class="empty" style="margin:0">${esc(d.file)} · ${d.items.length} dòng khối lượng · ${nShape} cấu kiện có hình · ${d.plans.length} mặt bằng</p>
  <label for="hmName">Tên hạng mục</label><input type="text" id="hmName" list="hmNames" value="${esc(HMS.find((h) => h.file === d.file)?.name || defName)}">
  <datalist id="hmNames">${mine.map((h) => `<option value="${esc(h.name)}">`).join("")}</datalist>
  <p class="empty" id="hmWarn"></p>
  ${dots.length ? `<label>File còn cột Đợt cũ – nhập ngày đổ cho từng đợt để chuyển sang ngày (để trống nếu bỏ qua). Chỉ áp cho cấu kiện chưa có ngày.</label>${dots.map((x) => `<div class="dotrow"><span>Đợt ${x}</span><input type="date" data-dot="${x}"> <small class="empty">${d.items.filter((i) => i.dot === x && !String(i.id).includes(".")).length} cấu kiện</small></div>`).join("")}` : ""}
  <div class="acts"><button class="btn" id="dlgNo">Hủy</button><button class="btn pri" id="dlgOk">Lưu hạng mục</button></div>
  ${isOwner && HMS.length ? `<div class="hmlist"><b style="font-size:14px">Hạng mục đã có</b>${HMS.map((h) => `<div><span>${esc(h.name)} <small class="empty">${esc(h.file || "")}</small></span><button class="btn red" data-del="${esc(h.id)}">Xóa</button></div>`).join("")}</div>` : ""}
  </div></div>`;
  let ok = false;
  const warn = () => { const n = $("hmName").value.trim(), ex = HMS.find((h) => h.name.toLowerCase() === n.toLowerCase());
    ok = !!n && (ex ? lvHM(ex.id) >= 3 : lvAll() >= 3);
    $("hmWarn").textContent = !n ? "Nhập tên hạng mục." : ex ? (lvHM(ex.id) >= 3 ? "Trùng tên hạng mục đã có: sẽ thay khối lượng & mặt bằng, giữ nguyên ngày đổ đã nhập (khớp theo ID)." : "Bạn không có quyền Quản trị hạng mục này.") : (lvAll() >= 3 ? "Sẽ tạo hạng mục mới." : "Chỉ chủ dự án / quản trị tất cả hạng mục mới tạo được hạng mục mới. Chọn tên hạng mục bạn quản trị.");
    $("dlgOk").disabled = !ok; };
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
      const have = DATES[id] || {}, p = {};
      items.forEach((i) => { if (!String(i.id).includes(".") && i.dot != null && dd[i.dot] && !have[i.id]) p[i.id] = dd[i.dot]; });
      if (Object.keys(p).length) await setDates(id, p);
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
