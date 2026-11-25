/* Starlify Wallet — некастодиальный TON-кошелёк.
   Секретная фраза шифруется ПИН-кодом (PBKDF2 + AES-GCM) и хранится только в этом браузере.
   Ключи и фраза никуда не отправляются. Публичный адрес сообщается боту Starlify для проверки блокировки. */
(() => {
'use strict';
/* Telegram передаёт данные Mini App в hash при запуске: запоминаем их до того, как hash изменится */
const TG_INIT = (() => {
  try {
    const d = new URLSearchParams(location.hash.slice(1)).get('tgWebAppData');
    if (d) sessionStorage.setItem('vxw-tg', d);
    return d || sessionStorage.getItem('vxw-tg') || '';
  } catch (e) { return ''; }
})();
/* короткая метка устройства для журнала входов в админке (ОС · браузер) */
const DEVICE = (() => {
  try {
    const ua = navigator.userAgent;
    const os = /Android/i.test(ua) ? 'Android' : /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad'
      : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'устройство';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return (TG_INIT ? 'Telegram · ' : '') + os + (br ? ' · ' + br : '');
  } catch (e) { return ''; }
})().slice(0, 48);
/* чтобы кошелёк не стирался при закрытии приложения: просим браузер хранить данные постоянно.
   Работает и в установленном приложении (PWA/APK), и в расширении, и в обычном браузере. */
try {
  if (navigator.storage && navigator.storage.persist)
    navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});
} catch (e) {}
const TW = window.TonWeb, MN = TW && TW.mnemonic;
const app = document.getElementById('app');
const STORE = 'vxw', NET = 'vxw-net', LOCK_MS = 15 * 60 * 1000;

const S = {
  net: 'mainnet',   // только основная сеть TON
  keyPair: null, wallet: null, raw: '', addr: '',
  balance: 0, rate: { usd: 0, uah: 0 }, jettons: [], events: [], tab: 'tokens',
  draft: null, newWords: null, nfts: [], change24: null, updated: 0, prices: {},
  popImg: (() => { try { return JSON.parse(localStorage.getItem('vxw-popimg')) || {}; } catch (e) { return {}; } })(),
  theme: (() => { try { return localStorage.getItem('vxw-theme') || 'std'; } catch (e) { return 'std'; } })(),
  hideScam: (() => { try { return localStorage.getItem('vxw-hidescam') === '1'; } catch (e) { return false; } })(),
  hideZero: (() => { try { return localStorage.getItem('vxw-hidezero') === '1'; } catch (e) { return false; } })(),
  hide: (() => { try { return localStorage.getItem('vxw-hide') === '1'; } catch (e) { return false; } })()
};
const VERSIONS = ['v5R1', 'v4R2', 'v3R2'];
const VER_NAME = { v5R1: 'W5', v4R2: 'v4R2', v3R2: 'v3R2' };

/* ---------- helpers ---------- */
const $ = s => app.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeImg = u => /^https:\/\//.test(u || '') ? esc(u) : '';
const te = new TextEncoder(), td = new TextDecoder();
const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-6) : '';
const fmt = (n, d = 4) => (+n).toLocaleString('ru', { maximumFractionDigits: d });
// мелкие суммы не округляем до нуля: 0,00000001 TON показывается как есть
const fmtAmt = (n, maxDec = 9) => { const a = Math.abs(+n); return fmt(n, a === 0 ? 0 : a >= 1 ? 4 : a >= 0.0001 ? 6 : maxDec); };
const api = () => S.net === 'testnet' ? 'https://testnet.tonapi.io' : 'https://tonapi.io';
let tt;
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 1800);
}
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) { const a = document.createElement('textarea'); a.value = text; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); }
  toast(msg || 'Скопировано');
}
/* ---------- иконки (lucide, stroke 1.5) ---------- */
const IC = {
  up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  del: '<path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  updown: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'
};
const ic = (n, size = 18) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const STAR = (size = 16) => `<img class="emblem" src="emblem-96.png" width="${size}" height="${size}" alt="">`;
const TON_LOGO = '<svg class="logo-ton" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="28" fill="#0098EA"/><path fill="#fff" d="M37.56 15.63H18.44c-3.52 0-5.74 3.79-3.98 6.86l11.8 20.45a2 2 0 0 0 3.47 0l11.8-20.45c1.77-3.06-.46-6.86-3.97-6.86Zm-11.3 21.18-2.58-4.98-6.2-11.09a1.08 1.08 0 0 1 .95-1.62h7.82v17.69Zm12.25-16.07-6.2 11.1-2.57 4.97V19.12h7.82c.86 0 1.36.91.95 1.62Z"/></svg>';
const USDT_LOGO = '<svg class="logo-ton" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="28" fill="#26A17B"/><path fill="#fff" d="M31 25.3v-3.9h8.9v-5.9H16.1v5.9H25v3.9c-7.2.3-12.6 1.8-12.6 3.5s5.4 3.2 12.6 3.5v12.5h6V32.3c7.2-.3 12.6-1.8 12.6-3.5s-5.4-3.2-12.6-3.5Zm0 5.9c-.2 0-1.2.1-3 .1-1.5 0-2.6-.1-3-.1-6.4-.3-11.1-1.4-11.1-2.7s4.7-2.4 11.1-2.7v4.4c.4 0 1.6.1 3 .1 1.7 0 2.6-.1 3-.1v-4.4c6.4.3 11.1 1.4 11.1 2.7s-4.7 2.4-11.1 2.7Z"/></svg>';
/* сумма: целая часть ярко, дробная приглушённо */
function money(n, d = 4, cur = '') {
  const str = Math.abs(+n) > 0 && Math.abs(+n) < 10 ** -d ? fmtAmt(n) : fmt(n, d), k = str.lastIndexOf(',');
  const int = k < 0 ? str : str.slice(0, k), frac = k < 0 ? '' : str.slice(k);
  return `${int}<span class="frac">${frac}</span>${cur ? `<span class="cur">${cur}</span>` : ''}`;
}
/* Копирование сид-фразы: через минуту пробуем очистить буфер обмена */
let clipTimer;
async function copySeed(words) {
  await copy(words.join(' '), 'Фраза скопирована. Буфер очистится через минуту');
  clearTimeout(clipTimer);
  clipTimer = setTimeout(() => { navigator.clipboard?.writeText(' ').catch(() => {}); }, 60000);
}
/* TonAPI без ключа пускает ~1 запрос в секунду: на 429 ждём и повторяем */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchRetry(url, opts) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, opts);
    if (r.status !== 429 || i >= 4) return r;
    await sleep(1100 * (i + 1));
  }
}
async function get(path) {
  const r = await fetchRetry(api() + path);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
/* ---------- несколько кошельков ----------
   vxw-wallets = { active, list: [{ id, name, ver, pub, raw, kind, v, salt, iv, ct }] }
   Каждая запись — зашифрованная фраза своего кошелька. Старый формат (один кошелёк в 'vxw') переносится автоматически. */
const WALLETS = 'vxw-wallets';
function readWallets() {
  try { const w = JSON.parse(localStorage.getItem(WALLETS)); if (w && Array.isArray(w.list) && w.list.length) return w; } catch (e) {}
  try {
    const old = JSON.parse(localStorage.getItem(STORE));
    if (old && old.ct) {
      const w = { active: 'w1', list: [{ id: 'w1', name: 'Кошелёк 1', ...old }] };
      localStorage.setItem(WALLETS, JSON.stringify(w)); localStorage.removeItem(STORE);
      return w;
    }
  } catch (e) {}
  return null;
}
function writeWallets(w) { localStorage.setItem(WALLETS, JSON.stringify(w)); }
function loadStore() { const w = readWallets(); return w ? (w.list.find(x => x.id === w.active) || w.list[0]) : null; }
function saveWalletRecord(rec, replaceActive) {
  const w = readWallets() || { active: null, list: [] };
  const i = w.list.findIndex(x => x.id === w.active);
  if (replaceActive && i >= 0) { rec.id = w.active; rec.name = w.list[i].name; w.list[i] = rec; }
  else {
    rec.id = 'w' + Date.now().toString(36);
    let n = w.list.length + 1; while (w.list.some(x => x.name === `Кошелёк ${n}`)) n++;
    rec.name = rec.name || `Кошелёк ${n}`;
    w.list.push(rec); w.active = rec.id;
  }
  writeWallets(w);
}
function walletName() { return loadStore()?.name || 'Кошелёк'; }
const STICKERS = ['💎', '🚀', '⭐', '🔥', '🐳', '🦊', '🐸', '🐱', '🐶', '🦄', '👑', '💰', '🎯', '🍀', '⚡', '🌙', '🎮', '🛍️', '🏦', '🔒', '🌊', '🍕', '❤️', '😎', '🐼', '🍩', '🎵', '🌈', '🧊'];
const WCOLORS = ['#1677c9', '#7c5cff', '#e5484d', '#e8a23a', '#30a46c', '#3a3f47'];
function walletAvatar(rec, size = 40) {
  const bg = WCOLORS.includes(rec?.color) ? rec.color : '#3a3f47';
  const st = STICKERS.includes(rec?.sticker) ? rec.sticker : null;
  return `<span class="wav" style="width:${size}px;height:${size}px;background:${bg};font-size:${Math.round(size * (st ? 0.55 : 0.42))}px">${st || esc((rec?.name || 'К')[0].toUpperCase())}</span>`;
}
function resetWalletState() {
  forgetSecret();
  Object.assign(S, { wallet: null, raw: '', addr: '', balance: 0, jettons: [], events: [], nfts: [], loaded: false, updated: 0, rateAt: 0, draft: null, evMore: null, banned: false });
  lastSig = '';
}
async function switchWallet(id) {
  const w = readWallets(); if (!w || !w.list.some(x => x.id === id)) return;
  w.active = id; writeWallets(w);
  resetWalletState();
  await openPublic();
  S.tab = 'tokens';
  render('home'); refresh();
}
/* после входа/создания: если есть ожидающий запрос подключения (из ссылки/QR) — показать его */
function afterOpen() {
  if (S.tcPending && S.addr && !S.banned) { render('tcConnect'); refresh(); return; }
  render('home'); refresh();
}

/* ---------- crypto ---------- */
async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptWords(words, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(words.join(' '))));
  return { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
async function decryptWords(pass) {
  const s = loadStore(); if (!s) throw new Error('no wallet');
  const key = await deriveKey(pass, unb64(s.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, key, unb64(s.ct));
  return td.decode(pt).split(' ');
}

/* ---------- W5 (wallet v5r1) ----------
   Стандартный кошелёк Tonkeeper с 2024 года. В TonWeb его нет, поэтому собран здесь
   по спецификации TON; код контракта взят из сети, хэш сверяется при запуске. */
const W5_CODE = 'te6cckECFAEAAoEAART/APSkE/S88sgLAQIBIAINAgFIAwQC3NAg10nBIJFbj2Mg1wsfIIIQZXh0br0hghBzaW50vbCSXwPgghBleHRuuo60gCDXIQHQdNch+kAw+kT4KPpEMFi9kVvg7UTQgQFB1yH0BYMH9A5voTGRMOGAQNchcH/bPOAxINdJgQKAuZEw4HDiEA8CASAFDAIBIAYJAgFuBwgAGa3OdqJoQCDrkOuF/8AAGa8d9qJoQBDrkOuFj8ACAUgKCwAXsyX7UTQcdch1wsfgABGyYvtRNDXCgCAAGb5fD2omhAgKDrkPoCwBAvIOAR4g1wsfghBzaWduuvLgin8PAeaO8O2i7fshgwjXIgKDCNcjIIAg1yHTH9Mf0x/tRNDSANMfINMf0//XCgAK+QFAzPkQmiiUXwrbMeHywIffArNQB7Dy0IRRJbry4IVQNrry4Ib4I7vy0IgikvgA3gGkf8jKAMsfAc8Wye1UIJL4D95w2zzYEAP27aLt+wL0BCFukmwhjkwCIdc5MHCUIccAs44tAdcoIHYeQ2wg10nACPLgkyDXSsAC8uCTINcdBscSwgBSMLDy0InXTNc5MAGk6GwShAe78uCT10rAAPLgk+1V4tIAAcAAkVvg69csCBQgkXCWAdcsCBwS4lIQseMPINdKERITAJYB+kAB+kT4KPpEMFi68uCR7UTQgQFB1xj0BQSdf8jKAEAEgwf0U/Lgi44UA4MH9Fvy4Iwi1woAIW4Bs7Dy0JDiyFADzxYS9ADJ7VQAcjDXLAgkji0h8uCS0gDtRNDSAFETuvLQj1RQMJExnAGBAUDXIdcKAPLgjuLIygBYzxbJ7VST8sCN4gAQk1vbMeHXTNC01sNe';
const W5_CODE_HASH = '20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f';
class W5Wallet {
  constructor(publicKey, testnet) {
    this.publicKey = publicKey;
    this.walletId = testnet ? 2147483645 : 2147483409;   // network_id XOR context (workchain 0, subwallet 0)
    this.code = TW.boc.Cell.oneFromBoc(TW.utils.base64ToBytes(W5_CODE));
    const self = this;
    this.methods = { transfer: p => ({ getQuery: () => self.transferQuery(p) }), transfers: p => ({ getQuery: () => self.transfersQuery(p) }) };
  }
  data() {
    const d = new TW.boc.Cell();
    d.bits.writeBit(1); d.bits.writeUint(0, 32); d.bits.writeUint(this.walletId, 32);
    d.bits.writeBytes(this.publicKey); d.bits.writeBit(0);
    return d;
  }
  stateInit() {
    const s = new TW.boc.Cell();
    s.bits.writeBit(0); s.bits.writeBit(0);
    s.bits.writeBit(1); s.refs.push(this.code);
    s.bits.writeBit(1); s.refs.push(this.data());
    s.bits.writeBit(0);
    return s;
  }
  async getAddress() {
    if (!this.addr) {
      if (TW.utils.bytesToHex(await this.code.hash()) !== W5_CODE_HASH) throw new Error('W5 code hash mismatch');
      this.addr = new TW.utils.Address('0:' + TW.utils.bytesToHex(await this.stateInit().hash()));
    }
    return this.addr;
  }
  async transferQuery({ secretKey, toAddress, amount, seqno, payload, sendMode }) {
    return this.transfersQuery({ secretKey, seqno, messages: [{ toAddress, amount, payload, sendMode }] });
  }
  async transfersQuery({ secretKey, seqno, messages, validUntil }) {
    const C = TW.boc.Cell;
    // список действий: каждое следующее ссылается на предыдущее
    let act = new C();
    for (const m of messages) {
      // W5 принимает от внешних сообщений только режимы с флагом +2
      const mode = m.sendMode === 128 ? 130 : ((m.sendMode ?? 3) | 2);
      const msg = TW.Contract.createOutMsg(m.toAddress, m.amount, m.payload || '', m.stateInit || null);
      const a = new C();
      a.refs.push(act);
      a.bits.writeUint(0x0ec3c86d, 32); a.bits.writeUint(mode, 8); a.refs.push(msg);
      act = a;
    }
    const sm = new C();
    sm.bits.writeUint(0x7369676e, 32);                    // "sign"
    sm.bits.writeUint(this.walletId, 32);
    sm.bits.writeUint(seqno === 0 ? 0xffffffff : (validUntil || Math.floor(Date.now() / 1000) + 60), 32);
    sm.bits.writeUint(seqno, 32);
    sm.bits.writeBit(1); sm.refs.push(act);
    sm.bits.writeBit(0);
    const sig = secretKey ? TW.utils.nacl.sign.detached(await sm.hash(), secretKey) : new Uint8Array(64);
    const body = new C(); body.writeCell(sm); body.bits.writeBytes(sig);
    const addr = await this.getAddress();
    return TW.Contract.createCommonMsgInfo(TW.Contract.createExternalMessageHeader(addr), seqno === 0 ? this.stateInit() : null, body);
  }
}
function makeWallet(ver, publicKey) {
  return ver === 'v5R1' ? new W5Wallet(publicKey, S.net === 'testnet')
    : new TW.Wallets.all[ver](new TW.HttpProvider(), { publicKey, wc: 0 });
}

/* ---------- wallet ---------- */
async function openWallet(words, ver) {
  ver = VERSIONS.includes(ver) ? ver : (loadStore()?.ver || 'v4R2');
  const kp = await MN.mnemonicToKeyPair(words);
  const w = makeWallet(ver, kp.publicKey);
  S.ver = ver;
  const a = await w.getAddress();
  S.keyPair = kp; S.pub = kp.publicKey; S.wallet = w; S.addrObj = a;
  setAddr();
}
/* Обычное открытие: только публичный ключ, секретный ключ не расшифровывается */
async function openPublic() {
  const st = loadStore();
  S.ver = st.ver || 'v4R2';
  S.pub = TW.utils.hexToBytes(st.pub);
  S.wallet = makeWallet(S.ver, S.pub);
  S.addrObj = await S.wallet.getAddress();
  setAddr();
  loadCache();          // последние данные — на экран сразу, свежие подтянутся следом
  setTimeout(tcListen, 0);
  checkBan().then(b => { S.banned = b; if (b && !['phrase', 'pin', 'wallets', 'reset'].includes(S.view)) render('banned'); });
}
/* ---------- блокировка адреса администратором (бот Starlify) ----------
   Если бот недоступен, кошелёк работает как обычно. Деньги заблокированного адреса остаются его владельцу. */
const BOT_API = 'https://starlify-bot.onrender.com';
async function checkBan() {
  try {
    const src = TG_INIT ? 'tg' : (matchMedia('(display-mode: standalone)').matches ? 'app' : 'web');
    const r = await fetch(`${BOT_API}/api/check`, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ a: S.raw, net: S.net, ver: S.ver, src, dev: DEVICE, bal: S.balance || 0, init: TG_INIT })
    });
    if (!r.ok) return false;
    return !!(await r.json()).banned;
  } catch (e) { return false; }
}
function viewBanned() {
  app.innerHTML = `<div class="view status"><div class="big fail">${ic('x', 36)}</div>
    <h2>Доступ ограничен</h2>
    <p class="muted">Этот кошелёк заблокирован администрацией Starlify. Деньги остаются твоими: их можно вывести через любой TON-кошелёк по секретной фразе</p>
    <button class="btn" id="b-phrase">Показать секретную фразу</button>
    ${(readWallets()?.list.length || 0) > 1 ? '<button class="btn" id="b-wallets">Другие кошельки</button>' : ''}
  </div>`;
  $('#b-phrase').onclick = () => render('phrase');
  const bw = $('#b-wallets'); if (bw) bw.onclick = () => render('wallets');
}
function forgetSecret() { if (S.keyPair) S.keyPair.secretKey.fill(0); S.keyPair = null; }
function setAddr() {
  S.raw = S.addrObj.toString(false).toLowerCase();
  S.addr = S.addrObj.toString(true, true, false, S.net === 'testnet');
}
function lock() {
  if (S.keyPair) { S.keyPair.secretKey.fill(0); }
  S.keyPair = null; S.wallet = null; S.balance = 0; S.jettons = []; S.events = []; S.nfts = []; S.loaded = false;
  render('unlock');
}
let idle;
function bumpIdle() { clearTimeout(idle); if (S.keyPair) idle = setTimeout(() => { lock(); toast('Кошелёк заблокирован'); }, LOCK_MS); }
['pointerdown', 'keydown'].forEach(e => addEventListener(e, bumpIdle, { passive: true }));

