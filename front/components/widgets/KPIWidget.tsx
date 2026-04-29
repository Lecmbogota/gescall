import { Card, CardContent } from "../ui/card";
import { Progress } from "../ui/progress";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface KPIWidgetProps {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  progress?: number;
  chartData: Array<{ value: number }>;
  chartColor: string;
}

type WidgetSize = "sm" | "md" | "lg" | "xl";

export function KPIWidget({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  bgColor,
  progress,
  chartData,
  chartColor,
}: KPIWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("md");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        setDimensions({ width: offsetWidth, height: offsetHeight });
        
        // Determinar tamaño basado en área del contenedor
        const area = offsetWidth * offsetHeight;
        if (area < 30000) {
          setWidgetSize("sm");
        } else if (area < 60000) {
          setWidgetSize("md");
        } else if (area < 100000) {
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

  // Configuración dinámica basada en tamaño
  const sizeConfig = {
    sm: {
      padding: "p-3",
      titleSize: "text-xs",
      valueSize: "text-xl",
      subtitleSize: "text-[10px]",
      iconContainer: "p-2",
      iconSize: "w-4 h-4",
      progressHeight: "h-1.5",
      showChart: false,
      showProgress: false,
    },
    md: {
      padding: "p-4",
      titleSize: "text-sm",
      valueSize: "text-3xl",
      subtitleSize: "text-xs",
      iconContainer: "p-3",
      iconSize: "w-5 h-5",
      progressHeight: "h-2",
      showChart: true,
      showProgress: progress !== undefined,
    },
    lg: {
      padding: "p-6",
      titleSize: "text-base",
      valueSize: "text-5xl",
      subtitleSize: "text-sm",
      iconContainer: "p-4",
      iconSize: "w-8 h-8",
      progressHeight: "h-2.5",
      showChart: true,
      showProgress: progress !== undefined,
    },
    xl: {
      padding: "p-8",
      titleSize: "text-lg",
      valueSize: "text-6xl",
      subtitleSize: "text-base",
      iconContainer: "p-5",
      iconSize: "w-10 h-10",
      progressHeight: "h-3",
      showChart: true,
      showProgress: progress !== undefined,
    },
  };

  const config = sizeConfig[widgetSize];

  return (
    <div ref={containerRef} className="h-full">
      <Card className="relative overflow-hidden h-full">
      {/* Contenido principal */}
      <CardContent className={`${config.padding} h-full flex flex-col`}>
        <div className="flex items-start justify-between mb-auto">
          <div className="flex-1 min-w-0">
            <p className={`text-slate-600 ${config.titleSize} mb-1 truncate`}>
              {title}
            </p>
            <p className={`text-slate-900 ${config.valueSize} mb-1 break-words leading-tight`}>
              {value}
            </p>
            <p className={`text-slate-500 ${config.subtitleSize} truncate`}>
              {subtitle}
            </p>
            
            {/* Información adicional para widgets grandes */}
            {widgetSize === "xl" && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-sm">Última actualización</span>
                  <span className="text-sm">Hace 2 min</span>
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
              </div>
            )}
          </div>
          <div className={`${config.iconContainer} rounded-lg ${bgColor} flex-shrink-0 ml-3`}>
            <Icon className={`${config.iconSize} ${color}`} />
          </div>
        </div>
        
        {config.showProgress && progress !== undefined && (
          <div className="space-y-1.5 mt-4">
            <div className="flex items-center justify-between">
              <span className={`${config.subtitleSize} text-slate-600`}>
                Progreso
              </span>
              <span className={`${config.titleSize} text-slate-900`}>
                {progress}%
              </span>
            </div>
            <Progress value={progress} className={config.progressHeight} />
          </div>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
