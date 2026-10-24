/* ============================================================
   FinLoop — Login / Register + Dashboard
   ============================================================ */

import {
  API_URL,
  SESSION_KEY,
  REMEMBER_KEY,
  REQ_TIMEOUT_MS,
  WA_NUMBER,
  WA_MESSAGE
} from './config.js';

const USERS_KEY = 'finloop_users';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
const DAYS_SHORT   = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const MS_DAY       = 86400000;
const MAX_TRX_DISPLAY = 5;

/* ============================================================
   TIMELINE INTRO
   ============================================================ */
const T = {
  history    : 2100,
  historyStep: 160,
  heatIn     : 3200,
  heatOut    : 3700,
  bars       : 4200,
  barsStep   : 110,
  barsLabel  : 300,
  lb         : 4600,
  lbStep     : 60,
  numBalance : 3200,
  numIncome  : 3900,
  numExpense : 4500,
  numDur     : 900
};

const $ = (id) => document.getElementById(id);

/* ============================================================
   STATE
   ============================================================ */
const state = {
  transactions: [],
  leaderboard: [],
  user: null
};

let currentRange = 'week';
let firstRenderDone = false;
let dashInitialized = false;
let currentUser = null;
let _t0 = 0;
let introMode = true;

const ui = {
  tabs: $('tabs'), form: $('authForm'),
  nama: $('nama'), namaField: $('namaField'),
  username: $('username'), password: $('password'),
  password2: $('password2'), confirmField: $('confirmField'),
  rememberField: $('rememberField'), remember: $('rememberMe'),
  helpLink: $('helpLink'), error: $('formError'),
  submitBtn: $('submitBtn'), submitText: $('submitText'),
  eyeBtn: $('eyeBtn'), authSub: $('authSub'), authFoot: $('authFoot'),
  page2: $('page2')
};

let mode = 'login';

/* ============================================================
   API (Apps Script)
   ============================================================ */
function apiTerisi() {
  return API_URL && API_URL.indexOf('GANTI_DENGAN') !== 0;
}

async function apiCall(action, data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, data || {})),
      signal: controller.signal,
      cache: 'no-store'
    });
    const json = JSON.parse(await res.text());
    if (!json.ok) {
      const err = new Error(json.error || 'Server error');
      err.server = true;
      throw err;
    }
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   PENYIMPANAN LOKAL
   ============================================================ */
function getLocalUsers() {
  try {
    const u = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
    return (u && typeof u === 'object') ? u : {};
  } catch (_) { return {}; }
}
function saveLocalUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function hashPassword(text) { return text; }

/* ============================================================
   SESSION
   ============================================================ */
function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return (s && s.username) ? s : null;
  } catch (_) { return null; }
}

function setSession(user, remember) {
  const payload = JSON.stringify({
    nama: user.nama || user.username,
    username: user.username,
    foto: user.foto || '',
    loginAt: Date.now()
  });
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  if (remember) {
    localStorage.setItem(SESSION_KEY, payload);
    localStorage.setItem(REMEMBER_KEY, user.username);
  } else {
    sessionStorage.setItem(SESSION_KEY, payload);
    localStorage.removeItem(REMEMBER_KEY);
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function getRememberedUser() {
  try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch (_) { return ''; }
}

/* ============================================================
   UI LOGIN
   ============================================================ */
function showError(msg) {
  ui.error.textContent = msg;
  ui.error.classList.add('show');
}
function clearError() {
  ui.error.classList.remove('show');
  ui.error.textContent = '';
}
function markField(input, bad) { input.classList.toggle('err', !!bad); }

function setLoading(on) {
  ui.submitBtn.classList.toggle('loading', on);
  ui.submitBtn.disabled = on;
}

function setMode(next) {
  mode = next;
  const isRegister = mode === 'register';

  ui.tabs.dataset.mode = mode;
  ui.tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === mode));

  ui.namaField.hidden = !isRegister;
  ui.confirmField.hidden = !isRegister;
  ui.rememberField.hidden = isRegister;

  ui.submitText.textContent = isRegister ? 'Daftar' : 'Masuk';
  ui.authSub.textContent = isRegister ? 'Buat akun baru untuk mulai' : 'Masuk untuk melanjutkan ke dashboard';

  ui.authFoot.innerHTML = isRegister
    ? 'Sudah punya akun? <button type="button" class="link-btn" id="toLogin">Login di sini</button>'
    : 'Belum punya akun? <button type="button" class="link-btn" id="toRegister">Daftar di sini</button>';

  ui.password.placeholder = isRegister ? 'minimal 4 karakter' : 'password kamu';
  ui.nama.value = ''; ui.password.value = ''; ui.password2.value = '';
  markField(ui.nama, false);
  markField(ui.password, false);
  markField(ui.password2, false);
  clearError();
  ui.username.focus();
}

/* ============================================================
   VALIDASI
   ============================================================ */
function validateRegister(nama, username, pass, pass2) {
  if (nama.length < 2) return 'Nama lengkap wajib diisi.';
  if (username.length < 3) return 'Username minimal 3 karakter.';
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Username hanya boleh huruf, angka, dan underscore.';
  if (pass.length < 4) return 'Password minimal 4 karakter.';
  if (pass !== pass2) return 'Password tidak sama.';
  return null;
}
function validateLogin(username, pass) {
  if (!username) return 'Username wajib diisi.';
  if (!pass) return 'Password wajib diisi.';
  return null;
}

/* ============================================================
   DAFTAR
   ============================================================ */
async function daftar(nama, username, pass, pass2) {
  const err = validateRegister(nama, username, pass, pass2);
  if (err) {
    showError(err);
    return;
  }

  if (apiTerisi()) {
    try {
      await apiCall('register', { nama, username, password: pass, foto: '' });
    } catch (e) {
      console.warn('[API] daftar gagal:', e.message);
      showError(e.server ? e.message : 'Tidak dapat terhubung ke server. Akun belum tersimpan, coba lagi.');
      if (e.server && /sudah dipakai/i.test(e.message)) markField(ui.username, true);
      return;
    }

    pindahKeLoginSetelahDaftar(username);
    return;
  }

  const users = getLocalUsers();
  if (users[username]) {
    showError('Username "' + username + '" sudah dipakai.');
    markField(ui.username, true);
    return;
  }
  users[username] = { nama, username, pass: hashPassword(pass), dibuat: Date.now() };
  saveLocalUsers(users);

  pindahKeLoginSetelahDaftar(username);
}

function pindahKeLoginSetelahDaftar(username) {
  setMode('login');
  ui.username.value = username;
  ui.password.value = '';
  ui.password2.value = '';
  markField(ui.username, false);
  markField(ui.password, false);
  clearError();
  ui.password.focus();
}

/* ============================================================
   LOGIN
   ============================================================ */
