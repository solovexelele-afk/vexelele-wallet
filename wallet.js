/* Starlify Wallet — некастодиальный TON-кошелёк.
   Секретная фраза шифруется ПИН-кодом (PBKDF2 + AES-GCM) и хранится только в этом браузере.
   Никуда, кроме блокчейна (подписанные переводы), данные не отправляются. */
(() => {
'use strict';
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
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'
};
const ic = (n, size = 18) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const STAR = (size = 16) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95z"/></svg>`;
const TON_LOGO = '<svg class="logo-ton" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="28" fill="#0098EA"/><path fill="#fff" d="M37.56 15.63H18.44c-3.52 0-5.74 3.79-3.98 6.86l11.8 20.45a2 2 0 0 0 3.47 0l11.8-20.45c1.77-3.06-.46-6.86-3.97-6.86Zm-11.3 21.18-2.58-4.98-6.2-11.09a1.08 1.08 0 0 1 .95-1.62h7.82v17.69Zm12.25-16.07-6.2 11.1-2.57 4.97V19.12h7.82c.86 0 1.36.91.95 1.62Z"/></svg>';
const USDT_LOGO = '<svg class="logo-ton" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="28" fill="#26A17B"/><path fill="#fff" d="M31 25.3v-3.9h8.9v-5.9H16.1v5.9H25v3.9c-7.2.3-12.6 1.8-12.6 3.5s5.4 3.2 12.6 3.5v12.5h6V32.3c7.2-.3 12.6-1.8 12.6-3.5s-5.4-3.2-12.6-3.5Zm0 5.9c-.2 0-1.2.1-3 .1-1.5 0-2.6-.1-3-.1-6.4-.3-11.1-1.4-11.1-2.7s4.7-2.4 11.1-2.7v4.4c.4 0 1.6.1 3 .1 1.7 0 2.6-.1 3-.1v-4.4c6.4.3 11.1 1.4 11.1 2.7s-4.7 2.4-11.1 2.7Z"/></svg>';
/* сумма: целая часть ярко, дробная приглушённо */
function money(n, d = 4, cur = '') {
  const str = fmt(n, d), k = str.lastIndexOf(',');
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
function loadStore() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }

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
    this.methods = { transfer: p => ({ getQuery: () => self.transferQuery(p) }) };
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
    const C = TW.boc.Cell;
    // W5 принимает от внешних сообщений только режимы с флагом +2
    const mode = sendMode === 128 ? 130 : (sendMode | 2);
    const msg = TW.Contract.createOutMsg(toAddress, amount, payload || '', null);
    const act = new C();
    act.refs.push(new C());                               // предыдущий список действий (пусто)
    act.bits.writeUint(0x0ec3c86d, 32); act.bits.writeUint(mode, 8); act.refs.push(msg);
    const sm = new C();
    sm.bits.writeUint(0x7369676e, 32);                    // "sign"
    sm.bits.writeUint(this.walletId, 32);
    sm.bits.writeUint(seqno === 0 ? 0xffffffff : Math.floor(Date.now() / 1000) + 60, 32);
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
const paint = () => { if (S.view === 'home') renderHome(); };

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
      S.jettons = (j.balances || []).filter(x => x.balance !== '0' && x.jetton?.verification !== 'blacklist');
      paint();
    } catch (e) {}
    // 4) история, спам-переводы прячем
    try {
      const ev = await get(`/v2/accounts/${raw}/events?limit=40`);
      S.events = (ev.events || []).filter(e => !e.is_scam && !(e.actions || []).some(a => (a.TonTransfer || a.JettonTransfer || {}).sender?.is_scam));
      if (S.tab === 'history') paint();
    } catch (e) {}
    // 5) NFT
    try {
      const n = await get(`/v2/accounts/${raw}/nfts?limit=60&indirect_ownership=false`);
      S.nfts = (n.nft_items || []).filter(x => x.trust !== 'blacklist');
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
  (V[view] || V.welcome)(arg);
  scrollTo(0, 0);
}
const V = {};

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
  $('#b-back').onclick = () => { S.newWords = null; render('welcome'); };
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
  $('#b-back').onclick = () => render('welcome');
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
          Object.assign(enc, { kind: 'pin', pub: TW.utils.bytesToHex(S.keyPair.publicKey), ver });
          try { localStorage.setItem(STORE, JSON.stringify(enc)); }
          catch (e) { return 'Браузер не даёт сохранить данные (приватный режим?)'; }
          setAttempts({ n: 0, until: 0 });
          words.fill(''); S.newWords = null; forgetSecret();
          render('home'); refresh(); toast('ПИН-код установлен');
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
        await openWallet(w); forgetSecret(); render('home'); refresh();
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
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Удалить кошелёк с этого устройства</h2>
    <div class="note">ПИН-код восстановить нельзя. Можно удалить кошелёк из браузера и заново импортировать его по <b>секретной фразе</b>. Без фразы доступ к деньгам будет потерян навсегда.</div>
    <label class="field"><small class="lbl">Напиши «удалить», чтобы подтвердить</small><input id="c" autocomplete="off"></label>
    <button class="btn danger" id="b-del">Удалить из браузера</button>
  </div>`;
  $('#b-back').onclick = () => render(S.raw ? 'settings' : (loadStore() ? 'unlock' : 'welcome'));
  $('#b-del').onclick = () => {
    if ($('#c').value.trim().toLowerCase() !== 'удалить') { toast('Напиши «удалить»'); return; }
    try { Object.keys(localStorage).filter(k => k.startsWith('vxw')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    forgetSecret(); S.pub = null;
    Object.assign(S, { keyPair: null, wallet: null, raw: '', addr: '', balance: 0, jettons: [], events: [] });
    render('welcome');
  };
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
  const pf = portfolio(), test = S.net === 'testnet';
  const big = !S.loaded ? '…' : test || !pf.uah ? money(S.balance, 4, 'TON') : money(pf.uah, 2, '₴');
  const sub = !S.loaded ? '' : test ? 'тестовые TON, без стоимости' : `${fmt(S.balance)} TON · $${fmt(pf.usd, 2)}`;
  const ch = S.change24 != null && !test ? `<span class="chg ${S.change24 >= 0 ? 'plus' : 'minus'}">${S.change24 >= 0 ? '+' : '−'}${fmt(Math.abs(S.change24), 2)}% за 24ч</span>` : '';
  app.innerHTML = `<div class="view">
    <div class="balance">
      <div class="bal-top">
        <span class="bal-brand">${STAR(14)}Всего на кошельке</span>
        <span class="bal-tools"><button id="b-hide" aria-label="${S.hide ? 'Показать баланс' : 'Скрыть баланс'}">${ic(S.hide ? 'eyeOff' : 'eye', 16)}</button><button id="b-ref" aria-label="Обновить">${ic('refresh', 16)}</button></span>
      </div>
      <div class="amt">${S.hide && S.loaded ? '••••' : big}</div>
      <div class="fiat">${hid(sub)}</div>
      <div class="bal-foot"><button class="addr-chip" id="b-addr">${esc(short(S.addr))}${ic('copy', 14)}</button><small id="ago">${agoText()}</small></div>
    </div>
    <div class="actions">
      <button class="act primary" id="b-send"><b>${ic('up', 20)}</b>Отправить</button>
      <button class="act" id="b-recv"><b>${ic('down', 20)}</b>Получить</button>
      <button class="act" id="b-set"><b>${ic('settings', 20)}</b>Настройки</button>
    </div>
    <div class="tabs">${[['tokens', 'Активы'], ['nft', `NFT${S.nfts.length ? ' · ' + S.nfts.length : ''}`], ['history', 'История']]
      .map(([t, n]) => `<button data-t="${t}" class="${S.tab === t ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="list" id="list"></div>
  </div>`;
  $('#b-addr').onclick = () => copy(S.addr, 'Адрес скопирован');
  $('#b-send').onclick = () => { S.draft = null; render('send'); };
  $('#b-recv').onclick = () => render('receive');
  $('#b-set').onclick = () => render('settings');
  $('#b-hide').onclick = () => { S.hide = !S.hide; try { localStorage.setItem('vxw-hide', S.hide ? '1' : '0'); } catch (e) {} renderHome(); };
  $('#b-ref').onclick = async e => { e.currentTarget.classList.add('spinning'); await refresh(); };
  app.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { S.tab = b.dataset.t; renderHome(); });
  $('#list').innerHTML = S.tab === 'tokens' ? tokensHtml() : S.tab === 'nft' ? nftHtml() : historyHtml();
  app.querySelectorAll('.item.tap').forEach(el => el.onclick = () => {
    S.draft = null;
    if (el.dataset.asset === 'recv' || (el.classList.contains('zero') && el.dataset.asset === 'TON')) render('receive');
    else render('send', el.dataset.asset);
  });
  const z = $('#b-zero');
  if (z) z.onclick = () => { S.hideZero = !S.hideZero; try { localStorage.setItem('vxw-hidezero', S.hideZero ? '1' : '0'); } catch (e) {} renderHome(); };
  app.querySelectorAll('.item.ev').forEach(el => el.onclick = () => render('tx', S.events[+el.dataset.i]));
}
V.home = renderHome;
setInterval(() => { const a = document.getElementById('ago'); if (a) a.textContent = agoText(); }, 5000);

