import { Tags } from "lucide-react";
import { SectionHeader } from "./SectionShell";
import CampaignTypifications from "../CampaignTypifications";

interface Props { campaignId: string; }

export function SectionTypifications({ campaignId }: Props) {
    return (
        <>
            <SectionHeader
                icon={<Tags className="w-5 h-5" />}
                iconBg="bg-rose-100"
                iconText="text-rose-600"
                title="Tipificaciones y formularios"
                description="Define las clasificaciones que los agentes pueden aplicar al cerrar una llamada y los formularios asociados."
            />
            <div className="bg-white/60 backdrop-blur-md border border-slate-200/60 rounded-2xl shadow-sm p-2 sm:p-4">
                <CampaignTypifications campaignId={campaignId} />
            </div>
        </>
    );
}
