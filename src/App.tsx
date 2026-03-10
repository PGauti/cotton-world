import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  MessageSquare, Phone, Clock, Zap, Trash2, GitBranch, 
  Smartphone, Plus, Check, X, Link as LinkIcon, Lock, Unlock, Save, RefreshCw, Copy, AlertTriangle, Loader2
} from 'lucide-react';

// --- 1. SECURE FIREBASE CONNECTION ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

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

// PERMANENTLY LOCKED ID
const appId = 'cottonworld-unified-sync-final-v3';

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

// --- 3. MAIN APPLICATION ---
export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('CONNECTING...');
  const [connectionError, setConnectionError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const [journeysList, setJourneysList] = useState(INITIAL_JOURNEYS);
  const [activeJId, setActiveJId] = useState(() => localStorage.getItem('cw_active_journey') || 'j1');
  const [nodeData, setNodeData] = useState(INITIAL_NODES);
  const [edgeData, setEdgeData] = useState(INITIAL_EDGES);
  
  // THE SAFEGUARD REF: Bypasses React state queues to guarantee data isn't lost on blur/reload
  const latestDataRef = useRef({ journeysList: INITIAL_JOURNEYS, nodeData: INITIAL_NODES, edgeData: INITIAL_EDGES });
  
  const canvasRef = useRef(null);
  const [dragNode, setDragNode] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [linking, setLinking] = useState(null); 
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const isDraggingRef = useRef(false);
  const isTypingRef = useRef(false); 
  const debounceTimer = useRef(null);
  const isSyncingRef = useRef(false);

  const [showAuthInput, setShowAuthInput] = useState(false);
  const [authInput, setAuthInput] = useState('');

  // --- BULLETPROOF SYNC CORE ---
  const executeSync = async (data) => {
    if (isSyncingRef.current || !user) return;
    isSyncingRef.current = true;
    try {
      const { journeysList: j, nodeData: n, edgeData: e } = data;
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'current'), {
        journeysList: j,
        nodeData: n,
        edgeData: e,
        lastUpdated: new Date().toISOString()
      });
      setCloudStatus('LIVE SYNC ACTIVE');
    } catch (err) { 
      console.error(err); 
      setCloudStatus('SYNC ERROR');
    } finally {
      isSyncingRef.current = false;
    }
  };

  const triggerSync = useCallback((force = false) => {
    if (!user) return;
    if (force) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      executeSync(latestDataRef.current);
    } else {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => executeSync(latestDataRef.current), 300);
    }
  }, [user]);

  // Update Mirror Ref instantly on any local change
  useEffect(() => {
    latestDataRef.current = { journeysList, nodeData, edgeData };
  }, [journeysList, nodeData, edgeData]);

  // Auth Init & Save active tab
  useEffect(() => {
    signInAnonymously(auth).catch(() => setCloudStatus('AUTH ERROR'));
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('cw_active_journey', activeJId);
  }, [activeJId]);

  // Sync Listener
  useEffect(() => {
    if (!user) return;
    setCloudStatus('SYNCING...');
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'current');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // Prevent cloud from overwriting local edits if user is busy interacting
        if (!docSnap.metadata.hasPendingWrites && !isDraggingRef.current && !linking && !isTypingRef.current) {
          setJourneysList(data.journeysList || INITIAL_JOURNEYS);
          setNodeData(data.nodeData || INITIAL_NODES);
          setEdgeData(data.edgeData || INITIAL_EDGES);
        }
        setCloudStatus('LIVE SYNC ACTIVE');
        setConnectionError(null);
      } else {
        triggerSync(true); // Force push if cloud is empty
      }
      setIsInitialized(true); 
    }, () => {
      setCloudStatus('OFFLINE');
      setConnectionError('Check Firebase: Anonymous Auth must be enabled.');
      setIsInitialized(true);
    });

    return () => unsubscribe();
  }, [user, linking, triggerSync]);

  // Global Mouse Up to Kill Latched States
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragNode || linking) {
        isDraggingRef.current = false;
        if (dragNode) triggerSync(true); // Hard save block position
      }
      setDragNode(null);
      setLinking(null);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [dragNode, linking, triggerSync]);

  // --- ADMIN MASTER LOCK FUNCTIONS ---
  const handleSaveMaster = async () => {
    if (!user || !isAdmin) return;
    setCloudStatus('SAVING MASTER...');
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'master'), {
        journeysList, nodeData, edgeData, lastUpdated: new Date().toISOString()
      });
      setCloudStatus('MASTER SAVED');
      setTimeout(() => setCloudStatus('LIVE SYNC ACTIVE'), 2000);
    } catch (e) {
      console.error(e);
      setCloudStatus('SYNC ERROR');
    }
  };

  const handleResetFlow = async () => {
    if (!user || !isAdmin) return;
    if (!window.confirm("Are you sure you want to completely overwrite the current flow with the Master Template?")) return;
    
    setCloudStatus('RESTORING...');
    try {
      const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'master'));
      if (snap.exists()) {
        const data = snap.data();
        setJourneysList(data.journeysList);
        setNodeData(data.nodeData);
        setEdgeData(data.edgeData);
        latestDataRef.current = { journeysList: data.journeysList, nodeData: data.nodeData, edgeData: data.edgeData };
        await executeSync(latestDataRef.current);
      } else {
        setJourneysList(INITIAL_JOURNEYS);
        setNodeData(INITIAL_NODES);
        setEdgeData(INITIAL_EDGES);
        latestDataRef.current = { journeysList: INITIAL_JOURNEYS, nodeData: INITIAL_NODES, edgeData: INITIAL_EDGES };
        await executeSync(latestDataRef.current);
      }
    } catch (e) {
      console.error(e);
      setCloudStatus('SYNC ERROR');
    }
  };

  // --- JOURNEY CRUD ---
  const handleDuplicateJourney = (id, e) => {
    e.stopPropagation();
    const journeyToCopy = journeysList.find(j => j.id === id);
    if (!journeyToCopy) return;

    const newId = `j-${Date.now()}`;
    const newList = [...journeysList, { ...journeyToCopy, id: newId, title: `${journeyToCopy.title} (Copy)` }];
    
    const idMap = {};
    const newNodes = (nodeData[id] || []).map((n) => {
      const newNId = `node-${Date.now()}-${Math.random().toString(36).substring(2,6)}`;
      idMap[n.id] = newNId;
      return { ...n, id: newNId };
    });
    
    const newEdges = (edgeData[id] || []).map((e) => ({
      ...e,
      id: `e-${Date.now()}-${Math.random().toString(36).substring(2,6)}`,
      from: idMap[e.from] || e.from,
      to: idMap[e.to] || e.to
    }));

    setJourneysList(newList);
    setNodeData(prev => {
      const nD = { ...prev, [newId]: newNodes };
      latestDataRef.current.nodeData = nD;
      return nD;
    });
    setEdgeData(prev => {
      const eD = { ...prev, [newId]: newEdges };
      latestDataRef.current.edgeData = eD;
      return eD;
    });
    setActiveJId(newId);
    setTimeout(() => triggerSync(true), 50);
  };

  const handleDeleteJourney = (id, e) => {
    e.stopPropagation();
    setJourneysList(prev => {
      const nl = prev.filter(it => it.id !== id);
      latestDataRef.current.journeysList = nl;
      if (activeJId === id && nl.length > 0) setActiveJId(nl[0].id);
      triggerSync(true);
      return nl;
    });
  };

  // --- NODE CRUD ---
  const addNode = (type, chan = 'WhatsApp') => {
    const id = `node-${Date.now()}`;
    const newNode = {
      id, type, x: 250, y: 150,
      ...(type === 'action' ? { channel: chan, title: `New ${chan}`, content: '', previewLink: '' } : {}),
      ...(type === 'delay' ? { value: 1, unit: 'Hours' } : {}),
      ...(type === 'split' ? { condition: '' } : {})
    };
    setNodeData(prev => {
      const nD = { ...prev, [activeJId]: [...(prev[activeJId] || []), newNode] };
      latestDataRef.current.nodeData = nD;
      triggerSync(true);
      return nD;
    });
  };

  const handleDuplicateNode = (nodeId) => {
    const original = (nodeData[activeJId] || []).find((n) => n.id === nodeId);
    if (!original) return;
    const newNode = { ...original, id: `node-${Date.now()}`, x: original.x + 30, y: original.y + 30 };
    setNodeData(prev => {
      const nD = { ...prev, [activeJId]: [...(prev[activeJId] || []), newNode] };
      latestDataRef.current.nodeData = nD;
      triggerSync(true);
      return nD;
    });
  };

  const removeNode = (id) => {
    setNodeData(prev => {
      const nD = { ...prev, [activeJId]: (prev[activeJId] || []).filter((n) => n.id !== id) };
      latestDataRef.current.nodeData = nD;
      return nD;
    });
    setEdgeData(prev => {
      const eD = { ...prev, [activeJId]: (prev[activeJId] || []).filter((e) => e.from !== id && e.to !== id) };
      latestDataRef.current.edgeData = eD;
      triggerSync(true);
      return eD;
    });
  };

  // Functional state guarantees data integrity on blur
  const updateNodeLocal = (id, upd, forceSync = false) => {
    setNodeData(prev => {
      const nD = { ...prev, [activeJId]: (prev[activeJId] || []).map((n) => n.id === id ? { ...n, ...upd } : n) };
      latestDataRef.current.nodeData = nD;
      triggerSync(forceSync);
      return nD;
    });
  };

  // --- DRAG & LINK LOGIC ---
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
        [activeJId]: prev[activeJId].map((n) => n.id === dragNode ? { ...n, x: x - dragOffset.x, y: y - dragOffset.y } : n)
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
        const newEdge = { id: `e-${Date.now()}`, from: linking.fromId, to: targetId, port: linking.portType };
        const eD = { ...prev, [activeJId]: [...(prev[activeJId] || []), newEdge] };
        latestDataRef.current.edgeData = eD;
        triggerSync(true);
        return eD;
      });
    }
    setLinking(null);
  };

  // --- PERFECT HEIGHT/ANCHOR CALCULATION ---
  const getNodeHeight = (node) => {
    if (node.type === 'trigger') return 100;
    if (node.type === 'split') return 160;  // Dynamically calculate height to clear the YES/NO ports
    if (node.type === 'delay') return 120;
    if (node.type === 'action') {
       return (node.previewLink && node.previewLink.trim() !== '') ? 250 : 190;
    }
    return 150;
  };

  const calculatePath = (x1, y1, x2, y2) => {
    const curve = Math.max(80, Math.abs(y2 - y1) / 2);
    return `M ${x1} ${y1} C ${x1} ${y1 + curve}, ${x2} ${y2 - curve}, ${x2} ${y2}`;
  };

  const nodes = nodeData[activeJId] || [];
  const edges = edgeData[activeJId] || [];
  const activeJourney = journeysList.find(j => j.id === activeJId);

  // Blocking render until cloud state is loaded to prevent initial overwrites
  if (!isInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white flex-col gap-4">
         <Loader2 className="animate-spin text-[#0A84FF]" size={40} />
         <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Loading Workspace...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-gray-100 font-sans overflow-hidden select-none" onMouseMove={handleMouseMove}>
      
      {/* --- SIDEBAR --- */}
      <aside className="w-72 bg-[#1c1c1e]/90 backdrop-blur-2xl border-r border-white/10 flex flex-col shrink-0 z-50 shadow-2xl">
        <div className="p-8 border-b border-white/10 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h2 className="font-bold italic uppercase tracking-tighter text-white leading-none">Cottonworld</h2>
            <button onClick={() => addNode('trigger')} className="p-1 hover:bg-white/10 rounded-full transition-colors"><Plus size={16} /></button>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${cloudStatus.includes('LIVE') ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">{cloudStatus}</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
          {journeysList.map((j) => (
            <div key={j.id} onClick={() => setActiveJId(j.id)} className={`w-full text-left px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-between group cursor-pointer ${activeJId === j.id ? 'bg-[#0A84FF] text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:bg-white/5'}`}>
              <span className="truncate flex-1 uppercase tracking-tight">{j.title}</span>
              
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={(e) => handleDuplicateJourney(j.id, e)} className="p-1 text-white/40 hover:text-white" title="Duplicate Journey"><Copy size={11}/></button>
                 <button onClick={(e) => handleDeleteJourney(j.id, e)} className="p-1 text-white/40 hover:text-red-500" title="Delete Journey"><Trash2 size={11}/></button>
              </div>
            </div>
          ))}
        </div>

        {/* ADMIN */}
        <div className="p-4 border-t border-white/10 bg-[#1c1c1e]">
           {showAuthInput && !isAdmin && (
             <div className="mb-3 flex gap-2 animate-in fade-in zoom-in-95">
               <input 
                 type="password" 
                 placeholder="Passcode..." 
                 className="flex-1 bg-black border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white outline-none focus:border-[#0A84FF]" 
                 value={authInput} 
                 onChange={e => setAuthInput(e.target.value)} 
                 onKeyDown={e => e.key === 'Enter' && authInput === 'admin2024' && (setIsAdmin(true), setShowAuthInput(false))} 
               />
               <button 
                 onClick={() => { if (authInput === 'admin2024') { setIsAdmin(true); setShowAuthInput(false); } }} 
                 className="bg-[#0A84FF] px-3 py-2 rounded-lg text-[10px] font-bold text-white shadow-lg transition-colors hover:bg-blue-600"
               >
                 GO
               </button>
             </div>
           )}
           <button onClick={() => setShowAuthInput(!showAuthInput)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-all">
             {isAdmin ? <Unlock size={14}/> : <Lock size={14}/>} {isAdmin ? 'ADMIN UNLOCKED' : 'ADMIN LOGIN'}
           </button>
           
           {/* MASTER ADMIN CONTROLS RESTORED */}
           {isAdmin && (
             <div className="flex gap-2 mt-3 animate-in fade-in zoom-in-95">
               <button onClick={handleSaveMaster} className="flex-1 py-2 rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white text-[9px] font-bold uppercase tracking-widest border border-emerald-500/20 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                  <Save size={12}/> Save Master
               </button>
               <button onClick={handleResetFlow} className="flex-1 py-2 rounded-xl bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white text-[9px] font-bold uppercase tracking-widest border border-rose-500/20 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                  <RefreshCw size={12}/> Reset Flow
               </button>
             </div>
           )}
        </div>
      </aside>

      {/* --- CANVAS --- */}
      <main className="flex-1 relative overflow-hidden bg-[#0a0a0a]" ref={canvasRef}>
        
        {/* CONNECTION ERROR BANNER */}
        {connectionError && (
          <div className="absolute top-32 left-1/2 -translate-x-1/2 z-[100] bg-[#1c1c1e] border border-red-500/50 backdrop-blur-xl p-6 rounded-3xl flex items-center gap-4 shadow-2xl">
             <AlertTriangle className="text-red-500" size={24} />
             <p className="text-[11px] font-bold text-gray-300 uppercase tracking-widest leading-relaxed">{connectionError}</p>
          </div>
        )}

        {/* HEADER TOOLBAR */}
        <header className="absolute top-0 left-0 right-0 p-10 flex justify-between items-start z-40 pointer-events-none">
          <div className="pointer-events-auto">
            <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white leading-none">{activeJourney?.title}</h1>
            <p className="text-gray-500 mt-2 text-sm font-medium">{activeJourney?.desc}</p>
          </div>
          <div className="flex gap-2 pointer-events-auto bg-[#1c1c1e] p-2 rounded-2xl border border-white/10 shadow-2xl">
            <ToolBtn icon={<Zap size={14}/>} onClick={() => addNode('trigger')} />
            <ToolBtn icon={<MessageSquare size={14}/>} onClick={() => addNode('action', 'WhatsApp')} />
            <ToolBtn icon={<Phone size={14}/>} onClick={() => addNode('action', 'Voice Bot')} />
            <ToolBtn icon={<Smartphone size={14}/>} onClick={() => addNode('action', 'SMS')} />
            <ToolBtn icon={<Clock size={14}/>} onClick={() => addNode('delay')} />
            <ToolBtn icon={<GitBranch size={14}/>} onClick={() => addNode('split')} />
          </div>
        </header>

        {/* DRAGGABLE GRID */}
        <div className="w-full h-full relative overflow-auto custom-scrollbar" style={{ backgroundImage: 'radial-gradient(#1c1c1e 1.5px, transparent 1.5px)', backgroundSize: '60px 60px' }}>
          
          <svg className="absolute top-0 left-0 min-w-full min-h-full pointer-events-none z-0" style={{ width: 5000, height: 5000 }}>
            {edges.map(e => {
              const from = nodes.find((n) => n.id === e.from);
              const to = nodes.find((n) => n.id === e.to);
              if (!from || !to) return null;
              
              const portOffset = e.port === 'true' ? -40 : e.port === 'false' ? 40 : 0;
              const x1 = from.x + 140 + portOffset;
              
              // DYNAMIC HEIGHT: Anchor line completely below the box + YES/NO buttons
              const y1 = from.y + getNodeHeight(from); 
              
              const x2 = to.x + 140;
              const y2 = to.y + 10; // Slightly inside the top of target box
              
              const color = e.port === 'true' ? '#32D74B' : e.port === 'false' ? '#FF453A' : '#5E5E62';
              const curve = Math.max(60, Math.abs(y2 - y1) / 2);

              // CUBIC BEZIER CALCULATION FOR PERFECT VISIBILITY
              // Pushing the "X" button 70% down the curve guarantees it clears the bottom of the source box
              const t = 0.70;
              const u = 1 - t;
              const btnX = (u * u * u) * x1 + 3 * (u * u) * t * x1 + 3 * u * (t * t) * x2 + (t * t * t) * x2;
              const btnY = (u * u * u) * y1 + 3 * (u * u) * t * (y1 + curve) + 3 * u * (t * t) * (y2 - curve) + (t * t * t) * y2;

              return (
                <g key={e.id}>
                  <path d={calculatePath(x1, y1, x2, y2)} stroke={color} strokeWidth="3" fill="none" opacity="0.4" />
                  <g 
                    className="pointer-events-auto cursor-pointer group" 
                    style={{ pointerEvents: 'all' }}
                    onPointerDown={(evt) => {
                       evt.stopPropagation();
                       setEdgeData(prev => {
                          const nED = { ...prev, [activeJId]: prev[activeJId].filter((it) => it.id !== e.id) };
                          latestDataRef.current.edgeData = nED;
                          triggerSync(true); // Force immediate deletion
                          return nED;
                       });
                    }}
                  >
                    {/* Massive invisible hitbox for unmissable clicks */}
                    <circle cx={btnX} cy={btnY} r="28" fill="transparent" />
                    {/* Visible button UI */}
                    <circle cx={btnX} cy={btnY} r="14" fill="#1c1c1e" stroke={color} strokeWidth="2.5" className="group-hover:fill-red-900/50 group-hover:stroke-red-500 transition-all" />
                    <text x={btnX} y={btnY + 5} textAnchor="middle" fontSize="16" fill={color} className="font-bold pointer-events-none group-hover:fill-red-500 transition-all">×</text>
                  </g>
                </g>
              );
            })}
            
            {/* ACTIVE DRAWING WIRE */}
            {linking && (
               <path 
                 d={calculatePath(
                   nodes.find((n) => n.id === linking.fromId).x + 140 + (linking.portType === 'true' ? -40 : linking.portType === 'false' ? 40 : 0), 
                   nodes.find((n) => n.id === linking.fromId).y + getNodeHeight(nodes.find((n) => n.id === linking.fromId)), 
                   mousePos.x, mousePos.y
                 )} 
                 stroke="#0A84FF" strokeWidth="2" strokeDasharray="6,6" fill="none" 
               />
            )}
          </svg>

          {/* RENDER NODES */}
          {nodes.map((n) => (
            <div key={n.id} className="absolute z-20" style={{ left: n.x, top: n.y }}>
              <div 
                onMouseUp={() => completeLinking(n.id)}
                className={`w-[280px] bg-[#1c1c1e]/95 backdrop-blur-3xl rounded-3xl border transition-all duration-300 ${
                  dragNode === n.id 
                    ? 'scale-105 border-[#0A84FF] shadow-[0_0_50px_#0A84FF33] z-50' 
                    : linking && linking.fromId !== n.id
                      ? 'scale-[1.02] border-[#0A84FF] shadow-[0_0_40px_rgba(10,132,255,0.6)] ring-2 ring-[#0A84FF]/50 animate-pulse cursor-crosshair z-40'
                      : 'hover:border-white/20 border-white/5 shadow-2xl z-20'
                }`}
              >
                {/* DRAG HEADER */}
                <div 
                  onMouseDown={(e) => { 
                    const rect = e.currentTarget.closest('div.absolute').getBoundingClientRect(); 
                    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top }); 
                    setDragNode(n.id); 
                  }} 
                  className="px-5 py-2.5 border-b border-white/5 flex justify-between items-center bg-white/5 cursor-grab active:cursor-grabbing rounded-t-3xl"
                >
                  <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 opacity-60 italic">{n.channel || n.type}</span>
                  
                  <div className="flex gap-1 items-center" onMouseDown={e => e.stopPropagation()}>
                    <button onClick={() => handleDuplicateNode(n.id)} className="p-1 text-gray-600 hover:text-white transition-colors" title="Copy Block">
                      <Copy size={11}/>
                    </button>
                    <button className="p-1 text-gray-600 hover:text-red-500" onClick={() => removeNode(n.id)}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* CONTENT INPUTS - Functional update on Blur enforces hard sync */}
                <div className="p-6 space-y-4" onMouseDown={e => e.stopPropagation()}>
                   <input 
                     className="bg-transparent text-lg font-bold outline-none w-full border-b border-transparent focus:border-white/10 text-white" 
                     value={n.label || n.title} 
                     onFocus={() => { isTypingRef.current = true; }}
                     onChange={e => updateNodeLocal(n.id, { label: e.target.value, title: e.target.value }, false)} 
                     onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                   />
                   
                   {n.type === 'action' && (
                     <>
                        <textarea 
                          className="w-full bg-black/40 p-3 rounded-2xl text-[11px] h-18 outline-none resize-none leading-relaxed text-gray-400 italic border border-white/5 focus:border-[#0A84FF]/30 transition-all" 
                          value={n.content} 
                          placeholder="Message content..." 
                          onFocus={() => { isTypingRef.current = true; }}
                          onChange={e => updateNodeLocal(n.id, { content: e.target.value }, false)} 
                          onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                        />
                        
                        <div className="flex flex-col gap-1 mt-1 text-left">
                           <span className="text-[8px] font-black uppercase tracking-widest text-gray-600">Preview / Media URL</span>
                           <div className="flex items-center bg-black/40 border border-white/5 rounded-xl overflow-hidden focus-within:border-[#0A84FF]/40 transition-colors">
                              <div className="pl-2 text-gray-600"><LinkIcon size={10} /></div>
                              <input 
                                className="flex-1 bg-transparent p-2 text-[10px] text-gray-300 outline-none placeholder-gray-700" 
                                placeholder="Paste link..." 
                                value={n.previewLink || ''} 
                                onFocus={() => { isTypingRef.current = true; }}
                                onChange={e => updateNodeLocal(n.id, { previewLink: e.target.value }, false)} 
                                onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                              />
                           </div>
                           {n.previewLink && n.previewLink.trim() !== '' && (
                              <a href={n.previewLink.startsWith('http') ? n.previewLink : `https://${n.previewLink}`} target="_blank" rel="noopener noreferrer" className="mt-1 w-full bg-[#0A84FF]/80 hover:bg-[#0A84FF] text-white py-1.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1.5 shadow-lg transition-all">Test / Preview ↗</a>
                           )}
                        </div>
                     </>
                   )}
                   {n.type === 'split' && (
                      <input 
                        className="w-full bg-black/40 p-2 rounded-xl text-[10px] text-gray-400 outline-none italic border border-white/5" 
                        placeholder="Enter condition..." 
                        value={n.condition} 
                        onFocus={() => { isTypingRef.current = true; }}
                        onChange={e => updateNodeLocal(n.id, { condition: e.target.value }, false)} 
                        onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                      />
                   )}
                   {n.type === 'delay' && (
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          className="w-1/2 bg-black/40 p-2 rounded-xl text-xs font-bold text-white border border-white/5 outline-none focus:border-[#0A84FF]" 
                          value={n.value} 
                          onFocus={() => { isTypingRef.current = true; }}
                          onChange={e => updateNodeLocal(n.id, { value: e.target.value }, false)} 
                          onBlur={() => { isTypingRef.current = false; triggerSync(true); }}
                        />
                        <select 
                          className="w-1/2 bg-black/40 p-2 rounded-xl text-[10px] font-black text-gray-500 border border-white/5 outline-none cursor-pointer" 
                          value={n.unit} 
                          onChange={e => { updateNodeLocal(n.id, { unit: e.target.value }, true); }}
                        >
                           <option>Minutes</option><option>Hours</option><option>Days</option>
                        </select>
                      </div>
                   )}
                </div>

                {/* --- HOVER OUT PORTS --- */}
                <div className="absolute -bottom-3 left-0 w-full flex justify-center z-30 pointer-events-none">
                  <div className="pointer-events-auto relative group flex items-center justify-center bg-[#2c2c2e] border border-white/10 rounded-full shadow-lg hover:shadow-xl h-6 hover:h-7 hover:px-1 transition-all cursor-pointer">
                     {n.type === 'split' ? (
                        <>
                           <div className="w-6 h-full flex items-center justify-center text-gray-400 group-hover:hidden"><Plus size={14} strokeWidth={2.5} /></div>
                           <div className="hidden group-hover:flex gap-1">
                              <button onMouseDown={(e) => handleStartLink(e, n.id, 'true')} className="w-5 h-5 rounded-full bg-[#32D74B]/20 text-[#32D74B] hover:bg-[#32D74B] hover:text-white flex items-center justify-center transition-all shadow-sm" title="True Path"><Check size={12} strokeWidth={3} /></button>
                              <button onMouseDown={(e) => handleStartLink(e, n.id, 'false')} className="w-5 h-5 rounded-full bg-[#FF453A]/20 text-[#FF453A] hover:bg-[#FF453A] hover:text-white flex items-center justify-center transition-all shadow-sm" title="False Path"><X size={12} strokeWidth={3} /></button>
                           </div>
                        </>
                     ) : (
                        <button onMouseDown={(e) => handleStartLink(e, n.id, 'default')} className="w-6 h-full flex items-center justify-center text-gray-400 hover:text-[#0A84FF] transition-colors" title="Drag to connect">
                           <Plus size={14} strokeWidth={2.5} />
                        </button>
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
  <button onClick={onClick} className="p-3 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95">
    {icon}
  </button>
);