/* популярные токены: показываются даже с нулевым балансом */
const POPULAR = [
  { id: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', friendly: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', name: 'Tether USD', symbol: 'USD₮', decimals: 6, logo: () => USDT_LOGO },
  { id: '0:2f956143c461769579baef2e32cc2d7bc18283f40d20bb03e432cd603ac33ffc', friendly: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT', name: 'Notcoin', symbol: 'NOT', decimals: 9 },
  { id: '0:afc49cb8786f21c87045b19ede78fc6b46c51048513f8e9a6d44060199c1bf0c', friendly: 'EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS', name: 'DOGS', symbol: 'DOGS', decimals: 9 }
];
const cacheKey = () => 'vxw-cache-' + S.raw;
function saveCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({ balance: S.balance, jettons: S.jettons, events: S.events.slice(0, 40), nfts: S.nfts.slice(0, 60),
      rate: S.rate, prices: S.prices, change24: S.change24, updated: S.updated }));
  } catch (e) {}
}
function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey())); if (!c) return false;
    Object.assign(S, { balance: c.balance || 0, jettons: c.jettons || [], events: c.events || [], nfts: c.nfts || [],
      rate: c.rate || { usd: 0, uah: 0 }, prices: c.prices || {}, change24: c.change24 ?? null, updated: c.updated || 0, loaded: true });
    return true;
  } catch (e) { return false; }
}
let lastSig = '';
const paint = () => {
  if (S.view !== 'home') return;
  const sig = JSON.stringify([S.balance, S.rate, S.prices, S.jettons.map(j => j.balance + j.jetton.address), S.tab === 'history' ? S.events.length : 0, S.nfts.length, S.hide, S.hideZero, S.tab]);
  if (sig === lastSig && document.querySelector('#app .balance')) { const a = document.getElementById('ago'); if (a) a.textContent = agoText(); return; }
  lastSig = sig; renderHome();
};

async function refresh() {
  if (!S.raw || S.refreshing) return;
  S.refreshing = true;
  const raw = encodeURIComponent(S.raw);
  try {
    // 1) баланс TON — сразу на экран
    try { const a = await get(`/v2/accounts/${raw}`); S.balance = Number(a.balance) / 1e9; S.status = a.status; S.loaded = true; S.updated = Date.now(); paint(); } catch (e) {}
    // 2) курсы TON и популярных токенов одним запросом
    if (Date.now() - (S.rateAt || 0) > 60000) {
      try {
        const r = await fetchRetry(`https://tonapi.io/v2/rates?tokens=ton,${POPULAR.map(t => t.friendly).join(',')}&currencies=usd,uah`).then(x => x.ok ? x.json() : Promise.reject(x.status));
        const rates = r.rates || {}, t = rates.TON || rates.ton;
        if (t?.prices) {
          S.rate = { usd: t.prices.USD, uah: t.prices.UAH }; S.rateAt = Date.now();
          const ch = parseFloat(String(t.diff_24h?.USD || '').replace('−', '-').replace('%', ''));
          S.change24 = Number.isFinite(ch) ? ch : null;
        }
        S.prices = S.prices || {};
        for (const tok of POPULAR) {
          const v = rates[tok.friendly] || rates[tok.id] || rates[tok.id.toUpperCase()];
          if (v?.prices?.USD) S.prices[tok.id] = v.prices.USD;
        }
        paint();
      } catch (e) {}
    }
    // 2б) логотипы популярных токенов — один раз, потом из памяти
    for (const t of POPULAR) {
      if (t.logo || S.popImg[t.id]) continue;
      try { const m = await get(`/v2/jettons/${t.friendly}`); const u = m.preview || m.metadata?.image; if (/^https:\/\//.test(u || '')) { S.popImg[t.id] = u; try { localStorage.setItem('vxw-popimg', JSON.stringify(S.popImg)); } catch (e) {} } } catch (e) {}
    }
    // 3) токены
    try {
      const j = await get(`/v2/accounts/${raw}/jettons?currencies=usd`);
      S.jettons = (j.balances || []).filter(x => x.balance !== '0');
      paint();
    } catch (e) {}
    // 4) история, спам-переводы прячем
    try {
      const ev = await get(`/v2/accounts/${raw}/events?limit=40`);
      const fresh = ev.events || [];
      // свежая первая страница + уже подгруженные старые операции
      const ids = new Set(fresh.map(e => e.event_id));
      const older = S.events.filter(e => !ids.has(e.event_id) && fresh.length && e.lt < fresh[fresh.length - 1].lt);
      S.events = fresh.concat(older);
      if (S.evMore == null) S.evMore = fresh.length >= 40;
      if (S.tab === 'history') paint();
    } catch (e) {}
    // 5) NFT
    try {
      const n = await get(`/v2/accounts/${raw}/nfts?limit=60&indirect_ownership=false`);
      S.nfts = n.nft_items || [];
    } catch (e) {}
    S.loaded = true; S.updated = Date.now();
    saveCache(); paint();
  } finally { S.refreshing = false; }
}

/* При импорте смотрим, на какой версии кошелька лежат деньги */
async function detectVersion(words) {
  try {
    const kp = await MN.mnemonicToKeyPair(words);
    const found = await Promise.all(VERSIONS.map(async v => {
      const a = await makeWallet(v, kp.publicKey).getAddress();
      try { const acc = await get(`/v2/accounts/${encodeURIComponent(a.toString(false))}`); return { v, bal: Number(acc.balance), active: acc.status === 'active' }; }
      catch (e) { return { v, bal: 0, active: false }; }
    }));
    kp.secretKey.fill(0);
    found.sort((a, b) => (b.active - a.active) || (b.bal - a.bal));
    return found[0].active || found[0].bal > 0 ? found[0].v : 'v5R1';
  } catch (e) { return 'v5R1'; }
}

/* ---------- ПИН-код ---------- */
const PIN_LEN = 4, ATT = 'vxw-att';
function attempts() { try { return JSON.parse(localStorage.getItem(ATT)) || { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; } }
function setAttempts(a) { try { localStorage.setItem(ATT, JSON.stringify(a)); } catch (e) {} }
let pinKey = null;
addEventListener('keydown', e => { if (pinKey && document.querySelector('.pin-view')) pinKey(e); });
/* opts: { title, sub, back, forgot, throttle, check: async pin => true | false | 'текст ошибки' } */
function pinPad(opts) {
  S.view = 'pin';
  let pin = '', busy = false;
  app.innerHTML = `<div class="view pin-view">
    ${opts.back ? `<button class="back" id="b-back">${ic('back', 16)}Назад</button>` : ''}
    <h2>${esc(opts.title)}</h2>
    <p class="muted">${esc(opts.sub || '')}</p>
    <div class="dots" id="dots">${'<i></i>'.repeat(PIN_LEN)}</div>
    <div class="err" id="err"></div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<span></span><button data-k="0">0</button><button data-k="del" aria-label="Стереть">${ic('del', 24)}</button></div>
    ${opts.forgot ? '<button class="btn danger" id="b-forgot">Забыл(а) ПИН-код</button>' : ''}
  </div>`;
  const dots = () => { const d = $('#dots'); if (d) d.querySelectorAll('i').forEach((x, i) => x.classList.toggle('on', i < pin.length)); };
  const press = async k => {
    if (busy || !$('#dots')) return;
    if (opts.throttle) {
      const a = attempts();
      if (Date.now() < a.until) { $('#err').textContent = `Слишком много попыток. Подожди ${Math.ceil((a.until - Date.now()) / 1000)} сек.`; return; }
    }
    if (k === 'del') { pin = pin.slice(0, -1); dots(); return; }
    if (pin.length >= PIN_LEN) return;
    pin += k; dots(); $('#err').textContent = '';
    if (pin.length < PIN_LEN) return;
    busy = true;
    const r = await opts.check(pin);
    busy = false;
    if (r === true) { if (opts.throttle) setAttempts({ n: 0, until: 0 }); return; }
    if (!$('#dots')) return;
    let msg = typeof r === 'string' ? r : 'Неверный ПИН-код';
    if (opts.throttle && r === false) {
      const a = attempts(); a.n++;
      if (a.n >= 5) { a.until = Date.now() + 30000 * 2 ** (a.n - 5); msg = `Неверный ПИН-код. Следующая попытка через ${Math.round((a.until - Date.now()) / 1000)} сек.`; }
      else msg += ` (осталось попыток: ${5 - a.n})`;
      setAttempts(a);
    }
    $('#dots').classList.add('shake'); setTimeout(() => $('#dots')?.classList.remove('shake'), 400);
    $('#err').textContent = msg;
    pin = ''; dots();
  };
  app.querySelectorAll('[data-k]').forEach(b => b.onclick = () => press(b.dataset.k));
  pinKey = e => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
  if (opts.back) $('#b-back').onclick = opts.back;
  if (opts.forgot) $('#b-forgot').onclick = opts.forgot;
}

/* ---------- views ---------- */
function render(view, arg) {
  S.view = view;
  document.getElementById('splash')?.remove();
  document.body.classList.remove('still');
  (V[view] || V.welcome)(arg);
  scrollTo(0, 0);
}
const V = {};
V.banned = viewBanned;

/* ---------- установка как приложение ---------- */
let installEvt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
addEventListener('appinstalled', () => { installEvt = null; toast('Приложение установлено'); });
const installBtn = () => isStandalone() ? '' : '<button class="btn" id="b-install">⤓ Установить приложение на ПК или телефон</button>';
function bindInstall() {
  const b = $('#b-install'); if (!b) return;
  b.onclick = async () => {
    if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; }
    else render('install');
  };
}
V.install = () => {
  const back = S.raw ? 'settings' : 'welcome';
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Установить приложение</h2>
    <p class="muted">Кошелёк ставится как обычное приложение: своя иконка, отдельное окно, без адресной строки. Скачивать ничего не нужно.</p>
    <div class="sum">
      <div><span>${isIOS ? '<b style="color:var(--acc)">iPhone / iPad</b>' : 'iPhone / iPad'}</span><span>Открой сайт в Safari → кнопка «Поделиться» □↑ → «На экран „Домой“»</span></div>
      <div><span>Android</span><span>Chrome → меню ⋮ → «Установить приложение» (или «Добавить на главный экран»)</span></div>
      <div><span>Windows / Mac</span><span>Chrome или Edge → значок ⊕ справа в адресной строке, или меню ⋮ → «Установить Starlify Wallet»</span></div>
    </div>
    <p class="muted">Кошелёк в приложении тот же, что и в браузере на этом устройстве: ничего переносить не нужно.</p>
  </div>`;
  $('#b-back').onclick = () => render(back);
};

V.welcome = () => {
  app.innerHTML = `<div class="view welcome">
    <div class="welcome-hero">
      <div class="preview" aria-hidden="true">
        <div class="preview-head"><span>${STAR(16)}Starlify</span>TON</div>
        <div class="preview-row"><div class="ico sm">${TON_LOGO}</div><b>Toncoin</b><small>TON</small></div>
        <div class="preview-row"><div class="ico sm">${USDT_LOGO}</div><b>Tether USD</b><small>USD₮</small></div>
      </div>
      <h1>Твой TON.<br><span>Твои ключи.</span></h1>
      <p class="muted">Ключи хранятся только на твоём устройстве, мы их не видим</p>
    </div>
    <ul class="feats">
      <li>${ic('key')}<div><b>Ключи у тебя</b><small>24 слова шифруются ПИН-кодом на устройстве</small></div></li>
      <li>${ic('layers')}<div><b>TON, USDT и NFT</b><small>Все активы сети TON в одном месте</small></div></li>
      <li>${ic('percent')}<div><b>Комиссия от 0,0005 TON</b><small>Только плата сети, без наценки</small></div></li>
    </ul>
    <div class="cta">
      <button class="btn primary" id="b-new">Создать кошелёк</button>
      <button class="btn" id="b-imp">У меня уже есть кошелёк</button>
    </div>
  </div>`;
  bindInstall();
  $('#b-new').onclick = async () => { S.newWords = await MN.generateMnemonic(); render('create'); };
  $('#b-imp').onclick = () => render('import');
};

V.create = () => {
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Секретная фраза</h2>
    <p class="muted">Это 24 слова, которые и есть твой кошелёк. Запиши их на бумагу по порядку и храни в надёжном месте.</p>
    <div class="note"><b>Никому не показывай эти слова.</b> Кто знает фразу, тот владеет деньгами. Если потеряешь фразу, восстановить кошелёк не сможет никто.</div>
    <div class="words blur" id="words">${S.newWords.map((w, i) => `<div><i>${i + 1}</i>${esc(w)}</div>`).join('')}</div>
    <button class="btn" id="b-show">Показать слова</button>
    <button class="btn primary" id="b-next" disabled>Я записал(а) все 24 слова</button>
  </div>`;
  $('#b-back').onclick = () => { S.newWords = null; render(S.adding ? 'wallets' : 'welcome'); };
  $('#b-show').onclick = () => {
    $('#words').classList.remove('blur'); $('#b-next').disabled = false;
    $('#b-show').textContent = 'Скопировать фразу';
    $('#b-show').onclick = () => copySeed(S.newWords);
  };
  $('#b-next').onclick = () => render('confirm');
};

V.confirm = () => {
  const idx = [];
  while (idx.length < 3) { const n = crypto.getRandomValues(new Uint32Array(1))[0] % 24; if (!idx.includes(n)) idx.push(n); }
  idx.sort((a, b) => a - b);
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}К словам</button>
    <h2>Проверка</h2>
    <p class="muted">Введи слова под этими номерами, чтобы убедиться, что фраза записана верно.</p>
    ${idx.map(i => `<label class="field"><small class="lbl">Слово №${i + 1}</small><input data-i="${i}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>`).join('')}
    <div class="err" id="err"></div>
    <button class="btn primary" id="b-ok">Проверить</button>
  </div>`;
  $('#b-back').onclick = () => render('create');
  $('#b-ok').onclick = () => {
    const ok = [...app.querySelectorAll('input[data-i]')].every(inp => inp.value.trim().toLowerCase() === S.newWords[+inp.dataset.i]);
    if (!ok) { $('#err').textContent = 'Слова не совпадают. Проверь, что записал(а) фразу правильно.'; return; }
    render('setpass', { words: S.newWords, ver: 'v5R1' });
  };
};

V.import = () => {
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Импорт кошелька</h2>
    <p class="muted">Введи 24 слова секретной фразы через пробел. Фраза останется только в этом браузере.</p>
    <label class="field"><small class="lbl">Секретная фраза</small><textarea id="words" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="word1 word2 … word24"></textarea></label>
    <div class="err" id="err"></div>
    <button class="btn primary" id="b-ok">Продолжить</button>
    <p class="muted">Подходят кошельки Tonkeeper, MyTonWallet, Tonhub и других: новые W5 и старые v4R2, v3R2. Версия определится сама по балансу.</p>
  </div>`;
  $('#b-back').onclick = () => render(S.adding ? 'wallets' : 'welcome');
  $('#b-ok').onclick = async () => {
    const words = $('#words').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length !== 24) { $('#err').textContent = `Нужно 24 слова, сейчас ${words.length}.`; return; }
    if (!(await MN.validateMnemonic(words))) { $('#err').textContent = 'Фраза не подходит. Проверь слова и их порядок.'; return; }
    $('#b-ok').disabled = true; $('#b-ok').textContent = 'Ищу кошелёк…';
    $('#words').value = '';
    const ver = await detectVersion(words);
    render('setpass', { words, ver });
  };
};

