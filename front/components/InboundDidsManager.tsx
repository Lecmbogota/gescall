import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Phone, Plus, Trash2, Loader2, Link2, Search, Power, Server } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollArea } from './ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import api from '@/services/api';

interface InboundDidsManagerProps {
  campaignId: string;
}

interface DIDRecord {
  did_id: number;
  did_number: string;
  campaign_id: string;
  description: string;
  active: boolean;
  created_at: string;
  trunk_id?: string | null;
  trunk_name?: string | null;
}

export const InboundDidsManager: React.FC<InboundDidsManagerProps> = ({ campaignId }) => {
  const [dids, setDids] = useState<DIDRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newDid, setNewDid] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTrunkId, setNewTrunkId] = useState('__none__');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableTrunks, setAvailableTrunks] = useState<any[]>([]);

  // Fetch available trunks
  useEffect(() => {
    api.getTrunks().then((resp: any) => {
      if (Array.isArray(resp)) {
        setAvailableTrunks(resp);
      }
    }).catch(() => {});
  }, []);

  const fetchDids = async () => {
    try {
      const result = await api.get(`/dids/campaign/${campaignId}`);
      if (result.success) {
        setDids(result.data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar DIDs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDids();
  }, [campaignId]);

  const handleAddDid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDid) {
      toast.error('El número DID es obligatorio');
      return;
    }
    
    // Clean up DID (allow only digits)
    const cleanDid = newDid.replace(/[^0-9]/g, '');
    if (cleanDid.length < 4) {
      toast.error('El número DID debe tener al menos 4 dígitos');
      return;
    }

    setAdding(true);
    try {
      const result = await api.post(`/dids/campaign/${campaignId}`, {
        did_number: cleanDid,
        description: newDesc,
        trunk_id: newTrunkId === '__none__' ? null : (newTrunkId || null)
      });
      
      if (result.success) {
        toast.success('DID asignado correctamente');
        setNewDid('');
        setNewDesc('');
        setNewTrunkId('__none__');
        fetchDids();
      } else {
        toast.error(result.error || 'Error al asignar DID');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error de conexión al asignar DID');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteDid = async (didId: number) => {
    if (!confirm('¿Estás seguro de eliminar este DID?')) return;
    
    try {
      const result = await api.delete(`/dids/${didId}`);
      
      if (result.success) {
        toast.success('DID eliminado');
        setDids(prev => prev.filter(d => d.did_id !== didId));
      } else {
        toast.error(result.error || 'Error al eliminar');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  const handleToggleDid = async (did: DIDRecord) => {
    try {
      const response = await fetch(`/api/dids/${did.did_id}/toggle`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('gescall_token')}`
        },
        body: JSON.stringify({ active: !did.active })
      });
      const result = await response.json();
      
      if (result.success) {
        toast.success(did.active ? 'DID desactivado' : 'DID activado');
        setDids(prev => prev.map(d => d.did_id === did.did_id ? { ...d, active: !d.active } : d));
      } else {
        toast.error(result.error || 'Error al cambiar estado');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  const filteredDids = dids.filter(d => 
    d.did_number.includes(searchQuery) || 
    (d.description && d.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Asignar Nuevo DID</CardTitle>
                  <CardDescription className="text-xs">
                    Vincula un número entrante
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleAddDid} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="didNumber" className="text-xs font-semibold text-slate-500 uppercase">Número (DID)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="didNumber"
                      placeholder="Ej. 5512345678"
                      className="pl-9 font-mono bg-white"
                      value={newDid}
                      onChange={e => setNewDid(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="didDesc" className="text-xs font-semibold text-slate-500 uppercase">Descripción (Opcional)</Label>
                  <Input
                    id="didDesc"
                    placeholder="Ej. Línea Principal Ventas"
                    className="bg-white"
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={adding || !newDid} 
                  className="w-full gap-2 mt-2 bg-blue-600 hover:bg-blue-700"
                >
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Vincular Número
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Trunk selector card */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 rounded-lg text-violet-600">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Troncal de Entrada</CardTitle>
                  <CardDescription className="text-xs">
                    Troncal por la que llegan las llamadas
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <Label htmlFor="didTrunkSelect" className="text-xs font-semibold text-slate-500 uppercase">Troncal para nuevo DID</Label>
                <Select value={newTrunkId} onValueChange={setNewTrunkId}>
                  <SelectTrigger id="didTrunkSelect" className="bg-white">
                    <SelectValue placeholder="Sin troncal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin asignar</SelectItem>
                    {availableTrunks.map((trunk: any) => (
                      <SelectItem key={trunk.trunk_id} value={trunk.trunk_id}>
                        {trunk.trunk_name} ({trunk.trunk_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 italic">
                  Se asignará al próximo DID que vincules.
                </p>
              </div>
            </CardContent>
          </Card>
          
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-2 mb-2">
              <Phone className="w-4 h-4" />
              Ruta de Entrada
            </h4>
            <p className="text-xs text-blue-600 leading-relaxed">
              Cualquier llamada externa recibida a través del sistema que coincida con uno de estos DIDs será enrutada directamente a la cola de esta campaña.
            </p>
          </div>
        </div>

        <div className="md:col-span-2">
          <Card className="h-[500px] flex flex-col shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Números Asignados ({dids.length})</CardTitle>
                    <CardDescription className="text-xs">
                      DIDs enrutados a esta campaña
                    </CardDescription>
                  </div>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar DID..."
                    className="pl-9 bg-white"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <ScrollArea className="flex-1">
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-48 space-y-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <span className="text-sm text-slate-500">Cargando DIDs...</span>
                  </div>
                ) : filteredDids.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                      <Phone className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">No hay DIDs asignados</h3>
                    <p className="text-slate-500 mt-1 max-w-sm text-sm">
                      {searchQuery ? "No se encontraron DIDs que coincidan con tu búsqueda." : "Esta campaña no tiene números entrantes configurados. Asigna uno usando el panel lateral."}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredDids.map(did => (
                      <div key={did.did_id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl border ${did.active ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-100 border-slate-200 text-slate-400'}`}>
                            <Phone className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-mono text-lg font-semibold text-slate-900 tracking-tight">
                              {did.did_number.replace(/(\d{2,3})(\d{4})(\d{4})/, '$1 $2 $3')}
                            </div>
                            <div className="text-sm text-slate-500 flex items-center gap-2 mt-0.5">
                              {did.description || <span className="italic">Sin descripción</span>}
                              {did.trunk_name && (
                                <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full border border-violet-100">
                                  <Server className="w-3 h-3" />
                                  {did.trunk_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={did.active ? "outline" : "default"}
                            size="sm"
                            onClick={() => handleToggleDid(did)}
                            className={did.active ? "text-slate-600 border-slate-200" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                            title={did.active ? "Desactivar DID" : "Activar DID"}
                          >
                            <Power className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteDid(did.did_id)}
                            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                            title="Eliminar DID"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
};
