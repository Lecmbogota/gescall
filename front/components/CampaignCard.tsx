import { useState } from "react";
import {
  Card,
  CardContent,
} from "./ui/card";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import {
  ShieldAlert,
  ShieldCheck,
  PhoneCall,
  Gauge,
  Users,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { CampaignDetailsModal } from "./CampaignDetailsModal";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "./ui/context-menu";
import { Archive, ArrowUpCircle } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: "active" | "paused" | "inactive";
  totalLeads: number;
  contactedLeads: number;
  successRate: number;
  dialingMethod: string;
  activeAgents: number;
  lastActivity: string;
  hasCallerId?: boolean;
  hasBlacklist?: boolean;

  autoDialLevel?: string;
}

interface CampaignCardProps {
  campaign: Campaign;
  onSelect?: (campaign: Campaign) => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
}

export function CampaignCard({ campaign, onSelect, onArchive, onUnarchive }: CampaignCardProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const isLoading = campaign.dialingMethod === 'Cargando...';

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
      case "paused":
        return "bg-amber-500/10 text-amber-700 border-amber-200";
      case "inactive":
        return "bg-slate-100 text-slate-600 border-slate-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Activa";
      case "paused":
        return "Pausada";
      case "inactive":
        return "Inactiva";
      default:
        return status;
    }
  };

  const handleClick = () => {
    if (onSelect) {
      onSelect(campaign);
    } else {
      setIsDetailsOpen(true);
    }
  };

  if (isLoading) {
    return (
      <Card className="relative border border-slate-200 shadow-sm overflow-hidden bg-white rounded-xl">
        <CardContent className="p-3 flex flex-col gap-1.5">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 h-[2rem]">
            <Skeleton className="h-3.5 w-8/12 bg-slate-200 mt-1" />
            <Skeleton className="h-4 w-12 rounded-sm bg-slate-200" />
          </div>

          {/* Divider */}
          <div className="h-[1px] bg-slate-100 -mx-3 my-0.5" />

          {/* Body */}
          <div className="flex items-center justify-between pb-0.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-8 rounded bg-slate-200" />
              <Skeleton className="h-4 w-12 rounded bg-slate-200" />
            </div>
            <div className="flex items-center gap-1">
              <Skeleton className="h-4 w-4 rounded bg-slate-200" />
              <Skeleton className="h-4 w-4 rounded bg-slate-200" />
              <Skeleton className="h-4 w-4 rounded bg-slate-200" />
            </div>
          </div>
        </CardContent>
        <Skeleton className="absolute bottom-0 left-0 right-0 h-1 rounded-none bg-slate-100" />
      </Card>
    );
  }

  const progressPercentage =
    campaign.totalLeads > 0
      ? (campaign.contactedLeads / campaign.totalLeads) * 100
      : 0;

    return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Card
            className="group relative border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-300 cursor-pointer overflow-hidden bg-white rounded-xl"
            onClick={handleClick}
          >
            <CardContent className="p-3 flex flex-col gap-1.5">

              {/* Header: Name and Status */}
              <div className="flex items-start justify-between gap-2 h-[2rem]">
                <h3 className="font-semibold text-slate-900 text-[13px] leading-tight line-clamp-2 tracking-tight group-hover:text-blue-600 transition-colors pt-0.5" title={campaign.name}>
                  {campaign.name}
                </h3>
                <Badge
                  variant="outline"
                  className={cn(
                    "px-1.5 py-0 text-[10px] font-semibold border transition-colors pointer-events-none capitalize shrink-0 h-fit",
                    getStatusColor(campaign.status)
                  )}
                >
                  {getStatusText(campaign.status)}
                </Badge>
              </div>

              {/* Divider - Bleeding full width */}
              <div className="h-[1px] bg-slate-100 -mx-3 my-0.5" />

              {/* Body: Details & Metrics */}
              <div className="flex items-center justify-between pb-0.5">
                <div className="flex items-center gap-2">

                  {/* Auto Dial Level */}
                  <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded-md text-[10px] font-medium text-slate-600" title="Nivel de Auto-Marcado">
                    <Gauge className="w-3 h-3 text-slate-400" />
                    <span className="tabular-nums">{campaign.autoDialLevel || '1.0'}</span>
                  </div>

                  {/* Leads Metric with Icon */}
                  <div className="flex items-center gap-1 text-[10px] font-medium text-slate-600" title="Leads Contactados / Total">
                    <Users className="w-3 h-3 text-slate-400" />
                    <span className="tabular-nums">
                      {campaign.contactedLeads.toLocaleString()}
                      <span className="text-slate-300 mx-0.5">/</span>
                      {campaign.totalLeads.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Feature Icons */}
                <div className="flex items-center gap-1">
                  <TooltipProvider delayDuration={0}>
                    {/* Caller ID */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={cn(
                          "p-0.5 rounded-md transition-all duration-200",
                          campaign.hasCallerId
                            ? "bg-blue-50 text-blue-600"
                            : "text-slate-300 bg-slate-50/50"
                        )}>
                          <PhoneCall className="w-3 h-3" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        <p>{campaign.hasCallerId ? "Caller ID Activo" : "Caller ID Inactivo"}</p>
                      </TooltipContent>
                    </Tooltip>


                    {/* Blacklist */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={cn(
                          "p-0.5 rounded-md transition-all duration-200",
                          campaign.hasBlacklist
                            ? "bg-rose-50 text-rose-600"
                            : "text-slate-300 bg-slate-50/50"
                        )}>
                          <ShieldAlert className="w-3 h-3" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        <p>{campaign.hasBlacklist ? "Lista Negra (DNC) Activa" : "Lista Negra Inactiva"}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </CardContent>

            {/* Progress Bar - Sleek Bottom Edge */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-50">
              <div
                className={cn(
                  "h-full transition-all duration-500 ease-out",
                  campaign.status === 'active'
                    ? "bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                    : "bg-slate-300"
                )}
                style={{ width: `${Math.min(100, progressPercentage)}%` }}
              />
            </div>
          </Card>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48 rounded-xl shadow-xl border-slate-200/60 transition-all z-[100]">
          <ContextMenuItem onClick={handleClick} className="gap-2 cursor-pointer">
            <Users className="w-4 h-4 text-slate-400" />
            <span>Ver detalles</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          {campaign.status !== 'inactive' ? (
            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onArchive?.();
              }}
              className="gap-2 text-rose-600 focus:text-rose-600 focus:bg-rose-50 cursor-pointer"
            >
              <Archive className="w-4 h-4" />
              <span>Inactivar campaña</span>
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onUnarchive?.();
              }}
              className="gap-2 text-blue-600 focus:text-blue-600 focus:bg-blue-50 cursor-pointer"
            >
              <ArrowUpCircle className="w-4 h-4" />
              <span>Reactivar campaña</span>
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {!onSelect && (
        <CampaignDetailsModal
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          campaign={campaign}
        />
      )}
    </>
  );
}