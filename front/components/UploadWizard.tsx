import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Card, CardContent } from './ui/card';
import {
  CheckCircle2,
  Upload,
  FileDown,
  ArrowRight,
  ArrowLeft,
  FileText,
  X,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { LoadingBackdrop } from './LoadingBackdrop';
import { cn } from './ui/utils';
import { MAX_LEAD_UPLOAD_BYTES, MAX_LEAD_UPLOAD_MB } from '@/constants/uploadLimits';
import * as XLSX from 'xlsx';

interface UploadWizardProps {
  isOpen: boolean;
  onClose: () => void;
  campaignName: string;
}

type Step = 1 | 2 | 3;

const campaigns = [
  'Ventas Q4 2025',
  'Retención Clientes',
  'Cobranza',
  'Prospección',
  'Seguimiento',
];

export function UploadWizard({ isOpen, onClose, campaignName }: UploadWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const listOption = 'new'; // Siempre nueva lista
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [newListData, setNewListData] = useState({
    listId: '',
    name: '',
    campaign: campaignName,
    description: '',
  });

  const [fileData, setFileData] = useState<{
    file: File | null;
    isDragging: boolean;
  }>({
    file: null,
    isDragging: false,
  });

  const handleNext = () => {
    if (currentStep === 1) {
      if (!newListData.listId || !newListData.name) {
        toast.error('Completa los campos obligatorios');
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'phone_number',
      'phone_code',
      'list_id',
      'vendor_lead_code',
      'source_id',
      'title',
      'first_name',
      'middle_initial',
      'last_name',
      'address1',
      'address2',
      'address3',
      'city',
      'state',
      'province',
      'postal_code',
      'country_code',
      'gender',
      'date_of_birth',
      'alt_phone',
      'email',
      'security_phrase',
      'comments',
      'rank',
      'owner',
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 15) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, 'template_leads.xlsx');

    toast.success('Template descargado exitosamente');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      toast.error('Selecciona un archivo Excel válido (.xlsx o .xls)');
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

  const simulateUpload = () => {
    return new Promise<void>((resolve) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          setTimeout(() => resolve(), 500);
        }
        setUploadProgress(Math.min(progress, 100));
      }, 200);
    });
  };

  const handleFinish = async () => {
    if (!fileData.file) {
      toast.error('Selecciona un archivo Excel');
      return;
    }

    setIsProcessing(true);
    setUploadProgress(0);

    const startTime = Date.now();

    try {
      await simulateUpload();

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(1);
      const recordsProcessed = Math.floor(Math.random() * 500) + 100;
      const errorsFound = Math.floor(Math.random() * 10);

      setIsProcessing(false);
      handleClose();

      toast.success(
        <div>
          <div className="mb-1">¡Carga completada exitosamente!</div>
          <div className="text-slate-600">
            <div>• {recordsProcessed} registros procesados</div>
            {errorsFound > 0 && <div>• {errorsFound} errores encontrados</div>}
            <div>• Tiempo: {duration}s</div>
          </div>
        </div>,
        { duration: 5000 }
      );
    } catch (error) {
      setIsProcessing(false);
      toast.error('Error al procesar el archivo');
    }
  };

  const handleClose = () => {
    if (isProcessing) return;

    setCurrentStep(1);
    setNewListData({
      listId: '',
      name: '',
      campaign: campaignName,
      description: '',
    });
    setFileData({ file: null, isDragging: false });
    setUploadProgress(0);
    onClose();
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 1:
        return 'Configurar Lista';
      case 2:
        return 'Template';
      case 3:
        return 'Cargar Archivo';
      default:
        return '';
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-start justify-between mb-1">
              <div>
                <DialogTitle className="text-slate-900">Cargar Leads</DialogTitle>
                <DialogDescription className="text-slate-500 text-sm mt-1">
                  Paso {currentStep} de 3: {getStepTitle()}
                </DialogDescription>
              </div>
              <button
                onClick={handleClose}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                disabled={isProcessing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="px-6 pb-6">
            <div className="relative">
              {/* Progress Line */}
              <div className="absolute top-4 left-0 right-0 h-1 bg-slate-200">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
                />
              </div>

              {/* Steps */}
              <div className="relative flex justify-between">
                {[
                  { num: 1, label: 'Lista' },
                  { num: 2, label: 'Template' },
                  { num: 3, label: 'Archivo' },
                ].map((step) => (
                  <div key={step.num} className="flex flex-col items-center">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 z-10',
                        currentStep >= step.num
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 text-slate-400'
                      )}
                    >
                      {step.num}
                    </div>
                    <span
                      className={cn(
                        'text-xs mt-2 transition-colors duration-300',
                        currentStep >= step.num ? 'text-blue-600' : 'text-slate-400'
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pb-6">
            <div className="min-h-[380px]">
              {/* PASO 1: Configurar Lista */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <div className="flex gap-3">
                      <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-blue-900 mb-1">Nueva Lista</h4>
                        <p className="text-blue-700 text-sm">
                          Completa los datos para crear una nueva lista de leads
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Form Fields */}
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="listId" className="mb-2 block">
                          ID Lista *
                        </Label>
                        <Input
                          id="listId"
                          placeholder="104"
                          value={newListData.listId}
                          onChange={(e) =>
                            setNewListData({ ...newListData, listId: e.target.value })
                          }
                          className="bg-slate-50"
                        />
                      </div>
                      <div>
                        <Label htmlFor="listName" className="mb-2 block">
                          Nombre *
                        </Label>
                        <Input
                          id="listName"
                          placeholder="Lista Octubre"
                          value={newListData.name}
                          onChange={(e) =>
                            setNewListData({ ...newListData, name: e.target.value })
                          }
                          className="bg-slate-50"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="campaign" className="mb-2 block">
                        Campaña
                      </Label>
                      <Select
                        value={newListData.campaign}
                        onValueChange={(value) =>
                          setNewListData({ ...newListData, campaign: value })
                        }
                      >
                        <SelectTrigger className="bg-slate-50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {campaigns.map((campaign) => (
                            <SelectItem key={campaign} value={campaign}>
                              {campaign}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="description" className="mb-2 block">
                        Descripción (opcional)
                      </Label>
                      <Textarea
                        id="description"
                        placeholder="Descripción breve..."
                        value={newListData.description}
                        onChange={(e) =>
                          setNewListData({ ...newListData, description: e.target.value })
                        }
                        className="bg-slate-50 resize-none"
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 2: Descargar Template */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                      <FileDown className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="text-slate-900 mb-2">Template Excel</h3>
                    <p className="text-slate-600 mb-6">
                      Descarga la plantilla con el formato correcto
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
                        <h4 className="text-blue-900 mb-1">Campos del Template</h4>
                        <p className="text-blue-700 text-sm">
                          El archivo incluye 25 campos estándar de Vicidial: phone_number, phone_code, first_name, last_name, email, address, y más.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-amber-800 text-sm">
                      <strong>Nota:</strong> Completa los campos phone_number y list_id como mínimo. Los demás campos son opcionales.
                    </p>
                  </div>
                </div>
              )}

              {/* PASO 3: Cargar Archivo */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={cn(
                      'border-2 border-dashed rounded-lg p-8 transition-all',
                      fileData.isDragging
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-300 bg-slate-50'
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
                        <p className="text-slate-600 mb-4">o</p>
                        <Button type="button" variant="outline">
                          Explorar Archivos
                        </Button>
                        <p className="text-slate-500 mt-3 text-sm">
                          Excel (máx. {MAX_LEAD_UPLOAD_MB}MB)
                        </p>
                      </label>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-green-600" />
                          </div>
                          <div>
                            <p className="text-slate-900">{fileData.file.name}</p>
                            <p className="text-slate-500 text-sm">
                              {(fileData.file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setFileData({ ...fileData, file: null })}
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
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500">Lista:</span>{' '}
                        <span className="text-slate-900">{newListData.name}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Campaña:</span>{' '}
                        <span className="text-slate-900">{campaignName}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-slate-50/50">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={currentStep === 1}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Atrás
              </Button>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                {currentStep < 3 ? (
                  <Button onClick={handleNext} className="gap-2 bg-slate-900 hover:bg-slate-800">
                    Siguiente
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleFinish}
                    className="gap-2 bg-slate-900 hover:bg-slate-800"
                    disabled={!fileData.file}
                  >
                    <Upload className="w-4 h-4" />
                    Cargar Leads
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog > <LoadingBackdrop
        isOpen={isProcessing}
        progress={uploadProgress}
        message="Procesando archivo..."
      />
    </>
  );
}
