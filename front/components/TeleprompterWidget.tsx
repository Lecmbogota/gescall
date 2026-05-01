import React from 'react';
import { TeleprompterSettings } from '../hooks/useTeleprompterSettings';

interface TeleprompterWidgetProps {
  isVisible: boolean;
  onToggleVisibility: () => void;
  settings: TeleprompterSettings;
  onUpdateSetting: <K extends keyof TeleprompterSettings>(key: K, value: TeleprompterSettings[K]) => void;
}

export const TeleprompterWidget: React.FC<TeleprompterWidgetProps> = ({ isVisible, onToggleVisibility, settings, onUpdateSetting }) => {

  const colors = [
    { value: 'text-slate-300', label: 'Claro' },
    { value: 'text-white', label: 'Blanco Puro' },
    { value: 'text-yellow-100', label: 'Cálido' },
    { value: 'text-emerald-100', label: 'Verdoso' },
    { value: 'text-blue-100', label: 'Azulado' },
  ];

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg border border-white/50 p-4 group">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500">
            <polygon points="5 3 19 12 5 21 5 3"/><line x1="19" y1="5" x2="19" y2="19"/>
          </svg>
          Configuración Teleprompter
        </div>
      </div>
      
      <div className="space-y-4">
        {/* Toggle Window */}
        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
          <span className="text-xs font-bold text-slate-600">Ventana Flotante</span>
          <button 
            onClick={onToggleVisibility}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isVisible ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
          >
            {isVisible ? 'Ocultar' : 'Mostrar ahora'}
          </button>
        </div>

        {/* Global Settings */}
        <div className="space-y-4 px-1">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase flex justify-between mb-1.5">
              <span>Velocidad Base</span>
              <span className="text-blue-500">{settings.speed}px/s</span>
            </label>
            <input 
              type="range" 
              min="10" max="100" step="5"
              value={settings.speed}
              onChange={(e) => onUpdateSetting('speed', parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase flex justify-between mb-1.5">
              <span>Tamaño de Letra</span>
              <span className="text-blue-500">{settings.fontSize}px</span>
            </label>
            <input 
              type="range" 
              min="16" max="48" step="1"
              value={settings.fontSize}
              onChange={(e) => onUpdateSetting('fontSize', parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase flex justify-between mb-1.5">
              <span>Opacidad de Fondo</span>
              <span className="text-blue-500">{settings.opacity}%</span>
            </label>
            <input 
              type="range" 
              min="50" max="100" step="5"
              value={settings.opacity}
              onChange={(e) => onUpdateSetting('opacity', parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase flex justify-between mb-1.5">
              <span>Retraso Inicial</span>
              <span className="text-blue-500">{settings.autoPlayDelay}s</span>
            </label>
            <input 
              type="range" 
              min="0" max="5" step="0.5"
              value={settings.autoPlayDelay}
              onChange={(e) => onUpdateSetting('autoPlayDelay', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">
              Color de Texto Principal
            </label>
            <div className="flex flex-wrap gap-2">
              {colors.map(color => (
                <button
                  key={color.value}
                  onClick={() => onUpdateSetting('textColor', color.value)}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                    settings.textColor === color.value 
                      ? 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/20' 
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  {color.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
