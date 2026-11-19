import { useMemo, useState, type FormEvent } from "react";
import { CalendarRange, Download, FileSpreadsheet, Loader2, RefreshCw, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAttentionExports } from "../hooks/useAttentionExports";
import type { AttentionExportFilters, AttentionExportMode, AttentionExportStatus } from "../types";
import { formatLocalDate } from "../utils/dateUtils";

interface AttentionExportManagerProps {
  isAdmin: boolean;
  currentFilters: AttentionExportFilters;
}

const emptyFilters: AttentionExportFilters = {
  search: "",
  surveyStatus: "",
  referralStatus: "",
  areaId: "",
  admissionProcessId: "",
  serviceChannelId: "",
  workstationId: "",
};

const statusLabels: Record<AttentionExportStatus, string> = {
  QUEUED: "En cola",
  PROCESSING: "Preparando",
  COMPLETED: "Lista para descargar",
  FAILED: "Fallida",
  EXPIRED: "Vencida",
};

const statusClasses: Record<AttentionExportStatus, string> = {
  QUEUED: "bg-amber-100 text-amber-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  EXPIRED: "bg-gray-100 text-gray-600",
};

const formatDateOnly = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const AttentionExportManager = ({ isAdmin, currentFilters }: AttentionExportManagerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AttentionExportMode>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [combineDateFilters, setCombineDateFilters] = useState(false);
  const exports = useAttentionExports();

  const activeFilterNames = useMemo(() => [
    currentFilters.search && "busqueda",
    currentFilters.surveyStatus && "encuesta",
    currentFilters.referralStatus && "derivacion",
    currentFilters.areaId && "area",
    currentFilters.admissionProcessId && "proceso de admision",
    currentFilters.serviceChannelId && "medio",
    currentFilters.workstationId && "mesa",
  ].filter(Boolean) as string[], [currentFilters]);
  const readyCount = exports.jobs.filter((job) => job.status === "COMPLETED").length;
  const pendingCount = exports.jobs.filter((job) => job.status === "QUEUED" || job.status === "PROCESSING").length;

  const handleStart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "DATE_RANGE") {
      if (!startDate || !endDate) return toast.error("Selecciona la fecha inicial y final.");
      if (endDate < startDate) return toast.error("La fecha final no puede ser anterior a la inicial.");
    }
    try {
      const filters = mode === "FILTERED" || (mode === "DATE_RANGE" && combineDateFilters)
        ? currentFilters
        : emptyFilters;
      const result = await exports.start({
        mode,
        filters,
        startDate: mode === "DATE_RANGE" ? startDate : undefined,
        endDate: mode === "DATE_RANGE" ? endDate : undefined,
      });
      toast.success(result.job.reused
        ? "Ya existe una exportacion equivalente. Se reutilizara el trabajo disponible."
        : "La exportacion se esta preparando. Puedes continuar usando el sistema.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar la exportacion.");
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      await exports.retry(jobId);
      toast.success("La exportacion se volvera a preparar.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo reintentar la exportacion.");
    }
  };

  const handleDownload = async (jobId: string) => {
    try {
      const result = await exports.download(jobId);
      const link = document.createElement("a");
      link.href = result.url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo descargar el archivo.");
    }
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className="btn btn-secondary relative inline-flex items-center justify-center">
        <FileSpreadsheet size={18} className="mr-2" />
        Exportar Excel
        {(readyCount > 0 || pendingCount > 0) && (
          <span className="ml-2 rounded-full bg-[#1A2855] px-2 py-0.5 text-xs font-semibold text-white">
            {readyCount > 0 ? `${readyCount} lista${readyCount === 1 ? "" : "s"}` : `${pendingCount} en proceso`}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="attention-export-title">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-white px-5 py-4">
              <div>
                <h2 id="attention-export-title" className="text-lg font-semibold text-gray-900">Exportar atenciones a Excel</h2>
                <p className="mt-1 text-sm text-gray-500">El archivo se prepara en segundo plano y no bloquea el sistema.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Cerrar" className="rounded-md p-2 text-gray-400 hover:bg-gray-100"><X size={19} /></button>
            </div>

            <form onSubmit={handleStart} className="space-y-5 p-5">
              <fieldset>
                <legend className="text-sm font-semibold text-gray-800">Que deseas exportar</legend>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className={`cursor-pointer rounded-lg border p-3 ${mode === "ALL" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
                    <input type="radio" name="exportMode" value="ALL" checked={mode === "ALL"} onChange={() => setMode("ALL")} className="mr-2" />
                    <span className="text-sm font-medium">{isAdmin ? "Todas las atenciones" : "Todas mis atenciones"}</span>
                  </label>
                  <label className={`cursor-pointer rounded-lg border p-3 ${mode === "FILTERED" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
                    <input type="radio" name="exportMode" value="FILTERED" checked={mode === "FILTERED"} onChange={() => setMode("FILTERED")} className="mr-2" />
                    <span className="text-sm font-medium">Filtros actuales</span>
                  </label>
                  <label className={`cursor-pointer rounded-lg border p-3 ${mode === "DATE_RANGE" ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>
                    <input type="radio" name="exportMode" value="DATE_RANGE" checked={mode === "DATE_RANGE"} onChange={() => setMode("DATE_RANGE")} className="mr-2" />
                    <span className="text-sm font-medium">Rango de fechas</span>
                  </label>
                </div>
              </fieldset>

              {mode === "FILTERED" && (
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                  {activeFilterNames.length
                    ? `Se aplicaran: ${activeFilterNames.join(", ")}. Se exportaran todos los resultados, no solo la pagina visible.`
                    : "No hay filtros activos. Esta modalidad coincidira con la exportacion completa permitida para tu rol."}
                </div>
              )}

              {mode === "DATE_RANGE" && (
                <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-800"><CalendarRange size={18} />Fechas de registro</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm text-gray-600">Desde<input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300" /></label>
                    <label className="text-sm text-gray-600">Hasta<input type="date" required value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300" /></label>
                  </div>
                  {startDate && endDate && endDate >= startDate && <p className="text-xs text-gray-500">Se incluiran registros desde el {formatDateOnly(startDate)} a las 00:00 hasta el {formatDateOnly(endDate)} a las 23:59, horario de Lima.</p>}
                  <label className="flex items-start gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={combineDateFilters} onChange={(event) => setCombineDateFilters(event.target.checked)} className="mt-0.5 rounded border-gray-300" />
                    <span>Combinar el rango con los filtros actuales{activeFilterNames.length ? ` (${activeFilterNames.join(", ")})` : ""}.</span>
                  </label>
                  {combineDateFilters && !activeFilterNames.length && <p className="text-xs text-amber-700">No existen filtros adicionales activos; solo se aplicara el rango.</p>}
                </div>
              )}

              <div className="flex justify-end">
                <button type="submit" disabled={exports.isStarting} className="btn btn-primary inline-flex items-center disabled:opacity-60">
                  {exports.isStarting ? <Loader2 size={18} className="mr-2 animate-spin" /> : <FileSpreadsheet size={18} className="mr-2" />}
                  Preparar archivo
                </button>
              </div>
            </form>

            <section className="border-t px-5 py-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Exportaciones recientes</h3>
                <button type="button" onClick={() => void exports.refetch()} className="rounded-md p-2 text-gray-500 hover:bg-gray-100" title="Actualizar"><RefreshCw size={17} /></button>
              </div>
              {exports.isLoading ? <p className="mt-4 text-sm text-gray-500">Consultando exportaciones...</p>
                : exports.isError ? <p className="mt-4 text-sm text-red-600">{exports.error instanceof Error ? exports.error.message : "No se pudieron consultar las exportaciones."}</p>
                : exports.jobs.length === 0 ? <p className="mt-4 text-sm text-gray-500">Todavia no preparaste archivos.</p>
                : <div className="mt-3 divide-y rounded-lg border border-gray-200">{exports.jobs.map((job) => {
                  const progress = job.totalRows > 0 ? Math.min(100, Math.round(job.progressRows * 100 / job.totalRows)) : job.status === "COMPLETED" ? 100 : 0;
                  return <div key={job.id} className="p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="text-sm font-medium text-gray-900">{job.fileName}</p><p className="text-xs text-gray-500">Solicitada el {formatLocalDate(job.createdAt)} · {job.totalRows} registros</p></div>
                      <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[job.status]}`}>{statusLabels[job.status]}</span>
                    </div>
                    {(job.status === "QUEUED" || job.status === "PROCESSING") && <div className="mt-3"><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-gray-500">{job.progressRows} de {job.totalRows} registros</p></div>}
                    {job.status === "FAILED" && <p className="mt-2 text-xs text-red-600">{job.errorMessage || "No se pudo generar el archivo."}</p>}
                    <div className="mt-3 flex justify-end gap-2">
                      {job.status === "FAILED" && job.attemptCount < 3 && <button type="button" disabled={exports.retryingJobId === job.id} onClick={() => void handleRetry(job.id)} className="btn btn-secondary inline-flex items-center text-sm"><RefreshCw size={15} className={`mr-2 ${exports.retryingJobId === job.id ? "animate-spin" : ""}`} />Reintentar</button>}
                      {job.status === "COMPLETED" && <button type="button" disabled={exports.downloadingJobId === job.id} onClick={() => void handleDownload(job.id)} className="btn btn-primary inline-flex items-center text-sm"><Download size={15} className="mr-2" />Descargar</button>}
                    </div>
                  </div>;
                })}</div>}
            </section>
          </div>
        </div>
      )}
    </>
  );
};

export default AttentionExportManager;
