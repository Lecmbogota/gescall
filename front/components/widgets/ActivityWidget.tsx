import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { PhoneCall, Clock, Phone, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface CurrentCallsData {
  inProgress: number;
  waiting: number;
  completed: number;
  failed: number;
}

interface ActivityWidgetProps {
  currentCalls: CurrentCallsData;
  dialingLevel: number;
  callsPerHour: number;
  expectedCallsPerHour: number;
}

type WidgetSize = "sm" | "md" | "lg" | "xl";

export function ActivityWidget({
  currentCalls,
  dialingLevel,
  callsPerHour,
  expectedCallsPerHour,
}: ActivityWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("md");

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        const area = offsetWidth * offsetHeight;
        
        if (area < 60000) {
          setWidgetSize("sm");
        } else if (area < 120000) {
          setWidgetSize("md");
        } else if (area < 200000) {
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

  const totalCalls = currentCalls.completed + currentCalls.failed;
  const successRate = totalCalls > 0 
    ? Math.round((currentCalls.completed / totalCalls) * 100) 
    : 0;

  // Vista compacta
  if (widgetSize === "sm") {
    return (
      <div ref={containerRef} className="h-full">
        <Card className="h-full flex flex-col">
          <CardHeader className="flex-shrink-0 pb-3">
            <CardTitle className="text-base">Actividad en Vivo</CardTitle>
          </CardHeader>
        <CardContent className="flex-1">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-1 mb-1">
                <PhoneCall className="w-3 h-3 text-green-600" />
                <span className="text-xs text-slate-600">En Llamada</span>
              </div>
              <p className="text-xl text-slate-900">{currentCalls.inProgress}</p>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-1 mb-1">
                <Clock className="w-3 h-3 text-blue-600" />
                <span className="text-xs text-slate-600">En Espera</span>
              </div>
              <p className="text-xl text-slate-900">{currentCalls.waiting}</p>
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    );
  }

  // Vista mediana
  if (widgetSize === "md") {
    return (
      <div ref={containerRef} className="h-full">
        <Card className="h-full flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle>Actividad en Tiempo Real</CardTitle>
            <CardDescription>Estado actual de las llamadas</CardDescription>
          </CardHeader>
        <CardContent className="flex-1">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <PhoneCall className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-slate-900 text-sm">En Llamada</p>
                  <p className="text-slate-500 text-xs">Activas</p>
                </div>
              </div>
              <p className="text-slate-900 text-xl">{currentCalls.inProgress}</p>
            </div>

            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-slate-900 text-sm">En Espera</p>
                  <p className="text-slate-500 text-xs">Disponibles</p>
                </div>
              </div>
              <p className="text-slate-900 text-xl">{currentCalls.waiting}</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 bg-slate-200 rounded-lg">
                  <Phone className="w-4 h-4 text-slate-600" />
                </div>
                <p className="text-slate-900 text-sm">Completadas</p>
              </div>
              <p className="text-slate-900 text-xl">
                {currentCalls.completed.toLocaleString()}
              </p>
            </div>

            <div className="p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between mb-1">
                <p className="text-slate-900 text-sm">Nivel</p>
                <Badge className="bg-purple-600 text-xs">{dialingLevel}%</Badge>
              </div>
              <Progress value={dialingLevel} className="h-1.5" />
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    );
  }

  // Vista grande y extra grande
  return (
    <div ref={containerRef} className="h-full">
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-start justify-between">
          <div>
            <CardTitle className={widgetSize === "xl" ? "text-2xl" : "text-xl"}>
              Actividad en Tiempo Real
            </CardTitle>
            <CardDescription className={widgetSize === "xl" ? "text-base" : ""}>
              Monitoreo en vivo del estado de las llamadas
            </CardDescription>
          </div>
          {widgetSize === "xl" && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-green-600">Actualización en vivo</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div className={`grid gap-4 ${widgetSize === "xl" ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"}`}>
          {/* En Llamada */}
          <div className={`flex flex-col justify-between ${widgetSize === "xl" ? "p-6" : "p-4"} bg-green-50 rounded-lg border border-green-200`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`${widgetSize === "xl" ? "p-3" : "p-2"} bg-green-100 rounded-lg`}>
                <PhoneCall className={`${widgetSize === "xl" ? "w-6 h-6" : "w-5 h-5"} text-green-600`} />
              </div>
              <div>
                <p className={`text-slate-900 ${widgetSize === "xl" ? "text-base" : "text-sm"}`}>
                  En Llamada
                </p>
                <p className={`text-slate-500 ${widgetSize === "xl" ? "text-sm" : "text-xs"}`}>
                  Activas ahora
                </p>
              </div>
            </div>
            <div>
              <p className={`text-slate-900 ${widgetSize === "xl" ? "text-5xl" : "text-3xl"} mb-2`}>
                {currentCalls.inProgress}
              </p>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className={`text-green-600 ${widgetSize === "xl" ? "text-sm" : "text-xs"}`}>
                  En vivo
                </span>
              </div>
            </div>
          </div>

          {/* En Espera */}
          <div className={`flex flex-col justify-between ${widgetSize === "xl" ? "p-6" : "p-4"} bg-blue-50 rounded-lg border border-blue-200`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`${widgetSize === "xl" ? "p-3" : "p-2"} bg-blue-100 rounded-lg`}>
                <Clock className={`${widgetSize === "xl" ? "w-6 h-6" : "w-5 h-5"} text-blue-600`} />
              </div>
              <div>
                <p className={`text-slate-900 ${widgetSize === "xl" ? "text-base" : "text-sm"}`}>
                  En Espera
                </p>
                <p className={`text-slate-500 ${widgetSize === "xl" ? "text-sm" : "text-xs"}`}>
                  Disponibles
                </p>
              </div>
            </div>
            <p className={`text-slate-900 ${widgetSize === "xl" ? "text-5xl" : "text-3xl"}`}>
              {currentCalls.waiting}
            </p>
          </div>

          {/* Completadas */}
          <div className={`flex flex-col justify-between ${widgetSize === "xl" ? "p-6" : "p-4"} bg-slate-50 rounded-lg border border-slate-200`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`${widgetSize === "xl" ? "p-3" : "p-2"} bg-slate-200 rounded-lg`}>
                <CheckCircle2 className={`${widgetSize === "xl" ? "w-6 h-6" : "w-5 h-5"} text-slate-600`} />
              </div>
              <div>
                <p className={`text-slate-900 ${widgetSize === "xl" ? "text-base" : "text-sm"}`}>
                  Completadas
                </p>
                <p className={`text-slate-500 ${widgetSize === "xl" ? "text-sm" : "text-xs"}`}>
                  Hoy
                </p>
              </div>
            </div>
            <div>
              <p className={`text-slate-900 ${widgetSize === "xl" ? "text-5xl" : "text-3xl"} mb-2`}>
                {currentCalls.completed.toLocaleString()}
              </p>
              {widgetSize === "xl" && (
                <p className="text-slate-500 text-sm">
                  Tasa de % Avance: {successRate}%
                </p>
              )}
            </div>
          </div>

          {/* Nivel de Marcación */}
          <div className={`flex flex-col justify-between ${widgetSize === "xl" ? "p-6" : "p-4"} bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-slate-900 ${widgetSize === "xl" ? "text-base" : "text-sm"}`}>
                Nivel de Marcación
              </p>
              <Badge className={`bg-purple-600 ${widgetSize === "xl" ? "text-sm px-3 py-1" : "text-xs"}`}>
                {dialingLevel}%
              </Badge>
            </div>
            <div>
              <Progress value={dialingLevel} className={widgetSize === "xl" ? "h-2.5 mb-3" : "h-2 mb-2"} />
              <p className={`text-slate-600 ${widgetSize === "xl" ? "text-base" : "text-sm"}`}>
                {callsPerHour} de {expectedCallsPerHour} llamadas/hora
              </p>
              {widgetSize === "xl" && (
                <div className="mt-2 pt-2 border-t border-purple-200">
                  <p className="text-slate-500 text-sm">
                    Rendimiento: {Math.round((callsPerHour / expectedCallsPerHour) * 100)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Estadísticas adicionales para widgets XL */}
        {widgetSize === "xl" && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="grid grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-slate-500 text-sm mb-1">Total de Llamadas</p>
                <p className="text-slate-900 text-2xl">
                  {totalCalls.toLocaleString()}
                </p>
              </div>
              <div className="text-center">
                <p className="text-slate-500 text-sm mb-1">Tasa de % Avance</p>
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="text-green-600 text-2xl">{successRate}%</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-slate-500 text-sm mb-1">Llamadas Fallidas</p>
                <div className="flex items-center justify-center gap-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <p className="text-slate-900 text-2xl">
                    {currentCalls.failed.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-slate-500 text-sm mb-1">Promedio por Hora</p>
                <p className="text-slate-900 text-2xl">{callsPerHour}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
