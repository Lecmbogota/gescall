import React, { useEffect, useState } from 'react';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { Card, CardContent } from './ui/card';
import { Loader2 } from 'lucide-react';
import api from '@/services/api';

const SwaggerDocs: React.FC = () => {
    const [spec, setSpec] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.getSwaggerDocs()
            .then(data => {
                setSpec(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message || 'Error al cargar la documentación API');
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[500px]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-[500px] text-red-500">
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl flex items-center gap-2 tracking-tight text-slate-800 mb-1">
                        <span className="font-light">Documentación</span>
                        <span className="font-semibold text-[#8b5cf6]">API</span>
                    </h2>
                    <p className="text-slate-500 text-sm">
                        Explora y prueba los endpoints de la API de GesCall.
                    </p>
                </div>
            </div>

            <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-0 overflow-hidden rounded-lg">
                    <div className="scalar-container light bg-white overflow-y-auto max-h-[calc(100vh-250px)]">
                        <ApiReferenceReact
                            configuration={{
                                spec: { content: spec },
                                theme: 'default',
                                hideDownloadButton: true,
                                hideModels: true,
                                darkMode: false,
                                customCss: `
                                    .dark-mode {
                                        --scalar-background-1: #ffffff !important;
                                        --scalar-background-2: #f8fafc !important;
                                        --scalar-background-3: #f1f5f9 !important;
                                        --scalar-color-1: #1e293b !important;
                                        --scalar-color-2: #334155 !important;
                                        --scalar-color-3: #475569 !important;
                                        --scalar-color-ghost: #94a3b8 !important;
                                    }
                                `
                            }}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default SwaggerDocs;
