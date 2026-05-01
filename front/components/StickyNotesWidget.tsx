import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Stack from './ui/Stack';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple';

interface Note {
  id: string;
  color: NoteColor;
  title: string;
  content: string;
}

const colorClasses: Record<NoteColor, { bg: string, border: string, text: string, textMuted: string, header: string }> = {
  yellow: { bg: 'bg-yellow-100', border: 'border-yellow-200', text: 'text-yellow-900', textMuted: 'placeholder:text-yellow-700/50', header: 'bg-yellow-200/50' },
  pink: { bg: 'bg-pink-100', border: 'border-pink-200', text: 'text-pink-900', textMuted: 'placeholder:text-pink-700/50', header: 'bg-pink-200/50' },
  blue: { bg: 'bg-blue-100', border: 'border-blue-200', text: 'text-blue-900', textMuted: 'placeholder:text-blue-700/50', header: 'bg-blue-200/50' },
  green: { bg: 'bg-green-100', border: 'border-green-200', text: 'text-green-900', textMuted: 'placeholder:text-green-700/50', header: 'bg-green-200/50' },
  purple: { bg: 'bg-purple-100', border: 'border-purple-200', text: 'text-purple-900', textMuted: 'placeholder:text-purple-700/50', header: 'bg-purple-200/50' },
};

