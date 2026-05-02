import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'react-hot-toast';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import {
  Search,
  LayoutGrid,
  List,
  LayoutList as LayoutListIcon,
  Maximize2,
  Filter,
  Plus,
  X,
  Loader2,
} from 'lucide-react';
import { Zap } from 'lucide-react';
import { CampaignCard } from './CampaignCard';
import { CampaignListView } from './CampaignListView';
import { CampaignCompactView } from './CampaignCompactView';
import { CampaignImmersiveView } from './CampaignImmersiveView';
import { StandardPageHeader } from './ui/layout/StandardPageHeader';
import { CampaignAgentsModal } from './CampaignAgentsModal';

interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'inactive';
  archived?: boolean;
  totalLeads: number;
  contactedLeads: number;
  successRate: number;
  dialingMethod: string;
  activeAgents: number;
  lastActivity: string;
  hasCallerId?: boolean;
  hasBlacklist?: boolean;

  autoDialLevel?: string;
  maxRetries?: number;
  retrySettings?: Record<string, number>;
  leadStructureSchema?: {name: string, required: boolean, is_phone?: boolean}[];
  ttsTemplates?: any[];
  altPhoneEnabled?: boolean;
  campaign_type?: string;
  agent_count?: number;
  trunk_id?: string | null;
  moh_class?: string | null;
  moh_custom_file?: string | null;
}

interface CampaignsProps {
  username: string;
  onSelectCampaign?: (campaign: Campaign) => void;
}

