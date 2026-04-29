import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { useEffect, useRef, useState } from "react";
import { Users, TrendingUp, PhoneCall, CheckCircle2, RefreshCw } from "lucide-react";
import api from "@/services/api";
import { useAuthStore } from "@/stores/authStore";

interface CampaignSummary {
  campaign_id: string;
  campaign_name: string;
  active: string;
  total_leads: number;
  contactados: number;
  exitosos: number;
  pendientes: number;
  progreso_pct: number | null;
  tasa_exito_pct: number | null;
  agentes_activos: number;
}

type WidgetSize = "sm" | "md" | "lg" | "xl";

export function CampaignsSummaryWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("md");
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { getCampaignIds } = useAuthStore();

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        const area = offsetWidth * offsetHeight;

        if (area < 40000) {
          setWidgetSize("sm");
        } else if (area < 80000) {
          setWidgetSize("md");
        } else if (area < 150000) {
          setWidgetSize("lg");
        } else {
          setWidgetSize("xl");
        }
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get user's campaigns
      const userCampaigns = getCampaignIds();

      // Fetch summary
      const response = await api.getCampaignsSummary(userCampaigns);

      if (response.success && response.data) {
        setCampaigns(response.data);
      } else {
        setError('No se pudieron cargar los datos');
      }
    } catch (err) {
      console.error('[CampaignsSummaryWidget] Error:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);

    return () => clearInterval(interval);
  }, []);

  const sizeConfig = {
    sm: {
      padding: "p-3",
      titleSize: "text-sm",
      tableSize: "text-xs",
      showProgress: false,
      showAgents: false,
      maxRows: 3,
    },
    md: {
      padding: "p-4",
      titleSize: "text-base",
      tableSize: "text-sm",
      showProgress: true,
      showAgents: false,
      maxRows: 5,
    },
    lg: {
      padding: "p-5",
      titleSize: "text-lg",
      tableSize: "text-sm",
      showProgress: true,
      showAgents: true,
      maxRows: 8,
    },
    xl: {
      padding: "p-6",
      titleSize: "text-xl",
      tableSize: "text-base",
      showProgress: true,
      showAgents: true,
      maxRows: 12,
    },
  };

  const config = sizeConfig[widgetSize];

  const getStatusBadge = (active: string) => {
    if (active === 'Y') {
      return <Badge className="bg-green-500 text-white text-xs">Activa</Badge>;
    }
    return <Badge className="bg-slate-400 text-white text-xs">Inactiva</Badge>;
  };

  const displayedCampaigns = campaigns.slice(0, config.maxRows);
  const hasMore = campaigns.length > config.maxRows;

  return (
    <div ref={containerRef} className="h-full">
      <Card className="h-full flex flex-col">
        <CardHeader className={`${config.padding} pb-3 flex-shrink-0`}>
          <div className="flex items-center justify-between">
            <CardTitle className={config.titleSize}>Resumen de Campañas</CardTitle>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-1 hover:bg-slate-100 rounded-md transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''} text-slate-600`} />
            </button>
          </div>
        </CardHeader>

        <CardContent className={`${config.padding} pt-0 flex-1 overflow-hidden flex flex-col`}>
          {loading && campaigns.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Cargando...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-red-500 text-sm">
              {error}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              No hay campañas disponibles
            </div>
          ) : (
            <div className="overflow-auto flex-1">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead className={`bg-white ${config.tableSize}`}>Campaña</TableHead>
                    {config.showProgress && (
                      <TableHead className={`bg-white ${config.tableSize}`}>Progreso</TableHead>
                    )}
                    <TableHead className={`bg-white ${config.tableSize} text-right`}>% Avance</TableHead>
                    {config.showAgents && (
                      <TableHead className={`bg-white ${config.tableSize} text-right`}>Agentes</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedCampaigns.map((campaign) => (
                    <TableRow key={campaign.campaign_id}>
                      <TableCell className={config.tableSize}>
                        <div>
                          <div className="font-medium text-slate-900 truncate max-w-[150px]">
                            {campaign.campaign_name || campaign.campaign_id}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {getStatusBadge(campaign.active)}
                            <span className="text-slate-500 text-xs">
                              {Number(campaign.contactados || 0).toLocaleString()} / {Number(campaign.total_leads || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {config.showProgress && (
                        <TableCell className={config.tableSize}>
                          <div className="w-24">
                            <Progress
                              value={Number(campaign.progreso_pct) || 0}
                              className="h-2"
                            />
                            <div className="text-xs text-slate-600 mt-1">
                              {Number(campaign.progreso_pct || 0).toFixed(1)}%
                            </div>
                          </div>
                        </TableCell>
                      )}

                      <TableCell className={`${config.tableSize} text-right`}>
                        <div className="flex flex-col items-end">
                          <div className="font-medium text-slate-900">
                            {Number(campaign.tasa_exito_pct || 0).toFixed(1)}%
                          </div>
                          <div className="text-xs text-green-600">
                            {Number(campaign.exitosos || 0).toLocaleString()} ventas
                          </div>
                        </div>
                      </TableCell>

                      {config.showAgents && (
                        <TableCell className={`${config.tableSize} text-right`}>
                          <div className="flex items-center justify-end gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-500" />
                            <span className="font-medium text-slate-900">
                              {Number(campaign.agentes_activos || 0)}
                            </span>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {hasMore && (
                <div className="text-center py-2 text-xs text-slate-500 border-t">
                  +{campaigns.length - config.maxRows} campañas más
                </div>
              )}
            </div>
          )}

          {!loading && !error && campaigns.length > 0 && widgetSize === "xl" && (
            <div className="mt-4 pt-4 border-t grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-xs text-slate-600 mb-1">Total Leads</div>
                <div className="text-lg font-bold text-slate-900">
                  {campaigns.reduce((sum, c) => sum + Number(c.total_leads || 0), 0).toLocaleString()}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-600 mb-1">Contactados</div>
                <div className="text-lg font-bold text-blue-600">
                  {campaigns.reduce((sum, c) => sum + Number(c.contactados || 0), 0).toLocaleString()}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-600 mb-1">Exitosos</div>
                <div className="text-lg font-bold text-green-600">
                  {campaigns.reduce((sum, c) => sum + Number(c.exitosos || 0), 0).toLocaleString()}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-600 mb-1">Agentes</div>
                <div className="text-lg font-bold text-purple-600">
                  {campaigns.reduce((sum, c) => sum + Number(c.agentes_activos || 0), 0)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
