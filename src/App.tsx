import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  MessageSquare, Phone, Clock, Zap, Trash2, GitBranch, 
  Smartphone, MessageCircleMore, Plus, GripVertical, Image as ImageIcon, 
  Check, X, Edit2, Link as LinkIcon, ExternalLink, Lock, Unlock, Save, RefreshCw, Copy, WifiOff
} from 'lucide-react';

// --- 1. FIREBASE CONNECTION ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// Your live project credentials
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'cottonworld-unified-v1';

// --- 2. INITIAL STATE ---
const INITIAL_JOURNEYS = [
  { id: 'j1', title: 'Cart Abandonment', desc: 'WhatsApp/RCS + Voice Bot escalation.' },
  { id: 'j2', title: 'COD Verification', desc: 'Automated RTO reduction.' },
  { id: 'j3', title: 'Welcome Series', desc: 'New subscriber onboarding.' },
  { id: 'j4', title: 'Post-Purchase Review', desc: 'NPS & UGC collection.' },
  { id: 'j5', title: 'Browse Abandonment', desc: 'Retargeting high-interest browsers.' },
  { id: 'j6', title: 'Win-back Campaign', desc: '90-day inactive segment recovery.' },
  { id: 'j7', title: 'Replenishment', desc: 'Basics restock alerts.' },
  { id: 'j8', title: 'Birthday Rewards', desc: 'Annual personalization.' },
  { id: 'j9', title: 'Tracking Updates', desc: 'Shipping milestones.' },
  { id: 'j10', title: 'Payment Recovery', desc: 'Rescue for failed payments.' },
  { id: 'j11', title: 'Back in Stock', desc: 'Waitlist conversion.' },
  { id: 'j12', title: 'Price Drop', desc: 'Dynamic sale nudges.' },
  { id: 'j13', title: 'VIP Upgrade', desc: 'Tier milestone recognition.' },
  { id: 'j14', title: 'Flash Sale', desc: 'Mass-scale promotion.' }
];

const INITIAL_NODES: any = {
  'j1': [
    { id: 'n1', type: 'trigger', x: 450, y: 100, label: 'Checkout Abandoned' },
    { id: 'n2', type: 'action', channel: 'WhatsApp', x: 450, y: 220, title: 'Main Nudge', content: 'Hi {{name}}, your cart is waiting!', previewLink: '' }
  ]
};

