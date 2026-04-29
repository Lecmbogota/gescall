import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Activity,
  Phone,
  Users,
  Clock,
  TrendingUp,
  BarChart3,
  PhoneCall,
  List,
  DollarSign,
  Star,
  Search,
  Download,
  Check,
} from "lucide-react";

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  category: "kpi" | "chart" | "list" | "activity" | "productivity" | "utility";
  isPaid: boolean;
  price?: number;
  icon: React.ComponentType<{ className?: string }>;
  defaultSize: { w: number; h: number };
  installed: boolean;
  rating?: number;
}

interface WidgetMarketplaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableWidgets: WidgetDefinition[];
  onInstallWidget: (widgetId: string) => void;
  onUninstallWidget: (widgetId: string) => void;
}

export function WidgetMarketplace({
  open,
  onOpenChange,
  availableWidgets,
  onInstallWidget,
  onUninstallWidget,
}: WidgetMarketplaceProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const filteredWidgets = availableWidgets.filter((widget) => {
    const matchesSearch = widget.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || widget.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const freeWidgets = filteredWidgets.filter((w) => !w.isPaid);
  const paidWidgets = filteredWidgets.filter((w) => w.isPaid);

  const WidgetCard = ({ widget }: { widget: WidgetDefinition }) => (
    <Card className="relative overflow-hidden">
      {widget.isPaid && (
        <div className="absolute top-3 right-3">
          <Badge className="bg-amber-500 text-white">
            <DollarSign className="w-3 h-3 mr-1" />
            ${widget.price}
          </Badge>
        </div>
      )}
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <widget.icon className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-slate-900">{widget.name}</CardTitle>
            <CardDescription className="text-xs mt-1">
              {widget.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {widget.rating && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <span className="text-sm text-slate-600">{widget.rating}</span>
              </div>
            )}
            <Badge variant="outline" className="text-xs">
              {widget.category}
            </Badge>
          </div>
          {widget.installed ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUninstallWidget(widget.id)}
              className="gap-2"
            >
              <Check className="w-4 h-4" />
              Instalado
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onInstallWidget(widget.id)}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              {widget.isPaid ? "Comprar" : "Instalar"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Marketplace de Widgets</DialogTitle>
          <DialogDescription>
            Explora y añade widgets gratuitos y premium a tu dashboard
          </DialogDescription>
        </DialogHeader>

        {/* Barra de búsqueda */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar widgets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Tabs de contenido */}
        <Tabs defaultValue="free" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="free">
              Gratuitos ({freeWidgets.length})
            </TabsTrigger>
            <TabsTrigger value="paid">
              Premium ({paidWidgets.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="free" className="flex-1 overflow-auto mt-4">
            {freeWidgets.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-center">
                <div>
                  <p className="text-slate-500 mb-2">No se encontraron widgets gratuitos</p>
                  <p className="text-slate-400 text-sm">Intenta con otra búsqueda</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                {freeWidgets.map((widget) => (
                  <WidgetCard key={widget.id} widget={widget} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="paid" className="flex-1 overflow-auto mt-4">
            {paidWidgets.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-center">
                <div>
                  <p className="text-slate-500 mb-2">No se encontraron widgets premium</p>
                  <p className="text-slate-400 text-sm">Intenta con otra búsqueda</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                {paidWidgets.map((widget) => (
                  <WidgetCard key={widget.id} widget={widget} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
