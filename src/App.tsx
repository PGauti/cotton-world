import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Trash2, Plus, Check, X, Link as LinkIcon, Lock, Unlock, Save, RefreshCw, Copy, AlertTriangle
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCZE3aHBH2yZLMuOge5FaJycXc0zIQm15k",
  authDomain: "cottonworld--journeys.firebaseapp.com",
  databaseURL: "https://cottonworld--journeys-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cottonworld--journeys",
  storageBucket: "cottonworld--journeys.firebasestorage.app",
  messagingSenderId: "912942651395",
  appId: "1:912942651395:web:61a9194c247794496f9636",
  measurementId: "G-78C8NMR91X"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: memoryLocalCache() });
const APP_ID = 'cottonworld-unified-sync-final-v3';
const LS_KEY = 'cw_cache_v4';
const LS_TAB = 'cw_active_journey';

function docRef(sub) { return doc(db, 'artifacts', APP_ID, 'public', 'data', 'dashboardState', sub); }
function loadCache() { try { const d = JSON.parse(localStorage.getItem(LS_KEY)); return d?.j ? d : null; } catch { return null; } }
function saveCache(j, n, e) { try { localStorage.setItem(LS_KEY, JSON.stringify({ j, n, e, t: Date.now() })); } catch {} }
function withTimeout(promise, ms = 8000) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT: Firebase did not respond in ' + (ms/1000) + 's.')), ms))]);
}