async function masuk(username, pass) {
  const err = validateLogin(username, pass);
  if (err) return showError(err);

  if (apiTerisi()) {
    let user;

    try {
      user = await apiCall('login', { username, password: pass });
    } catch (e) {
      if (e.server) {
        showError(e.message);
        markField(ui.password, true);
      } else {
        showError('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.');
      }
      return;
    }

    try {
      state.leaderboard = await ambilLeaderboard();
    } catch (e) {
      showError(e.server
        ? e.message
        : 'Login berhasil, tetapi data papan peringkat gagal dimuat. Coba lagi.');
      return;
    }

    try {
      state.transactions = await ambilTransaksi(user.username);
    } catch (e) {
      console.warn('[API] gagal memuat transaksi:', e.message);
      state.transactions = [];
    }

    setSession(user, ui.remember.checked);
    await onLoginSuccess(user);
    return;
  }

  const users = getLocalUsers();
  const user = users[username];
  if (!user || user.pass !== pass) {
    showError('Username atau password salah.');
    markField(ui.password, true);
    return;
  }
  setSession(user, ui.remember.checked);
  await onLoginSuccess(user);
}

/* ============================================================
   PINDAH KE DASHBOARD (LOGIN FLOW)
   ============================================================ */
async function onLoginSuccess(user) {
  $('decoBL').classList.add('exit-left');
  $('decoBR').classList.add('exit-right');

  await new Promise(resolve => setTimeout(resolve, 300));

  currentUser = user;
  initDashboard(false, false);
  const page2 = $('page2');
  page2.style.transition = 'transform 0.9s cubic-bezier(.7,0,.3,1)';
  page2.style.transform = 'translateY(0)';
  $('page1').classList.add('slide-up');
}

/* ============================================================
   HELPERS
   ============================================================ */
function fmt(n) {
  return String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (isSameDay(d, now)) return 'Hari ini, ' + hh + ':' + mm;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Kemarin, ' + hh + ':' + mm;
  return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ', ' + hh + ':' + mm;
}
function dayKey(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function getAbsoluteDelay(targetMs) {
  if (!introMode) return 0;
  let target = targetMs;
  if (ui.page2 && ui.page2.classList.contains('skip-layout-anim')) {
    target = Math.max(0, targetMs - 1800);
  }
  return Math.max(0, (target - (performance.now() - _t0)) / 1000);
}

function setAnim(el, css) {
  if (!el) return;
  el.style.animation = introMode ? css : 'none';
}

/* ============================================================
   TRANSAKSI — PARSE & LOAD / SIMPAN
   ============================================================ */
function parseTanggalIndo(s) {
  var bulanMap = { Jan:0, Feb:1, Mar:2, Apr:3, Mei:4, Jun:5, Jul:6, Ags:7, Sep:8, Okt:9, Nov:10, Des:11 };
  var m = String(s || '').match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return Date.now();
  var d = parseInt(m[1], 10);
  var mo = bulanMap[m[2]];
  var y = parseInt(m[3], 10);
  var h = parseInt(m[4], 10);
  var mi = parseInt(m[5], 10);
  if (mo == null) return Date.now();
  return new Date(y, mo, d, h, mi).getTime();
}

function transaksiDariSheet(rows) {
  if (!Array.isArray(rows)) return [];
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    var status = String(r.status || '').toLowerCase();
    var type = status === 'masuk' ? 'in' : 'out';
    var amount = Number(r.nominal) || 0;
    if (amount <= 0) continue;
    list.push({
      id: 'sheet_' + i + '_' + Date.now(),
      type: type,
      title: String(r.keterangan || '') || (type === 'in' ? 'pemasukan' : 'pengeluaran'),
      amount: amount,
      timestamp: parseTanggalIndo(r.waktu)
    });
  }
  list.sort(function (a, b) { return b.timestamp - a.timestamp; });
  return list;
}

async function ambilTransaksi(username) {
  if (!apiTerisi()) return [];
  var data = await apiCall('getTransactions', { username: username });
  return transaksiDariSheet(data);
}

async function simpanTransaksi(tx, note) {
  if (!apiTerisi() || !currentUser) return true;
  try {
    await apiCall('addTransaction', {
      username: currentUser.username,
      type: tx.type,
      amount: tx.amount,
      note: String(note || '').trim()
    });
    return true;
  } catch (e) {
    console.warn('[API] simpan transaksi gagal:', e.message);
    return false;
  }
}

/* ============================================================
   DATA DASHBOARD
   ============================================================ */
const compute = {
  balance() { return state.transactions.reduce((s, t) => s + (t.type === 'in' ? t.amount : -t.amount), 0); },
  income()  { return state.transactions.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0); },
  expense() { return state.transactions.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0); }
};

/* ============================================================
   RENDER — BALANCE
   ============================================================ */
function renderBalance(animate) {
  const balance = compute.balance();
  const income = compute.income();
  const expense = compute.expense();

  if (animate === false || !introMode) {
    $('totalBalance').textContent = fmt(balance);
    $('totalIncome').textContent = '+' + fmt(income);
    $('totalExpense').textContent = '-' + fmt(expense);
    return;
  }
  countUp($('totalBalance'), balance, '');
  countUp($('totalIncome'), income, '+');
  countUp($('totalExpense'), expense, '-');
}

function nolkanAngka() {
  $('totalBalance').textContent = '0';
  $('totalIncome').textContent = '+0';
  $('totalExpense').textContent = '-0';
}

function countUp(el, target, sign) {
  if (!el) return;
  if (!introMode) {
    el.textContent = sign + fmt(target);
    return;
  }

  const LANGKAH = 80;
  const nilai = Math.abs(Math.round(target));
  const step = Math.max(1, Math.ceil(nilai / LANGKAH));
  const perFrame = Math.max(1, Math.round(LANGKAH / (T.numDur / 16)));
  let sekarang = 0;

  el.textContent = sign + fmt(0);

  const timer = setInterval(() => {
    for (let i = 0; i < perFrame; i++) {
      sekarang += step;
      if (sekarang >= nilai) break;
    }
    if (sekarang > nilai) sekarang = nilai;
    el.textContent = sign + fmt(sekarang);
    if (sekarang >= nilai) clearInterval(timer);
  }, 16);
}

/* ============================================================
   RENDER — HISTORY
   ============================================================ */
function createTrxElement(tx) {
  const el = document.createElement('div');
  el.className = 'trx trx-' + (tx.type === 'in' ? 'in' : 'out');
  const icon = tx.type === 'in'
    ? '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>'
    : '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>';
  el.innerHTML =
    '<div class="trx-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg></div>' +
    '<div class="trx-info"><div class="trx-title"></div><div class="trx-date"></div></div>' +
    '<div class="trx-amount">' + (tx.type === 'in' ? '+' : '-') + fmt(tx.amount) + '</div>';
  el.querySelector('.trx-title').textContent = tx.title;
  el.querySelector('.trx-date').textContent = formatDate(tx.timestamp);
  return el;
}

