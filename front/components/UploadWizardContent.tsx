import { useState, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Card, CardContent } from "./ui/card";
import { Progress } from "./ui/progress";
import {
  CheckCircle2,
  Upload,
  FileDown,
  ArrowRight,
  ArrowLeft,
  FileText,
  X,
  Info,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "./ui/utils";
import { MAX_LEAD_UPLOAD_BYTES, MAX_LEAD_UPLOAD_MB } from "@/constants/uploadLimits";
import api from "@/services/api";
import socket from "@/services/socket";
import { useBackgroundTasks } from "@/stores/useBackgroundTasks";
import { useAuthStore } from "@/stores/authStore";
import * as XLSX from "xlsx";

interface UploadWizardContentProps {
  campaignName: string;
  campaignId: string;
  onComplete?: () => void;
  onCancel?: () => void;
  onSuccess?: () => void;
}

type Step = 1 | 2 | 3 | 4;
type ListOption = "new";

export function UploadWizardContent({
  campaignName,
  campaignId,
  onComplete,
  onCancel,
  onSuccess,
}: UploadWizardContentProps) {
  const [currentStep, setCurrentStep] = useState<Step>(2);
  const [listOption, setListOption] =
    useState<ListOption>("new");
  const [isStartingUpload, setIsStartingUpload] = useState(false);
  const { session } = useAuthStore();

  // Background tasks store
  const { addTask, updateTaskProgress, completeTask, failTask } = useBackgroundTasks();

  const [newListData, setNewListData] = useState({
    listId: "",
    name: "",
    campaign: campaignId,
    description: "",
  });

  const [fileData, setFileData] = useState<{
    file: File | null;
    isDragging: boolean;
  }>({
    file: null,
    isDragging: false,
  });

  const [loadingListId, setLoadingListId] = useState(true);
  const [ttsTemplates, setTtsTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [schemaColumns, setSchemaColumns] = useState<{name: string; required: boolean; isPhone: boolean}[]>([]);

  // Auto-fetch next list ID and TTS templates when component mounts
  useEffect(() => {
    const fetchNextListId = async () => {
      try {
        const response = await api.getNextListId();
        if (response.success && response.next_id) {
          setNewListData(prev => ({
            ...prev,
            listId: response.next_id.toString(),
          }));
        }
      } catch (error) {
        console.error("[UploadWizard] Error fetching next list ID:", error);
        toast.error("Error al obtener el ID de lista");
      } finally {
        setLoadingListId(false);
      }
    };

    const fetchTemplates = async () => {
      try {
        const res = await api.getTTSTemplates();
        // Backend returns raw array, not {success, data}
        const templates = Array.isArray(res) ? res : (res.success && Array.isArray(res.data) ? res.data : []);
        setTtsTemplates(templates);
      } catch (err) {
        console.error("[UploadWizard] Error fetching TTS templates:", err);
      }
    };

    const fetchCampaignSchema = async () => {
      try {
        const res = await api.getCampaigns({ campaignId });
        const campaigns = res.success && Array.isArray(res.data) ? res.data : [];
        const camp = campaigns.find((c: any) => c.campaign_id === campaignId);
        if (camp?.lead_structure_schema && Array.isArray(camp.lead_structure_schema)) {
          setSchemaColumns(camp.lead_structure_schema.map((col: any) => ({
            name: col.name,
            required: !!col.required,
            isPhone: !!(col.isPhone || col.is_phone),
          })));
        }
      } catch (err) {
        console.error("[UploadWizard] Error fetching campaign schema:", err);
      }
    };

    fetchNextListId();
    fetchTemplates();
    fetchCampaignSchema();
  }, [campaignId]);

  const handleNext = () => {
    // Since listOption is always "new", we skip the initial validation for listOption presence.
    // Also, step 1 is now effectively skipped by initial state, so we check for currentStep === 2
    if (currentStep === 2) {
      if (!newListData.listId || !newListData.name) {
        toast.error("Completa los campos obligatorios");
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(4);
    }
  };

  const handleBack = () => {
    if (currentStep > 2) { // Changed from 1 to 2, as step 1 is now effectively skipped
      setCurrentStep((currentStep - 1) as Step);
    } else if (currentStep === 2) {
      if (onCancel) onCancel(); // If on the first actual step, treat "back" as cancel
    }
  };

  const handleDownloadTemplate = () => {
    let headers: string[] = [];
    let exampleRow: string[] = [];

    if (schemaColumns.length > 0) {
      // Use campaign structure columns
      for (const col of schemaColumns) {
        headers.push(col.name);
        const colNameLower = col.name.toLowerCase().trim();
        const isPhoneSynonym = ['phone', 'telefono', 'teléfono', 'celular', 'movil'].includes(colNameLower);
        
        if (col.isPhone || isPhoneSynonym) {
          exampleRow.push("573001234567");
        } else {
          exampleRow.push(`valor_${col.name}`);
        }
      }
    } else {
      // Fallback: default columns
      headers = ["telefono", "identificador"];
      exampleRow = ["573001234567", "REF001"];
    }

    // Add dynamic columns from selected TTS template (if they're not already in the schema)
    if (selectedTemplate && selectedTemplate.variables) {
      const existing = new Set(headers.map(h => h.toLowerCase()));
      selectedTemplate.variables.forEach((v: string) => {
        if (!existing.has(v.toLowerCase())) {
          headers.push(v);
          const vLower = v.toLowerCase().trim();
          const isPhoneSynonym = ['phone', 'telefono', 'teléfono', 'celular', 'movil'].includes(vLower);
          exampleRow.push(isPhoneSynonym ? "573001234567" : `valor_${v}`);
        }
      });
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 15) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    const filename = `template_leads_${campaignId}.xlsx`;
    XLSX.writeFile(wb, filename);

    toast.success("Template descargado exitosamente");
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      toast.error("Selecciona un archivo Excel válido (.xlsx o .xls)");
      return;
    }

    if (file.size > MAX_LEAD_UPLOAD_BYTES) {
      toast.error(`El archivo no debe exceder ${MAX_LEAD_UPLOAD_MB}MB`);
      return;
    }

    setFileData({ ...fileData, file });
    toast.success(`Archivo "${file.name}" cargado`);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setFileData((prev) => ({ ...prev, isDragging: false }));

    const file = e.dataTransfer.files[0];
    if (file) {
      validateAndSetFile(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setFileData((prev) => ({ ...prev, isDragging: true }));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setFileData((prev) => ({ ...prev, isDragging: false }));
  }, []);

  const parseExcel = (buffer: ArrayBuffer): any[] => {
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];

    const worksheet = workbook.Sheets[firstSheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    if (import.meta.env.DEV) {
      console.log(`[Excel Parser] Sheet: "${firstSheetName}", Rows: ${data.length}`);
      if (data.length > 0) {
        console.log(`[Excel Parser] Headers: ${Object.keys(data[0]).join(", ")}`);
      }
    }

    // Ensure all values are strings (Excel may parse as numbers)
    return data.map((row) => {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(row)) {
        cleaned[key.trim()] = String(value ?? "").trim();
      }
      return cleaned;
    });
  };

  const handleFinish = async () => {
    if (!fileData.file) {
      toast.error("Selecciona un archivo Excel");
      return;
    }

    setIsStartingUpload(true);

    try {
      // Step 1: Create list (always "new" now)
      toast.info("Creando nueva lista...");

      const createResult = await api.createList({
        list_id: newListData.listId,
        list_name: newListData.name,
        campaign_id: campaignId,
        list_description: newListData.description,
        active: 'Y',
        updated_by: session?.agent_user || 'Sistema',
      });

      if (!createResult.success) {
        throw new Error("Error al crear la lista: " + (createResult.error || 'Error desconocido'));
      }

      const targetListId = newListData.listId;
      toast.success("Lista creada exitosamente");

      // Step 2: Upload file to server via HTTP (NOT via Socket.IO)
      toast.info("Subiendo archivo al servidor...");
      const uploadResult = await api.uploadLeadsFile(targetListId, fileData.file, campaignId);

      if (!uploadResult.success || !uploadResult.taskId) {
        throw new Error("Error al iniciar la carga del archivo");
      }

      const taskId = uploadResult.taskId;

      // Step 3: Create background task in UI
      addTask({
        id: taskId,
        type: 'lead_upload',
        title: `Cargando leads — ${fileData.file.name}`,
        description: `Lista: ${newListData.name} • Campaña: ${campaignName}`,
        progress: 0,
        status: 'running',
        metadata: {
          campaignId,
          campaignName,
          listId: targetListId,
          listName: newListData.name,
          totalRecords: 0,
          processedRecords: 0,
        },
      });

      // Step 4: Connect to Socket.IO for progress (lightweight — no data transfer)
      await socket.connect();
      socket.emit('task:subscribe', taskId);

      const cleanup = () => {
        socket.off('upload:leads:progress', handleProgress);
        socket.off('upload:leads:complete', handleComplete);
        socket.off('upload:leads:error', handleError);
        socket.off('upload:leads:cancelled', handleCancelled);
      };

      const handleProgress = (progress: any) => {
        if (progress.processId !== taskId) return;
        updateTaskProgress(taskId, progress.percentage, progress.successful, progress.errors);
      };

      const handleComplete = (result: any) => {
        if (result.processId !== taskId) return;
        cleanup();
        completeTask(taskId, { successful: result.successful, errors: result.errors });
        toast.success(`¡Carga completada! ${result.successful} registros exitosos`);
        if (onSuccess) onSuccess();
      };

      const handleError = (error: any) => {
        if (error.processId !== taskId) return;
        cleanup();
        failTask(taskId, error.message || 'Error desconocido');
        toast.error(`Error en la carga: ${error.message}`);
      };

      const handleCancelled = (data: any) => {
        if (data.processId !== taskId) return;
        cleanup();
        failTask(taskId, data.message || 'Tarea cancelada');
        toast.error(`Tarea cancelada: ${data.message}`);
      };

      socket.on('upload:leads:progress', handleProgress);
      socket.on('upload:leads:complete', handleComplete);
      socket.on('upload:leads:error', handleError);
      socket.on('upload:leads:cancelled', handleCancelled);

      // Close wizard immediately - upload continues in background on the server
      toast.info("Carga iniciada en segundo plano. Puedes seguir trabajando.");
      if (onComplete) onComplete();

    } catch (error) {
      setIsStartingUpload(false);
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Error al procesar el archivo");
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      // Step 1 is effectively skipped, so we adjust titles for remaining steps
      case 2:
        return "Configurar Lista";
      case 3:
        return "Template";
      case 4:
        return "Cargar Archivo";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-slate-900 mb-1">Cargar Leads</h3>
        <p className="text-slate-500 text-sm">
          Paso {currentStep - 1} de 3: {getStepTitle()} {/* Adjust step numbering for display */}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="relative">
        {/* Progress Line */}
        <div className="absolute top-4 left-0 right-0 h-1 bg-slate-200">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{
              width: `${((currentStep - 2) / 2) * 100}%`, // Adjust progress calculation
            }}
          />
        </div>

        {/* Steps */}
        <div className="relative flex justify-between">
          {[
            // Removed step 1 "Tipo"
            { num: 2, label: "Lista" },
            { num: 3, label: "Template" },
            { num: 4, label: "Archivo" },
          ].map((step) => (
            <div
              key={step.num}
              className="flex flex-col items-center"
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 z-10",
                  currentStep >= step.num
                    ? "bg-blue-600 text-white"
                    : "bg-slate-200 text-slate-400",
                )}
              >
                {step.num - 1} {/* Adjust step number display */}
              </div>
              <span
                className={cn(
                  "text-xs mt-2 transition-colors duration-300",
                  currentStep >= step.num
                    ? "text-blue-600"
                    : "text-slate-400",
                )}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[380px]">
        {/* PASO 1: Seleccionar Tipo de Lista (This section is now effectively skipped by initial state) */}
        {/* PASO 2: Configurar Lista */}
        {(currentStep === 2) && (
          <div className="space-y-4">
            <div className="space-y-4 pt-2">
              <div>
                <Label
                  htmlFor="listName"
                  className="mb-2 block"
                >
                  Nombre de la Lista *
                </Label>
                <div className="relative">
                  <Input
                    id="listName"
                    placeholder="Ej. Mi Lista Octubre"
                    value={newListData.name}
                    onChange={(e) =>
                      setNewListData({
                        ...newListData,
                        name: e.target.value,
                      })
                    }
                    className="bg-slate-50"
                  />
                  {loadingListId && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    </div>
                  )}
                </div>
              </div>

              {/* Plantillas TTS globales no existen en GesCall nativo; por campaña en Ajustes > Plantillas TTS */}
              {ttsTemplates.length > 0 ? (
              <div>
                <Label className="mb-2 block">
                  📄 Plantilla TTS <span className="text-xs text-slate-500">(opcional)</span>
                </Label>
                <select
                  value={selectedTemplate?.template_id || ''}
                  onChange={(e) => {
                    const tpl = ttsTemplates.find((t: any) => t.template_id === e.target.value);
                    setSelectedTemplate(tpl || null);
                  }}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <option value="">Sin plantilla TTS</option>
                  {ttsTemplates.map((tpl: any) => (
                    <option key={tpl.template_id} value={tpl.template_id}>
                      {tpl.template_id} — {tpl.description || tpl.template_text?.slice(0, 50)}
                    </option>
                  ))}
                </select>
                {selectedTemplate && (
                  <div className="mt-2 rounded-md bg-purple-50 border border-purple-200 p-3">
                    <p className="text-xs text-purple-800 font-medium mb-1">Texto de la plantilla:</p>
                    <p className="text-xs text-purple-700 italic">"{selectedTemplate.template_text}"</p>
                    <p className="text-xs text-purple-600 mt-1">
                      Variables: {selectedTemplate.variables?.map((v: string) => `{${v}}`).join(', ') || 'Ninguna'}
                    </p>
                  </div>
                )}
              </div>
              ) : (
                <p className="text-xs text-slate-500 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2">
                  Las plantillas TTS se definen por campaña en <strong>Ajustes → Plantillas TTS</strong>. El asistente de carga usa las columnas del Excel como variables en el IVR.
                </p>
              )}

              <div>
                <Label
                  htmlFor="description"
                  className="mb-2 block"
                >
                  Descripción (opcional)
                </Label>
                <Textarea
                  id="description"
                  placeholder="Descripción breve..."
                  value={newListData.description}
                  onChange={(e) =>
                    setNewListData({
                      ...newListData,
                      description: e.target.value,
                    })
                  }
                  className="bg-slate-50 resize-none"
                  rows={3}
                />
              </div>
            </div>
          </div>
        )}

        {/* PASO 3: Descargar Template */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                <FileDown className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-slate-900 mb-2">
                Template Excel
              </h3>
              <p className="text-slate-600 mb-6">
                Descarga la plantilla Excel con el formato correcto
              </p>
              <Button
                onClick={handleDownloadTemplate}
                size="lg"
                className="gap-2"
              >
                <FileDown className="w-5 h-5" />
                Descargar Template
              </Button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-blue-900 mb-1">
                    Campos del Template
                  </h4>
                  <p className="text-blue-700 text-sm">
                    {schemaColumns.length > 0 ? (
                      <>Columnas: {schemaColumns.map((col, i) => (
                        <span key={col.name}>
                          {i > 0 && ', '}
                          <strong className={col.required ? 'text-blue-900' : 'text-blue-600'}>{col.name}</strong>
                          {col.required && <span className="text-xs text-red-500">*</span>}
                        </span>
                      ))}
                      </>
                    ) : (
                      <>El archivo incluye: <strong>telefono</strong> y <strong>identificador</strong>.</>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-amber-800 text-sm">
                <strong>Nota:</strong>{' '}
                {schemaColumns.length > 0 ? (
                  <>
                    {schemaColumns.filter(c => c.required).map(c => c.name).join(', ')} {schemaColumns.filter(c => c.required).length === 1 ? 'es obligatorio' : 'son obligatorios'}.
                    {schemaColumns.filter(c => !c.required).length > 0 && (
                      <> {schemaColumns.filter(c => !c.required).map(c => c.name).join(', ')} {schemaColumns.filter(c => !c.required).length === 1 ? 'es opcional' : 'son opcionales'}.</>
                    )}
                    {' '}Todas las columnas se pueden usar como variables TTS en el IVR con la sintaxis <strong>{'{nombre_columna}'}</strong>.
                  </>
                ) : (
                  <>telefono es requerido. identificador es opcional.</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* PASO 4: Cargar Archivo */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 transition-all",
                fileData.isDragging
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-300 bg-slate-50",
              )}
            >
              <input
                id="fileUpload"
                type="file"
                className="hidden"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
              />

              {!fileData.file ? (
                <label
                  htmlFor="fileUpload"
                  className="flex flex-col items-center justify-center cursor-pointer"
                >
                  <Upload className="w-12 h-12 text-slate-400 mb-3" />
                  <p className="text-slate-900 mb-2">
                    Arrastra tu archivo aquí
                  </p>
                </label>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-slate-900">
                        {fileData.file.name}
                      </p>
                      <p className="text-slate-500 text-sm">
                        {(fileData.file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setFileData({ ...fileData, file: null })
                    }
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {fileData.file && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Archivo listo para procesar</span>
                </div>
              </div>
            )}

            <div className="bg-slate-100 rounded-lg p-4">
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="text-slate-500 w-24 flex-shrink-0">Nombre de Lista:</span>
                  <span className="text-slate-900 font-medium">
                    {newListData.name}
                  </span>
                </div>
                {selectedTemplate && (
                  <div className="flex items-start gap-2">
                    <span className="text-slate-500 w-24 flex-shrink-0">Plantilla TTS:</span>
                    <span className="text-purple-700 font-medium truncate">
                      {selectedTemplate.template_id}
                    </span>
                  </div>
                )}
                {newListData.description && (
                  <div className="flex items-start gap-2">
                    <span className="text-slate-500 w-24 flex-shrink-0">Descripción:</span>
                    <span className="text-slate-600 line-clamp-2">
                      {newListData.description}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t">
        {currentStep === 2 ? (
          <Button
            variant="ghost"
            onClick={onCancel}
            className="gap-2"
          >
            <X className="w-4 h-4" />
            Cancelar
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={handleBack}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Atrás
          </Button>
        )}

        <div className="flex gap-3">
          {currentStep < 4 ? (
            <Button
              onClick={handleNext}
              className="gap-2 bg-slate-900 hover:bg-slate-800"
            >
              Siguiente
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleFinish}
              className="gap-2 bg-slate-900 hover:bg-slate-800"
              disabled={!fileData.file || isStartingUpload}
            >
              {isStartingUpload ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Iniciando...</>
              ) : (
                <><Upload className="w-4 h-4" /> Cargar Leads</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
