import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  MessageSquare, Phone, Clock, Zap, Trash2, GitBranch, 
  Smartphone, MessageCircleMore, Plus, GripVertical, 
  Check, X, Edit2, Link as LinkIcon, ExternalLink, Lock, Unlock, Save, RefreshCw, Copy, AlertTriangle
} from 'lucide-react';

// --- 1. SECURE FIREBASE CONNECTION ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

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
const appId = 'cottonworld-unified-sync-final-v1';

// --- 2. INITIAL DATA ---
const INITIAL_JOURNEYS = [
  { id: 'j1', title: 'Cart Abandonment', desc: 'WhatsApp/RCS + Voice Bot escalation.' },
  { id: 'j2', title: 'COD Verification', desc: 'Automated RTO reduction.' },
  { id: 'j3', title: 'Welcome Series', desc: 'New subscriber onboarding.' },
  { id: 'j4', title: 'Post-Purchase Review', desc: 'NPS & UGC collection.' },
  { id: 'j5', title: 'Browse Abandonment', desc: 'Retargeting high-interest browsers.' },
  { id: 'j6', title: 'Win-back Campaign', desc: '90-day inactive segment recovery.' },
  { id: 'j7', title: 'Replenishment', desc: 'Basics restock alerts.' },
  { id: 'j8', title: 'Birthday Rewards', desc: 'Annual personalization.' },
  { id: 'j9', title: 'Tracking Updates', desc: 'Shipping transparency.' },
  { id: 'j10', title: 'Payment Recovery', desc: 'Rescue for failed payments.' },
  { id: 'j11', title: 'Back in Stock', desc: 'Waitlist conversion.' },
  { id: 'j12', title: 'Price Drop', desc: 'Dynamic sale nudges.' },
  { id: 'j13', title: 'VIP Upgrade', desc: 'Tier milestone greeting.' },
  { id: 'j14', title: 'Flash Sale', desc: 'Mass-scale promotion.' }
];

const INITIAL_NODES = {
  'j1': [
    { id: 'n1', type: 'trigger', x: 500, y: 150, label: 'Checkout Abandoned' },
    { id: 'n2', type: 'action', channel: 'WhatsApp', x: 500, y: 400, title: 'Main Nudge', content: 'Hi {{name}}, your cart is waiting!', previewLink: '' },
    { id: 'n3', type: 'split', x: 500, y: 650, condition: 'Did customer click link?' }
  ]
};

const INITIAL_EDGES = {
  'j1': [
    { id: 'e1', from: 'n1', to: 'n2', port: 'default' },
    { id: 'e2', from: 'n2', to: 'n3', port: 'default' }
  ]
};