function renderHistoryInitial() {
  const list = $('historyList');
  const empty = $('historyEmpty');
  list.innerHTML = '';
  const txs = state.transactions.slice(0, MAX_TRX_DISPLAY);

  if (txs.length === 0) {
    empty.style.display = 'flex';
    const delay = getAbsoluteDelay(T.history + 120);
    setAnim(empty, 'fadeUp .55s ' + delay.toFixed(2) + 's cubic-bezier(.4,0,.2,1) both');
    return;
  }
  empty.style.display = 'none';

  txs.forEach((tx, i) => {
    const el = createTrxElement(tx);
    const delay = getAbsoluteDelay(T.history + i * T.historyStep);
    setAnim(el, 'fadeRight .55s ' + delay.toFixed(2) + 's cubic-bezier(.4,0,.2,1) both');
    list.appendChild(el);
  });
}

function prependHistory(tx) {
  const list = $('historyList');
  const empty = $('historyEmpty');
  empty.style.display = 'none';
  const el = createTrxElement(tx);
  el.style.animation = 'fadeRight .5s cubic-bezier(.4,0,.2,1) both';
  list.insertBefore(el, list.firstChild);
  while (list.children.length > MAX_TRX_DISPLAY) list.removeChild(list.lastElementChild);
}

/* ============================================================
   RENDER — HEATMAP
   ============================================================ */
function computeHeatLevels(type) {
  const now = new Date(); now.setHours(0,0,0,0);
  const buckets = new Array(30).fill(0);
  const keyToIndex = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - (29 - i) * MS_DAY);
    keyToIndex[dayKey(d)] = i;
  }
  state.transactions.forEach(tx => {
    if (tx.type !== type) return;
    const d = new Date(tx.timestamp); d.setHours(0,0,0,0);
    const k = dayKey(d);
    if (k in keyToIndex) buckets[keyToIndex[k]]++;
  });
  return buckets.map(c => c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : c <= 5 ? 3 : 4);
}

function renderHeatmap() {
  renderHeatGroup($('heatIncome'), computeHeatLevels('in'), T.heatIn);
  renderHeatGroup($('heatExpense'), computeHeatLevels('out'), T.heatOut);
}

function renderHeatGroup(container, levels, baseMs) {
  container.innerHTML = '';
  levels.forEach((lvl, i) => {
    const row = Math.floor(i / 10), col = i % 10;
    const wave = (row + col) * 35;
    const delay = getAbsoluteDelay(baseMs + wave);
    const span = document.createElement('span');
    span.className = 'heat h' + lvl;
    if (introMode) span.style.animationDelay = delay.toFixed(3) + 's';
    else span.style.animation = 'none';
    container.appendChild(span);
  });
}

/* ============================================================
   RENDER — BAR CHART
   ============================================================ */
function bucketWeek() {
  const now = new Date(); now.setHours(0,0,0,0);
  const labels = [], inc = [], exp = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * MS_DAY);
    labels.push(DAYS_SHORT[d.getDay()]);
    const k = dayKey(d);
    let sIn = 0, sOut = 0;
    state.transactions.forEach(tx => {
      const td = new Date(tx.timestamp); td.setHours(0,0,0,0);
      if (dayKey(td) !== k) return;
      if (tx.type === 'in') sIn += tx.amount; else sOut += tx.amount;
    });
    inc.push(sIn); exp.push(sOut);
  }
  return { labels, income: inc, expense: exp };
}

function bucketMonth() {
  const now = new Date(); now.setHours(0,0,0,0);
  const labels = ['M1','M2','M3','M4'];
  const inc = [0,0,0,0], exp = [0,0,0,0];
  state.transactions.forEach(tx => {
    const d = new Date(tx.timestamp); d.setHours(0,0,0,0);
    const diff = Math.floor((now - d) / MS_DAY);
    if (diff < 0 || diff >= 28) return;
    const idx = 3 - Math.floor(diff / 7);
    if (tx.type === 'in') inc[idx] += tx.amount; else exp[idx] += tx.amount;
  });
  return { labels, income: inc, expense: exp };
}

function bucketYear() {
  const now = new Date();
  const labels = [], inc = [], exp = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MONTHS_SHORT[d.getMonth()]);
    const y = d.getFullYear(), m = d.getMonth();
    let sIn = 0, sOut = 0;
    state.transactions.forEach(tx => {
      const td = new Date(tx.timestamp);
      if (td.getFullYear() !== y || td.getMonth() !== m) return;
      if (tx.type === 'in') sIn += tx.amount; else sOut += tx.amount;
    });
    inc.push(sIn); exp.push(sOut);
  }
  return { labels, income: inc, expense: exp };
}

function renderBarChart(range) {
  currentRange = range;
  const buckets = range === 'week' ? bucketWeek() : range === 'month' ? bucketMonth() : bucketYear();
  const incomeMil = buckets.income.map(v => v / 1000000);
  const expenseMil = buckets.expense.map(v => v / 1000000);
  const maxVal = Math.max(1, Math.max.apply(null, incomeMil.concat(expenseMil)));

  const area = $('barsArea');
  area.innerHTML = '';
  const baseMs = (!introMode || firstRenderDone) ? 0 : T.bars;
  const stepMs = (!introMode || firstRenderDone) ? 50 : T.barsStep;

  buckets.labels.forEach((label, i) => {
    const group = document.createElement('div');
    group.className = 'bar-group';
    const pair = document.createElement('div');
    pair.className = 'bar-pair';

    const inBar = document.createElement('div');
    inBar.className = 'bar in';
    inBar.style.height = (incomeMil[i] / maxVal * 100) + '%';
    setAnim(inBar, 'growBar .85s ' + getAbsoluteDelay(baseMs + i * stepMs).toFixed(3) + 's cubic-bezier(.34,1.1,.64,1) both');
    inBar.innerHTML = '<span class="bar-tip">+' + incomeMil[i].toFixed(2).replace('.', ',') + 'jt</span>';

    const outBar = document.createElement('div');
    outBar.className = 'bar out';
    outBar.style.height = (expenseMil[i] / maxVal * 100) + '%';
    setAnim(outBar, 'growBar .85s ' + getAbsoluteDelay(baseMs + i * stepMs + 60).toFixed(3) + 's cubic-bezier(.34,1.1,.64,1) both');
    outBar.innerHTML = '<span class="bar-tip">-' + expenseMil[i].toFixed(2).replace('.', ',') + 'jt</span>';

    pair.appendChild(inBar);
    pair.appendChild(outBar);

    const lbl = document.createElement('div');
    lbl.className = 'bar-label';
    lbl.textContent = label;
    if (introMode && !firstRenderDone) {
      lbl.style.animation = 'fadeUp .5s ' + getAbsoluteDelay(baseMs + buckets.labels.length * stepMs + T.barsLabel).toFixed(3) + 's cubic-bezier(.4,0,.2,1) both';
      group.style.animationDelay = getAbsoluteDelay(baseMs + i * stepMs).toFixed(3) + 's';
    } else {
      lbl.style.animation = 'none';
      group.style.animation = 'none';
      group.style.animationDelay = '0s';
    }

    group.appendChild(pair);
    group.appendChild(lbl);
    area.appendChild(group);
  });

  $('chartSub').textContent =
    range === 'week' ? '7 hari terakhir · dalam juta rupiah' :
    range === 'month' ? '4 minggu terakhir · dalam juta rupiah' :
    '12 bulan terakhir · dalam juta rupiah';

  firstRenderDone = true;
}