function tokenRow({ asset, logo, name, verified, sub, amount, symbol, usdLine, zero }) {
  return `<div class="item tap${zero ? ' zero' : ''}" data-asset="${esc(asset)}"><div class="ico">${logo}</div>
    <div class="mid"><b>${esc(name)}${verified ? `<span class="ok" title="Проверенный токен">${ic('check', 14)}</span>` : ''}</b><small>${sub}</small></div>
    <div class="right">${hid(fmt(amount))} ${esc(symbol)}<small>${usdLine}</small></div></div>`;
}
function tokensHtml() {
  const rows = [];
  const tonUsd = S.balance * (S.rate.usd || 0);
  const chg = S.change24 != null ? ` <span class="chg ${S.change24 >= 0 ? 'plus' : 'minus'}">${S.change24 >= 0 ? '+' : '−'}${fmt(Math.abs(S.change24), 2)}%</span>` : '';
  rows.push(tokenRow({ asset: 'TON', logo: TON_LOGO, name: 'Toncoin', verified: false, sub: (S.rate.usd ? '$' + fmt(S.rate.usd, 3) : 'TON') + chg,
    amount: S.balance, symbol: 'TON', usdLine: tonUsd ? hid('$' + fmt(tonUsd, 2)) : '', zero: !S.balance }));
  const held = new Set();
  for (const j of S.jettons) {
    const d = j.jetton.decimals ?? 9, amt = Number(j.balance) / 10 ** d, usd = j.price?.prices?.USD;
    const img = safeImg(j.jetton.image), raw = String(j.jetton.address).toLowerCase(); held.add(raw);
    const pop = POPULAR.find(t => t.id === raw);
    rows.push(tokenRow({ asset: j.jetton.address, logo: pop?.logo ? pop.logo() : img ? `<img src="${img}" alt="" loading="lazy">` : esc((j.jetton.symbol || '?')[0]),
      name: j.jetton.name, verified: j.jetton.verification === 'whitelist', sub: usd ? '$' + fmt(usd, usd < 0.01 ? 6 : 3) : esc(j.jetton.symbol),
      amount: amt, symbol: j.jetton.symbol, usdLine: usd ? hid('$' + fmt(amt * usd, 2)) : '' }));
  }
  if (!S.hideZero) for (const t of POPULAR) {
    if (held.has(t.id)) continue;
    const usd = S.prices?.[t.id];
    rows.push(tokenRow({ asset: 'recv', logo: t.logo ? t.logo() : S.popImg[t.id] ? `<img src="${safeImg(S.popImg[t.id])}" alt="" loading="lazy">` : esc(t.symbol[0]), name: t.name, verified: true,
      sub: usd ? '$' + fmt(usd, usd < 0.01 ? 6 : 3) : esc(t.symbol), amount: 0, symbol: t.symbol, usdLine: '', zero: true }));
  }
  const visible = S.hideZero ? rows.filter(r => !r.includes(' zero"')) : rows;
  return `<div class="list-head"><span>Активы</span><button id="b-zero">${S.hideZero ? 'Показать нулевые' : 'Скрыть нулевые'}</button></div>`
    + (visible.length ? visible.join('') : '<div class="empty">Пока пусто. Нажми «Получить», чтобы пополнить кошелёк</div>');
}

