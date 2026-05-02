import { useState, useEffect, useCallback } from "react";
import api from "@/services/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface Typification {
  id: number;
  campaign_id: string;
  name: string;
  category: string;
  form_id: number | null;
  form_name?: string;
  sort_order: number;
  active: boolean;
}

interface Form {
  id: number;
  campaign_id: string;
  name: string;
  description: string;
  field_count: number;
  usage_count: number;
}

interface FormField {
  id: number;
  form_id: number;
  field_name: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  options: any;
  sort_order: number;
}

const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Numérico" },
  { value: "select", label: "Selector (Dropdown)" },
  { value: "date", label: "Fecha" },
  { value: "textarea", label: "Área de Texto" },
  { value: "email", label: "Correo Electrónico" },
  { value: "phone", label: "Teléfono" },
];

const CATEGORIES = ["Contactado", "No Contactado"];

interface CampaignTypificationsProps {
  campaignId: string;
}

export default function CampaignTypifications({ campaignId }: CampaignTypificationsProps) {
  const [typs, setTyps] = useState<Typification[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"tipificaciones" | "formularios">("tipificaciones");

  // Typification editing
  const [editTypId, setEditTypId] = useState<number | null>(null);
  const [editTypName, setEditTypName] = useState("");
  const [editTypCategory, setEditTypCategory] = useState("Contactado");
  const [editTypFormId, setEditTypFormId] = useState<number | null>(null);
  const [editTypOrder, setEditTypOrder] = useState(0);
  const [isNewTyp, setIsNewTyp] = useState(false);

  // Form editing
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [isNewForm, setIsNewForm] = useState(false);

  // Field editing
  const [fields, setFields] = useState<FormField[]>([]);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [fieldData, setFieldData] = useState<{ field_name: string; field_label: string; field_type: string; is_required: boolean; options: string[]; sort_order: number; }>({ field_name: "", field_label: "", field_type: "text", is_required: false, options: [], sort_order: 0 });
  const [isNewField, setIsNewField] = useState(false);
  const [showFieldEditor, setShowFieldEditor] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [typRes, formRes] = await Promise.all([
        api.getTypifications(campaignId),
        api.getTypificationForms(campaignId),
      ]);
      setTyps(typRes.data || []);
      setForms(formRes.data || []);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadFields = async (formId: number) => {
    try {
      const res = await api.getFormFields(campaignId, formId);
      setFields(res.data || []);
    } catch (e) { setFields([]); }
  };

  // ---- Typification CRUD ----
  const saveTyp = async () => {
    if (!editTypName.trim()) return;
    try {
      if (isNewTyp) {
        await api.createTypification(campaignId, {
          name: editTypName, category: editTypCategory,
          form_id: editTypFormId, sort_order: editTypOrder,
        });
      } else if (editTypId) {
        await api.updateTypification(campaignId, editTypId, {
          name: editTypName, category: editTypCategory,
          form_id: editTypFormId, sort_order: editTypOrder,
        });
      }
      setEditTypId(null); setIsNewTyp(false);
      loadData();
    } catch (e: any) { setError(e.message); }
  };

  const toggleTypActive = async (t: Typification) => {
    try {
      await api.updateTypification(campaignId, t.id, { active: !t.active });
      loadData();
    } catch (e: any) { setError(e.message); }
  };

  const deleteTyp = async (id: number) => {
    if (!confirm("¿Eliminar esta tipificación?")) return;
    try {
      await api.deleteTypification(campaignId, id);
      loadData();
    } catch (e: any) { setError(e.message); }
  };

  // ---- Form CRUD ----
  const saveForm = async () => {
    if (!formName.trim()) return;
    try {
      if (isNewForm) {
        await api.createTypificationForm(campaignId, { name: formName, description: formDesc });
      } else if (editingForm) {
        await api.updateTypificationForm(campaignId, editingForm.id, { name: formName, description: formDesc });
      }
      setEditingForm(null); setIsNewForm(false);
      loadData();
    } catch (e: any) { setError(e.message); }
  };

  const deleteForm = async (id: number) => {
    if (!confirm("¿Eliminar este formulario y todos sus campos?")) return;
    try {
      await api.deleteTypificationForm(campaignId, id);
      loadData();
    } catch (e: any) { setError(e.message); }
  };

  const startEditForm = (f?: Form) => {
    if (f) {
      setEditingForm(f);
      setFormName(f.name);
      setFormDesc(f.description || "");
      setIsNewForm(false);
      loadFields(f.id);
    } else {
      setEditingForm(null);
      setFormName("");
      setFormDesc("");
      setIsNewForm(true);
      setFields([]);
    }
  };

  // ---- Field CRUD ----
  const saveField = async () => {
    if (!editingForm) return;
    if (!fieldData.field_name.trim() || !fieldData.field_label.trim()) return;
    try {
      const fieldPayload: any = {
        field_name: fieldData.field_name,
        field_label: fieldData.field_label,
        field_type: fieldData.field_type,
        is_required: fieldData.is_required,
        sort_order: fieldData.sort_order,
      };
      if (fieldData.field_type === "select" && fieldData.options.length > 0) {
        fieldPayload.options = fieldData.options.map((o: string) => ({
          label: o.trim(), value: o.trim().toLowerCase().replace(/\s+/g, "_"),
        }));
      }
      if (isNewField) {
        await api.createFormField(campaignId, editingForm.id, fieldPayload);
      } else if (editingField) {
        await api.updateFormField(campaignId, editingForm.id, editingField.id, fieldPayload);
      }
      setShowFieldEditor(false); setEditingField(null); setIsNewField(false);
      loadFields(editingForm.id);
      loadData();
    } catch (e: any) { setError(e.message); }
  };

  const deleteField = async (fieldId: number) => {
    if (!editingForm) return;
    if (!confirm("¿Eliminar este campo?")) return;
    try {
      await api.deleteFormField(campaignId, editingForm.id, fieldId);
      loadFields(editingForm.id);
      loadData();
    } catch (e: any) { setError(e.message); }
  };

  const openNewField = () => {
    setEditingField(null);
    setIsNewField(true);
    setFieldData({ field_name: "", field_label: "", field_type: "text", is_required: false, options: [], sort_order: fields.length });
    setShowFieldEditor(true);
  };

  const openEditField = (f: FormField) => {
    setEditingField(f);
    setIsNewField(false);
    setFieldData({
      field_name: f.field_name,
      field_label: f.field_label,
      field_type: f.field_type,
      is_required: f.is_required,
      options: f.options ? (Array.isArray(f.options) ? f.options.map((o: any) => o.label) : []) : [],
      sort_order: f.sort_order,
    });
    setShowFieldEditor(true);
  };

  if (loading) return <div className="p-6 text-slate-500">Cargando tipificaciones...</div>;

  const typByCat = (cat: string) => typs.filter(t => t.category === cat && t.active);
  const typNeedForm = typs.filter(t => t.active && !t.form_id);
  const contactados = typByCat("Contactado");
  const noContactados = typByCat("No Contactado");

  return (
    <div className="min-h-[500px] flex flex-col">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-4 shrink-0">{error}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-6 mb-6 border-b border-slate-200 shrink-0">
        <button
          onClick={() => setActiveTab("tipificaciones")}
          className={`pb-3 text-sm font-bold transition-all relative ${activeTab === "tipificaciones" ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
        >
          Tipificaciones de Llamada
          {activeTab === "tipificaciones" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-md" />}
        </button>
        <button
          onClick={() => setActiveTab("formularios")}
          className={`pb-3 text-sm font-bold transition-all relative ${activeTab === "formularios" ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
        >
          Formularios Personalizados
          {activeTab === "formularios" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-md" />}
        </button>
      </div>

      <div className="flex-1">
        {/* ---- TIPIFICACIONES ---- */}
        {activeTab === "tipificaciones" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
            <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-800">Tipificaciones de Llamada</h2>
          <Button
            size="sm"
            onClick={() => {
              setIsNewTyp(true); setEditTypId(null);
              setEditTypName(""); setEditTypCategory("Contactado");
              setEditTypFormId(null); setEditTypOrder(typs.length);
            }}
          >
            + Nueva Tipificación
          </Button>
        </div>

        {/* Categories */}
        {CATEGORIES.map(cat => {
          const items = typByCat(cat);
          return (
            <div key={cat} className="mb-5">
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 ${cat === "Contactado" ? "text-emerald-700" : "text-rose-700"}`}>
                {cat}
              </h3>
              {items.length === 0 && <p className="text-xs text-slate-400 mb-2">Sin tipificaciones en esta categoría.</p>}
              <div className="space-y-2">
                {items.map(t => (
                  <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border ${t.active ? "bg-slate-50 border-slate-200" : "bg-slate-100 border-slate-200 opacity-60"}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-800">{t.name}</span>
                        {t.form_name && <Badge variant="secondary" className="text-[10px]">{t.form_name}</Badge>}
                      </div>
                      <span className="text-[10px] text-slate-400">Orden: {t.sort_order}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={t.active} onCheckedChange={() => toggleTypActive(t)} />
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => {
                          setIsNewTyp(false); setEditTypId(t.id);
                          setEditTypName(t.name); setEditTypCategory(t.category);
                          setEditTypFormId(t.form_id); setEditTypOrder(t.sort_order);
                        }}
                      >Editar</Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => deleteTyp(t.id)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Typ edit modal */}
        {(editTypId || isNewTyp) && (
          <div className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-200 space-y-3">
            <h4 className="font-bold text-sm text-indigo-800">{isNewTyp ? "Nueva Tipificación" : "Editar Tipificación"}</h4>
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={editTypName} onChange={e => setEditTypName(e.target.value)} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">Categoría</Label>
              <Select value={editTypCategory} onValueChange={setEditTypCategory}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Formulario (opcional)</Label>
              <Select value={editTypFormId?.toString() || "none"} onValueChange={v => setEditTypFormId(v === "none" ? null : parseInt(v))}>
                <SelectTrigger className="text-sm"><SelectValue placeholder="Sin formulario" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin formulario</SelectItem>
                  {forms.map(f => <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Orden</Label>
              <Input type="number" value={editTypOrder} onChange={e => setEditTypOrder(parseInt(e.target.value) || 0)} className="text-sm w-24" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveTyp}>Guardar</Button>
              <Button size="sm" variant="outline" onClick={() => { setEditTypId(null); setIsNewForm(false); }}>Cancelar</Button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ---- FORMULARIOS ---- */}
      {activeTab === "formularios" && (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-800">Formularios Personalizados</h2>
          <Button size="sm" onClick={() => startEditForm()}>
            + Nuevo Formulario
          </Button>
        </div>

        {forms.length === 0 && !isNewForm && <p className="text-sm text-slate-400">No hay formularios creados para esta campaña.</p>}

        <div className="space-y-3">
          {forms.map(f => (
            <div key={f.id} className={`p-4 rounded-xl border ${editingForm?.id === f.id ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm text-slate-800">{f.name}</span>
                  <span className="text-[10px] text-slate-400 ml-3">{f.field_count} campos</span>
                  <span className="text-[10px] text-slate-400 ml-2">{f.usage_count} tipificaciones</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => startEditForm(f)}>Campos</Button>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => deleteForm(f.id)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </Button>
                </div>
              </div>

              {/* Edit form + fields */}
              {editingForm?.id === f.id && (
                <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                  {(isNewForm || editingForm) && (
                    <div className="space-y-2 p-3 bg-white rounded-lg border border-slate-200">
                      <div>
                        <Label className="text-xs">Nombre del Formulario</Label>
                        <Input value={formName} onChange={e => setFormName(e.target.value)} className="text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Descripción</Label>
                        <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} className="text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveForm}>Guardar Formulario</Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditingForm(null); setIsNewForm(false); }}>Cancelar</Button>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold text-slate-700">Campos del Formulario</h4>
                      <Button size="sm" variant="outline" onClick={openNewField}>+ Campo</Button>
                    </div>
                    {fields.length === 0 && <p className="text-xs text-slate-400">Sin campos. Agrega campos para que los agentes llenen al tipificar.</p>}
                    <div className="space-y-1.5">
                      {fields.map(field => (
                        <div key={field.id} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-100 text-xs">
                          <span className="font-semibold text-slate-700 w-32 truncate">{field.field_label}</span>
                          <Badge variant="outline" className="text-[9px]">{FIELD_TYPES.find(ft => ft.value === field.field_type)?.label || field.field_type}</Badge>
                          {field.is_required && <Badge className="text-[9px] bg-amber-100 text-amber-700 border-0">Requerido</Badge>}
                          <span className="text-slate-400 ml-auto">#{field.sort_order}</span>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => openEditField(field)}>Editar</Button>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-red-500" onClick={() => deleteField(field.id)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* New form inline */}
          {isNewForm && !editingForm && (
            <div className="p-4 rounded-xl border border-indigo-300 bg-indigo-50/50 space-y-3">
              <div>
                <Label className="text-xs">Nombre del Formulario</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} className="text-sm" />
              </div>
              <div>
                <Label className="text-xs">Descripción</Label>
                <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} className="text-sm" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveForm}>Crear Formulario</Button>
                <Button size="sm" variant="outline" onClick={() => { setIsNewForm(false); }}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
      </div>

      {/* Field editor modal */}
      {showFieldEditor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowFieldEditor(false)} />
          <div className="relative bg-white w-[500px] rounded-2xl shadow-2xl p-6 z-10 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">{isNewField ? "Nuevo Campo" : "Editar Campo"}</h3>
            <div>
              <Label className="text-xs">Nombre interno (field_name)</Label>
              <Input value={fieldData.field_name} onChange={e => setFieldData({ ...fieldData, field_name: e.target.value })} className="text-sm" placeholder="ej: nombres_completos" />
            </div>
            <div>
              <Label className="text-xs">Etiqueta visible (label)</Label>
              <Input value={fieldData.field_label} onChange={e => setFieldData({ ...fieldData, field_label: e.target.value })} className="text-sm" placeholder="ej: Nombres Completos" />
            </div>
            <div>
              <Label className="text-xs">Tipo de campo</Label>
              <Select value={fieldData.field_type} onValueChange={v => setFieldData({ ...fieldData, field_type: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(ft => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {fieldData.field_type === "select" && (
              <div className="space-y-2">
                <Label className="text-xs">Opciones de la lista</Label>
                <div className="flex gap-2">
                  <Input 
                    id="new-option-input"
                    className="text-sm flex-1" 
                    placeholder="Escribe una opción y presiona Enter" 
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = e.currentTarget.value.trim();
                        if (val && !fieldData.options.includes(val)) {
                          setFieldData({ ...fieldData, options: [...fieldData.options, val] });
                        }
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                  <Button 
                    type="button" 
                    size="sm" 
                    variant="secondary"
                    onClick={() => {
                      const input = document.getElementById('new-option-input') as HTMLInputElement;
                      if (input) {
                        const val = input.value.trim();
                        if (val && !fieldData.options.includes(val)) {
                          setFieldData({ ...fieldData, options: [...fieldData.options, val] });
                        }
                        input.value = '';
                      }
                    }}
                  >
                    Agregar
                  </Button>
                </div>
                {fieldData.options.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 p-2 bg-slate-50 border border-slate-100 rounded-md max-h-32 overflow-y-auto">
                    {fieldData.options.map((opt, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1 py-1 text-xs font-normal">
                        {opt}
                        <button 
                          onClick={() => setFieldData({ ...fieldData, options: fieldData.options.filter((_, i) => i !== idx) })}
                          className="hover:bg-slate-200 rounded-full p-0.5 text-slate-500 hover:text-red-500 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Label className="text-xs">Requerido</Label>
              <Switch checked={fieldData.is_required} onCheckedChange={v => setFieldData({ ...fieldData, is_required: v })} />
            </div>
            <div>
              <Label className="text-xs">Orden</Label>
              <Input type="number" value={fieldData.sort_order} onChange={e => setFieldData({ ...fieldData, sort_order: parseInt(e.target.value) || 0 })} className="text-sm w-24" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={saveField}>Guardar Campo</Button>
              <Button size="sm" variant="outline" onClick={() => setShowFieldEditor(false)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