/* ============================================================
   RENDER — LEADERBOARD
   ============================================================ */
function buildLeaderboardData() {
  const list = state.leaderboard.slice();

  const meIdx = list.findIndex(u => u.username === currentUser.username);
  if (meIdx >= 0) {
    list[meIdx] = Object.assign({}, list[meIdx], {
      nama: currentUser.nama || currentUser.username,
      photoURL: currentUser.foto || ''
    });
  }

  list.sort((a, b) => {
    const pa = a.posisi || 999999;
    const pb = b.posisi || 999999;
    if (pa !== pb) return pa - pb;
    return (b.balance || 0) - (a.balance || 0);
  });

  const meIndex = list.findIndex(u => u.username === currentUser.username);

  return {
    top: list.slice(0, 10),
    me: (meIndex >= 10) ? Object.assign({ rank: meIndex + 1 }, list[meIndex]) : null,
    total: list.length
  };
}

function createLbRow(user, rank, isMe, isBelowTop) {
  const el = document.createElement('div');
  el.className = 'lb-row';

  if (rank === 1) el.classList.add('lb-top-1');
  else if (rank === 2) el.classList.add('lb-top-2');
  else if (rank === 3) el.classList.add('lb-top-3');
  else if (isMe) el.classList.add(isBelowTop ? 'lb-me-below' : 'lb-me');

  const num = document.createElement('span');
  num.className = 'lb-num';
  num.textContent = rank;
  el.appendChild(num);

  const av = document.createElement('span');
  av.className = 'lb-avatar';

  if (user.photoURL && user.photoURL.trim() !== '') {
    const img = document.createElement('img');
    img.src = user.photoURL;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => {
      av.innerHTML = '';
      const initial = (user.nama || '?')[0].toUpperCase();
      av.textContent = initial;
      av.style.color = '#2563eb';
      av.style.fontWeight = '700';
      av.style.fontSize = '13px';
    };
    av.appendChild(img);
  } else {
    const initial = (user.nama || '?')[0].toUpperCase();
    av.textContent = initial;
    av.style.color = '#2563eb';
    av.style.fontWeight = '700';
    av.style.fontSize = '13px';
  }
  el.appendChild(av);

  const name = document.createElement('span');
  name.className = 'lb-name';
  name.textContent = user.nama || 'User';
  el.appendChild(name);

  const bal = document.createElement('span');
  bal.className = 'lb-balance';
  bal.textContent = fmt(user.balance || 0);
  el.appendChild(bal);

  return el;
}

function renderLeaderboard(data) {
  const container = $('leaderboard');
  if (!container) return;
  container.innerHTML = '';

  const top = data && data.top ? data.top : [];
  const me = data && data.me;
  const total = (data && data.total) || 0;

  $('leaderboardCount').textContent = total + ' user';

  if (top.length === 0) {
    container.innerHTML =
      '<div class="lb-empty">' +
        '<div class="lb-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z"/></svg></div>' +
        '<div class="lb-empty-text">Belum ada user lain</div>' +
        '<div class="lb-empty-sub">Ajak temanmu gabung FinLoop</div>' +
      '</div>';
    return;
  }

  const stickyTop = document.createElement('div');
  stickyTop.className = 'lb-sticky-top';
  const rest = [];

  top.forEach((u, i) => {
    const rank = i + 1;
    const isMe = u.username === currentUser.username;
    const row = createLbRow(u, rank, isMe, false);
    setAnim(row, 'fadeRight .5s ' + (getAbsoluteDelay(T.lb + i * T.lbStep)).toFixed(2) + 's cubic-bezier(.4,0,.2,1) both');
    if (rank <= 3) stickyTop.appendChild(row);
    else rest.push(row);
  });

  container.appendChild(stickyTop);
  rest.forEach(r => container.appendChild(r));

  if (me && me.rank > 10) {
    const sep = document.createElement('div');
    sep.className = 'lb-separator';
    sep.textContent = '···';
    container.appendChild(sep);

    const meRow = createLbRow(me, me.rank, true, true);
    setAnim(meRow, 'fadeRight .5s ' + (getAbsoluteDelay(T.lb + top.length * T.lbStep + 100)).toFixed(2) + 's cubic-bezier(.4,0,.2,1) both');
    container.appendChild(meRow);
  }
}

function initLeaderboard() {
  renderLeaderboard(buildLeaderboardData());
}

function rapikanLeaderboard(data) {
  if (!Array.isArray(data)) return [];
  return data
    .filter(u => u && u.username)
    .map(u => ({
      nama: String(u.nama || u.username || 'User'),
      username: String(u.username),
      photoURL: String(u.foto || '').trim(),
      posisi: Number(u.posisi) || 0,
      balance: Number(u.jumlah) || 0
    }));
}

async function ambilLeaderboard() {
  const data = await apiCall('leaderboard', {});
  return rapikanLeaderboard(data);
}

/* ============================================================
   AKSI TRANSAKSI
   ============================================================ */
function addTransaction(type, title, amount) {
  const tx = {
    id: 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    type: type,
    title: (title || '').trim() || (type === 'in' ? 'pemasukan' : 'pengeluaran'),
    amount: amount,
    timestamp: Date.now()
  };
  state.transactions.unshift(tx);
  prependHistory(tx);
  renderBalance(true);
  renderHeatmap();
  renderBarChart(currentRange);

  const meIdx = state.leaderboard.findIndex(u => u.username === currentUser.username);
  if (meIdx >= 0) {
    state.leaderboard[meIdx].balance = compute.balance();
  }
  initLeaderboard();
}

function attemptTransaction(action) {
  const rawAmount = readAmountInput();
  if (rawAmount <= 0) { focusAmountInput(); return; }
  const note = $('noteInput').value;
  executeTransaction(action, rawAmount, note);
}

function executeTransaction(type, amount, note) {
  if (type === 'out') {
    const balance = compute.balance();
    if (amount > balance) {
      alert('Saldo tidak cukup.\n\nSaldo: Rp ' + fmt(balance) + '\nDiminta: Rp ' + fmt(amount));
      resetForm();
      return;
    }
  }
  addTransaction(type, note, amount);
  resetForm();

  const last = state.transactions[0];
  if (last) {
    simpanTransaksi(last, note).then(function (ok) {
      if (!ok) {
        alert('Transaksi tersimpan di perangkat, tetapi gagal dikirim ke server. Coba lagi nanti.');
      }
    });
  }
}

