/**
 * Tipos compartidos para el dashboard y reportes (GesCall nativo, PostgreSQL).
 * Antes vivían en vicibroker.ts; ya no hay broker SQL externo.
 */

export interface CampaignStatusRow {
    campaign_id: string;
    campaign_name: string;
    estado: string;
    active?: string;
    dial_status?: string;
    lead_order?: string;
    hopper_level?: number;
    auto_dial_level?: number;
    [key: string]: unknown;
}

export interface ListCountRow {
    campaign_id: string;
    list_id?: string;
    list_name?: string;
    cantidad_listas: number;
    lead_count?: number;
    [key: string]: unknown;
}
