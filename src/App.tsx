import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare, Phone, Clock, Zap, Trash2, GitBranch,
  Smartphone, Plus, Check, X, Link as LinkIcon, Lock, Unlock, Save, RefreshCw, Copy, AlertTriangle, Loader2, Wifi, WifiOff
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';

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
const db = getFirestore(app);
const APP_ID = 'cottonworld-unified-sync-final-v3';
const LS_KEY = 'cw_cache_v4';
const LS_TAB = 'cw_active_journey';

function docRef(sub) { return doc(db, 'artifacts', APP_ID, 'public', 'data', 'dashboardState', sub); }
function loadCache() { try { const d = JSON.parse(localStorage.getItem(LS_KEY)); return d?.j ? d : null; } catch { return null; } }
function saveCache(j, n, e) { try { localStorage.setItem(LS_KEY, JSON.stringify({ j, n, e, t: Date.now() })); } catch {} }

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
  // --- AUTH & SYNC STATE ---
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [syncState, setSyncState] = useState('init'); // init | authing | ready | writing | synced | error | offline
  const [syncError, setSyncError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuthInput, setShowAuthInput] = useState(false);
  const [authInput, setAuthInput] = useState('');

  // --- DATA ---
  const cache = useRef(loadCache());
  const [journeys, setJourneys] = useState(cache.current?.j || INIT_J);
  const [nodes, setNodes] = useState(cache.current?.n || INIT_N);
  const [edges, setEdges] = useState(cache.current?.e || INIT_E);
  const [activeJId, setActiveJId] = useState(() => localStorage.getItem(LS_TAB) || 'j1');

  const latest = useRef({ j: journeys, n: nodes, e: edges });

  // --- DRAG STATE (lightweight — only x,y update per frame, not entire node tree) ---
  const canvasRef = useRef(null);
  const [dragId, setDragId] = useState(null);
  const [dragPos, setDragPos] = useState(null); // {x, y} — current mouse pos on canvas
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  // --- LINKING ---
  const [linking, setLinking] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // --- TYPING GUARD ---
  const isTypingRef = useRef(false);

  // --- SYNC ENGINE ---
  const isSyncing = useRef(false);
  const pendingSync = useRef(false);
  const lastWriteTime = useRef(0);
  const GUARD_MS = 2500;
  const dirtyRef = useRef(false); // true = local changes not yet confirmed by Firebase

  // Keep latest ref in sync
  useEffect(() => {
    latest.current = { j: journeys, n: nodes, e: edges };
    saveCache(journeys, nodes, edges);
  }, [journeys, nodes, edges]);

  useEffect(() => { localStorage.setItem(LS_TAB, activeJId); }, [activeJId]);

  // --- FIREBASE WRITE ---
  const writeToFirebase = useCallback(async (data) => {
    if (!user) {
      setSyncState('error');
      setSyncError('Not authenticated — cannot write to cloud');
      return;
    }
    if (isSyncing.current) { pendingSync.current = true; return; }
    isSyncing.current = true;
    setSyncState('writing');
    try {
      lastWriteTime.current = Date.now();
      await setDoc(docRef('current'), {
        journeysList: data.j, nodeData: data.n, edgeData: data.e,
        lastUpdated: new Date().toISOString()
      });
      dirtyRef.current = false;
      setSyncState('synced');
      setSyncError(null);
      setLastSyncTime(new Date());
    } catch (err) {
      console.error('Firebase write failed:', err);
      setSyncState('error');
      setSyncError(`Write failed: ${err.code || err.message}. Check Firestore rules allow writes.`);
      pendingSync.current = true; // retry
    } finally {
      isSyncing.current = false;
      if (pendingSync.current) {
        pendingSync.current = false;
        setTimeout(() => writeToFirebase(latest.current), 150);
      }
    }
  }, [user]);

  const debounceRef = useRef(null);
  const triggerSync = useCallback((force = false) => {
    saveCache(latest.current.j, latest.current.n, latest.current.e);
    if (!user) return;
    dirtyRef.current = true;
    if (force) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      writeToFirebase(latest.current);
    } else {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => writeToFirebase(latest.current), 150);
    }
  }, [user, writeToFirebase]);

  // --- AUTH ---
  useEffect(() => {
    setSyncState('authing');
    signInAnonymously(auth)
      .then(() => { setAuthError(null); })
      .catch((err) => {
        console.error('Auth failed:', err);
        setAuthError(`${err.code}: ${err.message}`);
        setSyncState('error');
        setSyncError(`Authentication failed: ${err.code}. Enable Anonymous Auth in Firebase Console → Authentication → Sign-in method → Anonymous.`);
      });
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u && !authError) setSyncState('ready');
    });
  }, []);

  // --- SNAPSHOT LISTENER ---
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(docRef('current'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        const isEcho = snap.metadata.hasPendingWrites;
        const isBusy = isDraggingRef.current || isTypingRef.current;
        const isRecent = (Date.now() - lastWriteTime.current) < GUARD_MS;
        if (!isEcho && !isBusy && !isRecent) {
          setJourneys(d.journeysList || INIT_J);
          setNodes(d.nodeData || INIT_N);
          setEdges(d.edgeData || INIT_E);
          latest.current = { j: d.journeysList || INIT_J, n: d.nodeData || INIT_N, e: d.edgeData || INIT_E };
          saveCache(latest.current.j, latest.current.n, latest.current.e);
        }
        if (!dirtyRef.current) setSyncState('synced');
      } else {
        writeToFirebase(latest.current);
      }
    }, (err) => {
      console.error('Snapshot error:', err);
      setSyncState('offline');
      setSyncError(`Listener: ${err.code}. Check Firestore rules.`);
    });
    return () => unsub();
  }, [user, writeToFirebase]);

  // --- UNLOAD PROTECTION ---
  useEffect(() => {
    const onUnload = (e) => {
      saveCache(latest.current.j, latest.current.n, latest.current.e);
      if (dirtyRef.current || isSyncing.current) {
        e.preventDefault();
        e.returnValue = 'Changes not synced to cloud yet. Leave anyway?';
        if (user) setDoc(docRef('current'), {
          journeysList: latest.current.j, nodeData: latest.current.n, edgeData: latest.current.e,
          lastUpdated: new Date().toISOString()
        }).catch(() => {});
        return e.returnValue;
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        saveCache(latest.current.j, latest.current.n, latest.current.e);
        if (user && dirtyRef.current) writeToFirebase(latest.current);
      }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('visibilitychange', onVis); };
  }, [user, writeToFirebase]);

  // --- GLOBAL MOUSE UP ---
  useEffect(() => {
    const up = () => {
      if (dragId) {
        // Commit drag position to node data
        if (dragPos) {
          const finalX = dragPos.x - dragOffset.x;
          const finalY = dragPos.y - dragOffset.y;
          setNodes(prev => {
            const nd = { ...prev, [activeJId]: (prev[activeJId] || []).map(n => n.id === dragId ? { ...n, x: finalX, y: finalY } : n) };
            latest.current.n = nd;
            return nd;
          });
          triggerSync(true);
        }
        isDraggingRef.current = false;
      }
      setDragId(null);
      setDragPos(null);
      setLinking(null);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [dragId, dragPos, dragOffset, activeJId, triggerSync]);

  // --- ADMIN ---
  const handleSaveMaster = async () => {
    if (!user || !isAdmin) return;
    try {
      await setDoc(docRef('master'), { journeysList: journeys, nodeData: nodes, edgeData: edges, lastUpdated: new Date().toISOString() });
      alert('Master template saved.');
    } catch (e) { alert('Save failed: ' + e.message); }
  };
  const handleResetFlow = async () => {
    if (!user || !isAdmin || !window.confirm('Overwrite current flow with Master?')) return;
    try {
      const snap = await getDoc(docRef('master'));
      const d = snap.exists() ? snap.data() : { journeysList: INIT_J, nodeData: INIT_N, edgeData: INIT_E };
      setJourneys(d.journeysList); setNodes(d.nodeData); setEdges(d.edgeData);
      latest.current = { j: d.journeysList, n: d.nodeData, e: d.edgeData };
      await writeToFirebase(latest.current);
    } catch (e) { alert('Reset failed: ' + e.message); }
  };

  // --- JOURNEY CRUD ---
  const dupJourney = (id, ev) => {
    ev.stopPropagation();
    const j = journeys.find(x => x.id === id);
    if (!j) return;
    const nid = `j-${Date.now()}`;
    const idMap = {};
    const nn = (nodes[id] || []).map(n => { const k = `nd-${Date.now()}-${Math.random().toString(36).slice(2,6)}`; idMap[n.id] = k; return { ...n, id: k }; });
    const ne = (edges[id] || []).map(e => ({ ...e, id: `e-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, from: idMap[e.from] || e.from, to: idMap[e.to] || e.to }));
    const newJ = [...journeys, { ...j, id: nid, title: j.title + ' (Copy)' }];
    setJourneys(newJ); setNodes(p => ({ ...p, [nid]: nn })); setEdges(p => ({ ...p, [nid]: ne }));
    latest.current = { j: newJ, n: { ...nodes, [nid]: nn }, e: { ...edges, [nid]: ne } };
    setActiveJId(nid);
    triggerSync(true);
  };
  const delJourney = (id, ev) => {
    ev.stopPropagation();
    const nl = journeys.filter(x => x.id !== id);
    setJourneys(nl); latest.current.j = nl;
    if (activeJId === id && nl.length) setActiveJId(nl[0].id);
    triggerSync(true);
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
  const dupNode = (nid) => {
    const orig = (nodes[activeJId] || []).find(n => n.id === nid);
    if (!orig) return;
    const nn = { ...orig, id: `nd-${Date.now()}`, x: orig.x + 30, y: orig.y + 30 };
    setNodes(prev => { const nd = { ...prev, [activeJId]: [...(prev[activeJId] || []), nn] }; latest.current.n = nd; triggerSync(true); return nd; });
  };
  const delNode = (id) => {
    setNodes(prev => { const nd = { ...prev, [activeJId]: (prev[activeJId] || []).filter(n => n.id !== id) }; latest.current.n = nd; return nd; });
    setEdges(prev => { const ed = { ...prev, [activeJId]: (prev[activeJId] || []).filter(e => e.from !== id && e.to !== id) }; latest.current.e = ed; triggerSync(true); return ed; });
  };
  const updateNode = (id, upd, force = false) => {
    setNodes(prev => { const nd = { ...prev, [activeJId]: (prev[activeJId] || []).map(n => n.id === id ? { ...n, ...upd } : n) }; latest.current.n = nd; triggerSync(force); return nd; });
  };

  // --- LINKING ---
  const startLink = (e, id, port) => { e.stopPropagation(); e.preventDefault(); setLinking({ fromId: id, port }); };
  const endLink = (targetId) => {
    if (linking && linking.fromId !== targetId) {
      const ne = { id: `e-${Date.now()}`, from: linking.fromId, to: targetId, port: linking.port };
      setEdges(prev => { const ed = { ...prev, [activeJId]: [...(prev[activeJId] || []), ne] }; latest.current.e = ed; triggerSync(true); return ed; });
    }
    setLinking(null);
  };
  const delEdge = (eid) => {
    setEdges(prev => { const ed = { ...prev, [activeJId]: (prev[activeJId] || []).filter(e => e.id !== eid) }; latest.current.e = ed; triggerSync(true); return ed; });
  };

  // --- CANVAS MOUSE ---
  const onCanvasMove = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + canvasRef.current.scrollLeft;
    const y = e.clientY - rect.top + canvasRef.current.scrollTop;
    setMousePos({ x, y });
    if (dragId) {
      isDraggingRef.current = true;
      setDragPos({ x, y }); // Only update lightweight {x,y}, NOT the entire node tree
    }
  };

  // --- POSITION HELPER: returns visual position accounting for active drag ---
  const getPos = useCallback((node) => {
    if (dragId === node.id && dragPos) {
      return { x: dragPos.x - dragOffset.x, y: dragPos.y - dragOffset.y };
    }
    return { x: node.x, y: node.y };
  }, [dragId, dragPos, dragOffset]);

  // --- GEOMETRY ---
  const getH = (n) => {
    if (n.type === 'trigger') return 90;
    if (n.type === 'split') return 140;
    if (n.type === 'delay') return 110;
    if (n.type === 'action') return (n.previewLink?.trim()) ? 240 : 180;
    return 140;
  };
  const path = (x1, y1, x2, y2) => {
    const c = Math.max(60, Math.abs(y2 - y1) / 2);
    return `M${x1},${y1} C${x1},${y1 + c} ${x2},${y2 - c} ${x2},${y2}`;
  };

  const curNodes = nodes[activeJId] || [];
  const curEdges = edges[activeJId] || [];
  const activeJ = journeys.find(j => j.id === activeJId);

  // --- SYNC STATUS ---
  const syncColor = { init: '#666', authing: '#F59E0B', ready: '#F59E0B', writing: '#F59E0B', synced: '#22C55E', error: '#EF4444', offline: '#EF4444' }[syncState];
  const syncLabel = { init: 'Starting...', authing: 'Authenticating...', ready: 'Connected', writing: 'Saving...', synced: 'Synced', error: 'Error', offline: 'Offline' }[syncState];
  const isPulsing = syncState === 'writing' || syncState === 'authing';

  return (
    <div className="flex h-screen bg-[#0B0B0B] text-gray-100 font-sans overflow-hidden select-none" onMouseMove={onCanvasMove}>

      {/* SIDEBAR */}
      <aside className="w-60 bg-[#111] border-r border-white/[0.05] flex flex-col shrink-0 z-50">
        <div className="px-5 pt-5 pb-3 border-b border-white/[0.05]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/60">Cottonworld</span>
            <button onClick={() => addNode('trigger')} className="p-0.5 text-gray-600 hover:text-white transition-colors"><Plus size={14} /></button>
          </div>

          {/* SYNC STATUS */}
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full`} style={{ backgroundColor: syncColor, animation: isPulsing ? 'pulse 1.5s infinite' : 'none' }} />
            <span className="text-[9px] font-medium uppercase tracking-wider text-gray-600">{syncLabel}</span>
            {lastSyncTime && syncState === 'synced' && (
              <span className="text-[8px] text-gray-700 ml-auto">{lastSyncTime.toLocaleTimeString()}</span>
            )}
          </div>

          {/* ERROR DISPLAY — IMPOSSIBLE TO MISS */}
          {(syncError || authError) && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-[9px] text-red-400 font-medium leading-relaxed">{syncError || authError}</p>
              {user && <button onClick={() => { setSyncError(null); writeToFirebase(latest.current); }} className="mt-1 text-[8px] text-red-300 underline">Retry Now</button>}
            </div>
          )}
        </div>

        {/* JOURNEY LIST */}
        <div className="flex-1 overflow-y-auto p-3 space-y-0.5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
          {journeys.map(j => (
            <div key={j.id} onClick={() => setActiveJId(j.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-medium transition-all flex items-center justify-between group cursor-pointer ${
                activeJId === j.id ? 'bg-white/[0.07] text-white' : 'text-gray-600 hover:text-gray-400 hover:bg-white/[0.03]'
              }`}>
              <span className="truncate flex-1">{j.title}</span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={e => dupJourney(j.id, e)} className="p-0.5 text-white/30 hover:text-white"><Copy size={10}/></button>
                <button onClick={e => delJourney(j.id, e)} className="p-0.5 text-white/30 hover:text-red-400"><Trash2 size={10}/></button>
              </div>
            </div>
          ))}
        </div>

        {/* ADMIN */}
        <div className="p-3 border-t border-white/[0.05]">
          {showAuthInput && !isAdmin && (
            <div className="mb-2 flex gap-1.5">
              <input type="password" placeholder="Passcode" className="flex-1 bg-black border border-white/10 rounded px-2 py-1.5 text-[10px] text-white outline-none focus:border-white/20" value={authInput} onChange={e => setAuthInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && authInput === 'admin2024' && (setIsAdmin(true), setShowAuthInput(false))} />
              <button onClick={() => { if (authInput === 'admin2024') { setIsAdmin(true); setShowAuthInput(false); }}} className="bg-white/10 px-2 py-1.5 rounded text-[9px] font-medium text-white hover:bg-white/20">Go</button>
            </div>
          )}
          <button onClick={() => setShowAuthInput(!showAuthInput)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[0.03] text-[9px] font-medium text-gray-600 hover:text-white transition-all">
            {isAdmin ? <Unlock size={12}/> : <Lock size={12}/>} {isAdmin ? 'Admin' : 'Admin Login'}
          </button>
          {isAdmin && (
            <div className="flex gap-1.5 mt-2">
              <button onClick={handleSaveMaster} className="flex-1 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-[9px] font-medium flex items-center justify-center gap-1"><Save size={10}/> Save Master</button>
              <button onClick={handleResetFlow} className="flex-1 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[9px] font-medium flex items-center justify-center gap-1"><RefreshCw size={10}/> Reset</button>
            </div>
          )}
        </div>
      </aside>

      {/* CANVAS */}
      <main className="flex-1 relative overflow-hidden bg-[#0B0B0B]" ref={canvasRef}>
        {/* HEADER */}
        <header className="absolute top-0 left-0 right-0 px-8 pt-6 pb-4 flex justify-between items-start z-40 pointer-events-none">
          <div className="pointer-events-auto">
            <h1 className="text-2xl font-semibold text-white/90 tracking-tight">{activeJ?.title}</h1>
            <p className="text-gray-600 mt-0.5 text-xs">{activeJ?.desc}</p>
          </div>
          <div className="flex gap-0.5 pointer-events-auto bg-[#161616] p-1 rounded-lg border border-white/[0.05]">
            <TB icon={<Zap size={13}/>} onClick={() => addNode('trigger')} />
            <TB icon={<MessageSquare size={13}/>} onClick={() => addNode('action', 'WhatsApp')} />
            <TB icon={<Phone size={13}/>} onClick={() => addNode('action', 'Voice Bot')} />
            <TB icon={<Smartphone size={13}/>} onClick={() => addNode('action', 'SMS')} />
            <TB icon={<Clock size={13}/>} onClick={() => addNode('delay')} />
            <TB icon={<GitBranch size={13}/>} onClick={() => addNode('split')} />
          </div>
        </header>

        {/* GRID */}
        <div className="w-full h-full relative overflow-auto" style={{ backgroundImage: 'radial-gradient(#181818 1px, transparent 1px)', backgroundSize: '40px 40px', scrollbarWidth: 'thin', scrollbarColor: '#222 transparent' }}>

          {/* SVG EDGES */}
          <svg className="absolute inset-0 pointer-events-none z-0" style={{ width: 5000, height: 5000 }}>
            {curEdges.map(e => {
              const fromNode = curNodes.find(n => n.id === e.from);
              const toNode = curNodes.find(n => n.id === e.to);
              if (!fromNode || !toNode) return null;

              const fp = getPos(fromNode);
              const tp = getPos(toNode);

              const off = e.port === 'true' ? -40 : e.port === 'false' ? 40 : 0;
              const x1 = fp.x + 140 + off, y1 = fp.y + getH(fromNode);
              const x2 = tp.x + 140, y2 = tp.y + 8;
              const col = e.port === 'true' ? '#32D74B' : e.port === 'false' ? '#FF453A' : '#333';

              // Midpoint for × button
              const c = Math.max(60, Math.abs(y2 - y1) / 2);
              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2 + (c * 0.15); // slight downward nudge from geometric center

              return (
                <g key={e.id} className="group">
                  <path d={path(x1, y1, x2, y2)} stroke={col} strokeWidth="1.5" fill="none" opacity="0.25" className="group-hover:opacity-50 transition-all duration-150" />
                  <path d={path(x1, y1, x2, y2)} stroke="transparent" strokeWidth="18" fill="none" className="pointer-events-auto cursor-pointer" />
                  <g className="pointer-events-auto cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    onPointerDown={ev => { ev.stopPropagation(); delEdge(e.id); }}>
                    <circle cx={mx} cy={my} r="20" fill="transparent" />
                    <circle cx={mx} cy={my} r="9" fill="#111" stroke="#444" strokeWidth="1" className="hover:stroke-red-500 transition-colors" />
                    <text x={mx} y={my + 3.5} textAnchor="middle" fontSize="11" fill="#666" className="pointer-events-none">×</text>
                  </g>
                </g>
              );
            })}
            {linking && (() => {
              const fn = curNodes.find(n => n.id === linking.fromId);
              if (!fn) return null;
              const fp = getPos(fn);
              const off = linking.port === 'true' ? -40 : linking.port === 'false' ? 40 : 0;
              return <path d={path(fp.x + 140 + off, fp.y + getH(fn), mousePos.x, mousePos.y)} stroke="#0A84FF" strokeWidth="1.5" strokeDasharray="4,4" fill="none" opacity="0.4" />;
            })()}
          </svg>

          {/* NODES */}
          {curNodes.map(n => {
            const pos = getPos(n);
            return (
              <div key={n.id} className="absolute z-20" style={{ left: pos.x, top: pos.y, willChange: dragId === n.id ? 'transform' : 'auto' }}>
                <div onMouseUp={() => endLink(n.id)}
                  className={`w-[280px] bg-[#151515] rounded-xl border transition-colors duration-150 ${
                    dragId === n.id ? 'border-white/10 z-50' : linking && linking.fromId !== n.id ? 'border-blue-500/30 z-40' : 'border-white/[0.04] hover:border-white/[0.08] z-20'
                  }`}
                  style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.4)' }}>

                  {/* HEADER */}
                  <div onMouseDown={e => {
                    const rect = e.currentTarget.closest('div.absolute').getBoundingClientRect();
                    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    setDragId(n.id);
                  }} className="px-4 py-2 border-b border-white/[0.04] flex justify-between items-center cursor-grab active:cursor-grabbing rounded-t-xl">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-gray-600">{n.channel || n.type}</span>
                    <div className="flex gap-1" onMouseDown={e => e.stopPropagation()}>
                      <button onClick={() => dupNode(n.id)} className="p-0.5 text-gray-700 hover:text-white transition-colors"><Copy size={10}/></button>
                      <button onClick={() => delNode(n.id)} className="p-0.5 text-gray-700 hover:text-red-400 transition-colors"><Trash2 size={10}/></button>
                    </div>
                  </div>

                  {/* BODY */}
                  <div className="p-4 space-y-3" onMouseDown={e => e.stopPropagation()}>
                    <input className="bg-transparent text-sm font-medium outline-none w-full text-white/90 placeholder-gray-700" value={n.label || n.title || ''}
                      onFocus={() => { isTypingRef.current = true; }}
                      onChange={e => updateNode(n.id, { label: e.target.value, title: e.target.value })}
                      onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                    />
                    {n.type === 'action' && (
                      <>
                        <textarea className="w-full bg-white/[0.03] p-2.5 rounded-lg text-[11px] h-14 outline-none resize-none text-gray-500 border border-white/[0.04] focus:border-white/[0.08] transition-colors" value={n.content || ''} placeholder="Message content..."
                          onFocus={() => { isTypingRef.current = true; }}
                          onChange={e => updateNode(n.id, { content: e.target.value })}
                          onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                        />
                        <div>
                          <div className="text-[8px] font-medium uppercase tracking-wider text-gray-700 mb-1">Preview URL</div>
                          <div className="flex items-center bg-white/[0.03] border border-white/[0.04] rounded-lg overflow-hidden focus-within:border-white/[0.08] transition-colors">
                            <div className="pl-2 text-gray-700"><LinkIcon size={9}/></div>
                            <input className="flex-1 bg-transparent p-2 text-[10px] text-gray-400 outline-none placeholder-gray-700" placeholder="Paste link..." value={n.previewLink || ''}
                              onFocus={() => { isTypingRef.current = true; }}
                              onChange={e => updateNode(n.id, { previewLink: e.target.value })}
                              onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                            />
                          </div>
                          {n.previewLink?.trim() && (
                            <a href={n.previewLink.startsWith('http') ? n.previewLink : `https://${n.previewLink}`} target="_blank" rel="noopener noreferrer" className="mt-1.5 block w-full bg-white/[0.05] hover:bg-white/[0.08] text-gray-500 hover:text-white py-1.5 rounded-lg text-[9px] font-medium text-center transition-all">Preview ↗</a>
                          )}
                        </div>
                      </>
                    )}
                    {n.type === 'split' && (
                      <input className="w-full bg-white/[0.03] p-2 rounded-lg text-[10px] text-gray-500 outline-none border border-white/[0.04] focus:border-white/[0.08]" placeholder="Condition..." value={n.condition || ''}
                        onFocus={() => { isTypingRef.current = true; }}
                        onChange={e => updateNode(n.id, { condition: e.target.value })}
                        onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                      />
                    )}
                    {n.type === 'delay' && (
                      <div className="flex gap-2">
                        <input type="number" className="w-1/2 bg-white/[0.03] p-2 rounded-lg text-xs text-white border border-white/[0.04] outline-none focus:border-white/[0.08]" value={n.value || ''}
                          onFocus={() => { isTypingRef.current = true; }}
                          onChange={e => updateNode(n.id, { value: e.target.value })}
                          onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                        />
                        <select className="w-1/2 bg-white/[0.03] p-2 rounded-lg text-[10px] text-gray-500 border border-white/[0.04] outline-none cursor-pointer" value={n.unit || 'Hours'}
                          onChange={e => updateNode(n.id, { unit: e.target.value }, true)}>
                          <option>Minutes</option><option>Hours</option><option>Days</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* PORT */}
                  <div className="absolute -bottom-2 left-0 w-full flex justify-center z-30 pointer-events-none">
                    <div className="pointer-events-auto relative group flex items-center justify-center bg-[#1a1a1a] border border-white/[0.06] rounded-full h-5 hover:h-6 hover:px-0.5 transition-all cursor-pointer">
                      {n.type === 'split' ? (
                        <>
                          <div className="w-5 h-full flex items-center justify-center text-gray-600 group-hover:hidden"><Plus size={12} strokeWidth={2}/></div>
                          <div className="hidden group-hover:flex gap-0.5">
                            <button onMouseDown={e => startLink(e, n.id, 'true')} className="w-4 h-4 rounded-full bg-green-500/15 text-green-400 hover:bg-green-500 hover:text-white flex items-center justify-center transition-all"><Check size={10} strokeWidth={3}/></button>
                            <button onMouseDown={e => startLink(e, n.id, 'false')} className="w-4 h-4 rounded-full bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all"><X size={10} strokeWidth={3}/></button>
                          </div>
                        </>
                      ) : (
                        <button onMouseDown={e => startLink(e, n.id, 'default')} className="w-5 h-full flex items-center justify-center text-gray-600 hover:text-blue-400 transition-colors"><Plus size={12} strokeWidth={2}/></button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

const TB = ({ icon, onClick }) => (
  <button onClick={onClick} className="p-2 text-gray-600 hover:text-white hover:bg-white/[0.06] rounded-md transition-all active:scale-95">{icon}</button>
);