import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  GitBranch,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  ArrowUp,
  ArrowDown,
  History,
  ChevronDown,
  HelpCircle,
  Play,
  AlertTriangle,
} from 'lucide-react';
import api from '../services/api';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

interface RouteRuleRow {
  id: number;
  direction: string;
  priority: number;
  active: boolean;
  trunk_id: string | null;
  trunk_name?: string | null;
  match_did: string | null;
  match_did_kind?: 'EXACT' | 'PREFIX' | 'REGEX' | null;
  match_campaign_id: string | null;
  destination_type: string;
  destination_campaign_id: string | null;
  destination_campaign_name?: string | null;
  match_campaign_name?: string | null;
  description: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

interface RouteAuditRow {
  audit_id: number;
  rule_id: number;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  changed_by: string | null;
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

interface TrunkOpt {
  trunk_id: string;
  trunk_name: string;
}

interface CampaignOpt {
  campaign_id: string;
  campaign_name: string;
  campaign_type?: string;
}

const DEST_INBOUND: { value: string; label: string }[] = [
  { value: 'CAMPAIGN_QUEUE', label: 'Cola de campaña (directo)' },
  { value: 'IVR_THEN_QUEUE', label: 'IVR y luego cola' },
];

const DID_KIND_OPTIONS: { value: 'EXACT' | 'PREFIX' | 'REGEX'; label: string }[] = [
  { value: 'EXACT', label: 'Exacto' },
  { value: 'PREFIX', label: 'Prefijo (startsWith)' },
  { value: 'REGEX', label: 'Regex' },
];

const DIAL_CAMPAIGN_TYPES = new Set([
  'BLASTER',
  'OUTBOUND_PREDICTIVE',
  'OUTBOUND_PROGRESSIVE',
  'OUTBOUND',
]);

const STORAGE_EFF_CAMPAIGN = 'gescall:routing:eff-campaign';
const STORAGE_GUIDE_INBOUND = 'gescall:routing:guide-inbound-open';
const STORAGE_SIM_DID = 'gescall:routing:sim-did';
const STORAGE_SIM_TRUNK = 'gescall:routing:sim-trunk';

export function RouteRulesManager() {
  const [rules, setRules] = useState<RouteRuleRow[]>([]);
  const [trunks, setTrunks] = useState<TrunkOpt[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RouteRuleRow | null>(null);
  const [formKind, setFormKind] = useState<'INBOUND' | 'OUTBOUND'>('INBOUND');

  const [priority, setPriority] = useState(100);
  const [active, setActive] = useState(true);
  const [trunkId, setTrunkId] = useState<string>('__any__');
  const [matchDid, setMatchDid] = useState('');
  const [matchDidKind, setMatchDidKind] = useState<'EXACT' | 'PREFIX' | 'REGEX'>('EXACT');
  const [destType, setDestType] = useState('CAMPAIGN_QUEUE');
  const [destCampaignId, setDestCampaignId] = useState('');
  const [matchOutboundCampaignId, setMatchOutboundCampaignId] = useState('');
  const [outTrunkId, setOutTrunkId] = useState('');
  const [description, setDescription] = useState('');
  const [collisions, setCollisions] = useState<RouteRuleRow[]>([]);
  const [checkingCollision, setCheckingCollision] = useState(false);

  const [auditOpen, setAuditOpen] = useState(false);
  const [auditRule, setAuditRule] = useState<RouteRuleRow | null>(null);
  const [auditRows, setAuditRows] = useState<RouteAuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const [guideOpen, setGuideOpen] = useState(true);
  const [simDid, setSimDid] = useState('');
  const [simTrunkId, setSimTrunkId] = useState<string>('__any__');
  const [simLoading, setSimLoading] = useState(false);
  const [simRule, setSimRule] = useState<RouteRuleRow | null>(null);
  const [simNoRule, setSimNoRule] = useState(false);

  const [modalAdvOpen, setModalAdvOpen] = useState(false);
  /** Oculta «Regex» en el desplegable de tipo DID hasta que el usuario lo active (flujo guiado). */
  const [allowDidRegex, setAllowDidRegex] = useState(false);

  const simPanelRef = useRef<HTMLDivElement | null>(null);
  const effPanelRef = useRef<HTMLDivElement | null>(null);

  const [effCampaignId, setEffCampaignId] = useState('');
  const [effChecking, setEffChecking] = useState(false);
  const [effResult, setEffResult] = useState<{
    effective_trunk_id: string | null;
    effective_trunk_name: string | null;
    source: string;
    rule_id: number | null;
  } | null>(null);

  const outboundDialCampaigns = useMemo(
    () => campaigns.filter((c) => DIAL_CAMPAIGN_TYPES.has(c.campaign_type || '')),
    [campaigns]
  );

  const didKindOptionsVisible = useMemo(
    () =>
      allowDidRegex
        ? DID_KIND_OPTIONS
        : DID_KIND_OPTIONS.filter((d) => d.value !== 'REGEX'),
    [allowDidRegex]
  );

  const loadAll = async () => {
    try {
      setLoading(true);
      const [rRes, tList, cRes] = await Promise.all([
        api.getRouteRules(tab),
        api.getTrunks(),
        api.getCampaigns({}),
      ]);
      const list = (rRes as { data?: RouteRuleRow[] })?.data;
      setRules(Array.isArray(list) ? list : []);
      setTrunks(Array.isArray(tList) ? tList : []);
      const cRows = (cRes as { data?: Record<string, unknown>[] })?.data;
      const mapped: CampaignOpt[] = Array.isArray(cRows)
        ? cRows.map((r) => ({
            campaign_id: String(r.campaign_id),
            campaign_name: String(r.campaign_name || r.campaign_id),
            campaign_type: r.campaign_type ? String(r.campaign_type) : undefined,
          }))
        : [];
      setCampaigns(mapped);
    } catch (e) {
      console.error(e);
      toast.error('No se pudieron cargar las reglas de enrutamiento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [tab]);

  useEffect(() => {
    try {
      const c = sessionStorage.getItem(STORAGE_EFF_CAMPAIGN);
      if (c) setEffCampaignId(c);
      const g = sessionStorage.getItem(STORAGE_GUIDE_INBOUND);
      if (g === '0') setGuideOpen(false);
      const sd = sessionStorage.getItem(STORAGE_SIM_DID);
      if (sd) setSimDid(sd);
      const st = sessionStorage.getItem(STORAGE_SIM_TRUNK);
      if (st) setSimTrunkId(st);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (effCampaignId) sessionStorage.setItem(STORAGE_EFF_CAMPAIGN, effCampaignId);
      else sessionStorage.removeItem(STORAGE_EFF_CAMPAIGN);
    } catch {
      /* ignore */
    }
  }, [effCampaignId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_GUIDE_INBOUND, guideOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [guideOpen]);

  useEffect(() => {
    try {
      if (simDid.trim()) sessionStorage.setItem(STORAGE_SIM_DID, simDid.trim());
      else sessionStorage.removeItem(STORAGE_SIM_DID);
    } catch {
      /* ignore */
    }
  }, [simDid]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_SIM_TRUNK, simTrunkId);
    } catch {
      /* ignore */
    }
  }, [simTrunkId]);

  useEffect(() => {
    if (!modalOpen) {
      setCollisions([]);
      return;
    }
    const ctl = setTimeout(async () => {
      try {
        if (formKind === 'INBOUND') {
          if (!matchDid.trim()) {
            setCollisions([]);
            return;
          }
          setCheckingCollision(true);
          const res: { data?: RouteRuleRow[] } = await api.checkRouteRuleCollision({
            direction: 'INBOUND',
            match_did: matchDid.trim(),
            trunk_id: trunkId === '__any__' ? null : trunkId,
            exclude_id: editing?.id ?? null,
          });
          setCollisions(Array.isArray(res?.data) ? res.data : []);
        } else {
          if (!matchOutboundCampaignId.trim()) {
            setCollisions([]);
            return;
          }
          setCheckingCollision(true);
          const res: { data?: RouteRuleRow[] } = await api.checkRouteRuleCollision({
            direction: 'OUTBOUND',
            match_campaign_id: matchOutboundCampaignId.trim(),
            exclude_id: editing?.id ?? null,
          });
          setCollisions(Array.isArray(res?.data) ? res.data : []);
        }
      } catch {
        setCollisions([]);
      } finally {
        setCheckingCollision(false);
      }
    }, 350);
    return () => clearTimeout(ctl);
  }, [modalOpen, formKind, matchDid, trunkId, matchOutboundCampaignId, editing]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((row) => {
      const hay = [
        row.match_did,
        row.match_campaign_id,
        row.match_campaign_name,
        row.destination_campaign_id,
        row.description,
        row.trunk_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rules, search]);

  const resetInboundForm = () => {
    setPriority(100);
    setActive(true);
    setTrunkId('__any__');
    setMatchDid('');
    setMatchDidKind('EXACT');
    setDestType('CAMPAIGN_QUEUE');
    setDestCampaignId('');
    setDescription('');
    setAllowDidRegex(false);
  };

  const resetOutboundForm = () => {
    setPriority(100);
    setActive(true);
    setMatchOutboundCampaignId('');
    setOutTrunkId('');
    setDescription('');
  };

  const openCreateInbound = () => {
    setEditing(null);
    setFormKind('INBOUND');
    resetInboundForm();
    setModalAdvOpen(false);
    setModalOpen(true);
  };

  const openCreateOutbound = () => {
    setEditing(null);
    setFormKind('OUTBOUND');
    resetOutboundForm();
    setModalAdvOpen(false);
    setModalOpen(true);
  };

  const openEdit = (row: RouteRuleRow) => {
    setEditing(row);
    setModalAdvOpen(true);
    const isOut = row.direction === 'OUTBOUND';
    setFormKind(isOut ? 'OUTBOUND' : 'INBOUND');
    setPriority(row.priority);
    setActive(row.active);
    setDescription(row.description || '');
    if (isOut) {
      setMatchOutboundCampaignId(row.match_campaign_id || '');
      setOutTrunkId(row.trunk_id || '');
    } else {
      const kind = ((row.match_did_kind as 'EXACT' | 'PREFIX' | 'REGEX') || 'EXACT').toUpperCase() as
        | 'EXACT'
        | 'PREFIX'
        | 'REGEX';
      setAllowDidRegex(kind === 'REGEX');
      setTrunkId(row.trunk_id || '__any__');
      setMatchDid(row.match_did || '');
      setMatchDidKind(kind);
      setDestType(row.destination_type);
      setDestCampaignId(row.destination_campaign_id || '');
    }
    setModalOpen(true);
  };

  const saveRule = async () => {
    if (formKind === 'INBOUND') {
      if (!matchDid.trim()) {
        toast.error('Indica el DID que coincide con la llamada entrante');
        return;
      }
      if (!destCampaignId.trim()) {
        toast.error('Selecciona la campaña de destino');
        return;
      }
      if (matchDidKind === 'REGEX') {
        try {
          new RegExp(matchDid);
        } catch (e) {
          toast.error(`Regex inválido: ${e instanceof Error ? e.message : ''}`);
          return;
        }
      }
      const trunkPayload = trunkId === '__any__' ? null : trunkId;
      const didSaved = matchDid.trim();
      const payload = {
        direction: 'INBOUND',
        priority,
        active,
        trunk_id: trunkPayload,
        match_did: didSaved,
        match_did_kind: matchDidKind,
        destination_type: destType,
        destination_campaign_id: destCampaignId.trim(),
        description: description.trim() || null,
      };
      try {
        if (editing) await api.updateRouteRule(editing.id, payload);
        else await api.createRouteRule(payload);
        toast.success(editing ? 'Regla actualizada' : 'Regla creada', {
          description:
            matchDidKind === 'EXACT'
              ? 'Opcional: confirma con el simulador que el servidor resuelve igual tras guardar.'
              : 'Usa el simulador para validar prefijos o regex con un DID real.',
          action: {
            label: 'Abrir simulador',
            onClick: () =>
              scrollToSimulator({
                prefill: { did: didSaved, trunkId: trunkPayload },
                autoRun: true,
              }),
          },
          duration: 10000,
        });
        setModalOpen(false);
        await loadAll();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Error al guardar');
      }
      return;
    }

    if (!matchOutboundCampaignId.trim()) {
      toast.error('Selecciona la campaña de marcación');
      return;
    }
    if (!outTrunkId.trim()) {
      toast.error('Selecciona la troncal de salida');
      return;
    }

    const outboundCampSaved = matchOutboundCampaignId.trim();
    const payload = {
      direction: 'OUTBOUND',
      priority,
      active,
      trunk_id: outTrunkId.trim(),
      match_campaign_id: outboundCampSaved,
      destination_type: 'OVERRIDE_TRUNK',
      destination_campaign_id: null,
      description: description.trim() || null,
    };
    try {
      if (editing) await api.updateRouteRule(editing.id, payload);
      else await api.createRouteRule(payload);
      toast.success(editing ? 'Regla actualizada' : 'Regla creada', {
        description: 'Comprueba que el dialer ve la troncal esperada.',
        action: {
          label: 'Ver troncal efectiva',
          onClick: () => scrollToEffectivePanel(outboundCampSaved),
        },
        duration: 10000,
      });
      setModalOpen(false);
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    }
  };

  const removeRule = async (id: number) => {
    if (!confirm('¿Eliminar esta regla?')) return;
    try {
      await api.deleteRouteRule(id);
      toast.success('Eliminada');
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar');
    }
  };

  const toggleRule = async (row: RouteRuleRow) => {
    try {
      await api.updateRouteRule(row.id, { active: !row.active });
      toast.success(row.active ? 'Regla desactivada' : 'Regla activada');
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  const moveRule = async (row: RouteRuleRow, direction: 'up' | 'down') => {
    try {
      await api.moveRouteRule(row.id, direction);
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al mover');
    }
  };

  const openAudit = async (row: RouteRuleRow) => {
    setAuditRule(row);
    setAuditOpen(true);
    setAuditLoading(true);
    try {
      const res: { data?: RouteAuditRow[] } = await api.getRouteRuleAudit(row.id, 100);
      setAuditRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar auditoría');
    } finally {
      setAuditLoading(false);
    }
  };

  const campaignLabel = (id: string | null | undefined) => {
    if (!id) return '—';
    return campaigns.find((c) => c.campaign_id === id)?.campaign_name || id;
  };

  const runInboundSimulation = async (override?: {
    did?: string;
    trunkId?: string | null;
  }) => {
    const d = (override?.did ?? simDid).trim();
    const t = override?.trunkId === undefined ? simTrunkId : (override.trunkId || '__any__');
    if (!d) {
      toast.error('Escribe un DID para simular');
      return;
    }
    setSimLoading(true);
    setSimRule(null);
    setSimNoRule(false);
    try {
      const res = (await api.previewRouteRule(
        d,
        t === '__any__' ? null : t
      )) as { data?: RouteRuleRow | null; success?: boolean };
      const data = res?.data;
      if (data && typeof data === 'object' && data.id != null) {
        setSimRule(data as RouteRuleRow);
      } else {
        setSimNoRule(true);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al simular');
      setSimNoRule(true);
    } finally {
      setSimLoading(false);
    }
  };

  const scrollToSimulator = (opts?: {
    closeModal?: boolean;
    prefill?: { did: string; trunkId: string | null };
    autoRun?: boolean;
  }) => {
    if (opts?.closeModal) setModalOpen(false);
    const preDid = opts?.prefill?.did?.trim() || '';
    const preTrunk = opts?.prefill?.trunkId || null;
    if (opts?.prefill) {
      setSimDid(preDid);
      setSimTrunkId(!preTrunk ? '__any__' : preTrunk);
      setSimRule(null);
      setSimNoRule(false);
    }
    const needSwitch = tabRef.current !== 'INBOUND';
    if (needSwitch) setTab('INBOUND');
    window.setTimeout(() => {
      simPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (opts?.autoRun && preDid) {
        runInboundSimulation({
          did: preDid,
          trunkId: preTrunk,
        });
      }
    }, needSwitch || opts?.closeModal ? 200 : 100);
  };

  const scrollToEffectivePanel = (campaignId: string) => {
    setEffCampaignId(campaignId);
    setEffResult(null);
    const needSwitch = tabRef.current !== 'OUTBOUND';
    if (needSwitch) setTab('OUTBOUND');
    window.setTimeout(
      () => effPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      needSwitch ? 200 : 100
    );
  };

  const checkEffectiveOutbound = async () => {
    if (!effCampaignId.trim()) {
      toast.error('Selecciona una campaña de marcación');
      return;
    }
    setEffChecking(true);
    setEffResult(null);
    try {
      const res = (await api.getEffectiveOutboundTrunk(effCampaignId.trim())) as {
        data?: {
          effective_trunk_id: string | null;
          effective_trunk_name: string | null;
          source: string;
          rule_id: number | null;
        };
      };
      setEffResult(res?.data ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al consultar');
    } finally {
      setEffChecking(false);
    }
  };

  const modalInboundDid = matchDid.trim();
  const modalInboundTrunk = trunkId === '__any__' ? null : trunkId;
  const simDidNorm = simDid.trim();
  const simTrunkNorm = simTrunkId === '__any__' ? null : simTrunkId;
  const modalMatchesLastSimulation =
    formKind === 'INBOUND' &&
    !!modalInboundDid &&
    modalInboundDid === simDidNorm &&
    modalInboundTrunk === simTrunkNorm;

  const testOutboundRule = async (row: RouteRuleRow) => {
    const campaignId = (row.match_campaign_id || '').trim();
    if (!campaignId) return;
    scrollToEffectivePanel(campaignId);
    setEffChecking(true);
    try {
      const res = (await api.getEffectiveOutboundTrunk(campaignId)) as {
        data?: {
          effective_trunk_id: string | null;
          effective_trunk_name: string | null;
          source: string;
          rule_id: number | null;
        };
      };
      setEffResult(res?.data ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al consultar');
    } finally {
      setEffChecking(false);
    }
  };

  const modalTitle =
    formKind === 'OUTBOUND'
      ? editing
        ? 'Editar regla saliente'
        : 'Nueva regla saliente'
      : editing
        ? 'Editar regla entrante'
        : 'Nueva regla entrante';

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <GitBranch className="h-7 w-7 text-muted-foreground" />
            Enrutamiento
          </h1>
          <p className="text-muted-foreground mt-1">
            <strong>Entrantes:</strong> DID → campaña (prioridad sobre DIDs por campaña).{' '}
            <strong>Salientes:</strong> campaña de marcación → troncal SIP del dialer (sustituye la troncal en la ficha de campaña).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => loadAll()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Actualizar
          </Button>
          {tab === 'INBOUND' && (
            <Button size="sm" onClick={openCreateInbound}>
              <Plus className="h-4 w-4 mr-1" />
              Nueva regla entrante
            </Button>
          )}
          {tab === 'OUTBOUND' && (
            <Button size="sm" onClick={openCreateOutbound}>
              <Plus className="h-4 w-4 mr-1" />
              Nueva regla saliente
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={tab === 'INBOUND' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setTab('INBOUND')}
        >
          Rutas entrantes
        </Button>
        <Button
          variant={tab === 'OUTBOUND' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setTab('OUTBOUND')}
        >
          Rutas salientes
        </Button>
      </div>

      {tab === 'INBOUND' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Collapsible open={guideOpen} onOpenChange={setGuideOpen} className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50 rounded-t-lg">
              <span className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                Guía rápida: cómo se elige una regla entrante
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t px-4 pb-4 pt-0">
              <div className="pt-3 space-y-3 text-sm text-muted-foreground">
                <p>
                  El sistema aplica reglas en este orden hasta encontrar la primera que coincida con el DID
                  de la llamada (y, si indicas troncal en la simulación, con esa troncal):
                </p>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>
                    <strong className="text-foreground">Exacto</strong> — coincide el DID completo.
                  </li>
                  <li>
                    <strong className="text-foreground">Prefijo</strong> — el DID empieza por el texto (gana el prefijo{' '}
                    <em>más largo</em> si hay varios).
                  </li>
                  <li>
                    <strong className="text-foreground">Regex</strong> — para casos avanzados; revisa el patrón antes de activar.
                  </li>
                </ol>
                <p>
                  <strong className="text-foreground">Troncal:</strong> una regla con troncal concreta solo aplica a llamadas por esa
                  troncal. «Cualquier troncal» aplica a todas cuando no hay regla más específica que coincida.
                </p>
                <p>
                  <strong className="text-foreground">Prioridad</strong> (número menor = más preferencia): desempata entre reglas del
                  mismo tipo cuando compiten; ajústala en «Opciones avanzadas» del formulario.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div ref={simPanelRef} id="routing-sim-panel" className="min-w-0 scroll-mt-4">
          <Card>
            <CardHeader className="pb-3 space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="h-4 w-4" />
                Simular llamada entrante
              </CardTitle>
              <CardDescription>
                Comprueba qué regla <strong>ya guardada</strong> aplicaría el servidor a un DID (útil después de publicar cambios).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                <div className="grid gap-1.5">
                  <Label htmlFor="sim-did">DID como lo envía el operador</Label>
                  <Input
                    id="sim-did"
                    className="font-mono"
                    value={simDid}
                    onChange={(e) => {
                      setSimDid(e.target.value);
                      setSimRule(null);
                      setSimNoRule(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        runInboundSimulation();
                      }
                    }}
                    placeholder="Ej. 573001112233"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Troncal (opcional)</Label>
                  <Select
                    value={simTrunkId}
                    onValueChange={(v) => {
                      setSimTrunkId(v);
                      setSimRule(null);
                      setSimNoRule(false);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Cualquiera" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Cualquier troncal</SelectItem>
                      {trunks.map((t) => (
                        <SelectItem key={t.trunk_id} value={t.trunk_id}>
                          {t.trunk_name || t.trunk_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="button" size="sm" onClick={runInboundSimulation} disabled={simLoading}>
                {simLoading ? 'Comprobando…' : 'Ver qué regla aplica'}
              </Button>
              {simRule && (
                <Alert className="border-emerald-200/80 bg-emerald-50/60">
                  <AlertTitle className="text-emerald-900">Regla #{simRule.id}</AlertTitle>
                  <AlertDescription className="text-emerald-900/90 space-y-1">
                    <p>
                      Destino:{' '}
                      <strong>
                        {simRule.destination_type === 'IVR_THEN_QUEUE' ? 'IVR → cola' : 'Cola directa'}
                      </strong>
                      {' · '}
                      Campaña:{' '}
                      <strong>{campaignLabel(simRule.destination_campaign_id)}</strong>
                    </p>
                    <p className="text-xs font-mono">
                      Coincidencia: {(simRule.match_did_kind || 'EXACT').toLowerCase()} / {simRule.match_did ?? '—'}
                      {simRule.trunk_id ? (
                        <>
                          {' '}
                          · Troncal filtro: {trunks.find((x) => x.trunk_id === simRule.trunk_id)?.trunk_name || simRule.trunk_id}
                        </>
                      ) : (
                        ' · Troncal: cualquiera'
                      )}
                      {' '}
                      · Prioridad {simRule.priority}
                    </p>
                  </AlertDescription>
                </Alert>
              )}
              {simNoRule && !simLoading && (
                <Alert>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle>Ninguna regla activa coincide</AlertTitle>
                  <AlertDescription>
                    No hay regla entrante que aplique a ese DID (con el filtro de troncal elegido). Puede
                    usarse el fallback de DIDs en campañas si está configurado.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
          </div>
        </div>
      ) : (
        <Collapsible defaultOpen className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/50 rounded-t-lg">
            <span className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
              Guía rápida: rutas salientes
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="border-t px-4 pb-4">
            <div className="pt-3 space-y-2 text-sm text-muted-foreground">
              <p>
                Cada campaña de marcación debe tener una regla saliente activa con la troncal SIP que usará el dialer. Si hay varias
                reglas para la misma campaña, gana la de <strong className="text-foreground">menor número de prioridad</strong>.
              </p>
              <p>
                Sin regla activa para esa campaña, <strong className="text-foreground">no se originan</strong> llamadas salientes.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {tab === 'OUTBOUND' && (
        <div ref={effPanelRef} id="routing-eff-panel" className="scroll-mt-4">
        <Card>
          <CardHeader className="pb-3 space-y-0">
            <CardTitle className="text-base">Comprobar troncal efectiva (dialer)</CardTitle>
            <CardDescription>
              Qué troncal SIP usaría el dialer ahora según reglas guardadas (misma lógica que al marcar).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1 grid gap-2 min-w-0">
                <Label htmlFor="eff-campaign">Campaña de marcación</Label>
                <Select
                  value={effCampaignId || '__none__'}
                  onValueChange={(v) => {
                    const id = v === '__none__' ? '' : v;
                    setEffCampaignId(id);
                    setEffResult(null);
                  }}
                >
                  <SelectTrigger id="eff-campaign">
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Seleccionar campaña…</SelectItem>
                    {outboundDialCampaigns.map((c) => (
                      <SelectItem key={c.campaign_id} value={c.campaign_id}>
                        {c.campaign_name}{' '}
                        <span className="text-muted-foreground text-xs">({c.campaign_type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={checkEffectiveOutbound}
                disabled={effChecking || !effCampaignId.trim()}
                title="Consultar ahora"
              >
                {effChecking ? 'Consultando…' : 'Consultar'}
              </Button>
            </div>
            {effResult &&
              (effResult.source === 'routing_rule' ? (
                <Alert className="border-emerald-200/80 bg-emerald-50/50">
                  <AlertTitle className="text-sm">
                    Troncal: {effResult.effective_trunk_name || effResult.effective_trunk_id || '—'}
                  </AlertTitle>
                  <AlertDescription className="text-sm">
                    <p>
                      Regla #{effResult.rule_id} · ID:{' '}
                      <span className="font-mono">{effResult.effective_trunk_id || '—'}</span>
                    </p>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-amber-200/80 bg-amber-50/70">
                  <AlertTriangle className="h-4 w-4 text-amber-800" />
                  <AlertTitle className="text-sm text-amber-950">Sin regla saliente activa</AlertTitle>
                  <AlertDescription className="text-sm text-amber-950/90">
                    No hay regla OUTBOUND activa para esta campaña; el dialer no asignará troncal por enrutamiento hasta que exista
                    una.
                  </AlertDescription>
                </Alert>
              ))}
          </CardContent>
        </Card>
        </div>
      )}

      {tab === 'OUTBOUND' ? (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-end gap-4 space-y-0">
            <div className="flex-1 space-y-2">
              <CardTitle>Reglas salientes</CardTitle>
              <CardDescription>
                Una regla por campaña de marcación (o varias con prioridad: gana la de menor número). Sin regla activa la campaña no marca.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar campaña, troncal…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Cargando…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Pri.</TableHead>
                    <TableHead className="w-24">Orden</TableHead>
                    <TableHead>Campaña</TableHead>
                    <TableHead>Troncal</TableHead>
                    <TableHead className="text-center">Activo</TableHead>
                    <TableHead className="w-[220px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row, idx) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.priority}</TableCell>
                      <TableCell>
                        <div className="flex gap-0.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => moveRule(row, 'up')}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === filtered.length - 1} onClick={() => moveRule(row, 'down')}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.match_campaign_name || row.match_campaign_id || '—'}
                      </TableCell>
                      <TableCell>
                        <span>{row.trunk_name || row.trunk_id || '—'}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={row.active} onCheckedChange={() => toggleRule(row)} />
                      </TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Probar troncal efectiva"
                          onClick={() => testOutboundRule(row)}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAudit(row)} title="Historial">
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => removeRule(row.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground mt-4">
                No hay reglas salientes. Crea una para cada campaña que marque (Blaster / Predictivo / Progresivo).
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-end gap-4 space-y-0">
            <div className="flex-1 space-y-2">
              <CardTitle>Reglas entrantes</CardTitle>
              <CardDescription>
                Orden de coincidencia: exacto → prefijo más largo → regex. Prioridad menor desempata. Una regla sin troncal puede aplicar a todas las líneas.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar DID, campaña…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Cargando…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Pri.</TableHead>
                    <TableHead className="w-24">Orden</TableHead>
                    <TableHead>DID</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Troncal</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Campaña</TableHead>
                    <TableHead className="text-center">Activo</TableHead>
                    <TableHead className="w-[220px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row, idx) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.priority}</TableCell>
                      <TableCell>
                        <div className="flex gap-0.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => moveRule(row, 'up')}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === filtered.length - 1} onClick={() => moveRule(row, 'down')}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{row.match_did}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {(row.match_did_kind || 'EXACT').toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.trunk_id ? (
                          <span>{row.trunk_name || row.trunk_id}</span>
                        ) : (
                          <Badge variant="secondary">Cualquiera</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {row.destination_type === 'IVR_THEN_QUEUE' ? 'IVR → cola' : 'Cola'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.destination_campaign_name || row.destination_campaign_id || '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={row.active} onCheckedChange={() => toggleRule(row)} />
                      </TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Probar en simulador (rellena DID y troncal)"
                          onClick={() =>
                            scrollToSimulator({
                              prefill: {
                                did: row.match_did?.trim() || '',
                                trunkId: row.trunk_id,
                              },
                              autoRun: true,
                            })
                          }
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAudit(row)} title="Historial">
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => removeRule(row.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground mt-4">
                No hay reglas. Crea una o sigue usando DIDs en cada campaña (fallback).
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
            <DialogDescription>
              {formKind === 'OUTBOUND'
                ? 'Elige la campaña que marca saliente y la troncal SIP que usará el dialer.'
                : 'Troncal opcional → DID marcado → tipo de destino y campaña.'}
            </DialogDescription>
          </DialogHeader>

          {formKind === 'INBOUND' && (
            <Alert>
              <HelpCircle className="h-4 w-4" />
              <AlertTitle className="text-sm">Flujo recomendado</AlertTitle>
              <AlertDescription className="text-sm">
                <ol className="list-decimal pl-4 mt-1 space-y-1">
                  <li>Filtro de troncal (opcional).</li>
                  <li>
                    DID y tipo: exacto o prefijo para la mayoría de casos. Regex solo tras activar el conmutador
                    debajo del formulario.
                  </li>
                  <li>Tipo de destino y campaña.</li>
                  <li>
                    Abre «Opciones avanzadas» solo si necesitas prioridad distinta de <strong>100</strong>.
                  </li>
                  <li className="flex flex-wrap items-baseline gap-x-1 gap-y-0">
                    Tras guardar, prueba con el
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-sm inline"
                      onClick={() =>
                        scrollToSimulator({
                          closeModal: true,
                          prefill: {
                            did: modalInboundDid,
                            trunkId: modalInboundTrunk,
                          },
                          autoRun: true,
                        })
                      }
                    >
                      simulador de la página
                    </Button>
                    .
                  </li>
                </ol>
              </AlertDescription>
            </Alert>
          )}
          {formKind === 'OUTBOUND' && (
            <Alert>
              <HelpCircle className="h-4 w-4" />
              <AlertTitle className="text-sm">Flujo recomendado</AlertTitle>
              <AlertDescription className="text-sm">
                <ol className="list-decimal pl-4 mt-1 space-y-1">
                  <li>Campaña de marcación.</li>
                  <li>Troncal de salida.</li>
                  <li>Prioridad en «Opciones avanzadas» si hay varias reglas para la misma campaña.</li>
                </ol>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 py-2">
            {formKind === 'INBOUND' ? (
              <>
                <div className="grid gap-2">
                  <Label>Troncal (filtro opcional)</Label>
                  <Select value={trunkId} onValueChange={setTrunkId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Cualquier troncal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Cualquier troncal</SelectItem>
                      {trunks.map((t) => (
                        <SelectItem key={t.trunk_id} value={t.trunk_id}>
                          {t.trunk_name || t.trunk_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Sin troncal, la regla puede aplicar a entradas de cualquier operador. Con troncal, solo a
                    llamadas que entren por esa línea SIP.
                  </p>
                </div>
                <div className="grid grid-cols-[1fr_140px] gap-2">
                  <div className="grid gap-2">
                    <Label>DID / patrón</Label>
                    <Input
                      value={matchDid}
                      onChange={(e) => setMatchDid(e.target.value)}
                      placeholder={
                        matchDidKind === 'PREFIX'
                          ? 'Ej. 5712345 (coincide cualquier DID que empiece así)'
                          : matchDidKind === 'REGEX'
                            ? 'Ej. ^57\\d{10}$'
                            : 'Ej. 571234567890'
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Tipo</Label>
                    <Select
                      value={matchDidKind}
                      onValueChange={(v) => setMatchDidKind(v as 'EXACT' | 'PREFIX' | 'REGEX')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {didKindOptionsVisible.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md border border-dashed border-muted-foreground/25 px-3 py-2 -mt-1">
                  <Switch
                    id="allow-did-regex"
                    checked={allowDidRegex}
                    onCheckedChange={(on) => {
                      if (!on && matchDidKind === 'REGEX') {
                        setMatchDidKind('EXACT');
                        toast.info('Tipo cambiado a «Exacto». Usa prefijo si necesitas un rango.');
                      }
                      setAllowDidRegex(!!on);
                    }}
                  />
                  <div className="space-y-0.5 min-w-0">
                    <Label htmlFor="allow-did-regex" className="text-sm font-medium cursor-pointer leading-tight">
                      Coincidencia por expresión regular (regex)
                    </Label>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Desactivado por defecto. Actívalo solo si dominas patrones; un regex amplio puede desviar mucho tráfico.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-1 leading-snug">
                  {matchDidKind === 'EXACT' && 'Solo coincide si el DID es exactamente este valor.'}
                  {matchDidKind === 'PREFIX' &&
                    'Aplica a cualquier DID que comience por este texto; si varios prefijos coinciden, gana el más largo.'}
                  {matchDidKind === 'REGEX' &&
                    'Solo para patrones complejos. Un regex mal formado o demasiado amplio puede desviar tráfico o afectar el rendimiento.'}
                </p>
                <div className="grid gap-2">
                  <Label>Tipo de destino</Label>
                  <Select value={destType} onValueChange={setDestType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEST_INBOUND.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Campaña destino</Label>
                  <Select
                    value={destCampaignId || '__none__'}
                    onValueChange={(v) => setDestCampaignId(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar campaña" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Seleccionar campaña…</SelectItem>
                      {campaigns.map((c) => (
                        <SelectItem key={c.campaign_id} value={c.campaign_id}>
                          {c.campaign_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Campaña de marcación</Label>
                  <Select
                    value={matchOutboundCampaignId || '__none__'}
                    onValueChange={(v) =>
                      setMatchOutboundCampaignId(v === '__none__' ? '' : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Seleccionar campaña…</SelectItem>
                      {outboundDialCampaigns.map((c) => (
                        <SelectItem key={c.campaign_id} value={c.campaign_id}>
                          {c.campaign_name}{' '}
                          <span className="text-muted-foreground text-xs">
                            ({c.campaign_type})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Troncal de salida</Label>
                  <Select value={outTrunkId || '__none__'} onValueChange={(v) => setOutTrunkId(v === '__none__' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar troncal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Seleccionar…</SelectItem>
                      {trunks.map((t) => (
                        <SelectItem key={t.trunk_id} value={t.trunk_id}>
                          {t.trunk_name || t.trunk_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <Collapsible
              open={modalAdvOpen}
              onOpenChange={setModalAdvOpen}
              className="rounded-lg border bg-muted/20 px-3 py-2"
            >
              <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left text-sm font-medium outline-none">
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                <span>Opciones avanzadas</span>
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  prioridad {priority}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-3 data-[state=closed]:animate-none">
                <div className="grid gap-2">
                  <Label htmlFor="rule-priority">Prioridad</Label>
                  <Input
                    id="rule-priority"
                    type="number"
                    className="max-w-[10rem]"
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10) || 100)}
                  />
                  <p className="text-xs text-muted-foreground leading-snug">
                    Número menor = mayor preferencia cuando varias reglas compiten para el mismo caso.
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="grid gap-2">
              <Label>Descripción (opcional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} id="active-rule" />
              <Label htmlFor="active-rule">Regla activa</Label>
            </div>

            {formKind === 'INBOUND' && modalMatchesLastSimulation && simRule && (
              <Alert className={editing?.id === simRule.id ? 'border-emerald-200/80 bg-emerald-50/60' : 'border-amber-200/80 bg-amber-50/70'}>
                <AlertTitle className="text-sm">
                  {editing?.id === simRule.id
                    ? 'La última simulación coincide con esta regla'
                    : `La última simulación resolvería con otra regla (#${simRule.id})`}
                </AlertTitle>
                <AlertDescription className="text-xs">
                  Resultado actual para DID/troncal iguales al formulario: {campaignLabel(simRule.destination_campaign_id)} (
                  {(simRule.match_did_kind || 'EXACT').toLowerCase()}, prioridad {simRule.priority}).
                </AlertDescription>
              </Alert>
            )}
            {formKind === 'INBOUND' && modalMatchesLastSimulation && simNoRule && (
              <Alert className="border-amber-200/80 bg-amber-50/70">
                <AlertTriangle className="h-4 w-4 text-amber-800" />
                <AlertTitle className="text-sm text-amber-950">La última simulación no encontró regla activa</AlertTitle>
                <AlertDescription className="text-xs text-amber-950/90">
                  Para este DID/troncal, el estado guardado actual no resuelve una ruta entrante.
                </AlertDescription>
              </Alert>
            )}

            {checkingCollision && (
              <p className="text-xs text-muted-foreground">Comprobando colisiones…</p>
            )}
            {!checkingCollision && collisions.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Existen {collisions.length} regla(s) activa(s) que se solapan:
                </p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {collisions.slice(0, 4).map((c) => (
                    <li key={c.id}>
                      #{c.id} (pri {c.priority}){' '}
                      {formKind === 'INBOUND'
                        ? `→ ${c.destination_campaign_name || c.destination_campaign_id || '—'}`
                        : `→ ${c.trunk_name || c.trunk_id || '—'}`}
                      {c.trunk_id && formKind === 'INBOUND' ? ` (troncal ${c.trunk_name || c.trunk_id})` : ''}
                    </li>
                  ))}
                  {collisions.length > 4 && <li>… y {collisions.length - 4} más</li>}
                </ul>
                <p className="text-[11px] text-amber-700">
                  Ajusta la prioridad o desactiva las reglas conflictivas si esta nueva debe ganar.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            {formKind === 'INBOUND' && (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  scrollToSimulator({
                    closeModal: true,
                    prefill: {
                      did: modalInboundDid,
                      trunkId: modalInboundTrunk,
                    },
                    autoRun: true,
                  })
                }
              >
                Probar este caso
              </Button>
            )}
            <Button onClick={saveRule}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Historial — Regla #{auditRule?.id} ({auditRule?.direction})
            </DialogTitle>
            <DialogDescription>
              Cambios registrados (más recientes primero).
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {auditLoading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : auditRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Cuándo</TableHead>
                    <TableHead className="w-24">Acción</TableHead>
                    <TableHead className="w-32">Usuario</TableHead>
                    <TableHead>Cambios</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditRows.map((a) => {
                    const oldD = (a.old_data || {}) as Record<string, unknown>;
                    const newD = (a.new_data || {}) as Record<string, unknown>;
                    let summary = '';
                    if (a.action === 'INSERT') {
                      summary = 'Creación';
                    } else if (a.action === 'DELETE') {
                      summary = 'Eliminación';
                    } else {
                      const interesting = ['priority', 'active', 'trunk_id', 'match_did', 'match_did_kind', 'destination_type', 'destination_campaign_id'];
                      const changes = interesting
                        .filter((k) => JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]))
                        .map((k) => `${k}: ${JSON.stringify(oldD[k] ?? null)} → ${JSON.stringify(newD[k] ?? null)}`);
                      summary = changes.length ? changes.join(' · ') : 'Sin cambios visibles';
                    }
                    return (
                      <TableRow key={a.audit_id}>
                        <TableCell className="font-mono text-xs">
                          {new Date(a.changed_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {a.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{a.changed_by || '—'}</TableCell>
                        <TableCell className="text-xs break-words">{summary}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RouteRulesManager;
