import { Card, CardContent } from "../ui/card";
import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

interface CalendarEvent {
  id: string;
  date: Date;
  title: string;
  color: string;
}

interface CalendarWidgetProps {
  events?: CalendarEvent[];
}

type WidgetSize = "sm" | "md" | "lg" | "xl";

export function CalendarWidget({ events = [] }: CalendarWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("md");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        const area = offsetWidth * offsetHeight;
        
        if (area < 50000) {
          setWidgetSize("sm");
        } else if (area < 100000) {
          setWidgetSize("md");
        } else if (area < 180000) {
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
      titleSize: "text-sm",
      daySize: "text-xs",
      iconSize: "w-4 h-4",
      showEvents: false,
    },
    md: {
      padding: "p-4",
      titleSize: "text-base",
      daySize: "text-sm",
      iconSize: "w-5 h-5",
      showEvents: true,
    },
    lg: {
      padding: "p-5",
      titleSize: "text-lg",
      daySize: "text-base",
      iconSize: "w-6 h-6",
      showEvents: true,
    },
    xl: {
      padding: "p-6",
      titleSize: "text-xl",
      daySize: "text-base",
      iconSize: "w-7 h-7",
      showEvents: true,
    },
  };

  const config = sizeConfig[widgetSize];

  // Calendar logic
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay();
  };

  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const isToday = (day: number | null) => {
    if (!day) return false;
    const today = new Date();
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const hasEvent = (day: number | null) => {
    if (!day) return false;
    return events.some((event) => {
      const eventDate = new Date(event.date);
      return (
        eventDate.getDate() === day &&
        eventDate.getMonth() === currentDate.getMonth() &&
        eventDate.getFullYear() === currentDate.getFullYear()
      );
    });
  };

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const dayNames = ["D", "L", "M", "M", "J", "V", "S"];

  const calendarDays = generateCalendarDays();

  return (
    <div ref={containerRef} className="h-full">
      <Card className="h-full flex flex-col bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
        <CardContent className={`${config.padding} flex flex-col h-full`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className={`${config.iconSize} text-emerald-600`} />
              <h3 className={`${config.titleSize} text-slate-800`}>
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h3>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={previousMonth}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={nextMonth}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="flex-1">
            {/* Day names */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {dayNames.map((day, index) => (
                <div
                  key={index}
                  className={`${config.daySize} text-center text-slate-600 py-1`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => (
                <button
                  key={index}
                  onClick={() => {
                    if (day) {
                      setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
                    }
                  }}
                  disabled={!day}
                  className={`
                    aspect-square rounded-lg ${config.daySize} transition-all duration-200 ease-out relative
                    ${!day ? "invisible" : ""}
                    ${isToday(day) 
                      ? "bg-emerald-600 text-white hover:bg-emerald-700" 
                      : "bg-white text-slate-700 hover:bg-emerald-100"
                    }
                    ${hasEvent(day) ? "ring-2 ring-emerald-400 ring-offset-1" : ""}
                    ${day ? "cursor-pointer" : ""}
                  `}
                >
                  {day}
                  {hasEvent(day) && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                      <div className="w-1 h-1 bg-orange-500 rounded-full" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Today indicator */}
          <div className="mt-4 pt-3 border-t border-emerald-200">
            <div className="flex items-center justify-center gap-2 text-sm text-slate-600">
              <div className="w-2 h-2 bg-emerald-600 rounded-full" />
              <span>Hoy: {new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