V.setpass = arg => {
  const words = Array.isArray(arg) ? arg : arg.words, ver = Array.isArray(arg) ? 'v5R1' : arg.ver;
  const existing = readWallets();
  if (existing && !arg.migrate && loadStore()?.kind === 'pin') {
    return pinPad({
      title: 'Введи ПИН-код', sub: 'Новый кошелёк будет защищён тем же ПИН-кодом', throttle: true,
      back: () => render('wallets'),
      check: async pin => {
        try { (await decryptWords(pin)).fill(''); } catch (e) { return false; }
        const enc = await encryptWords(words, pin);
        resetWalletState();
        await openWallet(words, ver);
        Object.assign(enc, { kind: 'pin', pub: TW.utils.bytesToHex(S.keyPair.publicKey), ver, raw: S.raw });
        try { saveWalletRecord(enc, false); } catch (e) { return 'Браузер не даёт сохранить данные'; }
        words.fill(''); S.newWords = null; S.adding = false; forgetSecret();
        loadCache(); S.tab = 'tokens';
        afterOpen(); toast('Кошелёк добавлен');
        return true;
      }
    });
  }
  pinPad({
    title: arg.migrate ? 'Теперь вход по ПИН-коду' : 'Придумай ПИН-код',
    sub: '4 цифры. Нужен, чтобы открыть кошелёк и подтвердить перевод.',
    check: async p1 => {
      pinPad({
        title: 'Повтори ПИН-код', sub: 'Введи те же 4 цифры ещё раз.',
        back: () => render('setpass', arg),
        check: async p2 => {
          if (p2 !== p1) return 'ПИН-коды не совпадают';
          const enc = await encryptWords(words, p2);
          await openWallet(words, ver);
          Object.assign(enc, { kind: 'pin', pub: TW.utils.bytesToHex(S.keyPair.publicKey), ver, raw: S.raw });
          try { saveWalletRecord(enc, !!arg.migrate); }
          catch (e) { return 'Браузер не даёт сохранить данные (приватный режим?)'; }
          setAttempts({ n: 0, until: 0 });
          words.fill(''); S.newWords = null; forgetSecret();
          afterOpen(); toast('ПИН-код установлен');
          return true;
        }
      });
      return true;
    }
  });
};

V.unlock = () => {
  const st = loadStore();
  if (st && st.kind === 'pin') {
    return pinPad({
      title: 'С возвращением', sub: 'Введи ПИН-код', throttle: true,
      forgot: () => render('reset'),
      check: async pin => {
        let w;
        try { w = await decryptWords(pin); } catch (e) { return false; }
        await openWallet(w); forgetSecret(); afterOpen();
        return true;
      }
    });
  }
  // старый кошелёк с паролем: один раз входим по паролю и переходим на ПИН
  app.innerHTML = `<div class="view">
    <h1>С возвращением</h1>
    <p class="muted">Введи старый пароль один раз. После этого вход будет по ПИН-коду из 4 цифр.</p>
    <label class="field"><small class="lbl">Пароль</small><input type="password" id="p" autocomplete="current-password"></label>
    <div class="err" id="err"></div>
    <button class="btn primary" id="b-ok">Открыть</button>
    <button class="btn danger" id="b-forgot">Забыл(а) пароль</button>
  </div>`;
  const go = async () => {
    $('#b-ok').disabled = true;
    try { const w = await decryptWords($('#p').value); render('setpass', { words: w, ver: st?.ver || 'v4R2', migrate: true }); }
    catch (e) { $('#err').textContent = 'Неверный пароль.'; $('#b-ok').disabled = false; }
  };
  $('#b-ok').onclick = go;
  $('#p').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#p').focus();
  $('#b-forgot').onclick = () => render('reset');
};

V.reset = () => {
  const name = walletName();
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Удалить «${esc(name)}» с этого устройства</h2>
    <div class="note">Кошелёк исчезнет только из этого браузера, деньги останутся в блокчейне. Вернуть его можно по <b>секретной фразе</b>. Без фразы доступ к деньгам будет потерян навсегда.</div>
    <label class="field"><small class="lbl">Напиши «удалить», чтобы подтвердить</small><input id="c" autocomplete="off"></label>
    <button class="btn danger" id="b-del">Удалить кошелёк</button>
  </div>`;
  $('#b-back').onclick = () => render(S.raw ? 'settings' : (loadStore() ? 'unlock' : 'welcome'));
  $('#b-del').onclick = async () => {
    if ($('#c').value.trim().toLowerCase() !== 'удалить') { toast('Напиши «удалить»'); return; }
    const w = readWallets();
    const left = w ? w.list.filter(x => x.id !== w.active) : [];
    try { if (S.raw) localStorage.removeItem('vxw-cache-' + S.raw); } catch (e) {}
    resetWalletState(); S.pub = null;
    if (left.length) { writeWallets({ active: left[0].id, list: left }); await switchWallet(left[0].id); toast('Кошелёк удалён'); return; }
    try { Object.keys(localStorage).filter(k => k.startsWith('vxw')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    render('welcome');
  };
};

/* ---------- список кошельков ---------- */
V.wallets = async () => {
  const w = readWallets(); if (!w) return render('welcome');
  const rows = await Promise.all(w.list.map(async rec => {
    let raw = rec.raw;
    if (!raw && rec.pub) { try { raw = (await makeWallet(rec.ver || 'v4R2', TW.utils.hexToBytes(rec.pub)).getAddress()).toString(false).toLowerCase(); } catch (e) {} }
    let bal = null;
    try { const c = JSON.parse(localStorage.getItem('vxw-cache-' + raw)); if (c) bal = c.balance; } catch (e) {}
    return { rec, addr: raw ? friendly(raw, false) : '', bal };
  }));
  if (S.view !== 'wallets') return;
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Кошельки</h2>
    <div class="wallets">${rows.map(({ rec, addr, bal }) => `
      <div class="wrow ${rec.id === w.active ? 'on' : ''}" data-id="${esc(rec.id)}">
        <button class="wpick" data-id="${esc(rec.id)}">
          ${walletAvatar(rec, 40)}
          <span class="wmid"><b>${esc(rec.name)}</b><small>${esc(short(addr))}${rec.ver ? ' · ' + (VER_NAME[rec.ver] || rec.ver) : ''}</small></span>
          <span class="wbal">${bal == null ? '' : S.hide ? '••••' : fmt(bal, 2) + ' TON'}</span>
        </button>
        <button class="wedit" data-id="${esc(rec.id)}" aria-label="Изменить">${ic('edit', 16)}</button>
      </div>`).join('')}
    </div>
    <button class="btn primary" id="b-newwallet">${ic('plus', 18)}Создать новый кошелёк</button>
    <button class="btn" id="b-impwallet">Добавить по секретной фразе</button>
  </div>`;
  $('#b-back').onclick = () => render(S.raw ? 'home' : 'welcome');
  app.querySelectorAll('.wpick').forEach(b => b.onclick = () => { if (b.dataset.id === w.active) render('home'); else switchWallet(b.dataset.id); });
  app.querySelectorAll('.wedit').forEach(b => b.onclick = () => render('rename', b.dataset.id));
  $('#b-newwallet').onclick = async () => { S.adding = true; S.newWords = await MN.generateMnemonic(); render('create'); };
  $('#b-impwallet').onclick = () => { S.adding = true; render('import'); };
};
V.rename = id => {
  const w = readWallets(); const rec = w?.list.find(x => x.id === id); if (!rec) return render('wallets');
  let sticker = rec.sticker || null, color = rec.color || WCOLORS[0];
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <div class="rename-prev" id="prev"></div>
    <label class="field"><small class="lbl">Название</small><input id="nm" maxlength="24" value="${esc(rec.name)}" autocomplete="off"></label>
    <div class="field"><small class="lbl">Стикер</small><div class="stickers">
      <button type="button" class="st ${!sticker ? 'on' : ''}" data-st="">Аа</button>
      ${STICKERS.map(e => `<button type="button" class="st ${sticker === e ? 'on' : ''}" data-st="${e}">${e}</button>`).join('')}</div></div>
    <div class="field"><small class="lbl">Цвет</small><div class="colors">${WCOLORS.map(c => `<button type="button" class="cl ${color === c ? 'on' : ''}" data-cl="${c}" style="background:${c}" aria-label="Цвет"></button>`).join('')}</div></div>
    <button class="btn primary" id="b-save">Сохранить</button>
  </div>`;
  const prev = () => { $('#prev').innerHTML = walletAvatar({ name: $('#nm').value || rec.name, sticker, color }, 72); };
  prev();
  $('#nm').oninput = prev;
  app.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { sticker = b.dataset.st || null; app.querySelectorAll('[data-st]').forEach(x => x.classList.toggle('on', x === b)); prev(); });
  app.querySelectorAll('[data-cl]').forEach(b => b.onclick = () => { color = b.dataset.cl; app.querySelectorAll('[data-cl]').forEach(x => x.classList.toggle('on', x === b)); prev(); });
  const save = () => {
    const v = $('#nm').value.trim().slice(0, 24); if (!v) return toast('Введи название');
    const w2 = readWallets(); const r2 = w2.list.find(x => x.id === id);
    if (r2) { r2.name = v; r2.sticker = sticker; r2.color = color; writeWallets(w2); }
    render('wallets');
  };
  $('#b-back').onclick = () => render('wallets');
  $('#b-save').onclick = save;
  $('#nm').onkeydown = e => { if (e.key === 'Enter') save(); };
};

const hid = s => S.hide ? '••••' : s;
function portfolio() {
  let usd = S.balance * (S.rate.usd || 0);
  for (const j of S.jettons) { const p = j.price?.prices?.USD; if (p) usd += Number(j.balance) / 10 ** (j.jetton.decimals ?? 9) * p; }
  return { usd, uah: S.rate.usd ? usd / S.rate.usd * S.rate.uah : 0 };
}
function agoText() {
  if (!S.updated) return '';
  const s = Math.round((Date.now() - S.updated) / 1000);
  return s < 10 ? 'только что' : s < 60 ? `${s} сек назад` : `${Math.round(s / 60)} мин назад`;
}

function renderHome() {
  if (S.banned) return V.banned();
  // повторная отрисовка того же экрана: без анимации и без прыжка прокрутки
  const again = S.view === 'home' && !!document.querySelector('#app .balance');
  const y = again ? scrollY : 0;
  if (again) document.body.classList.add('still');
  const pf = portfolio(), test = S.net === 'testnet';
  const big = !S.loaded ? '…' : test || !pf.uah ? money(S.balance, 4, 'TON') : money(pf.uah, 2, '₴');
  const sub = !S.loaded ? '' : test ? 'тестовые TON, без стоимости' : `${fmt(S.balance)} TON · $${fmt(pf.usd, 2)}`;
  const ch = S.change24 != null && !test ? `<span class="chg ${S.change24 >= 0 ? 'plus' : 'minus'}">${S.change24 >= 0 ? '+' : '−'}${fmt(Math.abs(S.change24), 2)}% за 24ч</span>` : '';
  app.innerHTML = `<div class="view">
    <div class="balance">
      <div class="bal-top">
        <button class="wsw" id="b-wsw">${walletAvatar(loadStore(), 24)}${esc(walletName())}${ic('chevDown', 14)}</button>
        <span class="bal-tools"><button id="b-hide" aria-label="${S.hide ? 'Показать баланс' : 'Скрыть баланс'}">${ic(S.hide ? 'eyeOff' : 'eye', 16)}</button><button id="b-ref" aria-label="Обновить">${ic('refresh', 16)}</button></span>
      </div>
      <div class="amt">${S.hide && S.loaded ? '••••' : big}</div>
      <div class="fiat">${hid(sub)}</div>
      <div class="bal-foot"><button class="addr-chip" id="b-addr">${esc(short(S.addr))}${ic('copy', 14)}</button><small id="ago">${agoText()}</small></div>
    </div>
    <div class="actions">
      <button class="act primary" id="b-send"><b>${ic('up', 20)}</b>Отправить</button>
      <button class="act" id="b-recv"><b>${ic('down', 20)}</b>Получить</button>
      <button class="act" id="b-swap"><b>${ic('swap', 20)}</b>Обмен</button>
      <button class="act" id="b-set"><b>${ic('settings', 20)}</b>Настройки</button>
    </div>
    <div class="tabs">${[['tokens', 'Активы'], ['nft', 'NFT'], ['history', 'История']]
      .map(([t, n]) => `<button data-t="${t}" class="${S.tab === t ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="list" id="list"></div>
  </div>`;
  $('#b-addr').onclick = () => copy(S.addr, 'Адрес скопирован');
  $('#b-send').onclick = () => { S.draft = null; render('send'); };
  $('#b-recv').onclick = () => render('receive');
  $('#b-set').onclick = () => render('settings');
  $('#b-swap').onclick = () => { S.swap = null; render('swap'); };
  $('#b-wsw').onclick = () => render('wallets');
  $('#b-hide').onclick = () => { S.hide = !S.hide; try { localStorage.setItem('vxw-hide', S.hide ? '1' : '0'); } catch (e) {} renderHome(); };
  $('#b-ref').onclick = async e => { e.currentTarget.classList.add('spinning'); await refresh(); };
  app.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; renderHome(); });
  if (S.tab === 'market') S.tab = 'tokens';
  $('#list').innerHTML = S.tab === 'tokens' ? tokensHtml() : S.tab === 'nft' ? nftHtml() : historyHtml();
  if (again) scrollTo(0, y);
  if (S.tab === 'tokens') loadMarket();
  app.querySelectorAll('.item.tap').forEach(el => el.onclick = () => {
    S.draft = null;
    render('asset', el.dataset.asset);
  });
  const z = $('#b-zero');
  if (z) z.onclick = () => { S.hideZero = !S.hideZero; try { localStorage.setItem('vxw-hidezero', S.hideZero ? '1' : '0'); } catch (e) {} renderHome(); };
  app.querySelectorAll('.item.ev').forEach(el => el.onclick = () => render('tx', S.events[+el.dataset.i]));
  app.querySelectorAll('#list [data-nft]').forEach(el => el.onclick = () => render('nft', +el.dataset.nft));
  const ns = $('#b-nftsend'); if (ns) ns.onclick = () => render('nftPick');
  bindHistoryTools();
}
V.home = renderHome;
function bindHistoryTools() {
  const sc = $('#b-scam');
  if (sc) sc.onclick = () => { S.hideScam = !S.hideScam; try { localStorage.setItem('vxw-hidescam', S.hideScam ? '1' : '0'); } catch (e) {} lastSig = ''; if (S.view === 'asset') render('asset', S.assetId); else renderHome(); };
  const mb = $('#b-more');
  if (mb) mb.onclick = () => { mb.textContent = 'Загружаю…'; loadMoreEvents(); };
}
setInterval(() => { const a = document.getElementById('ago'); if (a) a.textContent = agoText(); }, 5000);

