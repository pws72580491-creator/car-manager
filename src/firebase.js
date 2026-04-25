import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, set, get } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDB9uRZWDTzWGtaxCCPfajaDHYnoTTCVpo",
  authDomain: "car-manager-c3fbc.firebaseapp.com",
  projectId: "car-manager-c3fbc",
  storageBucket: "car-manager-c3fbc.firebasestorage.app",
  messagingSenderId: "745222944390",
  appId: "1:745222944390:web:7066d88ddbd1a03e950307",
  databaseURL: "https://car-manager-c3fbc-default-rtdb.asia-southeast1.firebasedatabase.app",
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

let _uid = null;

// 익명 로그인 — 기기당 고유 UID 자동 발급
export function initAuth() {
  return new Promise((resolve, reject) => {
    // 5초 안에 auth 상태 못 받으면 reject → main.jsx catch에서 앱 강제 렌더
    const timer = setTimeout(() => reject(new Error("auth timeout")), 5000);

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        clearTimeout(timer);
        unsub();
        _uid = user.uid;
        resolve(user.uid);
      } else {
        signInAnonymously(auth)
          .then((cred) => {
            clearTimeout(timer);
            unsub();
            _uid = cred.user.uid;
            resolve(cred.user.uid);
          })
          .catch((err) => {
            clearTimeout(timer);
            unsub();
            // 오프라인 폴백: localStorage 기반 로컬 ID
            let id = localStorage.getItem("carlog_uid");
            if (!id) {
              id = "local_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
              localStorage.setItem("carlog_uid", id);
            }
            _uid = id;
            resolve(id); // 에러여도 resolve — 앱은 뜬다
          });
      }
    }, (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function userRef(key) {
  if (!_uid) return null;
  return ref(db, `users/${_uid}/${key}`);
}

// Firebase는 배열 원소 삭제 시 object로 반환할 수 있음 → 항상 배열로 정규화
function normalizeArray(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') {
    // numeric key object → array
    const keys = Object.keys(val);
    if (keys.every(k => !isNaN(k))) return Object.values(val);
  }
  return val;
}

export async function fbGet(key) {
  try {
    const r = userRef(key);
    if (!r) return null;
    const snap = await get(r);
    if (!snap.exists()) return null;
    const val = snap.val();
    // 배열 계열 키는 정규화
    if (['cars','maintenances','fuels','reminders'].includes(key)) {
      return normalizeArray(val) ?? [];
    }
    return val;
  } catch {
    return null;
  }
}

export async function fbSet(key, value) {
  try {
    const r = userRef(key);
    if (!r) return;
    await set(r, value);
  } catch (e) {
    console.warn("Firebase write failed:", e);
  }
}