// --- CUSTOM TOOLBAR ICONS (clean, identifiable) ---
const Icon = ({ d, size = 14, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>{d}</svg>
);

const TriggerIcon = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/><path d="M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83m0-14.14l-2.83 2.83m-8.48 8.48l-2.83 2.83"/></>} />;
const WhatsAppIcon = (p) => <Icon {...p} d={<><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10l1.5 1.5L15 8"/></>} />;
const VoiceIcon = (p) => <Icon {...p} d={<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></>} />;
const EmailIcon = (p) => <Icon {...p} d={<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></>} />;
const SMSIcon = (p) => <Icon {...p} d={<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></>} />;
const RCSIcon = (p) => <Icon {...p} d={<><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/></>} />;
const DelayIcon = (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>} />;
const SplitIcon = (p) => <Icon {...p} d={<><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M12 15V9"/><path d="M9 9l3 3 3-3"/></>} />;

const INIT_J = [
  { id: 'j1', title: 'Cart Abandonment', desc: 'WhatsApp/RCS + Voice Bot escalation.' },
  { id: 'j2', title: 'COD Verification', desc: 'Automated RTO reduction.' },
  { id: 'j3', title: 'Welcome Series', desc: 'New subscriber onboarding.' },
  { id: 'j4', title: 'Post-Purchase Review', desc: 'NPS collection 7 days post-delivery.' },
  { id: 'j5', title: 'Browse Abandonment', desc: 'Retargeting high-interest browsers.' },
  { id: 'j6', title: 'Win-back Campaign', desc: '90-day inactive segment recovery.' }
];
const INIT_N = { 'j1': [
  { id: 'n1', type: 'trigger', x: 250, y: 80, label: 'Checkout Abandoned' },
  { id: 'n2', type: 'action', channel: 'WhatsApp', x: 250, y: 240, title: 'Main Nudge', content: 'Hi {{name}}, your cart is waiting!', previewLink: '' },
  { id: 'n3', type: 'split', x: 250, y: 560, condition: 'Did customer click link?' }
]};
const INIT_E = { 'j1': [
  { id: 'e1', from: 'n1', to: 'n2', port: 'default' },
  { id: 'e2', from: 'n2', to: 'n3', port: 'default' }
]};

export default function App() {
  const [user, setUser] = useState(null);
  const [syncState, setSyncState] = useState('init');
  const [syncError, setSyncError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuthInput, setShowAuthInput] = useState(false);
  const [authInput, setAuthInput] = useState('');
  const tridentTaps = useRef(0);
  const tridentTimer = useRef(null);

  const cache = useRef(loadCache());
  const [journeys, setJourneys] = useState(cache.current?.j || INIT_J);
  const [nodes, setNodes] = useState(cache.current?.n || INIT_N);
  const [edges, setEdges] = useState(cache.current?.e || INIT_E);
  const [activeJId, setActiveJId] = useState(() => localStorage.getItem(LS_TAB) || 'j1');

  const latest = useRef({ j: journeys, n: nodes, e: edges });
  const canvasRef = useRef(null);
  const [dragId, setDragId] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const [linking, setLinking] = useState(null);
  const linkingRef = useRef(null); // mirrors linking state for global mouseup
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const isTypingRef = useRef(false);
  const isSyncing = useRef(false);

  const [sidebarDragId, setSidebarDragId] = useState(null);
  const [sidebarOverId, setSidebarOverId] = useState(null);

  const pendingSync = useRef(false);
  const lastWriteTime = useRef(0);
  const GUARD_MS = 2500;
  const dirtyRef = useRef(false);

  // Hovered edge for showing delete button
  const [hoveredEdge, setHoveredEdge] = useState(null);

  useEffect(() => {
    latest.current = { j: journeys, n: nodes, e: edges };
    saveCache(journeys, nodes, edges);
  }, [journeys, nodes, edges]);

  useEffect(() => { localStorage.setItem(LS_TAB, activeJId); }, [activeJId]);

  const writeToFirebase = useCallback(async (data) => {
    if (!user) { setSyncState('error'); setSyncError('Not logged in. Refresh to retry.'); return; }
    if (isSyncing.current) { pendingSync.current = true; return; }
    isSyncing.current = true;
    setSyncState('writing');
    try {
      lastWriteTime.current = Date.now();
      await withTimeout(setDoc(docRef('current'), {
        journeysList: data.j, nodeData: data.n, edgeData: data.e, lastUpdated: new Date().toISOString()
      }), 8000);
      dirtyRef.current = false;
      setSyncState('synced'); setSyncError(null); setLastSyncTime(new Date());
    } catch (err) {
      setSyncState('error');
      if (err.code === 'permission-denied') setSyncError('PERMISSION DENIED: Update Firestore security rules.');
      else if (err.message?.includes('TIMEOUT')) setSyncError(err.message);
      else setSyncError(`Write failed: ${err.code || err.message}`);
      pendingSync.current = true;
    } finally {
      isSyncing.current = false;
      if (pendingSync.current) { pendingSync.current = false; setTimeout(() => writeToFirebase(latest.current), 2000); }
    }
  }, [user]);

  const debounceRef = useRef(null);
  const triggerSync = useCallback((force = false) => {
    saveCache(latest.current.j, latest.current.n, latest.current.e);
    if (!user) return;
    dirtyRef.current = true;
    if (force) { clearTimeout(debounceRef.current); writeToFirebase(latest.current); }
    else { clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => writeToFirebase(latest.current), 150); }
  }, [user, writeToFirebase]);

  useEffect(() => {
    setSyncState('authing');
    signInAnonymously(auth).then(() => setSyncError(null)).catch(err => {
      setSyncState('error'); setSyncError('AUTH FAILED: Enable Anonymous sign-in in Firebase Console. ' + err.code);
    });
    return onAuthStateChanged(auth, u => { setUser(u); if (u) setSyncState('ready'); });
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(docRef('current'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (!snap.metadata.hasPendingWrites && !isDraggingRef.current && !isTypingRef.current && (Date.now() - lastWriteTime.current) > GUARD_MS) {
          setJourneys(d.journeysList || INIT_J); setNodes(d.nodeData || INIT_N); setEdges(d.edgeData || INIT_E);
          latest.current = { j: d.journeysList || INIT_J, n: d.nodeData || INIT_N, e: d.edgeData || INIT_E };
          saveCache(latest.current.j, latest.current.n, latest.current.e);
        }
        if (!dirtyRef.current) { setSyncState('synced'); setSyncError(null); }
      } else writeToFirebase(latest.current);
    }, err => { setSyncState('error'); setSyncError('Listener: ' + (err.code || err.message)); });
    return () => unsub();
  }, [user, writeToFirebase]);

  useEffect(() => {
    const onUnload = e => {
      saveCache(latest.current.j, latest.current.n, latest.current.e);
      if (dirtyRef.current || isSyncing.current) {
        e.preventDefault(); e.returnValue = 'Changes not synced yet.';
        if (user) setDoc(docRef('current'), { journeysList: latest.current.j, nodeData: latest.current.n, edgeData: latest.current.e, lastUpdated: new Date().toISOString() }).catch(() => {});
        return e.returnValue;
      }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') { saveCache(latest.current.j, latest.current.n, latest.current.e); if (user && dirtyRef.current) writeToFirebase(latest.current); } };
    window.addEventListener('beforeunload', onUnload); document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('visibilitychange', onVis); };
  }, [user, writeToFirebase]);

  useEffect(() => {
    const up = () => {
      // Commit drag position
      if (dragId && dragPos) {
        setNodes(prev => { const nd = { ...prev, [activeJId]: (prev[activeJId] || []).map(n => n.id === dragId ? { ...n, x: dragPos.x - dragOffset.x, y: dragPos.y - dragOffset.y } : n) }; latest.current.n = nd; return nd; });
        triggerSync(true); isDraggingRef.current = false;
      }
      setDragId(null); setDragPos(null);
      
      // DON'T blindly clear linking here — let onMouseUp on nodes handle it via endLink.
      // But if mouse was released on empty canvas (no node caught it), clear it.
      // We use a small delay so the node's onMouseUp fires first.
      setTimeout(() => { if (linkingRef.current) { setLinking(null); linkingRef.current = null; } }, 50);
    };
    window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up);
  }, [dragId, dragPos, dragOffset, activeJId, triggerSync]);

  // --- ADMIN ---
  const handleSaveMaster = async () => {
    if (!user || !isAdmin) return;
    try { await withTimeout(setDoc(docRef('master'), { journeysList: journeys, nodeData: nodes, edgeData: edges, lastUpdated: new Date().toISOString() })); alert('Master saved!'); } catch (e) { alert('Failed: ' + e.message); }
  };
  const handleResetFlow = async () => {
    if (!user || !isAdmin || !window.confirm('Overwrite with Master template?')) return;
    try {
      const snap = await getDoc(docRef('master'));
      const d = snap.exists() ? snap.data() : { journeysList: INIT_J, nodeData: INIT_N, edgeData: INIT_E };
      setJourneys(d.journeysList); setNodes(d.nodeData); setEdges(d.edgeData);
      latest.current = { j: d.journeysList, n: d.nodeData, e: d.edgeData }; await writeToFirebase(latest.current);
    } catch (e) { alert('Failed: ' + e.message); }
  };

  // --- JOURNEY CRUD ---
  const addJourney = () => {
    const nid = `j-${Date.now()}`;
    const newJ = [...journeys, { id: nid, title: 'New Journey', desc: 'Click to edit.' }];
    setJourneys(newJ); latest.current.j = newJ; setActiveJId(nid); triggerSync(true);
  };
  const updateJourney = (id, upd, force = false) => {
    setJourneys(prev => {
      const updated = prev.map(j => j.id === id ? { ...j, ...upd } : j);
      latest.current.j = updated;
      triggerSync(force);
      return updated;
    });
  };
  const dupJourney = (id, ev) => {
    ev.stopPropagation(); const j = journeys.find(x => x.id === id); if (!j) return;
    const nid = `j-${Date.now()}`; const idMap = {};
    const nn = (nodes[id] || []).map(n => { const k = `nd-${Date.now()}-${Math.random().toString(36).slice(2,6)}`; idMap[n.id] = k; return { ...n, id: k }; });
    const ne = (edges[id] || []).map(e => ({ ...e, id: `e-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, from: idMap[e.from] || e.from, to: idMap[e.to] || e.to }));
    const newJ = [...journeys, { ...j, id: nid, title: j.title + ' (Copy)' }];
    setJourneys(newJ); setNodes(p => ({ ...p, [nid]: nn })); setEdges(p => ({ ...p, [nid]: ne }));
    latest.current = { j: newJ, n: { ...nodes, [nid]: nn }, e: { ...edges, [nid]: ne } }; setActiveJId(nid); triggerSync(true);
  };
  const delJourney = (id, ev) => {
    ev.stopPropagation(); const nl = journeys.filter(x => x.id !== id);
    setJourneys(nl); latest.current.j = nl; if (activeJId === id && nl.length) setActiveJId(nl[0].id); triggerSync(true);
  };

  // --- NODE CRUD ---
  const addNode = (type, chan = 'WhatsApp') => {
    const id = `nd-${Date.now()}`;
    const n = { id, type, x: 250, y: 150,
      ...(type === 'action' ? { channel: chan, title: `New ${chan}`, content: '', previewLink: '' } : {}),
      ...(type === 'delay' ? { value: 1, unit: 'Hours' } : {}),
      ...(type === 'split' ? { condition: '' } : {}),
      ...(type === 'trigger' ? { label: 'New Trigger' } : {})
    };
    setNodes(prev => { const nd = { ...prev, [activeJId]: [...(prev[activeJId] || []), n] }; latest.current.n = nd; triggerSync(true); return nd; });
  };
  const dupNode = (nid) => { const o = (nodes[activeJId] || []).find(n => n.id === nid); if (!o) return; const nn = { ...o, id: `nd-${Date.now()}`, x: o.x + 30, y: o.y + 30 }; setNodes(p => { const nd = { ...p, [activeJId]: [...(p[activeJId] || []), nn] }; latest.current.n = nd; triggerSync(true); return nd; }); };
  const delNode = (id) => { setNodes(p => { const nd = { ...p, [activeJId]: (p[activeJId] || []).filter(n => n.id !== id) }; latest.current.n = nd; return nd; }); setEdges(p => { const ed = { ...p, [activeJId]: (p[activeJId] || []).filter(e => e.from !== id && e.to !== id) }; latest.current.e = ed; triggerSync(true); return ed; }); };
  const updateNode = (id, upd, force = false) => { setNodes(p => { const nd = { ...p, [activeJId]: (p[activeJId] || []).map(n => n.id === id ? { ...n, ...upd } : n) }; latest.current.n = nd; triggerSync(force); return nd; }); };

  const startLink = (e, id, port) => { e.stopPropagation(); e.preventDefault(); const lnk = { fromId: id, port }; setLinking(lnk); linkingRef.current = lnk; };
  const endLink = (tid) => {
    const lnk = linkingRef.current;
    if (lnk && lnk.fromId !== tid) {
      const ne = { id: `e-${Date.now()}`, from: lnk.fromId, to: tid, port: lnk.port };
      setEdges(p => { const ed = { ...p, [activeJId]: [...(p[activeJId] || []), ne] }; latest.current.e = ed; triggerSync(true); return ed; });
    }
    setLinking(null); linkingRef.current = null;
  };
  const delEdge = (eid) => { setEdges(p => { const ed = { ...p, [activeJId]: (p[activeJId] || []).filter(e => e.id !== eid) }; latest.current.e = ed; triggerSync(true); return ed; }); };

  const onCanvasMove = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + canvasRef.current.scrollLeft;
    const y = e.clientY - rect.top + canvasRef.current.scrollTop;
    setMousePos({ x, y });
    if (dragId) { isDraggingRef.current = true; setDragPos({ x, y }); }
  };

  const getPos = useCallback((node) => {
    if (dragId === node.id && dragPos) return { x: dragPos.x - dragOffset.x, y: dragPos.y - dragOffset.y };
    return { x: node.x, y: node.y };
  }, [dragId, dragPos, dragOffset]);

  // Node heights must match actual rendered size (header + body + padding)
  // Header: py-[6px]*2 + text = ~26px. Body: p-4 = 16px*2 + content.
  const getH = (n) => {
    if (n.type === 'trigger') return 82;   // header(26) + body(32+24)
    if (n.type === 'split') return 120;    // header(26) + body(32+22+10+30)
    if (n.type === 'delay') return 112;    // header(26) + body(32+22+10+22)
    if (n.type === 'action') return (n.previewLink?.trim()) ? 260 : 215; // textarea+url+maybe preview btn
    return 120;
  };
  const svgPath = (x1, y1, x2, y2) => { const c = Math.max(60, Math.abs(y2 - y1) / 2); return `M${x1},${y1} C${x1},${y1 + c} ${x2},${y2 - c} ${x2},${y2}`; };
  // True bezier midpoint at t=0.5
  const bezMid = (x1, y1, x2, y2) => {
    const c = Math.max(60, Math.abs(y2 - y1) / 2);
    const cp1y = y1 + c, cp2y = y2 - c;
    const t = 0.5, u = 1 - t;
    return {
      x: u*u*u*x1 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x2,
      y: u*u*u*y1 + 3*u*u*t*cp1y + 3*u*t*t*cp2y + t*t*t*y2
    };
  };

  const curNodes = nodes[activeJId] || [];
  const curEdges = edges[activeJId] || [];
  const activeJ = journeys.find(j => j.id === activeJId);
  const syncColor = { init: '#555', authing: '#F59E0B', ready: '#F59E0B', writing: '#F59E0B', synced: '#22C55E', error: '#EF4444' }[syncState] || '#555';
  const syncLabel = { init: 'Starting...', authing: 'Connecting...', ready: 'Connected', writing: 'Saving...', synced: 'Synced', error: 'Error' }[syncState] || syncState;

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-gray-100 overflow-hidden select-none" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif' }} onMouseMove={onCanvasMove}>

      {/* SIDEBAR */}
      <aside className="w-56 bg-[#0f0f0f] border-r border-white/[0.04] flex flex-col shrink-0 z-50">
        <div className="px-4 pt-5 pb-3 border-b border-white/[0.04]">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">Cottonworld</span>
            <button onClick={addJourney} className="p-0.5 text-white/20 hover:text-white/60 transition-colors"><Plus size={13} strokeWidth={1.5}/></button>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: syncColor, animation: syncState === 'writing' || syncState === 'authing' ? 'pulse 1.5s infinite' : 'none' }} />
            <span className="text-[8px] font-medium uppercase tracking-wider text-white/25">{syncLabel}</span>
            {lastSyncTime && syncState === 'synced' && <span className="text-[8px] text-white/15 ml-auto">{lastSyncTime.toLocaleTimeString()}</span>}
          </div>
          {syncError && (
            <div className="mt-2 p-2 bg-red-500/8 border border-red-500/15 rounded-lg">
              <p className="text-[8px] text-red-400/80 leading-relaxed">{syncError}</p>
              {user && <button onClick={() => { setSyncError(null); setSyncState('writing'); writeToFirebase(latest.current); }} className="mt-1 text-[8px] text-red-300/60 underline">Retry</button>}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2" style={{ scrollbarWidth: 'none' }}>
          {journeys.map(j => (
            <div key={j.id} draggable
              onDragStart={() => setSidebarDragId(j.id)} onDragOver={e => { e.preventDefault(); setSidebarOverId(j.id); }}
              onDragEnd={() => {
                if (sidebarDragId && sidebarOverId && sidebarDragId !== sidebarOverId) {
                  const fi = journeys.findIndex(x => x.id === sidebarDragId), ti = journeys.findIndex(x => x.id === sidebarOverId);
                  if (fi !== -1 && ti !== -1) { const r = [...journeys]; const [m] = r.splice(fi, 1); r.splice(ti, 0, m); setJourneys(r); latest.current.j = r; triggerSync(true); }
                }
                setSidebarDragId(null); setSidebarOverId(null);
              }}
              onClick={() => setActiveJId(j.id)}
              className={`w-full text-left px-3 py-[7px] rounded-md text-[11px] transition-all flex items-center justify-between group cursor-grab active:cursor-grabbing mb-px ${
                sidebarDragId === j.id ? 'opacity-30' : sidebarOverId === j.id && sidebarDragId ? 'border-t border-blue-500/30' : ''
              } ${activeJId === j.id ? 'bg-white/[0.06] text-white/80 font-medium' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.02]'}`}>
              <span className="truncate flex-1">{j.title}</span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={e => e.stopPropagation()}>
                <button onClick={e => dupJourney(j.id, e)} className="p-0.5 text-white/20 hover:text-white/60"><Copy size={9}/></button>
                <button onClick={e => delJourney(j.id, e)} className="p-0.5 text-white/20 hover:text-red-400/60"><Trash2 size={9}/></button>
              </div>
            </div>
          ))}
        </div>

        {/* Hidden admin — trident Ψ in the corner, tap 3 times to reveal */}
        <div className="px-3 py-2 flex items-center justify-between">
          {/* Admin controls — only visible when unlocked */}
          {isAdmin && (
            <div className="flex gap-1 flex-1 mr-2">
              <button onClick={handleSaveMaster} className="flex-1 py-1.5 rounded-md bg-emerald-500/8 text-emerald-400/60 hover:text-emerald-400 text-[8px] font-medium flex items-center justify-center gap-1 transition-colors"><Save size={9}/> Save Master</button>
              <button onClick={handleResetFlow} className="flex-1 py-1.5 rounded-md bg-red-500/8 text-red-400/60 hover:text-red-400 text-[8px] font-medium flex items-center justify-center gap-1 transition-colors"><RefreshCw size={9}/> Reset</button>
            </div>
          )}

          {/* Login field — appears after 3 trident taps */}
          {showAuthInput && !isAdmin && (
            <div className="flex gap-1 flex-1 mr-2">
              <input type="password" placeholder="anaklusmos" className="flex-1 bg-white/[0.03] border border-white/[0.04] rounded-md px-2 py-1.5 text-[10px] text-white outline-none focus:border-white/10 placeholder-white/10" value={authInput} onChange={e => setAuthInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && authInput === '1123581321') { setIsAdmin(true); setShowAuthInput(false); setAuthInput(''); }
                  if (e.key === 'Escape') { setShowAuthInput(false); setAuthInput(''); }
                }}
                autoFocus
              />
            </div>
          )}

          {/* The trident — nearly invisible, bottom-right corner */}
          <button
            onClick={() => {
              if (isAdmin) { setIsAdmin(false); return; }
              tridentTaps.current++;
              clearTimeout(tridentTimer.current);
              tridentTimer.current = setTimeout(() => { tridentTaps.current = 0; }, 800);
              if (tridentTaps.current >= 3) {
                tridentTaps.current = 0;
                setShowAuthInput(true);
              }
            }}
            className={`text-[11px] ml-auto transition-all duration-300 select-none ${isAdmin ? 'text-white/20 hover:text-white/40' : 'text-white/[0.04] hover:text-white/[0.06]'}`}
            title=""
            style={{ cursor: 'default', lineHeight: 1 }}
          >
            Ψ
          </button>
        </div>
      </aside>

      {/* CANVAS */}
      <main className="flex-1 relative overflow-hidden bg-[#0a0a0a]" ref={canvasRef}>
        <header className="absolute top-0 left-0 right-0 px-8 pt-7 flex justify-between items-start z-40 pointer-events-none">
          <div className="pointer-events-auto">
            {isAdmin ? (
              <>
                <input className="text-xl font-medium text-white/80 tracking-tight bg-transparent outline-none w-full border-b border-transparent focus:border-white/10 transition-colors"
                  value={activeJ?.title || ''} placeholder="Journey title..."
                  onFocus={() => { isTypingRef.current = true; }}
                  onChange={e => updateJourney(activeJId, { title: e.target.value })}
                  onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                />
                <input className="text-white/20 mt-0.5 text-[11px] bg-transparent outline-none w-full border-b border-transparent focus:border-white/10 transition-colors"
                  value={activeJ?.desc || ''} placeholder="Description..."
                  onFocus={() => { isTypingRef.current = true; }}
                  onChange={e => updateJourney(activeJId, { desc: e.target.value })}
                  onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                />
              </>
            ) : (
              <>
                <h1 className="text-xl font-medium text-white/80 tracking-tight">{activeJ?.title}</h1>
                <p className="text-white/20 mt-0.5 text-[11px]">{activeJ?.desc}</p>
              </>
            )}
          </div>

          {/* TOOLBAR — clean, labeled */}
          <div className="flex gap-px pointer-events-auto bg-white/[0.03] p-[3px] rounded-lg border border-white/[0.04]">
            <TBtn icon={<TriggerIcon size={13}/>} label="Trigger" onClick={() => addNode('trigger')} />
            <TBtn icon={<WhatsAppIcon size={13}/>} label="WhatsApp" onClick={() => addNode('action', 'WhatsApp')} />
            <TBtn icon={<VoiceIcon size={13}/>} label="Voice" onClick={() => addNode('action', 'Voice Bot')} />
            <TBtn icon={<EmailIcon size={13}/>} label="Email" onClick={() => addNode('action', 'Email')} />
            <TBtn icon={<SMSIcon size={13}/>} label="SMS" onClick={() => addNode('action', 'SMS')} />
            <TBtn icon={<RCSIcon size={13}/>} label="RCS" onClick={() => addNode('action', 'RCS')} />
            <TBtn icon={<DelayIcon size={13}/>} label="Wait" onClick={() => addNode('delay')} />
            <TBtn icon={<SplitIcon size={13}/>} label="Split" onClick={() => addNode('split')} />
          </div>
        </header>

        <div className="w-full h-full relative overflow-auto" style={{ backgroundImage: 'radial-gradient(#151515 1px, transparent 1px)', backgroundSize: '32px 32px', scrollbarWidth: 'none' }}>
          <svg className="absolute inset-0 pointer-events-none z-0" style={{ width: 5000, height: 5000 }}>
            {curEdges.map(e => {
              const fN = curNodes.find(n => n.id === e.from), tN = curNodes.find(n => n.id === e.to);
              if (!fN || !tN) return null;
              const fp = getPos(fN), tp = getPos(tN);
              const off = e.port === 'true' ? -40 : e.port === 'false' ? 40 : 0;
              const x1 = fp.x + 140 + off, y1 = fp.y + getH(fN), x2 = tp.x + 140, y2 = tp.y;
              const col = e.port === 'true' ? '#22C55E' : e.port === 'false' ? '#EF4444' : '#666';
              const mid = bezMid(x1, y1, x2, y2);
              const isHovered = hoveredEdge === e.id;
              return (
                <g key={e.id}>
                  {/* Visible line */}
                  <path d={svgPath(x1, y1, x2, y2)} stroke={col} strokeWidth={isHovered ? "2.5" : "2"} fill="none" opacity={isHovered ? "0.8" : "0.5"} style={{ transition: 'opacity 0.15s, stroke-width 0.15s' }} />
                  {/* Wide invisible hover target — disabled during linking */}
                  {!linking && <path d={svgPath(x1, y1, x2, y2)} stroke="transparent" strokeWidth="24" fill="none" className="pointer-events-auto" style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredEdge(e.id)} onMouseLeave={() => setHoveredEdge(null)} />}
                  {/* Delete button — only visible on hover */}
                  {isHovered && !linking && (
                    <g className="pointer-events-auto" style={{ cursor: 'pointer' }}
                      onPointerDown={ev => { ev.stopPropagation(); delEdge(e.id); setHoveredEdge(null); }}
                      onMouseEnter={() => setHoveredEdge(e.id)}>
                      <circle cx={mid.x} cy={mid.y} r="22" fill="transparent" />
                      <circle cx={mid.x} cy={mid.y} r="10" fill="#151515" stroke="#555" strokeWidth="1" />
                      <line x1={mid.x - 3} y1={mid.y - 3} x2={mid.x + 3} y2={mid.y + 3} stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
                      <line x1={mid.x + 3} y1={mid.y - 3} x2={mid.x - 3} y2={mid.y + 3} stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
                    </g>
                  )}
                </g>
              );
            })}
            {linking && (() => {
              const fn = curNodes.find(n => n.id === linking.fromId); if (!fn) return null;
              const fp = getPos(fn); const off = linking.port === 'true' ? -40 : linking.port === 'false' ? 40 : 0;
              return <path d={svgPath(fp.x + 140 + off, fp.y + getH(fn), mousePos.x, mousePos.y)} stroke="#3B82F6" strokeWidth="2" strokeDasharray="4,3" fill="none" opacity="0.6" />;
            })()}
          </svg>

          {/* NODES */}
          {curNodes.map(n => {
            const pos = getPos(n);
            const isLinkTarget = linking && linking.fromId !== n.id;
            return (
              <div key={n.id} className="absolute z-20" style={{ left: pos.x, top: pos.y, willChange: dragId === n.id ? 'transform' : 'auto' }}
                onMouseUp={() => { if (isLinkTarget) endLink(n.id); }}>
                {/* Expanded invisible hit area during linking */}
                {isLinkTarget && <div className="absolute -inset-4 z-30" onMouseUp={() => endLink(n.id)} />}
                <div onMouseUp={() => endLink(n.id)}
                  className={`w-[280px] rounded-xl border transition-colors duration-150 ${
                    dragId === n.id ? 'border-white/[0.08] z-50' : linking && linking.fromId !== n.id ? 'border-blue-500/20 z-40' : 'border-white/[0.04] hover:border-white/[0.06] z-20'
                  }`}
                  style={{ background: '#121212', boxShadow: '0 1px 12px rgba(0,0,0,0.5)' }}>

                  {/* Header */}
                  <div onMouseDown={e => { const r = e.currentTarget.closest('div.absolute').getBoundingClientRect(); setDragOffset({ x: e.clientX - r.left, y: e.clientY - r.top }); setDragId(n.id); }}
                    className="px-4 py-[6px] border-b border-white/[0.03] flex justify-between items-center cursor-grab active:cursor-grabbing rounded-t-xl">
                    <span className="text-[8px] font-medium uppercase tracking-[0.15em] text-white/20">{n.channel || n.type}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100" onMouseDown={e => e.stopPropagation()}>
                      <button onClick={() => dupNode(n.id)} className="p-0.5 text-white/15 hover:text-white/40 transition-colors"><Copy size={9} strokeWidth={1.5}/></button>
                      <button onClick={() => delNode(n.id)} className="p-0.5 text-white/15 hover:text-red-400/50 transition-colors"><Trash2 size={9} strokeWidth={1.5}/></button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-4 space-y-2.5 group" onMouseDown={e => e.stopPropagation()}>
                    <input className="bg-transparent text-[13px] font-medium outline-none w-full text-white/80 placeholder-white/15" value={n.label || n.title || ''}
                      onFocus={() => { isTypingRef.current = true; }} onChange={e => updateNode(n.id, { label: e.target.value, title: e.target.value })} onBlur={() => { isTypingRef.current = false; triggerSync(true); }} />
                    {n.type === 'action' && (
                      <>
                        <textarea className="w-full bg-white/[0.02] p-2.5 rounded-lg text-[11px] h-14 outline-none resize-none text-white/30 border border-white/[0.03] focus:border-white/[0.06] transition-colors placeholder-white/10" value={n.content || ''} placeholder="Message content..."
                          onFocus={() => { isTypingRef.current = true; }} onChange={e => updateNode(n.id, { content: e.target.value })} onBlur={() => { isTypingRef.current = false; triggerSync(true); }} />
                        <div>
                          <div className="text-[7px] uppercase tracking-[0.15em] text-white/15 mb-1">Preview URL</div>
                          <div className="flex items-center bg-white/[0.02] border border-white/[0.03] rounded-lg overflow-hidden focus-within:border-white/[0.06] transition-colors">
                            <div className="pl-2 text-white/15"><LinkIcon size={8} strokeWidth={1.5}/></div>
                            <input className="flex-1 bg-transparent p-2 text-[10px] text-white/30 outline-none placeholder-white/10" placeholder="Paste link..." value={n.previewLink || ''}
                              onFocus={() => { isTypingRef.current = true; }} onChange={e => updateNode(n.id, { previewLink: e.target.value })} onBlur={() => { isTypingRef.current = false; triggerSync(true); }} />
                          </div>
                          {n.previewLink?.trim() && <a href={n.previewLink.startsWith('http') ? n.previewLink : `https://${n.previewLink}`} target="_blank" rel="noopener noreferrer" className="mt-1.5 block w-full bg-white/[0.03] hover:bg-white/[0.06] text-white/25 hover:text-white/50 py-1.5 rounded-lg text-[8px] font-medium text-center transition-all">Preview ↗</a>}
                        </div>
                      </>
                    )}
                    {n.type === 'split' && <input className="w-full bg-white/[0.02] p-2 rounded-lg text-[10px] text-white/30 outline-none border border-white/[0.03] focus:border-white/[0.06] placeholder-white/10" placeholder="Condition..." value={n.condition || ''}
                      onFocus={() => { isTypingRef.current = true; }} onChange={e => updateNode(n.id, { condition: e.target.value })} onBlur={() => { isTypingRef.current = false; triggerSync(true); }} />}
                    {n.type === 'delay' && (
                      <div className="flex gap-2">
                        <input type="number" className="w-1/2 bg-white/[0.02] p-2 rounded-lg text-xs text-white/60 border border-white/[0.03] outline-none focus:border-white/[0.06]" value={n.value || ''}
                          onFocus={() => { isTypingRef.current = true; }} onChange={e => updateNode(n.id, { value: e.target.value })} onBlur={() => { isTypingRef.current = false; triggerSync(true); }} />
                        <select className="w-1/2 bg-white/[0.02] p-2 rounded-lg text-[10px] text-white/30 border border-white/[0.03] outline-none cursor-pointer" value={n.unit || 'Hours'}
                          onChange={e => updateNode(n.id, { unit: e.target.value }, true)}>
                          <option>Minutes</option><option>Hours</option><option>Days</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Port */}
                  <div className="absolute -bottom-2 left-0 w-full flex justify-center z-30 pointer-events-none">
                    <div className="pointer-events-auto relative group flex items-center justify-center bg-[#181818] border border-white/[0.05] rounded-full h-[18px] hover:h-5 hover:px-0.5 transition-all cursor-pointer">
                      {n.type === 'split' ? (
                        <>
                          <div className="w-4 h-full flex items-center justify-center text-white/20 group-hover:hidden"><Plus size={10} strokeWidth={1.5}/></div>
                          <div className="hidden group-hover:flex gap-0.5">
                            <button onMouseDown={e => startLink(e, n.id, 'true')} className="w-3.5 h-3.5 rounded-full bg-green-500/10 text-green-400/60 hover:bg-green-500 hover:text-white flex items-center justify-center transition-all"><Check size={8} strokeWidth={3}/></button>
                            <button onMouseDown={e => startLink(e, n.id, 'false')} className="w-3.5 h-3.5 rounded-full bg-red-500/10 text-red-400/60 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all"><X size={8} strokeWidth={3}/></button>
                          </div>
                        </>
                      ) : (
                        <button onMouseDown={e => startLink(e, n.id, 'default')} className="w-4 h-full flex items-center justify-center text-white/20 hover:text-blue-400/60 transition-colors"><Plus size={10} strokeWidth={1.5}/></button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </div>
  );
}

// Toolbar button with tooltip
const TBtn = ({ icon, label, onClick }) => (
  <div className="relative group">
    <button onClick={onClick} className="p-[7px] text-white/20 hover:text-white/60 hover:bg-white/[0.04] rounded-md transition-all active:scale-95">{icon}</button>
    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 bg-[#222] text-[8px] text-white/60 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">{label}</div>
  </div>
);