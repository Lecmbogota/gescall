import React, { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { TeleprompterWidget } from './TeleprompterWidget';
import { useTeleprompterSettings } from '../hooks/useTeleprompterSettings';
import socketService from '../services/socket';
import { StickyNotesWidget } from './StickyNotesWidget';
import GoalsWidget from './GoalsWidget';
import { useWebPhone } from '../hooks/useWebPhone';
import { FloatingTeleprompter } from './FloatingTeleprompter';
import AnimatedList from './AnimatedList';
import corporateHeaderBg from '../assets/corporate_header_bg.png';

const AVAILABLE_WIDGETS = [
  { id: 'metas', label: 'Meta de Ventas', icon: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></>, color: 'text-amber-500' },
  { id: 'notas', label: 'Notas Rápidas (Sticky)', icon: <><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></>, color: 'text-yellow-600' },
  { id: 'avisos', label: 'Aviso del Supervisor', icon: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>, color: 'text-indigo-500' },
  { id: 'calendario', label: 'Calendario y Callbacks', icon: <><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></>, color: 'text-blue-500' },
  { id: 'ranking', label: 'Ranking (Leaderboard)', icon: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></>, color: 'text-amber-500' },
  { id: 'teleprompter', label: 'Teleprompter Dinámico', icon: <><polygon points="5 3 19 12 5 21 5 3"/><line x1="19" y1="5" x2="19" y2="19"/></>, color: 'text-yellow-500' },
];

export const AgentWorkspace: React.FC = () => {
  const { session, logout } = useAuthStore();
  const [phoneNumber, setPhoneNumber] = useState('');
  
  const sipExtension = (session?.user as any)?.sip_extension;
  const sipPassword = (session?.user as any)?.sip_password;
  
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${window.location.hostname}/ws`;
  
  const { status: sipStatus, call: makeCall, answer, hangup, mute, audioRef, callerId } = useWebPhone(
    sipExtension, sipPassword, wsUrl
  );

  const callStatus = sipStatus === 'incall' ? 'connected' : (sipStatus === 'calling' ? 'calling' : 'idle');

  const [agentState, setAgentState] = useState<'ready' | 'not_ready'>(() => {
    const saved = localStorage.getItem('gescall_agentState');
    return saved ? (saved as 'ready' | 'not_ready') : 'ready';
  });
  const [isTipificarOpen, setIsTipificarOpen] = useState(false);
  const [selectedTypification, setSelectedTypification] = useState('');
  const [isPhoneExpanded, setIsPhoneExpanded] = useState(false);
  const [isWidgetManagerOpen, setIsWidgetManagerOpen] = useState(false);
  
  const defaultOrder = AVAILABLE_WIDGETS.map(w => w.id);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gescall_widget_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure all default widgets exist in the loaded order, append missing ones
        return [...new Set([...parsed, ...defaultOrder])];
      }
    } catch(e) {}
    return defaultOrder;
  });

  const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gescall_active_widgets');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return defaultOrder;
  });

  React.useEffect(() => {
    localStorage.setItem('gescall_widget_order', JSON.stringify(widgetOrder));
  }, [widgetOrder]);

  React.useEffect(() => {
    localStorage.setItem('gescall_active_widgets', JSON.stringify(activeWidgets));
  }, [activeWidgets]);

  const moveWidgetUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...widgetOrder];
    const temp = newOrder[index - 1];
    newOrder[index - 1] = newOrder[index];
    newOrder[index] = temp;
    setWidgetOrder(newOrder);
  };

  const moveWidgetDown = (index: number) => {
    if (index === widgetOrder.length - 1) return;
    const newOrder = [...widgetOrder];
    const temp = newOrder[index + 1];
    newOrder[index + 1] = newOrder[index];
    newOrder[index] = temp;
    setWidgetOrder(newOrder);
  };

  const [isTeleprompterVisible, setIsTeleprompterVisible] = useState(false);
  const { settings: teleprompterSettings, updateSetting: updateTeleprompterSetting } = useTeleprompterSettings();
  const [canManualDial, setCanManualDial] = useState(false); // Demo: Inbound only por defecto
  const [chatHeight, setChatHeight] = useState('h-[320px]');
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const [isSpeechExpanded, setIsSpeechExpanded] = useState(true);
  const [activeApp, setActiveApp] = useState<'home' | 'estado' | 'telefono' | 'historial' | 'chat'>('home');
  const [showContactCard, setShowContactCard] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);

  React.useEffect(() => {
    if (callStatus !== 'idle') {
      setShowContactCard(true);
    }
  }, [callStatus]);

  const PAUSE_CONFIG: Record<string, { name: string; limit: number }> = {
    'not_ready_bano': { name: 'Pausa - Baño', limit: 15 }, // 15 segundos para testing rápido
    'not_ready_almuerzo': { name: 'Pausa - Almuerzo', limit: 1800 },
    'not_ready_backoffice': { name: 'Pausa - Backoffice', limit: 900 },
    'not_ready_capacitacion': { name: 'Pausa - Capacitación', limit: 3600 },
    'not_ready': { name: 'No Disponible', limit: 600 },
  };

  const [pauseOverlay, setPauseOverlay] = useState<{
    isOpen: boolean;
    step: 'request_pin' | 'timer';
    targetStateId: string;
    targetStateName: string;
    limitSeconds: number;
    startTime: number;
  } | null>(() => {
    const saved = localStorage.getItem('gescall_pauseOverlay');
    return saved ? JSON.parse(saved) : null;
  });

  const [pausePinInput, setPausePinInput] = useState('');
  const [pauseElapsed, setPauseElapsed] = useState(() => {
    const saved = localStorage.getItem('gescall_pauseOverlay');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.step === 'timer') {
        return Math.floor((Date.now() - parsed.startTime) / 1000);
      }
    }
    return 0;
  });
  const [pinError, setPinError] = useState(false);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (pauseOverlay?.step === 'timer') {
      interval = setInterval(() => {
        setPauseElapsed(Math.floor((Date.now() - pauseOverlay.startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [pauseOverlay]);

  React.useEffect(() => {
    localStorage.setItem('gescall_agentState', agentState);
    
    // Determine detailed state string
    let detailedState = agentState.toUpperCase();
    if (callStatus === 'connected') detailedState = 'ON_CALL';
    if (callStatus === 'calling') detailedState = 'DIALING';
    if (isTipificarOpen) detailedState = 'WRAPUP';
    
    // Broadcast state to backend
    const username = (session?.user as any)?.username || (session?.user as any)?.name || 'AG';
    socketService.updateAgentState(username, detailedState);
  }, [agentState, callStatus, session]);

  React.useEffect(() => {
    if (pauseOverlay) {
      localStorage.setItem('gescall_pauseOverlay', JSON.stringify(pauseOverlay));
    } else {
      localStorage.removeItem('gescall_pauseOverlay');
    }
  }, [pauseOverlay]);

  const prevCallStatusRef = React.useRef(callStatus);
  React.useEffect(() => {
    if (prevCallStatusRef.current === 'connected' && callStatus === 'idle') {
      setIsTipificarOpen(true);
    }
    prevCallStatusRef.current = callStatus;
  }, [callStatus]);

  // Auto-expand WebPhone when a call is coming in or connected
  React.useEffect(() => {
    if (sipStatus === 'calling' || sipStatus === 'incall') {
      setIsPhoneExpanded(true);
      setActiveApp('telefono');
      if (activeWidgets.includes('teleprompter')) {
        setIsTeleprompterVisible(true);
      }
    } else if (sipStatus === 'disconnected' || sipStatus === 'registered') {
      // Automatically hide the teleprompter when the call ends
      setIsTeleprompterVisible(false);
    }
  }, [sipStatus, activeWidgets]);

  // Simulated inbound call removed for real SIP integration


  const handleDigitClick = (digit: string) => {
    if (callStatus === 'idle') setPhoneNumber((prev) => prev + digit);
  };

  const handleDial = () => {
    if (!phoneNumber) return;
    makeCall(phoneNumber);
  };

  const handleHangup = () => {
    hangup();
    setIsTipificarOpen(true);
  };

  const finishWrapup = () => {
    setPhoneNumber('');
    setIsTipificarOpen(false);
    setIsPhoneExpanded(false);
    setShowContactCard(false);
  };

  const dialpadDigits = [
    { num: '1', letters: '' }, { num: '2', letters: 'ABC' }, { num: '3', letters: 'DEF' },
    { num: '4', letters: 'GHI' }, { num: '5', letters: 'JKL' }, { num: '6', letters: 'MNO' },
    { num: '7', letters: 'PQRS' }, { num: '8', letters: 'TUV' }, { num: '9', letters: 'WXYZ' },
    { num: '*', letters: '' }, { num: '0', letters: '+' }, { num: '#', letters: '' }
  ];

  const renderWidgets = () => {
    const widgets = widgetOrder.map(widgetId => {
      if (!activeWidgets.includes(widgetId)) return null;

      switch (widgetId) {
          case 'metas':
            return <GoalsWidget key="metas" />;
            
          case 'notas':
            return <StickyNotesWidget key="notas" />;
            
          case 'avisos':
            return (
              <div key="avisos" className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl shadow-lg p-4 text-white group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-200"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                    Aviso del Supervisor
                  </div>
                  <button className="text-white/50 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
                <p className="text-xs text-indigo-100 leading-relaxed font-medium">
                  "Recuerden ofrecer el nuevo plan de 100GB a todos los clientes que llamen por lentitud en su internet hoy."
                </p>
              </div>
            );

          case 'teleprompter':
            return (
              <TeleprompterWidget 
                key="teleprompter"
                isVisible={isTeleprompterVisible}
                onToggleVisibility={() => setIsTeleprompterVisible(!isTeleprompterVisible)}
                settings={teleprompterSettings}
                onUpdateSetting={updateTeleprompterSetting}
              />
            );

          case 'calendario':
            return (
              <div key="calendario" className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-white/50 p-4 group">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
                    Callbacks Agendados
                  </div>
                  <button className="text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-blue-50 border border-blue-100">
                    <div className="flex flex-col items-center justify-center bg-white rounded-md w-10 h-10 shadow-sm border border-slate-100">
                      <span className="text-[9px] font-bold text-red-500 uppercase leading-none mt-1">Hoy</span>
                      <span className="text-sm font-black text-slate-700 leading-none mb-1">16:30</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-800">Carlos Mendoza</span>
                      <span className="text-[10px] text-slate-500">Renovación Póliza</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 border border-transparent transition-colors cursor-pointer">
                    <div className="flex flex-col items-center justify-center bg-slate-100 rounded-md w-10 h-10">
                      <span className="text-[9px] font-bold text-slate-400 uppercase leading-none mt-1">Mañana</span>
                      <span className="text-sm font-bold text-slate-600 leading-none mb-1">10:00</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-600">Empresa XYZ</span>
                      <span className="text-[10px] text-slate-400">Seguimiento B2B</span>
                    </div>
                  </div>
                </div>
              </div>
            );

          case 'ranking':
            return (
              <div key="ranking" className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 p-4 text-white group">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                    Top 3 - Ventas Hoy
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 bg-white/10 rounded-lg p-2 border border-yellow-400/30 shadow-[0_0_10px_rgba(250,204,21,0.1)]">
                    <div className="w-6 h-6 rounded-full bg-yellow-400 text-yellow-900 flex items-center justify-center font-black text-xs">1</div>
                    <span className="text-xs font-bold flex-1">María González</span>
                    <span className="text-xs font-black text-yellow-400">24</span>
                  </div>
                  <div className="flex items-center gap-3 bg-white/5 rounded-lg p-2">
                    <div className="w-6 h-6 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center font-black text-xs">2</div>
                    <span className="text-xs font-medium text-slate-300 flex-1">Tú (Agente Demo)</span>
                    <span className="text-xs font-bold text-slate-300">12</span>
                  </div>
                  <div className="flex items-center gap-3 bg-white/5 rounded-lg p-2 opacity-70">
                    <div className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center font-black text-xs">3</div>
                    <span className="text-xs font-medium text-slate-400 flex-1">Luis Fernando</span>
                    <span className="text-xs font-bold text-slate-400">9</span>
                  </div>
                </div>
              </div>
            );

          default:
            return null;
        }
    }).filter(Boolean);

    widgets.push(
      <div 
        key="add-new-widget"
        onClick={() => setIsWidgetManagerOpen(true)}
        className="w-full shrink-0 flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 text-slate-400 hover:text-indigo-500 transition-colors group cursor-pointer shadow-sm mt-2 mb-4"
      >
        <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        </div>
        <span className="text-[13px] font-bold tracking-wide">Agregar nuevo widget</span>
      </div>
    );
    
    return widgets;
  };

  const mockNotes = [
    { id: 1, agent: 'Carlos Martínez', date: '2023-10-24 10:15 AM', text: 'Cliente reportó lentitud intermitente. Se agendó revisión técnica.' },
    { id: 2, agent: 'Ana Sofía', date: '2023-10-25 02:30 PM', text: 'Se le ofreció el upgrade a 100GB pero indicó que lo pensará y llamará después.' },
    { id: 3, agent: 'Luis Fernando', date: 'Hoy 09:45 AM', text: 'Llama preguntando por el estatus del ticket técnico. Sigue en curso.' }
  ];

  return (
    <div className="flex h-full gap-6 w-full p-2 relative">
      <audio ref={audioRef} autoPlay className="hidden" />
      {pauseOverlay?.isOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full flex flex-col items-center relative overflow-hidden">
            {pauseOverlay.step === 'request_pin' ? (
              <>
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2 text-center">Autorizar Pausa</h2>
                <p className="text-slate-500 text-center mb-8">Por favor ingresa tu PIN de 4 dígitos para entrar en estado de <strong className="text-slate-700">{pauseOverlay.targetStateName}</strong>.</p>
                <input 
                  type="password" 
                  maxLength={4}
                  value={pausePinInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setPinError(false);
                    setPausePinInput(val);
                    if (val.length === 4) {
                      if (val === '1234') { // Mock PIN validation
                        setAgentState(pauseOverlay.targetStateId as any);
                        setPauseOverlay({ ...pauseOverlay, step: 'timer', startTime: Date.now() });
                        setPauseElapsed(0);
                        setTimeout(() => setPausePinInput(''), 100);
                      } else {
                        setPinError(true);
                        setTimeout(() => setPausePinInput(''), 400);
                      }
                    }
                  }}
                  className={`text-center text-4xl tracking-[1em] font-mono border-b-2 bg-slate-50 w-full py-4 rounded-xl outline-none transition-colors ${pinError ? 'border-red-500 text-red-500 bg-red-50' : 'border-indigo-200 focus:border-indigo-500 focus:bg-indigo-50/30 text-slate-800'}`}
                  placeholder="••••"
                  autoFocus
                />
                {pinError && <p className="text-red-500 text-sm mt-3 font-medium">PIN incorrecto. Intenta de nuevo.</p>}
                
                <button 
                  onClick={() => setPauseOverlay(null)}
                  className="mt-8 text-sm font-medium text-slate-400 hover:text-slate-600 underline underline-offset-4 transition-colors"
                >
                  Cancelar y regresar
                </button>
              </>
            ) : (
              <>
                <div className="absolute top-0 left-0 w-full h-2 bg-slate-100">
                  <div 
                    className={`h-full transition-all duration-1000 ${pauseElapsed > pauseOverlay.limitSeconds ? 'bg-red-500' : 'bg-green-500'}`} 
                    style={{ width: `${Math.min((pauseElapsed / pauseOverlay.limitSeconds) * 100, 100)}%` }}
                  ></div>
                </div>
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 mt-4 shadow-xl ${pauseElapsed > pauseOverlay.limitSeconds ? 'bg-red-50 text-red-500 shadow-red-100 animate-pulse' : 'bg-green-50 text-green-500 shadow-green-100'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">{pauseOverlay.targetStateName}</h2>
                <div className={`text-6xl font-light tabular-nums tracking-tight my-6 ${pauseElapsed > pauseOverlay.limitSeconds ? 'text-red-500 font-medium' : 'text-slate-800'}`}>
                  {String(Math.floor(pauseElapsed / 60)).padStart(2, '0')}:{String(pauseElapsed % 60).padStart(2, '0')}
                </div>
                {pauseElapsed > pauseOverlay.limitSeconds ? (
                  <p className="text-red-500 font-bold mb-8 px-4 py-2 bg-red-50 rounded-lg">¡Tiempo de pausa excedido!</p>
                ) : (
                  <p className="text-slate-500 mb-8">
                    Límite establecido: {pauseOverlay.limitSeconds < 60 ? `${pauseOverlay.limitSeconds} seg` : `${Math.floor(pauseOverlay.limitSeconds / 60)} min`}
                  </p>
                )}
                
                <div className="w-full bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <p className="text-sm font-bold text-slate-600 mb-4 text-center">INGRESA EL PIN PARA VOLVER A ESTAR DISPONIBLE</p>
                  <input 
                    type="password" 
                    maxLength={4}
                    value={pausePinInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setPinError(false);
                      setPausePinInput(val);
                      if (val.length === 4) {
                        if (val === '1234') {
                          setAgentState('ready');
                          setPauseOverlay(null);
                        } else {
                          setPinError(true);
                          setTimeout(() => setPausePinInput(''), 400);
                        }
                      }
                    }}
                    className={`text-center text-3xl tracking-[0.8em] font-mono border-b-2 bg-white w-full py-3 rounded-lg outline-none transition-colors ${pinError ? 'border-red-500 text-red-500' : 'border-slate-300 focus:border-indigo-500 text-slate-800'}`}
                    placeholder="••••"
                  />
                  {pinError && <p className="text-red-500 text-sm mt-2 text-center font-medium">PIN incorrecto</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Left Column: Agent Context & Status */}
      <div className={`shrink-0 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-5 flex flex-col justify-between relative transition-all duration-300 ${isLeftSidebarOpen ? 'w-[280px]' : 'w-[88px] items-center'}`}>
        <button 
          onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
          className={`absolute top-4 ${isLeftSidebarOpen ? 'right-4' : 'right-1/2 translate-x-1/2'} w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-all z-10`}
          title={isLeftSidebarOpen ? "Ocultar panel lateral" : "Mostrar panel lateral"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${!isLeftSidebarOpen ? 'rotate-180' : ''}`}><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="w-full">
          {/* Shift Stats / Queue */}
          <h2 className={`text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2 transition-all duration-300 ${isLeftSidebarOpen ? 'mb-4 opacity-100' : 'mb-6 opacity-0 h-0 overflow-hidden text-transparent select-none'}`}>
            Métricas de mi Turno
          </h2>
          <div className="flex flex-col gap-3 mb-6 w-full">
            <div className={`flex items-center p-3 rounded-lg bg-slate-50 border border-slate-100 transition-colors ${isLeftSidebarOpen ? 'justify-between' : 'justify-center cursor-pointer hover:bg-slate-100'}`} title="Tiempo Logueado: 04h 15m">
              <div className={`flex items-center gap-2 text-slate-600 font-medium ${isLeftSidebarOpen ? 'text-sm' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {isLeftSidebarOpen && "Tiempo Logueado"}
              </div>
              {isLeftSidebarOpen && <span className="text-sm font-bold text-slate-800">04h 15m</span>}
            </div>
            <div className={`flex items-center p-3 rounded-lg bg-slate-50 border border-slate-100 transition-colors ${isLeftSidebarOpen ? 'justify-between' : 'justify-center cursor-pointer hover:bg-slate-100'}`} title="Llamadas Hoy: 42">
              <div className={`flex items-center gap-2 text-slate-600 font-medium ${isLeftSidebarOpen ? 'text-sm' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                {isLeftSidebarOpen && "Llamadas Hoy"}
              </div>
              {isLeftSidebarOpen && <span className="text-sm font-bold text-slate-800">42</span>}
            </div>
            <div className={`flex items-center p-3 rounded-lg bg-red-50 border border-red-100 transition-colors ${isLeftSidebarOpen ? 'justify-between' : 'justify-center relative cursor-pointer hover:bg-red-100'}`} title="Llamadas en Cola: 5">
              <div className={`flex items-center gap-2 text-red-600 font-medium ${isLeftSidebarOpen ? 'text-sm' : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2"/><rect width="18" height="18" x="3" y="4" rx="2"/><circle cx="12" cy="10" r="2"/><line x1="8" x2="8" y1="2" y2="4"/><line x1="16" x2="16" y1="2" y2="4"/></svg>
                {isLeftSidebarOpen && "Llamadas en Cola"}
              </div>
              {isLeftSidebarOpen ? (
                <span className="text-sm font-black text-red-600 animate-pulse">5</span>
              ) : (
                <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-md">5</div>
              )}
            </div>
          </div>
        </div>

        {/* User Profile & Hidden Logout */}
        <div className={`pt-4 border-t border-slate-200 group relative w-full ${!isLeftSidebarOpen ? 'flex justify-center' : ''}`}>
          <div className={`flex items-center p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors ${isLeftSidebarOpen ? 'justify-between' : 'justify-center'}`} title="Cerrar sesión o ver perfil">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shadow-inner shrink-0">
                {((session?.user as any)?.username || (session?.user as any)?.name || 'AG').substring(0, 2).toUpperCase()}
              </div>
              {isLeftSidebarOpen && (
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-800 leading-tight">{(session?.user as any)?.username || (session?.user as any)?.name || 'Agente Demo'}</span>
                <span className="text-[10px] text-slate-500 uppercase">Extensión 104</span>
              </div>
              )}
            </div>
            {isLeftSidebarOpen && (
            <button className="p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
            </button>
            )}
          </div>
          
          {/* Hidden Logout Menu (appears on hover of the profile section) */}
          <div className="absolute bottom-full left-0 w-full pb-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
            <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-1">
              <button 
                onClick={logout}
                className={`w-full flex items-center gap-2 py-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium text-sm ${isLeftSidebarOpen ? 'px-4' : 'px-0 justify-center'}`}
                title="Cerrar Sesión"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                {isLeftSidebarOpen && "Cerrar Sesión"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Column: Customer 360 & Workspace */}
      <div className="flex-1 flex flex-col gap-4 h-full min-h-0">
        {/* Ficha de Contacto Panel */}
        {showContactCard && (
        <div className="flex-1 bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 flex flex-col overflow-hidden p-6 min-h-0 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex justify-between items-center mb-6 pb-5 border-b border-slate-200/60">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              {/* Campaign Name replaces Ficha de Contacto */}
              XIRA DEMO MEXICO
            </h2>
            <button 
              onClick={() => setIsTipificarOpen(true)}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm rounded-xl font-bold transition-all shadow-lg shadow-slate-200 hover:shadow-slate-300 hover:-translate-y-0.5 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
              Tipificar Llamada
            </button>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col pr-2 custom-scrollbar min-h-0">
            
            {/* Speech Teleprompter was here, moved to FloatingTeleprompter */}

            {/* Contact Profile Split Layout */}
            <div className="flex flex-col lg:flex-row gap-6 mb-8 items-stretch flex-1">
              
              {/* Left Column: Profile Snapshot */}
              <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4">
                <div className="bg-white rounded-[24px] border border-slate-200 p-6 flex flex-col items-center text-center shadow-sm relative overflow-hidden flex-1">
                  <div className="absolute top-0 left-0 w-full h-24 border-b border-slate-100/50" style={{ backgroundImage: `url(${corporateHeaderBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                    <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]"></div>
                  </div>
                  
                  <div className="w-20 h-20 rounded-full bg-white border-4 border-white shadow-md flex items-center justify-center text-slate-300 mb-4 z-10 relative mt-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  
                  <h3 className="text-xl font-black text-slate-800 leading-tight mb-1 relative z-10">Juan Pérez García</h3>
                  <p className="text-[13px] font-semibold text-slate-400 mb-6 relative z-10">juan.perez@example.com</p>

                  <div className="w-full flex flex-col gap-2.5 mt-auto">
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 rounded-2xl border border-slate-100/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</span>
                      <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100/50 shadow-sm">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Al corriente
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 rounded-2xl border border-slate-100/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Plan</span>
                      <span className="text-[12px] font-bold text-slate-700">Premium 50GB</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 rounded-2xl border border-slate-100/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Campaña</span>
                      <span className="text-[12px] font-bold text-slate-700">XIRA DEMO MEXICO</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Interaction & Notes */}
              <div className="flex-1 flex flex-col gap-6">
                
                {/* Contact Channels Grid */}
                <div className="bg-white rounded-[24px] border border-slate-200 p-6 shadow-sm">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                     Canales de Contacto Directo
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div 
                      onDoubleClick={() => makeCall('+525598765432')}
                      className="bg-slate-50/60 rounded-[16px] border border-slate-200/60 p-4 shadow-sm flex items-center gap-4 group hover:border-indigo-300 hover:bg-white hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400">LLAMAR AL CLIENTE</span>
                        <span className="text-[14px] font-bold text-slate-800">+52 55 9876 5432</span>
                      </div>
                    </div>
                    <div className="bg-slate-50/60 rounded-[16px] border border-slate-200/60 p-4 shadow-sm flex items-center gap-4 group hover:border-emerald-300 hover:bg-white hover:shadow-md transition-all cursor-pointer">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400">MENSAJE WHATSAPP</span>
                        <span className="text-[14px] font-bold text-slate-800">+52 55 9876 5432</span>
                      </div>
                    </div>
                    <div className="bg-slate-50/60 rounded-[16px] border border-slate-200/60 p-4 shadow-sm flex items-center gap-4 group hover:border-blue-300 hover:bg-white hover:shadow-md transition-all cursor-pointer">
                      <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400">CHAT DE TELEGRAM</span>
                        <span className="text-[14px] font-bold text-slate-800">juanperez_mx</span>
                      </div>
                    </div>
                    <div className="bg-slate-50/30 rounded-[16px] border border-slate-200/40 p-4 shadow-sm flex items-center gap-4 opacity-50 grayscale cursor-not-allowed">
                      <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l16 16"/><path d="M4 20L20 4"/></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400">TWITTER / X</span>
                        <span className="text-[14px] font-bold text-slate-500">No asociado</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes Block */}
                <div className="flex flex-col flex-1 min-h-[180px] group">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2 group-focus-within:text-slate-700 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                    Registro de Notas
                  </span>
                  <div className="relative flex-1 flex flex-col rounded-[24px] border border-slate-200 shadow-sm bg-white overflow-hidden focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all">
                    
                    {/* Notes History (Scrollable) */}
                    <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 custom-scrollbar bg-slate-50/50">
                      {mockNotes.map((note) => (
                        <div key={note.id} className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                              {note.agent.substring(0,2).toUpperCase()}
                            </div>
                            <span className="text-[12px] font-bold text-slate-700">{note.agent}</span>
                            <span className="text-[10px] text-slate-400 font-medium ml-auto">{note.date}</span>
                          </div>
                          <div className="ml-8 bg-white border border-slate-200/80 rounded-2xl rounded-tl-none p-3 shadow-sm relative">
                            <p className="text-[13px] text-slate-600 leading-relaxed">{note.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* New Note Input Area */}
                    <div className="bg-white border-t border-slate-100 flex flex-col shrink-0">
                      <div className="bg-slate-50/80 border-b border-slate-100 flex gap-1 px-4 py-2 shrink-0">
                        <button className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors" title="Negrita"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 12a4 4 0 0 0 0-8H6v8"/><path d="M15 20a4 4 0 0 0 0-8H6v8Z"/></svg></button>
                        <button className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors" title="Cursiva"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg></button>
                        <div className="w-px h-4 bg-slate-200 my-auto mx-2"></div>
                        <button className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors" title="Lista"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></button>
                      </div>
                      <div className="flex items-end p-3 gap-3">
                        <textarea 
                          className="w-full h-[50px] bg-transparent text-slate-800 text-[13px] resize-none outline-none placeholder:text-slate-400 font-medium leading-relaxed custom-scrollbar"
                          placeholder="Escribe una nueva nota..."
                        ></textarea>
                        <button className="w-9 h-9 shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-200 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
            
          </div>
        </div>
        )}

        {!showContactCard && (
          <div className="flex-1 overflow-y-auto scroll-smooth custom-scrollbar pt-4 pb-6 px-4 animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-[22px] font-bold text-slate-800/80 mb-6 flex items-center gap-3 px-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
              Tu Espacio de Trabajo
            </h2>
            <div className="columns-1 lg:columns-2 xl:columns-3 gap-6 [&>*]:break-inside-avoid [&>*]:mb-6">
              {renderWidgets()}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: WebPhone & Widgets */}
      <div className="w-[320px] flex flex-col h-full relative">
        {/* iPhone WebPhone Container (Fixed) */}
        <div className="shrink-0 pt-2 z-40 flex justify-center mb-6">
          <div 
            className={`bg-[#0A0A0C] shadow-2xl relative overflow-hidden flex flex-col transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] mx-auto 
              ${isPhoneExpanded 
                ? 'w-[300px] h-[600px] rounded-[45px] border-[6px] border-slate-800' 
                : (callStatus !== 'idle' 
                    ? 'w-[280px] h-[64px] rounded-[32px] border-[2px] border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.3)] cursor-pointer hover:border-green-400' 
                    : (canManualDial 
                        ? 'w-[300px] h-[72px] rounded-[36px] border-[4px] border-slate-800 cursor-pointer hover:border-slate-700'
                        : 'w-[240px] h-[44px] rounded-[22px] border-[2px] border-slate-800 cursor-pointer hover:border-slate-700')
                  )
              }`}
            onClick={() => {
              if (!isPhoneExpanded) {
                setIsPhoneExpanded(true);
              }
            }}
            onWheel={(e) => {
              // Avoid contracting when scrolling inside scrollable apps
              if (['chat', 'historial', 'estado'].includes(activeApp)) return;
              
              if (e.deltaY > 0 && isPhoneExpanded) {
                setIsPhoneExpanded(false);
              } else if (e.deltaY < 0 && !isPhoneExpanded) {
                setIsPhoneExpanded(true);
              }
            }}
          >
            {/* Compact Mini Phone Content (Fades out when expanded) */}
            <div className={`absolute inset-0 flex items-center justify-between px-4 transition-opacity duration-300 ${!isPhoneExpanded ? 'opacity-100 delay-200 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
              {callStatus !== 'idle' ? (
                <div className="w-full flex items-center justify-between px-1">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center animate-pulse">
                       <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                     </div>
                     <div className="flex flex-col">
                        <span className="text-white text-xs font-bold">{phoneNumber}</span>
                        <span className="text-green-400 text-[10px] font-mono">{callStatus === 'connected' ? '00:03' : 'Llamando...'}</span>
                     </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-end gap-0.5 h-3 mr-2">
                      <div className="w-0.5 h-1 bg-green-500 animate-pulse"></div>
                      <div className="w-0.5 h-2 bg-green-500 animate-pulse delay-75"></div>
                      <div className="w-0.5 h-3 bg-green-500 animate-pulse delay-150"></div>
                      <div className="w-0.5 h-1.5 bg-green-500 animate-pulse delay-300"></div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleHangup(); setIsPhoneExpanded(true); }} className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors shadow-md shadow-red-500/20" title="Colgar">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" x2="1" y1="1" y2="23"></line></svg>
                    </button>
                  </div>
                </div>
              ) : canManualDial ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#333333] rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                    </div>
                    <span className={`text-xl font-light tracking-widest ${phoneNumber ? 'text-white' : 'text-slate-500'}`}>
                      {phoneNumber || 'Marcar...'}
                    </span>
                  </div>
                  <button className="w-12 h-12 rounded-full flex items-center justify-center bg-[#34C759] shadow-lg shadow-green-900/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  </button>
                </>
              ) : (
                <div className={`w-full flex items-center justify-center gap-2 ${sipStatus === 'registered' ? 'text-green-400' : sipStatus === 'disconnected' ? 'text-red-400' : 'text-slate-400'}`}>
                  <div className="relative flex items-center justify-center w-3 h-3">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 ${sipStatus === 'registered' ? 'bg-green-500' : sipStatus === 'disconnected' ? 'bg-red-500' : 'bg-slate-500'}`}></span>
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${sipStatus === 'registered' ? 'bg-green-400' : sipStatus === 'disconnected' ? 'bg-red-400' : 'bg-slate-400'}`}></span>
                  </div>
                  <span className="text-xs font-medium tracking-wide">
                    {sipStatus === 'registered' ? 'Disponible' : 
                     sipStatus === 'disconnected' ? 'Desconectado' : 
                     sipStatus === 'connecting' ? 'Conectando...' : 
                     'Esperando...'}
                  </span>
                </div>
              )}
            </div>

            {/* Full iPhone Content (Fades in when expanded) */}
            <div className={`absolute inset-0 flex flex-col p-4 transition-opacity duration-300 ${isPhoneExpanded ? 'opacity-100 delay-200 z-10' : 'opacity-0 pointer-events-none z-0'}`}>
              
            {/* Dynamic Island glow effect & Collapse button */}
            {callStatus !== 'idle' ? (
              <div 
                className="absolute top-4 left-1/2 -translate-x-1/2 w-44 h-8 bg-black border border-green-500/30 rounded-full z-20 flex justify-between items-center pl-3 pr-1 shadow-[0_0_15px_rgba(34,197,94,0.3)] cursor-pointer group"
                onClick={(e) => { e.stopPropagation(); setIsPhoneExpanded(false); }}
                title="Contraer"
              >
                 <div className="flex items-center gap-1.5">
                   <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                   </div>
                   {callStatus === 'connected' && (
                     <div className="flex gap-0.5">
                        <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <div className="w-1 h-2 bg-green-500 rounded-full animate-pulse delay-75"></div>
                        <div className="w-1 h-2.5 bg-green-500 rounded-full animate-pulse delay-150"></div>
                     </div>
                   )}
                 </div>
                 <span className="text-green-500 text-xs font-bold font-mono">{callStatus === 'calling' ? 'Calling' : '00:03'}</span>
                 
                 <div className="w-6 h-6 rounded-full flex items-center justify-center text-green-500/50 group-hover:bg-green-500/20 group-hover:text-green-500 transition-colors">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                 </div>
              </div>
            ) : (
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 h-6 bg-black rounded-b-xl z-20 flex justify-center items-center px-4 cursor-pointer group"
                onClick={(e) => { e.stopPropagation(); setIsPhoneExpanded(false); }}
                title="Contraer"
              >
                 <div className="w-8 h-1.5 bg-slate-800 rounded-full mr-3"></div>
                 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 group-hover:text-slate-400 transition-colors"><path d="m18 15-6-6-6 6"/></svg>
              </div>
            )}

            {/* Display / Input for Idle state */}
            {callStatus === 'idle' ? (
              activeApp === 'home' ? (
                <>
                  {/* iPhone Apps Grid */}
                  <div className="w-full pt-14 px-3 grid grid-cols-4 gap-y-6 justify-items-center">
                    {/* App: Estado del Agente */}
                    <div 
                      className="relative flex flex-col items-center gap-1.5 group cursor-pointer"
                      onClick={() => setActiveApp('estado')}
                    >
                      <div className={`w-[52px] h-[52px] rounded-[14px] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform group-active:scale-95 ${agentState === 'ready' ? 'bg-gradient-to-b from-[#32D74B] to-[#28CD41]' : 'bg-gradient-to-b from-[#FF9F0A] to-[#FF8A00]'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                      </div>
                      <span className="text-[11px] text-white font-medium tracking-wide drop-shadow-md">Estado</span>
                    </div>

                    {/* App: Teléfono */}
                    <div 
                      className="relative flex flex-col items-center gap-1.5 group cursor-pointer"
                      onClick={() => setActiveApp('telefono')}
                    >
                      <div className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform group-active:scale-95 bg-gradient-to-b from-[#32D74B] to-[#28CD41]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                      </div>
                      <span className="text-[11px] text-white font-medium tracking-wide drop-shadow-md">Teléfono</span>
                    </div>

                    {/* App: Historial */}
                    <div 
                      className="relative flex flex-col items-center gap-1.5 group cursor-pointer"
                      onClick={() => setActiveApp('historial')}
                    >
                      <div className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform group-active:scale-95 bg-gradient-to-b from-[#0A84FF] to-[#006EE6]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </div>
                      <span className="text-[11px] text-white font-medium tracking-wide drop-shadow-md">Historial</span>
                    </div>

                    {/* App: Chat Interno */}
                    <div 
                      className="relative flex flex-col items-center gap-1.5 group cursor-pointer"
                      onClick={() => setActiveApp('chat')}
                    >
                      <div className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-transform group-active:scale-95 bg-gradient-to-b from-[#34C759] to-[#248A3D] relative">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-2 border-[#0A0A0C] flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white">2</span>
                        </div>
                      </div>
                      <span className="text-[11px] text-white font-medium tracking-wide drop-shadow-md">Chat</span>
                    </div>
                  </div>
                </>
              ) : activeApp === 'telefono' ? (
                /* iOS Phone App View (Dialpad) */
                <div className="absolute inset-0 bg-[#0A0A0C] z-30 flex flex-col rounded-[39px] overflow-hidden">
                  <div className="pt-12 pb-2 px-4 flex items-center relative shrink-0">
                    <button 
                      onClick={() => setActiveApp('home')}
                      className="absolute left-4 flex items-center text-green-500 hover:opacity-70 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                      <span className="text-[17px]">Inicio</span>
                    </button>
                  </div>
                  <div className="w-full flex-1 flex flex-col justify-end pb-4 relative">
                    <input 
                      type="text" 
                      value={phoneNumber}
                      className="w-full bg-transparent text-center text-4xl font-light text-white focus:outline-none tracking-widest h-10"
                      readOnly
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-4 w-full mb-8 px-4">
                    {dialpadDigits.map((item, idx) => (
                      <button key={idx} onClick={() => handleDigitClick(item.num)} className="w-16 h-16 rounded-full flex flex-col items-center justify-center bg-[#333333] hover:bg-[#444444] active:bg-[#555555] transition-colors mx-auto">
                        <span className={`text-3xl font-light text-white leading-none ${item.num === '*' ? 'mt-2' : ''}`}>{item.num}</span>
                        {item.letters && <span className="text-[9px] font-bold tracking-widest text-slate-400 leading-none mt-0.5">{item.letters}</span>}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-center w-full px-4 mb-8">
                    <button onClick={handleDial} className="w-16 h-16 rounded-full flex items-center justify-center bg-[#34C759] hover:bg-[#30B753] mx-auto shadow-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    </button>
                  </div>
                </div>
              ) : activeApp === 'estado' ? (
                /* iOS Settings-style App View for Agent State */
                <div className="absolute inset-0 bg-[#f2f2f7] z-30 flex flex-col rounded-[39px] overflow-hidden">
                  {/* iOS App Header */}
                  <div className="pt-12 pb-3 px-4 bg-[#f2f2f7] border-b border-slate-300 flex items-center relative shrink-0">
                    <button 
                      onClick={() => setActiveApp('home')}
                      className="absolute left-4 flex items-center text-[#007aff] hover:opacity-70 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                      <span className="text-[17px]">Atrás</span>
                    </button>
                    <h2 className="text-[17px] font-semibold text-black mx-auto">Estado</h2>
                  </div>
                  
                  {/* iOS List Content */}
                  <div className="flex-1 overflow-y-auto px-4 py-6">
                    <h3 className="text-[13px] uppercase text-slate-500 font-medium ml-4 mb-2 tracking-wide">Disponibilidad</h3>
                    <div className="bg-white rounded-xl overflow-hidden mb-6">
                      <div 
                        className="flex items-center justify-between p-4 border-b border-slate-100 active:bg-slate-50 cursor-pointer"
                        onClick={() => { setAgentState('ready'); setActiveApp('home'); }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-md bg-[#34C759] flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                          </div>
                          <span className="text-[17px] text-black">Disponible (Ready)</span>
                        </div>
                        {agentState === 'ready' && <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                      </div>
                      <div 
                        className="flex items-center justify-between p-4 active:bg-slate-50 cursor-pointer"
                        onClick={() => {
                          const config = PAUSE_CONFIG['not_ready'];
                          setPauseOverlay({ isOpen: true, step: 'request_pin', targetStateId: 'not_ready', targetStateName: config.name, limitSeconds: config.limit, startTime: 0 });
                          setPausePinInput('');
                          setPinError(false);
                          setActiveApp('home');
                          setIsPhoneExpanded(false);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-md bg-[#FF3B30] flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                          </div>
                          <span className="text-[17px] text-black">No Disponible</span>
                        </div>
                        {agentState === 'not_ready' && <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                      </div>
                    </div>

                    <h3 className="text-[13px] uppercase text-slate-500 font-medium ml-4 mb-2 tracking-wide">Pausas Auxiliares</h3>
                    <div className="bg-white rounded-xl overflow-hidden">
                      {[
                        { id: 'not_ready_bano', label: 'Pausa - Baño', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
                        { id: 'not_ready_almuerzo', label: 'Pausa - Almuerzo', icon: 'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3' },
                        { id: 'not_ready_backoffice', label: 'Pausa - Backoffice', icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' },
                        { id: 'not_ready_capacitacion', label: 'Pausa - Capacitación', icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' }
                      ].map((pausa, idx, arr) => (
                        <div 
                          key={pausa.id}
                          className={`flex items-center justify-between p-4 active:bg-slate-50 cursor-pointer ${idx !== arr.length - 1 ? 'border-b border-slate-100' : ''}`}
                          onClick={() => {
                            const config = PAUSE_CONFIG[pausa.id];
                            setPauseOverlay({ isOpen: true, step: 'request_pin', targetStateId: pausa.id, targetStateName: config.name, limitSeconds: config.limit, startTime: 0 });
                            setPausePinInput('');
                            setPinError(false);
                            setActiveApp('home');
                            setIsPhoneExpanded(false);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-md bg-[#FF9500] flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={pausa.icon}/></svg>
                            </div>
                            <span className="text-[17px] text-black">{pausa.label}</span>
                          </div>
                          {agentState === pausa.id && <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : activeApp === 'historial' ? (
                /* iOS Historial App View */
                <div className="absolute inset-0 bg-white z-30 flex flex-col rounded-[39px] overflow-hidden">
                  <div className="pt-12 pb-2 px-4 flex items-center border-b border-slate-100 relative shrink-0">
                    <button 
                      onClick={() => setActiveApp('home')}
                      className="absolute left-4 flex items-center text-[#007aff] hover:opacity-70 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                      <span className="text-[17px]">Atrás</span>
                    </button>
                    <h2 className="text-[17px] font-semibold text-black mx-auto">Recientes</h2>
                  </div>
                  <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
                    {/* Dummy History Items */}
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
                        <div className="flex flex-col">
                          <span className={`text-[17px] font-medium ${i % 2 === 0 ? 'text-red-500' : 'text-black'}`}>
                            {i % 2 === 0 ? '+52 55 1234 5678' : 'Carlos Mendoza'}
                          </span>
                          <span className="text-[13px] text-slate-500">Móvil</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <span className="text-[15px]">{i === 1 ? '10:45' : i === 2 ? 'Ayer' : 'Lunes'}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeApp === 'chat' ? (
                /* iOS Chat App View */
                <div className="absolute inset-0 bg-[#F2F2F7] z-30 flex flex-col rounded-[39px] overflow-hidden">
                  <div className="pt-12 pb-2 px-4 flex items-center bg-white/80 backdrop-blur-md border-b border-slate-200 relative shrink-0 z-10">
                    <button 
                      onClick={() => setActiveApp('home')}
                      className="absolute left-4 flex items-center text-[#007aff] hover:opacity-70 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                      <span className="text-[17px] ml-0.5">Atrás</span>
                    </button>
                    <div className="flex flex-col items-center mx-auto">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center mb-0.5">
                        <span className="text-xs font-semibold text-slate-500">Sup</span>
                      </div>
                      <h2 className="text-[11px] font-semibold text-black">Supervisor</h2>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 custom-scrollbar relative">
                    <div className="text-center text-[11px] text-slate-400 font-medium my-2">Hoy 10:41</div>
                    <div className="self-end bg-[#007aff] text-white text-[15px] px-3.5 py-2 rounded-2xl rounded-br-sm max-w-[80%] shadow-sm">
                      Supervisor, ¿puedo aplicar el 15% a este cliente que amenaza con irse?
                    </div>
                    <div className="self-start bg-white text-black text-[15px] px-3.5 py-2 rounded-2xl rounded-bl-sm max-w-[80%] border border-slate-200 shadow-sm">
                      Sí, aplícalo pero asegúrate de renovarlo por 12 meses.
                    </div>
                    <div className="self-end bg-[#007aff] text-white text-[15px] px-3.5 py-2 rounded-2xl rounded-br-sm max-w-[80%] shadow-sm">
                      Perfecto, ya logré cerrar la retención. ¡Gracias!
                    </div>
                    <div className="self-start bg-white text-black text-[15px] px-3.5 py-2 rounded-2xl rounded-bl-sm max-w-[80%] border border-slate-200 shadow-sm">
                      ¡Excelente trabajo! Sigue así.
                    </div>
                  </div>
                  
                  <div className="p-3 bg-[#F2F2F7] border-t border-slate-200 shrink-0 flex items-end gap-2 relative z-10 pb-8">
                    <div className="flex-1 bg-white border border-slate-300 rounded-2xl min-h-[36px] flex items-center px-3 shadow-sm">
                      <input type="text" placeholder="iMessage" className="w-full text-[15px] bg-transparent outline-none py-1.5 text-black" />
                    </div>
                    <button className="w-9 h-9 rounded-full bg-[#007aff] flex items-center justify-center shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="translate-x-[-1px] translate-y-[1px]"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                    </button>
                  </div>
                </div>
              ) : null
            ) : (
              /* Active Call Screen */
              <>
                <div className="w-full mt-24 flex flex-col items-center">
                   {/* Nice gradient avatar with pulse effect */}
                   <div className="relative mb-6">
                     <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20"></div>
                     <div className="relative w-24 h-24 bg-gradient-to-tr from-slate-700 to-slate-800 rounded-full flex items-center justify-center shadow-2xl border border-slate-600/50">
                       <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                     </div>
                   </div>
                   <h2 className="text-[32px] font-extralight text-white mb-2">Cliente</h2>
                   <p className="text-base text-slate-400 font-light tracking-[0.2em]">{callerId || phoneNumber || '+52 55 1234 5678'}</p>
                </div>

                <div className="flex justify-center gap-5 w-full mt-auto mb-10 px-4">
                   <div className="flex flex-col items-center gap-2.5">
                     <button className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all">
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                     </button>
                     <span className="text-[11px] font-medium text-slate-300">silenciar</span>
                   </div>
                   <div className="flex flex-col items-center gap-2.5">
                     <button className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all">
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                     </button>
                     <span className="text-[11px] font-medium text-slate-300">espera</span>
                   </div>
                   <div className="flex flex-col items-center gap-2.5">
                     <button className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all">
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"></path><path d="M21 3 9 15"></path><path d="M15 21H3V9"></path></svg>
                     </button>
                     <span className="text-[11px] font-medium text-slate-300">transferir</span>
                   </div>
                </div>
                
                <div className="flex justify-center w-full mb-12">
                  <button onClick={handleHangup} className="w-[72px] h-[72px] rounded-full bg-gradient-to-b from-[#FF453A] to-[#D70015] hover:from-[#FF5E55] hover:to-[#FF3B30] flex items-center justify-center shadow-[0_10px_20px_rgba(215,0,21,0.4)] transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{transform: "rotate(135deg)"}}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                  </button>
                </div>
              </>
            )}
            
            {/* Home Indicator */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-600 rounded-full"></div>
            </div>
          </div>
        </div>



        {/* Widgets Panel (Scrollable) */}
        {showContactCard && (
          <AnimatedList displayScrollbar={false} className="animate-in fade-in slide-in-from-right-8 duration-300">
            {renderWidgets()}
          </AnimatedList>
        )}
      </div>

      {/* Tipificar Modal */}
      {isTipificarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsTipificarOpen(false)}></div>
          <div className="relative bg-white w-[750px] h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 p-6 z-10 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center mb-5 pb-4 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                Tipificar Interacción
              </h3>
              <button onClick={() => setIsTipificarOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto pr-3 -mr-3 custom-scrollbar flex flex-col">
              {selectedTypification === '' ? (
                <div className="grid grid-cols-2 gap-10 animate-in fade-in duration-300 my-auto py-8">
                  {/* Columna: Contactado */}
                  <div>
                    <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-5 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      Contactado
                    </h4>
                    <div className="flex flex-col gap-4">
                      {[
                        { id: 'venta', label: 'Venta Cerrada (Éxito)' },
                        { id: 'soporte', label: 'Soporte Resuelto' },
                        { id: 'promesa', label: 'Promesa de Pago' },
                        { id: 'agendado', label: 'Agendado para después' }
                      ].map(opt => (
                        <button 
                          key={opt.id}
                          onDoubleClick={() => {
                            if (['venta', 'agendado'].includes(opt.id)) {
                              setSelectedTypification(opt.id);
                            } else {
                              finishWrapup();
                            }
                          }}
                          className="px-3 py-2.5 text-sm font-semibold rounded-lg border text-left transition-all bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 select-none"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Columna: No Contactado */}
                  <div>
                    <h4 className="text-sm font-bold text-rose-600 uppercase tracking-wider mb-5 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      No Contactado
                    </h4>
                    <div className="flex flex-col gap-4">
                      {[
                        { id: 'buzon', label: 'Buzón de Voz / No Contesta' },
                        { id: 'equivocado', label: 'Número Equivocado' },
                        { id: 'cuelga', label: 'Cuelga Llamada' },
                        { id: 'invalido', label: 'Número Inválido' }
                      ].map(opt => (
                        <button 
                          key={opt.id}
                          onDoubleClick={() => {
                            if (['venta', 'agendado'].includes(opt.id)) {
                              setSelectedTypification(opt.id);
                            } else {
                              finishWrapup();
                            }
                          }}
                          className="px-3 py-2.5 text-sm font-semibold rounded-lg border text-left transition-all bg-white border-slate-200 text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 select-none"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="animate-in slide-in-from-right-4 fade-in duration-300 pb-4">
                  <button onClick={() => setSelectedTypification('')} className="mb-4 text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors px-2 py-1 -ml-2 rounded-md hover:bg-slate-50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    Volver a resultados
                  </button>
                  
                  {/* Formularios Dinámicos por Tipificación */}
                  {selectedTypification === 'venta' && (
                    <div className="bg-emerald-50/30 rounded-xl p-5 border border-emerald-100 shadow-sm">
                      <h4 className="text-sm font-black text-emerald-700 uppercase tracking-wider mb-6 flex items-center gap-2 border-b border-emerald-100 pb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        Formulario de Venta (Campaña TIGO)
                      </h4>
                      
                      {/* Sección 1: Datos Personales */}
                      <div className="mb-6">
                        <h5 className="text-xs font-bold text-emerald-800 mb-3 uppercase flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> 1. Datos Personales</h5>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Nombres Completos</label>
                            <input type="text" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" placeholder="Ej. Juan Pérez" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Número de Cédula</label>
                            <input type="text" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" placeholder="Ej. 1020304050" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Fecha de Expedición</label>
                            <input type="date" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Correo Electrónico</label>
                            <input type="email" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" placeholder="correo@ejemplo.com" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Teléfono Alterno de Contacto</label>
                            <input type="tel" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" placeholder="Opcional" />
                          </div>
                        </div>
                      </div>

                      {/* Sección 2: Dirección */}
                      <div className="mb-6">
                        <h5 className="text-xs font-bold text-emerald-800 mb-3 uppercase flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> 2. Dirección de Instalación</h5>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Ciudad</label>
                            <select className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                              <option>Bogotá</option>
                              <option>Medellín</option>
                              <option>Cali</option>
                              <option>Barranquilla</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Barrio</label>
                            <input type="text" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" placeholder="Ej. Chapinero" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Dirección Completa</label>
                            <input type="text" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" placeholder="Ej. Calle 123 #45-67 Apto 802" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Estrato</label>
                            <select className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                              <option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Sección 3: Referencias */}
                      <div className="mb-6">
                        <h5 className="text-xs font-bold text-emerald-800 mb-3 uppercase flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> 3. Referencias Personales</h5>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Nombre Ref. 1</label>
                            <input type="text" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Teléfono Ref. 1</label>
                            <input type="tel" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Nombre Ref. 2</label>
                            <input type="text" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Teléfono Ref. 2</label>
                            <input type="tel" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" />
                          </div>
                        </div>
                      </div>

                      {/* Sección 4: Venta */}
                      <div>
                        <h5 className="text-xs font-bold text-emerald-800 mb-3 uppercase flex items-center gap-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> 4. Detalles de la Venta</h5>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Plan Contratado</label>
                            <select className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                              <option>Combo Fibra 500 Megas + TV HD</option>
                              <option>Combo Fibra 900 Megas + TV Premium</option>
                              <option>Solo Internet Fibra Óptica</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Valor Mensual ($)</label>
                            <input type="number" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" defaultValue="95000" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Método de Pago</label>
                            <select className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
                              <option>Tarjeta de Crédito (Suscripción)</option>
                              <option>Factura Mensual Efecty/Baloto</option>
                              <option>Débito Automático Bancario</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Código de Verificación de Identidad (SMS)</label>
                            <input type="text" className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" placeholder="Código de 6 dígitos que recibió el cliente" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Notas Adicionales del Vendedor</label>
                            <textarea className="w-full h-20 px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none" placeholder="Instrucciones para el técnico, horarios de visita preferidos, etc."></textarea>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedTypification === 'agendado' && (
                    <div className="bg-indigo-50/50 rounded-xl p-5 border border-indigo-100">
                      <h4 className="text-sm font-black text-indigo-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
                        Agendar Callback
                      </h4>
                      <div className="grid grid-cols-2 gap-5">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Fecha</label>
                          <input type="date" className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Hora</label>
                          <input type="time" className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Motivo del Agendamiento</label>
                          <textarea className="w-full h-20 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none" placeholder="¿Por qué se reprograma la llamada?"></textarea>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 mt-auto pt-5 border-t border-slate-100 flex justify-end gap-3 bg-white">
              <button 
                onClick={() => setIsTipificarOpen(false)}
                className="px-5 py-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              {selectedTypification !== '' && (
                <button 
                  onClick={finishWrapup}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-all shadow-md shadow-indigo-200 flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {selectedTypification === 'venta' ? 'Guardar Venta' : selectedTypification === 'agendado' ? 'Confirmar Agendamiento' : 'Guardar Gestión'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isWidgetManagerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsWidgetManagerOpen(false)}></div>
          <div className="relative bg-white w-[450px] rounded-2xl shadow-2xl border border-slate-200 p-6 z-10 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-5 pb-4 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Personalizar Widgets
              </h3>
              <button onClick={() => setIsWidgetManagerOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            <div className="space-y-3 mb-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {widgetOrder.map((widgetId, index) => {
                const widget = AVAILABLE_WIDGETS.find(w => w.id === widgetId);
                if (!widget) return null;
                return (
                  <div key={widget.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5 mr-1">
                        <button 
                          onClick={() => moveWidgetUp(index)} 
                          disabled={index === 0}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                        </button>
                        <button 
                          onClick={() => moveWidgetDown(index)} 
                          disabled={index === widgetOrder.length - 1}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={widget.color}>
                        {widget.icon}
                      </svg>
                      <span className="text-sm font-semibold text-slate-700">{widget.label}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={activeWidgets.includes(widget.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setActiveWidgets([...activeWidgets, widget.id]);
                          } else {
                            setActiveWidgets(activeWidgets.filter(id => id !== widget.id));
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button 
                onClick={() => setIsWidgetManagerOpen(false)}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold transition-all shadow-md flex items-center gap-2"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Teleprompter */}
      <FloatingTeleprompter 
        isOpen={isTeleprompterVisible} 
        onClose={() => setIsTeleprompterVisible(false)}
        autoPlay={true}
        settings={teleprompterSettings}
        onUpdateSetting={updateTeleprompterSetting}
      />
    </div>
  );
};