function nftHtml() {
  if (!S.loaded) return '<div class="empty">Загружаю…</div>';
  if (!S.nfts.length) return '<div class="empty">NFT пока нет.</div>';
  const host = S.net === 'testnet' ? 'https://testnet.tonviewer.com/' : 'https://tonviewer.com/';
  return `<div class="nfts">${S.nfts.map(n => {
    const pr = (n.previews || []).find(p => p.resolution === '500x500') || (n.previews || [])[0];
    const img = safeImg(pr?.url);
    const name = n.metadata?.name || n.dns || 'Без названия';
    return `<a class="nft" href="${host}${esc(n.address)}" target="_blank" rel="noopener noreferrer">
      <div class="nft-img">${img ? `<img src="${img}" alt="" loading="lazy">` : ic('image', 24)}</div>
      <b>${esc(name)}</b><small>${esc(n.collection?.name || '')}</small></a>`;
  }).join('')}</div>`;
}

function historyHtml() {
  if (!S.loaded) return '<div class="empty">Загружаю…</div>';
  if (!S.events.length) return '<div class="empty">Пока нет операций. Нажми «Получить», чтобы пополнить кошелёк.</div>';
  return S.events.map((e, idx) => {
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
      amount = `${incoming ? '+' : '−'}${fmt(val)} ${esc(sym)}`;
      sub = (incoming ? 'от ' : 'кому ') + otherAddr + (t.comment ? ' · «' + t.comment + '»' : '');
    }
    return `<div class="item ev" data-i="${idx}"><div class="ico ${cls === 'plus' ? 'in' : cls === 'minus' ? 'out' : ''}">${dir}</div>
      <div class="mid"><b>${esc(title)}${esc(pend + fail)}</b><small>${esc(sub)}</small></div>
      <div class="right"><span class="${cls}">${S.hide ? '••••' : amount}</span><small>${esc(when)}</small></div></div>`;
  }).join('');
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

