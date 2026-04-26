import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, set, onValue, off } from "firebase/database";
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

let _uid = null;
let _isRealAuth = false; // 실제 Firebase 익명 로그인 성공 여부

export function getAuthStatus() {
  return { uid: _uid, isRealAuth: _isRealAuth };
}

// ─── 익명 로그인 ──────────────────────────────────────────────
export function initAuth() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("auth timeout")), 8000);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        clearTimeout(timer); unsub();
        _uid = user.uid; _isRealAuth = true;
        resolve(user.uid);
      } else {
        signInAnonymously(auth)
          .then((cred) => {
            clearTimeout(timer); unsub();
            _uid = cred.user.uid; _isRealAuth = true;
            resolve(cred.user.uid);
          })
          .catch((err) => {
            clearTimeout(timer); unsub();
            console.error("익명 로그인 실패:", err.code, err.message);
            // 오프라인 폴백 (Firebase에 저장 불가)
            let id = localStorage.getItem("carlog_uid");
            if (!id) {
              id = "local_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
              localStorage.setItem("carlog_uid", id);
            }
            _uid = id; _isRealAuth = false;
            resolve(id);
          });
      }
    }, (err) => { clearTimeout(timer); reject(err); });
  });
}

function userRef(key) {
  if (!_uid) return null;
  return ref(db, `users/${_uid}/${key}`);
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

// ─── 실시간 리스너 (onValue) ─────────────────────────────────
// 반환값: unsubscribe 함수
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

  onValue(r, handler, (err) => {
    console.warn(`fbListen [${key}] error:`, err);
    callback(null);
  });

  return () => off(r, 'value', handler);
}

// ─── 쓰기 (에러 반환) ────────────────────────────────────────
export async function fbSet(key, value) {
  if (!_isRealAuth) {
    console.warn("오프라인 모드: Firebase 저장 불가");
    return { ok: false, reason: 'no_auth' };
  }
  try {
    const r = userRef(key);
    if (!r) return { ok: false, reason: 'no_uid' };
    await set(r, value);
    return { ok: true };
  } catch (e) {
    console.error("Firebase write failed:", e.code, e.message);
    return { ok: false, reason: e.code || e.message };
  }
}

// ─── Storage: 사진 업로드 ─────────────────────────────────────
export async function fbUploadPhoto(file, recordId) {
  if (!_uid) return null;
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `photos/${_uid}/${recordId}.${ext}`;
    const snap = await uploadBytes(sRef(storage, path), file);
    return await getDownloadURL(snap.ref);
  } catch (e) { console.warn("Photo upload failed:", e); return null; }
}

// ─── Storage: 사진 삭제 ───────────────────────────────────────
export async function fbDeletePhoto(url) {
  if (!url) return;
  try { await deleteObject(sRef(storage, url)); } catch {}
}
