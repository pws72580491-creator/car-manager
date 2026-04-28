import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { fbListen, fbSet, fbUploadPhoto, fbDeletePhoto, getAuthStatus } from "./firebase.js";

const TABS = ["내 차량", "정비 기록", "주유 기록", "알림"];

const maintenanceTypes = [
  "엔진오일 교체", "타이어 교환", "브레이크 패드", "에어필터", "배터리 교체",
  "냉각수 교체", "와이퍼 교체", "점화플러그", "변속기 오일", "기타"
];

const REMINDER_SUGGEST = {
  "엔진오일 교체":  { km:5000,  months:6,  label:"5,000km 또는 6개월 후" },
  "타이어 교환":    { km:40000, months:24, label:"40,000km 또는 2년 후" },
  "브레이크 패드":  { km:30000, months:0,  label:"30,000km 후" },
  "에어필터":       { km:15000, months:12, label:"15,000km 또는 1년 후" },
  "배터리 교체":    { km:0,     months:36, label:"3년 후" },
  "냉각수 교체":    { km:40000, months:24, label:"40,000km 또는 2년 후" },
  "와이퍼 교체":    { km:0,     months:12, label:"1년 후" },
  "점화플러그":     { km:20000, months:0,  label:"20,000km 후" },
  "변속기 오일":    { km:40000, months:0,  label:"40,000km 후" },
};

function formatDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  return `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`;
}
function formatNum(n) { return Number(n).toLocaleString(); }
function today() { return new Date().toISOString().split("T")[0]; }
function calcDday(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date().setHours(0,0,0,0)) / 86400000);
}
function filterByPeriod(items, dateKey, period) {
  if (period === 'all') return items;
  const now = new Date();
  return items.filter(item => {
    const d = new Date(item[dateKey]);
    if (period === 'month')   return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
    if (period === '3months') return (now - d) <= 90*24*60*60*1000;
    if (period === 'year')    return d.getFullYear()===now.getFullYear();
    return true;
  });
}

// ─── Theme tokens (업로드 파일 기반 세분화) ───────────────────
const DARK = {
  bg:"#0a0a0f", surface:"#13131a", surface2:"#0d0d14",
  border:"#1e1e2e", border2:"#1a1a28", border3:"#2a2a3e",
  text:"#e8e8f0", textSub:"#888", textMuted:"#555", textDim:"#444",
  tabBar:"#0d0d14",
  inputBg:"#0d0d14", inputBorder:"#1e1e2e", inputText:"#e8e8f0",
  modalBg:"rgba(0,0,0,0.78)", modalSurface:"#13131a", modalBorder:"#2a2a3e",
  cardBg:"#13131a", cardBorder:"#1e1e2e",
  listBg:"#0d0d14", listBorder:"#1a1a28",
  dotInactive:"#2a2a3e", deleteBtnColor:"#444",
  emojiBtnBg:"#0d0d14", emojiBtnBorder:"#1e1e2e",
  toggleBg:"#1a1a28", headingColor:"#ffffff",
  accent:"#ff6b00", accentHover:"#ff8c33",
  accentBg:"#ff6b0020", accentBorder:"#ff6b0050",
  accentFaint:"#ff6b0015", accentFaint2:"#ff6b0030",
  filterBg:"#1a1a28", scrollTrack:"#111",
  urgentBg:"#ff44440d", urgentBorder:"#ff444430", urgentClr:"#ff4444",
  okBg:"#44ff880d", okBorder:"#44ff8830", okClr:"#44ff88",
  shadow:"none",
  themeIcon:"☀️", themeLabel:"라이트 모드",
};
const LIGHT = {
  bg:"#f0f2f8", surface:"#ffffff", surface2:"#f5f7fc",
  border:"#dde1ee", border2:"#e8ecf5", border3:"#d0d5e8",
  text:"#1a1a2e", textSub:"#666", textMuted:"#999", textDim:"#ccc",
  tabBar:"#ffffff",
  inputBg:"#f5f7fc", inputBorder:"#dde1ee", inputText:"#1a1a2e",
  modalBg:"rgba(0,0,0,0.38)", modalSurface:"#ffffff", modalBorder:"#e0e4ed",
  cardBg:"#ffffff", cardBorder:"#dde1ee",
  listBg:"#f5f7fc", listBorder:"#e8ecf5",
  dotInactive:"#dde1ee", deleteBtnColor:"#ccc",
  emojiBtnBg:"#f0f2f8", emojiBtnBorder:"#dde1ee",
  toggleBg:"#eef0f8", headingColor:"#1a1a2e",
  accent:"#ff6b00", accentHover:"#e05e00",
  accentBg:"#ff6b0015", accentBorder:"#ff6b0055",
  accentFaint:"#ff6b000d", accentFaint2:"#ff6b0040",
  filterBg:"#eef0f8", scrollTrack:"#e5e5ea",
  urgentBg:"#fff0f0", urgentBorder:"#ffc5c5", urgentClr:"#d93025",
  okBg:"#f0fff5", okBorder:"#b3f0cc", okClr:"#1a7a40",
  shadow:"0 2px 12px rgba(0,0,0,0.07)",
  themeIcon:"🌙", themeLabel:"다크 모드",
};

const ThemeCtx = createContext(DARK);
const useT = () => useContext(ThemeCtx);

