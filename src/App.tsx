import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  MessageSquare, Phone, Clock, Zap, Trash2, GitBranch, 
  Smartphone, MessageCircleMore, Plus, GripVertical, Image as ImageIcon, 
  Check, X, Edit2, Link as LinkIcon, ExternalLink, Lock, Unlock, Save, RefreshCw, Copy
} from 'lucide-react';

// --- 1. SECURE FIREBASE CLOUD SETUP ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

// Bulletproof parsing to prevent the "White Page" crash on public share links
let firebaseConfig: any = null;
declare global {
  var __firebase_config: any;
  var __app_id: any;
  var __initial_auth_token: any;
}

try {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    firebaseConfig = typeof __firebase_config === 'string' ? JSON.parse(__firebase_config) : __firebase_config;
  }
} catch (error) {
  console.warn("Cloud config parsing bypassed for local preview.");
}

const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = (typeof __app_id !== 'undefined' && __app_id) ? String(__app_id) : 'cottonworld-admin-v1';

// --- 2. DEFAULT INITIAL STATE ---
const INITIAL_JOURNEYS = [
  { id: 'j1', title: 'Cart Abandonment', desc: 'WhatsApp/RCS + Voice Bot escalation.' },
  { id: 'j2', title: 'COD Verification', desc: 'Automated RTO reduction via Bitespeed.' },
  { id: 'j3', title: 'Welcome Series', desc: 'New subscriber onboarding sequence.' },
  { id: 'j4', title: 'Post-Purchase Review', desc: 'NPS collection 7 days post-delivery.' },
  { id: 'j5', title: 'Browse Abandonment', desc: 'Retargeting high-interest browser behavior.' },
  { id: 'j6', title: 'Win-back Campaign', desc: '90-day inactive segment recovery.' },
  { id: 'j7', title: 'Replenishment', desc: 'Basics restock alerts.' },
  { id: 'j8', title: 'Birthday Rewards', desc: 'Annual personalized loyalty appreciation.' },
  { id: 'j9', title: 'Tracking Updates', desc: 'Shipping milestone transparency.' },
  { id: 'j10', title: 'Payment Recovery', desc: 'Rescue for failed checkout payments.' },
  { id: 'j11', title: 'Back in Stock', desc: 'Waitlist conversion.' },
  { id: 'j12', title: 'Price Drop', desc: 'Dynamic sale nudges.' },
  { id: 'j13', title: 'VIP Upgrade', desc: 'Tier milestone recognition.' },
  { id: 'j14', title: 'Flash Sale', desc: 'Mass-scale promotion.' }
];

const INITIAL_NODES: any = {
  'j1': [
    { id: 'n1', type: 'trigger', x: 400, y: 50, label: 'Checkout Abandoned' },
    { id: 'n2', type: 'action', channel: 'WhatsApp', x: 400, y: 160, title: 'Main Nudge', content: 'Hi {{name}}, your cart is waiting!', previewLink: '' },
    { id: 'n3', type: 'split', x: 400, y: 450, condition: 'Did customer click link?' },
    { id: 'n4', type: 'action', channel: 'Voice Bot', x: 220, y: 590, title: 'Escalation Call', content: 'Press 1 to confirm your cart.', previewLink: '' },
    { id: 'n5', type: 'action', channel: 'SMS', x: 580, y: 590, title: 'Fallback Nudge', content: 'Use code CW10 for 10% off your cart.', previewLink: '' }
  ]
};

const INITIAL_EDGES: any = {
  'j1': [
    { id: 'e1', from: 'n1', to: 'n2', port: 'default' },
    { id: 'e2', from: 'n2', to: 'n3', port: 'default' },
    { id: 'e3', from: 'n3', to: 'n4', port: 'true' },
    { id: 'e4', from: 'n3', to: 'n5', port: 'false' }
  ]
};