function readAmountInput() {
  const raw = $('fromInput').value.replace(/\./g, '').replace(/\D/g, '');
  return parseInt(raw, 10) || 0;
}

function focusAmountInput() {
  const input = $('fromInput');
  input.focus();
  input.style.width = '1ch';
}

function resetForm() {
  const input = $('fromInput');
  input.value = '';
  input.style.width = '1ch';
  input.classList.remove('has-value');
  $('noteInput').value = '';
}

async function resetDashboard() {
  if (apiTerisi() && currentUser) {
    await apiCall('resetTransactions', { username: currentUser.username });
  }

  state.transactions = [];
  firstRenderDone = false;
  renderBalance(false);
  renderHeatmap();
  renderBarChart(currentRange);
  renderHistoryInitial();

  const meIdx = state.leaderboard.findIndex(u => u.username === currentUser.username);
  if (meIdx >= 0) state.leaderboard[meIdx].balance = 0;
  initLeaderboard();
}

/* ============================================================
   HAPUS AKUN
   ============================================================ */
function bukaDeleteModal() {
  const input = $('deleteAccountUsername');
  const btn = $('deleteAccountConfirm');
  const err = $('deleteAccountError');
  const nameEl = $('deleteAccountName');

  input.value = '';
  input.classList.remove('match');
  btn.disabled = true;
  btn.classList.remove('armed');
  err.textContent = '';
  err.classList.remove('show');
  nameEl.textContent = '@' + currentUser.username;

  $('deleteAccountModal').classList.add('show');
  setTimeout(() => input.focus(), 60);
}

function tutupDeleteModal() {
  $('deleteAccountModal').classList.remove('show');
  $('deleteAccountUsername').value = '';
  $('deleteAccountUsername').classList.remove('match');
  $('deleteAccountConfirm').disabled = true;
  $('deleteAccountConfirm').classList.remove('armed');
  $('deleteAccountError').classList.remove('show');
  $('deleteAccountError').textContent = '';
}

function updateDeleteConfirm() {
  const input = $('deleteAccountUsername');
  const btn = $('deleteAccountConfirm');
  const typed = input.value.trim();
  const matches = typed === currentUser.username;

  btn.disabled = !matches;
  btn.classList.toggle('armed', matches);
  input.classList.toggle('match', matches);
}

async function hapusAkun() {
  const typed = $('deleteAccountUsername').value.trim();
  if (typed !== currentUser.username) return;

  const btn = $('deleteAccountConfirm');
  const err = $('deleteAccountError');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    await apiCall('deleteAccount', {
      username: currentUser.username,
      confirmUsername: typed
    });

    clearSession();
    location.reload();
  } catch (e) {
    btn.classList.remove('loading');
    btn.disabled = false;
    btn.classList.toggle('armed', typed === currentUser.username);

    err.textContent = e && e.server
      ? e.message
      : 'Tidak dapat terhubung ke server. Coba lagi.';
    err.classList.add('show');
  }
}

/* ============================================================
   PROFIL
   ============================================================ */
function isiProfil() {
  const nama = currentUser.nama || currentUser.username;
  $('accName').textContent = nama;
  $('accEmail').textContent = '@' + currentUser.username;
  $('accNum').textContent = String(1000 + (hashUsername(currentUser.username) % 8999));

  const av = $('accAvatar');
  if (currentUser.foto) {
    av.innerHTML = '';
    const img = document.createElement('img');
    img.src = currentUser.foto;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => { av.innerHTML = ''; av.textContent = nama.charAt(0).toUpperCase(); };
    av.appendChild(img);
  } else {
    av.textContent = nama.charAt(0).toUpperCase();
  }
}

function hashUsername(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/* ============================================================
   FOTO PROFIL
   ============================================================ */
const MAX_FOTO_CHARS = 48000;
const FOTO_TARGET_CHARS = 45000;
let pendingRemove = false;
let editMode = 'upload';
let editImage = null;
let editScale = 1;
let editX = 0;
let editY = 0;
let editBaseScale = 1;
let editDrag = null;
let photoLoadToken = 0;

function fotoAwal() {
  return (currentUser.nama || currentUser.username || '?').charAt(0).toUpperCase();
}

function photoErr(msg) {
  const el = $('photoError');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

function photoErrClear() {
  const el = $('photoError');
  if (!el) return;
  el.textContent = '';
  el.classList.remove('show');
}

function renderPhotoStage() {
  const stage = $('photoStage');
  if (!stage) return;

  const editImg = $('photoEditImg');
  const linkImg = $('photoLinkImg');
  const empty = $('photoStageEmpty');
  const zoom = $('photoZoom');
  const url = $('photoInput').value.trim();
  const current = currentUser && currentUser.foto ? currentUser.foto : '';
  const editable = editMode === 'upload' && !!editImage && !pendingRemove;

  if (editable) {
    editImg.hidden = false;
    linkImg.hidden = true;
    empty.hidden = true;
    zoom.hidden = false;
    terapkanTransform();
    return;
  }

  editImg.hidden = true;
  zoom.hidden = true;

  const preview = url || current;
  if (!pendingRemove && preview && validPhotoValue(preview)) {
    if (linkImg.getAttribute('src') !== preview) linkImg.src = preview;
    linkImg.hidden = false;
    empty.hidden = true;
  } else {
    linkImg.hidden = true;
    linkImg.removeAttribute('src');
    empty.hidden = false;
    empty.textContent = fotoAwal();
  }
}

function terapkanTransform() {
  const stage = $('photoStage');
  const img = $('photoEditImg');
  if (!stage || !img || !editImage) return;

  const S = stage.clientWidth;
  if (!S) return;

  const bw = editImage.naturalWidth || 1;
  const bh = editImage.naturalHeight || 1;

  img.style.width = bw + 'px';
  img.style.height = bh + 'px';
  img.style.marginLeft = (-bw / 2) + 'px';
  img.style.marginTop = (-bh / 2) + 'px';

  editBaseScale = Math.max(S / bw, S / bh) * editScale;

  const maxX = Math.max(0, (bw * editBaseScale - S) / 2);
  const maxY = Math.max(0, (bh * editBaseScale - S) / 2);
  editX = Math.max(-maxX, Math.min(maxX, editX));
  editY = Math.max(-maxY, Math.min(maxY, editY));

  img.style.transform = 'translate(' + editX + 'px,' + editY + 'px) scale(' + editBaseScale + ')';

  const range = $('photoZoomRange');
  if (range) range.style.setProperty('--zoom', (((editScale - 1) / 2) * 100) + '%');
}

function muatGambarEdit(src) {
  const token = ++photoLoadToken;
  photoErrClear();
  editImage = null;

  const img = new Image();
  img.onload = () => {
    if (token !== photoLoadToken) return;
    editImage = img;
    $('photoEditImg').src = img.src;
    editScale = 1;
    editX = 0;
    editY = 0;
    const range = $('photoZoomRange');
    if (range) range.value = 1;
    renderPhotoStage();
  };
  img.onerror = () => {
    if (token !== photoLoadToken) return;
    editImage = null;
    photoErr('Gambar tidak bisa dibaca.');
    renderPhotoStage();
  };
  img.src = src;
}

function setPhotoMode(mode) {
  editMode = mode;
  const up = $('photoTabUpload');
  const link = $('photoTabLink');

  up.classList.toggle('active', mode === 'upload');
  link.classList.toggle('active', mode === 'link');
  up.setAttribute('aria-selected', mode === 'upload' ? 'true' : 'false');
  link.setAttribute('aria-selected', mode === 'link' ? 'true' : 'false');
  $('photoPanelUpload').hidden = mode !== 'upload';
  $('photoPanelLink').hidden = mode !== 'link';
  $('photoStage').classList.remove('drop');
  renderPhotoStage();
}

function validPhotoValue(value) {
  if (!value) return true;
  if (value.length > MAX_FOTO_CHARS) return false;
  if (/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(value)) return true;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) { return false; }
}

function eksporCrop() {
  const stage = $('photoStage');
  if (!stage || !editImage) return null;

  const S = stage.clientWidth;
  if (!S) return null;

  const bw = editImage.naturalWidth || 1;
  const bh = editImage.naturalHeight || 1;
  const scale = Math.max(S / bw, S / bh) * editScale;
  const dw = bw * scale;
  const dh = bh * scale;
  const x = (S - dw) / 2 + editX;
  const y = (S - dh) / 2 + editY;

  const ukuran = [256, 200, 160];
  const kualitas = [0.82, 0.72, 0.62];

  for (let i = 0; i < ukuran.length; i++) {
    const size = ukuran[i];
    const r = size / S;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(editImage, x * r, y * r, dw * r, dh * r);

      const data = canvas.toDataURL('image/jpeg', kualitas[i]);
      if (data.length <= FOTO_TARGET_CHARS) return data;
    } catch (_) {
      return null;
    }
  }
  return null;
}

