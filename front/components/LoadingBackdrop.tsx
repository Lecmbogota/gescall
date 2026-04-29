import { Progress } from './ui/progress';
import { Loader2 } from 'lucide-react';

interface LoadingBackdropProps {
  isOpen: boolean;
  progress: number;
  message?: string;
}

export function LoadingBackdrop({
  isOpen,
  progress,
  message = 'Procesando...',
}: LoadingBackdropProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="flex flex-col items-center space-y-6">
          {/* Animated Icon */}
          <div className="relative">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-20" />
          </div>

          {/* Message */}
          <div className="text-center">
            <h3 className="text-slate-900 mb-2">{message}</h3>
            <p className="text-slate-600">
              Por favor espera mientras procesamos tu archivo
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-600">Progreso</span>
              <span className="text-slate-900">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Status Messages */}
          <div className="w-full bg-slate-50 rounded-lg p-4">
            <div className="space-y-2 text-slate-700">
              {progress < 30 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                  <span>Validando estructura del archivo...</span>
                </div>
              )}
              {progress >= 30 && progress < 60 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                  <span>Procesando registros...</span>
                </div>
              )}
              {progress >= 60 && progress < 90 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                  <span>Insertando leads en la base de datos...</span>
                </div>
              )}
              {progress >= 90 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                  <span>Finalizando proceso...</span>
                </div>
              )}
            </div>
          </div>

          <p className="text-slate-500 text-center">
            No cierres esta ventana hasta que el proceso se complete
          </p>
        </div>
      </div>
    </div>
  );
}
