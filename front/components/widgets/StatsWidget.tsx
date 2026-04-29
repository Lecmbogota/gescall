import { Card, CardContent } from "../ui/card";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, TrendingDown, LucideIcon, ArrowUp, ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface StatsWidgetProps {
  title: string;
  value: string;
  change: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  trend: "up" | "down";
  chartData: Array<{ value: number }>;
  chartColor: string;
}

type WidgetSize = "sm" | "md" | "lg" | "xl";

export function StatsWidget({
  title,
  value,
  change,
  icon: Icon,
  color,
  bgColor,
  trend,
  chartData,
  chartColor,
}: StatsWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("md");

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
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

  const sizeConfig = {
    sm: {
      padding: "p-3",
      titleSize: "text-xs",
      valueSize: "text-xl",
      changeSize: "text-xs",
      iconContainer: "p-2",
      iconSize: "w-4 h-4",
      trendIconSize: "w-3 h-3",
      showChart: false,
      layout: "compact",
    },
    md: {
      padding: "p-4",
      titleSize: "text-sm",
      valueSize: "text-2xl",
      changeSize: "text-sm",
      iconContainer: "p-3",
      iconSize: "w-5 h-5",
      trendIconSize: "w-3.5 h-3.5",
      showChart: true,
      layout: "horizontal",
    },
    lg: {
      padding: "p-6",
      titleSize: "text-base",
      valueSize: "text-4xl",
      changeSize: "text-base",
      iconContainer: "p-4",
      iconSize: "w-7 h-7",
      trendIconSize: "w-4 h-4",
      showChart: true,
      layout: "vertical",
    },
    xl: {
      padding: "p-8",
      titleSize: "text-lg",
      valueSize: "text-5xl",
      changeSize: "text-lg",
      iconContainer: "p-5",
      iconSize: "w-9 h-9",
      trendIconSize: "w-5 h-5",
      showChart: true,
      layout: "vertical-expanded",
    },
  };

  const config = sizeConfig[widgetSize];
  const TrendIcon = trend === "up" ? ArrowUp : ArrowDown;
  const trendColor = trend === "up" ? "text-green-600" : "text-red-600";
  const trendBg = trend === "up" ? "bg-green-100" : "bg-red-100";

  return (
    <div ref={containerRef} className="h-full">
      <Card className="relative overflow-hidden h-full">
      {/* Contenido principal */}
      <CardContent className={`${config.padding} h-full`}>
        {config.layout === "compact" && (
          <div className="h-full flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className={`text-slate-600 ${config.titleSize} mb-1 truncate`}>
                {title}
              </p>
              <p className={`text-slate-900 ${config.valueSize} leading-tight`}>
                {value}
              </p>
            </div>
            <div className={`${config.iconContainer} rounded-lg ${bgColor} flex-shrink-0 ml-2`}>
              <Icon className={`${config.iconSize} ${color}`} />
            </div>
          </div>
        )}

        {config.layout === "horizontal" && (
          <div className="h-full flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className={`text-slate-600 ${config.titleSize} mb-1`}>
                {title}
              </p>
              <p className={`text-slate-900 ${config.valueSize} mb-1.5 leading-tight`}>
                {value}
              </p>
              <div className="flex items-center gap-1.5">
                <div className={`p-0.5 rounded ${trendBg}`}>
                  <TrendIcon className={`${config.trendIconSize} ${trendColor}`} />
                </div>
                <span className={`${config.changeSize} ${trendColor}`}>
                  {change}
                </span>
                <span className="text-slate-500 text-xs ml-1">vs ayer</span>
              </div>
            </div>
            <div className={`${config.iconContainer} rounded-lg ${bgColor} flex-shrink-0 ml-3`}>
              <Icon className={`${config.iconSize} ${color}`} />
            </div>
          </div>
        )}

        {config.layout === "vertical" && (
          <div className="h-full flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <p className={`text-slate-600 ${config.titleSize} mb-2`}>
                  {title}
                </p>
                <p className={`text-slate-900 ${config.valueSize} leading-tight`}>
                  {value}
                </p>
              </div>
              <div className={`${config.iconContainer} rounded-lg ${bgColor} flex-shrink-0`}>
                <Icon className={`${config.iconSize} ${color}`} />
              </div>
            </div>
            <div className="mt-auto">
              <div className="flex items-center gap-2 mb-3">
                <div className={`p-1 rounded-lg ${trendBg}`}>
                  <TrendIcon className={`${config.trendIconSize} ${trendColor}`} />
                </div>
                <span className={`${config.changeSize} ${trendColor}`}>
                  {change}
                </span>
                <span className="text-slate-500 text-sm">comparado con ayer</span>
              </div>
              {config.showChart && (
                <div className="h-16 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={chartColor}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}

        {config.layout === "vertical-expanded" && (
          <div className="h-full flex flex-col">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <p className={`text-slate-600 ${config.titleSize} mb-3`}>
                  {title}
                </p>
                <p className={`text-slate-900 ${config.valueSize} leading-tight mb-4`}>
                  {value}
                </p>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${trendBg}`}>
                    <TrendIcon className={`${config.trendIconSize} ${trendColor}`} />
                  </div>
                  <div>
                    <span className={`${config.changeSize} ${trendColor}`}>
                      {change}
                    </span>
                    <p className="text-slate-500 text-sm mt-0.5">
                      comparado con el día anterior
                    </p>
                  </div>
                </div>
              </div>
              <div className={`${config.iconContainer} rounded-lg ${bgColor} flex-shrink-0`}>
                <Icon className={`${config.iconSize} ${color}`} />
              </div>
            </div>
            
            <div className="mt-auto space-y-4">
              <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
              <div className="h-24">
                <p className="text-slate-600 text-sm mb-2">Tendencia últimas 24h</p>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(15, 23, 42, 0.9)",
                        border: "none",
                        borderRadius: "8px",
                        padding: "8px 12px",
                      }}
                      labelStyle={{ color: "#fff", fontSize: "12px" }}
                      itemStyle={{ color: chartColor, fontSize: "12px" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={chartColor}
                      strokeWidth={2.5}
                      dot={{ fill: chartColor, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