function bacaFotoFile(file) {
  photoErrClear();

  if (!file.type || file.type.indexOf('image/') !== 0) {
    photoErr('File harus berupa gambar.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    photoErr('Ukuran file maksimal 10 MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    pendingRemove = false;
    editScale = 1;
    editX = 0;
    editY = 0;
    $('photoInput').value = '';
    $('photoFile').value = '';
    $('photoRemove').hidden = false;
    setPhotoMode('upload');
    muatGambarEdit(reader.result);
  };
  reader.onerror = () => photoErr('Gagal membaca file.');
  reader.readAsDataURL(file);
}

function updateSessionFoto(foto) {
  const store = localStorage.getItem(SESSION_KEY) ? localStorage : sessionStorage;
  try {
    const s = JSON.parse(store.getItem(SESSION_KEY) || '{}');
    s.foto = foto;
    store.setItem(SESSION_KEY, JSON.stringify(s));
  } catch (_) {}
}

function bukaPhotoModal() {
  photoErrClear();
  pendingRemove = false;
  editImage = null;
  editScale = 1;
  editX = 0;
  editY = 0;
  editDrag = null;
  photoLoadToken++;

  const input = $('photoInput');
  const current = currentUser.foto || '';
  const isData = current.indexOf('data:') === 0;
  const isUrl = /^https?:\/\//i.test(current);

  input.value = isUrl ? current : '';
  $('photoFile').value = '';
  $('photoRemove').hidden = !current;
  $('photoZoomRange').value = 1;
  $('photoStage').classList.remove('dragging', 'drop');

  $('photoModal').classList.add('show');
  setPhotoMode(isData || !isUrl ? 'upload' : 'link');

  if (isData) muatGambarEdit(current);

  requestAnimationFrame(() => {
    if (editImage) terapkanTransform();
    const target = isUrl ? input : $('photoPick');
    target.focus({ preventScroll: true });
    if (target === input) input.select();
  });
}

function tutupPhotoModal() {
  $('photoModal').classList.remove('show');
  editDrag = null;
  $('photoStage').classList.remove('dragging', 'drop');
}

async function simpanFoto() {
  const input = $('photoInput');
  const url = input.value.trim();
  let foto;

  if (pendingRemove) {
    foto = '';
  } else if (url) {
    foto = url;
  } else if (editImage) {
    foto = eksporCrop();
    if (!foto) {
      photoErr('Foto terlalu besar. Pilih gambar lain.');
      return;
    }
  } else {
    foto = currentUser.foto || '';
  }

  if (foto.length > MAX_FOTO_CHARS) {
    photoErr('Foto terlalu besar. Pilih gambar lain.');
    return;
  }
  if (!validPhotoValue(foto)) {
    photoErr('Link foto harus diawali http:// atau https://.');
    input.focus();
    return;
  }

  photoErrClear();
  const btn = $('photoSave');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    if (apiTerisi()) {
      try {
        await apiCall('updateFoto', { username: currentUser.username, foto: foto });
      } catch (e) {
        if (e.server) throw e;
        console.warn('[API] simpan foto gagal:', e.message);
      }
    }

    currentUser.foto = foto;
    updateSessionFoto(foto);

    const users = getLocalUsers();
    if (users[currentUser.username]) {
      users[currentUser.username].foto = foto;
      saveLocalUsers(users);
    }

    pendingRemove = false;
    $('photoRemove').hidden = !foto;
    isiProfil();

    const meIdx = state.leaderboard.findIndex(u => u.username === currentUser.username);
    if (meIdx >= 0) state.leaderboard[meIdx].photoURL = foto;
    initLeaderboard();

    tutupPhotoModal();
  } catch (e) {
    photoErr(e.message || 'Gagal menyimpan foto.');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

/* ============================================================
   INIT DASHBOARD
   ============================================================ */
function initDashboard(skipLayoutAnim, deferData) {
  if (dashInitialized) return;
  dashInitialized = true;

  introMode = true;
  if (skipLayoutAnim) ui.page2.classList.add('skip-layout-anim');

  ui.page2.innerHTML = $('dashboardTemplate').innerHTML;

  isiProfil();

  if (!deferData) {
    renderDashboardData(skipLayoutAnim);
  }

  pasangEvent();
}

function renderDashboardData(skipLayoutAnim) {
  const dl = $('dashLoading');
  if (dl) dl.classList.add('hide');

  _t0 = performance.now();
  firstRenderDone = false;

  if (skipLayoutAnim) {
    countUp($('totalBalance'), compute.balance(), '');
    countUp($('totalIncome'), compute.income(), '+');
    countUp($('totalExpense'), compute.expense(), '-');
  } else {
    nolkanAngka();
    renderBalance(false);
    setTimeout(() => countUp($('totalBalance'), compute.balance(), ''), T.numBalance);
    setTimeout(() => countUp($('totalIncome'), compute.income(), '+'), T.numIncome);
    setTimeout(() => countUp($('totalExpense'), compute.expense(), '-'), T.numExpense);
  }

  renderHistoryInitial();
  renderHeatmap();
  renderBarChart('week');
  initLeaderboard();
}

function pasangEvent() {
  document.querySelectorAll('.chart-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      document.querySelectorAll('.chart-tag').forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
      renderBarChart(tag.dataset.range);
    });
  });

  $('csBtn').addEventListener('click', () => {
    window.open('https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(WA_MESSAGE), '_blank', 'noopener');
  });

  $('resetBtn').addEventListener('click', () => $('resetConfirm').classList.add('show'));
  $('resetCancel').addEventListener('click', () => $('resetConfirm').classList.remove('show'));

  $('resetConfirmBtn').addEventListener('click', async () => {
    const btn = $('resetConfirmBtn');
    btn.classList.add('loading');
    btn.disabled = true;

    try {
      await resetDashboard();
      $('resetConfirm').classList.remove('show');
      const flash = $('resetFlash');
      flash.classList.add('show');
      setTimeout(() => flash.classList.remove('show'), 900);
    } catch (e) {
      alert('Reset gagal: ' + (e && e.message ? e.message : 'Coba lagi.'));
    } finally {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  });

  $('btnLogout').addEventListener('click', () => $('logoutConfirm').classList.add('show'));
  $('logoutCancel').addEventListener('click', () => $('logoutConfirm').classList.remove('show'));
  $('logoutConfirmBtn').addEventListener('click', () => {
    clearSession();
    location.reload();
  });

  $('btnDeleteAccount').addEventListener('click', bukaDeleteModal);
  $('deleteAccountCancel').addEventListener('click', tutupDeleteModal);
  $('deleteAccountUsername').addEventListener('input', updateDeleteConfirm);
  $('deleteAccountConfirm').addEventListener('click', hapusAkun);
  $('deleteAccountModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) tutupDeleteModal();
  });

  $('btnMasuk').addEventListener('click', () => attemptTransaction('in'));
  $('btnTarik').addEventListener('click', () => attemptTransaction('out'));

  const input = $('fromInput');
  const wrap = $('inputWrap');
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '');
    input.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.style.width = (input.value.length + 1) + 'ch';
    input.classList.toggle('has-value', !!digits);
  });
  wrap.addEventListener('click', () => input.focus());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptTransaction('in'); });

  $('noteInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptTransaction('in'); });

  $('avatarBtn').addEventListener('click', bukaPhotoModal);
  $('photoClose').addEventListener('click', tutupPhotoModal);
  $('photoCancel').addEventListener('click', tutupPhotoModal);
  $('photoSave').addEventListener('click', simpanFoto);
  $('photoPick').addEventListener('click', () => $('photoFile').click());
  $('photoFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) bacaFotoFile(file);
  });

  $('photoTabUpload').addEventListener('click', () => setPhotoMode('upload'));
  $('photoTabLink').addEventListener('click', () => setPhotoMode('link'));

  const photoInput = $('photoInput');
  photoInput.addEventListener('input', () => {
    pendingRemove = false;
    photoErrClear();
    $('photoRemove').hidden = !(photoInput.value.trim() || editImage || currentUser.foto);
    renderPhotoStage();
  });
  photoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      simpanFoto();
    }
  });

  $('photoRemove').addEventListener('click', () => {
    pendingRemove = true;
    editImage = null;
    editScale = 1;
    editX = 0;
    editY = 0;
    photoLoadToken++;
    photoInput.value = '';
    $('photoFile').value = '';
    $('photoZoomRange').value = 1;
    $('photoRemove').hidden = true;
    photoErrClear();
    setPhotoMode('upload');
  });

  $('photoZoomRange').addEventListener('input', (e) => {
    editScale = parseFloat(e.target.value) || 1;
    terapkanTransform();
  });

  const photoStage = $('photoStage');
  photoStage.addEventListener('pointerdown', (e) => {
    if (editMode !== 'upload' || !editImage) return;
    e.preventDefault();
    editDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: editX, dy: editY };
    photoStage.classList.add('dragging');
    if (photoStage.setPointerCapture) photoStage.setPointerCapture(e.pointerId);
  });
  photoStage.addEventListener('pointermove', (e) => {
    if (!editDrag || e.pointerId !== editDrag.id) return;
    editX = editDrag.dx + (e.clientX - editDrag.x);
    editY = editDrag.dy + (e.clientY - editDrag.y);
    terapkanTransform();
  });
  const endPhotoDrag = (e) => {
    if (!editDrag || e.pointerId !== editDrag.id) return;
    editDrag = null;
    photoStage.classList.remove('dragging');
  };
  photoStage.addEventListener('pointerup', endPhotoDrag);
  photoStage.addEventListener('pointercancel', endPhotoDrag);

  photoStage.addEventListener('dragover', (e) => {
    if (editMode !== 'upload') return;
    e.preventDefault();
    photoStage.classList.add('drop');
  });
  photoStage.addEventListener('dragleave', () => photoStage.classList.remove('drop'));
  photoStage.addEventListener('drop', (e) => {
    e.preventDefault();
    photoStage.classList.remove('drop');
    if (editMode !== 'upload') return;
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) bacaFotoFile(file);
  });

  $('photoLinkImg').addEventListener('error', () => {
    if (editMode === 'upload' && editImage) return;
    $('photoLinkImg').hidden = true;
    $('photoStageEmpty').hidden = false;
    $('photoStageEmpty').textContent = fotoAwal();
  });

  $('photoModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) tutupPhotoModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const pm = $('photoModal');
      if (pm && pm.classList.contains('show')) tutupPhotoModal();
      const dm = $('deleteAccountModal');
      if (dm && dm.classList.contains('show')) tutupDeleteModal();
    }
  });
}