V.receive = () => {
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Получить</h2>
    <p class="muted">Отсканируй QR в другом кошельке или отправь адрес. Сюда можно присылать TON, USDT и любые токены сети TON${S.net === 'testnet' ? ' (только тестовая сеть!)' : ''}.</p>
    <div class="qr" id="qr"></div>
    <div class="addr-full" id="addr">${esc(S.addr)}</div>
    <label class="field"><small class="lbl">Запросить сумму в TON (необязательно)</small><input id="amt" inputmode="decimal" placeholder="например 5"></label>
    <div class="row"><button class="btn primary" id="b-copy">Скопировать адрес</button><button class="btn" id="b-link">Ссылка на оплату</button></div>
  </div>`;
  const link = () => {
    const v = $('#amt').value.trim().replace(',', '.');
    return `ton://transfer/${S.addr}` + (/^\d+(\.\d{1,9})?$/.test(v) && +v > 0 ? `?amount=${TW.utils.toNano(v).toString()}` : '');
  };
  const draw = () => {
    if (!window.qrcode) return;
    const q = qrcode(0, 'M'); q.addData(link()); q.make();
    $('#qr').innerHTML = q.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
  };
  draw();
  $('#amt').oninput = draw;
  $('#b-back').onclick = () => render('home');
  $('#b-copy').onclick = () => copy(S.addr, 'Адрес скопирован');
  $('#b-link').onclick = () => copy(link().replace('ton://', 'https://app.tonkeeper.com/'), 'Ссылка скопирована');
};

/* ---------- активы и переводы ---------- */
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