// --- 3. MAIN APPLICATION ---
function CanvasApp() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('CONNECTING...');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [journeysList, setJourneysList] = useState<any[]>(INITIAL_JOURNEYS);
  const [activeJId, setActiveJId] = useState('j1');
  const [nodeData, setNodeData] = useState<any>(INITIAL_NODES);
  const [edgeData, setEdgeData] = useState<any>(INITIAL_EDGES);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [linking, setLinking] = useState<any>(null); 
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  const [showAuthInput, setShowAuthInput] = useState(false);
  const [authInput, setAuthInput] = useState('');
  const debounceTimer = useRef<any>(null);

  // 1. Unified Authentication
  useEffect(() => {
    signInAnonymously(auth).catch(() => setCloudStatus('AUTH ERROR'));
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. High-Speed Sync
  useEffect(() => {
    if (!user) return;
    setCloudStatus('SYNCING...');
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'current');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!docSnap.metadata.hasPendingWrites && !isDraggingRef.current) {
          if (data.journeysList) setJourneysList(data.journeysList);
          if (data.nodeData) setNodeData(data.nodeData);
          if (data.edgeData) setEdgeData(data.edgeData);
        }
        setCloudStatus('LIVE SYNC ACTIVE');
        setConnectionError(null);
      } else if (!docSnap.exists()) {
        syncToCloud(INITIAL_JOURNEYS, INITIAL_NODES, INITIAL_EDGES, true);
      }
    }, (err) => {
      setCloudStatus('OFFLINE');
      setConnectionError('Check Firebase: Anonymous Auth must be enabled.');
    });

    return () => unsubscribe();
  }, [user]);

  // 3. GLOBAL MOUSE UP FIX - Prevents box latching
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (dragNode) {
        isDraggingRef.current = false;
        syncToCloud(journeysList, nodeData, edgeData, true);
      }
      setDragNode(null);
      setLinking(null);
    };
    window.addEventListener('mouseup', handleGlobalRelease);
    return () => window.removeEventListener('mouseup', handleGlobalRelease);
  }, [dragNode, journeysList, nodeData, edgeData]);

  const syncToCloud = async (jList: any, nData: any, eData: any, force = false) => {
    if (!user) return;
    if (!force) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => executeSync(jList, nData, eData), 400);
    } else {
      executeSync(jList, nData, eData);
    }
  };

  const executeSync = async (jList: any, nData: any, eData: any) => {
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'current'), {
        journeysList: jList,
        nodeData: nData,
        edgeData: eData,
        lastUpdated: new Date().toISOString()
      });
      setCloudStatus('LIVE SYNC ACTIVE');
    } catch (e) { console.error(e); }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + canvasRef.current.scrollLeft;
    const y = e.clientY - rect.top + canvasRef.current.scrollTop;
    setMousePos({ x, y });

    if (dragNode) {
      isDraggingRef.current = true;
      setNodeData((prev: any) => ({
        ...prev,
        [activeJId]: prev[activeJId].map((n: any) => n.id === dragNode ? { ...n, x, y } : n)
      }));
    }
  };

  const completeLinking = (targetId: string) => {
    if (linking && linking.fromId !== targetId) {
      const newEdge = { id: `e-${Date.now()}`, from: linking.fromId, to: targetId, port: linking.portType };
      const newEdgeData = { ...edgeData, [activeJId]: [...(edgeData[activeJId] || []), newEdge] };
      setEdgeData(newEdgeData);
      syncToCloud(journeysList, nodeData, newEdgeData, true);
    }
    setLinking(null);
    setDragNode(null);
  };

  const addNode = (type: string, chan = 'WhatsApp') => {
    const id = `node-${Date.now()}`;
    const newNode = {
      id, type, x: 500, y: 300,
      ...(type === 'action' ? { channel: chan, title: `New ${chan}`, content: '', previewLink: '' } : {}),
      ...(type === 'delay' ? { value: 1, unit: 'Hours' } : {}),
      ...(type === 'split' ? { condition: '' } : {})
    };
    const newNodeData = { ...nodeData, [activeJId]: [...(nodeData[activeJId] || []), newNode] };
    setNodeData(newNodeData);
    syncToCloud(journeysList, newNodeData, edgeData);
  };

  const nodes = nodeData[activeJId] || [];
  const edges = edgeData[activeJId] || [];
  const activeJourney = journeysList.find(j => j.id === activeJId);

  const calculatePath = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} C ${x1} ${y1 + 120}, ${x2} ${y2 - 120}, ${x2} ${y2}`;

  return (
    <div className="flex h-screen bg-black text-gray-100 font-sans overflow-hidden select-none" onMouseMove={handleMouseMove}>
      
      {/* SIDEBAR */}
      <aside className="w-72 bg-[#1c1c1e]/90 backdrop-blur-2xl border-r border-white/10 flex flex-col shrink-0 z-50 shadow-2xl">
        <div className="p-8 border-b border-white/10 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h2 className="font-bold italic uppercase tracking-tighter text-white">Cottonworld</h2>
            <button onClick={() => addNode('trigger')} className="p-1 hover:bg-white/10 rounded-full transition-colors"><Plus size={16} /></button>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${cloudStatus.includes('LIVE') ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">{cloudStatus}</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
          {journeysList.map((j) => (
            <div key={j.id} onClick={() => setActiveJId(j.id)} className={`w-full text-left px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all flex items-center justify-between group cursor-pointer ${activeJId === j.id ? 'bg-[#0A84FF] text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:bg-white/5'}`}>
              <span className="truncate flex-1 uppercase tracking-tight">{j.title}</span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={(e) => {
                    e.stopPropagation();
                    const newId = `j-${Date.now()}`;
                    const newList = [...journeysList, { ...j, id: newId, title: `${j.title} (Copy)` }];
                    setJourneysList(newList);
                    const newNodeData = {...nodeData, [newId]: nodeData[j.id] || []};
                    const newEdgeData = {...edgeData, [newId]: edgeData[j.id] || []};
                    setNodeData(newNodeData);
                    setEdgeData(newEdgeData);
                    syncToCloud(newList, newNodeData, newEdgeData, true);
                 }} className="p-1 text-white/40 hover:text-white"><Copy size={11}/></button>
                 <button onClick={(e) => { e.stopPropagation(); const nl = journeysList.filter(it => it.id !== j.id); setJourneysList(nl); syncToCloud(nl, nodeData, edgeData, true); }} className="p-1 text-white/40 hover:text-red-500"><Trash2 size={11}/></button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/10">
           {showAuthInput && !isAdmin && (
             <div className="mb-3 flex gap-2 animate-in fade-in zoom-in-95">
               <input type="password" placeholder="Passcode..." className="flex-1 bg-black border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white outline-none focus:border-[#0A84FF]" value={authInput} onChange={e => setAuthInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && authInput === 'admin2024' && (setIsAdmin(true), setShowAuthInput(false))} />
             </div>
           )}
           <button onClick={() => setShowAuthInput(!showAuthInput)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-all">
             {isAdmin ? <Unlock size={14}/> : <Lock size={14}/>} {isAdmin ? 'ADMIN UNLOCKED' : 'ADMIN LOGIN'}
           </button>
        </div>
      </aside>

      {/* CANVAS */}
      <main className="flex-1 relative overflow-hidden bg-[#0a0a0a]" ref={canvasRef}>
        
        {connectionError && (
          <div className="absolute top-32 left-1/2 -translate-x-1/2 z-[100] bg-[#1c1c1e] border border-red-500/50 backdrop-blur-xl p-6 rounded-3xl flex items-center gap-4">
             <AlertTriangle className="text-red-500" size={24} />
             <p className="text-[11px] font-bold text-gray-300 uppercase tracking-widest leading-relaxed">{connectionError}</p>
          </div>
        )}

        <header className="absolute top-0 left-0 right-0 p-10 flex justify-between items-start z-40 pointer-events-none">
          <div className="pointer-events-auto">
            <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white leading-none">{activeJourney?.title}</h1>
            <p className="text-gray-500 mt-2 text-sm font-medium">{activeJourney?.desc}</p>
          </div>
          <div className="flex gap-2 pointer-events-auto bg-[#1c1c1e] p-2 rounded-2xl border border-white/10 shadow-2xl ring-1 ring-white/5">
            <ToolBtn icon={<Zap size={14}/>} onClick={() => addNode('trigger')} />
            <ToolBtn icon={<MessageSquare size={14}/>} onClick={() => addNode('action', 'WhatsApp')} />
            <ToolBtn icon={<Phone size={14}/>} onClick={() => addNode('action', 'Voice Bot')} />
            <ToolBtn icon={<Smartphone size={14}/>} onClick={() => addNode('action', 'SMS')} />
            <ToolBtn icon={<Clock size={14}/>} onClick={() => addNode('delay')} />
            <ToolBtn icon={<GitBranch size={14}/>} onClick={() => addNode('split')} />
          </div>
        </header>

        <div className="w-full h-full relative overflow-auto custom-scrollbar" style={{ backgroundImage: 'radial-gradient(#1c1c1e 1.5px, transparent 1.5px)', backgroundSize: '60px 60px' }}>
          
          <svg className="absolute top-0 left-0 min-w-full min-h-full pointer-events-none z-0" style={{ width: 5000, height: 5000 }}>
            {edges.map(e => {
              const from = nodes.find((n: any) => n.id === e.from);
              const to = nodes.find((n: any) => n.id === e.to);
              if (!from || !to) return null;
              
              const x1 = from.x, y1 = from.y;
              const x2 = to.x, y2 = to.y;
              const color = e.port === 'true' ? '#32D74B' : e.port === 'false' ? '#FF453A' : '#5E5E62';

              return (
                <g key={e.id}>
                  <path d={calculatePath(x1, y1, x2, y2)} stroke={color} strokeWidth="3" fill="none" opacity="0.4" />
                  <g className="pointer-events-auto cursor-pointer" onClick={() => {
                     const ne = edges.filter((it: any) => it.id !== e.id);
                     const newEdgeData = {...edgeData, [activeJId]: ne};
                     setEdgeData(newEdgeData);
                     syncToCloud(journeysList, nodeData, newEdgeData, true);
                  }}>
                    <circle cx={(x1 + x2)/2} cy={(y1 + y2)/2} r="10" fill="#1c1c1e" stroke={color} strokeWidth="1" />
                    <text x={(x1 + x2)/2} y={(y1 + y2)/2 + 4} textAnchor="middle" fontSize="12" fill={color} className="font-bold">×</text>
                  </g>
                </g>
              );
            })}
            {linking && (
               <path d={calculatePath(nodes.find((n: any) => n.id === linking.fromId).x, nodes.find((n: any) => n.id === linking.fromId).y, mousePos.x, mousePos.y)} stroke="#0A84FF" strokeWidth="2" strokeDasharray="6,6" fill="none" />
            )}
          </svg>

          {nodes.map((n: any) => (
            <div key={n.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20" style={{ left: n.x, top: n.y }}>
              <div 
                onMouseUp={() => completeLinking(n.id)}
                className={`w-[280px] bg-[#1c1c1e]/90 backdrop-blur-xl rounded-3xl border transition-all duration-300 ${dragNode === n.id ? 'scale-105 border-[#0A84FF] shadow-[0_0_50px_#0A84FF33] z-50' : 'hover:border-white/20 border-white/5 shadow-2xl z-20'}`}
              >
                <div 
                  onMouseDown={(e) => { 
                    const rect = e.currentTarget.closest('div')!.getBoundingClientRect(); 
                    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top }); 
                    setDragNode(n.id); 
                  }} 
                  className="px-5 py-2.5 border-b border-white/5 flex justify-between items-center bg-white/5 cursor-grab rounded-t-3xl"
                >
                  <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 opacity-60 italic">{n.channel || n.type}</span>
                  <div className="flex gap-1 items-center">
                    <button onClick={(e) => { 
                        e.stopPropagation();
                        const newNode = { ...n, id: `node-${Date.now()}`, x: n.x + 30, y: n.y + 30 };
                        const nd = [...nodes, newNode];
                        setNodeData({...nodeData, [activeJId]: nd});
                        syncToCloud(journeysList, nd, edgeData);
                    }} className="p-1 text-gray-600 hover:text-white transition-colors" title="Copy Block"><Copy size={11}/></button>
                    <button className="p-1 text-gray-600 hover:text-red-500" onClick={(e) => { 
                        e.stopPropagation();
                        const nn = nodes.filter((it: any) => it.id !== n.id);
                        const ne = edges.filter((it: any) => it.from !== n.id && it.to !== n.id);
                        const newNodeData = {...nodeData, [activeJId]: nn};
                        const newEdgeData = {...edgeData, [activeJId]: ne};
                        setNodeData(newNodeData);
                        setEdgeData(newEdgeData);
                        syncToCloud(journeysList, newNodeData, newEdgeData, true);
                    }}><Trash2 size={11} /></button>
                  </div>
                </div>
                <div className="p-6 space-y-4" onMouseDown={e => e.stopPropagation()}>
                   <input className="bg-transparent text-lg font-bold outline-none w-full border-b border-transparent focus:border-white/10 text-white" value={n.label || n.title} onChange={e => {
                       const upd = { label: e.target.value, title: e.target.value };
                       const nd = nodes.map((it: any) => it.id === n.id ? {...it, ...upd} : it);
                       setNodeData({...nodeData, [activeJId]: nd});
                       syncToCloud(journeysList, nd, edgeData);
                   }} />
                   
                   {n.type === 'action' && (
                     <>
                        <textarea className="w-full bg-black/40 p-3 rounded-2xl text-[11px] h-18 outline-none resize-none leading-relaxed text-gray-400 italic border border-white/5 focus:border-[#0A84FF]/30 transition-all" value={n.content} placeholder="Message content..." onChange={e => {
                            const nd = nodes.map((it: any) => it.id === n.id ? {...it, content: e.target.value} : it);
                            setNodeData({...nodeData, [activeJId]: nd});
                            syncToCloud(journeysList, nd, edgeData);
                        }} />
                        <div className="flex flex-col gap-1 mt-1">
                           <span className="text-[8px] font-black uppercase tracking-widest text-gray-600 text-left">Preview / Media URL</span>
                           <div className="flex items-center bg-black/40 border border-white/5 rounded-xl overflow-hidden focus-within:border-[#0A84FF]/40 transition-colors">
                              <div className="pl-2 text-gray-600"><LinkIcon size={10} /></div>
                              <input className="flex-1 bg-transparent p-2 text-[10px] text-gray-300 outline-none placeholder-gray-700" placeholder="Paste link..." value={n.previewLink || ''} onChange={e => {
                                  const nd = nodes.map((it: any) => it.id === n.id ? {...it, previewLink: e.target.value} : it);
                                  setNodeData({...nodeData, [activeJId]: nd});
                                  syncToCloud(journeysList, nd, edgeData);
                              }} />
                           </div>
                           {n.previewLink && n.previewLink.trim() !== '' && (
                              <a href={n.previewLink.startsWith('http') ? n.previewLink : `https://${n.previewLink}`} target="_blank" rel="noopener noreferrer" className="mt-1 w-full bg-[#0A84FF]/80 hover:bg-[#0A84FF] text-white py-1.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1.5 shadow-lg">Test / Preview ↗</a>
                           )}
                        </div>
                     </>
                   )}
                   {n.type === 'split' && (
                      <input className="w-full bg-black/40 p-2 rounded-xl text-[10px] text-gray-400 outline-none italic border border-white/5" placeholder="Enter condition..." value={n.condition} onChange={e => {
                          const nd = nodes.map((it: any) => it.id === n.id ? {...it, condition: e.target.value} : it);
                          setNodeData({...nodeData, [activeJId]: nd});
                          syncToCloud(journeysList, nd, edgeData);
                      }} />
                   )}
                </div>

                {/* --- MINIMAL HOVER LINKER --- */}
                <div className="absolute -bottom-3 left-0 w-full flex justify-center z-30 pointer-events-none">
                  <div className="pointer-events-auto relative group flex items-center justify-center bg-[#2c2c2e] border border-white/10 rounded-full shadow-lg hover:shadow-xl h-6 hover:h-7 hover:px-1 transition-all cursor-pointer">
                     {n.type === 'split' ? (
                        <>
                           <div className="w-6 h-full flex items-center justify-center text-gray-400 group-hover:hidden transition-all duration-200"><Plus size={14} strokeWidth={2.5} /></div>
                           <div className="hidden group-hover:flex gap-1 animate-in fade-in zoom-in-95 duration-200">
                              <button onMouseDown={(e) => { e.stopPropagation(); setLinking({ fromId: n.id, portType: 'true' }); }} className="w-5 h-5 rounded-full bg-[#32D74B]/20 text-[#32D74B] hover:bg-[#32D74B] hover:text-white flex items-center justify-center transition-all border border-[#32D74B]/20 shadow-sm" title="True Path"><Check size={12} strokeWidth={3} /></button>
                              <button onMouseDown={(e) => { e.stopPropagation(); setLinking({ fromId: n.id, portType: 'false' }); }} className="w-5 h-5 rounded-full bg-[#FF453A]/20 text-[#FF453A] hover:bg-[#FF453A] hover:text-white flex items-center justify-center transition-all border border-[#FF453A]/20 shadow-sm" title="False Path"><X size={12} strokeWidth={3} /></button>
                           </div>
                        </>
                     ) : (
                        <button onMouseDown={(e) => { e.stopPropagation(); setLinking({ fromId: n.id, portType: 'default' }); }} className="w-6 h-full flex items-center justify-center text-gray-400 hover:text-[#0A84FF] transition-colors" title="Drag to connect">
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

const ToolBtn = ({ icon, onClick }: any) => (
  <button onClick={onClick} className="p-3 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95">
    {icon}
  </button>
);

export default function Root() { return <CanvasApp />; }