/* ============================================================
   EVENTS LOGIN
   ============================================================ */
ui.tabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab || tab.dataset.tab === mode) return;
  setMode(tab.dataset.tab);
});

ui.authFoot.addEventListener('click', (e) => {
  if (e.target.id === 'toRegister') setMode('register');
  if (e.target.id === 'toLogin') setMode('login');
});

ui.eyeBtn.addEventListener('click', () => {
  const show = ui.password.type === 'password';
  ui.password.type = show ? 'text' : 'password';
  ui.eyeBtn.style.color = show ? '#2563eb' : '';
  ui.password.focus();
});

ui.helpLink.addEventListener('click', (e) => {
  e.preventDefault();
  const username = ui.username.value.trim();
  const text = username
    ? 'Halo kak, saya user "' + username + '" dari FinLoop dan butuh bantuan.'
    : WA_MESSAGE;
  window.open('https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
});

[ui.nama, ui.username, ui.password, ui.password2].forEach(el => {
  el.addEventListener('input', () => {
    clearError();
    markField(el, false);
  });
});

ui.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (ui.submitBtn.disabled) return;
  clearError();
  const nama = ui.nama.value.trim();
  const username = ui.username.value.trim();
  const pass = ui.password.value;
  const pass2 = ui.password2.value;

  const mulai = Date.now();
  setLoading(true);

  try {
    if (mode === 'register') await daftar(nama, username, pass, pass2);
    else await masuk(username, pass);
  } finally {
    const sisa = Math.max(0, 350 - (Date.now() - mulai));
    setTimeout(() => setLoading(false), sisa);
  }
});