// --- 3. MAIN APPLICATION ---
function CanvasApp() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('Connecting...');

  const [journeysList, setJourneysList] = useState<any[]>(INITIAL_JOURNEYS);
  const [activeJId, setActiveJId] = useState('j1');
  const [nodeData, setNodeData] = useState<any>(INITIAL_NODES);
  const [edgeData, setEdgeData] = useState<any>(INITIAL_EDGES);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [linking, setLinking] = useState<any>(null); 
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const [editingJId, setEditingJId] = useState<string | null>(null);
  const [draggedJIdx, setDraggedJIdx] = useState<number | null>(null);
  const isDraggingRef = useRef(false);

  // New states for inline auth
  const [showAuthInput, setShowAuthInput] = useState(false);
  const [authInput, setAuthInput] = useState('');

  // Cloud Sync Hooks
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.warn("Auth initializing locally."); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    setCloudStatus('Syncing...');
    
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'current');
    const unsubscribe = onSnapshot(docRef, (docSnap: any) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!isDraggingRef.current) {
          if (data.journeysList) setJourneysList(data.journeysList);
          if (data.nodeData) setNodeData(data.nodeData);
          if (data.edgeData) setEdgeData(data.edgeData);
        }
        setCloudStatus('Live Sync Active');
      } else {
        syncToCloud(INITIAL_JOURNEYS, INITIAL_NODES, INITIAL_EDGES);
      }
    }, () => {
      setCloudStatus('Offline');
    });

    return () => unsubscribe();
  }, [user]);

  const syncToCloud = async (jList: any, nData: any, eData: any) => {
    if (!user || !db) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'current'), {
        journeysList: jList, nodeData: nData, edgeData: eData, lastUpdated: new Date().toISOString()
      });
    } catch (e) { console.error("Save Error", e); }
  };

  // Admin Controls
  const toggleAdmin = () => {
    if (isAdmin) {
      setIsAdmin(false);
      setShowAuthInput(false);
    } else {
      setShowAuthInput(!showAuthInput);
      setAuthInput('');
    }
  };

  const handleAuthSubmit = () => {
    if (authInput === 'admin2024') {
      setIsAdmin(true);
      setShowAuthInput(false);
      setAuthInput('');
    } else {
      setAuthInput(''); // Clear on fail
    }
  };

  const saveAsDefault = async () => {
    if (!user || !db || !isAdmin) return;
    setCloudStatus('Locking Master...');
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'master_template'), {
      journeysList, nodeData, edgeData
    });
    setTimeout(() => setCloudStatus('Live Sync Active'), 2000);
  };

  const resetToDefault = async () => {
    if (!user || !db || !isAdmin) return;
    setCloudStatus('Restoring...');
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'master_template');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        await syncToCloud(data.journeysList, data.nodeData, data.edgeData);
      } else {
        await syncToCloud(INITIAL_JOURNEYS, INITIAL_NODES, INITIAL_EDGES);
      }
    } catch (e) { console.error(e); }
  };

  // Sidebar CRUD
  const handleAddJourney = () => {
    const newId = `j-${Date.now()}`;
    const newJourney = { id: newId, title: 'New Journey', desc: 'Custom workflow.' };
    const newList = [...journeysList, newJourney];
    setJourneysList(newList);
    setNodeData((p: any) => ({ ...p, [newId]: [] }));
    setEdgeData((p: any) => ({ ...p, [newId]: [] }));
    setActiveJId(newId);
    setEditingJId(newId);
    syncToCloud(newList, { ...nodeData, [newId]: [] }, { ...edgeData, [newId]: [] });
  };

  const handleRenameJourney = (id: string, newTitle: string) => {
    setJourneysList(prev => prev.map(j => j.id === id ? { ...j, title: newTitle } : j));
  };

  const commitJourneyRename = () => {
    setEditingJId(null);
    syncToCloud(journeysList, nodeData, edgeData);
  };

  const handleDuplicateJourney = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const journeyToCopy = journeysList.find(j => j.id === id);
    if (!journeyToCopy) return;

    const newId = `j-${Date.now()}`;
    const newJourney = { ...journeyToCopy, id: newId, title: `${journeyToCopy.title} (Copy)` };
    const newList = [...journeysList, newJourney];
    
    const oldNodes = nodeData[id] || [];
    const oldEdges = edgeData[id] || [];
    const idMap: any = {};
    
    const newNodes = oldNodes.map((n: any) => {
      const newNId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      idMap[n.id] = newNId;
      return { ...n, id: newNId };
    });
    
    const newEdges = oldEdges.map((e: any) => ({
      ...e,
      id: `e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from: idMap[e.from] || e.from,
      to: idMap[e.to] || e.to
    }));

    const newNodeData = { ...nodeData, [newId]: newNodes };
    const newEdgeData = { ...edgeData, [newId]: newEdges };

    setJourneysList(newList);
    setNodeData(newNodeData);
    setEdgeData(newEdgeData);
    setActiveJId(newId);
    
    syncToCloud(newList, newNodeData, newEdgeData);
  };

  const handleDeleteJourney = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newList = journeysList.filter(j => j.id !== id);
    setJourneysList(newList);
    if (activeJId === id && newList.length > 0) setActiveJId(newList[0].id);
    syncToCloud(newList, nodeData, edgeData);
  };

  // Canvas Logic
  const activeJourney = useMemo(() => journeysList.find(j => j.id === activeJId) || journeysList[0], [activeJId, journeysList]);
  const nodes = activeJourney ? (nodeData[activeJourney.id] || []) : [];
  const edges = activeJourney ? (edgeData[activeJourney.id] || []) : [];

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    if (dragNode) {
      isDraggingRef.current = true;
      setNodeData((prev: any) => ({
        ...prev,
        [activeJId]: prev[activeJId].map((n: any) => n.id === dragNode ? { ...n, x: x - dragOffset.x, y: y - dragOffset.y } : n)
      }));
    }
  };

  const handleMouseUp = () => {
    if (dragNode) {
      isDraggingRef.current = false;
      syncToCloud(journeysList, nodeData, edgeData);
      setDragNode(null);
    }
    setLinking(null); 
  };

  const handleStartNodeDrag = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragNode(id);
  };

  const handleStartLink = (e: React.MouseEvent, id: string, portType: string) => {
    e.stopPropagation(); e.preventDefault();
    setLinking({ fromId: id, portType });
  };

  const handleDropLinkOnNode = (e: React.MouseEvent, targetId: string) => {
    e.stopPropagation();
    if (linking && linking.fromId !== targetId) {
      const newEdge = { id: `e-${Date.now()}`, from: linking.fromId, to: targetId, port: linking.portType };
      const newEdgeData = { ...edgeData, [activeJId]: [...edges, newEdge] };
      setEdgeData(newEdgeData);
      syncToCloud(journeysList, nodeData, newEdgeData);
    }
    setLinking(null);
  };

  const addNode = (type: string, channel = 'WhatsApp') => {
    const newNode = {
      id: `node-${Date.now()}`, type, x: 400, y: 100,
      ...(type === 'action' ? { channel, title: `New ${channel}`, content: '', previewLink: '' } : {}),
      ...(type === 'delay' ? { value: 1, unit: 'Hours' } : {}),
      ...(type === 'split' ? { condition: '' } : {})
    };
    const newNodeData = { ...nodeData, [activeJId]: [...nodes, newNode] };
    setNodeData(newNodeData);
    syncToCloud(journeysList, newNodeData, edgeData);
  };

  const duplicateNode = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const nodeToCopy = nodes.find((n: any) => n.id === nodeId);
    if (!nodeToCopy) return;

    const newNode = {
      ...nodeToCopy,
      id: `node-${Date.now()}`,
      x: nodeToCopy.x + 40,
      y: nodeToCopy.y + 40
    };

    const newNodeData = { ...nodeData, [activeJId]: [...nodes, newNode] };
    setNodeData(newNodeData);
    syncToCloud(journeysList, newNodeData, edgeData);
  };

  const removeNode = (id: string) => {
    const newNodeData = { ...nodeData, [activeJId]: nodes.filter((n: any) => n.id !== id) };
    const newEdgeData = { ...edgeData, [activeJId]: edges.filter((e: any) => e.from !== id && e.to !== id) };
    setNodeData(newNodeData); setEdgeData(newEdgeData);
    syncToCloud(journeysList, newNodeData, newEdgeData);
  };

  const removeEdge = (id: string) => {
    const newEdgeData = { ...edgeData, [activeJId]: edges.filter((e: any) => e.id !== id) };
    setEdgeData(newEdgeData);
    syncToCloud(journeysList, nodeData, newEdgeData);
  };

  const updateNodeLocal = (id: string, data: any) => {
    setNodeData((p: any) => ({ ...p, [activeJId]: p[activeJId].map((n: any) => n.id === id ? { ...n, ...data } : n) }));
  };
  const commitNodeUpdate = () => syncToCloud(journeysList, nodeData, edgeData);

  const getNodeHeight = (type: string) => {
    if (type === 'trigger') return 70;
    if (type === 'delay') return 80;
    if (type === 'split') return 90;
    return 240; 
  };

  const calculatePath = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} C ${x1} ${y1 + 60}, ${x2} ${y2 - 60}, ${x2} ${y2}`;
  
  const getWireColor = (port: string) => port === 'true' ? '#32D74B' : port === 'false' ? '#FF453A' : '#5E5E62';

  return (
    <div 
      className="flex h-full min-h-screen bg-[#000000] text-gray-100 font-sans overflow-hidden select-none"
      onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
    >
      {/* SIDEBAR - Premium Frosted Glass */}
      <aside className="w-72 bg-[#1c1c1e]/80 backdrop-blur-2xl border-r border-white/10 flex flex-col shrink-0 z-50 shadow-2xl">
        <div className="px-6 py-6 border-b border-white/10">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-sm tracking-tight text-white">Cottonworld</h2>
            <button onClick={handleAddJourney} className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors" title="Add Journey"><Plus size={16} /></button>
          </div>
          <span className={`text-[9px] px-2.5 py-1 rounded-full font-semibold uppercase tracking-widest flex items-center w-max gap-1.5 ${cloudStatus === 'Live Sync Active' ? 'bg-[#32D74B]/10 text-[#32D74B] border border-[#32D74B]/20' : 'bg-[#FF9F0A]/10 text-[#FF9F0A] border border-[#FF9F0A]/20'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${cloudStatus === 'Live Sync Active' ? 'bg-[#32D74B] shadow-[0_0_8px_#32D74B]' : 'bg-[#FF9F0A]'}`}></div> {cloudStatus}
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1 custom-scrollbar">
          {journeysList.map((j: any, index: number) => (
            <div 
              key={j.id} 
              onClick={() => setActiveJId(j.id)} 
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 flex items-center justify-between group cursor-pointer ${activeJId === j.id ? 'bg-[#0A84FF] text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              {editingJId === j.id ? (
                <input 
                  autoFocus className="bg-[#2c2c2e] text-white outline-none w-full px-2 py-1 rounded-lg border border-[#0A84FF]" value={j.title}
                  onChange={(e) => handleRenameJourney(j.id, e.target.value)} onBlur={commitJourneyRename} onKeyDown={(e) => e.key === 'Enter' && commitJourneyRename()}
                />
              ) : (
                <span className="truncate flex-1" onDoubleClick={() => setEditingJId(j.id)}>{j.title}</span>
              )}
              {!editingJId || editingJId !== j.id ? (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); setEditingJId(j.id); }} className="p-1 text-white/50 hover:text-white transition-colors" title="Rename"><Edit2 size={12} /></button>
                  <button onClick={(e) => handleDuplicateJourney(j.id, e)} className="p-1 text-white/50 hover:text-[#0A84FF] transition-colors" title="Duplicate Journey"><Copy size={12} /></button>
                  <button onClick={(e) => handleDeleteJourney(j.id, e)} className="p-1 text-white/50 hover:text-[#FF453A] transition-colors" title="Delete Journey"><Trash2 size={12} /></button>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* ADMIN SECURITY PANEL */}
        <div className="p-4 border-t border-white/10 bg-[#1c1c1e]/90">
           {showAuthInput && !isAdmin && (
             <div className="mb-3 flex gap-2 animate-in fade-in zoom-in-95 duration-200">
               <input 
                 type="password" 
                 placeholder="Enter passcode..." 
                 className="flex-1 bg-[#2c2c2e] border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white outline-none focus:border-[#0A84FF] transition-colors shadow-inner"
                 value={authInput}
                 onChange={e => setAuthInput(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && handleAuthSubmit()}
               />
               <button 
                 onClick={handleAuthSubmit}
                 className="bg-[#0A84FF] hover:bg-[#007AFF] text-white px-3 py-2 rounded-lg text-[10px] font-bold transition-colors shadow-lg"
               >
                 GO
               </button>
             </div>
           )}

           <button 
             onClick={toggleAdmin}
             className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-semibold uppercase tracking-widest transition-all duration-300 ${isAdmin ? 'bg-[#0A84FF]/10 text-[#0A84FF] border border-[#0A84FF]/30' : 'bg-[#2c2c2e] text-gray-400 hover:bg-[#3a3a3c] hover:text-white border border-transparent'}`}
           >
             {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
             {isAdmin ? 'Admin Unlocked' : 'Admin Login'}
           </button>

           {isAdmin && (
             <div className="flex gap-2 mt-3 animate-in fade-in zoom-in-95 duration-200">
               <button onClick={saveAsDefault} className="flex-1 bg-[#2c2c2e] hover:bg-[#0A84FF] text-gray-300 hover:text-white py-2.5 rounded-xl text-[9px] font-bold uppercase flex flex-col items-center gap-1.5 transition-colors border border-white/5 hover:border-transparent shadow-sm">
                 <Save size={14} /> Save Master
               </button>
               <button onClick={resetToDefault} className="flex-1 bg-[#2c2c2e] hover:bg-[#FF453A] text-gray-300 hover:text-white py-2.5 rounded-xl text-[9px] font-bold uppercase flex flex-col items-center gap-1.5 transition-colors border border-white/5 hover:border-transparent shadow-sm">
                 <RefreshCw size={14} /> Reset Flow
               </button>
             </div>
           )}
        </div>
      </aside>

      {/* MAIN CANVAS */}
      <main className="flex-1 relative flex flex-col" ref={canvasRef}>
        
        {/* TOP TOOLBAR - Frosted */}
        <div className="bg-[#1c1c1e]/80 backdrop-blur-2xl border-b border-white/10 px-8 py-5 flex items-center justify-between z-40">
          <div>
             <h1 className="text-lg font-semibold text-white tracking-tight">{activeJourney?.title || 'No Journey Selected'}</h1>
             <p className="text-xs text-gray-400 mt-1">{activeJourney?.desc || 'Select a journey to begin.'}</p>
          </div>
          <div className="flex items-center gap-2">
             <ToolBtn icon={<Zap size={14}/>} label="Trigger" onClick={() => addNode('trigger')} />
             <ToolBtn icon={<MessageSquare size={14}/>} label="WhatsApp" onClick={() => addNode('action', 'WhatsApp')} />
             <ToolBtn icon={<Phone size={14}/>} label="Voice" onClick={() => addNode('action', 'Voice Bot')} />
             <ToolBtn icon={<Smartphone size={14}/>} label="SMS" onClick={() => addNode('action', 'SMS')} />
             <ToolBtn icon={<MessageCircleMore size={14}/>} label="RCS" onClick={() => addNode('action', 'RCS')} />
             <ToolBtn icon={<Clock size={14}/>} label="Delay" onClick={() => addNode('delay')} />
             <ToolBtn icon={<GitBranch size={14}/>} label="Split" onClick={() => addNode('split')} />
          </div>
        </div>

        {/* INTERACTIVE GRID */}
        <div className="flex-1 relative overflow-auto" style={{ backgroundImage: 'radial-gradient(#2c2c2e 1px, transparent 1px)', backgroundSize: '32px 32px' }}>
          
          <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none">
            {edges.map((e: any) => {
              const from = nodes.find((n: any) => n.id === e.from);
              const to = nodes.find((n: any) => n.id === e.to);
              if (!from || !to) return null;
              
              const x1 = from.x + 130; 
              const y1 = from.y + getNodeHeight(from.type);
              const x2 = to.x + 130;
              const y2 = to.y;
              const color = getWireColor(e.port);

              return (
                <g key={e.id}>
                  <path d={calculatePath(x1, y1, x2, y2)} stroke={color} strokeWidth="2.5" fill="none" />
                  <circle cx={(x1+x2)/2} cy={(y1+y2)/2} r="10" fill="#1c1c1e" stroke={color} strokeWidth="2" className="pointer-events-auto cursor-pointer hover:fill-white/10 transition-colors" onClick={() => removeEdge(e.id)} />
                  <text x={(x1+x2)/2} y={(y1+y2)/2 + 3} textAnchor="middle" fontSize="10" fill={color} className="pointer-events-none font-bold">×</text>
                </g>
              );
            })}

            {linking && (
              <path 
                d={calculatePath(nodes.find((n: any) => n.id === linking.fromId).x + 130, nodes.find((n: any) => n.id === linking.fromId).y + getNodeHeight(nodes.find((n: any) => n.id === linking.fromId).type), mousePos.x, mousePos.y)} 
                stroke={getWireColor(linking.portType)} strokeWidth="2.5" strokeDasharray="5,5" fill="none" 
              />
            )}
          </svg>

          {nodes.map((n: any) => (
            <div key={n.id} className="absolute z-10 flex flex-col items-center" style={{ left: n.x, top: n.y, width: '260px' }}>
              <div className={`w-full relative ${dragNode === n.id ? 'z-50' : 'z-20'}`}>
                
                <div className={`bg-[#1c1c1e]/95 backdrop-blur-xl rounded-2xl border flex flex-col overflow-hidden shadow-2xl transition-all duration-200 ${dragNode === n.id ? 'border-[#0A84FF] shadow-[0_0_40px_rgba(10,132,255,0.2)] scale-105' : 'border-white/10 hover:border-white/20'}`}>
                  
                  {linking && linking.fromId !== n.id && (
                    <div className="absolute inset-0 z-50 bg-[#0A84FF]/10 border-2 border-[#0A84FF] border-dashed cursor-crosshair transition-all rounded-2xl" onMouseUp={(e) => handleDropLinkOnNode(e, n.id)} />
                  )}

                  <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center cursor-grab active:cursor-grabbing bg-[#2c2c2e]/50" onMouseDown={(e) => handleStartNodeDrag(e, n.id)}>
                    <div className="flex items-center gap-2 text-gray-300">
                      <GripVertical size={14} className="text-gray-500" />
                      <span className="font-semibold text-[11px] tracking-wider uppercase">{n.channel || n.type}</span>
                    </div>
                    <div className="flex items-center">
                      <button onMouseDown={(e) => duplicateNode(e, n.id)} className="p-1.5 text-gray-500 hover:text-[#0A84FF] hover:bg-blue-900/30 rounded-md transition-colors mr-1" title="Duplicate Block">
                        <Copy size={14} />
                      </button>
                      <button onMouseDown={(e) => { e.stopPropagation(); removeNode(n.id); }} className="p-1.5 -mr-1.5 text-gray-500 hover:text-[#FF453A] hover:bg-red-900/30 rounded-md transition-colors" title="Delete Block">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 flex flex-col gap-3" onMouseDown={e => e.stopPropagation()}>
                    {n.type === 'trigger' && (
                      <input className="w-full text-sm font-semibold outline-none bg-transparent placeholder-gray-500 border-b border-transparent focus:border-[#0A84FF] pb-1 text-white transition-colors" value={n.label || ''} onChange={e => updateNodeLocal(n.id, { label: e.target.value })} onBlur={commitNodeUpdate} placeholder="Trigger Event..." />
                    )}
                    {n.type === 'delay' && (
                      <div className="flex items-center gap-2">
                        <input type="number" className="w-16 bg-[#2c2c2e] border border-white/5 p-2 text-xs font-medium rounded-lg outline-none focus:border-[#0A84FF] text-white transition-colors shadow-inner" value={n.value || ''} onChange={e => updateNodeLocal(n.id, { value: e.target.value })} onBlur={commitNodeUpdate} />
                        <select className="flex-1 bg-[#2c2c2e] border border-white/5 p-2 text-xs font-medium rounded-lg outline-none focus:border-[#0A84FF] cursor-pointer text-white transition-colors shadow-inner" value={n.unit || 'Hours'} onChange={e => { updateNodeLocal(n.id, { unit: e.target.value }); setTimeout(commitNodeUpdate, 100); }}>
                          <option>Minutes</option><option>Hours</option><option>Days</option>
                        </select>
                      </div>
                    )}
                    {n.type === 'split' && (
                      <input className="w-full bg-[#2c2c2e] border border-white/5 p-2.5 rounded-lg text-xs font-medium outline-none focus:border-[#0A84FF] placeholder-gray-500 text-white transition-colors shadow-inner" value={n.condition || ''} onChange={e => updateNodeLocal(n.id, { condition: e.target.value })} onBlur={commitNodeUpdate} placeholder="Condition..." />
                    )}
                    {n.type === 'action' && (
                      <>
                        <input className="w-full text-sm font-semibold outline-none bg-transparent placeholder-gray-500 border-b border-transparent focus:border-[#0A84FF] pb-1 text-white transition-colors" value={n.title || ''} onChange={e => updateNodeLocal(n.id, { title: e.target.value })} onBlur={commitNodeUpdate} placeholder="Message Title..." />
                        <textarea className="w-full bg-[#2c2c2e] border border-white/5 rounded-lg p-2.5 text-[11px] font-medium resize-none h-16 outline-none focus:border-[#0A84FF] placeholder-gray-500 text-gray-200 custom-scrollbar transition-colors shadow-inner leading-relaxed" value={n.content || ''} onChange={e => updateNodeLocal(n.id, { content: e.target.value })} onBlur={commitNodeUpdate} placeholder="Message content..." />
                        
                        <div className="flex flex-col gap-1.5 mt-2">
                           <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-500">Preview / Media URL</span>
                           <div className="flex items-center bg-[#2c2c2e] border border-white/5 rounded-lg overflow-hidden focus-within:border-[#0A84FF] transition-colors shadow-inner">
                              <div className="pl-2.5 text-gray-400"><LinkIcon size={12} /></div>
                              <input 
                                className="flex-1 bg-transparent p-2 text-[11px] text-white outline-none placeholder-gray-600" 
                                placeholder="Paste G-Drive or Call link..." 
                                value={n.previewLink || ''} 
                                onChange={e => updateNodeLocal(n.id, { previewLink: e.target.value })} 
                                onBlur={commitNodeUpdate}
                              />
                           </div>
                           {n.previewLink && n.previewLink.trim() !== '' && (
                              <a href={n.previewLink.startsWith('http') ? n.previewLink : `https://${n.previewLink}`} target="_blank" rel="noopener noreferrer" className="mt-1.5 w-full bg-[#0A84FF] hover:bg-[#007AFF] text-white py-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-lg">
                                Test / Preview ↗
                              </a>
                           )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* --- HOVER PLUS PORT --- */}
                <div className="absolute -bottom-3 left-0 w-full flex justify-center z-30 pointer-events-none">
                  <div className="pointer-events-auto relative group flex items-center justify-center bg-[#2c2c2e] border border-white/10 rounded-full shadow-lg hover:shadow-xl h-7 hover:h-8 hover:px-1.5 transition-all cursor-pointer">
                     {n.type === 'split' ? (
                        <>
                           <div className="w-7 h-full flex items-center justify-center text-gray-300 group-hover:hidden"><Plus size={14} strokeWidth={2.5} /></div>
                           <div className="hidden group-hover:flex gap-1.5">
                              <button onMouseDown={(e) => handleStartLink(e, n.id, 'true')} className="w-6 h-6 rounded-full bg-[#32D74B]/20 text-[#32D74B] hover:bg-[#32D74B] hover:text-white flex items-center justify-center transition-colors shadow-sm" title="True Path"><Check size={14} strokeWidth={3} /></button>
                              <button onMouseDown={(e) => handleStartLink(e, n.id, 'false')} className="w-6 h-6 rounded-full bg-[#FF453A]/20 text-[#FF453A] hover:bg-[#FF453A] hover:text-white flex items-center justify-center transition-colors shadow-sm" title="False Path"><X size={14} strokeWidth={3} /></button>
                           </div>
                        </>
                     ) : (
                        <button onMouseDown={(e) => handleStartLink(e, n.id, 'default')} className="w-7 h-full flex items-center justify-center text-gray-300 hover:text-white transition-colors" title="Drag to connect">
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
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #48484a; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #636366; }
      `}</style>
    </div>
  );
}

const ToolBtn = ({ icon, label, onClick }: any) => (
  <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2c2c2e] border border-white/10 rounded-lg text-[11px] font-medium text-gray-300 hover:border-white/20 hover:bg-[#3a3a3c] transition-all shadow-sm">
    <span className="opacity-80">{icon}</span> {label}
  </button>
);

// --- 4. FAIL-SAFE ERROR BOUNDARY ---
class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-[#000000] text-white font-sans p-10">
          <div className="bg-[#1c1c1e] border border-[#FF453A]/50 p-8 rounded-2xl max-w-xl shadow-2xl">
            <h1 className="text-xl font-semibold text-[#FF453A] mb-2">Workspace Encountered an Error</h1>
            <p className="text-sm text-gray-400 mb-6">Please refresh the page. If the issue persists, the shared configuration may be invalid.</p>
            <pre className="text-xs bg-[#2c2c2e] p-4 rounded-lg text-[#FF453A]/80 overflow-auto border border-white/5">{this.state.error?.toString()}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Root() {
  return <ErrorBoundary><CanvasApp /></ErrorBoundary>;
}