export const StickyNotesWidget: React.FC = () => {
  const { session } = useAuthStore();
  const userId = session?.user?.id;
  const [isLoaded, setIsLoaded] = useState(false);

  const [notes, setNotes] = useState<Note[]>([]);
  const [expandedNote, setExpandedNote] = useState<Note | null>(null);
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [expandSource, setExpandSource] = useState<'stack' | 'grid'>('stack');

  // Fetch initial notes
  useEffect(() => {
    if (!userId) return;
    api.get(`/users/${userId}/widgets`).then((res: any) => {
      if (res.success && res.data?.notes) {
        setNotes(res.data.notes);
      } else {
        // Fallback placeholders if none exist
        setNotes([
          { id: '1', color: 'yellow', title: 'Nota Urgente', content: 'Cliente pide que le llamen a las 5PM a su celular.' },
          { id: '2', color: 'pink', title: 'Recordatorio', content: 'Revisar la validación de identidad del caso #4928' }
        ]);
      }
      setIsLoaded(true);
    }).catch(() => setIsLoaded(true));
  }, [userId]);

  // Auto-save changes (debounced)
  useEffect(() => {
    if (!isLoaded || !userId) return;
    const timer = setTimeout(() => {
      api.put(`/users/${userId}/widgets`, { widgets_data: { notes } }).catch(err => console.error('Error saving notes:', err));
    }, 1000);
    return () => clearTimeout(timer);
  }, [notes, isLoaded, userId]);

  const handleContentChange = (id: string, content: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, content } : n));
  };

  const handleTitleChange = (id: string, title: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title } : n));
  };

  const changeColor = (id: string, color: NoteColor) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, color } : n));
    if (expandedNote && expandedNote.id === id) {
      setExpandedNote(prev => prev ? { ...prev, color } : null);
    }
  };

  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const addNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      color: 'yellow',
      title: 'Nueva Nota',
      content: ''
    };
    setNotes(prev => [...prev, newNote]);
    // Pequeño retraso para permitir que Stack monte la carta miniatura antes de expandir (framer-motion layoutId fix)
    setTimeout(() => {
      setExpandSource('stack');
      setExpandedNote(newNote);
    }, 50);
  };

  return (
    <>
      <div className="w-full h-[280px] min-h-[280px] shrink-0 mb-2 px-8 relative z-0 flex flex-col">
        <div className="flex justify-between items-center mb-1 pr-2 pl-1">
           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tus Notas ({notes.length})</span>
           <div className="flex gap-1">
             <button onClick={() => setShowAllNotes(true)} className="text-indigo-500 hover:text-indigo-700 p-1 hover:bg-indigo-50 rounded-md transition-colors" title="Ver todas las notas">
               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
             </button>
             <button onClick={addNote} className="text-indigo-500 hover:text-indigo-700 p-1 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors" title="Añadir Nota">
               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
             </button>
           </div>
        </div>
        
        <div className="flex-1 relative">
          {notes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-50"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
              No hay notas
            </div>
          ) : (
            <Stack
              randomRotation={false} // Para que la primera esté recta y las de atrás inclinadas fijas
              sensitivity={100}
              sendToBackOnClick={false}
              cards={notes.map((note) => (
                <motion.div 
                  layoutId={`note-${note.id}`}
                  key={note.id} 
                  onDoubleClick={(e) => { e.stopPropagation(); setExpandSource('stack'); setExpandedNote(note); }}
                  transition={{ 
                    layout: { type: "spring", bounce: 0.2, duration: 0.6 }
                  }}
                  className={`w-full h-full rounded-2xl shadow-lg border p-4 relative group flex flex-col transition-colors duration-300 ${colorClasses[note.color].bg} ${colorClasses[note.color].border}`}
                >
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-8 h-3 rounded-b-md ${colorClasses[note.color].header}`}></div>
                  
                  {/* Note Header & Actions */}
                  <div className="flex justify-between items-center mb-2 pt-1 pointer-events-none">
                    <input 
                      type="text" 
                      value={note.title}
                      readOnly
                      className={`font-bold text-sm bg-transparent outline-none w-[60%] ${colorClasses[note.color].text}`}
                    />
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
                      {/* Delete Button */}
                      <button onPointerDown={(e) => { e.stopPropagation(); deleteNote(note.id); }} className={`p-1 hover:bg-red-500/20 hover:text-red-600 rounded-md transition-colors ${colorClasses[note.color].text}`} title="Eliminar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </div>

                  <div className={`text-[10px] uppercase font-bold mb-1 opacity-50 ${colorClasses[note.color].text} transition-opacity select-none pointer-events-none`}>Doble clic para expandir</div>

                  <textarea 
                    className={`w-full flex-1 bg-transparent ${colorClasses[note.color].text} text-sm resize-none outline-none ${colorClasses[note.color].textMuted} mt-1 pointer-events-none`}
                    placeholder="Doble clic para escribir..."
                    value={note.content}
                    readOnly
                  ></textarea>
                </motion.div>
              ))}
            />
          )}
        </div>
      </div>

      {/* All Notes Grid Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showAllNotes && !expandedNote && (
            <div className="fixed inset-0 z-[9997] flex flex-col p-4 md:p-10">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" 
                onClick={() => setShowAllNotes(false)}
              ></motion.div>
              
              <div 
                className="relative w-full max-w-7xl mx-auto h-full flex flex-col z-10 pointer-events-none"
                style={{ maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)' }}
              >
                <div className="flex-1 overflow-y-auto custom-scrollbar pointer-events-auto p-4 md:p-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {notes.map((note, idx) => (
                      <motion.div 
                        layoutId={`grid-note-${note.id}`}
                        key={`grid-${note.id}`}
                        initial={{ opacity: 0, scale: 0.8, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 30 }}
                        transition={{ 
                          layout: { type: "spring", bounce: 0.1, duration: 0.5 },
                          opacity: { duration: 0.2, delay: idx * 0.02 },
                          scale: { duration: 0.3, delay: idx * 0.02 },
                          y: { duration: 0.3, delay: idx * 0.02 }
                        }}
                        onDoubleClick={() => {
                          setExpandSource('grid');
                          setExpandedNote(note);
                          setShowAllNotes(false);
                        }}
                        className={`relative w-full aspect-square rounded-3xl shadow-xl border p-6 flex flex-col transition-all duration-300 ${colorClasses[note.color].bg} ${colorClasses[note.color].border} cursor-pointer hover:shadow-2xl hover:rotate-2 hover:scale-[1.02] group`}
                      >
                        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-16 h-3.5 rounded-b-lg ${colorClasses[note.color].header}`}></div>
                        
                        <div className="flex justify-between items-center mb-4 pt-2">
                          <span className={`font-black text-xl truncate pr-2 ${colorClasses[note.color].text}`}>{note.title}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }} className={`p-2 bg-white/40 hover:bg-red-500/80 hover:text-white rounded-xl transition-colors ${colorClasses[note.color].text} shadow-sm`} title="Eliminar">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                            </button>
                          </div>
                        </div>
                        <div className={`w-full flex-1 overflow-hidden ${colorClasses[note.color].text} text-base leading-relaxed whitespace-pre-wrap mask-image-bottom`}>
                           {note.content || <span className="opacity-50 italic font-medium">Sin contenido...</span>}
                        </div>
                        <div className={`mt-4 text-[10px] uppercase font-black tracking-widest opacity-40 text-center ${colorClasses[note.color].text}`}>Doble clic para editar</div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Expanded Note Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {expandedNote && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" 
                onClick={() => setExpandedNote(null)}
              ></motion.div>
              <motion.div 
                layoutId={expandSource === 'grid' ? `grid-note-${expandedNote.id}` : `note-${expandedNote.id}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ 
                  layout: { type: "spring", bounce: 0.2, duration: 0.6 }
                }}
                className={`relative w-[600px] h-[500px] max-h-[90vh] rounded-2xl shadow-2xl border p-6 flex flex-col transition-colors duration-300 ${colorClasses[expandedNote.color].bg} ${colorClasses[expandedNote.color].border}`}
              >
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 rounded-b-lg ${colorClasses[expandedNote.color].header}`}></div>
                
                <div className="flex justify-between items-center mb-4 mt-2">
                  <input 
                    type="text" 
                    value={expandedNote.title}
                    onChange={(e) => {
                      handleTitleChange(expandedNote.id, e.target.value);
                      setExpandedNote({ ...expandedNote, title: e.target.value });
                    }}
                    className={`font-bold text-2xl bg-transparent outline-none w-full ${colorClasses[expandedNote.color].text}`}
                  />
                  
                  <div className="flex items-center gap-2 shrink-0 ml-4 bg-white/40 px-3 py-1.5 rounded-full shadow-sm border border-black/5">
                    {(['yellow', 'pink', 'blue', 'green', 'purple'] as NoteColor[]).map((c) => (
                      <button 
                        key={c} 
                        onClick={() => changeColor(expandedNote.id, c)} 
                        className={`w-5 h-5 rounded-full ${colorClasses[c].bg} border ${expandedNote.color === c ? 'border-slate-800 scale-125' : 'border-slate-300 hover:scale-110'} transition-transform shadow-sm`}
                        title={`Color ${c}`}
                      ></button>
                    ))}
                    <div className="w-[1px] h-5 bg-black/10 mx-1"></div>
                    <button onClick={() => setExpandedNote(null)} className={`p-1 hover:bg-black/10 rounded-full transition-colors ${colorClasses[expandedNote.color].text}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                </div>
                
                <textarea 
                  className={`w-full flex-1 bg-transparent ${colorClasses[expandedNote.color].text} text-lg leading-relaxed resize-none outline-none ${colorClasses[expandedNote.color].textMuted} custom-scrollbar pr-2`}
                  placeholder="Escribe el contenido de la nota aquí..."
                  value={expandedNote.content}
                  onChange={(e) => {
                    handleContentChange(expandedNote.id, e.target.value);
                    setExpandedNote({ ...expandedNote, content: e.target.value });
                  }}
                ></textarea>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
