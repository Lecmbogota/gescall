import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TeleprompterSettings } from '../hooks/useTeleprompterSettings';

interface FloatingTeleprompterProps {
  isOpen: boolean;
  onClose: () => void;
  autoPlay?: boolean;
  settings: TeleprompterSettings;
  onUpdateSetting: <K extends keyof TeleprompterSettings>(key: K, value: TeleprompterSettings[K]) => void;
}

const SCRIPT_SEGMENTS = [
  "Buenos días, me comunico con Juan Pérez García.",
  "Llamamos de la campaña XIRA DEMO MEXICO.",
  "El motivo de mi llamada es agradecerle por mantener su cuenta Activo - Al corriente.",
  "Además, queremos informarle que su fecha de corte es el 15 de cada mes...",
  "...y su saldo actual es de $4,500.00 MXN.",
  "¿Hay algo más en lo que le podamos ayudar el día de hoy?",
  "Gracias por su preferencia, que tenga un excelente día."
];

const normalizeString = (str: string) => {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, '');
};

export function FloatingTeleprompter({ isOpen, onClose, autoPlay = false, settings, onUpdateSetting }: FloatingTeleprompterProps) {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [micPermissionError, setMicPermissionError] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState<string>('');
  
  const contentRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const exactScrollRef = useRef<number>(0);
  const animationRef = useRef<number>();
  const lastTimeRef = useRef<number>();
  const endTimerRef = useRef<any>(null);
  
  const recognitionRef = useRef<any>(null);
  const transcriptBuffer = useRef<string>('');

  useEffect(() => {
    return () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    }
  }, []);

  const { voiceMode, speed, fontSize, opacity, textColor } = settings;

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (isOpen && autoPlay) {
      setActiveSegmentIndex(0);
      exactScrollRef.current = 0;
      if (contentRef.current) contentRef.current.scrollTop = 0;
      
      if (!voiceMode) {
        // Delay auto-play based on settings (default 1s) to allow layout to settle
        timer = setTimeout(() => {
          setIsPlaying(true);
        }, (settings.autoPlayDelay || 1) * 1000);
      }
    } else {
      setIsPlaying(false);
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, autoPlay, voiceMode]);

  // Standard Auto-scroll logic
  useEffect(() => {
    if (voiceMode) return;
    
    const scrollContainer = contentRef.current;
    if (!scrollContainer) return;

    const animateScroll = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      if (isPlaying) {
        if (Math.abs(scrollContainer.scrollTop - exactScrollRef.current) > 2) {
          exactScrollRef.current = scrollContainer.scrollTop;
        }

        exactScrollRef.current += speed * delta;
        scrollContainer.scrollTop = exactScrollRef.current;
        
        // Calculate active index based on scroll position
        const containerCenter = scrollContainer.clientHeight / 3;
        const scrollPos = scrollContainer.scrollTop + containerCenter;
        let newIndex = 0;
        for (let i = 0; i < segmentRefs.current.length; i++) {
          const el = segmentRefs.current[i];
          if (el && scrollPos >= el.offsetTop - 40) {
            newIndex = i;
          }
        }
        setActiveSegmentIndex(prev => prev !== newIndex ? newIndex : prev);
        
        if (scrollContainer.scrollTop >= scrollContainer.scrollHeight - scrollContainer.clientHeight - 1) {
          setIsPlaying(false);
          if (!endTimerRef.current) {
            endTimerRef.current = setTimeout(() => {
              onClose();
            }, 3000);
          }
        }
      }
      animationRef.current = requestAnimationFrame(animateScroll);
    };

    if (isPlaying) {
      lastTimeRef.current = undefined;
      animationRef.current = requestAnimationFrame(animateScroll);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, speed, voiceMode]);

  // Voice Tracking Logic
  useEffect(() => {
    if (!voiceMode || !isOpen) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
      }
      setCurrentTranscript('');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicPermissionError(true);
      onUpdateSetting('voiceMode', false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'es-MX';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          transcriptBuffer.current += event.results[i][0].transcript + ' ';
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const rawFull = transcriptBuffer.current + interimTranscript;
      setCurrentTranscript(rawFull);
      const fullTranscript = normalizeString(rawFull);
      
      if (activeSegmentIndex < SCRIPT_SEGMENTS.length - 1) {
        const nextSegment = normalizeString(SCRIPT_SEGMENTS[activeSegmentIndex + 1]);
        const words = nextSegment.split(' ').filter(w => w.length >= 4); 
        
        let matchCount = 0;
        for (const word of words) {
          if (fullTranscript.includes(word)) matchCount++;
        }

        if (matchCount >= Math.min(1, words.length)) {
          setActiveSegmentIndex(prev => prev + 1);
          transcriptBuffer.current = '';
          setCurrentTranscript('');
        }
      } else if (activeSegmentIndex === SCRIPT_SEGMENTS.length - 1) {
        const lastSegment = normalizeString(SCRIPT_SEGMENTS[activeSegmentIndex]);
        const words = lastSegment.split(' ').filter(w => w.length >= 4); 
        
        let matchCount = 0;
        for (const word of words) {
          if (fullTranscript.includes(word)) matchCount++;
        }

        if (matchCount >= Math.min(2, words.length)) {
          if (!endTimerRef.current) {
            endTimerRef.current = setTimeout(() => {
              onClose();
            }, 3000);
            try { recognition.stop(); } catch(e){}
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        setMicPermissionError(true);
        onUpdateSetting('voiceMode', false);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch(e) {}

    return () => {
      try { recognition.stop(); } catch(e){}
    };
  }, [voiceMode, isOpen, activeSegmentIndex]);

  useEffect(() => {
    if (!voiceMode) return;
    const container = contentRef.current;
    const targetElement = segmentRefs.current[activeSegmentIndex];
    
    if (container && targetElement) {
      const containerCenter = container.clientHeight / 2;
      const elementOffset = targetElement.offsetTop;
      const targetScroll = elementOffset - containerCenter + (targetElement.clientHeight / 2);
      
      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth'
      });
      exactScrollRef.current = Math.max(0, targetScroll);
    }
  }, [activeSegmentIndex, voiceMode]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0}
        initial={{ opacity: 0, scale: 0.9, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        style={{ 
          position: 'fixed', 
          zIndex: 9999, 
          top: '15%', 
          left: '30%',
          backgroundColor: `rgba(15, 23, 42, ${opacity / 100})` // Apply opacity
        }}
        className="backdrop-blur-xl border border-slate-700 shadow-2xl overflow-hidden transition-[width,height,border-radius,background-color] duration-300 w-[600px] h-[450px] rounded-2xl flex flex-col"
      >
        {/* Header / Controls */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-800 cursor-grab active:cursor-grabbing shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded flex items-center justify-center ${voiceMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
              {voiceMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
              )}
            </div>
            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest pointer-events-none">Teleprompter</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Voice Tracking Toggle */}
            <button 
              onClick={() => {
                onUpdateSetting('voiceMode', !voiceMode);
                setIsPlaying(false);
                if (voiceMode) setActiveSegmentIndex(0); // If turning OFF, reset index? Actually no, keep position.
              }} 
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-bold transition-colors ${voiceMode ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-transparent'}`}
              title="Activar seguimiento por voz"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              {voiceMode ? 'ESCUCHANDO' : 'VOZ'}
            </button>

            <div className="h-4 w-px bg-slate-700 mx-0.5"></div>

            {/* Play/Pause (Disabled in Voice Mode) */}
            <button 
              onClick={() => !voiceMode && setIsPlaying(!isPlaying)} 
              disabled={voiceMode}
              className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${voiceMode ? 'opacity-30 cursor-not-allowed' : isPlaying ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              {isPlaying ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              )}
            </button>

            <div className="h-4 w-px bg-slate-700 mx-1"></div>

            {/* Close */}
            <button onClick={onClose} className="w-6 h-6 rounded text-slate-400 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {micPermissionError && (
          <div className="bg-red-500/20 border-b border-red-500/30 text-red-300 text-[10px] px-4 py-1 text-center font-bold">
            No se pudo acceder al micrófono para el rastreo de voz.
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 relative overflow-hidden bg-transparent">
          <div className="absolute top-0 left-0 w-full h-1/4 bg-gradient-to-b from-[#0F172A] to-transparent z-10 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-full h-1/4 bg-gradient-to-t from-[#0F172A] to-transparent z-10 pointer-events-none"></div>
          
          {/* Focus markers */}
          {!voiceMode && (
            <>
              <div className="absolute top-1/3 left-0 w-full h-px bg-yellow-500/30 z-0 shadow-[0_0_15px_rgba(234,179,8,0.4)] pointer-events-none"></div>
              <div className="absolute top-1/3 left-0 w-1.5 h-8 -translate-y-1/2 bg-yellow-400 rounded-r-md z-10 shadow-[0_0_10px_rgba(234,179,8,0.6)] pointer-events-none"></div>
              <div className="absolute top-1/3 right-0 w-1.5 h-8 -translate-y-1/2 bg-yellow-400 rounded-l-md z-10 shadow-[0_0_10px_rgba(234,179,8,0.6)] pointer-events-none"></div>
            </>
          )}

          <div 
            ref={contentRef}
            className="w-full h-full overflow-y-auto overflow-x-hidden p-8 pb-[400px] pt-[150px] custom-scrollbar-hide"
            style={{ fontSize: `${fontSize}px` }}
          >
            <div className={`max-w-xl mx-auto space-y-12 text-center font-medium leading-relaxed tracking-wide ${textColor}`}>
              {SCRIPT_SEGMENTS.map((segment, index) => {
                const isActive = activeSegmentIndex === index;
                const isPast = index < activeSegmentIndex;
                
                return (
                  <p 
                    key={index}
                    ref={(el) => segmentRefs.current[index] = el}
                    className={`transition-all duration-500 ${
                      isActive 
                        ? 'text-yellow-400 font-black scale-105 shadow-yellow-400/20 drop-shadow-[0_0_10px_rgba(250,204,21,0.3)]' 
                        : isPast 
                          ? 'opacity-30 blur-[1px] scale-95'
                          : 'opacity-60'
                    }`}
                  >
                    {segment}
                  </p>
                );
              })}
              
              <p className="text-slate-500 italic opacity-80 flex flex-col items-center justify-center gap-3 mt-16">
                 <span className="w-3 h-3 rounded-full bg-slate-500 animate-pulse"></span>
                 <span className="text-sm">Fin del Script</span>
              </p>
            </div>
          </div>
          
          {/* Transcript Debug Overlay */}
          <AnimatePresence>
            {voiceMode && currentTranscript && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-lg bg-emerald-900/80 backdrop-blur-md border border-emerald-500/30 rounded-lg p-3 shadow-lg z-50 flex flex-col gap-1 pointer-events-none"
              >
                <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-wider">Transcripción en tiempo real:</span>
                <p className="text-sm text-emerald-100 font-medium italic truncate">{currentTranscript}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