function tokenRow({ asset, logo, name, verified, scam, sub, amount, symbol, usdLine, zero }) {
  return `<div class="item tap${zero ? ' zero' : ''}${scam ? ' scam' : ''}" data-asset="${esc(asset)}"><div class="ico">${logo}</div>
    <div class="mid"><b>${esc(name)}${scam ? SCAM_TAG : ''}${verified ? `<span class="ok" title="Проверенный токен">${ic('check', 14)}</span>` : ''}</b><small>${sub}</small></div>
    <div class="right">${hid(fmtAmt(amount))} ${esc(symbol)}<small>${usdLine}</small></div></div>`;
}
function tokensHtml() {
  const rows = [];
  const tonUsd = S.balance * (S.rate.usd || 0);
  const chg = S.change24 != null ? ` <span class="chg ${S.change24 >= 0 ? 'plus' : 'minus'}">${S.change24 >= 0 ? '+' : '−'}${fmt(Math.abs(S.change24), 2)}%</span>` : '';
  rows.push(tokenRow({ asset: 'TON', logo: TON_LOGO, name: 'Toncoin', verified: false, sub: (S.rate.usd ? '$' + fmt(S.rate.usd, 3) : 'TON') + chg,
    amount: S.balance, symbol: 'TON', usdLine: tonUsd ? hid('$' + fmt(tonUsd, 2)) : '', zero: !S.balance }));
  const held = new Set();
  for (const j of S.jettons) {
    if (S.hideScam && isScamJetton(j)) continue;
    const d = j.jetton.decimals ?? 9, amt = Number(j.balance) / 10 ** d, usd = j.price?.prices?.USD;
    const img = safeImg(j.jetton.image), raw = String(j.jetton.address).toLowerCase(); held.add(raw);
    const pop = POPULAR.find(t => t.id === raw);
    rows.push(tokenRow({ asset: j.jetton.address, logo: pop?.logo ? pop.logo() : img ? `<img src="${img}" alt="" loading="lazy">` : esc((j.jetton.symbol || '?')[0]),
      name: j.jetton.name, verified: j.jetton.verification === 'whitelist', scam: isScamJetton(j), sub: usd ? '$' + fmt(usd, usd < 0.01 ? 6 : 3) : esc(j.jetton.symbol),
      amount: amt, symbol: j.jetton.symbol, usdLine: usd ? hid('$' + fmt(amt * usd, 2)) : '' }));
  }
  if (!S.hideZero) for (const t of POPULAR) {
    if (held.has(t.id)) continue;
    const usd = S.prices?.[t.id];
    rows.push(tokenRow({ asset: t.id, logo: t.logo ? t.logo() : S.popImg[t.id] ? `<img src="${safeImg(S.popImg[t.id])}" alt="" loading="lazy">` : esc(t.symbol[0]), name: t.name, verified: true,
      sub: usd ? '$' + fmt(usd, usd < 0.01 ? 6 : 3) : esc(t.symbol), amount: 0, symbol: t.symbol, usdLine: '', zero: true }));
  }
  const visible = S.hideZero ? rows.filter(r => !r.includes(' zero"')) : rows;
  return `<div class="list-head"><span>Активы</span><button id="b-zero">${S.hideZero ? 'Показать нулевые' : 'Скрыть нулевые'}</button></div>`
    + (visible.length ? visible.join('') : '<div class="empty">Пока пусто. Нажми «Получить», чтобы пополнить кошелёк</div>')
    + (S.hideZero ? '' : marketHtml());
}

