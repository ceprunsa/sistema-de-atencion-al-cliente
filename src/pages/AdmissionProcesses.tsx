import { useState, type FormEvent } from "react";
import { Ban, CalendarRange, Pencil, Plus, RotateCcw, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAdmissionProcesses } from "../hooks/useAdmissionProcesses";
import type { AdmissionProcess, AdmissionProcessPhase } from "../types";
import { ADMISSION_PHASE_LABELS, formatAdmissionProcess } from "../utils/admissionProcesses";

const currentYear = new Date().getFullYear();

const AdmissionProcesses = () => {
  const { processes, isLoading, isError, createProcess, updateProcess, setProcessStatus, isSaving } = useAdmissionProcesses();
  const [phase, setPhase] = useState<AdmissionProcessPhase>("CEPRUNSA_I");
  const [customLabel, setCustomLabel] = useState("");
  const [year, setYear] = useState(currentYear);
  const [editing, setEditing] = useState<AdmissionProcess | null>(null);

  const reset = () => { setPhase("CEPRUNSA_I"); setCustomLabel(""); setYear(currentYear); setEditing(null); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (year < 2000 || year > 2100) return toast.error("Ingresa un año entre 2000 y 2100.");
    if (phase === "CUSTOM" && !customLabel.trim()) return toast.error("Ingresa el nombre del proceso personalizado.");
    try {
      const values = { phase, customLabel: phase === "CUSTOM" ? customLabel.trim() : null, year };
      if (editing) await updateProcess({ id: editing.id, values }); else await createProcess(values);
      toast.success(editing ? "Proceso actualizado." : "Proceso creado.");
      reset();
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar."); }
  };
  const startEdit = (process: AdmissionProcess) => { setEditing(process); setPhase(process.phase); setCustomLabel(process.customLabel || ""); setYear(process.year); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const toggle = async (process: AdmissionProcess) => {
    try { await setProcessStatus({ id: process.id, isActive: !process.isActive }); toast.success(process.isActive ? "Proceso inhabilitado." : "Proceso reactivado."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo cambiar el estado."); }
  };

  return <div className="mx-auto w-full max-w-5xl">
    <div className="mb-8"><h1 className="text-2xl font-bold text-gray-900">Procesos de admisión</h1><p className="mt-1 text-sm text-gray-500">Administra las etiquetas opcionales de fase y año.</p></div>
    <form onSubmit={submit} className="mb-6 rounded-lg border border-gray-100 bg-white p-5 shadow">
      <div className="flex items-start justify-between"><h2 className="font-medium">{editing ? "Editar proceso" : "Nuevo proceso"}</h2>{editing && <button type="button" onClick={reset} className="rounded p-2 text-gray-500 hover:bg-gray-100"><X size={18} /></button>}</div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div><label className="block text-sm font-medium">Fase *</label><select value={phase} onChange={(event) => setPhase(event.target.value as AdmissionProcessPhase)} className="mt-1 block w-full rounded-md border-gray-300">{Object.entries(ADMISSION_PHASE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        {phase === "CUSTOM" && <div><label className="block text-sm font-medium">Nombre personalizado *</label><input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} maxLength={120} className="mt-1 block w-full rounded-md border-gray-300" /></div>}
        <div><label className="block text-sm font-medium">Año *</label><input type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 block w-full rounded-md border-gray-300" /></div>
      </div>
      <div className="mt-4 flex justify-end"><button disabled={isSaving} className="btn btn-primary inline-flex items-center"><Plus size={17} className="mr-1" />{editing ? "Actualizar" : "Agregar"}</button></div>
    </form>
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      {isLoading ? <p className="p-10 text-center text-gray-500">Cargando procesos...</p> : isError ? <p className="bg-red-50 p-6 text-red-700">No se pudieron cargar los procesos.</p> : processes.length === 0 ? <p className="p-10 text-center text-gray-400">No hay procesos registrados.</p> : <div className="divide-y">{processes.map((process) => <div key={process.id} className={`flex items-center justify-between p-4 ${process.isActive ? "" : "bg-gray-50"}`}><div className="flex items-center"><CalendarRange className="mr-3 text-blue-700" size={20} /><div><p className="font-medium">{formatAdmissionProcess(process)}</p><p className="text-xs text-gray-500">{process.isActive ? "Activo" : "Inhabilitado"}</p></div></div><div><button onClick={() => startEdit(process)} className="rounded p-2 text-blue-600 hover:bg-blue-50"><Pencil size={18} /></button><button onClick={() => void toggle(process)} disabled={isSaving} className={`rounded p-2 ${process.isActive ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}>{process.isActive ? <Ban size={18} /> : <RotateCcw size={18} />}</button></div></div>)}</div>}
    </div>
  </div>;
};

export default AdmissionProcesses;
