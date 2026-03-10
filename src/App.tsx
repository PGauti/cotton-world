import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  MessageSquare, Phone, Clock, Zap, Trash2, GitBranch, 
  Smartphone, Plus, Check, X, Link as LinkIcon, Lock, Unlock, Save, RefreshCw, Copy, AlertTriangle, Loader2
} from 'lucide-react';

// --- 1. FIREBASE CONNECTION ---
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

const appId = 'cottonworld-unified-sync-final-v3';

// --- LOCAL STORAGE: CRASH-RECOVERY SAFETY NET ONLY ---
const LS_KEY = 'cw_dashboard_cache_v3';
const LS_ACTIVE_TAB = 'cw_active_journey';

function loadCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && p.journeysList && p.nodeData && p.edgeData) return p;
    return null;
  } catch { return null; }
}

function saveCache(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      journeysList: data.journeysList,
      nodeData: data.nodeData,
      edgeData: data.edgeData,
      t: Date.now()
    }));
  } catch {}
}

// --- 2. INITIAL DATA ---
const INITIAL_JOURNEYS = [
  { id: 'j1', title: 'Cart Abandonment', desc: 'WhatsApp/RCS + Voice Bot escalation.' },
  { id: 'j2', title: 'COD Verification', desc: 'Automated RTO reduction.' },
  { id: 'j3', title: 'Welcome Series', desc: 'New subscriber onboarding.' },
  { id: 'j4', title: 'Post-Purchase Review', desc: 'NPS collection 7 days post-delivery.' },
  { id: 'j5', title: 'Browse Abandonment', desc: 'Retargeting high-interest browsers.' },
  { id: 'j6', title: 'Win-back Campaign', desc: '90-day inactive segment recovery.' }
];

const INITIAL_NODES = {
  'j1': [
    { id: 'n1', type: 'trigger', x: 250, y: 80, label: 'Checkout Abandoned' },
    { id: 'n2', type: 'action', channel: 'WhatsApp', x: 250, y: 240, title: 'Main Nudge', content: 'Hi {{name}}, your cart is waiting!', previewLink: '' },
    { id: 'n3', type: 'split', x: 250, y: 560, condition: 'Did customer click link?' }
  ]
};

const INITIAL_EDGES = {
  'j1': [
    { id: 'e1', from: 'n1', to: 'n2', port: 'default' },
    { id: 'e2', from: 'n2', to: 'n3', port: 'default' }
  ]
};

// Firestore doc helper
function getDocRef(subPath) {
  return doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', subPath);
}

