import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Textarea } from './ui/textarea';
import { Activity, Pause, XCircle } from 'lucide-react';
import type { AgentStatus } from './AgentMonitor';

interface AgentStateChangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  currentStatus: AgentStatus;
  onConfirm: (newStatus: AgentStatus, pauseCode?: string, reason?: string) => void;
}

const pauseCodes = [
  { value: 'BREAK', label: 'Descanso' },
  { value: 'LUNCH', label: 'Almuerzo' },
  { value: 'TRAINING', label: 'Capacitación' },
  { value: 'MEETING', label: 'Reunión' },
  { value: 'BATHROOM', label: 'Baño' },
  { value: 'TECHNICAL', label: 'Problemas técnicos' },
  { value: 'OTHER', label: 'Otro' },
];

export function AgentStateChangeDialog({
  isOpen,
  onClose,
  agentName,
  currentStatus,
  onConfirm,
}: AgentStateChangeDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState<AgentStatus>('available');
  const [selectedPauseCode, setSelectedPauseCode] = useState('');
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    onConfirm(
      selectedStatus,
      selectedStatus === 'paused' ? selectedPauseCode : undefined,
      reason || undefined
    );
    onClose();
    // Reset form
    setSelectedStatus('available');
    setSelectedPauseCode('');
    setReason('');
  };

  const handleCancel = () => {
    onClose();
    // Reset form
    setSelectedStatus('available');
    setSelectedPauseCode('');
    setReason('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar Estado del Agente</DialogTitle>
          <DialogDescription>
            Cambiando el estado de <span className="font-medium">{agentName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Status */}
          <div className="space-y-2">
            <Label>Estado Actual</Label>
            <div className="px-3 py-2 bg-slate-100 rounded-md text-sm text-slate-700">
              {currentStatus === 'available' && 'Disponible'}
              {currentStatus === 'incall' && 'En Llamada'}
              {currentStatus === 'paused' && 'En Pausa'}
              {currentStatus === 'disposition' && 'En Disposición'}
              {currentStatus === 'dead' && 'Desconectado'}
            </div>
          </div>

          {/* New Status */}
          <div className="space-y-2">
            <Label htmlFor="new-status">Nuevo Estado</Label>
            <Select value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as AgentStatus)}>
              <SelectTrigger id="new-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    <span>Disponible</span>
                  </div>
                </SelectItem>
                <SelectItem value="paused">
                  <div className="flex items-center gap-2">
                    <Pause className="w-4 h-4 text-amber-600" />
                    <span>En Pausa</span>
                  </div>
                </SelectItem>
                <SelectItem value="dead">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-slate-600" />
                    <span>Desconectar</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Pause Code (only if status is paused) */}
          {selectedStatus === 'paused' && (
            <div className="space-y-2">
              <Label htmlFor="pause-code">Código de Pausa</Label>
              <Select value={selectedPauseCode} onValueChange={setSelectedPauseCode}>
                <SelectTrigger id="pause-code">
                  <SelectValue placeholder="Seleccionar código..." />
                </SelectTrigger>
                <SelectContent>
                  {pauseCodes.map((code) => (
                    <SelectItem key={code.value} value={code.value}>
                      {code.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo (Opcional)</Label>
            <Textarea
              id="reason"
              placeholder="Describe el motivo del cambio de estado..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={selectedStatus === 'paused' && !selectedPauseCode}
          >
            Cambiar Estado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