export function Campaigns({ username, onSelectCampaign }: CampaignsProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact' | 'immersive'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create campaign dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [agentsModalOpen, setAgentsModalOpen] = useState(false);
  const [selectedCampaignIdForAgents, setSelectedCampaignIdForAgents] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ 
    campaign_name: '', 
    dial_prefix: '52',
    auto_dial_level: '1.0',
    max_retries: 3,
    campaign_cid: '0000000000',
    campaign_type: 'BLASTER',
    predictive_target_drop_rate: 0.03,
    predictive_min_factor: 1.0,
    predictive_max_factor: 4.0
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [prefixes, setPrefixes] = useState<{id: number, prefix: string, country_name: string, country_code: string}[]>([]);

  // Get user campaigns from auth store
  const { getCampaignIds, getUser } = useAuthStore();
  const user = getUser();

  // Note: No placeholder campaigns are created here.
  // The loading state and fetchCampaignsData handle the initial render.


  const fetchCampaignsData = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) {
        setLoading(true);
      }
      console.log('[Campaigns] ========================================');
      console.log('[Campaigns] Authenticated User:', user?.name);
      console.log('[Campaigns] ========================================');

      // Get campaigns from authenticated user
      const campaignIds = getCampaignIds();

      // Validate campaigns
      if (!campaignIds || campaignIds.length === 0) {
        console.warn('[Campaigns] No campaigns available for user');
        setError('No campaigns assigned to your user');
        if (!isBackground) {
          setLoading(false);
        }
        return;
      }

      console.log('[Campaigns] Fetching data for campaigns:', campaignIds);

      // Fetch campaigns data from backend
      const campaignsResponse = await api.getCampaigns({ allowedCampaigns: campaignIds });

      if (campaignsResponse.success && campaignsResponse.data) {
        console.log('[Campaigns] Data received:', campaignsResponse.data.length);

        // Filter campaigns to only those assigned to user
        const userCampaignsData = campaignsResponse.data.filter((camp: any) =>
          campaignIds.includes(camp.campaign_id)
        );

        // Fetch progress for each campaign
        const transformedCampaigns: Campaign[] = await Promise.all(
          userCampaignsData.map(async (camp: any) => {
            try {
              // Fetch progress from backend
              const progressResponse = await api.getCampaignProgress(camp.campaign_id);

              const progressData = progressResponse.success && progressResponse.data
                ? progressResponse.data
                : { total: 0, avance: 0, porcentaje: 0 };

              // Determine flags
              const hasCallerId = !!(
                camp.callerid_rotation_mode && camp.callerid_rotation_mode !== 'OFF'
              );

              const hasBlacklist = !!(
                camp.use_internal_dnc === 'Y' ||
                camp.use_campaign_dnc === 'Y' ||
                camp.global_dnc_exists === 1 ||
                camp.campaign_dnc_exists === 1
              );



              return {
                id: camp.campaign_id,
                name: (camp.campaign_name || camp.campaign_id).toUpperCase(),
                status: camp.archived ? 'inactive' : (camp.active === 'Y' ? 'active' : 'paused'),
                archived: camp.archived || false,
                totalLeads: progressData.total || 0,
                contactedLeads: progressData.avance || 0,
                successRate: progressData.porcentaje || 0,
                dialingMethod: camp.dial_method || 'Auto',
                activeAgents: camp.agent_count || 0,
                lastActivity: new Date().toISOString(),
                hasCallerId,
                hasBlacklist,

                autoDialLevel: camp.auto_dial_level ? String(camp.auto_dial_level) : '0',
                maxRetries: camp.max_retries ?? 3,
                retrySettings: camp.retry_settings || undefined,
                leadStructureSchema: camp.lead_structure_schema || undefined,
                ttsTemplates: camp.tts_templates || [],
                altPhoneEnabled: camp.alt_phone_enabled || false,
                campaign_type: camp.campaign_type || 'BLASTER',
                agent_count: camp.agent_count || 0,
                trunk_id: camp.trunk_id || null,
                moh_class: camp.moh_class || null,
                moh_custom_file: camp.moh_custom_file || null,
              };
            } catch (err) {
              console.error(`[Campaigns] Error fetching progress for ${camp.campaign_id}:`, err);
              return {
                id: camp.campaign_id,
                name: camp.campaign_name || camp.campaign_id,
                status: camp.active === 'Y' ? 'active' : 'paused',
                totalLeads: 0,
                contactedLeads: 0,
                successRate: 0,
                dialingMethod: 'Auto',
                activeAgents: 0,
                lastActivity: new Date().toISOString(),
                autoDialLevel: '0',
                campaign_type: camp.campaign_type || 'BLASTER',
                agent_count: 0,
                trunk_id: camp.trunk_id || null,
                moh_class: camp.moh_class || null,
                moh_custom_file: camp.moh_custom_file || null,
              };
            }
          })
        );

        setCampaigns(transformedCampaigns);
        setError(null);
        if (!isBackground) {
          setLoading(false);
        }
      } else {
        console.error('[Campaigns] Failed to fetch campaigns:', campaignsResponse.error);
        setError('Failed to load campaigns data');
        if (!isBackground) {
          setLoading(false);
        }
      }
    } catch (err) {
      console.error('[Campaigns] Error fetching campaigns:', err);
      setError('Unexpected error loading campaigns');
      if (!isBackground) {
        setLoading(false);
      }
    }
  }, [getCampaignIds, user?.name]);

  // Fetch campaigns data from backend API with periodic refresh
  useEffect(() => {
    const refreshIntervalMs = 30000;

    fetchCampaignsData(false);
    const intervalId = window.setInterval(() => {
      fetchCampaignsData(true);
    }, refreshIntervalMs);

    const loadPrefixes = async () => {
      try {
        const res = await api.getCampaignPrefixes();
        if (res.success) {
          console.log('[Campaigns] Loaded prefixes:', res.data);
          setPrefixes(res.data);
        } else {
          console.error('[Campaigns] Prefixes returned success: false', res);
        }
      } catch (err) {
        console.error('[Campaigns] Error loading prefixes:', err);
      }
    };
    loadPrefixes();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchCampaignsData(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchCampaignsData]);

  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch = campaign.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    
    // Si el filtro es "Inactivas", solo mostramos las inactivas
    if (statusFilter === 'inactive') {
      return matchesSearch && campaign.status === 'inactive';
    }
    
    // Si el filtro es "Todos", mostramos activas y pausadas, pero NO inactivas
    if (statusFilter === 'all') {
      return matchesSearch && campaign.status !== 'inactive';
    }

    // Para otros filtros (Activas, Pausadas), coincidencia exacta
    return matchesSearch && campaign.status === statusFilter;
  });

  // Create campaign handler
  const handleCreateCampaign = async () => {
    if (!createForm.campaign_name) {
      setCreateError('El nombre es requerido');
      return;
    }
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const result = await api.createCampaign(createForm);
      if (result.success) {
        toast.success(`Campaña ${result.data.campaign_id} creada. Usuario: ${result.data.user} / Contraseña: ${result.data.user_password}`, {
          duration: 5000,
        });

        // Add to authStore so it appears immediately!
        useAuthStore.getState().addCampaign({
          id: result.data.campaign_id,
          name: result.data.campaign_name,
          active: true
        });

        // Trigger immediate refetch
        fetchCampaignsData(false);

        setCreateForm({ 
          campaign_name: '', 
          dial_prefix: '52',
          auto_dial_level: '1.0',
          max_retries: 3,
          campaign_cid: '0000000000',
          campaign_type: 'BLASTER',
          predictive_target_drop_rate: 0.03,
          predictive_min_factor: 1.0,
          predictive_max_factor: 4.0
        });
        // Close modal immediately
        setShowCreateDialog(false);
      } else {
        setCreateError(result.error || 'Error al crear campaña');
      }
    } catch (err: any) {
      setCreateError(err.message || 'Error inesperado');
    } finally {
      setCreating(false);
    }
  };

  const handleArchiveCampaign = async (campaignId: string) => {
    try {
      await api.archiveCampaign(campaignId);
      toast.success('Campaña inactivada');
      fetchCampaignsData(true);
    } catch (err: any) {
      toast.error(err.message || 'Error al inactivar campaña');
    }
  };

  const handleUnarchiveCampaign = async (campaignId: string) => {
    try {
      await api.unarchiveCampaign(campaignId);
      toast.success('Campaña reactivada');
      fetchCampaignsData(true);
    } catch (err: any) {
      toast.error(err.message || 'Error al reactivar campaña');
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Fixed Layout Top: Header and Filters */}
      <div className="flex-shrink-0 px-6 pt-4 space-y-4 pb-2 relative z-20">
        <StandardPageHeader
          title="Campañas"
          description="Gestione y supervise sus campañas de marcado"
          username={user?.name || username}
        />

        {/* Filters and Actions - clean layout */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between px-1">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Buscar campañas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white/40 backdrop-blur-md border-slate-200/60 focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all rounded-xl shadow-sm hover:bg-white/60"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] bg-white/40 backdrop-blur-md border-slate-200/60 rounded-xl shadow-sm hover:bg-white/60 transition-all focus:bg-white">
                <div className="flex items-center gap-2 text-slate-700">
                  <Filter className="w-3.5 h-3.5" />
                  <SelectValue placeholder="Estado" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activas</SelectItem>
                <SelectItem value="paused">Pausadas</SelectItem>
                <SelectItem value="inactive">Inactivas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* View toggles could go here in the future */}
          </div>
        </div>
      </div>

      {/* Create Campaign Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Nueva Campaña</h3>
              <button
                onClick={() => { setShowCreateDialog(false); setCreateError(null); setCreateSuccess(null); }}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="space-y-4">

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre de Campaña</label>
                <Input
                  placeholder="Ej: Ventas Norte"
                  value={createForm.campaign_name}
                  onChange={(e) => setCreateForm(f => ({ ...f, campaign_name: e.target.value.slice(0, 40) }))}
                  maxLength={40}
                  className="rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de Campaña</label>
                <Select
                  value={createForm.campaign_type}
                  onValueChange={(value) => setCreateForm(f => ({ ...f, campaign_type: value }))}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Seleccione el tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INBOUND">Inbound (Entrante)</SelectItem>
                    <SelectItem value="OUTBOUND_PREDICTIVE">Outbound Predictivo</SelectItem>
                    <SelectItem value="OUTBOUND_PROGRESSIVE">Outbound Progresivo</SelectItem>
                    <SelectItem value="BLASTER">Blaster</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {createForm.campaign_type === 'OUTBOUND_PREDICTIVE' && (
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Configuración Predictiva
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Tasa Abandono Máx</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.03"
                      value={createForm.predictive_target_drop_rate}
                      onChange={(e) => setCreateForm(f => ({ ...f, predictive_target_drop_rate: parseFloat(e.target.value) || 0.03 }))}
                      className="rounded-xl h-9 text-sm"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Ej: 0.03 = 3%</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Factor Mín</label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.5"
                      placeholder="1.0"
                      value={createForm.predictive_min_factor}
                      onChange={(e) => setCreateForm(f => ({ ...f, predictive_min_factor: parseFloat(e.target.value) || 1.0 }))}
                      className="rounded-xl h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Factor Máx</label>
                    <Input
                      type="number"
                      step="0.1"
                      min="1.5"
                      placeholder="4.0"
                      value={createForm.predictive_max_factor}
                      onChange={(e) => setCreateForm(f => ({ ...f, predictive_max_factor: parseFloat(e.target.value) || 4.0 }))}
                      className="rounded-xl h-9 text-sm"
                    />
                  </div>
                </div>
              </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Nivel de marcación</label>
                  <Input
                    type="number"
                    step="0.1"
                    min="1.0"
                    placeholder="1.0"
                    value={createForm.auto_dial_level}
                    onChange={(e) => setCreateForm(f => ({ ...f, auto_dial_level: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Número de reintentos</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="3"
                    value={createForm.max_retries}
                    onChange={(e) => setCreateForm(f => ({ ...f, max_retries: parseInt(e.target.value) || 0 }))}
                    className="rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">CallerID por defecto</label>
                <Input
                  placeholder="0000000000"
                  value={createForm.campaign_cid}
                  onChange={(e) => setCreateForm(f => ({ ...f, campaign_cid: e.target.value.replace(/[^0-9]/g, '').slice(0, 20) }))}
                  className="rounded-xl"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Prefijo del país</label>
                <Select
                  value={createForm.dial_prefix}
                  onValueChange={(value) => setCreateForm(f => ({ ...f, dial_prefix: value }))}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Seleccione un prefijo" />
                  </SelectTrigger>
                  <SelectContent>
                    {prefixes.map((p) => (
                      <SelectItem key={String(p.id)} value={String(p.prefix)}>
                        {p.country_name} (+{p.prefix})
                      </SelectItem>
                    ))}
                    {prefixes.length === 0 && (
                      <SelectItem value="52">México (+52) - Fallback</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-400 mt-1">Prefijo que se antepone al número al marcar</p>
              </div>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {createError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => { setShowCreateDialog(false); setCreateError(null); setCreateSuccess(null); }}
                className="flex-1 rounded-xl"
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateCampaign}
                disabled={creating || !createForm.campaign_name}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {creating ? 'Creando...' : 'Crear Campaña'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {/* Content Area */}
        <div className="animate-in fade-in duration-500 slide-in-from-bottom-4">
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {/* Create Campaign Card always first */}
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/50 hover:bg-slate-100 hover:border-blue-400 transition-all group h-full min-h-[85px]"
              >
                <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm text-slate-400 group-hover:text-blue-500 group-hover:scale-110 transition-all mb-2">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="font-medium text-[13px] text-slate-600 group-hover:text-blue-600 transition-colors">Crear Nueva Campaña</span>
              </button>
              
              {filteredCampaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onSelect={onSelectCampaign}
                  onArchive={() => handleArchiveCampaign(campaign.id)}
                  onUnarchive={() => handleUnarchiveCampaign(campaign.id)}
                  onAssignAgents={() => {
                    setSelectedCampaignIdForAgents(campaign.id);
                    setAgentsModalOpen(true);
                  }}
                />
              ))}

              {filteredCampaigns.length === 0 && !loading && (
                <div className="col-span-1 md:col-span-1 lg:col-span-2 xl:col-span-3 flex flex-col items-center justify-center p-12 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200 border-dashed">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900">No se encontraron campañas</h3>
                  <p className="text-slate-500 text-center mt-1 mb-4 max-w-sm">
                    No hay campañas que coincidan con tu búsqueda o filtros actuales.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              )}
            </div>
          )}

          {viewMode === 'list' && (
            <div className="space-y-4">
              <button
                onClick={() => setShowCreateDialog(true)}
                className="w-full flex items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/50 hover:bg-slate-100 hover:border-blue-400 transition-all group"
              >
                <Plus className="w-5 h-5 mr-2 text-slate-400 group-hover:text-blue-500 transition-all" />
                <span className="font-medium text-slate-600 group-hover:text-blue-600 transition-colors">Crear Nueva Campaña</span>
              </button>
              {filteredCampaigns.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white/90 backdrop-blur-sm rounded-xl border border-slate-200 border-dashed">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900">No se encontraron campañas</h3>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              ) : (
                <CampaignListView
                  campaigns={filteredCampaigns}
                  onSelectCampaign={onSelectCampaign}
                />
              )}
            </div>
          )}

          {viewMode === 'compact' && (
            <CampaignCompactView
              campaigns={filteredCampaigns}
              onSelectCampaign={onSelectCampaign}
            />
          )}

          {viewMode === 'immersive' && (
            <CampaignImmersiveView
              campaigns={filteredCampaigns}
              onSelectCampaign={onSelectCampaign}
            />
          )}
        </div>
      </div>

      <CampaignAgentsModal
        isOpen={agentsModalOpen}
        campaignId={selectedCampaignIdForAgents || ''}
        onClose={() => {
          setAgentsModalOpen(false);
          setSelectedCampaignIdForAgents(null);
        }}
        onSave={() => {
          fetchCampaignsData(true);
        }}
      />
    </div>
  );
}