// --- 3. MAIN APPLICATION ---
export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('CONNECTING...');
  const [connectionError, setConnectionError] = useState(null);
  const [debugLog, setDebugLog] = useState([]);
  const [showDebug, setShowDebug] = useState(false);

  // =============================================
  // PERSISTENCE ARCHITECTURE:
  // 
  // PHASE 1 (instant): Load from localStorage cache so UI isn't blank
  // PHASE 2 (1-3s):    Firebase connects → cloud data REPLACES local
  //                     From this point, Firebase is the AUTHORITY
  // ONGOING:           Every edit saves to BOTH Firebase + localStorage
  //                     localStorage is just a crash-recovery net
  // FAILOVER:          If Firebase never connects after 8s, localStorage
  //                     data stays and user can still work offline
  // =============================================

  const cached = loadCache();
  const [journeysList, setJourneysList] = useState(cached?.journeysList || INITIAL_JOURNEYS);
  const [activeJId, setActiveJId] = useState(() => localStorage.getItem(LS_ACTIVE_TAB) || 'j1');
  const [nodeData, setNodeData] = useState(cached?.nodeData || INITIAL_NODES);
  const [edgeData, setEdgeData] = useState(cached?.edgeData || INITIAL_EDGES);

  // Has Firebase delivered at least one snapshot? Once true, Firebase is authority.
  const cloudHydrated = useRef(false);
  // Is the user currently interacting? (prevents cloud from stomping mid-edit)
  const isDraggingRef = useRef(false);
  const isTypingRef = useRef(false);

  const latestDataRef = useRef({
    journeysList: cached?.journeysList || INITIAL_JOURNEYS,
    nodeData: cached?.nodeData || INITIAL_NODES,
    edgeData: cached?.edgeData || INITIAL_EDGES
  });

  const canvasRef = useRef(null);
  const [dragNode, setDragNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [linking, setLinking] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const debounceTimer = useRef(null);
  const isSyncingRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const lastLocalWriteTime = useRef(0);
  const SNAPSHOT_GUARD_MS = 3000;

  // --- UNSYNCED CHANGES TRACKER ---
  // Ref for beforeunload (needs synchronous access), state for UI indicator
  const unsyncedRef = useRef(false);
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);
  const markUnsynced = () => { unsyncedRef.current = true; setHasUnsyncedChanges(true); };
  const markSynced = () => { unsyncedRef.current = false; setHasUnsyncedChanges(false); };

  const [showAuthInput, setShowAuthInput] = useState(false);
  const [authInput, setAuthInput] = useState('');

  // --- LOGGER ---
  const log = useCallback((msg) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log('[CW]', entry);
    setDebugLog(prev => [...prev.slice(-50), entry]);
  }, []);

  // --- MIRROR REF + CACHE ON EVERY CHANGE ---
  useEffect(() => {
    latestDataRef.current = { journeysList, nodeData, edgeData };
    // Always keep localStorage in sync as a safety net
    saveCache(latestDataRef.current);
  }, [journeysList, nodeData, edgeData]);

  // =============================================
  // FIREBASE WRITE ENGINE
  // - Queues retries if a write is in progress
  // - Stamps lastLocalWriteTime to guard against snapshot echo
  // =============================================
  const writeToFirebase = useCallback(async (data) => {
    if (!user) { log('Write skipped: no auth user'); return; }
    if (isSyncingRef.current) {
      pendingSyncRef.current = true;
      return;
    }
    isSyncingRef.current = true;
    try {
      lastLocalWriteTime.current = Date.now();
      await setDoc(getDocRef('current'), {
        journeysList: data.journeysList,
        nodeData: data.nodeData,
        edgeData: data.edgeData,
        lastUpdated: new Date().toISOString()
      });
      setCloudStatus('LIVE SYNC');
      setConnectionError(null);
      markSynced();
      log('✓ Firebase write OK');
    } catch (err) {
      console.error('Firebase write error:', err);
      const msg = err.code || err.message || 'unknown';
      setCloudStatus('SYNC ERROR');
      setConnectionError(`Write failed: ${msg}`);
      log(`✗ Firebase write FAILED: ${msg}`);
      // Retry on failure
      pendingSyncRef.current = true;
    } finally {
      isSyncingRef.current = false;
      if (pendingSyncRef.current) {
        pendingSyncRef.current = false;
        setTimeout(() => writeToFirebase(latestDataRef.current), 200);
      }
    }
  }, [user, log]);

  const triggerSync = useCallback((force = false) => {
    // Always update the cache immediately
    saveCache(latestDataRef.current);
    if (!user) return; // Can't sync without auth — don't mark unsynced
    // Mark as unsynced until Firebase confirms
    markUnsynced();
    if (force) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      writeToFirebase(latestDataRef.current);
    } else {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => writeToFirebase(latestDataRef.current), 150);
    }
  }, [user, writeToFirebase]);

  // --- AUTH ---
  useEffect(() => {
    log(cached ? 'Cache loaded from localStorage (temporary until cloud arrives)' : 'No cache, using defaults');
    signInAnonymously(auth)
      .then(() => log('✓ Anonymous auth success'))
      .catch((err) => {
        log(`✗ Auth FAILED: ${err.code}`);
        setCloudStatus('AUTH ERROR');
        setConnectionError(`Auth failed: ${err.code}. Working offline from cache.`);
      });
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) log(`Auth ready: ${u.uid.substring(0,8)}...`);
    });
    return () => unsub();
  }, []);

  useEffect(() => { localStorage.setItem(LS_ACTIVE_TAB, activeJId); }, [activeJId]);

  // =============================================
  // FIREBASE SNAPSHOT LISTENER (THE AUTHORITY)
  //
  // Once Firebase delivers its first snapshot, cloud becomes
  // the single source of truth. All remote edits from clients
  // flow in through here.
  //
  // Guards:
  //  1. hasPendingWrites → our own echo, skip
  //  2. isTyping/isDragging → user mid-interaction, skip
  //  3. lastLocalWriteTime → recently wrote, skip echo
  // =============================================
  useEffect(() => {
    if (!user) return;
    log('Attaching snapshot listener...');
    const docRef = getDocRef('current');

    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const isEcho = snap.metadata.hasPendingWrites;
        const isBusy = isDraggingRef.current || isTypingRef.current;
        const isRecent = (Date.now() - lastLocalWriteTime.current) < SNAPSHOT_GUARD_MS;

        if (isEcho) {
          log('Snapshot: own echo, skip');
        } else if (isBusy) {
          log('Snapshot: user busy, skip');
        } else if (isRecent) {
          log('Snapshot: recent write guard, skip');
        } else {
          // CLOUD WINS: Apply remote state
          const newState = {
            journeysList: data.journeysList || INITIAL_JOURNEYS,
            nodeData: data.nodeData || INITIAL_NODES,
            edgeData: data.edgeData || INITIAL_EDGES
          };
          setJourneysList(newState.journeysList);
          setNodeData(newState.nodeData);
          setEdgeData(newState.edgeData);
          latestDataRef.current = newState;
          saveCache(newState);

          if (!cloudHydrated.current) {
            log('✓ FIRST SNAPSHOT: Cloud data is now the authority');
            cloudHydrated.current = true;
          } else {
            log('✓ Snapshot: applied remote update');
          }
        }
        setCloudStatus('LIVE SYNC');
        setConnectionError(null);
      } else {
        // Cloud doc doesn't exist yet — push our current state up
        log('Cloud doc empty → pushing local state as seed');
        writeToFirebase(latestDataRef.current);
        cloudHydrated.current = true;
      }
    }, (error) => {
      log(`✗ Snapshot ERROR: ${error.code || error.message}`);
      setCloudStatus('OFFLINE');
      setConnectionError(`Listener failed: ${error.code}. Working from cache.`);
    });

    return () => { log('Snapshot listener detached'); unsub(); };
  }, [user, writeToFirebase, log]);

  // --- SAVE ON UNLOAD / TAB SWITCH ---
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      saveCache(latestDataRef.current);
      
      // BLOCK CLOSE/RELOAD if there are unsynced changes
      if (unsyncedRef.current || isSyncingRef.current || pendingSyncRef.current || debounceTimer.current) {
        // Trigger browser's native "unsaved changes" dialog
        e.preventDefault();
        e.returnValue = 'You have unsynced changes. Are you sure you want to leave?';
        
        // Also attempt a last-ditch Firebase push
        if (user) {
          try {
            setDoc(getDocRef('current'), {
              ...latestDataRef.current,
              lastUpdated: new Date().toISOString()
            }).then(() => {
              markSynced();
            }).catch(() => {});
          } catch {}
        }
        
        return e.returnValue;
      }
      
      // If synced, allow close silently
      if (user) {
        try {
          setDoc(getDocRef('current'), {
            ...latestDataRef.current,
            lastUpdated: new Date().toISOString()
          }).catch(() => {});
        } catch {}
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        saveCache(latestDataRef.current);
        if (user) writeToFirebase(latestDataRef.current);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, writeToFirebase]);

  // --- GLOBAL MOUSE-UP ---
  useEffect(() => {
    const up = () => {
      if (dragNode || linking) {
        isDraggingRef.current = false;
        if (dragNode) triggerSync(true);
      }
      setDragNode(null);
      setLinking(null);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [dragNode, linking, triggerSync]);

  // --- ADMIN ---
  const handleSaveMaster = async () => {
    if (!user || !isAdmin) return;
    setCloudStatus('SAVING MASTER...');
    try {
      await setDoc(getDocRef('master'), {
        journeysList, nodeData, edgeData, lastUpdated: new Date().toISOString()
      });
      log('✓ Master template saved');
      setCloudStatus('MASTER SAVED');
      setTimeout(() => setCloudStatus('LIVE SYNC'), 2000);
    } catch (e) {
      log(`✗ Master save FAILED: ${e.message}`);
      setCloudStatus('SYNC ERROR');
    }
  };

  const handleResetFlow = async () => {
    if (!user || !isAdmin) return;
    if (!window.confirm("Overwrite current flow with the Master Template?")) return;
    setCloudStatus('RESTORING...');
    try {
      const snap = await getDoc(getDocRef('master'));
      const data = snap.exists() ? snap.data() : { journeysList: INITIAL_JOURNEYS, nodeData: INITIAL_NODES, edgeData: INITIAL_EDGES };
      setJourneysList(data.journeysList);
      setNodeData(data.nodeData);
      setEdgeData(data.edgeData);
      latestDataRef.current = { journeysList: data.journeysList, nodeData: data.nodeData, edgeData: data.edgeData };
      saveCache(latestDataRef.current);
      await writeToFirebase(latestDataRef.current);
      log('✓ Flow reset from master');
    } catch (e) {
      log(`✗ Reset FAILED: ${e.message}`);
      setCloudStatus('SYNC ERROR');
    }
  };

  // --- JOURNEY CRUD ---
  const handleDuplicateJourney = (id, e) => {
    e.stopPropagation();
    const j = journeysList.find(x => x.id === id);
    if (!j) return;
    const newId = `j-${Date.now()}`;
    const newList = [...journeysList, { ...j, id: newId, title: `${j.title} (Copy)` }];
    const idMap = {};
    const newNodes = (nodeData[id] || []).map((n) => {
      const nid = `node-${Date.now()}-${Math.random().toString(36).substring(2,6)}`;
      idMap[n.id] = nid;
      return { ...n, id: nid };
    });
    const newEdges = (edgeData[id] || []).map((edge) => ({
      ...edge, id: `e-${Date.now()}-${Math.random().toString(36).substring(2,6)}`,
      from: idMap[edge.from] || edge.from, to: idMap[edge.to] || edge.to
    }));
    setJourneysList(newList);
    setNodeData(prev => ({ ...prev, [newId]: newNodes }));
    setEdgeData(prev => ({ ...prev, [newId]: newEdges }));
    latestDataRef.current = {
      journeysList: newList,
      nodeData: { ...nodeData, [newId]: newNodes },
      edgeData: { ...edgeData, [newId]: newEdges }
    };
    setActiveJId(newId);
    triggerSync(true);
  };

  const handleDeleteJourney = (id, e) => {
    e.stopPropagation();
    const nl = journeysList.filter(x => x.id !== id);
    setJourneysList(nl);
    latestDataRef.current.journeysList = nl;
    if (activeJId === id && nl.length > 0) setActiveJId(nl[0].id);
    triggerSync(true);
  };

  // --- NODE CRUD ---
  const addNode = (type, chan = 'WhatsApp') => {
    const id = `node-${Date.now()}`;
    const newNode = {
      id, type, x: 250, y: 150,
      ...(type === 'action' ? { channel: chan, title: `New ${chan}`, content: '', previewLink: '' } : {}),
      ...(type === 'delay' ? { value: 1, unit: 'Hours' } : {}),
      ...(type === 'split' ? { condition: '' } : {}),
      ...(type === 'trigger' ? { label: 'New Trigger' } : {})
    };
    setNodeData(prev => {
      const nD = { ...prev, [activeJId]: [...(prev[activeJId] || []), newNode] };
      latestDataRef.current.nodeData = nD;
      triggerSync(true);
      return nD;
    });
  };

  const handleDuplicateNode = (nodeId) => {
    const original = (nodeData[activeJId] || []).find(n => n.id === nodeId);
    if (!original) return;
    const nn = { ...original, id: `node-${Date.now()}`, x: original.x + 30, y: original.y + 30 };
    setNodeData(prev => {
      const nD = { ...prev, [activeJId]: [...(prev[activeJId] || []), nn] };
      latestDataRef.current.nodeData = nD;
      triggerSync(true);
      return nD;
    });
  };

  const removeNode = (id) => {
    setNodeData(prev => {
      const nD = { ...prev, [activeJId]: (prev[activeJId] || []).filter(n => n.id !== id) };
      latestDataRef.current.nodeData = nD;
      return nD;
    });
    setEdgeData(prev => {
      const eD = { ...prev, [activeJId]: (prev[activeJId] || []).filter(e => e.from !== id && e.to !== id) };
      latestDataRef.current.edgeData = eD;
      triggerSync(true);
      return eD;
    });
  };

  const updateNodeLocal = (id, upd, forceSync = false) => {
    setNodeData(prev => {
      const nD = { ...prev, [activeJId]: (prev[activeJId] || []).map(n => n.id === id ? { ...n, ...upd } : n) };
      latestDataRef.current.nodeData = nD;
      triggerSync(forceSync);
      return nD;
    });
  };

  // --- DRAG & LINK ---
  const handleMouseMove = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + canvasRef.current.scrollLeft;
    const y = e.clientY - rect.top + canvasRef.current.scrollTop;
    setMousePos({ x, y });
    if (dragNode) {
      isDraggingRef.current = true;
      setNodeData(prev => ({
        ...prev,
        [activeJId]: prev[activeJId].map(n => n.id === dragNode ? { ...n, x: x - dragOffset.x, y: y - dragOffset.y } : n)
      }));
    }
  };

  const handleStartLink = (e, id, portType) => {
    e.stopPropagation(); e.preventDefault();
    setLinking({ fromId: id, portType });
  };

  const completeLinking = (targetId) => {
    if (linking && linking.fromId !== targetId) {
      setEdgeData(prev => {
        const ne = { id: `e-${Date.now()}`, from: linking.fromId, to: targetId, port: linking.portType };
        const eD = { ...prev, [activeJId]: [...(prev[activeJId] || []), ne] };
        latestDataRef.current.edgeData = eD;
        triggerSync(true);
        return eD;
      });
    }
    setLinking(null);
  };

  const getNodeHeight = (node) => {
    if (node.type === 'trigger') return 100;
    if (node.type === 'split') return 160;
    if (node.type === 'delay') return 120;
    if (node.type === 'action') return (node.previewLink && node.previewLink.trim() !== '') ? 250 : 190;
    return 150;
  };

  const calculatePath = (x1, y1, x2, y2) => {
    const curve = Math.max(80, Math.abs(y2 - y1) / 2);
    return `M ${x1} ${y1} C ${x1} ${y1 + curve}, ${x2} ${y2 - curve}, ${x2} ${y2}`;
  };

  const nodes = nodeData[activeJId] || [];
  const edges = edgeData[activeJId] || [];
  const activeJourney = journeysList.find(j => j.id === activeJId);

  return (
    <div className="flex h-screen bg-black text-gray-100 font-sans overflow-hidden select-none" onMouseMove={handleMouseMove}>
      {/* --- SIDEBAR --- */}
      <aside className="w-64 bg-[#161616] border-r border-white/[0.04] flex flex-col shrink-0 z-50">
        <div className="p-6 pb-4 border-b border-white/[0.04] flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold uppercase tracking-tight text-white/80 text-sm leading-none">Cottonworld</h2>
            <button onClick={() => addNode('trigger')} className="p-1 hover:bg-white/10 rounded-full transition-colors"><Plus size={16} /></button>
          </div>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowDebug(p => !p)} title="Toggle debug log">
            <div className={`w-1.5 h-1.5 rounded-full ${
              hasUnsyncedChanges ? 'bg-orange-500 animate-pulse' 
              : cloudStatus.includes('LIVE') ? 'bg-emerald-500 animate-pulse' 
              : cloudStatus.includes('ERROR') || cloudStatus === 'OFFLINE' ? 'bg-red-500 animate-pulse' 
              : 'bg-amber-500 animate-pulse'
            }`} />
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">
              {hasUnsyncedChanges ? 'SAVING...' : cloudStatus}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
          {journeysList.map((j) => (
            <div key={j.id} onClick={() => setActiveJId(j.id)} className={`w-full text-left px-3 py-2 rounded-lg text-[11px] font-medium transition-all flex items-center justify-between group cursor-pointer ${activeJId === j.id ? 'bg-white/[0.08] text-white' : 'text-gray-600 hover:text-gray-400 hover:bg-white/[0.03]'}`}>
              <span className="truncate flex-1 uppercase tracking-tight">{j.title}</span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => handleDuplicateJourney(j.id, e)} className="p-1 text-white/40 hover:text-white" title="Duplicate"><Copy size={11}/></button>
                <button onClick={(e) => handleDeleteJourney(j.id, e)} className="p-1 text-white/40 hover:text-red-500" title="Delete"><Trash2 size={11}/></button>
              </div>
            </div>
          ))}
        </div>

        {/* ADMIN */}
        <div className="p-4 border-t border-white/[0.04] bg-[#131313]">
          {showAuthInput && !isAdmin && (
            <div className="mb-3 flex gap-2">
              <input type="password" placeholder="Passcode..." className="flex-1 bg-black border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white outline-none focus:border-[#0A84FF]" value={authInput} onChange={e => setAuthInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && authInput === 'admin2024' && (setIsAdmin(true), setShowAuthInput(false))} />
              <button onClick={() => { if (authInput === 'admin2024') { setIsAdmin(true); setShowAuthInput(false); }}} className="bg-[#0A84FF] px-3 py-2 rounded-lg text-[10px] font-bold text-white shadow-lg hover:bg-blue-600">GO</button>
            </div>
          )}
          <button onClick={() => setShowAuthInput(!showAuthInput)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-all">
            {isAdmin ? <Unlock size={14}/> : <Lock size={14}/>} {isAdmin ? 'ADMIN UNLOCKED' : 'ADMIN LOGIN'}
          </button>
          {isAdmin && (
            <div className="flex gap-2 mt-3">
              <button onClick={handleSaveMaster} className="flex-1 py-2 rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white text-[9px] font-bold uppercase tracking-widest border border-emerald-500/20 transition-all flex items-center justify-center gap-1.5"><Save size={12}/> Save Master</button>
              <button onClick={handleResetFlow} className="flex-1 py-2 rounded-xl bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white text-[9px] font-bold uppercase tracking-widest border border-rose-500/20 transition-all flex items-center justify-center gap-1.5"><RefreshCw size={12}/> Reset Flow</button>
            </div>
          )}
        </div>
      </aside>

      {/* --- CANVAS --- */}
      <main className="flex-1 relative overflow-hidden bg-[#0a0a0a]" ref={canvasRef}>
        {connectionError && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[100] bg-[#1a1a1a] border border-amber-500/20 backdrop-blur-xl p-3 rounded-xl flex items-center gap-2.5 shadow-lg max-w-md">
            <AlertTriangle className="text-amber-500/70 shrink-0" size={16} />
            <div>
              <p className="text-[9px] font-medium text-gray-400 leading-relaxed">{connectionError}</p>
              <p className="text-[8px] text-gray-600 mt-0.5">Edits cached locally.</p>
            </div>
          </div>
        )}

        {/* DEBUG LOG */}
        {showDebug && (
          <div className="absolute bottom-4 left-4 z-[100] bg-black/95 border border-white/10 rounded-2xl p-4 w-[420px] max-h-72 overflow-y-auto custom-scrollbar shadow-2xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Sync Debug Log</span>
              <button onClick={() => setShowDebug(false)} className="text-gray-600 hover:text-white"><X size={12}/></button>
            </div>
            {debugLog.length === 0 && <p className="text-[10px] text-gray-600 italic">Waiting for events...</p>}
            {debugLog.map((entry, i) => (
              <p key={i} className={`text-[9px] font-mono leading-relaxed ${entry.includes('✗') || entry.includes('FAILED') || entry.includes('ERROR') ? 'text-red-400' : entry.includes('✓') ? 'text-emerald-400' : 'text-gray-500'}`}>{entry}</p>
            ))}
          </div>
        )}

        <header className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start z-40 pointer-events-none">
          <div className="pointer-events-auto">
            <h1 className="text-3xl font-bold uppercase tracking-tight text-white/90 leading-none">{activeJourney?.title}</h1>
            <p className="text-gray-600 mt-1.5 text-xs font-medium">{activeJourney?.desc}</p>
          </div>
          <div className="flex gap-1 pointer-events-auto bg-[#1c1c1e]/80 backdrop-blur-xl p-1.5 rounded-xl border border-white/[0.06] shadow-lg">
            <ToolBtn icon={<Zap size={14}/>} onClick={() => addNode('trigger')} />
            <ToolBtn icon={<MessageSquare size={14}/>} onClick={() => addNode('action', 'WhatsApp')} />
            <ToolBtn icon={<Phone size={14}/>} onClick={() => addNode('action', 'Voice Bot')} />
            <ToolBtn icon={<Smartphone size={14}/>} onClick={() => addNode('action', 'SMS')} />
            <ToolBtn icon={<Clock size={14}/>} onClick={() => addNode('delay')} />
            <ToolBtn icon={<GitBranch size={14}/>} onClick={() => addNode('split')} />
          </div>
        </header>

        <div className="w-full h-full relative overflow-auto custom-scrollbar" style={{ backgroundImage: 'radial-gradient(#191919 1px, transparent 1px)', backgroundSize: '48px 48px' }}>
          <svg className="absolute top-0 left-0 min-w-full min-h-full pointer-events-none z-0" style={{ width: 5000, height: 5000 }}>
            {edges.map(e => {
              const from = nodes.find(n => n.id === e.from);
              const to = nodes.find(n => n.id === e.to);
              if (!from || !to) return null;
              const portOffset = e.port === 'true' ? -40 : e.port === 'false' ? 40 : 0;
              const x1 = from.x + 140 + portOffset;
              const y1 = from.y + getNodeHeight(from);
              const x2 = to.x + 140;
              const y2 = to.y + 10;
              const color = e.port === 'true' ? '#32D74B' : e.port === 'false' ? '#FF453A' : '#444';
              const curve = Math.max(60, Math.abs(y2 - y1) / 2);

              // Place × at TRUE midpoint (t=0.50) — always in the clear gap between boxes
              const t = 0.50, u = 1 - t;
              const cp1y = y1 + curve, cp2y = y2 - curve;
              const btnX = (u*u*u)*x1 + 3*(u*u)*t*x1 + 3*u*(t*t)*x2 + (t*t*t)*x2;
              const btnY = (u*u*u)*y1 + 3*(u*u)*t*cp1y + 3*u*(t*t)*cp2y + (t*t*t)*y2;

              return (
                <g key={e.id} className="group">
                  <path d={calculatePath(x1, y1, x2, y2)} stroke={color} strokeWidth="2" fill="none" opacity="0.3" className="group-hover:opacity-60 transition-all" />
                  {/* Thick invisible hitbox over the line for easy hover */}
                  <path d={calculatePath(x1, y1, x2, y2)} stroke="transparent" strokeWidth="20" fill="none" className="pointer-events-auto" />
                  {/* × button — only appears on line hover */}
                  <g 
                    className="pointer-events-auto cursor-pointer opacity-0 group-hover:opacity-100 transition-all" 
                    style={{ pointerEvents: 'all' }}
                    onPointerDown={(evt) => {
                      evt.stopPropagation();
                      setEdgeData(prev => {
                        const nED = { ...prev, [activeJId]: prev[activeJId].filter(it => it.id !== e.id) };
                        latestDataRef.current.edgeData = nED;
                        triggerSync(true);
                        return nED;
                      });
                    }}
                  >
                    <circle cx={btnX} cy={btnY} r="24" fill="transparent" />
                    <circle cx={btnX} cy={btnY} r="11" fill="#1c1c1e" stroke="#555" strokeWidth="1.5" className="hover:stroke-red-500 transition-all" />
                    <text x={btnX} y={btnY + 4} textAnchor="middle" fontSize="13" fill="#666" className="pointer-events-none hover:fill-red-500">×</text>
                  </g>
                </g>
              );
            })}
            {linking && (() => {
              const fn = nodes.find(n => n.id === linking.fromId);
              if (!fn) return null;
              return <path d={calculatePath(fn.x + 140 + (linking.portType === 'true' ? -40 : linking.portType === 'false' ? 40 : 0), fn.y + getNodeHeight(fn), mousePos.x, mousePos.y)} stroke="#0A84FF" strokeWidth="1.5" strokeDasharray="4,4" fill="none" opacity="0.5" />;
            })()}
          </svg>

          {nodes.map((n) => (
            <div key={n.id} className="absolute z-20" style={{ left: n.x, top: n.y }}>
              <div onMouseUp={() => completeLinking(n.id)} className={`w-[280px] bg-[#1c1c1e]/90 backdrop-blur-2xl rounded-2xl border transition-all duration-200 ${
                dragNode === n.id ? 'border-white/15 shadow-lg shadow-black/50 z-50'
                : linking && linking.fromId !== n.id ? 'border-[#0A84FF]/40 shadow-md shadow-blue-500/10 cursor-crosshair z-40'
                : 'border-white/[0.04] shadow-md shadow-black/30 hover:border-white/10 z-20'
              }`}>
                <div onMouseDown={(e) => { const rect = e.currentTarget.closest('div.absolute').getBoundingClientRect(); setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top }); setDragNode(n.id); }} className="px-5 py-2 border-b border-white/[0.04] flex justify-between items-center cursor-grab active:cursor-grabbing rounded-t-2xl">
                  <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 opacity-60 italic">{n.channel || n.type}</span>
                  <div className="flex gap-1 items-center" onMouseDown={e => e.stopPropagation()}>
                    <button onClick={() => handleDuplicateNode(n.id)} className="p-1 text-gray-600 hover:text-white transition-colors" title="Copy"><Copy size={11}/></button>
                    <button className="p-1 text-gray-600 hover:text-red-500" onClick={() => removeNode(n.id)}><Trash2 size={11} /></button>
                  </div>
                </div>
                <div className="p-5 space-y-3" onMouseDown={e => e.stopPropagation()}>
                  <input className="bg-transparent text-base font-semibold outline-none w-full border-b border-transparent focus:border-white/[0.06] text-white/90 pb-1" value={n.label || n.title || ''}
                    onFocus={() => { isTypingRef.current = true; }}
                    onChange={e => updateNodeLocal(n.id, { label: e.target.value, title: e.target.value }, false)}
                    onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                  />
                  {n.type === 'action' && (
                    <>
                      <textarea className="w-full bg-white/[0.03] p-3 rounded-xl text-[11px] h-16 outline-none resize-none leading-relaxed text-gray-500 border border-white/[0.04] focus:border-white/[0.08] transition-all" value={n.content || ''} placeholder="Message content..."
                        onFocus={() => { isTypingRef.current = true; }}
                        onChange={e => updateNodeLocal(n.id, { content: e.target.value }, false)}
                        onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                      />
                      <div className="flex flex-col gap-1 mt-1 text-left">
                        <span className="text-[8px] font-medium uppercase tracking-widest text-gray-700">Preview / Media URL</span>
                        <div className="flex items-center bg-white/[0.03] border border-white/[0.04] rounded-lg overflow-hidden focus-within:border-white/[0.08] transition-colors">
                          <div className="pl-2 text-gray-600"><LinkIcon size={10} /></div>
                          <input className="flex-1 bg-transparent p-2 text-[10px] text-gray-300 outline-none placeholder-gray-700" placeholder="Paste link..." value={n.previewLink || ''}
                            onFocus={() => { isTypingRef.current = true; }}
                            onChange={e => updateNodeLocal(n.id, { previewLink: e.target.value }, false)}
                            onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                          />
                        </div>
                        {n.previewLink && n.previewLink.trim() !== '' && (
                          <a href={n.previewLink.startsWith('http') ? n.previewLink : `https://${n.previewLink}`} target="_blank" rel="noopener noreferrer" className="mt-1 w-full bg-white/[0.06] hover:bg-white/[0.1] text-gray-400 hover:text-white py-1.5 rounded-lg text-[9px] font-medium uppercase flex items-center justify-center gap-1 transition-all">Preview ↗</a>
                        )}
                      </div>
                    </>
                  )}
                  {n.type === 'split' && (
                    <input className="w-full bg-white/[0.03] p-2 rounded-lg text-[10px] text-gray-500 outline-none border border-white/[0.04] focus:border-white/[0.08]" placeholder="Enter condition..." value={n.condition || ''}
                      onFocus={() => { isTypingRef.current = true; }}
                      onChange={e => updateNodeLocal(n.id, { condition: e.target.value }, false)}
                      onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                    />
                  )}
                  {n.type === 'delay' && (
                    <div className="flex gap-2">
                      <input type="number" className="w-1/2 bg-white/[0.03] p-2 rounded-lg text-xs font-medium text-white border border-white/[0.04] outline-none focus:border-white/[0.08]" value={n.value || ''}
                        onFocus={() => { isTypingRef.current = true; }}
                        onChange={e => updateNodeLocal(n.id, { value: e.target.value }, false)}
                        onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                      />
                      <select className="w-1/2 bg-white/[0.03] p-2 rounded-lg text-[10px] font-medium text-gray-500 border border-white/[0.04] outline-none cursor-pointer" value={n.unit || 'Hours'}
                        onChange={e => updateNodeLocal(n.id, { unit: e.target.value }, true)}>
                        <option>Minutes</option><option>Hours</option><option>Days</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-2.5 left-0 w-full flex justify-center z-30 pointer-events-none">
                  <div className="pointer-events-auto relative group flex items-center justify-center bg-[#222] border border-white/[0.06] rounded-full shadow-sm h-5 hover:h-6 hover:px-0.5 transition-all cursor-pointer">
                    {n.type === 'split' ? (
                      <>
                        <div className="w-6 h-full flex items-center justify-center text-gray-400 group-hover:hidden"><Plus size={14} strokeWidth={2.5} /></div>
                        <div className="hidden group-hover:flex gap-1">
                          <button onMouseDown={(e) => handleStartLink(e, n.id, 'true')} className="w-5 h-5 rounded-full bg-[#32D74B]/20 text-[#32D74B] hover:bg-[#32D74B] hover:text-white flex items-center justify-center transition-all" title="True"><Check size={12} strokeWidth={3} /></button>
                          <button onMouseDown={(e) => handleStartLink(e, n.id, 'false')} className="w-5 h-5 rounded-full bg-[#FF453A]/20 text-[#FF453A] hover:bg-[#FF453A] hover:text-white flex items-center justify-center transition-all" title="False"><X size={12} strokeWidth={3} /></button>
                        </div>
                      </>
                    ) : (
                      <button onMouseDown={(e) => handleStartLink(e, n.id, 'default')} className="w-6 h-full flex items-center justify-center text-gray-400 hover:text-[#0A84FF] transition-colors" title="Connect"><Plus size={14} strokeWidth={2.5} /></button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #333; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #444; }
      `}</style>
    </div>
  );
}

const ToolBtn = ({ icon, onClick }) => (
  <button onClick={onClick} className="p-2.5 text-gray-600 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all active:scale-95">
    {icon}
  </button>
);