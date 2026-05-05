import { ListChecks } from "lucide-react";
import { SectionHeader } from "./SectionShell";
import CampaignDispositions from "../CampaignDispositions";

interface Props { campaignId: string; }

export function SectionDispositions({ campaignId }: Props) {
    return (
        <>
            <SectionHeader
                icon={<ListChecks className="w-5 h-5" />}
                iconBg="bg-cyan-100"
                iconText="text-cyan-600"
                title="Disposiciones"
                description="Catálogo de disposiciones (resultados de llamada). Se utilizan en reportes y reglas de reintento."
            />
            <div className="bg-white/60 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-sm p-2 sm:p-4">
                <CampaignDispositions campaignId={campaignId} />
            </div>
        </>
    );
}
