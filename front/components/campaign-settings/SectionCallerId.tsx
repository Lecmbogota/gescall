import { Phone } from "lucide-react";
import { Badge } from "../ui/badge";
import { SectionHeader, SettingsCard } from "./SectionShell";
import { CampaignCallerIdSettings } from "../CampaignCallerIdSettings";

interface Props { campaignId: string; }

export function SectionCallerId({ campaignId }: Props) {
    return (
        <>
            <SectionHeader
                icon={<Phone className="w-5 h-5" />}
                iconBg="bg-slate-100"
                iconText="text-slate-700"
                title="CallerID Local Presence"
                description="Configura la rotación de CallerID basada en el prefijo del lead para aumentar la tasa de contacto."
                action={<Badge variant="outline" className="text-[10px] bg-slate-50">Experimental</Badge>}
            />
            <SettingsCard>
                <CampaignCallerIdSettings campaignId={campaignId} />
            </SettingsCard>
        </>
    );
}
