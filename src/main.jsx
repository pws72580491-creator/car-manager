import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initAuth } from './firebase.js'
import { registerSW } from 'virtual:pwa-register'

// 서비스 워커 등록
try { registerSW({ immediate: true }) } catch {}

// 최상위 ErrorBoundary — App 자체 오류도 잡음
class RootErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e?.message || String(e) }; }
  render() {
    if (this.state.err) return (
      <div style={{ minHeight:'100vh', background:'#0a0a0f', color:'#e8e8f0', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'sans-serif', gap:12 }}>
        <div style={{ fontSize:40 }}>⚠️</div>
        <div style={{ fontSize:18, fontWeight:700 }}>앱 오류가 발생했습니다</div>
        <div style={{ fontSize:12, color:'#666', textAlign:'center' }}>{this.state.err}</div>
        <button onClick={() => window.location.reload()} style={{ marginTop:8, background:'#ff6b00', color:'#fff', border:'none', borderRadius:8, padding:'12px 24px', fontSize:14, cursor:'pointer' }}>새로고침</button>
      </div>
    );
    return this.props.children;
  }
}

function render() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>
  )
}

// Firebase 인증 완료 후 렌더링 (10초 타임아웃 — 실패해도 앱은 반드시 뜬다)
const timeout = setTimeout(render, 10000)
initAuth()
  .then(() => { clearTimeout(timeout); render() })
  .catch(() => { clearTimeout(timeout); render() })
