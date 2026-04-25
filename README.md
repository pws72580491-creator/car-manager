# 🚗 CARLOG — 차량 관리 앱

## 저장소
**https://github.com/pws72580491-creator/car-manager.git**

---

## 🚀 배포 방법 (Vercel 자동 배포)

### 1단계 — Firebase 설정

**익명 인증 활성화**
Firebase Console → Authentication → Sign-in method → Anonymous → 사용 설정

**Realtime Database 규칙**
```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

### 2단계 — GitHub에 푸시

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/pws72580491-creator/car-manager.git
git push -u origin main
```

### 3단계 — Vercel 배포

1. [vercel.com](https://vercel.com) → GitHub 로그인
2. **"Add New Project"** → `car-manager` 선택
3. Framework Preset: **Vite** 선택
4. **Deploy** 클릭

배포 후 앱 주소: **https://car-manager-u32i.vercel.app**

### 4단계 — 홈화면에 설치

- Android: Chrome 주소창 `⋮` → 홈 화면에 추가
- iOS: Safari 공유버튼 → 홈 화면에 추가

---

## 🛠 로컬 개발

```bash
npm install
npm run dev
```