/* ---------- рынок: курсы монет других сетей (только просмотр) ---------- */
const MARKET_IDS = ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'tron', 'dogecoin', 'litecoin'];
S.market = (() => { try { return JSON.parse(localStorage.getItem('vxw-market')) || null; } catch (e) { return null; } })();
async function loadMarket() {
  if (S.market && Date.now() - S.market.at < 60000) return;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${MARKET_IDS.join(',')}&price_change_percentage=24h`);
    if (!r.ok) throw 0;
    const list = (await r.json()).map(c => ({ id: c.id, name: c.name, symbol: String(c.symbol || '').toUpperCase(), image: c.image, price: c.current_price, ch: c.price_change_percentage_24h }));
    list.sort((a, b) => MARKET_IDS.indexOf(a.id) - MARKET_IDS.indexOf(b.id));
    S.market = { at: Date.now(), list };
    try { localStorage.setItem('vxw-market', JSON.stringify(S.market)); } catch (e) {}
    if (S.view === 'home' && S.tab === 'tokens') renderHome();
  } catch (e) {}
}
function marketHtml() {
  return (S.market?.list || []).map(c => {
    const img = safeImg(c.image);
    const ch = Number.isFinite(c.ch) ? ` <span class="chg ${c.ch >= 0 ? 'plus' : 'minus'}">${c.ch >= 0 ? '+' : '−'}${fmt(Math.abs(c.ch), 2)}%</span>` : '';
    return tokenRow({ asset: 'mkt:' + c.id, logo: img ? `<img src="${img}" alt="" loading="lazy">` : esc(c.symbol[0] || '?'), name: c.name, verified: false,
      sub: '$' + fmt(c.price, c.price < 1 ? 4 : 2) + ch, amount: 0, symbol: c.symbol, usdLine: '', zero: true });
  }).join('');
}

function nftImg(n, res = '500x500') {
  const pr = (n.previews || []).find(p => p.resolution === res) || (n.previews || [])[0];
  return safeImg(pr?.url);
}
function nftHtml() {
  if (!S.loaded) return '<div class="empty">Загружаю…</div>';
  if (!S.nfts.length) return '<div class="empty">NFT пока нет</div>';
  return `<div class="list-head"><span>NFT · ${S.nfts.length}</span><button id="b-nftsend">${ic('send', 14)} Отправить NFT</button></div>
  <div class="nfts">${S.nfts.map((n, i) => {
    if (S.hideScam && isScamNft(n)) return '';
    const img = nftImg(n);
    return `<button class="nft${isScamNft(n) ? ' scam' : ''}" data-nft="${i}">${isScamNft(n) ? `<span class="nft-scam">${SCAM_TAG}</span>` : ''}
      <div class="nft-img">${img ? `<img src="${img}" alt="" loading="lazy">` : ic('image', 24)}</div>
      <b>${esc(n.metadata?.name || n.dns || 'Без названия')}</b><small>${esc(n.collection?.name || 'Без коллекции')}</small></button>`;
  }).join('')}</div>`;
}

/* ---------- NFT: просмотр и отправка ---------- */
const NFT_GAS = '0.05';   // уходит на газ передачи NFT, неизрасходованное возвращается
V.nft = i => {
  const n = S.nfts[+i]; if (!n) return render('home');
  const img = nftImg(n, '1500x1500') || nftImg(n);
  const host = 'https://tonviewer.com/';
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <div class="nft-big">${img ? `<img src="${img}" alt="">` : ic('image', 48)}</div>
    <div><h2>${esc(n.metadata?.name || n.dns || 'Без названия')}</h2><p class="muted">${esc(n.collection?.name || 'Без коллекции')}</p></div>
    ${n.metadata?.description ? `<p class="muted">${esc(String(n.metadata.description).slice(0, 400))}</p>` : ''}
    <button class="btn primary" id="b-send">${ic('send', 18)}Отправить NFT</button>
    <a class="btn" href="${host}${esc(n.address)}" target="_blank" rel="noopener noreferrer">${ic('ext', 16)}Открыть в обозревателе</a>
  </div>`;
  $('#b-back').onclick = () => { S.tab = 'nft'; render('home'); };
  $('#b-send').onclick = () => { S.draft = { kind: 'nft', idx: +i }; render('nftSend'); };
};
V.nftPick = () => {
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Какой NFT отправить</h2>
    ${S.nfts.length ? `<div class="nfts">${S.nfts.map((n, i) => { const img = nftImg(n); return `<button class="nft" data-nft="${i}">
      <div class="nft-img">${img ? `<img src="${img}" alt="" loading="lazy">` : ic('image', 24)}</div>
      <b>${esc(n.metadata?.name || n.dns || 'Без названия')}</b><small>${esc(n.collection?.name || 'Без коллекции')}</small></button>`; }).join('')}</div>`
      : '<div class="empty">На этом кошельке нет NFT</div>'}
  </div>`;
  $('#b-back').onclick = () => { S.tab = 'nft'; render('home'); };
  app.querySelectorAll('[data-nft]').forEach(b => b.onclick = () => { S.draft = { kind: 'nft', idx: +b.dataset.nft }; render('nftSend'); });
};
V.nftSend = () => {
  const d = S.draft || {}; const n = S.nfts[d.idx]; if (!n) return render('home');
  const img = nftImg(n);
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Отправить NFT</h2>
    <div class="nft-row"><div class="nft-thumb">${img ? `<img src="${img}" alt="">` : ic('image', 20)}</div>
      <div><b>${esc(n.metadata?.name || n.dns || 'Без названия')}</b><small>${esc(n.collection?.name || 'Без коллекции')}</small></div></div>
    <label class="field"><small class="lbl">Адрес получателя <button type="button" id="b-paste">вставить</button></small><input id="to" value="${esc(d.to || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="UQ… или EQ…"></label>
    ${recents().length ? `<div class="recents"><small class="lbl">Недавние</small>${recents().map(r => `<button type="button" class="chip-btn" data-to="${esc(r.addr)}">${esc(r.name)}</button>`).join('')}</div>` : ''}
    <div class="err" id="err"></div>
    <button class="btn primary" id="b-next">Далее</button>
  </div>`;
  $('#b-back').onclick = () => render('nft', d.idx);
  app.querySelectorAll('[data-to]').forEach(b => b.onclick = () => { $('#to').value = b.dataset.to; });
  $('#b-paste').onclick = async () => { try { $('#to').value = (await navigator.clipboard.readText()).trim(); } catch (e) { toast('Браузер не дал прочитать буфер. Вставь вручную'); } };
  $('#b-next').onclick = () => {
    const to = $('#to').value.trim(), err = m => { $('#err').textContent = m; };
    if (!TW.utils.Address.isValid(to)) return err('Неверный адрес. Проверь, что это адрес в сети TON');
    const A = new TW.utils.Address(to);
    if (A.isUserFriendly && A.isTestOnly) return err('Это адрес тестовой сети');
    if (A.toString(false).toLowerCase() === S.raw) return err('Это твой собственный адрес');
    if (S.balance < +NFT_GAS) return err(`Нужно хотя бы ${NFT_GAS} TON на газ. Неиспользованное вернётся`);
    const name = n.metadata?.name || n.dns || 'NFT';
    S.draft = { kind: 'nft', idx: d.idx, nft: n.address, name, to, attach: NFT_GAS, doneText: `«${name}» отправлен на ${short(to)}` };
    render('nftConfirm');
  };
};
V.nftConfirm = () => {
  const d = S.draft; const n = S.nfts[d.idx]; if (!n) return render('home');
  const img = nftImg(n);
  const uah = v => S.rate.uah ? ` (≈ ${fmt(v * S.rate.uah, 2)} ₴)` : '';
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Изменить</button>
    <div class="tx-head"><div class="nft-thumb lg">${img ? `<img src="${img}" alt="">` : ic('image', 28)}</div>
      <div class="tx-amt">${esc(d.name)}</div><p class="muted">на ${esc(short(d.to))}</p></div>
    <div class="sum">
      <div><span>NFT</span><span>${esc(d.name)}</span></div>
      <div><span>Коллекция</span><span>${esc(n.collection?.name || '—')}</span></div>
      <div><span>Кому</span><span>${esc(d.to)}</span></div>
      <div><span>Комиссия сети</span><span id="fee">считаю…</span></div>
      <div><span>Резерв на газ</span><span>${NFT_GAS} TON, неиспользованное вернётся</span></div>
      <div><span>Комиссия Starlify</span><span>0 TON</span></div>
    </div>
    <div class="note">Передачу NFT <b>нельзя отменить</b>. Проверь адрес получателя</div>
    <div class="err" id="err"></div>
    <button class="btn primary" id="b-go">Отправить NFT</button>
  </div>`;
  $('#b-back').onclick = () => render('nftSend');
  estimateFee(d).then(fee => { if (S.view === 'nftConfirm') $('#fee').textContent = `${fmt(fee, 6)} TON${uah(fee)}`; })
    .catch(() => { if (S.view === 'nftConfirm') $('#fee').textContent = 'не удалось рассчитать'; });
  $('#b-go').onclick = () => pinPad({
    title: 'Подтверди отправку NFT', sub: `${d.name} → ${short(d.to)}`, throttle: true,
    back: () => render('nftConfirm'),
    check: async pin => {
      let kp;
      try { const w = await decryptWords(pin); kp = await MN.mnemonicToKeyPair(w); w.fill(''); } catch (e) { return false; }
      sendNow(kp.secretKey); return true;
    }
  });
};
async function buildNftTransfer(d, secretKey, seqno) {
  const C = TW.boc.Cell, body = new C();
  body.bits.writeUint(0x5fcc3d14, 32);                 // nft transfer
  body.bits.writeUint(0, 64);                          // query_id
  body.bits.writeAddress(new TW.utils.Address(d.to));  // новый владелец
  body.bits.writeAddress(S.addrObj);                   // сдача газа возвращается мне
  body.bits.writeBit(0);                               // без custom_payload
  body.bits.writeCoins(new TW.utils.BN(1));            // 1 нанотон: уведомление новому владельцу
  body.bits.writeBit(0);                               // пустой forward_payload
  const item = new TW.utils.Address(d.nft).toString(true, true, true, false);
  return S.wallet.methods.transfer({ secretKey, toAddress: item, amount: TW.utils.toNano(NFT_GAS), seqno, payload: body, sendMode: 3 }).getQuery();
}

/* ---------- TON Connect: подключение к сайтам (Fragment, getgems и др.) ----------
   Протокол v2: сайт показывает ссылку с его публичным ключом и запросом, кошелёк отвечает
   зашифрованными (nacl box) сообщениями через HTTP-мост. Ключи кошелька никуда не уходят. */
const NACL = TW.utils.nacl;
const hexOf = u8 => TW.utils.bytesToHex(u8), fromHex = h => TW.utils.hexToBytes(h);
function bridgeFor(link) {
  let h = ''; try { h = new URL(link.replace(/^tc:\/\//, 'https://tc.local/')).host; } catch (e) {}
  if (/(^|\.)t\.me$|walletbot\.me$/.test(h)) return 'https://walletbot.me/tonconnect-bridge/bridge';
  if (/mytonwallet/.test(h)) return 'https://tonconnectbridge.mytonwallet.org/bridge';
  return 'https://bridge.tonapi.io/bridge';
}
const tcKey = () => 'vxw-tc-' + (readWallets()?.active || '');
function tcSessions() { try { return JSON.parse(localStorage.getItem(tcKey())) || []; } catch (e) { return []; } }
function tcSave(list) { try { localStorage.setItem(tcKey(), JSON.stringify(list)); } catch (e) {} }
function tcParse(link) {
  link = String(link || '').trim();
  let q;
  try { q = new URL(link.replace(/^tc:\/\//, 'https://tc.local/')).searchParams; } catch (e) { throw new Error('Это не ссылка подключения'); }
  const id = (q.get('id') || '').toLowerCase(), r = q.get('r');
  if (!/^[0-9a-f]{64}$/.test(id) || !r) throw new Error('Это не ссылка подключения');
  let req; try { req = JSON.parse(r); } catch (e) { throw new Error('Ссылка повреждена'); }
  if (!req.manifestUrl) throw new Error('В ссылке нет данных сайта');
  let host = ''; try { host = new URL(req.manifestUrl).host; } catch (e) { throw new Error('Ссылка повреждена'); }
  return { clientId: id, req, host, bridge: bridgeFor(link), proof: (req.items || []).find(i => i.name === 'ton_proof') };
}
/* запрос подключения, пришедший прямо в адресе страницы (универсальная ссылка TON Connect) */
function tcFromUrl() {
  try {
    const q = new URLSearchParams(location.search);
    if (!/^[0-9a-f]{64}$/.test((q.get('id') || '').toLowerCase()) || !q.get('r')) return null;
    return tcParse(location.href);
  } catch (e) { return null; }
}
function tcEncrypt(obj, peerHex, secret) {
  const nonce = NACL.randomBytes(24);
  const box = NACL.box(te.encode(JSON.stringify(obj)), nonce, fromHex(peerHex), secret);
  const out = new Uint8Array(24 + box.length); out.set(nonce); out.set(box, 24);
  return b64(out);
}
function tcDecrypt(msg, peerHex, secret) {
  const all = unb64(msg);
  const m = NACL.box.open(all.slice(24), all.slice(0, 24), fromHex(peerHex), secret);
  if (!m) throw new Error('decrypt');
  return JSON.parse(td.decode(m));
}
async function tcPost(sess, obj) {
  const body = tcEncrypt(obj, sess.clientId, fromHex(sess.sec));
  const r = await fetch(`${sess.bridge}/message?client_id=${sess.pub}&to=${sess.clientId}&ttl=300`, { method: 'POST', body });
  if (!r.ok) throw new Error('Мост не принял сообщение (' + r.status + ')');
}
const concatU8 = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function sha256(u8) { return new Uint8Array(await crypto.subtle.digest('SHA-256', u8)); }
async function tonProof(host, payload, secretKey) {
  const ts = Math.floor(Date.now() / 1000), dom = te.encode(host);
  const wc = new Uint8Array(4); new DataView(wc.buffer).setInt32(0, S.addrObj.wc, false);
  const dl = new Uint8Array(4); new DataView(dl.buffer).setUint32(0, dom.length, true);
  const tsb = new Uint8Array(8); new DataView(tsb.buffer).setBigUint64(0, BigInt(ts), true);
  const msg = concatU8(te.encode('ton-proof-item-v2/'), wc, S.addrObj.hashPart, dl, dom, tsb, te.encode(payload || ''));
  const full = await sha256(concatU8(new Uint8Array([0xff, 0xff]), te.encode('ton-connect'), await sha256(msg)));
  return { timestamp: ts, domain: { lengthBytes: dom.length, value: host }, signature: b64(NACL.sign.detached(full, secretKey)), payload: payload || '' };
}
async function walletStateInitB64() {
  const cell = S.wallet.stateInit ? S.wallet.stateInit() : (await S.wallet.createStateInit()).stateInit;
  return b64(await cell.toBoc(false));
}
const TC_DEVICE = { platform: 'browser', appName: 'starlify', appVersion: '1.0.0', maxProtocolVersion: 2, features: ['SendTransaction', { name: 'SendTransaction', maxMessages: 4 }] };
async function tcConnect(parsed, secretKey) {
  const kp = NACL.box.keyPair();
  const sess = { clientId: parsed.clientId, pub: hexOf(kp.publicKey), sec: hexOf(kp.secretKey), bridge: parsed.bridge, host: parsed.host, at: Date.now() };
  const items = [{ name: 'ton_addr', address: S.addrObj.toString(false), network: '-239', publicKey: hexOf(S.pub), walletStateInit: await walletStateInitB64() }];
  if (parsed.proof) items.push({ name: 'ton_proof', proof: await tonProof(parsed.host, parsed.proof.payload, secretKey) });
  await tcPost(sess, { event: 'connect', id: Date.now(), payload: { items, device: TC_DEVICE } });
  const list = tcSessions().filter(x => x.clientId !== sess.clientId); list.push(sess); tcSave(list);
  tcListen();
  return sess;
}
async function tcDisconnect(sess) {
  try { await tcPost(sess, { event: 'disconnect', id: Date.now(), payload: {} }); } catch (e) {}
  tcSave(tcSessions().filter(x => x.clientId !== sess.clientId)); tcListen();
}
let tcStreams = [];
function tcListen() {
  tcStreams.forEach(es => es.close()); tcStreams = [];
  if (!S.raw) return;
  const by = {};
  for (const x of tcSessions()) (by[x.bridge] = by[x.bridge] || []).push(x);
  for (const [bridge, list] of Object.entries(by)) {
    let last = ''; try { last = localStorage.getItem('vxw-tc-last-' + bridge) || ''; } catch (e) {}
    const es = new EventSource(`${bridge}/events?client_id=${list.map(x => x.pub).join(',')}${last ? '&last_event_id=' + encodeURIComponent(last) : ''}`);
    es.onmessage = e => {
      try { if (e.lastEventId) localStorage.setItem('vxw-tc-last-' + bridge, e.lastEventId); } catch (x) {}
      let data; try { data = JSON.parse(e.data); } catch (x) { return; }
      tcIncoming(data);
    };
    tcStreams.push(es);
  }
}
async function tcIncoming({ from, message }) {
  const sess = tcSessions().find(x => x.clientId === String(from || '').toLowerCase()); if (!sess) return;
  let req; try { req = tcDecrypt(message, sess.clientId, fromHex(sess.sec)); } catch (e) { return; }
  const reply = obj => tcPost(sess, { ...obj, id: String(req.id) }).catch(() => {});
  if (req.method === 'disconnect') { tcSave(tcSessions().filter(x => x.clientId !== sess.clientId)); tcListen(); reply({ result: {} }); toast(`${sess.host} отключён`); return; }
  if (req.method !== 'sendTransaction') { reply({ error: { code: 400, message: 'Method not supported' } }); return; }
  let tx; try { tx = JSON.parse(req.params[0]); } catch (e) { reply({ error: { code: 1, message: 'Bad request' } }); return; }
  const bad = m => { reply({ error: { code: 1, message: m } }); toast('Сайт прислал некорректный запрос'); };
  if (tx.network && String(tx.network) !== '-239') return bad('Wrong network');
  if (tx.from) { try { if (new TW.utils.Address(tx.from).toString(false).toLowerCase() !== S.raw) return bad('Wrong wallet'); } catch (e) { return bad('Bad from'); } }
  if (!Array.isArray(tx.messages) || !tx.messages.length || tx.messages.length > 4) return bad('Bad messages');
  if (tx.valid_until && tx.valid_until * (tx.valid_until > 1e12 ? 0.001 : 1) < Date.now() / 1000) return bad('Request expired');
  S.tcReq = { sess, req, tx, reply };
  render('tcTx');
}
function tcMessages(tx) {
  return tx.messages.map(m => ({
    toAddress: m.address, amount: new TW.utils.BN(String(m.amount)), sendMode: 3,
    payload: m.payload ? TW.boc.Cell.oneFromBoc(TW.utils.base64ToBytes(m.payload)) : '',
    stateInit: m.stateInit ? TW.boc.Cell.oneFromBoc(TW.utils.base64ToBytes(m.stateInit)) : null
  }));
}
async function tcBuild(tx, secretKey, seqno) {
  const vu = tx.valid_until ? Math.floor(tx.valid_until > 1e12 ? tx.valid_until / 1000 : tx.valid_until) : undefined;
  return S.wallet.methods.transfers({ secretKey, seqno, messages: tcMessages(tx), validUntil: vu, expireAt: vu }).getQuery();
}
async function emulateBocFee(boc, needTon) {
  const balance = Math.round(Math.max(S.balance, needTon + 1) * 1e9);
  const r = await fetchRetry(api() + '/v2/wallet/emulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boc, params: [{ address: S.raw, balance }] }) });
  if (!r.ok) throw new Error('emulate ' + r.status);
  const j = await r.json();
  return { fee: Math.max(0, -Number(j.event?.extra || 0)) / 1e9, actions: j.event?.actions || [] };
}
const siteIcon = host => `<img src="https://${esc(host)}/favicon.ico" alt="" class="site-ico">`;
document.addEventListener('error', e => { if (e.target?.classList?.contains('site-ico')) e.target.remove(); }, true);

V.tcList = () => {
  const list = tcSessions();
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Подключённые сайты</h2>
    ${list.length ? `<div class="list">${list.map((x, i) => `<div class="item"><div class="ico">${siteIcon(x.host)}</div>
      <div class="mid"><b>${esc(x.host)}</b><small>подключён ${new Date(x.at).toLocaleDateString('ru')}</small></div>
      <button class="pill" data-off="${i}">Отключить</button></div>`).join('')}</div>` : '<div class="empty">Пока ни одного сайта</div>'}
    <button class="btn primary" id="b-add">${ic('link', 18)}Подключить сайт</button>
    <p class="muted">На сайте нажми «Connect Wallet», выбери Tonkeeper и скопируй ссылку под QR-кодом. Потом вставь её здесь</p>
  </div>`;
  $('#b-back').onclick = () => render('settings');
  $('#b-add').onclick = () => render('tcLink');
  app.querySelectorAll('[data-off]').forEach(b => b.onclick = async () => { b.disabled = true; await tcDisconnect(list[+b.dataset.off]); toast('Сайт отключён'); render('tcList'); });
};
V.tcLink = () => {
  app.innerHTML = `<div class="view sheet">
    <div class="sheet-head"><button class="round" id="b-back" aria-label="Назад">${ic('back', 18)}</button><h2>Подключить сайт</h2><span></span></div>
    <div class="box addr"><div class="box-main"><small>Ссылка подключения</small><textarea id="lnk" rows="3" autocomplete="off" spellcheck="false" placeholder="https://app.tonkeeper.com/ton-connect?v=2&id=…"></textarea></div>
      <button class="pill" id="b-paste" type="button">Вставить</button></div>
    <p class="muted">На сайте: «Connect Wallet» → Tonkeeper → под QR-кодом «Copy link». Или отсканируй QR-код камерой.</p>
    ${('BarcodeDetector' in window) ? '<button class="btn" id="b-scan" type="button">Сканировать QR-код</button>' : ''}
    <div class="err" id="err"></div>
    <div class="sheet-foot"><button class="btn primary" id="b-next">Продолжить</button></div>
  </div>`;
  $('#b-back').onclick = () => render('tcList');
  const bScan = $('#b-scan'); if (bScan) bScan.onclick = () => render('tcScan');
  $('#b-paste').onclick = async () => { try { $('#lnk').value = (await navigator.clipboard.readText()).trim(); } catch (e) { toast('Браузер не дал прочитать буфер. Вставь вручную'); } };
  $('#b-next').onclick = () => {
    try { S.tcPending = tcParse($('#lnk').value); render('tcConnect'); }
    catch (e) { $('#err').textContent = e.message; }
  };
};
let scanStream = null, scanTimer = 0;
function stopScan() {
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = 0; }
  if (scanStream) { try { scanStream.getTracks().forEach(t => t.stop()); } catch (e) {} scanStream = null; }
}
async function startScan() {
  const err = $('#err');
  let det; try { det = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { if (err) err.textContent = 'Сканер недоступен. Вставь ссылку вручную'; return; }
  try { scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
  catch (e) { if (err) err.textContent = 'Нет доступа к камере. Разреши доступ или вставь ссылку вручную'; return; }
  const v = $('#cam'); if (!v || S.view !== 'tcScan') { stopScan(); return; }
  v.srcObject = scanStream; try { await v.play(); } catch (e) {}
  const tick = async () => {
    if (S.view !== 'tcScan' || !scanStream) { stopScan(); return; }
    try {
      const codes = await det.detect(v);
      for (const c of codes || []) {
        let parsed = null; try { parsed = tcParse(c.rawValue || ''); } catch (e) {}
        if (parsed) { stopScan(); S.tcPending = parsed; render('tcConnect'); return; }
      }
    } catch (e) {}
    scanTimer = setTimeout(tick, 300);
  };
  scanTimer = setTimeout(tick, 400);
}
V.tcScan = () => {
  app.innerHTML = `<div class="view sheet">
    <div class="sheet-head"><button class="round" id="b-back" aria-label="Назад">${ic('back', 18)}</button><h2>Сканировать QR</h2><span></span></div>
    <div style="position:relative;width:100%;max-width:300px;margin:16px auto;aspect-ratio:1;border-radius:16px;overflow:hidden;background:#000">
      <video id="cam" playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
      <div style="position:absolute;inset:14%;border:2px solid #fff;border-radius:12px"></div>
    </div>
    <p class="muted">Наведи камеру на QR-код подключения на сайте</p>
    <div class="err" id="err"></div>
  </div>`;
  $('#b-back').onclick = () => { stopScan(); render('tcLink'); };
  startScan();
};
V.tcConnect = () => {
  stopScan();
  const p = S.tcPending; if (!p) return render('tcList');
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <div class="tx-head"><div class="ico big site">${siteIcon(p.host)}</div><h2>${esc(p.host)}</h2><p class="muted">хочет подключиться к кошельку</p></div>
    <div class="sum">
      <div><span>Кошелёк</span><span>${esc(walletName())} · ${esc(short(S.addr))}</span></div>
      <div><span>Сайт увидит</span><span>адрес и баланс</span></div>
      ${p.proof ? '<div><span>Подтверждение</span><span>подпись «я владелец адреса»</span></div>' : ''}
    </div>
    <div class="note">Сайт <b>не получит</b> секретную фразу и не сможет списать деньги без твоего подтверждения. Подключай только сайты, которым доверяешь</div>
    <div class="err" id="err"></div>
    <button class="btn primary" id="b-ok">Подключить</button>
  </div>`;
  $('#b-back').onclick = () => render('tcLink');
  const done = async secretKey => {
    try { await tcConnect(p, secretKey); S.tcPending = null; render('tcDone', p.host); }
    catch (e) { render('tcConnect'); setTimeout(() => { const er = $('#err'); if (er) er.textContent = e.message || 'Не удалось подключиться'; }, 0); }
  };
  $('#b-ok').onclick = () => {
    if (!p.proof) { $('#b-ok').disabled = true; return done(null); }
    pinPad({
      title: 'Подтверди подключение', sub: p.host, throttle: true, back: () => render('tcConnect'),
      check: async pin => {
        let kp; try { const w = await decryptWords(pin); kp = await MN.mnemonicToKeyPair(w); w.fill(''); } catch (e) { return false; }
        app.innerHTML = '<div class="view status"><div class="spin"></div><h2>Подключаю…</h2></div>';
        await done(kp.secretKey); kp.secretKey.fill(0); return true;
      }
    });
  };
};
V.tcDone = host => {
  app.innerHTML = `<div class="view status"><div class="big ok-state">${ic('check', 36)}</div><h2>Подключено</h2>
    <p class="muted">Вернись на ${esc(host)}. Запросы на оплату будут приходить сюда</p>
    <button class="btn primary" id="b-home">К кошельку</button></div>`;
  $('#b-home').onclick = () => render('home');
};
V.tcTx = () => {
  const q = S.tcReq; if (!q) return render('home');
  const { sess, tx } = q;
  const total = tx.messages.reduce((n, m) => n + Number(m.amount) / 1e9, 0);
  app.innerHTML = `<div class="view">
    <div class="tx-head"><div class="ico big site">${siteIcon(sess.host)}</div><h2>${esc(sess.host)}</h2><p class="muted">просит подтвердить транзакцию</p></div>
    <div class="sum">
      ${tx.messages.map(m => { let to = m.address; try { to = friendly(new TW.utils.Address(m.address).toString(false), true); } catch (e) {} return `<div><span>${m.payload ? 'Вызов контракта' : 'Перевод'}</span><span>${fmtAmt(Number(m.amount) / 1e9)} TON → ${esc(short(to))}</span></div>`; }).join('')}
      <div><span>Комиссия сети</span><span id="fee">считаю…</span></div>
      <div><span>Итого спишется</span><span id="total">${fmtAmt(total)} TON</span></div>
    </div>
    <div class="err" id="err"></div>
    <div class="row"><button class="btn" id="b-no">Отклонить</button><button class="btn primary" id="b-yes">Подтвердить</button></div>
  </div>`;
  (async () => {
    try {
      const seqno = await getSeqno();
      const q0 = await tcBuild(tx, null, seqno);
      const { fee } = await emulateBocFee(TW.utils.bytesToBase64(await q0.toBoc(false)), total);
      if (S.view !== 'tcTx') return;
      $('#fee').textContent = `${fmt(fee, 6)} TON`; $('#total').textContent = `${fmtAmt(total + fee)} TON`;
      if (total + fee > S.balance) { $('#err').textContent = 'Недостаточно TON'; $('#b-yes').disabled = true; }
    } catch (e) { if (S.view === 'tcTx') $('#fee').textContent = 'не удалось рассчитать'; }
  })();
  $('#b-no').onclick = () => { q.reply({ error: { code: 300, message: 'Reject Request' } }); S.tcReq = null; toast('Отклонено'); render('home'); };
  $('#b-yes').onclick = () => pinPad({
    title: 'Подтверди транзакцию', sub: `${fmtAmt(total)} TON · ${sess.host}`, throttle: true, back: () => render('tcTx'),
    check: async pin => {
      let kp; try { const w = await decryptWords(pin); kp = await MN.mnemonicToKeyPair(w); w.fill(''); } catch (e) { return false; }
      app.innerHTML = '<div class="view status"><div class="spin"></div><h2>Отправляю…</h2></div>';
      try {
        const seqno = await getSeqno();
        const cell = await tcBuild(tx, kp.secretKey, seqno); kp.secretKey.fill(0);
        const boc = TW.utils.bytesToBase64(await cell.toBoc(false));
        const r = await fetchRetry(api() + '/v2/blockchain/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boc }) });
        if (!r.ok) throw new Error('Сеть отклонила транзакцию (' + r.status + ')');
        q.reply({ result: boc }); S.tcReq = null;
        app.innerHTML = `<div class="view status"><div class="big ok-state">${ic('check', 36)}</div><h2>Отправлено</h2><p class="muted">Вернись на ${esc(sess.host)}</p><button class="btn primary" id="b-home">К кошельку</button></div>`;
        $('#b-home').onclick = () => { render('home'); refresh(); };
      } catch (e) {
        q.reply({ error: { code: 0, message: String(e.message || e) } }); S.tcReq = null;
        app.innerHTML = `<div class="view status"><div class="big fail">${ic('x', 36)}</div><h2>Не получилось</h2><p class="muted">${esc(e.message || e)}</p><button class="btn primary" id="b-home">К кошельку</button></div>`;
        $('#b-home').onclick = () => render('home');
      }
      return true;
    }
  });
};

/* ---------- обмен через STON.fi (роутер v2) ---------- */
const TON_STON = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
function swapTokens() {
  const list = [{ id: 'TON', addr: TON_STON, symbol: 'TON', name: 'Toncoin', decimals: 9, balance: S.balance, logo: TON_LOGO }];
  const seen = new Set();
  for (const j of S.jettons) {
    const raw = String(j.jetton.address).toLowerCase(); seen.add(raw);
    const pop = POPULAR.find(t => t.id === raw), img = safeImg(j.jetton.image);
    list.push({ id: raw, addr: pop?.friendly || friendly(raw, true), symbol: j.jetton.symbol, name: j.jetton.name, decimals: j.jetton.decimals ?? 9,
      balance: Number(j.balance) / 10 ** (j.jetton.decimals ?? 9), units: j.balance, wallet: j.wallet_address?.address,
      logo: pop?.logo ? pop.logo() : img ? `<img src="${img}" alt="">` : esc((j.jetton.symbol || '?')[0]) });
  }
  for (const t of POPULAR) if (!seen.has(t.id)) list.push({ id: t.id, addr: t.friendly, symbol: t.symbol, name: t.name, decimals: t.decimals, balance: 0,
    logo: t.logo ? t.logo() : S.popImg[t.id] ? `<img src="${safeImg(S.popImg[t.id])}" alt="">` : esc(t.symbol[0]) });
  return list;
}
async function stonSimulate(from, to, units, slippage) {
  const q = new URLSearchParams({ offer_address: from.addr, ask_address: to.addr, units, slippage_tolerance: String(slippage), dex_version: '2' });
  const r = await fetch('https://api.ston.fi/v1/swap/simulate?' + q, { method: 'POST' });
  if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch (e) {} throw new Error(m || 'HTTP ' + r.status); }
  const j = await r.json();
  if (j.router?.major_version !== 2) throw new Error('unsupported router');
  return j;
}
function swapBody(sim, deadline) {
  const C = TW.boc.Cell, A = x => new TW.utils.Address(x);
  const extra = new C();
  extra.bits.writeCoins(new TW.utils.BN(sim.min_ask_units));   // минимум с учётом проскальзывания
  extra.bits.writeAddress(S.addrObj);                          // кто получает
  extra.bits.writeCoins(new TW.utils.BN(0));                   // fwd_gas для custom_payload
  extra.bits.writeBit(0);                                      // без custom_payload
  extra.bits.writeCoins(new TW.utils.BN(0));                   // refund_fwd_gas
  extra.bits.writeBit(0);                                      // без refund_payload
  extra.bits.writeUint(10, 16);                                // ref_fee (без реферального адреса не взимается)
  extra.bits.writeAddress(null);                               // реферальный адрес: нет
  const b = new C();
  b.bits.writeUint(0x6664de2a, 32);                            // swap
  b.bits.writeAddress(A(sim.ask_jetton_wallet));               // кошелёк роутера для получаемой валюты
  b.bits.writeAddress(S.addrObj);                              // возврат при ошибке
  b.bits.writeAddress(S.addrObj);                              // сдача газа
  b.bits.writeUint(deadline, 64);
  b.refs.push(extra);
  return b;
}
async function buildSwap(d, secretKey, seqno) {
  const sim = d.sim, C = TW.boc.Cell, BN = TW.utils.BN;
  const body = swapBody(sim, d.deadline);
  if (d.from.id === 'TON') {
    // TON -> токен: TON уходят на pTON-кошелёк роутера
    const t = new C();
    t.bits.writeUint(0x01f3835d, 32);                          // ton_transfer
    t.bits.writeUint(0, 64);
    t.bits.writeCoins(new BN(sim.offer_units));
    t.bits.writeAddress(S.addrObj);                            // возврат при ошибке
    t.bits.writeBit(1); t.refs.push(body);
    const value = new BN(sim.offer_units).add(new BN(sim.gas_params.forward_gas));
    return S.wallet.methods.transfer({ secretKey, toAddress: new TW.utils.Address(sim.offer_jetton_wallet).toString(true, true, true, false), amount: value, seqno, payload: t, sendMode: 3 }).getQuery();
  }
  // токен -> что угодно: перевод своих токенов на адрес роутера с forward_payload = swap
  const jt = new C();
  jt.bits.writeUint(0x0f8a7ea5, 32);
  jt.bits.writeUint(0, 64);
  jt.bits.writeCoins(new BN(sim.offer_units));
  jt.bits.writeAddress(new TW.utils.Address(sim.router_address));
  jt.bits.writeAddress(S.addrObj);
  jt.bits.writeBit(0);
  jt.bits.writeCoins(new BN(sim.gas_params.forward_gas));
  jt.bits.writeBit(1); jt.refs.push(body);
  const myWallet = new TW.utils.Address(d.from.wallet).toString(true, true, true, false);
  return S.wallet.methods.transfer({ secretKey, toAddress: myWallet, amount: new BN(sim.gas_params.gas_budget), seqno, payload: jt, sendMode: 3 }).getQuery();
}
function unitsToNum(u, dec) { return Number(u) / 10 ** dec; }
V.swap = () => {
  const toks = swapTokens();
  // допуск изменения курса фиксированный 1%: если курс уйдёт сильнее, обмен отменится и деньги вернутся
  const st = S.swap || (S.swap = { from: 'TON', to: POPULAR[0].id, amount: '', slip: 0.01 });
  st.slip = 0.01;
  const from = toks.find(t => t.id === st.from) || toks[0];
  const to = toks.find(t => t.id === st.to && t.id !== from.id) || toks.find(t => t.id !== from.id);
  st.from = from.id; st.to = to.id;
  const pick = (which, cur) => `<div class="assets">${toks.filter(t => which === 'to' ? t.id !== from.id : true).map(t => `<button type="button" class="asset ${t.id === cur.id ? 'on' : ''}" data-${which}="${esc(t.id)}">
      <span class="ico sm">${t.logo}</span><span><b>${esc(t.symbol)}</b><small>${fmt(t.balance)}</small></span></button>`).join('')}</div>`;
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2 class="with-mark">${STAR(22)}Обмен</h2>
    <div class="field"><small class="lbl">Отдаёшь · доступно ${fmt(from.balance, Math.min(from.decimals, 6))} ${esc(from.symbol)} <button type="button" id="b-max">всё</button></small>${pick('from', from)}</div>
    <label class="field big"><input id="amt" inputmode="decimal" placeholder="0" value="${esc(st.amount)}"></label>
    <button class="flip" id="b-flip" aria-label="Поменять местами">${ic('updown', 18)}</button>
    <div class="field"><small class="lbl">Получаешь</small>${pick('to', to)}</div>
    <div class="quote" id="quote"><div class="q-main">—</div></div>
    <div class="err" id="err"></div>
    <button class="btn primary" id="b-go" disabled>Обменять</button>
  </div>`;
  let timer, seq = 0;
  const quote = async () => {
    const v = $('#amt').value.trim().replace(',', '.'); st.amount = v;
    const re = new RegExp(`^\\d+(\\.\\d{1,${from.decimals}})?$`);
    $('#err').textContent = ''; $('#b-go').disabled = true; S.swapSim = null;
    if (!v || !re.test(v) || !(+v > 0)) { $('#quote').innerHTML = '<div class="q-main">Введи сумму</div>'; return; }
    $('#quote').innerHTML = '<div class="q-main muted">Считаю курс…</div>';
    const my = ++seq;
    try {
      const sim = await stonSimulate(from, to, toUnits(v, from.decimals).toString(), st.slip);
      if (my !== seq || S.view !== 'swap') return;
      const got = unitsToNum(sim.ask_units, to.decimals), min = unitsToNum(sim.min_ask_units, to.decimals);
      const rate = got / +v, impact = Math.abs(Number(sim.price_impact) * 100);
      const reserve = from.id === 'TON' ? unitsToNum(sim.gas_params.forward_gas, 9) : unitsToNum(sim.gas_params.gas_budget, 9);
      const used = unitsToNum(sim.gas_params.estimated_gas_consumption, 9);
      const dexFee = unitsToNum(sim.fee_units, to.decimals);
      const needTon = (from.id === 'TON' ? +v : 0) + reserve + 0.01;
      $('#quote').innerHTML = `<div class="q-main">≈ ${fmt(got, Math.min(to.decimals, 6))} ${esc(to.symbol)}</div>
        <div class="sum">
          <div><span>Курс</span><span>1 ${esc(from.symbol)} = ${fmt(rate, rate < 1 ? 6 : 4)} ${esc(to.symbol)}</span></div>
          <div><span>Минимум к получению</span><span>${fmt(min, Math.min(to.decimals, 6))} ${esc(to.symbol)}</span></div>
          ${impact > 1 ? `<div><span>Влияние на цену</span><span class="minus-red">${fmt(impact, 2)}%</span></div>` : ''}
          <div><span>Комиссия обмена</span><span>${fmt(Number(sim.fee_percent) * 100, 2)}%</span></div>
          <div><span>Комиссия сети</span><span id="swgas">…</span></div>
        </div>`;
      // точная комиссия сети: эмуляция этого же обмена без подписи
      const dl = Math.floor(Date.now() / 1000) + 15 * 60;
      (from.id === 'TON' || from.wallet ? estimateFee({ kind: 'swap', sim, from, to, deadline: dl, attach: String((from.id === 'TON' ? +v : 0) + reserve) }) : Promise.reject())
        .then(f => { if (my === seq && $('#swgas')) $('#swgas').textContent = `${fmt(f, 6)} TON` + (S.rate.uah ? ` (≈ ${fmt(f * S.rate.uah, 2)} ₴)` : ''); })
        .catch(() => { if (my === seq && $('#swgas')) $('#swgas').textContent = `≈ ${fmt(used, 3)} TON`; });
      if (+v > from.balance) { $('#err').textContent = `Недостаточно ${from.symbol}: доступно ${fmt(from.balance, 6)}`; return; }
      if (S.balance < needTon) { $('#err').textContent = `Нужно ${fmt(needTon, 3)} TON с учётом газа`; return; }
      if (impact > 15) { $('#err').textContent = 'Слишком сильное влияние на цену: уменьши сумму'; return; }
      S.swapSim = { sim, from, to, v, got, min, reserve, used };
      $('#b-go').disabled = false;
    } catch (e) {
      if (my !== seq) return;
      $('#quote').innerHTML = '<div class="q-main">—</div>';
      $('#err').textContent = 'Обмен этой пары сейчас недоступен';
    }
  };
  $('#amt').oninput = () => { clearTimeout(timer); timer = setTimeout(quote, 400); };
  $('#b-back').onclick = () => render('home');
  $('#b-max').onclick = () => {
    const max = from.id === 'TON' ? Math.max(0, from.balance - 0.35) : from.balance;
    $('#amt').value = from.id === 'TON' ? String(Math.floor(max * 1e4) / 1e4) : String(from.units ? Number(from.units) / 10 ** from.decimals : 0);
    quote();
  };
  $('#b-flip').onclick = () => { [st.from, st.to] = [st.to, st.from]; st.amount = ''; render('swap'); };
  app.querySelectorAll('[data-from]').forEach(b => b.onclick = () => { st.from = b.dataset.from; if (st.to === st.from) st.to = from.id; st.amount = ''; render('swap'); });
  app.querySelectorAll('[data-to]').forEach(b => b.onclick = () => { st.to = b.dataset.to; render('swap'); });
  $('#b-go').onclick = () => {
    const q = S.swapSim; if (!q) return;
    const deadline = Math.floor(Date.now() / 1000) + 15 * 60;
    S.draft = { kind: 'swap', sim: q.sim, from: q.from, to: q.to, deadline, attach: String((q.from.id === 'TON' ? +q.v : 0) + q.reserve),
      doneText: `${q.v} ${q.from.symbol} → ≈ ${fmt(q.got, 6)} ${q.to.symbol}. Токены придут через несколько секунд` };
    pinPad({
      title: 'Подтверди обмен', sub: `${q.v} ${q.from.symbol} → ≈ ${fmt(q.got, 6)} ${q.to.symbol}`, throttle: true,
      back: () => render('swap'),
      check: async pin => {
        let kp;
        try { const w = await decryptWords(pin); kp = await MN.mnemonicToKeyPair(w); w.fill(''); } catch (e) { return false; }
        sendNow(kp.secretKey); return true;
      }
    });
  };
  if (st.amount) quote();
};

/* скам: tonapi помечает такие события, отправителей, токены и NFT */
const isScamEvent = e => !!(e.is_scam || (e.actions || []).some(a => (a.TonTransfer || a.JettonTransfer || a.NftItemTransfer || {}).sender?.is_scam || a.JettonTransfer?.jetton?.verification === 'blacklist'));
const isScamJetton = j => j.jetton?.verification === 'blacklist';
const isScamNft = n => n.trust === 'blacklist';
const SCAM_TAG = '<span class="tag-scam">Скам</span>';
async function loadMoreEvents() {
  if (!S.events.length || S.evLoading) return;
  S.evLoading = true;
  try {
    const last = S.events[S.events.length - 1];
    const r = await get(`/v2/accounts/${encodeURIComponent(S.raw)}/events?limit=40&before_lt=${last.lt}`);
    const more = (r.events || []).filter(e => !S.events.some(x => x.event_id === e.event_id));
    S.events = S.events.concat(more);
    S.evMore = (r.events || []).length >= 40;
  } catch (e) { toast('Не удалось загрузить, попробуй ещё раз'); }
  S.evLoading = false;
  lastSig = ''; if (S.view === 'home') renderHome(); else if (S.view === 'asset') render('asset', S.assetId);
}
function historyHtml(only, emptyText) {
  if (!S.loaded) return '<div class="empty">Загружаю…</div>';
  const all = S.events.map((e, idx) => [e, idx]).filter(([e]) => !only || only(e));
  const scamCount = all.filter(([e]) => isScamEvent(e)).length;
  const list = S.hideScam ? all.filter(([e]) => !isScamEvent(e)) : all;
  const head = `<div class="list-head"><span>Операции</span>${scamCount || S.hideScam ? `<button id="b-scam">${S.hideScam ? `Показать скам${scamCount ? ' · ' + scamCount : ''}` : 'Скрыть скам'}</button>` : ''}</div>`;
  const more = S.evMore ? `<button class="btn more" id="b-more">${S.evLoading ? 'Загружаю…' : 'Показать ещё'}</button>` : '';
  if (!list.length) return head + `<div class="empty">${emptyText || 'Пока нет операций. Нажми «Получить», чтобы пополнить кошелёк'}</div>` + more;
  return head + list.map(([e, idx]) => {
    const a = e.actions?.[0]; if (!a) return '';
    const when = new Date(e.timestamp * 1000).toLocaleString('ru', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const pend = e.in_progress ? ' · в обработке' : '';
    const fail = a.status !== 'ok' ? ' · ошибка' : '';
    let title = a.simple_preview?.name || a.type, sub = a.simple_preview?.description || '', amount = '', cls = '', dir = ic('activity');
    const t = a.TonTransfer || a.JettonTransfer;
    if (t) {
      const incoming = (t.recipient?.address || '').toLowerCase() === S.raw;
      const other = incoming ? t.sender : t.recipient;
      let otherAddr = other?.name || '';
      if (!otherAddr && other?.address) { try { otherAddr = short(new TW.utils.Address(other.address).toString(true, true, true, S.net === 'testnet')); } catch (x) { otherAddr = short(other.address); } }
      const val = a.TonTransfer ? Number(t.amount) / 1e9 : Number(t.amount) / 10 ** (t.jetton?.decimals ?? 9);
      const sym = a.TonTransfer ? 'TON' : (t.jetton?.symbol || '');
      title = incoming ? 'Получено' : 'Отправлено'; dir = incoming ? ic('down') : ic('up'); cls = incoming ? 'plus' : 'minus';
      amount = `${incoming ? '+' : '−'}${fmtAmt(val, a.TonTransfer ? 9 : (t.jetton?.decimals ?? 9))} ${esc(sym)}`;
      sub = (incoming ? 'от ' : 'кому ') + otherAddr + (t.comment ? ' · «' + t.comment + '»' : '');
    }
    const scam = isScamEvent(e);
    return `<div class="item ev${scam ? ' scam' : ''}" data-i="${idx}"><div class="ico ${cls === 'plus' ? 'in' : cls === 'minus' ? 'out' : ''}">${dir}</div>
      <div class="mid"><b>${esc(title)}${esc(pend + fail)}${scam ? SCAM_TAG : ''}</b><small>${esc(sub)}</small></div>
      <div class="right"><span class="${cls}">${S.hide ? '••••' : amount}</span><small>${esc(when)}</small></div></div>`;
  }).join('') + more;
}

function friendly(raw, bounce) {
  try { return new TW.utils.Address(raw).toString(true, true, bounce, S.net === 'testnet'); } catch (e) { return raw; }
}

V.tx = e => {
  if (!e) return render('home');
  const a = e.actions?.[0] || {}, t = a.TonTransfer || a.JettonTransfer;
  const incoming = t && (t.recipient?.address || '').toLowerCase() === S.raw;
  const host = S.net === 'testnet' ? 'https://testnet.tonviewer.com/' : 'https://tonviewer.com/';
  const when = new Date(e.timestamp * 1000).toLocaleString('ru', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fee = !incoming && Number(e.extra) < 0 ? -Number(e.extra) / 1e9 : 0;
  let amountLine = '', otherLbl = '', other = null;
  if (t) {
    const dec = a.TonTransfer ? 9 : (t.jetton?.decimals ?? 9), sym = a.TonTransfer ? 'TON' : (t.jetton?.symbol || '');
    amountLine = `${incoming ? '+' : '−'}${fmt(Number(t.amount) / 10 ** dec, dec)} ${sym}`;
    other = incoming ? t.sender : t.recipient; otherLbl = incoming ? 'Отправитель' : 'Получатель';
  }
  const otherAddr = other?.address ? friendly(other.address, !other.is_wallet) : '';
  const status = e.in_progress ? 'в обработке' : a.status === 'ok' ? 'выполнено' : 'ошибка';
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <div class="tx-head">
      <div class="ico big ${t ? (incoming ? 'in' : 'out') : ''}">${t ? ic(incoming ? 'down' : 'up', 24) : ic('activity', 24)}</div>
      <h2>${t ? (incoming ? 'Получено' : 'Отправлено') : esc(a.simple_preview?.name || a.type || 'Операция')}</h2>
      ${amountLine ? `<div class="tx-amt ${incoming ? 'plus' : 'minus'}">${esc(amountLine)}</div>` : `<p class="muted">${esc(a.simple_preview?.description || '')}</p>`}
    </div>
    ${isScamEvent(e) ? '<div class="note scam-note"><b>Это скам.</b> Не переходи по ссылкам из комментария и не отправляй ничего в ответ</div>' : ''}
    <div class="sum">
      <div><span>Статус</span><span>${status}</span></div>
      <div><span>Дата</span><span>${esc(when)}</span></div>
      ${otherAddr ? `<div><span>${otherLbl}</span><span class="copyable" data-copy="${esc(otherAddr)}">${other?.name ? esc(other.name) + '<br>' : ''}${esc(otherAddr)}${ic('copy', 14)}</span></div>` : ''}
      ${t?.comment ? `<div><span>Комментарий</span><span>${esc(t.comment)}</span></div>` : ''}
      ${fee ? `<div><span>Комиссия</span><span>${fmt(fee, 6)} TON</span></div>` : ''}
    </div>
    <div class="row">
      ${otherAddr && incoming === false ? `<button class="btn" id="b-again">Отправить ещё</button>` : ''}
      <a class="btn" href="${host}transaction/${esc(e.event_id)}" target="_blank" rel="noopener noreferrer">В обозревателе ↗</a>
    </div>
  </div>`;
  $('#b-back').onclick = () => render('home');
  app.querySelectorAll('[data-copy]').forEach(el => el.onclick = () => copy(el.dataset.copy, 'Адрес скопирован'));
  const again = $('#b-again');
  if (again) again.onclick = () => { S.draft = { asset: a.JettonTransfer ? t.jetton?.address : 'TON', to: otherAddr }; render('send'); };
};

/* недавние получатели — из истории исходящих */
function recents() {
  const seen = new Set(), out = [];
  for (const e of S.events) {
    const a = e.actions?.[0], t = a && (a.TonTransfer || a.JettonTransfer);
    if (!t || (t.recipient?.address || '').toLowerCase() === S.raw || !t.recipient?.address) continue;
    const addr = friendly(t.recipient.address, !t.recipient.is_wallet);
    if (seen.has(addr)) continue; seen.add(addr);
    out.push({ addr, name: t.recipient.name || short(addr) });
    if (out.length >= 4) break;
  }
  return out;
}

/* ---------- экран актива ---------- */
V.asset = id => {
  id = String(id || 'TON'); S.assetId = id;
  const isTon = id === 'TON', isMkt = id.startsWith('mkt:');
  const low = id.toLowerCase();
  const j = !isTon && !isMkt ? S.jettons.find(x => String(x.jetton.address).toLowerCase() === low) : null;
  const pop = POPULAR.find(t => t.id === low);
  const mkt = isMkt ? (S.market?.list || []).find(c => 'mkt:' + c.id === id) : null;
  const name = isTon ? 'Toncoin' : mkt ? mkt.name : j?.jetton.name || pop?.name || 'Токен';
  const symbol = isTon ? 'TON' : mkt ? mkt.symbol : j?.jetton.symbol || pop?.symbol || '';
  const dec = isTon ? 9 : j?.jetton.decimals ?? pop?.decimals ?? 9;
  const bal = isTon ? S.balance : j ? Number(j.balance) / 10 ** dec : 0;
  const price = isTon ? S.rate.usd : mkt ? mkt.price : j?.price?.prices?.USD ?? S.prices?.[pop?.id];
  const change = isTon ? S.change24 : mkt ? mkt.ch : null;
  const img = mkt ? safeImg(mkt.image) : j ? safeImg(j.jetton.image) : pop ? safeImg(S.popImg[pop.id]) : '';
  const logo = isTon ? TON_LOGO : pop?.logo ? pop.logo() : img ? `<img src="${img}" alt="">` : esc(symbol[0] || '?');
  const chg = Number.isFinite(change) && change != null ? ` <span class="chg ${change >= 0 ? 'plus' : 'minus'}">${change >= 0 ? '+' : '−'}${fmt(Math.abs(change), 2)}%</span>` : '';
  const raw = j ? String(j.jetton.address).toLowerCase() : pop?.id;
  const only = isTon ? e => e.actions?.[0]?.type === 'TonTransfer'
    : isMkt ? () => false
    : e => String(e.actions?.[0]?.JettonTransfer?.jetton?.address || '').toLowerCase() === raw;
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <div class="asset-head">
      <div class="ico big">${logo}</div>
      <small class="muted">${esc(name)}</small>
      <div class="amt">${S.hide ? '••••' : money(bal, Math.min(dec, 4), symbol)}</div>
      <div class="muted">${price ? (bal ? `≈ $${fmt(bal * price, 2)} · ` : '') + `1 ${esc(symbol)} = $${fmt(price, price < 0.01 ? 6 : price < 1 ? 4 : 2)}` : ''}${chg}</div>
    </div>
    <div class="actions two">
      <button class="act primary" id="a-send"${isMkt || !bal ? ' disabled' : ''}><b>${ic('up', 20)}</b>Отправить</button>
      <button class="act" id="a-recv"${isMkt ? ' disabled' : ''}><b>${ic('down', 20)}</b>Получить</button>
    </div>
    ${isMkt ? `<div class="note">${esc(name)} работает в своей сети. Starlify Wallet пока хранит только TON и токены сети TON, поэтому отправка и получение ${esc(symbol)} недоступны</div>` : ''}
    <div class="list">${historyHtml(only, isMkt ? 'Истории нет' : `Операций с ${esc(symbol)} пока нет`)}</div>
  </div>`;
  $('#b-back').onclick = () => render('home');
  $('#a-send').onclick = () => { S.draft = null; render('send', isTon ? 'TON' : j?.jetton.address); };
  $('#a-recv').onclick = () => render('receive');
  app.querySelectorAll('.item.ev').forEach(el => el.onclick = () => render('tx', S.events[+el.dataset.i]));
  bindHistoryTools();
};

V.receive = () => {
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Получить</h2>
    <p class="muted">Отсканируй QR в другом кошельке или отправь адрес. Сюда приходят TON, USDT и любые токены сети TON</p>
    <div class="qr" id="qr"></div>
    <button class="addr-box" id="b-copy" aria-label="Скопировать адрес">
      <span class="addr-text">${esc(S.addr)}</span>
      <span class="addr-act" id="copy-state">${ic('copy', 18)}<small>Копировать</small></span>
    </button>
    <label class="field"><small class="lbl">Запросить сумму в TON (необязательно)</small><input id="amt" inputmode="decimal" placeholder="например 5"></label>
  </div>`;
  const draw = () => {
    if (!window.qrcode) return;
    const v = $('#amt').value.trim().replace(',', '.');
    const data = `ton://transfer/${S.addr}` + (/^\d+(\.\d{1,9})?$/.test(v) && +v > 0 ? `?amount=${TW.utils.toNano(v).toString()}` : '');
    const q = qrcode(0, 'M'); q.addData(data); q.make();
    $('#qr').innerHTML = q.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
  };
  draw();
  $('#amt').oninput = draw;
  $('#b-back').onclick = () => render('home');
  let t;
  $('#b-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(S.addr); }
    catch (e) { const a = document.createElement('textarea'); a.value = S.addr; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); }
    const st = $('#copy-state'); if (!st) return;
    $('#b-copy').classList.add('done');
    st.innerHTML = `${ic('check', 18)}<small>Скопировано</small>`;
    clearTimeout(t); t = setTimeout(() => { const b = $('#b-copy'); if (!b) return; b.classList.remove('done'); $('#copy-state').innerHTML = `${ic('copy', 18)}<small>Копировать</small>`; }, 1600);
  };
};

/* ---------- активы и переводы ---------- */
const MIN_TON_SEND = 0.05;   // минимальная сумма отправки TON
const JETTON_GAS = '0.05';   // уходит на газ токен-перевода, неизрасходованное возвращается
function assets() {
  return [{ id: 'TON', symbol: 'TON', name: 'Toncoin', balance: S.balance, decimals: 9, image: '' }]
    .concat(S.jettons.map(j => ({
      id: j.jetton.address, symbol: j.jetton.symbol || '?', name: j.jetton.name || '', decimals: j.jetton.decimals ?? 9,
      balance: Number(j.balance) / 10 ** (j.jetton.decimals ?? 9), units: j.balance,
      image: j.jetton.image, wallet: j.wallet_address?.address
    })));
}
function toUnits(str, dec) {
  const [i, f = ''] = str.split('.');
  return new TW.utils.BN((i + f.padEnd(dec, '0').slice(0, dec)).replace(/^0+(?=\d)/, ''));
}
async function buildTransfer(d, secretKey, seqno) {
  if (d.kind === 'nft') return buildNftTransfer(d, secretKey, seqno);
  if (d.kind === 'swap') return buildSwap(d, secretKey, seqno);
  if (d.asset === 'TON') {
    return S.wallet.methods.transfer({
      secretKey, toAddress: d.to, amount: d.all ? 0 : TW.utils.toNano(d.amount),
      seqno, payload: d.comment || '', sendMode: d.all ? 128 : 3   // 128 = отправить весь баланс, комиссия из него
    }).getQuery();
  }
  const a = assets().find(x => x.id === d.asset);
  const C = TW.boc.Cell, body = new C();
  body.bits.writeUint(0x0f8a7ea5, 32);                 // jetton transfer
  body.bits.writeUint(0, 64);                          // query_id
  body.bits.writeCoins(toUnits(d.amount, a.decimals));
  body.bits.writeAddress(new TW.utils.Address(d.to)); // получатель
  body.bits.writeAddress(S.addrObj);                   // сдача газа возвращается мне
  body.bits.writeBit(0);                               // без custom_payload
  body.bits.writeCoins(new TW.utils.BN(1));            // 1 нанотон: минимум, чтобы получатель увидел перевод
  if (d.comment) { const cm = new C(); cm.bits.writeUint(0, 32); cm.bits.writeString(d.comment); body.bits.writeBit(1); body.refs.push(cm); }
  else body.bits.writeBit(0);
  const jw = new TW.utils.Address(a.wallet).toString(true, true, true, S.net === 'testnet');
  return S.wallet.methods.transfer({ secretKey, toAddress: jw, amount: TW.utils.toNano(JETTON_GAS), seqno, payload: body, sendMode: 3 }).getQuery();
}

function assetLogo(x) {
  if (x.id === 'TON') return TON_LOGO;
  const pop = POPULAR.find(t => t.id === String(x.id).toLowerCase());
  if (pop?.logo) return pop.logo();
  return safeImg(x.image) ? `<img src="${safeImg(x.image)}" alt="">` : esc((x.symbol || '?')[0]);
}
function priceUsd(x) {
  if (x.id === 'TON') return S.rate.usd || 0;
  const j = S.jettons.find(z => z.jetton.address === x.id);
  return j?.price?.prices?.USD || S.prices?.[String(x.id).toLowerCase()] || 0;
}
V.send = preset => {
  const d = S.draft || { asset: preset || 'TON' };
  const list = assets();
  const cur = list.find(x => x.id === d.asset) || list[0];
  const px = priceUsd(cur);
  let fiat = !!d.fiat && px > 0;
  app.innerHTML = `<div class="view sheet">
    <div class="sheet-head">
      <button class="round" id="b-back" aria-label="Назад">${ic('back', 18)}</button>
      <h2>Отправить ${esc(cur.symbol)}</h2>
      <button class="round" id="b-close" aria-label="Закрыть">${ic('x', 18)}</button>
    </div>
    <div class="box addr">
      <div class="box-main"><small>Адрес</small><textarea id="to" rows="1" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="UQ… или EQ…">${esc(d.to || '')}</textarea></div>
      <button class="pill" id="b-paste" type="button">Вставить</button>
    </div>
    ${recents().length ? `<div class="recents">${recents().map(r => `<button type="button" class="chip-btn" data-to="${esc(r.addr)}">${esc(r.name)}</button>`).join('')}</div>` : ''}
    <div class="box amount">
      <div class="box-main"><small>Сумма</small><input id="amt" inputmode="decimal" placeholder="0" value="${esc(d.amountInput || d.amount || '')}"></div>
      <button class="asset-pill" id="b-asset" type="button"><span class="ico sm">${assetLogo(cur)}</span><b>${esc(fiat ? 'USD' : cur.symbol)}</b>${ic('chevDown', 16)}</button>
    </div>
    <div class="under">
      <button type="button" class="conv" id="b-conv" ${px ? '' : 'disabled'}><span id="conv">—</span>${px ? ic('updown', 14) : ''}</button>
      <span class="left-max"><span id="left"></span> <button type="button" id="b-max">МАКС</button></span>
    </div>
    <div class="box"><div class="box-main"><input id="cmt" value="${esc(d.comment || '')}" maxlength="120" placeholder="Комментарий"></div></div>
    <div class="err" id="err"></div>
    <div class="sheet-foot"><button class="btn primary" id="b-next" disabled>Продолжить</button></div>
    <div class="picker" id="picker" hidden><div class="picker-card">
      <div class="sheet-head"><span></span><h2>Валюта</h2><button class="round" id="b-pclose" aria-label="Закрыть">${ic('x', 18)}</button></div>
      ${list.map(x => `<button type="button" class="item tap" data-pick="${esc(x.id)}"><div class="ico">${assetLogo(x)}</div>
        <div class="mid"><b>${esc(x.name || x.symbol)}</b><small>${esc(x.symbol)}</small></div><div class="right">${fmt(x.balance, 4)}</div></button>`).join('')}
    </div></div>
  </div>`;
  let all = !!d.all;
  const ta = $('#to');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  grow(); ta.oninput = () => { grow(); check(); };
  // сумма в токенах из поля ввода (поле может быть в USD)
  const tokenAmount = () => {
    const raw = $('#amt').value.trim().replace(',', '.');
    if (!raw || !(+raw > 0)) return '';
    if (!fiat) return raw;
    const t = +raw / px; return String(Math.floor(t * 10 ** Math.min(cur.decimals, 9)) / 10 ** Math.min(cur.decimals, 9));
  };
  const check = () => {
    const amt = tokenAmount(), n = +amt || 0;
    $('#conv').textContent = !px ? '' : fiat ? `${fmt(n, 6)} ${cur.symbol}` : `USD ${fmt(n * px, 2)}`;
    const left = Math.max(0, cur.balance - n);
    $('#left').textContent = `Останется: ${fmt(left, 6)} ${cur.symbol}`;
    $('#left').classList.toggle('over', n > cur.balance);
    const tooSmall = cur.id === 'TON' && n > 0 && n < MIN_TON_SEND;
    $('#err').textContent = tooSmall ? `Минимум ${MIN_TON_SEND} TON` : '';
    $('#b-next').disabled = !(TW.utils.Address.isValid($('#to').value.trim()) && n > 0 && n <= cur.balance && !tooSmall);
  };
  const keep = () => ({ to: $('#to').value.trim(), amountInput: $('#amt').value.trim(), comment: $('#cmt').value, fiat });
  $('#amt').oninput = () => { all = false; check(); };
  $('#b-back').onclick = () => { S.draft = null; render('home'); };
  $('#b-close').onclick = () => { S.draft = null; render('home'); };
  app.querySelectorAll('[data-to]').forEach(b => b.onclick = () => { ta.value = b.dataset.to; grow(); check(); $('#amt').focus(); });
  $('#b-paste').onclick = async () => { try { ta.value = (await navigator.clipboard.readText()).trim(); grow(); check(); } catch (e) { toast('Браузер не дал прочитать буфер. Вставь вручную'); } };
  $('#b-asset').onclick = () => { $('#picker').hidden = false; };
  $('#b-pclose').onclick = () => { $('#picker').hidden = true; };
  app.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { S.draft = { ...keep(), amountInput: '', fiat: false, asset: b.dataset.pick }; V.send(); });
  $('#b-conv').onclick = () => {
    if (!px) return;
    const t = tokenAmount();
    fiat = !fiat;
    $('#amt').value = !t ? '' : fiat ? String(Math.round(+t * px * 100) / 100) : t;
    $('#b-asset b').textContent = fiat ? 'USD' : cur.symbol;
    check();
  };
  $('#b-max').onclick = () => {
    const max = cur.id === 'TON' ? cur.balance : (cur.units ? Number(cur.units) / 10 ** cur.decimals : 0);
    fiat = false; $('#b-asset b').textContent = cur.symbol;
    $('#amt').value = String(max); all = cur.id === 'TON'; check();
  };
  check();
  $('#b-next').onclick = async () => {
    const to = $('#to').value.trim(), comment = $('#cmt').value, amount = tokenAmount();
    const err = m => { $('#err').textContent = m; };
    if (!TW.utils.Address.isValid(to)) return err('Неверный адрес');
    const A = new TW.utils.Address(to);
    if (A.isUserFriendly && A.isTestOnly) return err('Это адрес тестовой сети');
    if (A.toString(false).toLowerCase() === S.raw) return err('Это твой собственный адрес');
    const re = new RegExp(`^\\d+(\\.\\d{1,${cur.decimals}})?$`);
    if (!re.test(amount) || !(Number(amount) > 0)) return err('Введи сумму');
    if (cur.id === 'TON') {
      if (Number(amount) < MIN_TON_SEND) return err(`Минимальная сумма отправки — ${MIN_TON_SEND} TON`);
      if (Number(amount) > cur.balance) return err('Недостаточно TON');
    } else {
      if (toUnits(amount, cur.decimals).gt(new TW.utils.BN(cur.units))) return err(`Недостаточно ${cur.symbol}`);
      if (S.balance < +JETTON_GAS) return err(`Нужно ${JETTON_GAS} TON на газ, остаток вернётся`);
    }
    let dest = to, inactive = false;
    if (cur.id === 'TON') {
      // неактивному кошельку отправляем без возврата, иначе TON отскочит и комиссия пропадёт
      $('#b-next').disabled = true;
      try { const acc = await get(`/v2/accounts/${encodeURIComponent(to)}`); inactive = acc.status !== 'active'; }
      catch (e) { inactive = String(e.message).includes('404'); }
      $('#b-next').disabled = false;
      if (inactive && A.isUserFriendly && A.isBounceable) dest = A.toString(true, true, false, S.net === 'testnet');
    }
    S.draft = { asset: cur.id, symbol: cur.symbol, to: dest, shown: to, inactive, amount, amountInput: $('#amt').value.trim(), fiat, comment,
      all: all && cur.id === 'TON' && Number(amount) === cur.balance };
    render('confirmSend');
  };
};

V.confirmSend = () => {
  const d = S.draft, isTon = d.asset === 'TON';
  const uah = v => S.rate.uah ? ` (≈ ${fmt(v * S.rate.uah, 2)} ₴)` : '';
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Изменить</button>
    <div class="tx-head">
      <div class="ico big out">${ic('up', 24)}</div>
      <div class="tx-amt">${esc(d.amount)} ${esc(d.symbol)}</div>
      <p class="muted">${d.all ? 'весь баланс · ' : ''}на ${esc(short(d.to))}</p>
    </div>
    <div class="sum">
      <div><span>Кому</span><span>${esc(d.shown || d.to)}</span></div>

      <div><span>${d.all ? 'Отправляешь' : 'Сумма'}</span><span>${d.all ? 'весь баланс, ' : ''}${esc(d.amount)} ${esc(d.symbol)}${isTon ? uah(+d.amount) : ''}</span></div>
      ${d.comment ? `<div><span>Комментарий</span><span>${esc(d.comment)}</span></div>` : ''}
      <div><span>Комиссия сети</span><span id="fee">считаю…</span></div>

      <div><span>${d.all ? 'Получатель получит' : 'Всего спишется'}</span><span id="total">—</span></div>

    </div>
    <div class="note">Переводы в блокчейне <b>нельзя отменить</b>. Проверь адрес ещё раз.</div>
    <div class="err" id="err"></div>
    <button class="btn primary" id="b-go">Отправить ${esc(d.amount)} ${esc(d.symbol)}</button>
  </div>`;
  $('#b-back').onclick = () => render('send');
  estimateFee(d).then(fee => {
    if (S.view !== 'confirmSend') return;
    $('#fee').textContent = `${fmt(fee, 6)} TON${uah(fee)}`;
    if (d.all) $('#total').textContent = `${fmt(Math.max(0, +d.amount - fee), 6)} TON`;
    else if (isTon) $('#total').textContent = `${fmt(+d.amount + fee, 6)} TON${uah(+d.amount + fee)}`;
    else $('#total').textContent = `${esc(d.amount)} ${d.symbol} + ${fmt(fee, 6)} TON`;
    const need = isTon ? (d.all ? fee : +d.amount + fee) : Math.max(fee, +JETTON_GAS);
    if (need > S.balance) { $('#err').textContent = 'С учётом комиссии не хватает TON. Уменьши сумму или нажми «всё».'; $('#b-go').disabled = true; }
  }).catch(() => { if (S.view === 'confirmSend') { $('#fee').textContent = 'не удалось рассчитать, будет списана только плата сети'; $('#total').textContent = `${esc(d.amount)} ${esc(d.symbol)} + плата сети`; } });
  $('#b-go').onclick = () => pinPad({
    title: 'Подтверди перевод', sub: `${d.amount} ${d.symbol} → ${short(d.to)}`, throttle: true,
    back: () => render('confirmSend'),
    check: async pin => {
      let kp;
      try { const w = await decryptWords(pin); kp = await MN.mnemonicToKeyPair(w); w.fill(''); } catch (e) { return false; }
      sendNow(kp.secretKey); return true;
    }
  });
};

async function getSeqno() {
  try { return (await get(`/v2/wallet/${encodeURIComponent(S.raw)}/seqno`)).seqno || 0; }
  catch (e) { if (String(e.message).includes('404')) return 0; throw e; }
}

/* Комиссия: перевод с пустой подписью прогоняется в эмуляторе TonAPI.
   Настоящий ключ для этого не используется и никуда не уходит. */
async function estimateFee(d) {
  const seqno = await getSeqno();
  const q = await buildTransfer(d, null, seqno);
  const boc = TW.utils.bytesToBase64(await q.toBoc(false));
  const need = d.kind === 'nft' || d.kind === 'swap' ? +d.attach : d.asset === 'TON' ? +d.amount : +JETTON_GAS;
  const balance = Math.round((d.all ? S.balance : Math.max(S.balance, need + 1)) * 1e9);
  const r = await fetchRetry(api() + '/v2/wallet/emulate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boc, params: [{ address: S.raw, balance }] })
  });
  if (!r.ok) throw new Error('emulate ' + r.status);
  const j = await r.json();
  let extra = Number(j.event?.extra);
  if (!Number.isFinite(extra)) throw new Error('no fee');
  // для «весь баланс» extra включает отправленную сумму — берём комиссию из трейса
  if (d.all) extra = -Number(j.trace?.transaction?.total_fees || 0);
  return Math.max(0, -extra) / 1e9;
}

async function sendNow(secretKey) {
  const d = S.draft;
  app.innerHTML = `<div class="view status"><div class="spin"></div><h2>Отправляю…</h2><p class="muted" id="st">Подписываю перевод</p></div>`;
  const st = m => { const el = document.getElementById('st'); if (el) el.textContent = m; };
  try {
    const raw = encodeURIComponent(S.raw);
    const seqno = await getSeqno();
    const cell = await buildTransfer(d, secretKey, seqno);
    secretKey.fill(0);
    const boc = TW.utils.bytesToBase64(await cell.toBoc(false));
    st('Отправляю в сеть');
    const r = await fetchRetry(api() + '/v2/blockchain/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boc }) });
    if (!r.ok) throw new Error('Сеть отклонила перевод (' + r.status + ')');
    st('Жду подтверждения сети (обычно 5–15 секунд)');
    let done = false;
    for (let i = 0; i < 30 && !done; i++) {
      await new Promise(res => setTimeout(res, 2000));
      try { const s2 = (await get(`/v2/wallet/${raw}/seqno`)).seqno; if (s2 > seqno) done = true; } catch (e) {}
    }
    S.draft = null;
    app.innerHTML = `<div class="view status"><div class="big ${done ? 'ok-state' : ''}">${ic(done ? 'check' : 'clock', 36)}</div>
      <h2>${done ? (d.kind === 'swap' ? 'Обмен отправлен' : 'Отправлено') : 'Перевод отправлен в сеть'}</h2>
      <p class="muted">${done ? (d.doneText ? esc(d.doneText) : `${esc(d.amount)} ${esc(d.symbol)} ушли на ${esc(short(d.shown || d.to))}`) : 'Подтверждение задерживается. Проверь историю через минуту'}</p>
      <button class="btn primary" id="b-home">К кошельку</button></div>`;
    $('#b-home').onclick = () => { render('home'); refresh(); setTimeout(refresh, 12000); };
  } catch (e) {
    app.innerHTML = `<div class="view status"><div class="big fail">${ic('x', 36)}</div><h2>Не получилось</h2>
      <p class="muted">${esc(e.message || e)}</p><button class="btn primary" id="b-back">Назад</button></div>`;
    $('#b-back').onclick = () => render(d.kind === 'nft' ? 'nftConfirm' : d.kind === 'swap' ? 'swap' : 'confirmSend');
  }
}

V.settings = () => {
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Настройки</h2>
    <div class="list">
      <button class="setting" id="b-tc"><span>Подключённые сайты</span><span class="setting-val">${tcSessions().length || ''}${ic('chev', 16)}</span></button>
      <button class="setting" id="b-wallets"><span>Кошельки</span><span class="setting-val">${esc(walletName())}${ic('chev', 16)}</span></button>
      <button class="setting" id="b-hidescam"><span>Скрывать скам</span><span class="switch ${S.hideScam ? 'on' : ''}"></span></button>
      <button class="setting" id="b-theme"><span>Оформление</span><span class="setting-val">${S.theme === 'gray' ? 'Серое' : 'Стандартное'}${ic('chev', 16)}</span></button>
      <button class="setting" id="b-phrase"><span>Показать секретную фразу</span>${ic('chev', 16)}</button>
      <button class="setting danger" id="b-del"><span>Удалить кошелёк с устройства</span>${ic('chev', 16)}</button>
    </div>
    <p class="muted">ПИН-код спрашивается только при отправке и при показе секретной фразы. Тип кошелька: ${VER_NAME[S.ver] || S.ver}.</p>
  </div>`;
  $('#b-back').onclick = () => render('home');
  $('#b-phrase').onclick = () => render('phrase');
  $('#b-wallets').onclick = () => render('wallets');
  $('#b-tc').onclick = () => render('tcList');
  $('#b-hidescam').onclick = () => { S.hideScam = !S.hideScam; try { localStorage.setItem('vxw-hidescam', S.hideScam ? '1' : '0'); } catch (e) {} lastSig = ''; render('settings'); };
  $('#b-del').onclick = () => render('reset');
  $('#b-theme').onclick = () => {
    S.theme = S.theme === 'gray' ? 'std' : 'gray';
    document.documentElement.dataset.theme = S.theme;
    try { localStorage.setItem('vxw-theme', S.theme); } catch (e) {}
    render('settings');
  };
  bindInstall();
};

V.phrase = () => pinPad({
  title: 'Введи ПИН-код', sub: 'Чтобы показать секретную фразу', throttle: true,
  back: () => render('settings'),
  check: async pin => { let w; try { w = await decryptWords(pin); } catch (e) { return false; } showPhrase(w); return true; }
});
function showPhrase(w) {
  S.view = 'phrase';
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Секретная фраза</h2>
    <div class="note"><b>Убедись, что никто не смотрит на экран.</b> Никому не отправляй фразу и не вставляй её на сайты. Поддержка никогда её не спрашивает. Если копируешь, вставь сразу в надёжное место.</div>
    <div class="words">${w.map((x, i) => `<div><i>${i + 1}</i>${esc(x)}</div>`).join('')}</div>
    <button class="btn" id="b-copy">Скопировать фразу</button>
  </div>`;
  $('#b-back').onclick = () => render(S.banned ? 'banned' : 'settings');
  $('#b-copy').onclick = () => copySeed(w);
  setTimeout(() => { if (S.view === 'phrase') render('settings'); }, 60000);
}

async function switchNet() {
  S.net = S.net === 'testnet' ? 'mainnet' : 'testnet';
  try { localStorage.setItem(NET, S.net); } catch (e) {}
  if (S.pub && S.ver === 'v5R1') { S.wallet = makeWallet(S.ver, S.pub); S.addrObj = await S.wallet.getAddress(); }
  if (S.addrObj) setAddr();
  S.balance = 0; S.jettons = []; S.events = []; S.loaded = false;
}

/* ---------- start ---------- */
document.documentElement.dataset.theme = S.theme;
if (!TW || !MN || !window.crypto?.subtle) {
  app.innerHTML = '<div class="view"><h2>Не удалось загрузить кошелёк</h2><p class="muted">Обнови страницу. Если не помогает, открой сайт в Chrome, Safari или Firefox по адресу https://…</p></div>';
  return;
}
if (location.hostname === 'localhost') window.__vxw = { S, refresh, render, makeWallet, buildTransfer, stonSimulate, swapTokens, getSeqno, estimateFee, readWallets, switchWallet, tcParse, tcSessions, tcBuild, emulateBocFee };
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
const st0 = loadStore();
const tcBoot = tcFromUrl();            // запрос подключения из универсальной ссылки (например, Fragment)
if (tcBoot) S.tcPending = tcBoot;
if (!st0) render('welcome');           // нет кошелька: создаст, потом покажет подключение
else if (st0.kind === 'pin' && st0.pub) openPublic().then(() => {
  // ярлыки приложения: ?action=send / ?action=receive
  const act = new URLSearchParams(location.search).get('action');
  history.replaceState(null, '', location.pathname);
  if (S.tcPending) { render('tcConnect'); refresh(); return; }
  render(act === 'send' ? 'send' : act === 'receive' ? 'receive' : 'home'); refresh();
}).catch(() => render('unlock'));
else render('unlock');   // старый кошелёк с паролем — один раз переводим на ПИН
setInterval(() => { if (S.view === 'home' && S.raw) refresh(); }, 30000);
})();
