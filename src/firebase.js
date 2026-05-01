import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, set, onValue, off, get } from "firebase/database";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDB9uRZWDTzWGtaxCCPfajaDHYnoTTCVpo",
  authDomain: "car-manager-c3fbc.firebaseapp.com",
  projectId: "car-manager-c3fbc",
  storageBucket: "car-manager-c3fbc.firebasestorage.app",
  messagingSenderId: "745222944390",
  appId: "1:745222944390:web:7066d88ddbd1a03e950307",
  databaseURL: "https://car-manager-c3fbc-default-rtdb.asia-southeast1.firebasedatabase.app",
};

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getDatabase(app);
const storage = getStorage(app);

// ─── 사용자 고유 접근 코드 관리 ──────────────────────────────
// 브라우저 캐시 삭제와 무관하게 데이터를 유지하기 위해
// Firebase UID 대신 "사용자 직접 보관 가능한 코드"를 데이터 경로로 사용
const USER_CODE_KEY = 'carlog_user_code';

export function generateCode() {
  // 8자리 영숫자 코드 (사용자가 기억/저장 가능한 형태)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code; // 예: ABCD-1234
}

export function getSavedCode() {
  return localStorage.getItem(USER_CODE_KEY);
}

export function saveCode(code) {
  localStorage.setItem(USER_CODE_KEY, code.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(.{4})/, '$1-$2'));
}

// Firebase에 해당 코드의 데이터가 존재하는지 확인
export async function checkCodeExists(code) {
  try {
    const normalized = normalizeCode(code);
    const snap = await get(ref(db, `codes/${normalized}/cars`));
    return snap.exists();
  } catch {
    return false;
  }
}

function normalizeCode(code) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ─── 현재 사용 중인 코드 ──────────────────────────────────────
let _userCode = null;
let _isRealAuth = false;

export function getAuthStatus() {
  return { uid: _userCode, isRealAuth: _isRealAuth, code: _userCode };
}

export function getCurrentCode() {
  return _userCode;
}

// ─── 초기화: 코드 기반 경로 설정 ─────────────────────────────
export function initWithCode(code) {
  _userCode = normalizeCode(code);
  _isRealAuth = true;
  saveCode(code);
}

// ─── Firebase Auth (익명) + 코드 초기화 ──────────────────────
export function initAuth() {
  return new Promise((resolve) => {
    // 저장된 코드가 있으면 바로 사용
    const savedCode = getSavedCode();
    if (savedCode) {
      _userCode = normalizeCode(savedCode);
      _isRealAuth = true;
      resolve({ code: savedCode, isNew: false });
      return;
    }

    // 없으면 새 코드 생성
    const newCode = generateCode();
    _userCode = normalizeCode(newCode);
    _isRealAuth = true;
    saveCode(newCode);
    resolve({ code: newCode, isNew: true });
  });
}

// ─── DB 경로 ─────────────────────────────────────────────────
function userRef(key) {
  if (!_userCode) return null;
  return ref(db, `codes/${_userCode}/${key}`);
}

function normalizeArray(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (keys.every(k => !isNaN(k))) return Object.values(val);
  }
  return val;
}

// ─── 실시간 리스너 ────────────────────────────────────────────
export function fbListen(key, callback) {
  const r = userRef(key);
  if (!r) { callback(null); return () => {}; }
  const handler = (snap) => {
    const val = snap.exists() ? snap.val() : null;
    if (['cars','maintenances','fuels','reminders'].includes(key)) {
      callback(normalizeArray(val) ?? []);
    } else {
      callback(val);
    }
  };
  onValue(r, handler, () => callback(null));
  return () => off(r, 'value', handler);
}

// ─── 쓰기 ────────────────────────────────────────────────────
export async function fbSet(key, value) {
  if (!_isRealAuth) return { ok: false, reason: 'no_auth' };
  try {
    const r = userRef(key);
    if (!r) return { ok: false, reason: 'no_code' };
    await set(r, value);
    return { ok: true };
  } catch (e) {
    console.error("Firebase write failed:", e.code, e.message);
    return { ok: false, reason: e.code || e.message };
  }
}

// ─── Storage ─────────────────────────────────────────────────
export async function fbUploadPhoto(file, recordId) {
  if (!_userCode) return null;
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `photos/${_userCode}/${recordId}.${ext}`;
    const snap = await uploadBytes(sRef(storage, path), file);
    return await getDownloadURL(snap.ref);
  } catch (e) { console.warn("Photo upload failed:", e); return null; }
}

export async function fbDeletePhoto(url) {
  if (!url) return;
  try { await deleteObject(sRef(storage, url)); } catch {}
}