// ─── 필드 헬퍼 컴포넌트 (업로드 파일) ────────────────────────
function FL({ children }) {
  const T = useT();
  return <div style={{ fontSize:11, color:T.textMuted, letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>{children}</div>;
}
function FI({ ...props }) {
  const T = useT();
  return <input {...props} style={{ width:"100%", background:T.inputBg, border:`1px solid ${T.inputBorder}`, color:T.inputText, fontFamily:"inherit", fontSize:14, padding:"10px 14px", borderRadius:8, outline:"none" }} />;
}
function FS({ children, ...props }) {
  const T = useT();
  return <select {...props} style={{ width:"100%", background:T.inputBg, border:`1px solid ${T.inputBorder}`, color:T.inputText, fontFamily:"inherit", fontSize:14, padding:"10px 14px", borderRadius:8, outline:"none" }}>{children}</select>;
}
function FTA({ ...props }) {
  const T = useT();
  return <textarea {...props} style={{ width:"100%", background:T.inputBg, border:`1px solid ${T.inputBorder}`, color:T.inputText, fontFamily:"inherit", fontSize:14, padding:"10px 14px", borderRadius:8, outline:"none", resize:"none" }} />;
}

// ─── EmptyState 컴포넌트 (업로드 파일) ───────────────────────
function EmptyState({ icon, text, sub }) {
  const T = useT();
  return (
    <div style={{ textAlign:"center", padding:"44px 20px", background:T.cardBg, border:`1px solid ${T.cardBorder}`, borderRadius:12 }}>
      <div style={{ fontSize:38, marginBottom:10 }}>{icon}</div>
      <div style={{ fontSize:14, color:T.textSub }}>{text}</div>
      {sub && <div style={{ fontSize:12, color:T.textMuted, marginTop:5 }}>{sub}</div>}
    </div>
  );
}

// ─── CarFilter 컴포넌트 (업로드 파일) ─────────────────────────
function CarFilter({ cars, selectedCar, setSelectedCar }) {
  return (
    <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
      {cars.map(c => (
        <button key={c.id} onClick={() => setSelectedCar(c.id)}
          style={{ background:selectedCar===c.id?"#ff6b0018":"transparent", color:"#ff6b00", border:`1px solid ${selectedCar===c.id?"#ff6b00":"#ff6b0050"}`, fontFamily:"inherit", fontWeight:600, fontSize:12, borderRadius:8, padding:"7px 14px", cursor:"pointer" }}>
          {c.name}
        </button>
      ))}
    </div>
  );
}

// ─── 사진 썸네일 ──────────────────────────────────────────────
function PhotoThumb({ url }) {
  const [full, setFull] = useState(false);
  return (
    <>
      <img src={url} onClick={() => setFull(true)} alt="첨부사진"
        style={{ width:60, height:60, objectFit:"cover", borderRadius:8, cursor:"pointer", flexShrink:0 }} />
      {full && (
        <div onClick={() => setFull(false)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <img src={url} alt="전체" style={{ maxWidth:"100%", maxHeight:"90vh", borderRadius:12, objectFit:"contain" }} />
        </div>
      )}
    </>
  );
}

// ─── App ──────────────────────────────────────────────────────
export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const T = darkMode ? DARK : LIGHT;

  const [tab, setTab] = useState(0);
  const [cars, setCars] = useState([]);
  const [maintenances, setMaintenances] = useState([]);
  const [fuels, setFuels] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [selectedCar, setSelectedCar] = useState(null);
  const [showCarModal, setShowCarModal] = useState(false);
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingCar, setEditingCar] = useState(null);
  const [suggestReminder, setSuggestReminder] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [authOk, setAuthOk] = useState(true);

  // 검색·필터
  const [maintSearch, setMaintSearch] = useState('');
  const [maintPeriod, setMaintPeriod] = useState('all');
  const [fuelSearch, setFuelSearch] = useState('');
  const [fuelPeriod, setFuelPeriod] = useState('all');

  // ── 스와이프 (업로드 파일의 isHorizLocked 적용) ───────────
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [slideDir, setSlideDir] = useState(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const touchStartTime = useRef(null);
  const isHorizLocked = useRef(false); // 수직 스크롤과 분리
  const anyModalOpen = showCarModal || showMaintModal || showFuelModal || showReminderModal || !!editingCar || !!suggestReminder;
  const anyModalOpenRef = useRef(false);
  useEffect(() => { anyModalOpenRef.current = anyModalOpen; }, [anyModalOpen]);

  const goToTab = useCallback((next, dir) => {
    if (next < 0 || next >= TABS.length) return;
    setSlideDir(dir);
    setTimeout(() => { setTab(next); setSlideDir(null); setDragX(0); }, 220);
  }, []);

  const onTouchStart = useCallback((e) => {
    if (anyModalOpenRef.current) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    isHorizLocked.current = false;
    setIsDragging(true);
  }, []);

  const onTouchMove = useCallback((e) => {
    if (touchStartX.current === null || anyModalOpenRef.current) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // 수직 스크롤이면 스와이프 취소
    if (!isHorizLocked.current && Math.abs(dy) > Math.abs(dx) + 4) {
      touchStartX.current = null; setIsDragging(false); setDragX(0); return;
    }
    if (Math.abs(dx) > 8) isHorizLocked.current = true;
    if (isHorizLocked.current) setDragX(dx * 0.35);
  }, []);

  const onTouchEnd = useCallback((e) => {
    if (touchStartX.current === null) { setIsDragging(false); setDragX(0); return; }
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dt = Date.now() - touchStartTime.current;
    setIsDragging(false);
    touchStartX.current = null; touchStartY.current = null;
    if (isHorizLocked.current && ((dt < 300 && Math.abs(dx) > 40) || Math.abs(dx) > 80)) {
      if (dx < 0) { goToTab(tab + 1, 'left'); return; }
      if (dx > 0) { goToTab(tab - 1, 'right'); return; }
    }
    setDragX(0);
  }, [tab, goToTab]);

  // ── Firebase 실시간 리스너 ────────────────────────────────
  const initialLoadDone = useRef(false);
  useEffect(() => {
    setSyncing(true);
    const { isRealAuth } = getAuthStatus();
    setAuthOk(isRealAuth);

    let loadCount = 0;
    const total = 5;
    function onLoad() {
      loadCount++;
      if (loadCount >= total) {
        setSyncing(false); setLoaded(true);
        setTimeout(() => { initialLoadDone.current = true; }, 300);
      }
    }

    // Firebase write-back 루프 방지: 내용이 같으면 상태 변경 없음 → save effect 미발동
    const noLoop = (setter) => (v) => {
      const next = v ?? [];
      setter(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    };
    const unsubs = [
      fbListen('darkMode',     v => { if (v !== null) setDarkMode(v);  onLoad(); }),
      fbListen('cars',         v => { noLoop(setCars)(v);         onLoad(); }),
      fbListen('maintenances', v => { noLoop(setMaintenances)(v); onLoad(); }),
      fbListen('fuels',        v => { noLoop(setFuels)(v);        onLoad(); }),
      fbListen('reminders',    v => { noLoop(setReminders)(v);    onLoad(); }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, []);

  const saveTimer = useRef({});
  const debounceSave = useCallback((key, value, delay = 800) => {
    if (!initialLoadDone.current) return;
    clearTimeout(saveTimer.current[key]);
    saveTimer.current[key] = setTimeout(async () => {
      const result = await fbSet(key, value);
      if (result && !result.ok) setSyncError(true);
      else setSyncError(false);
    }, delay);
  }, []);

  useEffect(() => { if (loaded) debounceSave('darkMode', darkMode, 300); }, [darkMode, loaded, debounceSave]);
  useEffect(() => { if (loaded) debounceSave('cars', cars); }, [cars, loaded, debounceSave]);
  useEffect(() => { if (loaded) debounceSave('maintenances', maintenances); }, [maintenances, loaded, debounceSave]);
  useEffect(() => { if (loaded) debounceSave('fuels', fuels); }, [fuels, loaded, debounceSave]);
  useEffect(() => { if (loaded) debounceSave('reminders', reminders); }, [reminders, loaded, debounceSave]);

  useEffect(() => { if (cars.length > 0 && !selectedCar) setSelectedCar(cars[0].id); }, [cars]);

  const activeCar = cars.find(c => c.id === selectedCar);
  const carMaints = maintenances.filter(m => m.carId === selectedCar);
  const carFuels  = fuels.filter(f => f.carId === selectedCar);
  const carReminders = reminders.filter(r => r.carId === selectedCar);

  const filteredMaints = filterByPeriod(
    carMaints.filter(m => !maintSearch || [m.type,m.shop,m.note].join(' ').toLowerCase().includes(maintSearch.toLowerCase())),
    'date', maintPeriod
  );
  const filteredFuels = filterByPeriod(
    carFuels.filter(f => !fuelSearch || [f.station].join(' ').toLowerCase().includes(fuelSearch.toLowerCase())),
    'date', fuelPeriod
  );

  const handleMaintSave = (m) => {
    const newMaint = { ...m, id: Date.now().toString() };
    setMaintenances(p => [...p, newMaint]);
    setShowMaintModal(false);
    const suggest = REMINDER_SUGGEST[m.type];
    if (suggest) {
      const maintCar = cars.find(c => c.id === m.carId) || activeCar;
      setSuggestReminder({ maint: newMaint, car: maintCar, suggest });
    }
  };

  // 로딩 화면
  if (!loaded) return (
    <div style={{ minHeight:"100vh", background:"#0a0a0f", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
      <div style={{ width:48, height:48, background:"#ff6b00", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>🚗</div>
      <div style={{ fontFamily:"Rajdhani,sans-serif", fontSize:22, fontWeight:700, color:"#e8e8f0", letterSpacing:2 }}>CARLOG</div>
      <div style={{ width:36, height:36, border:"3px solid #ff6b0040", borderTop:"3px solid #ff6b00", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // 공통 스타일
  const card     = { background:T.cardBg, border:`1px solid ${T.cardBorder}`, borderRadius:12, boxShadow:T.shadow };
  const listItem = { background:T.listBg, border:`1px solid ${T.listBorder}`, borderRadius:10, padding:"14px 16px", marginBottom:8 };
  const secTitle = { fontSize:12, color:T.textMuted, textTransform:"uppercase", letterSpacing:"2px", fontWeight:600 };
  const btnPrimary = { background:"#ff6b00", color:"#fff", fontFamily:"inherit", fontWeight:700, fontSize:13, borderRadius:8, padding:"9px 18px", border:"none", cursor:"pointer", letterSpacing:0.5 };

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overscroll-behavior: none; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: ${T.scrollTrack}; }
    ::-webkit-scrollbar-thumb { background: #ff6b00; border-radius: 2px; }
    input, select, textarea { outline: none; }
    button { cursor: pointer; border: none; }
    .fade-in { animation: fadeIn 0.22s ease forwards; }
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .swipe-content.slide-to-left  { animation: slideL 0.22s cubic-bezier(0.4,0,0.2,1) forwards; }
    .swipe-content.slide-to-right { animation: slideR 0.22s cubic-bezier(0.4,0,0.2,1) forwards; }
    @keyframes slideL { from{opacity:1;transform:translateX(0)}  to{opacity:0;transform:translateX(-60px)} }
    @keyframes slideR { from{opacity:1;transform:translateX(0)}  to{opacity:0;transform:translateX(60px)} }
    .filter-btn { background:${T.filterBg}; border:1px solid ${T.border}; color:${T.textSub}; font-family:inherit; font-size:12px; font-weight:600; padding:6px 12px; border-radius:20px; cursor:pointer; transition:all 0.18s; white-space:nowrap; }
    .filter-btn.active { background:#ff6b00; border-color:#ff6b00; color:#fff; }
    .search-wrap { position:relative; margin-bottom:10px; }
    .search-input { width:100%; background:${T.inputBg}; border:1px solid ${T.inputBorder}; color:${T.inputText}; font-family:inherit; font-size:13px; padding:9px 14px 9px 36px; border-radius:10px; }
    .search-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:14px; pointer-events:none; }
    .sync-dot { width:7px; height:7px; border-radius:50%; background:#ff6b00; animation:pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.1)} }
    .file-btn { background:${T.filterBg}; border:1px dashed ${T.border3}; color:${T.textSub}; border-radius:8px; padding:10px 14px; font-size:13px; font-family:inherit; cursor:pointer; width:100%; text-align:left; transition:all 0.2s; }
    .file-btn:hover { border-color:#ff6b00; color:#ff6b00; }
    .theme-toggle { background:${T.accentBg}; border:1px solid ${T.accentBorder}; border-radius:20px; padding:6px 12px; font-size:15px; cursor:pointer; transition:all 0.25s; display:flex; align-items:center; gap:5px; }
    .theme-toggle:hover { transform:scale(1.04); }
    @keyframes slideUp { from{opacity:0;transform:translateY(60px)} to{opacity:1;transform:translateY(0)} }
  `;

  return (
    <ThemeCtx.Provider value={T}>
    <div style={{ minHeight:"100vh", background:T.bg, fontFamily:"'Rajdhani','Noto Sans KR',sans-serif", color:T.text, transition:"background 0.3s, color 0.3s" }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <style>{css}</style>

      {/* ── Header ── */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border2}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:50, transition:"background 0.3s" }}>
        <div style={{ width:32, height:32, background:"#ff6b00", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🚗</div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"Rajdhani", fontSize:20, fontWeight:700, letterSpacing:1, color:T.text }}>CARLOG</div>
          <div style={{ fontSize:10, color:T.textMuted, letterSpacing:2, textTransform:"uppercase" }}>차량 관리 시스템</div>
        </div>
        {/* 동기화 상태 */}
        {syncing && <div className="sync-dot" />}
        {!syncing && !authOk && <div style={{ fontSize:11, color:T.urgentClr, background:T.urgentBg, border:`1px solid ${T.urgentBorder}`, borderRadius:12, padding:"3px 8px" }}>⚠️ 오프라인</div>}
        {!syncing && authOk && syncError && <div style={{ fontSize:11, color:"#f59e0b", background:"#f59e0b15", border:"1px solid #f59e0b40", borderRadius:12, padding:"3px 8px" }}>⚠️ 저장오류</div>}
        {!syncing && authOk && !syncError && loaded && <div style={{ fontSize:11, color:T.okClr, background:T.okBg, border:`1px solid ${T.okBorder}`, borderRadius:12, padding:"3px 8px" }}>✓ 동기화</div>}
        <button className="theme-toggle" onClick={() => setDarkMode(d => !d)}>
          <span>{T.themeIcon}</span>
          <span style={{ fontSize:11, color:T.textMuted, fontFamily:"'Noto Sans KR',sans-serif", fontWeight:500 }}>{T.themeLabel}</span>
        </button>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ background:T.tabBar, borderBottom:`1px solid ${T.border2}`, padding:"8px 16px", display:"flex", gap:4, overflowX:"auto", position:"sticky", top:"61px", zIndex:49, transition:"background 0.3s" }}>
        {TABS.map((t,i) => (
          <button key={i} onClick={() => goToTab(i, i>tab?'left':'right')}
            style={{ background:tab===i?"#ff6b00":"transparent", color:tab===i?"#fff":T.textMuted, fontFamily:"inherit", fontSize:14, fontWeight:600, padding:"10px 18px", borderRadius:8, transition:"all 0.2s", letterSpacing:0.5, whiteSpace:"nowrap", border:"none", cursor:"pointer" }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ overflow:"hidden" }}>
        <div className={`swipe-content${slideDir==='left'?' slide-to-left':slideDir==='right'?' slide-to-right':''}`}
          style={{ transform:isDragging&&!slideDir?`translateX(${dragX}px)`:undefined, transition:isDragging?'none':undefined }}>
          <div style={{ padding:"20px 16px", maxWidth:600, margin:"0 auto" }}>

            {/* ═══ 내 차량 ═══ */}
            {tab===0 && (
              <div className="fade-in">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                  <div style={secTitle}>등록된 차량 ({cars.length})</div>
                  <button style={btnPrimary} onClick={() => setShowCarModal(true)}>+ 차량 추가</button>
                </div>

                {cars.length===0 ? <EmptyState icon="🚘" text="등록된 차량이 없습니다" sub="차량을 추가해 관리를 시작하세요" /> : (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
                    {cars.map(car => (
                      <div key={car.id} onClick={() => setSelectedCar(car.id)}
                        style={{ ...card, padding:18, cursor:"pointer", border:`2px solid ${selectedCar===car.id?"#ff6b00":T.cardBorder}`, boxShadow:selectedCar===car.id?"0 0 25px rgba(255,107,0,0.18)":T.shadow, position:"relative", overflow:"hidden", transition:"all 0.2s" }}>
                        {selectedCar===car.id && <div style={{ position:"absolute", top:10, right:10, width:8, height:8, background:"#ff6b00", borderRadius:"50%" }} />}
                        <div style={{ fontSize:36, marginBottom:8 }}>{car.emoji||"🚗"}</div>
                        <div style={{ fontWeight:700, fontSize:15, color:T.text, marginBottom:2 }}>{car.name}</div>
                        <div style={{ fontSize:12, color:T.textSub }}>{car.plate}</div>
                        <div style={{ fontSize:11, color:T.textMuted, marginTop:6 }}>{car.year}년형</div>
                        <div style={{ marginTop:10, padding:"6px 10px", background:T.bg, borderRadius:6, textAlign:"center" }}>
                          <span style={{ fontFamily:"Rajdhani", fontSize:16, fontWeight:700, color:"#ff6b00" }}>{formatNum(car.mileage)}</span>
                          <span style={{ fontSize:10, color:T.textMuted, marginLeft:4 }}>km</span>
                        </div>
                        <button onClick={e=>{ e.stopPropagation(); setEditingCar(car); }}
                          style={{ position:"absolute", bottom:10, left:10, background:"transparent", border:`1px solid ${T.border3}`, borderRadius:6, color:T.textMuted, fontSize:13, padding:"2px 7px", cursor:"pointer" }}>✏️</button>
                        <button onClick={e=>{ e.stopPropagation(); if(confirm("차량을 삭제하시겠습니까?")){ setCars(p=>p.filter(c=>c.id!==car.id)); if(selectedCar===car.id) setSelectedCar(null); } }}
                          style={{ position:"absolute", bottom:10, right:10, background:"transparent", color:T.deleteBtnColor, fontSize:16, border:"none", cursor:"pointer", padding:"2px 6px", borderRadius:4 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* D-day 배지 */}
                {activeCar && carReminders.length>0 && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ ...secTitle, marginBottom:12 }}>다가오는 정비 일정</div>
                    {[...carReminders].sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).slice(0,3).map(r => {
                      const d = calcDday(r.dueDate);
                      const isPast = d !== null && d < 0, isUrgent = d !== null && d >= 0 && d <= 7;
                      const clr = isPast||isUrgent ? T.urgentClr : "#ff6b00";
                      const bg  = isPast||isUrgent ? T.urgentBg : T.accentFaint;
                      const bdr = isPast||isUrgent ? T.urgentBorder : T.accentBorder;
                      return (
                        <div key={r.id} style={{ ...card, background:bg, border:`1px solid ${bdr}`, padding:"12px 14px", marginBottom:8, display:"flex", alignItems:"center", gap:12 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{r.type}</div>
                            {r.dueDate && <div style={{ fontSize:12, color:T.textSub, marginTop:2 }}>{formatDate(r.dueDate)}</div>}
                            {r.dueMileage && <div style={{ fontSize:11, color:T.textMuted }}>{formatNum(r.dueMileage)} km</div>}
                          </div>
                          <div style={{ textAlign:"center" }}>
                            <div style={{ fontFamily:"Rajdhani", fontSize:22, fontWeight:700, color:clr, lineHeight:1 }}>
                              {isPast?`D+${Math.abs(d)}`:d===0?"D-Day":`D-${d}`}
                            </div>
                            <div style={{ fontSize:10, color:clr, marginTop:2 }}>{isPast?"기한초과":isUrgent?"임박":"예정"}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeCar && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                      <div style={secTitle}>차량 정보 — {activeCar.name}</div>
                      <button onClick={() => setEditingCar(activeCar)}
                        style={{ background:"transparent", color:"#ff6b00", border:"1px solid #ff6b0050", fontFamily:"inherit", fontWeight:600, fontSize:12, borderRadius:8, padding:"6px 14px", cursor:"pointer" }}>✏️ 수정</button>
                    </div>
                    <div style={{ ...card, padding:20, marginBottom:14 }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, textAlign:"center" }}>
                        {[["총 주행km",formatNum(activeCar.mileage)],["정비 횟수",carMaints.length],["주유 횟수",carFuels.length]].map(([label,val])=>(
                          <div key={label}>
                            <div style={{ fontFamily:"Rajdhani", fontSize:26, fontWeight:700, color:"#ff6b00", lineHeight:1 }}>{val}</div>
                            <div style={{ fontSize:10, color:T.textMuted, textTransform:"uppercase", letterSpacing:1, marginTop:4 }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ ...card, padding:16 }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                        {[["차량명",activeCar.name],["번호판",activeCar.plate],["연식",`${activeCar.year}년`],["연료",activeCar.fuel||"-"],["색상",activeCar.color||"-"],["보험만료",activeCar.insurance?formatDate(activeCar.insurance):"-"]].map(([label,val])=>(
                          <div key={label}>
                            <div style={{ fontSize:11, color:T.textMuted, letterSpacing:1, textTransform:"uppercase", marginBottom:4 }}>{label}</div>
                            <div style={{ fontSize:14, color:T.text }}>{val}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ borderTop:`1px solid ${T.border2}`, paddingTop:14 }}>
                        <div style={{ fontSize:11, color:T.textMuted, letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>현재 주행거리 업데이트</div>
                        <div style={{ display:"flex", gap:8 }}>
                          <input key={activeCar.id} id="mileage-update" type="number" defaultValue={activeCar.mileage}
                            style={{ flex:1, background:T.inputBg, border:`1px solid ${T.inputBorder}`, color:T.inputText, fontFamily:"inherit", fontSize:14, padding:"10px 14px", borderRadius:8, outline:"none" }} />
                          <button style={btnPrimary} onClick={() => {
                            const val = document.getElementById("mileage-update").value;
                            setCars(p => p.map(c => c.id===activeCar.id ? {...c, mileage:parseInt(val)||c.mileage} : c));
                          }}>저장</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ 정비 기록 ═══ */}
            {tab===1 && (
              <div className="fade-in">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={secTitle}>정비 기록</div>
                  <button style={btnPrimary} onClick={() => cars.length>0?setShowMaintModal(true):alert("먼저 차량을 등록해주세요.")}>+ 추가</button>
                </div>
                {cars.length>1 && <CarFilter cars={cars} selectedCar={selectedCar} setSelectedCar={setSelectedCar} />}
                <div className="search-wrap">
                  <span className="search-icon">🔍</span>
                  <input className="search-input" placeholder="정비 유형, 정비소 검색..." value={maintSearch} onChange={e=>setMaintSearch(e.target.value)} />
                </div>
                <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:2 }}>
                  {[['all','전체'],['month','이번달'],['3months','3개월'],['year','올해']].map(([v,l])=>(
                    <button key={v} className={`filter-btn${maintPeriod===v?' active':''}`} onClick={()=>setMaintPeriod(v)}>{l}</button>
                  ))}
                </div>
                {filteredMaints.length===0 ? <EmptyState icon="🔧" text="정비 기록이 없습니다" /> :
                  [...filteredMaints].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(m => (
                    <div key={m.id} style={listItem}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                            <span style={{ fontSize:15, fontWeight:700, color:T.text }}>{m.type}</span>
                            <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, color:"#ff6b00", background:"#ff6b0015", border:"1px solid #ff6b0030" }}>🔧</span>
                          </div>
                          <div style={{ fontSize:12, color:T.textMuted, marginBottom:6 }}>{formatDate(m.date)} · {formatNum(m.mileage)} km</div>
                          <div style={{ display:"flex", gap:14 }}>
                            <div><span style={{ fontSize:11, color:T.textMuted }}>비용 </span><span style={{ fontSize:14, fontWeight:600, color:"#ff6b00" }}>{formatNum(m.cost)}원</span></div>
                            {m.shop&&<div><span style={{ fontSize:11, color:T.textMuted }}>정비소 </span><span style={{ fontSize:13, color:T.textSub }}>{m.shop}</span></div>}
                          </div>
                          {m.note&&<div style={{ fontSize:12, color:T.textMuted, marginTop:5, fontStyle:"italic" }}>{m.note}</div>}
                        </div>
                        {m.photoUrl && <PhotoThumb url={m.photoUrl} />}
                        <button onClick={()=>{ if(m.photoUrl) fbDeletePhoto(m.photoUrl); setMaintenances(p=>p.filter(x=>x.id!==m.id)); }}
                          style={{ background:"transparent", color:T.deleteBtnColor, fontSize:14, border:"none", cursor:"pointer", padding:"2px 5px", borderRadius:4 }}>✕</button>
                      </div>
                    </div>
                  ))
                }
                {carMaints.length>0 && (
                  <div style={{ ...card, padding:16, marginTop:14, textAlign:"center" }}>
                    <div style={{ fontSize:11, color:T.textMuted, marginBottom:4 }}>총 정비 비용</div>
                    <div style={{ fontFamily:"Rajdhani", fontSize:26, fontWeight:700, color:"#ff6b00" }}>{formatNum(carMaints.reduce((s,m)=>s+(parseInt(m.cost)||0),0))}원</div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ 주유 기록 ═══ */}
            {tab===2 && (
              <div className="fade-in">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={secTitle}>주유 기록</div>
                  <button style={btnPrimary} onClick={() => cars.length>0?setShowFuelModal(true):alert("먼저 차량을 등록해주세요.")}>+ 추가</button>
                </div>
                {cars.length>1 && <CarFilter cars={cars} selectedCar={selectedCar} setSelectedCar={setSelectedCar} />}
                <div className="search-wrap">
                  <span className="search-icon">🔍</span>
                  <input className="search-input" placeholder="주유소 이름 검색..." value={fuelSearch} onChange={e=>setFuelSearch(e.target.value)} />
                </div>
                <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:2 }}>
                  {[['all','전체'],['month','이번달'],['3months','3개월'],['year','올해']].map(([v,l])=>(
                    <button key={v} className={`filter-btn${fuelPeriod===v?' active':''}`} onClick={()=>setFuelPeriod(v)}>{l}</button>
                  ))}
                </div>
                {filteredFuels.length>=2 && (() => {
                  const sorted=[...filteredFuels].sort((a,b)=>new Date(a.date)-new Date(b.date));
                  const totalL=filteredFuels.reduce((s,f)=>s+parseFloat(f.amount||0),0);
                  const totalCost=filteredFuels.reduce((s,f)=>s+(parseInt(f.cost)||0),0);
                  const km=(parseInt(sorted.at(-1)?.mileage)||0)-(parseInt(sorted[0]?.mileage)||0);
                  const usedL=sorted.slice(1).reduce((s,f)=>s+parseFloat(f.amount||0),0);
                  const eff=usedL>0?(km/usedL).toFixed(1):"-";
                  return (
                    <div style={{ ...card, padding:16, marginBottom:14 }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, textAlign:"center" }}>
                        {[["총 주유(L)",totalL.toFixed(1)],["총 비용(원)",formatNum(totalCost)],["연비(km/L)",eff]].map(([label,val])=>(
                          <div key={label}>
                            <div style={{ fontFamily:"Rajdhani", fontSize:22, fontWeight:700, color:"#ff6b00", lineHeight:1 }}>{val}</div>
                            <div style={{ fontSize:10, color:T.textMuted, textTransform:"uppercase", letterSpacing:1, marginTop:4 }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {filteredFuels.length===0 ? <EmptyState icon="⛽" text="주유 기록이 없습니다" /> :
                  [...filteredFuels].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(f => (
                    <div key={f.id} style={listItem}>
                      <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, color:T.textMuted, marginBottom:4 }}>{formatDate(f.date)} · {formatNum(f.mileage)} km</div>
                          <div style={{ display:"flex", gap:14, alignItems:"baseline" }}>
                            <div><span style={{ fontSize:11, color:T.textMuted }}>주유량 </span><span style={{ fontFamily:"Rajdhani", fontSize:18, fontWeight:700, color:"#ff6b00" }}>{f.amount}L</span></div>
                            <div><span style={{ fontSize:11, color:T.textMuted }}>금액 </span><span style={{ fontSize:14, fontWeight:600, color:T.text }}>{formatNum(f.cost)}원</span></div>
                            {f.amount&&f.cost&&<div><span style={{ fontSize:11, color:T.textMuted }}>단가 </span><span style={{ fontSize:12, color:T.textSub }}>{formatNum(Math.round(parseInt(f.cost)/parseFloat(f.amount)))}원/L</span></div>}
                          </div>
                          {f.station&&<div style={{ fontSize:12, color:T.textMuted, marginTop:4 }}>⛽ {f.station}</div>}
                        </div>
                        {f.photoUrl && <PhotoThumb url={f.photoUrl} />}
                        <button onClick={()=>{ if(f.photoUrl) fbDeletePhoto(f.photoUrl); setFuels(p=>p.filter(x=>x.id!==f.id)); }}
                          style={{ background:"transparent", color:T.deleteBtnColor, fontSize:14, border:"none", cursor:"pointer", padding:"2px 5px", borderRadius:4 }}>✕</button>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {/* ═══ 알림 ═══ */}
            {tab===3 && (
              <div className="fade-in">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div style={secTitle}>정비 알림</div>
                  <button style={btnPrimary} onClick={() => cars.length>0?setShowReminderModal(true):alert("먼저 차량을 등록해주세요.")}>+ 추가</button>
                </div>
                {carReminders.length===0 ? <EmptyState icon="🔔" text="등록된 알림이 없습니다" sub="정기 점검 일정을 추가하세요" /> :
                  [...carReminders].sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).map(r => {
                    const d=calcDday(r.dueDate);
                    const isPast=d!==null&&d<0, isUrgent=d!==null&&d>=0&&d<=7;
                    const bc=isPast?"#ff4444":isUrgent?"#ffaa00":"#44dd88";
                    return (
                      <div key={r.id} style={{ ...listItem, border:`1px solid ${isPast?"#ff444440":isUrgent?"#ffaa0030":T.listBorder}` }}>
                        <div style={{ display:"flex", justifyContent:"space-between" }}>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                              <span style={{ fontSize:15, fontWeight:700, color:T.text }}>{r.type}</span>
                              <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, color:bc, background:`${bc}12`, border:`1px solid ${bc}40` }}>
                                {isPast?"기한 초과":isUrgent?"임박":"정상"}
                              </span>
                              <span style={{ fontFamily:"Rajdhani", fontSize:16, fontWeight:700, color:bc, marginLeft:"auto" }}>
                                {d==null?"":isPast?`D+${Math.abs(d)}`:d===0?"D-Day":`D-${d}`}
                              </span>
                            </div>
                            <div style={{ fontSize:12, color:T.textMuted }}>예정일: {formatDate(r.dueDate)}</div>
                            {r.dueMileage&&<div style={{ fontSize:12, color:T.textMuted }}>예정 거리: {formatNum(r.dueMileage)} km</div>}
                            {r.note&&<div style={{ fontSize:12, color:T.textMuted, marginTop:4, fontStyle:"italic" }}>{r.note}</div>}
                          </div>
                          <button onClick={()=>setReminders(p=>p.filter(x=>x.id!==r.id))}
                            style={{ background:"transparent", color:T.deleteBtnColor, fontSize:14, border:"none", cursor:"pointer", padding:"2px 5px", borderRadius:4 }}>✕</button>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            )}

          </div>

          {/* ── Dot indicators (업로드 파일: 하단 배치) ── */}
          <div style={{ display:"flex", justifyContent:"center", gap:6, padding:"8px 0 24px" }}>
            {TABS.map((_,i) => (
              <div key={i} onClick={() => goToTab(i, i>tab?'left':'right')}
                style={{ width:tab===i?22:6, height:6, borderRadius:3, cursor:"pointer", background:tab===i?"#ff6b00":T.dotInactive, transition:"all 0.25s cubic-bezier(0.4,0,0.2,1)" }} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showCarModal && <CarModal onClose={() => setShowCarModal(false)} onSave={car => { setCars(p=>[...p,{...car,id:Date.now().toString()}]); setShowCarModal(false); }} />}
      {editingCar && <CarModal initialData={editingCar} onClose={() => setEditingCar(null)} onSave={updated => { setCars(p=>p.map(c=>c.id===updated.id?updated:c)); setEditingCar(null); }} />}
      {showMaintModal && <ModalShell title="정비 기록 추가" onClose={() => setShowMaintModal(false)}><MaintForm cars={cars} selectedCar={selectedCar} onSave={handleMaintSave} /></ModalShell>}
      {showFuelModal && <ModalShell title="주유 기록 추가" onClose={() => setShowFuelModal(false)}><FuelForm cars={cars} selectedCar={selectedCar} onSave={f => { setFuels(p=>[...p,{...f,id:Date.now().toString()}]); setShowFuelModal(false); }} /></ModalShell>}
      {showReminderModal && <ModalShell title="정비 알림 추가" onClose={() => setShowReminderModal(false)}><ReminderForm cars={cars} selectedCar={selectedCar} onSave={r => { setReminders(p=>[...p,{...r,id:Date.now().toString()}]); setShowReminderModal(false); }} /></ModalShell>}
      {suggestReminder && <SuggestReminderModal data={suggestReminder} onAdd={r=>{ setReminders(p=>[...p,{...r,id:Date.now().toString()}]); setSuggestReminder(null); }} onSkip={()=>setSuggestReminder(null)} />}
    </div>
    </ThemeCtx.Provider>
  );
}

// ─── ModalShell ───────────────────────────────────────────────
function ModalShell({ title, onClose, children }) {
  const T = useT();
  return (
    <div style={{ position:"fixed", inset:0, background:T.modalBg, backdropFilter:"blur(4px)", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center", padding:0 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:T.modalSurface, border:`1px solid ${T.modalBorder}`, borderRadius:"20px 20px 0 0", padding:28, width:"100%", maxWidth:600, maxHeight:"92vh", overflowY:"auto", animation:"slideUp 0.25s ease" }}>
        <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontFamily:"Rajdhani", fontSize:18, fontWeight:700, color:T.headingColor, letterSpacing:1 }}>{title}</div>
          <button onClick={onClose} style={{ background:"none", color:T.textMuted, fontSize:24, border:"none", cursor:"pointer", lineHeight:1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── CarModal ────────────────────────────────────────────────
function CarModal({ onClose, onSave, initialData }) {
  const T = useT();
  const isEdit = !!initialData;
  const [form, setForm] = useState(initialData ? {...initialData} : { name:"", plate:"", year:new Date().getFullYear(), mileage:0, fuel:"휘발유", color:"", insurance:"", emoji:"🚗" });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const emojis = ["🚗","🚙","🚕","🏎","🚐","🚌","🛻","🚓","🚑","🚒"];
  const stopProp = e => e.stopPropagation();
  return (
    <div style={{ position:"fixed", inset:0, background:T.modalBg, backdropFilter:"blur(4px)", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:T.modalSurface, border:`1px solid ${T.modalBorder}`, borderRadius:"20px 20px 0 0", padding:28, width:"100%", maxWidth:600, maxHeight:"92vh", overflowY:"auto", animation:"slideUp 0.25s ease" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontFamily:"Rajdhani", fontSize:18, fontWeight:700, color:T.headingColor, letterSpacing:1 }}>{isEdit?"✏️ 차량 정보 수정":"차량 추가"}</div>
          <button onClick={onClose} style={{ background:"none", color:T.textMuted, fontSize:24, border:"none", cursor:"pointer" }}>×</button>
        </div>
        <div style={{ marginBottom:16 }}>
          <FL>아이콘 선택</FL>
          {/* 이모지 가로 스크롤 (업로드 파일의 touchAction 적용) */}
          <div onTouchStart={stopProp} onTouchMove={stopProp} onTouchEnd={stopProp}
            style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4, touchAction:"pan-x", WebkitOverflowScrolling:"touch" }}>
            {emojis.map(e => (
              <button key={e} onClick={() => set("emoji",e)}
                style={{ fontSize:24, flexShrink:0, background:form.emoji===e?"#ff6b0020":T.emojiBtnBg, border:`1px solid ${form.emoji===e?"#ff6b00":T.emojiBtnBorder}`, borderRadius:8, padding:"6px 10px", cursor:"pointer", transition:"all 0.15s" }}>
                {e}
              </button>
            ))}
          </div>
        </div>
        {[["차량명","name","text","예) 내 아반떼"],["번호판","plate","text","예) 12가 3456"],["연식","year","number",""],["현재 주행거리 (km)","mileage","number",""],["색상","color","text","예) 흰색"]].map(([label,key,type,ph])=>(
          <div key={key} style={{ marginBottom:12 }}><FL>{label}</FL><FI type={type} placeholder={ph} value={form[key]??""} onChange={e=>set(key,e.target.value)} /></div>
        ))}
        <div style={{ marginBottom:12 }}><FL>보험 만료일</FL><FI type="date" value={form.insurance??""} onChange={e=>set("insurance",e.target.value)} /></div>
        <div style={{ marginBottom:20 }}><FL>연료 유형</FL>
          <FS value={form.fuel||"휘발유"} onChange={e=>set("fuel",e.target.value)}>
            {["휘발유","경유","LPG","전기","하이브리드"].map(f=><option key={f}>{f}</option>)}
          </FS>
        </div>
        <button style={{ background:"#ff6b00", color:"#fff", fontFamily:"inherit", fontWeight:700, fontSize:13, borderRadius:8, padding:"13px", border:"none", cursor:"pointer", width:"100%" }}
          onClick={() => { if(!form.name||!form.plate) return alert("차량명과 번호판을 입력해주세요."); onSave(isEdit?{...form}:form); }}>
          {isEdit?"✅ 수정 저장":"저장"}
        </button>
      </div>
    </div>
  );
}

// ─── SuggestReminderModal ────────────────────────────────────
function SuggestReminderModal({ data, onAdd, onSkip }) {
  const T = useT();
  const { maint, car, suggest } = data;
  const nextDate = new Date();
  if (suggest.months) nextDate.setMonth(nextDate.getMonth()+suggest.months);
  const dueDateStr = nextDate.toISOString().split("T")[0];
  const nextMileage = car && suggest.km ? (parseInt(car.mileage)||0)+suggest.km : "";
  return (
    <div style={{ position:"fixed", inset:0, background:T.modalBg, backdropFilter:"blur(4px)", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      onClick={e => e.target===e.currentTarget && onSkip()}>
      <div style={{ background:T.modalSurface, border:`1px solid ${T.modalBorder}`, borderRadius:"20px 20px 0 0", padding:28, width:"100%", maxWidth:600, animation:"slideUp 0.25s ease" }}>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🔔</div>
          <div style={{ fontFamily:"Rajdhani", fontSize:18, fontWeight:700, color:T.headingColor }}>다음 정비 알림 추가</div>
          <div style={{ fontSize:13, color:T.textSub, marginTop:6 }}>
            <strong style={{ color:"#ff6b00" }}>{maint.type}</strong> 기록을 저장했습니다.<br/>다음 교체 알림을 자동으로 추가할까요?
          </div>
        </div>
        <div style={{ background:T.listBg, border:`1px solid ${T.listBorder}`, borderRadius:10, padding:16, marginBottom:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:suggest.months>0?8:0 }}>
            <span style={{ fontSize:12, color:T.textMuted }}>추천 주기</span>
            <span style={{ fontSize:13, fontWeight:600, color:"#ff6b00" }}>{suggest.label}</span>
          </div>
          {suggest.months>0 && <div style={{ display:"flex", justifyContent:"space-between", marginBottom:suggest.km>0?8:0 }}>
            <span style={{ fontSize:12, color:T.textMuted }}>예정일</span>
            <span style={{ fontSize:13, color:T.text }}>{formatDate(dueDateStr)}</span>
          </div>}
          {suggest.km>0 && <div style={{ display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontSize:12, color:T.textMuted }}>예정 주행거리</span>
            <span style={{ fontSize:13, color:T.text }}>{formatNum(nextMileage)} km</span>
          </div>}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onSkip} style={{ flex:1, background:"transparent", color:"#ff6b00", border:"1px solid #ff6b0050", fontFamily:"inherit", fontWeight:600, fontSize:13, borderRadius:8, padding:"12px", cursor:"pointer" }}>건너뛰기</button>
          <button onClick={() => onAdd({ carId:maint.carId, type:maint.type, dueDate:suggest.months?dueDateStr:"", dueMileage:suggest.km?String(nextMileage):"", note:`${maint.type} 후 자동 추천` })}
            style={{ flex:2, background:"#ff6b00", color:"#fff", fontFamily:"inherit", fontWeight:700, fontSize:13, borderRadius:8, padding:"12px", border:"none", cursor:"pointer" }}>✅ 알림 추가</button>
        </div>
      </div>
    </div>
  );
}

// ─── PhotoUploadField ─────────────────────────────────────────
function PhotoUploadField({ onUploaded, uploading, setUploading, recordId }) {
  const T = useT();
  const [preview, setPreview] = useState(null);
  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    const url = await fbUploadPhoto(file, recordId);
    setUploading(false);
    if (url) onUploaded(url);
    else alert("사진 업로드 실패. Firebase Storage 권한을 확인하세요.");
  }
  return (
    <div style={{ marginBottom:16 }}>
      <FL>사진 첨부 (선택)</FL>
      {preview ? (
        <div style={{ position:"relative", display:"inline-block" }}>
          <img src={preview} style={{ width:80, height:80, objectFit:"cover", borderRadius:8, border:`1px solid ${T.border}` }} alt="미리보기" />
          {uploading && <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⏳</div>}
          <button onClick={() => { setPreview(null); onUploaded(null); }}
            style={{ position:"absolute", top:-6, right:-6, width:20, height:20, borderRadius:"50%", background:T.urgentClr, color:"#fff", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", border:"none", cursor:"pointer" }}>✕</button>
        </div>
      ) : (
        <label className="file-btn">
          📷 사진 선택
          <input type="file" accept="image/*" style={{ display:"none" }} onChange={handleFile} />
        </label>
      )}
    </div>
  );
}

// ─── Form 컴포넌트들 ──────────────────────────────────────────
function MaintForm({ cars, selectedCar, onSave }) {
  const recordId = useRef("m_"+Date.now().toString(36));
  const [form, setForm] = useState({ carId:selectedCar||cars[0]?.id, type:maintenanceTypes[0], date:today(), mileage:"", cost:"", shop:"", note:"", photoUrl:null });
  const [uploading, setUploading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  return (
    <div>
      {cars.length>1 && <div style={{marginBottom:12}}><FL>차량 선택</FL><FS value={form.carId} onChange={e=>set("carId",e.target.value)}>{cars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</FS></div>}
      <div style={{marginBottom:12}}><FL>정비 유형</FL><FS value={form.type} onChange={e=>set("type",e.target.value)}>{maintenanceTypes.map(t=><option key={t}>{t}</option>)}</FS></div>
      {[["날짜","date","date"],["주행거리 (km)","mileage","number"],["비용 (원)","cost","number"],["정비소","shop","text"]].map(([label,key,type])=>(
        <div key={key} style={{marginBottom:12}}><FL>{label}</FL><FI type={type} value={form[key]} onChange={e=>set(key,e.target.value)} /></div>
      ))}
      <div style={{marginBottom:12}}><FL>메모</FL><FTA rows={2} value={form.note} onChange={e=>set("note",e.target.value)} /></div>
      <PhotoUploadField recordId={recordId.current} onUploaded={url=>set("photoUrl",url)} uploading={uploading} setUploading={setUploading} />
      <button style={{ background:"#ff6b00", color:"#fff", fontFamily:"inherit", fontWeight:700, fontSize:13, borderRadius:8, padding:"13px", border:"none", cursor:"pointer", width:"100%", opacity:uploading?0.6:1 }}
        disabled={uploading} onClick={() => !uploading && onSave(form)}>{uploading?"업로드 중...":"저장"}</button>
    </div>
  );
}

function FuelForm({ cars, selectedCar, onSave }) {
  const recordId = useRef("f_"+Date.now().toString(36));
  const [form, setForm] = useState({ carId:selectedCar||cars[0]?.id, date:today(), mileage:"", amount:"", cost:"", station:"", photoUrl:null });
  const [uploading, setUploading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  return (
    <div>
      {cars.length>1 && <div style={{marginBottom:12}}><FL>차량 선택</FL><FS value={form.carId} onChange={e=>set("carId",e.target.value)}>{cars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</FS></div>}
      {[["날짜","date","date"],["주행거리 (km)","mileage","number"],["주유량 (L)","amount","number"],["금액 (원)","cost","number"],["주유소","station","text"]].map(([label,key,type])=>(
        <div key={key} style={{marginBottom:12}}><FL>{label}</FL><FI type={type} value={form[key]} onChange={e=>set(key,e.target.value)} /></div>
      ))}
      <PhotoUploadField recordId={recordId.current} onUploaded={url=>set("photoUrl",url)} uploading={uploading} setUploading={setUploading} />
      <button style={{ background:"#ff6b00", color:"#fff", fontFamily:"inherit", fontWeight:700, fontSize:13, borderRadius:8, padding:"13px", border:"none", cursor:"pointer", width:"100%", opacity:uploading?0.6:1 }}
        disabled={uploading} onClick={() => !uploading && onSave(form)}>{uploading?"업로드 중...":"저장"}</button>
    </div>
  );
}

function ReminderForm({ cars, selectedCar, onSave }) {
  const [form, setForm] = useState({ carId:selectedCar||cars[0]?.id, type:maintenanceTypes[0], dueDate:today(), dueMileage:"", note:"" });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  return (
    <div>
      {cars.length>1 && <div style={{marginBottom:12}}><FL>차량 선택</FL><FS value={form.carId} onChange={e=>set("carId",e.target.value)}>{cars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</FS></div>}
      <div style={{marginBottom:12}}><FL>정비 유형</FL><FS value={form.type} onChange={e=>set("type",e.target.value)}>{maintenanceTypes.map(t=><option key={t}>{t}</option>)}</FS></div>
      <div style={{marginBottom:12}}><FL>예정 날짜</FL><FI type="date" value={form.dueDate} onChange={e=>set("dueDate",e.target.value)} /></div>
      <div style={{marginBottom:12}}><FL>예정 주행거리 (km)</FL><FI type="number" value={form.dueMileage} onChange={e=>set("dueMileage",e.target.value)} /></div>
      <div style={{marginBottom:20}}><FL>메모</FL><FTA rows={2} value={form.note} onChange={e=>set("note",e.target.value)} /></div>
      <button style={{ background:"#ff6b00", color:"#fff", fontFamily:"inherit", fontWeight:700, fontSize:13, borderRadius:8, padding:"13px", border:"none", cursor:"pointer", width:"100%" }}
        onClick={() => onSave(form)}>저장</button>
    </div>
  );
}
