import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Badge } from './ui/badge';
import {
  Download,
  Search,
  Filter,
  BarChart3,
  List,
} from 'lucide-react';
import { toast } from 'sonner';

interface ProgressReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignName: string;
  renderTrigger?: (onClick: () => void) => React.ReactNode;
}

interface LeadData {
  phone: string;
  name: string;
  status: 'contacted' | 'no-answer' | 'busy' | 'failed' | 'scheduled' | 'pending';
  callResult: string;
  attempts: number;
  lastCall: string;
  duration: string;
  agent: string;
  list: string;
}

// Mock data para leads
const mockLeads: LeadData[] = [
  {
    phone: '+57 300 123 4567',
    name: 'Carlos Rodríguez',
    status: 'contacted',
    callResult: 'Venta exitosa',
    attempts: 2,
    lastCall: '2025-10-24 10:30',
    duration: '5:23',
    agent: 'Ana García',
    list: 'Lista General 2025',
  },
  {
    phone: '+57 310 987 6543',
    name: 'María López',
    status: 'no-answer',
    callResult: 'Sin respuesta',
    attempts: 3,
    lastCall: '2025-10-24 09:15',
    duration: '0:00',
    agent: 'Pedro Martínez',
    list: 'Lista General 2025',
  },
  {
    phone: '+57 320 555 1234',
    name: 'Juan Pérez',
    status: 'contacted',
    callResult: 'Callback programado',
    attempts: 1,
    lastCall: '2025-10-24 11:45',
    duration: '3:12',
    agent: 'Ana García',
    list: 'Leads Calificados',
  },
  {
    phone: '+57 315 444 9876',
    name: 'Laura Torres',
    status: 'busy',
    callResult: 'Ocupado',
    attempts: 2,
    lastCall: '2025-10-24 08:20',
    duration: '0:00',
    agent: 'Carlos Ruiz',
    list: 'Lista General 2025',
  },
  {
    phone: '+57 301 222 3333',
    name: 'Diego Ramírez',
    status: 'contacted',
    callResult: 'No interesado',
    attempts: 1,
    lastCall: '2025-10-24 10:05',
    duration: '2:45',
    agent: 'Pedro Martínez',
    list: 'Leads Calificados',
  },
  {
    phone: '+57 318 777 8888',
    name: 'Sofia Mendoza',
    status: 'scheduled',
    callResult: 'Agendado',
    attempts: 0,
    lastCall: '-',
    duration: '-',
    agent: '-',
    list: 'Prospectos Octubre',
  },
  {
    phone: '+57 302 111 2222',
    name: 'Roberto Silva',
    status: 'failed',
    callResult: 'Número inválido',
    attempts: 3,
    lastCall: '2025-10-24 07:30',
    duration: '0:00',
    agent: 'Ana García',
    list: 'Lista General 2025',
  },
  {
    phone: '+57 319 666 5555',
    name: 'Patricia Gómez',
    status: 'pending',
    callResult: 'Pendiente',
    attempts: 0,
    lastCall: '-',
    duration: '-',
    agent: '-',
    list: 'Prospectos Octubre',
  },
];