/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  if (!apiTerisi()) {
    console.warn('[FinLoop] API_URL belum diisi — memakai penyimpanan lokal.');
  }

  const remembered = getRememberedUser();
  if (remembered) {
    ui.username.value = remembered;
    ui.remember.checked = true;
  }

  setMode('login');

  const session = getSession();
  if (session) {
    currentUser = session;
    document.documentElement.classList.add('has-session');

    initDashboard(true, true);

    if (apiTerisi()) {
      try {
        state.leaderboard = await ambilLeaderboard();
      } catch (e) {
        currentUser = null;
        dashInitialized = false;
        ui.page2.innerHTML = '';
        ui.page2.classList.remove('skip-layout-anim');

        document.documentElement.classList.remove('has-session');
        const p2 = ui.page2;
        p2.style.transition = 'none';
        p2.style.transform = 'translateY(100%)';
        const dl = $('dashLoading');
        if (dl) dl.classList.add('hide');

        showError(e.server
          ? e.message
          : 'Gagal memuat data akun. Periksa koneksi lalu refresh halaman.');
        ui.username.value = session.username;
        ui.password.focus();
        return;
      }

      try {
        state.transactions = await ambilTransaksi(session.username);
      } catch (e) {
        console.warn('[API] gagal memuat transaksi:', e.message);
        state.transactions = [];
      }
    }

    renderDashboardData(true);
  } else {
    ui.username.focus();
  }
});

/* ============================================================
   KEAMANAN CLIENT-SIDE (deterrent, bukan proteksi mutlak)
   
   CATATAN PENTING:
   Semua JavaScript di browser BISA dibaca siapa saja yang
   benar-benar berniat (via curl, Network tab, atau nonaktifkan JS).
   Blok ini hanya menyulitkan inspeksi kasual dan memblokir
   shortcut umum. Keamanan asli HARUS di sisi server (code.gs).
   ============================================================ */
(function securityGuards() {

  /* 1. Peringatan console — self-XSS protection */
  try {
    var big = 'color:#dc2626;font-size:36px;font-weight:900;text-shadow:0 2px 4px rgba(0,0,0,.15)';
    var sub = 'color:#18181b;font-size:14px;font-weight:600;line-height:1.5';
    console.log('%cSTOP!', big);
    console.log(
      '%cJangan pernah tempel (paste) kode apapun di sini.\n' +
      'Itu adalah celah "Self-XSS" — penipu bisa mencuri akunmu.\n\n' +
      'FinLoop tidak pernah meminta password, kode, atau data\n' +
      'pribadi apapun melalui Console.',
      sub
    );
  } catch (_) {}

  /* 2. Blokir klik kanan (context menu) — menutup "View source", "Save image as", "Inspect" */
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    return false;
  }, { capture: true });

  /* 3. Blokir shortcut DevTools, view-source, save, print, select-all */
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    var ctrl = e.ctrlKey || e.metaKey;
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    var inField = (tag === 'input' || tag === 'textarea');

    // F12
    if (k === 'f12') { e.preventDefault(); return false; }

    // Ctrl+Shift+I / J / C / K (DevTools di berbagai browser)
    if (ctrl && e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'k')) {
      e.preventDefault(); return false;
    }

    // Ctrl+U (view-source)
    if (ctrl && !e.shiftKey && k === 'u') { e.preventDefault(); return false; }

    // Ctrl+S (save page)
    if (ctrl && !e.shiftKey && k === 's') { e.preventDefault(); return false; }

    // Ctrl+P (print)
    if (ctrl && !e.shiftKey && k === 'p') { e.preventDefault(); return false; }

    // Ctrl+A di luar input
    if (ctrl && !e.shiftKey && k === 'a' && !inField) {
      e.preventDefault(); return false;
    }
  }, { capture: true });

  /* 4. Cegah drag gambar/svg keluar halaman */
  document.addEventListener('dragstart', function (e) {
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'img' || tag === 'svg') {
      e.preventDefault();
      return false;
    }
  }, { capture: true });

  /* 5. Cegah copy di luar input (dukung CSS user-select:none) */
  document.addEventListener('copy', function (e) {
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') {
      e.preventDefault();
      return false;
    }
  }, { capture: true });

  /* 6. Deteksi kasar DevTools — hanya peringatan console, tidak memblokir */
  var devtoolsWarned = false;
  var THRESHOLD = 160;
  function cekDevtools() {
    var w = window.outerWidth - window.innerWidth;
    var h = window.outerHeight - window.innerHeight;
    var opened = w > THRESHOLD || h > THRESHOLD;
    if (opened && !devtoolsWarned) {
      devtoolsWarned = true;
      try {
        console.warn(
          '%c[FinLoop] DevTools terdeteksi. Tutup untuk pengalaman terbaik.',
          'color:#dc2626;font-weight:800;font-size:13px'
        );
      } catch (_) {}
    } else if (!opened && devtoolsWarned) {
      devtoolsWarned = false;
    }
  }
  setInterval(cekDevtools, 1200);

  /* 7. Anti-framing (clickjacking): tolak jika di-embed di iframe */
  try {
    if (window.top !== window.self) {
      document.documentElement.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;' +
        'height:100vh;margin:0;font-family:sans-serif;font-size:15px;' +
        'color:#dc2626;font-weight:700;text-align:center;padding:24px;' +
        'background:#f4f5f7;">' +
        'FinLoop tidak boleh dijalankan di dalam iframe.' +
        '</div>';
      throw new Error('Framing tidak diizinkan.');
    }
  } catch (_) {}

  /* 8. Blokir drop file di luar editor foto (cegah navigasi tak sengaja) */
  function isPhotoDrop(e) {
    return !!(e.target && e.target.closest && e.target.closest('#photoStage'));
  }
  document.addEventListener('dragover', function (e) {
    if (!isPhotoDrop(e)) { e.preventDefault(); return false; }
  }, { capture: true });
  document.addEventListener('drop', function (e) {
    if (!isPhotoDrop(e)) { e.preventDefault(); return false; }
  }, { capture: true });

})();