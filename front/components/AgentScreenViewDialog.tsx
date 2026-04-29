import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Badge } from './ui/badge';
import { Monitor, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { useState } from 'react';
import { toast } from 'sonner';

interface AgentScreenViewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  agentExtension: string;
}

export function AgentScreenViewDialog({
  isOpen,
  onClose,
  agentName,
  agentExtension,
}: AgentScreenViewDialogProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    toast.info('Actualizando vista de pantalla...');
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success('Pantalla actualizada');
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={isFullscreen ? 'max-w-[95vw] h-[95vh]' : 'max-w-4xl'}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2">
                <Monitor className="w-5 h-5" />
                Vista de Pantalla - {agentName}
              </DialogTitle>
              <DialogDescription>
                Ext. {agentExtension} • Monitoreo en tiempo real
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                En Vivo
              </Badge>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4">
          {/* Screen View Container */}
          <div className="bg-slate-900 rounded-lg overflow-hidden aspect-video flex items-center justify-center relative">
            {/* Mock Screen Content */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900">
              {/* Simulated Browser Window */}
              <div className="absolute inset-4 bg-white rounded-lg shadow-2xl overflow-hidden">
                {/* Browser Header */}
                <div className="bg-slate-200 px-4 py-2 flex items-center gap-2 border-b">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <div className="flex-1 bg-white rounded px-3 py-1 text-xs text-slate-600">
                    https://vicidial.gescall.com/agc/vicidial.php
                  </div>
                </div>

                {/* Browser Content - Mock Vicidial Interface */}
                <div className="p-4 space-y-4">
                  <div className="bg-blue-600 text-white px-4 py-2 rounded">
                    <span className="text-sm">Agente: {agentName} • Campaña Activa</span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-100 p-3 rounded">
                      <div className="text-xs text-slate-600 mb-1">Cliente</div>
                      <div className="text-sm">+34 612 345 678</div>
                    </div>
                    <div className="bg-slate-100 p-3 rounded">
                      <div className="text-xs text-slate-600 mb-1">Estado</div>
                      <div className="text-sm">En llamada</div>
                    </div>
                    <div className="bg-slate-100 p-3 rounded">
                      <div className="text-xs text-slate-600 mb-1">Duración</div>
                      <div className="text-sm">05:42</div>
                    </div>
                  </div>

                  <div className="bg-slate-100 p-4 rounded space-y-2">
                    <div className="text-xs text-slate-600">Información del Lead</div>
                    <div className="space-y-1">
                      <div className="h-2 bg-slate-300 rounded w-3/4" />
                      <div className="h-2 bg-slate-300 rounded w-1/2" />
                      <div className="h-2 bg-slate-300 rounded w-2/3" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 bg-slate-200 py-3 rounded text-center text-xs text-slate-600">
                      Script
                    </div>
                    <div className="flex-1 bg-slate-200 py-3 rounded text-center text-xs text-slate-600">
                      Disposición
                    </div>
                    <div className="flex-1 bg-slate-200 py-3 rounded text-center text-xs text-slate-600">
                      Notas
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Overlay Info */}
            <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm text-white px-3 py-2 rounded text-xs">
              Vista en tiempo real
            </div>
          </div>

          {/* Info Banner */}
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Nota:</strong> Esta función permite visualizar la pantalla del agente en tiempo real.
              El agente no recibe notificación de que está siendo monitoreado.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
