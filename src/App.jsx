import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { fbGet, fbSet, fbUploadPhoto, fbDeletePhoto } from "./firebase.js";

const TABS = ["내 차량", "정비 기록", "주유 기록", "알림"];

const maintenanceTypes = [
  "엔진오일 교체", "타이어 교환", "브레이크 패드", "에어필터", "배터리 교체",
  "냉각수 교체", "와이퍼 교체", "점화플러그", "변속기 오일", "기타"
];

// 정비 유형별 자동 추천 주기
const REMINDER_SUGGEST = {
  "엔진오일 교체":  { km: 5000,  months: 6,  label: "5,000km 또는 6개월 후" },
  "타이어 교환":    { km: 40000, months: 24, label: "40,000km 또는 2년 후" },
  "브레이크 패드":  { km: 30000, months: 0,  label: "30,000km 후" },
  "에어필터":       { km: 15000, months: 12, label: "15,000km 또는 1년 후" },
  "배터리 교체":    { km: 0,     months: 36, label: "3년 후" },
  "냉각수 교체":    { km: 40000, months: 24, label: "40,000km 또는 2년 후" },
  "와이퍼 교체":    { km: 0,     months: 12, label: "1년 후" },
  "점화플러그":     { km: 20000, months: 0,  label: "20,000km 후" },
  "변속기 오일":    { km: 40000, months: 0,  label: "40,000km 후" },
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
  const diff = Math.ceil((new Date(dateStr) - new Date().setHours(0,0,0,0)) / 86400000);
  return diff;
}

// 기간 필터 함수
function filterByPeriod(items, dateKey, period) {
  if (period === 'all') return items;
  const now = new Date();
  return items.filter(item => {
    const d = new Date(item[dateKey]);
    if (period === 'month') return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
    if (period === '3months') return (now - d) <= 90*24*60*60*1000;
    if (period === 'year') return d.getFullYear()===now.getFullYear();
    return true;
  });
}

// ─── Theme tokens ─────────────────────────────────────────────
const DARK = {
  bg:"#0a0a0f", surface:"#0d0d14", card:"#13131a", border:"#1e1e2e", border2:"#1a1a28", border3:"#2a2a3e",
  text:"#e8e8f0", textMuted:"#666", textDim:"#555", textFaint:"#444", textSub:"#999", textCard:"#ccc",
  accent:"#ff6b00", accentHover:"#ff8c33", accentBg:"#ff6b0020", accentBorder:"#ff6b0050",
  accentFaint:"#ff6b0015", accentFaint2:"#ff6b0030",
  listBg:"#0d0d14", listBorder:"#1a1a28", deleteBtnClr:"#444",
  emptyClr:"#444", emptySubClr:"#333", scrollTrack:"#111",
  modalBg:"rgba(0,0,0,0.75)", inputBg:"#0d0d14", tabDot:"#2a2a3e", shadow:"none",
  urgentBg:"#ff44440d", urgentBorder:"#ff444430", urgentClr:"#ff4444",
  okBg:"#44ff880d", okBorder:"#44ff8830", okClr:"#44ff88",
  themeIcon:"☀️", themeLabel:"라이트 모드", filterBg:"#1a1a28",
};
const LIGHT = {
  bg:"#f2f2f7", surface:"#ffffff", card:"#ffffff", border:"#e5e5ea", border2:"#ebebf0", border3:"#d8d8e0",
  text:"#1c1c1e", textMuted:"#8e8e93", textDim:"#6e6e73", textFaint:"#aeaeb2", textSub:"#636366", textCard:"#3c3c43",
  accent:"#ff6b00", accentHover:"#e05e00", accentBg:"#ff6b0015", accentBorder:"#ff6b0055",
  accentFaint:"#ff6b000d", accentFaint2:"#ff6b0040",
  listBg:"#f7f7fc", listBorder:"#e5e5ea", deleteBtnClr:"#c7c7cc",
  emptyClr:"#aeaeb2", emptySubClr:"#d1d1d6", scrollTrack:"#e5e5ea",
  modalBg:"rgba(0,0,0,0.4)", inputBg:"#f7f7fc", tabDot:"#d8d8e0", shadow:"0 2px 12px rgba(0,0,0,0.07)",
  urgentBg:"#fff0f0", urgentBorder:"#ffc5c5", urgentClr:"#d93025",
  okBg:"#f0fff5", okBorder:"#b3f0cc", okClr:"#1a7a40",
  themeIcon:"🌙", themeLabel:"다크 모드", filterBg:"#f0f0f5",
};

