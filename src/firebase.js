import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, set, get } from "firebase/database";
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

export function initAuth() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("auth timeout")), 5000);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        clearTimeout(timer); unsub(); _uid = user.uid; resolve(user.uid);
      } else {
        signInAnonymously(auth)
          .then((cred) => { clearTimeout(timer); unsub(); _uid = cred.user.uid; resolve(cred.user.uid); })
          .catch(() => {
            clearTimeout(timer); unsub();
            let id = localStorage.getItem("carlog_uid");
            if (!id) { id = "local_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); localStorage.setItem("carlog_uid", id); }
            _uid = id; resolve(id);
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

export async function fbGet(key) {
  try {
    const r = userRef(key);
    if (!r) return null;
    const snap = await get(r);
    if (!snap.exists()) return null;
    const val = snap.val();
    if (['cars','maintenances','fuels','reminders'].includes(key)) return normalizeArray(val) ?? [];
    return val;
  } catch { return null; }
}

export async function fbSet(key, value) {
  try {
    const r = userRef(key);
    if (!r) return;
    await set(r, value);
  } catch (e) { console.warn("Firebase write failed:", e); }
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
