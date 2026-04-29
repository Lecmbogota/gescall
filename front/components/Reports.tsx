import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Download, FileText, BarChart3, Phone } from 'lucide-react';
import { StandardPageHeader } from './ui/layout/StandardPageHeader';

interface ReportsProps {
  username: string;
}

export function Reports({ username }: ReportsProps) {
  const reports = [
    {
      title: 'Reporte de Llamadas',
      description: 'Detalle completo de todas las llamadas realizadas',
      icon: Phone,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Reporte de Agentes',
      description: 'Rendimiento individual y estadísticas de agentes',
      icon: BarChart3,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Reporte de Campañas',
      description: 'Métricas y resultados por campaña',
      icon: FileText,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
  ];

  return (
    <div className="flex flex-col h-full p-6 relative z-20">
      {/* Header - Static */}
      <StandardPageHeader
        title="Reportes"
        username={username}
        description="Genera y descarga reportes detallados de tu call center"
      />

      {/* Reports Grid - Scrollable */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="space-y-6 pb-6">
          {/* Reports Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className={`w-12 h-12 rounded-lg ${report.bgColor} flex items-center justify-center mb-3`}>
                    <report.icon className={`w-6 h-6 ${report.color}`} />
                  </div>
                  <CardTitle>{report.title}</CardTitle>
                  <CardDescription>{report.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full gap-2">
                    <Download className="w-4 h-4" />
                    Generar Reporte
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recent Reports */}
          <Card>
            <CardHeader>
              <CardTitle>Reportes Recientes</CardTitle>
              <CardDescription>Últimos reportes generados</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: 'Reporte_Llamadas_2025-10-24.csv', date: '24 Oct 2025, 10:30' },
                  { name: 'Reporte_Agentes_2025-10-23.csv', date: '23 Oct 2025, 18:15' },
                  { name: 'Reporte_Campañas_2025-10-20.csv', date: '20 Oct 2025, 09:00' },
                ].map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="text-slate-900 text-sm">{file.name}</p>
                        <p className="text-slate-500 text-xs">{file.date}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