const ThemeCtx = createContext(DARK);
const useT = () => useContext(ThemeCtx);

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
  const [suggestReminder, setSuggestReminder] = useState(null); // { maint, car }
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // 검색·필터 상태
  const [maintSearch, setMaintSearch] = useState('');
  const [maintPeriod, setMaintPeriod] = useState('all');
  const [fuelSearch, setFuelSearch] = useState('');
  const [fuelPeriod, setFuelPeriod] = useState('all');

  // Swipe
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [slideDir, setSlideDir] = useState(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const touchStartTime = useRef(null);
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
    setIsDragging(true);
  }, []);

  const onTouchMove = useCallback((e) => {
    if (touchStartX.current === null || anyModalOpenRef.current) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy)) setDragX(dx * 0.4);
  }, []);

  const onTouchEnd = useCallback((e) => {
    if (touchStartX.current === null || anyModalOpenRef.current) { setIsDragging(false); setDragX(0); return; }
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dt = Date.now() - touchStartTime.current;
    const isH = Math.abs(dx) > Math.abs(dy);
    setIsDragging(false); setDragX(0);
    touchStartX.current = null; touchStartY.current = null;
    if (isH && (dt < 300 && Math.abs(dx) > 40 || Math.abs(dx) > 80)) {
      if (dx < 0) goToTab(tab + 1, 'left');
      else goToTab(tab - 1, 'right');
    }
  }, [tab, goToTab]);

  // Firebase 로드
  useEffect(() => {
    async function load() {
      setSyncing(true);
      try {
        const dm = await fbGet('darkMode'); if (dm !== null) setDarkMode(dm);
        const c = await fbGet('cars'); if (c) setCars(c);
        const m = await fbGet('maintenances'); if (m) setMaintenances(m);
        const f = await fbGet('fuels'); if (f) setFuels(f);
        const r = await fbGet('reminders'); if (r) setReminders(r);
      } catch {}
      setSyncing(false); setLoaded(true);
    }
    load();
  }, []);

  const saveTimer = useRef({});
  const debounceSave = useCallback((key, value, delay = 800) => {
    clearTimeout(saveTimer.current[key]);
    saveTimer.current[key] = setTimeout(() => fbSet(key, value), delay);
  }, []);

  useEffect(() => { if (loaded) debounceSave('darkMode', darkMode, 300); }, [darkMode, loaded, debounceSave]);
  useEffect(() => { if (loaded) debounceSave('cars', cars); }, [cars, loaded, debounceSave]);
  useEffect(() => { if (loaded) debounceSave('maintenances', maintenances); }, [maintenances, loaded, debounceSave]);
  useEffect(() => { if (loaded) debounceSave('fuels', fuels); }, [fuels, loaded, debounceSave]);
  useEffect(() => { if (loaded) debounceSave('reminders', reminders); }, [reminders, loaded, debounceSave]);

  useEffect(() => {
    if (cars.length > 0 && !selectedCar) setSelectedCar(cars[0].id);
  }, [cars]);

  const activeCar = cars.find(c => c.id === selectedCar);
  const carMaints = maintenances.filter(m => m.carId === selectedCar);
  const carFuels  = fuels.filter(f => f.carId === selectedCar);
  const carReminders = reminders.filter(r => r.carId === selectedCar);

  // 필터 적용 목록
  const filteredMaints = filterByPeriod(
    carMaints.filter(m => !maintSearch || [m.type,m.shop,m.note].join(' ').toLowerCase().includes(maintSearch.toLowerCase())),
    'date', maintPeriod
  );
  const filteredFuels = filterByPeriod(
    carFuels.filter(f => !fuelSearch || [f.station,f.note].join(' ').toLowerCase().includes(fuelSearch.toLowerCase())),
    'date', fuelPeriod
  );

  // 정비 저장 후 자동 알림 추천
  const handleMaintSave = (m) => {
    const newMaint = { ...m, id: Date.now().toString() };
    setMaintenances(p => [...p, newMaint]);
    setShowMaintModal(false);
    const suggest = REMINDER_SUGGEST[m.type];
    if (suggest) setSuggestReminder({ maint: newMaint, car: activeCar, suggest });
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

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overscroll-behavior: none; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: ${T.scrollTrack}; }
    ::-webkit-scrollbar-thumb { background: ${T.accent}; border-radius: 2px; }
    input, select, textarea { outline: none; }
    button { cursor: pointer; border: none; }
    .card { background: ${T.card}; border: 1px solid ${T.border}; border-radius: 12px; box-shadow: ${T.shadow}; transition: background 0.3s, border-color 0.3s; }
    .fade-in { animation: fadeIn 0.22s ease forwards; }
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .tab-btn { background: transparent; color: ${T.textMuted}; font-family: inherit; font-size: 14px; font-weight: 600; padding: 10px 18px; border-radius: 8px; transition: all 0.2s; letter-spacing: 0.5px; white-space: nowrap; }
    .tab-btn.active { background: ${T.accent}; color: #fff; }
    .tab-btn:hover:not(.active) { color: ${T.accent}; }
    .btn-primary { background: ${T.accent}; color: #fff; font-family: inherit; font-weight: 700; font-size: 13px; border-radius: 8px; padding: 10px 20px; transition: all 0.2s; letter-spacing: 0.5px; }
    .btn-primary:hover { background: ${T.accentHover}; transform: translateY(-1px); }
    .btn-ghost { background: transparent; color: ${T.accent}; border: 1px solid ${T.accentBorder}; font-family: inherit; font-weight: 600; font-size: 13px; border-radius: 8px; padding: 8px 16px; transition: all 0.2s; }
    .btn-ghost:hover { background: ${T.accentFaint}; border-color: ${T.accent}; }
    .field-label { font-size: 11px; color: ${T.textMuted}; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
    .field-input { width: 100%; background: ${T.inputBg}; border: 1px solid ${T.border}; color: ${T.text}; font-family: inherit; font-size: 14px; padding: 10px 14px; border-radius: 8px; transition: border-color 0.2s, background 0.3s; }
    .field-input:focus { border-color: ${T.accent}; }
    .modal-bg { position: fixed; inset: 0; background: ${T.modalBg}; backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: flex-end; justify-content: center; padding: 0; }
    .modal { background: ${T.card}; border: 1px solid ${T.border3}; border-radius: 20px 20px 0 0; padding: 28px; width: 100%; max-width: 600px; max-height: 92vh; overflow-y: auto; animation: slideUp 0.25s ease; box-shadow: ${T.shadow}; }
    @keyframes slideUp { from { opacity:0; transform:translateY(60px); } to { opacity:1; transform:translateY(0); } }
    .stat-val { font-family: 'Rajdhani', sans-serif; font-size: 28px; font-weight: 700; color: ${T.accent}; line-height: 1; }
    .stat-label { font-size: 11px; color: ${T.textMuted}; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
    .list-item { background: ${T.listBg}; border: 1px solid ${T.listBorder}; border-radius: 10px; padding: 14px 16px; margin-bottom: 8px; transition: border-color 0.2s, background 0.3s; }
    .list-item:hover { border-color: ${T.accentFaint2}; }
    .badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; letter-spacing: 0.5px; }
    .reminder-urgent { color: ${T.urgentClr}; border: 1px solid ${T.urgentBorder}; background: ${T.urgentBg}; }
    .reminder-ok { color: ${T.okClr}; border: 1px solid ${T.okBorder}; background: ${T.okBg}; }
    .delete-btn { background: transparent; color: ${T.deleteBtnClr}; font-size: 16px; border: none; cursor: pointer; transition: color 0.2s; padding: 2px 6px; border-radius: 4px; }
    .delete-btn:hover { color: ${T.urgentClr}; background: ${T.urgentBg}; }
    .car-card { background: ${T.card}; border: 2px solid ${T.border}; border-radius: 14px; padding: 18px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; box-shadow: ${T.shadow}; }
    .car-card.selected { border-color: ${T.accent}; box-shadow: 0 0 25px rgba(255,107,0,0.18); }
    .car-card:hover:not(.selected) { border-color: ${T.accentBorder}; }
    .section-title { font-size: 12px; color: ${T.textDim}; text-transform: uppercase; letter-spacing: 2px; font-weight: 600; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid ${T.border2}; }
    .empty-state { text-align: center; padding: 40px 20px; color: ${T.emptyClr}; }
    .swipe-wrapper { overflow: hidden; }
    .swipe-content { will-change: transform; }
    .swipe-content.slide-to-left { animation: slideToLeft 0.22s cubic-bezier(0.4,0,0.2,1) forwards; }
    .swipe-content.slide-to-right { animation: slideToRight 0.22s cubic-bezier(0.4,0,0.2,1) forwards; }
    @keyframes slideToLeft { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(-60px); } }
    @keyframes slideToRight { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(60px); } }
    .theme-toggle { background: ${T.accentBg}; border: 1px solid ${T.accentBorder}; border-radius: 20px; padding: 6px 12px; font-size: 15px; cursor: pointer; transition: all 0.25s; display: flex; align-items: center; gap: 5px; }
    .theme-toggle:hover { transform: scale(1.04); }
    .theme-toggle-label { font-size: 11px; color: ${T.textMuted}; font-family: 'Noto Sans KR', sans-serif; font-weight: 500; }
    .sync-dot { width: 7px; height: 7px; border-radius: 50%; background: ${T.accent}; animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 0%,100% { opacity:0.3; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.1); } }
    .filter-btn { background: ${T.filterBg}; border: 1px solid ${T.border}; color: ${T.textMuted}; font-family: inherit; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 20px; cursor: pointer; transition: all 0.18s; white-space: nowrap; }
    .filter-btn.active { background: ${T.accent}; border-color: ${T.accent}; color: #fff; }
    .search-input { width: 100%; background: ${T.inputBg}; border: 1px solid ${T.border}; color: ${T.text}; font-family: inherit; font-size: 13px; padding: 9px 14px 9px 36px; border-radius: 10px; transition: border-color 0.2s; }
    .search-input:focus { border-color: ${T.accent}; }
    .search-wrap { position: relative; margin-bottom: 10px; }
    .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; pointer-events: none; }
    .dday-card { border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; transition: all 0.2s; }
    .photo-thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; cursor: pointer; flex-shrink: 0; }
    .photo-full-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .file-btn { background: ${T.filterBg}; border: 1px dashed ${T.border3}; color: ${T.textMuted}; border-radius: 8px; padding: 10px 14px; font-size: 13px; font-family: inherit; cursor: pointer; width: 100%; text-align: left; transition: all 0.2s; }
    .file-btn:hover { border-color: ${T.accent}; color: ${T.accent}; }
  `;

  return (
    <ThemeCtx.Provider value={T}>
    <div
      style={{ minHeight:"100vh", background:T.bg, fontFamily:"'Rajdhani','Noto Sans KR',sans-serif", color:T.text, transition:"background 0.3s, color 0.3s" }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
    >
      <style>{css}</style>

      {/* ── Header ── */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border2}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:12, transition:"background 0.3s", position:"sticky", top:0, zIndex:50 }}>
        <div style={{ width:32, height:32, background:T.accent, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🚗</div>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"Rajdhani", fontSize:20, fontWeight:700, letterSpacing:1, color:T.text }}>CARLOG</div>
          <div style={{ fontSize:10, color:T.textMuted, letterSpacing:2, textTransform:"uppercase" }}>차량 관리 시스템</div>
        </div>
        {syncing && <div className="sync-dot" />}
        <button className="theme-toggle" onClick={() => setDarkMode(d => !d)}>
          <span>{T.themeIcon}</span>
          <span className="theme-toggle-label">{T.themeLabel}</span>
        </button>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border2}`, padding:"8px 16px", display:"flex", gap:4, overflowX:"auto", transition:"background 0.3s", position:"sticky", top:"61px", zIndex:49 }}>
        {TABS.map((t,i) => <button key={i} className={`tab-btn${tab===i?" active":""}`} onClick={() => goToTab(i, i>tab?'left':'right')}>{t}</button>)}
      </div>
      <div style={{ background:T.surface, display:"flex", justifyContent:"center", gap:6, padding:"5px 0 4px", borderBottom:`1px solid ${T.border2}`, transition:"background 0.3s", position:"sticky", top:"113px", zIndex:48 }}>
        {TABS.map((_,i) => <div key={i} style={{ width:tab===i?18:6, height:4, borderRadius:2, background:tab===i?T.accent:T.tabDot, transition:"all 0.25s ease" }} />)}
      </div>

      {/* ── Content ── */}
      <div className="swipe-wrapper">
        <div
          className={`swipe-content${slideDir==='left'?' slide-to-left':slideDir==='right'?' slide-to-right':''}`}
          style={{ transform:isDragging&&!slideDir?`translateX(${dragX}px)`:undefined, transition:isDragging?'none':undefined }}
        >
        <div style={{ padding:"20px 16px", maxWidth:600, margin:"0 auto", paddingBottom:40 }}>

          {/* ═══ 내 차량 ═══ */}
          {tab===0 && (
            <div className="fade-in">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                <div className="section-title" style={{ margin:0, border:0 }}>등록된 차량 ({cars.length})</div>
                <button className="btn-primary" onClick={() => setShowCarModal(true)}>+ 차량 추가</button>
              </div>

              {cars.length===0 ? (
                <div className="empty-state card" style={{ padding:48 }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🚘</div>
                  <p>등록된 차량이 없습니다</p>
                  <p style={{ fontSize:12, marginTop:6, color:T.emptySubClr }}>차량을 추가해 관리를 시작하세요</p>
                </div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
                  {cars.map(car => (
                    <div key={car.id} className={`car-card${selectedCar===car.id?" selected":""}`} onClick={() => setSelectedCar(car.id)}>
                      {selectedCar===car.id && <div style={{ position:"absolute", top:10, right:10, width:8, height:8, background:T.accent, borderRadius:"50%" }} />}
                      <div style={{ fontSize:36, marginBottom:8 }}>{car.emoji||"🚗"}</div>
                      <div style={{ fontWeight:700, fontSize:15, color:T.text, marginBottom:2 }}>{car.name}</div>
                      <div style={{ fontSize:12, color:T.textMuted }}>{car.plate}</div>
                      <div style={{ fontSize:11, color:T.textFaint, marginTop:6 }}>{car.year}년형</div>
                      <div style={{ marginTop:10, padding:"6px 10px", background:T.bg, borderRadius:6, textAlign:"center", transition:"background 0.3s" }}>
                        <span style={{ fontFamily:"Rajdhani", fontSize:16, fontWeight:700, color:T.accent }}>{formatNum(car.mileage)}</span>
                        <span style={{ fontSize:10, color:T.textMuted, marginLeft:4 }}>km</span>
                      </div>
                      <button style={{ position:"absolute", bottom:10, left:10, background:"transparent", border:`1px solid ${T.border3}`, borderRadius:6, color:T.textMuted, fontSize:13, padding:"2px 7px", cursor:"pointer" }}
                        onClick={e => { e.stopPropagation(); setEditingCar(car); }}>✏️</button>
                      <button className="delete-btn" style={{ position:"absolute", bottom:10, right:10 }}
                        onClick={e => { e.stopPropagation(); if (confirm("차량을 삭제하시겠습니까?")) { setCars(p => p.filter(c => c.id!==car.id)); if (selectedCar===car.id) setSelectedCar(null); } }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* ② D-day 배지 섹션 */}
              {activeCar && carReminders.length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div className="section-title">다가오는 정비 일정</div>
                  {[...carReminders]
                    .sort((a,b) => new Date(a.dueDate)-new Date(b.dueDate))
                    .slice(0,3)
                    .map(r => {
                      const d = calcDday(r.dueDate);
                      const isPast = d < 0;
                      const isUrgent = d >= 0 && d <= 7;
                      const bg = isPast ? T.urgentBg : isUrgent ? T.urgentBg : T.accentFaint;
                      const border = isPast ? T.urgentBorder : isUrgent ? T.urgentBorder : T.accentBorder;
                      const clr = isPast ? T.urgentClr : isUrgent ? T.urgentClr : T.accent;
                      return (
                        <div key={r.id} className="dday-card" style={{ background:bg, border:`1px solid ${border}` }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{r.type}</div>
                            {r.dueDate && <div style={{ fontSize:12, color:T.textDim, marginTop:2 }}>{formatDate(r.dueDate)}</div>}
                            {r.dueMileage && <div style={{ fontSize:11, color:T.textDim }}>{formatNum(r.dueMileage)} km</div>}
                          </div>
                          <div style={{ textAlign:"center" }}>
                            <div style={{ fontFamily:"Rajdhani", fontSize:22, fontWeight:700, color:clr, lineHeight:1 }}>
                              {isPast ? `D+${Math.abs(d)}` : d===0 ? "D-Day" : `D-${d}`}
                            </div>
                            <div style={{ fontSize:10, color:clr, marginTop:2 }}>
                              {isPast ? "기한초과" : isUrgent ? "임박" : "예정"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {activeCar && (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                    <div className="section-title" style={{ margin:0, paddingBottom:0, border:0 }}>차량 정보 — {activeCar.name}</div>
                    <button className="btn-ghost" style={{ fontSize:12, padding:"6px 14px" }} onClick={() => setEditingCar(activeCar)}>✏️ 수정</button>
                  </div>
                  <div className="card" style={{ padding:20, marginBottom:16 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, textAlign:"center" }}>
                      <div><div className="stat-val">{formatNum(activeCar.mileage)}</div><div className="stat-label">총 주행km</div></div>
                      <div><div className="stat-val">{carMaints.length}</div><div className="stat-label">정비 횟수</div></div>
                      <div><div className="stat-val">{carFuels.length}</div><div className="stat-label">주유 횟수</div></div>
                    </div>
                  </div>
                  <div className="card" style={{ padding:16 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      {[["차량명",activeCar.name],["번호판",activeCar.plate],["연식",`${activeCar.year}년`],["연료",activeCar.fuel||"-"],["색상",activeCar.color||"-"],["보험만료",activeCar.insurance?formatDate(activeCar.insurance):"-"]].map(([label,val]) => (
                        <div key={label}><div className="field-label">{label}</div><div style={{ fontSize:14, color:T.textCard }}>{val}</div></div>
                      ))}
                    </div>
                    <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${T.border2}` }}>
                      <div className="field-label">현재 주행거리 업데이트</div>
                      <div style={{ display:"flex", gap:8 }}>
                        <input className="field-input" type="number" defaultValue={activeCar.mileage} id="mileage-update" style={{ flex:1 }} />
                        <button className="btn-primary" onClick={() => {
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
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div className="section-title" style={{ margin:0, border:0 }}>정비 기록</div>
                <button className="btn-primary" onClick={() => cars.length>0 ? setShowMaintModal(true) : alert("먼저 차량을 등록해주세요.")}>+ 추가</button>
              </div>

              {/* 차량 필터 */}
              {cars.length>1 && <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                {cars.map(c => <button key={c.id} className="btn-ghost" style={selectedCar===c.id?{background:T.accentBg,borderColor:T.accent}:{}} onClick={() => setSelectedCar(c.id)}>{c.name}</button>)}
              </div>}

              {/* ③ 검색·필터 */}
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input className="search-input" placeholder="정비 유형, 정비소 검색..." value={maintSearch} onChange={e => setMaintSearch(e.target.value)} />
              </div>
              <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:2 }}>
                {[['all','전체'],['month','이번달'],['3months','3개월'],['year','올해']].map(([v,l]) => (
                  <button key={v} className={`filter-btn${maintPeriod===v?' active':''}`} onClick={() => setMaintPeriod(v)}>{l}</button>
                ))}
              </div>

              {filteredMaints.length===0 ? (
                <div className="empty-state card" style={{ padding:48 }}><div style={{ fontSize:40, marginBottom:12 }}>🔧</div><p>정비 기록이 없습니다</p></div>
              ) : (
                [...filteredMaints].sort((a,b) => new Date(b.date)-new Date(a.date)).map(m => (
                  <div key={m.id} className="list-item">
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:15, fontWeight:700, color:T.text }}>{m.type}</span>
                          <span className="badge" style={{ background:T.accentFaint, color:T.accent, border:`1px solid ${T.accentFaint2}` }}>🔧</span>
                        </div>
                        <div style={{ fontSize:12, color:T.textDim, marginBottom:6 }}>{formatDate(m.date)} · {formatNum(m.mileage)} km</div>
                        <div style={{ display:"flex", gap:16 }}>
                          <div><span style={{ fontSize:11, color:T.textDim }}>비용 </span><span style={{ fontSize:14, fontWeight:600, color:T.accent }}>{formatNum(m.cost)}원</span></div>
                          {m.shop && <div><span style={{ fontSize:11, color:T.textDim }}>정비소 </span><span style={{ fontSize:13, color:T.textSub }}>{m.shop}</span></div>}
                        </div>
                        {m.note && <div style={{ fontSize:12, color:T.textDim, marginTop:6, fontStyle:"italic" }}>{m.note}</div>}
                      </div>
                      {/* ⑦ 사진 썸네일 */}
                      {m.photoUrl && (
                        <PhotoThumb url={m.photoUrl} />
                      )}
                      <button className="delete-btn" onClick={() => {
                        if (m.photoUrl) fbDeletePhoto(m.photoUrl);
                        setMaintenances(p => p.filter(x => x.id!==m.id));
                      }}>✕</button>
                    </div>
                  </div>
                ))
              )}

              {carMaints.length>0 && (
                <div className="card" style={{ padding:16, marginTop:16, textAlign:"center" }}>
                  <div style={{ fontSize:11, color:T.textDim, marginBottom:4 }}>총 정비 비용</div>
                  <div style={{ fontFamily:"Rajdhani", fontSize:26, fontWeight:700, color:T.accent }}>{formatNum(carMaints.reduce((s,m)=>s+(parseInt(m.cost)||0),0))}원</div>
                </div>
              )}
            </div>
          )}

          {/* ═══ 주유 기록 ═══ */}
          {tab===2 && (
            <div className="fade-in">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div className="section-title" style={{ margin:0, border:0 }}>주유 기록</div>
                <button className="btn-primary" onClick={() => cars.length>0 ? setShowFuelModal(true) : alert("먼저 차량을 등록해주세요.")}>+ 추가</button>
              </div>

              {cars.length>1 && <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                {cars.map(c => <button key={c.id} className="btn-ghost" style={selectedCar===c.id?{background:T.accentBg,borderColor:T.accent}:{}} onClick={() => setSelectedCar(c.id)}>{c.name}</button>)}
              </div>}

              {/* ③ 검색·필터 */}
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input className="search-input" placeholder="주유소 이름 검색..." value={fuelSearch} onChange={e => setFuelSearch(e.target.value)} />
              </div>
              <div style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:2 }}>
                {[['all','전체'],['month','이번달'],['3months','3개월'],['year','올해']].map(([v,l]) => (
                  <button key={v} className={`filter-btn${fuelPeriod===v?' active':''}`} onClick={() => setFuelPeriod(v)}>{l}</button>
                ))}
              </div>

              {carFuels.length>=2 && (
                <div className="card" style={{ padding:16, marginBottom:16 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, textAlign:"center" }}>
                    <div><div className="stat-val">{formatNum(filteredFuels.reduce((s,f)=>s+parseFloat(f.amount||0),0).toFixed(1))}</div><div className="stat-label">총 주유(L)</div></div>
                    <div><div className="stat-val">{formatNum(filteredFuels.reduce((s,f)=>s+(parseInt(f.cost)||0),0))}</div><div className="stat-label">총 비용(원)</div></div>
                    <div>
                      {(() => {
                        const sorted = [...filteredFuels].sort((a,b)=>new Date(a.date)-new Date(b.date));
                        if (sorted.length>=2) {
                          const km=(parseInt(sorted[sorted.length-1].mileage)||0)-(parseInt(sorted[0].mileage)||0);
                          const L=sorted.slice(1).reduce((s,f)=>s+parseFloat(f.amount||0),0);
                          return <><div className="stat-val">{L>0?(km/L).toFixed(1):"-"}</div><div className="stat-label">연비(km/L)</div></>;
                        }
                        return <><div className="stat-val">-</div><div className="stat-label">연비(km/L)</div></>;
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {filteredFuels.length===0 ? (
                <div className="empty-state card" style={{ padding:48 }}><div style={{ fontSize:40, marginBottom:12 }}>⛽</div><p>주유 기록이 없습니다</p></div>
              ) : (
                [...filteredFuels].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(f => (
                  <div key={f.id} className="list-item">
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, color:T.textDim, marginBottom:4 }}>{formatDate(f.date)} · {formatNum(f.mileage)} km</div>
                        <div style={{ display:"flex", gap:16, alignItems:"baseline" }}>
                          <div><span style={{ fontSize:11, color:T.textDim }}>주유량 </span><span style={{ fontSize:16, fontWeight:700, color:T.accent, fontFamily:"Rajdhani" }}>{f.amount}L</span></div>
                          <div><span style={{ fontSize:11, color:T.textDim }}>금액 </span><span style={{ fontSize:14, fontWeight:600, color:T.textCard }}>{formatNum(f.cost)}원</span></div>
                          {f.amount&&f.cost&&<div><span style={{ fontSize:11, color:T.textDim }}>단가 </span><span style={{ fontSize:13, color:T.textSub }}>{formatNum(Math.round(parseInt(f.cost)/parseFloat(f.amount)))}원/L</span></div>}
                        </div>
                        {f.station && <div style={{ fontSize:12, color:T.textDim, marginTop:4 }}>⛽ {f.station}</div>}
                      </div>
                      {f.photoUrl && <PhotoThumb url={f.photoUrl} />}
                      <button className="delete-btn" onClick={() => {
                        if (f.photoUrl) fbDeletePhoto(f.photoUrl);
                        setFuels(p => p.filter(x => x.id!==f.id));
                      }}>✕</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ═══ 알림 ═══ */}
          {tab===3 && (
            <div className="fade-in">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
                <div className="section-title" style={{ margin:0, border:0 }}>정비 알림</div>
                <button className="btn-primary" onClick={() => cars.length>0 ? setShowReminderModal(true) : alert("먼저 차량을 등록해주세요.")}>+ 추가</button>
              </div>
              {carReminders.length===0 ? (
                <div className="empty-state card" style={{ padding:48 }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>🔔</div>
                  <p>등록된 알림이 없습니다</p>
                  <p style={{ fontSize:12, marginTop:6, color:T.emptySubClr }}>정기 점검 일정을 추가하세요</p>
                </div>
              ) : (
                [...carReminders].sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).map(r => {
                  const d = calcDday(r.dueDate);
                  const isPast = d < 0;
                  const isUrgent = d >= 0 && d <= 7;
                  return (
                    <div key={r.id} className="list-item" style={isUrgent||isPast?{borderColor:T.urgentBorder}:{}}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                            <span style={{ fontSize:15, fontWeight:700, color:T.text }}>{r.type}</span>
                            <span className={`badge ${isPast||isUrgent?"reminder-urgent":"reminder-ok"}`}>{isPast?"기한초과":isUrgent?"임박":"정상"}</span>
                            <span style={{ fontFamily:"Rajdhani", fontSize:16, fontWeight:700, color:isPast||isUrgent?T.urgentClr:T.accent, marginLeft:"auto" }}>
                              {d==null ? "" : isPast ? `D+${Math.abs(d)}` : d===0 ? "D-Day" : `D-${d}`}
                            </span>
                          </div>
                          {r.dueDate && <div style={{ fontSize:12, color:T.textDim }}>예정일: {formatDate(r.dueDate)}</div>}
                          {r.dueMileage && <div style={{ fontSize:12, color:T.textDim }}>예정 주행거리: {formatNum(r.dueMileage)} km</div>}
                          {r.note && <div style={{ fontSize:12, color:T.textDim, marginTop:4, fontStyle:"italic" }}>{r.note}</div>}
                        </div>
                        <button className="delete-btn" onClick={() => setReminders(p => p.filter(x => x.id!==r.id))}>✕</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showCarModal && <CarModal onClose={() => setShowCarModal(false)} onSave={car => { setCars(p => [...p, {...car, id:Date.now().toString()}]); setShowCarModal(false); }} />}
      {editingCar && <CarModal initialData={editingCar} onClose={() => setEditingCar(null)} onSave={updated => { setCars(p => p.map(c => c.id===updated.id ? updated : c)); setEditingCar(null); }} />}
      {showMaintModal && <Modal title="정비 기록 추가" onClose={() => setShowMaintModal(false)}><MaintForm cars={cars} selectedCar={selectedCar} onSave={handleMaintSave} /></Modal>}
      {showFuelModal && <Modal title="주유 기록 추가" onClose={() => setShowFuelModal(false)}><FuelForm cars={cars} selectedCar={selectedCar} onSave={f => { setFuels(p => [...p, {...f, id:Date.now().toString()}]); setShowFuelModal(false); }} /></Modal>}
      {showReminderModal && <Modal title="정비 알림 추가" onClose={() => setShowReminderModal(false)}><ReminderForm cars={cars} selectedCar={selectedCar} onSave={r => { setReminders(p => [...p, {...r, id:Date.now().toString()}]); setShowReminderModal(false); }} /></Modal>}

      {/* ⑥ 자동 알림 추천 모달 */}
      {suggestReminder && (
        <SuggestReminderModal
          data={suggestReminder}
          onAdd={(reminder) => { setReminders(p => [...p, {...reminder, id:Date.now().toString()}]); setSuggestReminder(null); }}
          onSkip={() => setSuggestReminder(null)}
        />
      )}
    </div>
    </ThemeCtx.Provider>
  );
}

// ─── 사진 썸네일 컴포넌트 ─────────────────────────────────────
function PhotoThumb({ url }) {
  const [full, setFull] = useState(false);
  return (
    <>
      <img src={url} className="photo-thumb" onClick={() => setFull(true)} alt="첨부사진" />
      {full && (
        <div className="photo-full-bg" onClick={() => setFull(false)}>
          <img src={url} style={{ maxWidth:"100%", maxHeight:"90vh", borderRadius:12, objectFit:"contain" }} alt="첨부사진 전체" />
        </div>
      )}
    </>
  );
}

// ─── ⑥ 자동 알림 추천 모달 ───────────────────────────────────
function SuggestReminderModal({ data, onAdd, onSkip }) {
  const T = useT();
  const { maint, car, suggest } = data;
  const nextDate = new Date();
  if (suggest.months) nextDate.setMonth(nextDate.getMonth() + suggest.months);
  const dueDateStr = nextDate.toISOString().split("T")[0];
  const nextMileage = car && suggest.km ? (parseInt(car.mileage)||0) + suggest.km : "";

  return (
    <div className="modal-bg" onClick={e => e.target===e.currentTarget && onSkip()}>
      <div className="modal">
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🔔</div>
          <div style={{ fontFamily:"Rajdhani", fontSize:18, fontWeight:700, color:T.text }}>다음 정비 알림 추가</div>
          <div style={{ fontSize:13, color:T.textDim, marginTop:6 }}>
            <strong style={{ color:T.accent }}>{maint.type}</strong> 기록을 저장했습니다.<br />
            다음 교체 알림을 자동으로 추가할까요?
          </div>
        </div>
        <div className="card" style={{ padding:16, marginBottom:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:12, color:T.textDim }}>추천 주기</span>
            <span style={{ fontSize:13, fontWeight:600, color:T.accent }}>{suggest.label}</span>
          </div>
          {suggest.months > 0 && <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:12, color:T.textDim }}>예정일</span>
            <span style={{ fontSize:13, color:T.textCard }}>{formatDate(dueDateStr)}</span>
          </div>}
          {suggest.km > 0 && <div style={{ display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontSize:12, color:T.textDim }}>예정 주행거리</span>
            <span style={{ fontSize:13, color:T.textCard }}>{formatNum(nextMileage)} km</span>
          </div>}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn-ghost" style={{ flex:1, padding:"12px" }} onClick={onSkip}>건너뛰기</button>
          <button className="btn-primary" style={{ flex:2, padding:"12px" }} onClick={() => onAdd({
            carId: maint.carId,
            type: maint.type,
            dueDate: suggest.months ? dueDateStr : "",
            dueMileage: suggest.km ? String(nextMileage) : "",
            note: `${maint.type} 후 자동 추천`
          })}>✅ 알림 추가</button>
        </div>
      </div>
    </div>
  );
}

// ─── 공용 Modal 쉘 ────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  const T = useT();
  return (
    <div className="modal-bg" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontFamily:"Rajdhani", fontSize:18, fontWeight:700, color:T.text, letterSpacing:1 }}>{title}</div>
          <button onClick={onClose} style={{ background:"none", color:T.textMuted, fontSize:24, fontWeight:300, lineHeight:1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Car Modal ────────────────────────────────────────────────
function CarModal({ onClose, onSave, initialData }) {
  const T = useT();
  const isEdit = !!initialData;
  const [form, setForm] = useState(initialData ? {...initialData} : { name:"", plate:"", year:new Date().getFullYear(), mileage:0, fuel:"휘발유", color:"", insurance:"", emoji:"🚗" });
  const set = (k, v) => setForm(p => ({...p, [k]:v}));
  const emojis = ["🚗","🚙","🚕","🏎","🚐","🚌","🛻","🚓"];
  return (
    <div className="modal-bg" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontFamily:"Rajdhani", fontSize:18, fontWeight:700, color:T.text, letterSpacing:1 }}>{isEdit?"✏️ 차량 정보 수정":"차량 추가"}</div>
          <button onClick={onClose} style={{ background:"none", color:T.textMuted, fontSize:24 }}>×</button>
        </div>
        <div style={{ marginBottom:16 }}>
          <div className="field-label">아이콘 선택</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {emojis.map(e => <button key={e} onClick={() => set("emoji",e)} style={{ fontSize:24, background:form.emoji===e?T.accentBg:T.bg, border:`1px solid ${form.emoji===e?T.accent:T.border}`, borderRadius:8, padding:"6px 8px", transition:"all 0.15s" }}>{e}</button>)}
          </div>
        </div>
        {[["차량명","name","text","예) 내 아반떼"],["번호판","plate","text","예) 12가 3456"],["연식","year","number",""],["현재 주행거리 (km)","mileage","number",""],["색상","color","text","예) 흰색"],["보험 만료일","insurance","date",""]].map(([label,key,type,ph]) => (
          <div key={key} style={{ marginBottom:12 }}>
            <div className="field-label">{label}</div>
            <input className="field-input" type={type} placeholder={ph} value={form[key]??""} onChange={e => set(key, e.target.value)} />
          </div>
        ))}
        <div style={{ marginBottom:20 }}>
          <div className="field-label">연료 유형</div>
          <select className="field-input" value={form.fuel||"휘발유"} onChange={e => set("fuel",e.target.value)}>
            {["휘발유","경유","LPG","전기","하이브리드"].map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        <button className="btn-primary" style={{ width:"100%", padding:"13px" }}
          onClick={() => { if (!form.name||!form.plate) return alert("차량명과 번호판을 입력해주세요."); onSave(isEdit?{...form}:form); }}>
          {isEdit?"✅ 수정 저장":"저장"}
        </button>
      </div>
    </div>
  );
}

// ─── ⑦ 사진 업로드 공용 컴포넌트 ────────────────────────────
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
      <div className="field-label">사진 첨부 (선택)</div>
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

// ─── 정비 폼 ─────────────────────────────────────────────────
function MaintForm({ cars, selectedCar, onSave }) {
  const recordId = useRef("m_" + Date.now().toString(36));
  const [form, setForm] = useState({ carId:selectedCar||cars[0]?.id, type:maintenanceTypes[0], date:today(), mileage:"", cost:"", shop:"", note:"", photoUrl:null });
  const [uploading, setUploading] = useState(false);
  const set = (k,v) => setForm(p => ({...p,[k]:v}));
  return (
    <div>
      {cars.length>1 && <div style={{ marginBottom:12 }}><div className="field-label">차량 선택</div><select className="field-input" value={form.carId} onChange={e=>set("carId",e.target.value)}>{cars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
      <div style={{ marginBottom:12 }}><div className="field-label">정비 유형</div><select className="field-input" value={form.type} onChange={e=>set("type",e.target.value)}>{maintenanceTypes.map(t=><option key={t}>{t}</option>)}</select></div>
      {[["날짜","date","date"],["주행거리 (km)","mileage","number"],["비용 (원)","cost","number"],["정비소","shop","text"]].map(([label,key,type]) => (
        <div key={key} style={{ marginBottom:12 }}><div className="field-label">{label}</div><input className="field-input" type={type} value={form[key]} onChange={e=>set(key,e.target.value)} /></div>
      ))}
      <div style={{ marginBottom:12 }}><div className="field-label">메모</div><textarea className="field-input" rows={2} value={form.note} onChange={e=>set("note",e.target.value)} style={{ resize:"none" }} /></div>
      <PhotoUploadField recordId={recordId.current} onUploaded={url=>set("photoUrl",url)} uploading={uploading} setUploading={setUploading} />
      <button className="btn-primary" style={{ width:"100%", padding:"12px" }} disabled={uploading} onClick={() => !uploading && onSave(form)}>
        {uploading ? "업로드 중..." : "저장"}
      </button>
    </div>
  );
}

// ─── 주유 폼 ─────────────────────────────────────────────────
function FuelForm({ cars, selectedCar, onSave }) {
  const recordId = useRef("f_" + Date.now().toString(36));
  const [form, setForm] = useState({ carId:selectedCar||cars[0]?.id, date:today(), mileage:"", amount:"", cost:"", station:"", photoUrl:null });
  const [uploading, setUploading] = useState(false);
  const set = (k,v) => setForm(p => ({...p,[k]:v}));
  return (
    <div>
      {cars.length>1 && <div style={{ marginBottom:12 }}><div className="field-label">차량 선택</div><select className="field-input" value={form.carId} onChange={e=>set("carId",e.target.value)}>{cars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
      {[["날짜","date","date"],["주행거리 (km)","mileage","number"],["주유량 (L)","amount","number"],["금액 (원)","cost","number"],["주유소","station","text"]].map(([label,key,type]) => (
        <div key={key} style={{ marginBottom:12 }}><div className="field-label">{label}</div><input className="field-input" type={type} value={form[key]} onChange={e=>set(key,e.target.value)} /></div>
      ))}
      <PhotoUploadField recordId={recordId.current} onUploaded={url=>set("photoUrl",url)} uploading={uploading} setUploading={setUploading} />
      <button className="btn-primary" style={{ width:"100%", padding:"12px" }} disabled={uploading} onClick={() => !uploading && onSave(form)}>
        {uploading ? "업로드 중..." : "저장"}
      </button>
    </div>
  );
}

// ─── 알림 폼 ─────────────────────────────────────────────────
function ReminderForm({ cars, selectedCar, onSave }) {
  const [form, setForm] = useState({ carId:selectedCar||cars[0]?.id, type:maintenanceTypes[0], dueDate:today(), dueMileage:"", note:"" });
  const set = (k,v) => setForm(p => ({...p,[k]:v}));
  return (
    <div>
      {cars.length>1 && <div style={{ marginBottom:12 }}><div className="field-label">차량 선택</div><select className="field-input" value={form.carId} onChange={e=>set("carId",e.target.value)}>{cars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
      <div style={{ marginBottom:12 }}><div className="field-label">정비 유형</div><select className="field-input" value={form.type} onChange={e=>set("type",e.target.value)}>{maintenanceTypes.map(t=><option key={t}>{t}</option>)}</select></div>
      <div style={{ marginBottom:12 }}><div className="field-label">예정 날짜</div><input className="field-input" type="date" value={form.dueDate} onChange={e=>set("dueDate",e.target.value)} /></div>
      <div style={{ marginBottom:12 }}><div className="field-label">예정 주행거리 (km)</div><input className="field-input" type="number" value={form.dueMileage} onChange={e=>set("dueMileage",e.target.value)} /></div>
      <div style={{ marginBottom:16 }}><div className="field-label">메모</div><textarea className="field-input" rows={2} value={form.note} onChange={e=>set("note",e.target.value)} style={{ resize:"none" }} /></div>
      <button className="btn-primary" style={{ width:"100%", padding:"12px" }} onClick={() => onSave(form)}>저장</button>
    </div>
  );
}
