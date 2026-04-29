import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Progress } from "../ui/progress";
import { Badge } from "../ui/badge";
import { useEffect, useRef, useState } from "react";
import { BarChart3, TrendingUp } from "lucide-react";

interface ListData {
  id: string;
  name: string;
  total: number;
  contacted: number;
  progress: number;
}

interface ListsWidgetProps {
  lists: ListData[];
}

type WidgetSize = "sm" | "md" | "lg" | "xl";

export function ListsWidget({ lists }: ListsWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("md");

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        const area = offsetWidth * offsetHeight;
        
        if (area < 80000) {
          setWidgetSize("sm");
        } else if (area < 150000) {
          setWidgetSize("md");
        } else if (area < 250000) {
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

  // Vista compacta para widgets pequeños
  if (widgetSize === "sm") {
    return (
      <div ref={containerRef} className="h-full">
        <Card className="h-full flex flex-col">
          <CardHeader className="flex-shrink-0 pb-3">
            <CardTitle className="text-base">Listas Activas</CardTitle>
          </CardHeader>
        <CardContent className="flex-1 overflow-auto min-h-0 space-y-2">
          {lists.map((list) => (
            <div
              key={list.id}
              className="p-3 bg-slate-50 rounded-lg border border-slate-200"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-slate-900 text-sm truncate flex-1 mr-2">
                  {list.name}
                </p>
                <Badge
                  className={
                    list.progress >= 70
                      ? "bg-green-100 text-green-700 border-green-200 text-xs"
                      : list.progress >= 40
                        ? "bg-yellow-100 text-yellow-700 border-yellow-200 text-xs"
                        : "bg-slate-100 text-slate-700 border-slate-200 text-xs"
                  }
                >
                  {list.progress}%
                </Badge>
              </div>
              <Progress value={list.progress} className="h-1.5" />
            </div>
          ))}
        </CardContent>
        </Card>
      </div>
    );
  }

  // Vista estándar para widgets medianos
  if (widgetSize === "md") {
    return (
      <div ref={containerRef} className="h-full">
        <Card className="h-full flex flex-col">
          <CardHeader className="flex-shrink-0">
            <CardTitle>Avance por Lista</CardTitle>
            <CardDescription>Progreso de cada lista</CardDescription>
          </CardHeader>
        <CardContent className="flex-1 overflow-auto min-h-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Contactados</TableHead>
                <TableHead>Progreso</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((list) => (
                <TableRow key={list.id}>
                  <TableCell className="text-slate-900">{list.name}</TableCell>
                  <TableCell className="text-right text-slate-900">
                    {list.total.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-slate-900">
                    {list.contacted.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={list.progress} className="h-2 flex-1" />
                      <span className="text-slate-600 text-sm min-w-[45px] text-right">
                        {list.progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      className={
                        list.progress >= 70
                          ? "bg-green-100 text-green-700 border-green-200"
                          : list.progress >= 40
                            ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                      }
                    >
                      {list.progress >= 70
                        ? "Avanzado"
                        : list.progress >= 40
                          ? "En Progreso"
                          : "Inicial"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        </Card>
      </div>
    );
  }

  // Vista expandida para widgets grandes
  const totalContacts = lists.reduce((sum, list) => sum + list.total, 0);
  const totalContacted = lists.reduce((sum, list) => sum + list.contacted, 0);
  const averageProgress = Math.round(
    lists.reduce((sum, list) => sum + list.progress, 0) / lists.length
  );

  return (
    <div ref={containerRef} className="h-full">
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-start justify-between">
          <div>
            <CardTitle className={widgetSize === "xl" ? "text-2xl" : "text-xl"}>
              Avance por Lista
            </CardTitle>
            <CardDescription className={widgetSize === "xl" ? "text-base" : ""}>
              Progreso detallado de cada lista de contactos
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-slate-500 text-sm">Total Contactos</p>
              <p className="text-slate-900 text-2xl">
                {totalContacts.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 text-sm">Contactados</p>
              <p className="text-slate-900 text-2xl">
                {totalContacted.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 text-sm">Progreso Promedio</p>
              <div className="flex items-center gap-1 justify-end">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <p className="text-green-600 text-2xl">{averageProgress}%</p>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto min-h-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={widgetSize === "xl" ? "text-base" : ""}>
                ID
              </TableHead>
              <TableHead className={widgetSize === "xl" ? "text-base" : ""}>
                Nombre de Lista
              </TableHead>
              <TableHead className={`text-right ${widgetSize === "xl" ? "text-base" : ""}`}>
                Total Contactos
              </TableHead>
              <TableHead className={`text-right ${widgetSize === "xl" ? "text-base" : ""}`}>
                Contactados
              </TableHead>
              <TableHead className={`text-right ${widgetSize === "xl" ? "text-base" : ""}`}>
                Pendientes
              </TableHead>
              <TableHead className={widgetSize === "xl" ? "text-base" : ""}>
                Progreso
              </TableHead>
              <TableHead className={`text-right ${widgetSize === "xl" ? "text-base" : ""}`}>
                Estado
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lists.map((list) => {
              const pending = list.total - list.contacted;
              return (
                <TableRow key={list.id}>
                  <TableCell className={`text-slate-600 ${widgetSize === "xl" ? "text-base" : ""}`}>
                    {list.id}
                  </TableCell>
                  <TableCell className={`text-slate-900 ${widgetSize === "xl" ? "text-base" : ""}`}>
                    {list.name}
                  </TableCell>
                  <TableCell className={`text-right text-slate-900 ${widgetSize === "xl" ? "text-base" : ""}`}>
                    {list.total.toLocaleString()}
                  </TableCell>
                  <TableCell className={`text-right text-slate-900 ${widgetSize === "xl" ? "text-base" : ""}`}>
                    {list.contacted.toLocaleString()}
                  </TableCell>
                  <TableCell className={`text-right text-slate-600 ${widgetSize === "xl" ? "text-base" : ""}`}>
                    {pending.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Progress
                        value={list.progress}
                        className={widgetSize === "xl" ? "h-2.5 flex-1" : "h-2 flex-1"}
                      />
                      <span className={`text-slate-600 min-w-[45px] text-right ${widgetSize === "xl" ? "text-base" : "text-sm"}`}>
                        {list.progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      className={
                        list.progress >= 70
                          ? `bg-green-100 text-green-700 border-green-200 ${widgetSize === "xl" ? "text-base px-3 py-1" : ""}`
                          : list.progress >= 40
                            ? `bg-yellow-100 text-yellow-700 border-yellow-200 ${widgetSize === "xl" ? "text-base px-3 py-1" : ""}`
                            : `bg-slate-100 text-slate-700 border-slate-200 ${widgetSize === "xl" ? "text-base px-3 py-1" : ""}`
                      }
                    >
                      {list.progress >= 70
                        ? "Avanzado"
                        : list.progress >= 40
                          ? "En Progreso"
                          : "Inicial"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      </Card>
    </div>
  );
}
