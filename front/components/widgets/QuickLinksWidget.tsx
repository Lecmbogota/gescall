import { Card, CardContent } from "../ui/card";
import { useEffect, useRef, useState } from "react";
import { 
  Link as LinkIcon, 
  ExternalLink, 
  Globe, 
  FileText, 
  BookOpen,
  Settings,
  BarChart,
  Users
} from "lucide-react";
import { Button } from "../ui/button";

interface QuickLink {
  id: string;
  title: string;
  url: string;
  icon: string;
  color: string;
}

interface QuickLinksWidgetProps {
  id?: string;
}

type WidgetSize = "sm" | "md" | "lg" | "xl";

const defaultLinks: QuickLink[] = [
  {
    id: "1",
    title: "Vicidial Admin",
    url: "https://vicidial.org/docs.php",
    icon: "settings",
    color: "blue",
  },
  {
    id: "2",
    title: "Documentación",
    url: "https://vicidial.org/docs.php",
    icon: "book",
    color: "green",
  },
  {
    id: "3",
    title: "Reportes",
    url: "#",
    icon: "chart",
    color: "purple",
  },
  {
    id: "4",
    title: "Gestión de Usuarios",
    url: "#",
    icon: "users",
    color: "orange",
  },
  {
    id: "5",
    title: "Portal Web",
    url: "https://gescall.com",
    icon: "globe",
    color: "indigo",
  },
  {
    id: "6",
    title: "Guías",
    url: "#",
    icon: "file",
    color: "pink",
  },
];

const iconMap = {
  settings: Settings,
  book: BookOpen,
  chart: BarChart,
  users: Users,
  globe: Globe,
  file: FileText,
};

const colorMap = {
  blue: "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200",
  green: "bg-green-100 text-green-700 hover:bg-green-200 border-green-200",
  purple: "bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200",
  orange: "bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200",
  indigo: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200",
  pink: "bg-pink-100 text-pink-700 hover:bg-pink-200 border-pink-200",
};

export function QuickLinksWidget({ id = "quick-links" }: QuickLinksWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("md");
  const [links] = useState<QuickLink[]>(defaultLinks);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        const area = offsetWidth * offsetHeight;
        
        if (area < 40000) {
          setWidgetSize("sm");
        } else if (area < 80000) {
          setWidgetSize("md");
        } else if (area < 140000) {
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
      iconSize: "w-4 h-4",
      linkPadding: "p-2",
      linkTextSize: "text-xs",
      columns: 2,
      showDescription: false,
    },
    md: {
      padding: "p-4",
      titleSize: "text-base",
      iconSize: "w-5 h-5",
      linkPadding: "p-3",
      linkTextSize: "text-sm",
      columns: 2,
      showDescription: false,
    },
    lg: {
      padding: "p-5",
      titleSize: "text-lg",
      iconSize: "w-6 h-6",
      linkPadding: "p-4",
      linkTextSize: "text-base",
      columns: 3,
      showDescription: true,
    },
    xl: {
      padding: "p-6",
      titleSize: "text-xl",
      iconSize: "w-7 h-7",
      linkPadding: "p-4",
      linkTextSize: "text-base",
      columns: 3,
      showDescription: true,
    },
  };

  const config = sizeConfig[widgetSize];

  const handleLinkClick = (link: QuickLink) => {
    if (link.url.startsWith("http")) {
      window.open(link.url, "_blank", "noopener,noreferrer");
    } else {
      // Internal navigation
      console.log("Navigate to:", link.url);
    }
  };

  return (
    <div ref={containerRef} className="h-full">
      <Card className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-blue-50 border-slate-200">
        <CardContent className={`${config.padding} flex flex-col h-full`}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-4">
            <LinkIcon className={`${config.iconSize} text-blue-600`} />
            <h3 className={`${config.titleSize} text-slate-800`}>
              Enlaces Rápidos
            </h3>
          </div>

          {/* Links Grid */}
          <div 
            className="grid gap-3 flex-1"
            style={{ 
              gridTemplateColumns: `repeat(${config.columns}, minmax(0, 1fr))` 
            }}
          >
            {links.slice(0, widgetSize === "sm" ? 4 : widgetSize === "md" ? 6 : 9).map((link) => {
              const Icon = iconMap[link.icon as keyof typeof iconMap] || Globe;
              const colorClass = colorMap[link.color as keyof typeof colorMap] || colorMap.blue;
              
              return (
                <button
                  key={link.id}
                  onClick={() => handleLinkClick(link)}
                  className={`${config.linkPadding} rounded-lg border-2 transition-all duration-300 ease-out hover:scale-105 hover:shadow-md flex flex-col items-center justify-center gap-2 ${colorClass}`}
                >
                  <Icon className={config.iconSize} />
                  <span className={`${config.linkTextSize} text-center line-clamp-2`}>
                    {link.title}
                  </span>
                  {config.showDescription && (
                    <ExternalLink className="w-3 h-3 opacity-50" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