V.send = preset => {
  const d = S.draft || { asset: preset || 'TON' };
  const list = assets();
  const cur = list.find(x => x.id === d.asset) || list[0];
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Отправить</h2>
    <div class="field"><small class="lbl">Что отправить</small>
      <div class="assets">${list.map(x => `<button type="button" class="asset ${x.id === cur.id ? 'on' : ''}" data-id="${esc(x.id)}">
        <span class="ico sm">${safeImg(x.image) ? `<img src="${safeImg(x.image)}" alt="">` : x.id === 'TON' ? TON_LOGO : esc(x.symbol[0])}</span>
        <span><b>${esc(x.symbol)}</b><small>${fmt(x.balance)}</small></span></button>`).join('')}</div>
    </div>
    <label class="field"><small class="lbl">Адрес получателя <button type="button" id="b-paste">вставить</button></small><input id="to" value="${esc(d.to || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="UQ… или EQ…"></label>
    ${recents().length ? `<div class="recents"><small class="lbl">Недавние</small>${recents().map(r => `<button type="button" class="chip-btn" data-to="${esc(r.addr)}">${esc(r.name)}</button>`).join('')}</div>` : ''}
    <label class="field big"><small class="lbl">Сумма, ${esc(cur.symbol)} · доступно ${fmt(cur.balance, cur.decimals)} <button type="button" id="b-max">всё</button></small><input id="amt" inputmode="decimal" value="${esc(d.amount || '')}" placeholder="0"></label>
    <label class="field"><small class="lbl">Комментарий (необязательно, виден всем)</small><input id="cmt" value="${esc(d.comment || '')}" maxlength="120"></label>
    ${cur.id !== 'TON' ? `<p class="muted">Для перевода ${esc(cur.symbol)} нужно ~${JETTON_GAS} TON на балансе. Реально спишется намного меньше, остальное сразу вернётся.</p>` : ''}
    <div class="err" id="err"></div>
    <button class="btn primary" id="b-next">Далее</button>
  </div>`;
  let all = !!d.all;
  const keep = () => ({ to: $('#to').value.trim(), amount: $('#amt').value.trim(), comment: $('#cmt').value });
  app.querySelectorAll('.asset').forEach(b => b.onclick = () => { S.draft = { ...keep(), amount: '', asset: b.dataset.id }; V.send(); });
  $('#b-back').onclick = () => { S.draft = null; render('home'); };
  $('#amt').oninput = () => { all = false; };
  app.querySelectorAll('[data-to]').forEach(b => b.onclick = () => { $('#to').value = b.dataset.to; $('#amt').focus(); });
  $('#b-paste').onclick = async () => { try { $('#to').value = (await navigator.clipboard.readText()).trim(); } catch (e) { toast('Браузер не дал прочитать буфер. Вставь вручную'); } };
  $('#b-max').onclick = () => {
    $('#amt').value = cur.id === 'TON' ? String(cur.balance) : (cur.units ? String(Number(cur.units) / 10 ** cur.decimals) : '0');
    all = cur.id === 'TON';
  };
  $('#b-next').onclick = () => {
    const { to, comment } = keep(), amount = $('#amt').value.trim().replace(',', '.');
    const err = m => { $('#err').textContent = m; };
    if (!TW.utils.Address.isValid(to)) return err('Неверный адрес. Проверь, что это адрес в сети TON.');
    const A = new TW.utils.Address(to);
    if (A.isUserFriendly && A.isTestOnly !== (S.net === 'testnet')) return err(S.net === 'testnet' ? 'Это адрес основной сети, а кошелёк в тестовой.' : 'Это адрес тестовой сети. В основной сети на него отправлять нельзя.');
    if (A.toString(false).toLowerCase() === S.raw) return err('Это твой собственный адрес.');
    const re = new RegExp(`^\\d+(\\.\\d{1,${cur.decimals}})?$`);
    if (!re.test(amount) || !(Number(amount) > 0)) return err(`Введи сумму, например 1.5 (до ${cur.decimals} знаков после точки).`);
    if (cur.id === 'TON') {
      if (Number(amount) > cur.balance) return err('Недостаточно TON.');
    } else {
      if (toUnits(amount, cur.decimals).gt(new TW.utils.BN(cur.units))) return err(`Недостаточно ${cur.symbol}.`);
      if (S.balance < +JETTON_GAS) return err(`Нужно хотя бы ${JETTON_GAS} TON на комиссию. Пополни TON.`);
    }
    S.draft = { asset: cur.id, symbol: cur.symbol, to, amount, comment, all: all && cur.id === 'TON' && Number(amount) === cur.balance };
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
      <div><span>Кому</span><span>${esc(d.to)}</span></div>
      <div><span>${d.all ? 'Отправляешь' : 'Сумма'}</span><span>${d.all ? 'весь баланс, ' : ''}${esc(d.amount)} ${esc(d.symbol)}${isTon ? uah(+d.amount) : ''}</span></div>
      ${d.comment ? `<div><span>Комментарий</span><span>${esc(d.comment)}</span></div>` : ''}
      <div><span>Комиссия сети</span><span id="fee">считаю…</span></div>
      <div><span>${d.all ? 'Получатель получит' : 'Всего спишется'}</span><span id="total">—</span></div>
      <div><span>Сеть</span><span>${S.net}</span></div>
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
  }).catch(() => { if (S.view === 'confirmSend') { $('#fee').textContent = isTon ? 'обычно 0.0005–0.005 TON' : 'обычно 0.002–0.02 TON'; $('#total').textContent = `${esc(d.amount)} ${esc(d.symbol)} + комиссия`; } });
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
  const need = d.asset === 'TON' ? +d.amount : +JETTON_GAS;
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
      <h2>${done ? 'Отправлено' : 'Перевод отправлен в сеть'}</h2>
      <p class="muted">${done ? `${esc(d.amount)} ${esc(d.symbol)} ушли на ${esc(short(d.to))}.` : 'Подтверждение задерживается. Проверь историю через минуту.'}</p>
      <button class="btn primary" id="b-home">К кошельку</button></div>`;
    $('#b-home').onclick = () => { render('home'); refresh(); };
  } catch (e) {
    app.innerHTML = `<div class="view status"><div class="big fail">${ic('x', 36)}</div><h2>Не получилось</h2>
      <p class="muted">${esc(e.message || e)}</p><button class="btn primary" id="b-back">Назад</button></div>`;
    $('#b-back').onclick = () => render('confirmSend');
  }
}

