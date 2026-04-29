import { Card, CardContent } from "../ui/card";
import { useEffect, useRef, useState } from "react";
import { Textarea } from "../ui/textarea";
import { StickyNote, Save } from "lucide-react";
import { Button } from "../ui/button";
import { toast } from "sonner";

interface StickyNoteWidgetProps {
  id: string;
  initialNote?: string;
  color?: string;
  onSave?: (id: string, note: string) => void;
}

type WidgetSize = "sm" | "md" | "lg" | "xl";

export function StickyNoteWidget({
  id,
  initialNote = "",
  color = "yellow",
  onSave
}: StickyNoteWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("md");
  const [note, setNote] = useState(initialNote);
  const [hasChanges, setHasChanges] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedNote = localStorage.getItem(`sticky-note-${id}`);
    if (savedNote !== null) {
      setNote(savedNote);
    }
  }, [id]);

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

  // Auto-save on unmount or when leaving
  useEffect(() => {
    return () => {
      if (hasChanges && onSave) {
        onSave(id, note);
      }
    };
  }, [hasChanges, id, note, onSave]);

  const handleSave = () => {
    if (onSave) {
      onSave(id, note);
      setHasChanges(false);
      toast.success("Nota guardada");
    }
    // Save to localStorage as well
    localStorage.setItem(`sticky-note-${id}`, note);
  };

  const handleNoteChange = (value: string) => {
    setNote(value);
    setHasChanges(true);
  };

  // Auto-save with debounce (save after 1 second of inactivity)
  useEffect(() => {
    if (!hasChanges) return;

    const timeoutId = setTimeout(() => {
      localStorage.setItem(`sticky-note-${id}`, note);
      setHasChanges(false);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [note, hasChanges, id]);

  // Color configurations
  const colorClasses = {
    yellow: "bg-yellow-50 border-yellow-200",
    blue: "bg-blue-50 border-blue-200",
    green: "bg-green-50 border-green-200",
    pink: "bg-pink-50 border-pink-200",
    purple: "bg-purple-50 border-purple-200",
  };

  const sizeConfig = {
    sm: {
      padding: "p-3",
      titleSize: "text-sm",
      iconSize: "w-4 h-4",
      textareaRows: 3,
      showSaveButton: false,
    },
    md: {
      padding: "p-4",
      titleSize: "text-base",
      iconSize: "w-5 h-5",
      textareaRows: 5,
      showSaveButton: true,
    },
    lg: {
      padding: "p-5",
      titleSize: "text-lg",
      iconSize: "w-6 h-6",
      textareaRows: 8,
      showSaveButton: true,
    },
    xl: {
      padding: "p-6",
      titleSize: "text-xl",
      iconSize: "w-7 h-7",
      textareaRows: 12,
      showSaveButton: true,
    },
  };

  const config = sizeConfig[widgetSize];

  return (
    <div ref={containerRef} className="h-full">
      <Card className={`h-full flex flex-col ${colorClasses[color as keyof typeof colorClasses] || colorClasses.yellow}`}>
        <CardContent className={`${config.padding} flex flex-col h-full gap-3`}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StickyNote className={`${config.iconSize} text-slate-600`} />
              <h3 className={`${config.titleSize} text-slate-700`}>
                Nota Rápida
              </h3>
            </div>
            {hasChanges && (
              <span className="text-xs text-orange-600">Sin guardar</span>
            )}
          </div>

          {/* Textarea */}
          <Textarea
            value={note}
            onChange={(e) => handleNoteChange(e.target.value)}
            placeholder="Escribe tu nota aquí..."
            className="flex-1 resize-none bg-transparent border-0 focus-visible:ring-0 text-slate-700"
            rows={config.textareaRows}
          />

          {/* Save Button */}
          {config.showSaveButton && (
            <Button
              onClick={handleSave}
              disabled={!hasChanges}
              size="sm"
              className="w-full"
              variant={hasChanges ? "default" : "secondary"}
            >
              <Save className="w-4 h-4 mr-2" />
              Guardar Nota
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
