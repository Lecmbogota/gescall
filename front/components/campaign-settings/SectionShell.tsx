import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

/**
 * Cabecera estándar para cada sección de Ajustes.
 * Usa el mismo lenguaje glass que el resto de la plataforma.
 */
interface SectionHeaderProps {
    icon: React.ReactNode;
    iconBg?: string;       // bg-* utility class
    iconText?: string;     // text-* utility class
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export function SectionHeader({ icon, iconBg = "bg-blue-100", iconText = "text-blue-600", title, description, action }: SectionHeaderProps) {
    return (
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pb-4 border-b border-slate-200/60 mb-5">
            <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl ${iconBg} ${iconText} flex-shrink-0`}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-slate-900 leading-tight">{title}</h2>
                    {description && (
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">{description}</p>
                    )}
                </div>
            </div>
            {action && (
                <div className="flex-shrink-0">{action}</div>
            )}
        </div>
    );
}

/**
 * Tarjeta interna reutilizable: usada para sub-bloques dentro de una sección.
 */
interface SettingsCardProps {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
    iconBg?: string;
    iconText?: string;
    accent?: string;       // borde de acento opcional, e.g. "border-amber-200/50"
    children: React.ReactNode;
    footer?: React.ReactNode;
    bodyClassName?: string;
}

export function SettingsCard({ title, description, icon, iconBg, iconText, accent, children, footer, bodyClassName }: SettingsCardProps) {
    const hasHeader = Boolean(title || description || icon);
    return (
        <Card className={`shadow-sm bg-white/60 backdrop-blur-md rounded-2xl overflow-hidden transition-all ${accent ? `border ${accent}` : "border border-slate-200/60"}`}>
            {hasHeader && (
                <CardHeader className="py-4 border-b border-slate-100/50 bg-white/40">
                    <div className="flex items-center gap-3">
                        {icon && (
                            <div className={`p-2 rounded-lg ${iconBg || "bg-slate-100"} ${iconText || "text-slate-600"}`}>
                                {icon}
                            </div>
                        )}
                        <div>
                            {title && <CardTitle className="text-sm font-semibold">{title}</CardTitle>}
                            {description && <CardDescription className="text-xs">{description}</CardDescription>}
                        </div>
                    </div>
                </CardHeader>
            )}
            <CardContent className={bodyClassName ?? "p-5"}>{children}</CardContent>
            {footer && <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40">{footer}</div>}
        </Card>
    );
}
