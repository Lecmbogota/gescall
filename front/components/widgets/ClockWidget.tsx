import { Card, CardContent } from "../ui/card";
import { useEffect, useRef, useState } from "react";
import { Clock, Calendar, MapPin } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatToGlobalTimezone } from "@/lib/dateUtils";

interface ClockWidgetProps {
  showDate?: boolean;
  showSeconds?: boolean;
}

type WidgetSize = "sm" | "md" | "lg" | "xl";

export function ClockWidget({
  showDate = true,
  showSeconds = true
}: ClockWidgetProps) {
  const globalTimezone = useSettingsStore(state => state.timezone);
  const timezone = globalTimezone || "America/Caracas";
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("md");
  const [time, setTime] = useState(new Date());

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

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const sizeConfig = {
    sm: {
      padding: "p-3",
      timeSize: "text-2xl",
      dateSize: "text-xs",
      iconSize: "w-4 h-4",
      showTimezone: false,
      showIcon: false,
    },
    md: {
      padding: "p-4",
      timeSize: "text-4xl",
      dateSize: "text-sm",
      iconSize: "w-5 h-5",
      showTimezone: true,
      showIcon: true,
    },
    lg: {
      padding: "p-5",
      timeSize: "text-5xl",
      dateSize: "text-base",
      iconSize: "w-6 h-6",
      showTimezone: true,
      showIcon: true,
    },
    xl: {
      padding: "p-6",
      timeSize: "text-6xl",
      dateSize: "text-lg",
      iconSize: "w-8 h-8",
      showTimezone: true,
      showIcon: true,
    },
  };

  const config = sizeConfig[widgetSize];

  // Format time
  const formatTime = () => {
    return formatToGlobalTimezone(time, timezone, showSeconds ? 'HH:mm:ss' : 'HH:mm');
  };

  // Format date
  const formatDate = () => {
    return formatToGlobalTimezone(time, timezone, "EEEE, d 'de' MMMM 'de' yyyy");
  };

  // Get timezone name
  const getTimezoneName = () => {
    const parts = timezone.split("/");
    return parts[parts.length - 1].replace("_", " ");
  };

  return (
    <div ref={containerRef} className="h-full">
      <Card className="h-full flex flex-col bg-gradient-to-br from-slate-900 to-blue-900 text-white border-slate-700">
        <CardContent className={`${config.padding} flex flex-col h-full justify-center items-center text-center relative overflow-hidden`}>
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white rounded-full blur-3xl" />
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-center gap-3 w-full">
            {/* Icon */}
            {config.showIcon && (
              <Clock className={`${config.iconSize} text-blue-300 mb-2`} />
            )}

            {/* Time */}
            <div className={`${config.timeSize} tracking-wider tabular-nums`}>
              {formatTime()}
            </div>

            {/* Date */}
            {showDate && (
              <div className="flex items-center gap-2 text-blue-200">
                <Calendar className="w-4 h-4" />
                <span className={`${config.dateSize} capitalize`}>
                  {formatDate()}
                </span>
              </div>
            )}

            {/* Timezone */}
            {config.showTimezone && (
              <div className="flex items-center gap-2 text-blue-300 mt-2">
                <MapPin className="w-3 h-3" />
                <span className="text-xs opacity-75">
                  {getTimezoneName()}
                </span>
              </div>
            )}
          </div>

          {/* Subtle animation indicator */}
          {showSeconds && (
            <div className="absolute bottom-4 right-4">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