export function ProgressReportModal({
  isOpen,
  onClose,
  campaignName,
  renderTrigger,
}: ProgressReportModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [listFilter, setListFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'reportes' | 'listas'>('reportes');

  const effectiveOpen = renderTrigger ? internalOpen : isOpen;
  const handleClose = () => {
    if (renderTrigger) {
      setInternalOpen(false);
    } else {
      onClose();
    }
  };

  const filteredLeads = mockLeads.filter((lead) => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.phone.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    const matchesList = listFilter === 'all' || lead.list === listFilter;

    return matchesSearch && matchesStatus && matchesList;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'contacted':
        return 'bg-green-500';
      case 'no-answer':
        return 'bg-yellow-500';
      case 'busy':
        return 'bg-orange-500';
      case 'failed':
        return 'bg-red-500';
      case 'scheduled':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-slate-400';
      default:
        return 'bg-slate-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'contacted':
        return 'Contactado';
      case 'no-answer':
        return 'Sin respuesta';
      case 'busy':
        return 'Ocupado';
      case 'failed':
        return 'Fallido';
      case 'scheduled':
        return 'Agendado';
      case 'pending':
        return 'Pendiente';
      default:
        return status;
    }
  };

  const stats = {
    total: mockLeads.length,
    contacted: mockLeads.filter((l) => l.status === 'contacted').length,
    pending: mockLeads.filter((l) => l.status === 'pending').length,
    failed: mockLeads.filter((l) => l.status === 'failed').length,
    scheduled: mockLeads.filter((l) => l.status === 'scheduled').length,
  };

  const handleDownloadReport = () => {
    // Crear CSV con los datos filtrados
    const headers = [
      'Teléfono',
      'Nombre',
      'Estado',
      'Resultado',
      'Intentos',
      'Última Llamada',
      'Duración',
      'Agente',
      'Lista',
    ];

    const rows = filteredLeads.map((lead) => [
      lead.phone,
      lead.name,
      getStatusText(lead.status),
      lead.callResult,
      lead.attempts.toString(),
      lead.lastCall,
      lead.duration,
      lead.agent,
      lead.list,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${campaignName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast.success(`Reporte descargado: ${filteredLeads.length} registros`);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setListFilter('all');
  };

  return (
    <>
      {renderTrigger && renderTrigger(() => setInternalOpen(true))}
      <Dialog open={effectiveOpen} onOpenChange={handleClose}>
        <DialogContent className="!max-w-[95vw] w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-4">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg">{campaignName}</DialogTitle>
          <DialogDescription className="text-xs">
            Productivo
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b mb-3">
          <button
            onClick={() => setActiveTab('reportes')}
            className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors relative ${
              activeTab === 'reportes'
                ? 'text-slate-900 font-medium'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Reportes
            {activeTab === 'reportes' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('listas')}
            className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors relative ${
              activeTab === 'listas'
                ? 'text-slate-900 font-medium'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <List className="w-4 h-4" />
            Listas
            {activeTab === 'listas' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></span>
            )}
          </button>
        </div>

        {activeTab === 'reportes' && (
          <>
        {/* Stats Cards - Compactas */}
        <div className="flex items-center gap-4 text-xs pb-2.5 text-slate-600">
          <span className="flex items-center gap-1">
            <span className="text-slate-900">{stats.total}</span> Total
          </span>
          <span className="w-px h-4 bg-slate-300"></span>
          <span className="flex items-center gap-1">
            <span className="text-green-600">{stats.contacted}</span> Contactados
          </span>
          <span className="w-px h-4 bg-slate-300"></span>
          <span className="flex items-center gap-1">
            <span className="text-slate-600">{stats.pending}</span> Pendientes
          </span>
          <span className="w-px h-4 bg-slate-300"></span>
          <span className="flex items-center gap-1">
            <span className="text-blue-600">{stats.scheduled}</span> Agendados
          </span>
          <span className="w-px h-4 bg-slate-300"></span>
          <span className="flex items-center gap-1">
            <span className="text-red-600">{stats.failed}</span> Fallidos
          </span>
        </div>

        {/* Filters - Compactos */}
        <div className="flex items-center gap-2 py-2 border-y bg-slate-50/50 px-2">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                id="search"
                placeholder="Nombre o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-sm bg-white"
              />
            </div>
          </div>

          <div className="w-36">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-sm bg-white">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="contacted">Contactado</SelectItem>
                <SelectItem value="no-answer">Sin respuesta</SelectItem>
                <SelectItem value="busy">Ocupado</SelectItem>
                <SelectItem value="failed">Fallido</SelectItem>
                <SelectItem value="scheduled">Agendado</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-36">
            <Select value={listFilter} onValueChange={setListFilter}>
              <SelectTrigger className="h-8 text-sm bg-white">
                <SelectValue placeholder="Lista" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="Lista General 2025">Lista General 2025</SelectItem>
                <SelectItem value="Leads Calificados">Leads Calificados</SelectItem>
                <SelectItem value="Prospectos Octubre">Prospectos Octubre</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            variant="outline" 
            size="sm"
            onClick={handleClearFilters} 
            className="gap-1.5 h-8 px-3"
          >
            <Filter className="w-3.5 h-3.5" />
            Limpiar
          </Button>

          <Button 
            size="sm"
            onClick={handleDownloadReport} 
            className="gap-1.5 h-8 px-3 bg-slate-900 hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-50 z-10">
              <TableRow className="border-b">
                <TableHead className="text-slate-900 h-8 text-xs px-3">Teléfono</TableHead>
                <TableHead className="text-slate-900 h-8 text-xs px-3">Nombre</TableHead>
                <TableHead className="text-slate-900 h-8 text-xs px-3">Estado</TableHead>
                <TableHead className="text-slate-900 h-8 text-xs px-3">Resultado</TableHead>
                <TableHead className="text-slate-900 h-8 text-xs text-center px-3">Intentos</TableHead>
                <TableHead className="text-slate-900 h-8 text-xs px-3">Última Llamada</TableHead>
                <TableHead className="text-slate-900 h-8 text-xs text-center px-3">Duración</TableHead>
                <TableHead className="text-slate-900 h-8 text-xs px-3">Agente</TableHead>
                <TableHead className="text-slate-900 h-8 text-xs px-3">Lista</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-slate-500 text-sm">
                    No se encontraron registros con los filtros aplicados
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead, index) => (
                  <TableRow 
                    key={`${lead.phone}-${index}`}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                  >
                    <TableCell className="font-mono text-xs py-1.5 px-3">{lead.phone}</TableCell>
                    <TableCell className="text-sm py-1.5 px-3">{lead.name}</TableCell>
                    <TableCell className="py-1.5 px-3">
                      <Badge className={`${getStatusColor(lead.status)} text-white text-xs px-2 py-0.5`}>
                        {getStatusText(lead.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm py-1.5 px-3">{lead.callResult}</TableCell>
                    <TableCell className="text-center text-sm py-1.5 px-3">{lead.attempts}</TableCell>
                    <TableCell className="font-mono text-xs py-1.5 px-3">{lead.lastCall}</TableCell>
                    <TableCell className="text-center text-sm py-1.5 px-3">{lead.duration}</TableCell>
                    <TableCell className="text-sm py-1.5 px-3">{lead.agent}</TableCell>
                    <TableCell className="text-slate-600 text-sm py-1.5 px-3">{lead.list}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer - Compacto */}
        <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
          <span>
            Mostrando {filteredLeads.length} de {mockLeads.length} registros
          </span>
        </div>
        </>
        )}

        {activeTab === 'listas' && (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            <div className="text-center">
              <Filter className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Vista de listas próximamente</p>
            </div>
          </div>
        )}
      </DialogContent>
      </Dialog>
    </>
  );
}