// --- 3. MAIN APPLICATION ---
function CanvasApp() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('CONNECTING...');

  const [journeysList, setJourneysList] = useState<any[]>(INITIAL_JOURNEYS);
  const [activeJId, setActiveJId] = useState('j1');
  const [nodeData, setNodeData] = useState<any>(INITIAL_NODES);
  const [edgeData, setEdgeData] = useState<any>({});
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  const [showAuthInput, setShowAuthInput] = useState(false);
  const [authInput, setAuthInput] = useState('');

  // 1. Authenticate
  useEffect(() => {
    signInAnonymously(auth).catch(() => setCloudStatus('AUTH ERROR'));
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Real-time Subscription
  useEffect(() => {
    if (!user) return;
    setCloudStatus('SYNCING...');
    
    // Path follows Rule 1 for collaborative public data
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'current');
    
    const unsubscribe = onSnapshot(docRef, (docSnap: any) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!isDraggingRef.current) {
          if (data.journeysList) setJourneysList(data.journeysList);
          if (data.nodeData) setNodeData(data.nodeData);
          if (data.edgeData) setEdgeData(data.edgeData);
        }
        setCloudStatus('LIVE SYNC ACTIVE');
      } else {
        syncToCloud(INITIAL_JOURNEYS, INITIAL_NODES, {});
      }
    }, () => setCloudStatus('OFFLINE (Check Firestore Rules)'));

    return () => unsubscribe();
  }, [user]);

  const syncToCloud = async (jList: any, nData: any, eData: any) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'dashboardState', 'current'), {
        journeysList: jList,
        nodeData: nData,
        edgeData: eData,
        lastUpdated: new Date().toISOString()
      });
    } catch (e) { console.error("Firestore Write Error:", e); }
  };

  // UI Handlers
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
        [activeJId]: (prev[activeJId] || []).map((n: any) => n.id === dragNode ? { ...n, x: x - dragOffset.x, y: y - dragOffset.y } : n)
      }));
    }
  };

  const handleMouseUp = () => {
    if (dragNode) {
      isDraggingRef.current = false;
      syncToCloud(journeysList, nodeData, edgeData);
      setDragNode(null);
    }
  };

  const handleAddNode = (type: string, chan = 'WhatsApp') => {
    const newNode = {
      id: `node-${Date.now()}`, type, x: 450, y: 150,
      ...(type === 'action' ? { channel: chan, title: `New ${chan}`, content: '', previewLink: '' } : {}),
      ...(type === 'delay' ? { value: 1, unit: 'Hours' } : {}),
      ...(type === 'split' ? { condition: 'Logic' } : {})
    };
    const newNodeData = { ...nodeData, [activeJId]: [...(nodeData[activeJId] || []), newNode] };
    setNodeData(newNodeData);
    syncToCloud(journeysList, newNodeData, edgeData);
  };

  const activeJourney = useMemo(() => journeysList.find(j => j.id === activeJId) || journeysList[0], [activeJId, journeysList]);
  const nodes = activeJourney ? (nodeData[activeJourney.id] || []) : [];

  return (
    <div 
      className="flex h-screen bg-black text-gray-100 font-sans overflow-hidden select-none"
      onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
    >
      {/* SIDEBAR */}
      <aside className="w-72 bg-[#1c1c1e] border-r border-white/10 flex flex-col shrink-0 shadow-2xl z-50">
        <div className="p-8 border-b border-white/10">
          <h2 className="text-xl font-black italic uppercase tracking-tighter text-white mb-2 leading-none">Cottonworld</h2>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${cloudStatus.includes('LIVE') ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-red-500'}`} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{cloudStatus}</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
          {journeysList.map((j) => (
            <button 
              key={j.id} 
              onClick={() => setActiveJId(j.id)} 
              className={`w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeJId === j.id ? 'bg-[#0A84FF] text-white shadow-lg' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
            >
              {j.title}
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-white/10 bg-[#151517]">
          <button 
            onClick={() => setShowAuthInput(!showAuthInput)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors"
          >
            {isAdmin ? <Unlock size={14}/> : <Lock size={14}/>} {isAdmin ? 'ADMIN UNLOCKED' : 'ADMIN LOGIN'}
          </button>
          {showAuthInput && !isAdmin && (
            <div className="mt-3 flex gap-2">
              <input 
                type="password" placeholder="Passcode..." 
                className="flex-1 bg-black border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#0A84FF]"
                value={authInput} onChange={e => setAuthInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (authInput === 'admin2024' ? (setIsAdmin(true), setShowAuthInput(false)) : null)}
              />
            </div>
          )}
        </div>
      </aside>

      {/* CANVAS */}
      <main className="flex-1 relative overflow-hidden bg-[#0a0a0a]" ref={canvasRef}>
        <header className="absolute top-0 left-0 right-0 p-10 flex justify-between items-start z-40 pointer-events-none">
          <div className="pointer-events-auto">
            <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white leading-none mb-2">{activeJourney?.title}</h1>
            <p className="text-gray-500 text-sm">{activeJourney?.desc}</p>
          </div>
          <div className="flex gap-2 pointer-events-auto bg-[#1c1c1e] p-2 rounded-2xl border border-white/10 shadow-2xl">
            <ToolBtn icon={<Zap size={14}/>} onClick={() => handleAddNode('trigger')} />
            <ToolBtn icon={<MessageSquare size={14}/>} onClick={() => handleAddNode('action', 'WhatsApp')} />
            <ToolBtn icon={<Phone size={14}/>} onClick={() => handleAddNode('action', 'Voice Bot')} />
            <ToolBtn icon={<Clock size={14}/>} onClick={() => handleAddNode('delay')} />
            <ToolBtn icon={<GitBranch size={14}/>} onClick={() => handleAddNode('split')} />
          </div>
        </header>

        <div className="w-full h-full relative" style={{ backgroundImage: 'radial-gradient(#1c1c1e 2px, transparent 2px)', backgroundSize: '50px 50px' }}>
          {nodes.map((n: any) => (
            <div 
              key={n.id} 
              className="absolute w-[280px] bg-[#1c1c1e] border border-white/10 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] transition-all overflow-hidden" 
              style={{ left: n.x, top: n.y, transform: 'translate(-50%, -50%)' }}
            >
              <div 
                className="px-6 py-3 border-b border-white/5 flex justify-between items-center bg-white/5 cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => {
                  const rect = e.currentTarget.closest('div')!.getBoundingClientRect();
                  setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  setDragNode(n.id);
                }}
              >
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{n.channel || n.type}</span>
                <Trash2 size={14} className="text-gray-700 hover:text-red-500 cursor-pointer" onClick={() => removeNode(n.id)} />
              </div>
              <div className="p-6 space-y-4">
                <input 
                  className="bg-transparent text-lg font-bold text-white outline-none w-full border-b border-transparent focus:border-white/10 pb-1" 
                  value={n.label || n.title} 
                  onChange={e => {
                    const upd = n.type === 'trigger' ? { label: e.target.value } : { title: e.target.value };
                    setNodeData((p:any) => ({ ...p, [activeJId]: p[activeJId].map((node:any) => node.id === n.id ? {...node, ...upd} : node)}));
                  }}
                  onBlur={() => syncToCloud(journeysList, nodeData, edgeData)}
                />
                {n.type === 'action' && (
                  <>
                    <textarea 
                      className="w-full bg-black/40 p-4 rounded-2xl text-xs text-gray-400 italic leading-relaxed outline-none resize-none border border-white/5 focus:border-[#0A84FF]/30 h-24" 
                      value={n.content} 
                      onChange={e => {
                        setNodeData((p:any) => ({ ...p, [activeJId]: p[activeJId].map((node:any) => node.id === n.id ? {...node, content: e.target.value} : node)}));
                      }}
                      onBlur={() => syncToCloud(journeysList, nodeData, edgeData)}
                    />
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Media Link</span>
                      <div className="flex items-center bg-black rounded-xl px-3 py-2 border border-white/5">
                        <LinkIcon size={12} className="text-gray-600 mr-2"/>
                        <input 
                          className="bg-transparent text-[10px] text-gray-300 outline-none w-full" 
                          placeholder="Paste URL..." 
                          value={n.previewLink || ''}
                          onChange={e => {
                            setNodeData((p:any) => ({ ...p, [activeJId]: p[activeJId].map((node:any) => node.id === n.id ? {...node, previewLink: e.target.value} : node)}));
                          }}
                          onBlur={() => syncToCloud(journeysList, nodeData, edgeData)}
                        />
                      </div>
                      {n.previewLink && (
                        <a href={n.previewLink} target="_blank" className="bg-[#0A84FF] text-white py-2 rounded-xl text-[10px] font-bold text-center flex items-center justify-center gap-2">TEST PREVIEW <ExternalLink size={10}/></a>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#0A84FF] rounded-full border-4 border-black shadow-xl cursor-crosshair" />
            </div>
          ))}
        </div>
      </main>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #333; border-radius: 10px; }
      `}</style>
    </div>
  );

  function removeNode(id: string) {
    const newNodeData = { ...nodeData, [activeJId]: nodes.filter((n: any) => n.id !== id) };
    setNodeData(newNodeData);
    syncToCloud(journeysList, newNodeData, edgeData);
  }
}

const ToolBtn = ({ icon, onClick }: any) => (
  <button onClick={onClick} className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-90">
    {icon}
  </button>
);

export default function Root() { return <CanvasApp />; }