V.settings = () => {
  app.innerHTML = `<div class="view">
    <button class="back" id="b-back">${ic('back', 16)}Назад</button>
    <h2>Настройки</h2>
    <div class="list">
      <button class="setting" id="b-theme"><span>Оформление</span><span class="setting-val">${S.theme === 'gray' ? 'Серое' : 'Стандартное'}${ic('chev', 16)}</span></button>
      <button class="setting" id="b-phrase"><span>Показать секретную фразу</span>${ic('chev', 16)}</button>
      <button class="setting danger" id="b-del"><span>Удалить кошелёк с устройства</span>${ic('chev', 16)}</button>
    </div>
    <p class="muted">ПИН-код спрашивается только при отправке и при показе секретной фразы. Тип кошелька: ${VER_NAME[S.ver] || S.ver}.</p>
  </div>`;
  $('#b-back').onclick = () => render('home');
  $('#b-phrase').onclick = () => render('phrase');
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
  $('#b-back').onclick = () => render('settings');
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
if (location.hostname === 'localhost') window.__vxw = { S, refresh, render, makeWallet };
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
const st0 = loadStore();
if (!st0) render('welcome');
else if (st0.kind === 'pin' && st0.pub) openPublic().then(() => {
  // ярлыки приложения: ?action=send / ?action=receive
  const act = new URLSearchParams(location.search).get('action');
  render(act === 'send' ? 'send' : act === 'receive' ? 'receive' : 'home'); refresh();
}).catch(() => render('unlock'));
else render('unlock');   // старый кошелёк с паролем — один раз переводим на ПИН
setInterval(() => { if (S.view === 'home' && S.raw) refresh(); }, 30000);
})();
