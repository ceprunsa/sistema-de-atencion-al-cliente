import { useState, type FormEvent } from "react";
import { Eye, Loader2, Plus, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import Pagination from "../components/Pagination";
import { useAttentions } from "../hooks/useAttentions";
import { formatLocalDate } from "../utils/dateUtils";
import { useAuth } from "../hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { areasApi } from "../api/areas";

const surveyLabels: Record<string, string> = { NONE: "Sin encuesta", PENDING_DECISION: "Encuesta por decidir", SENT: "Encuesta enviada", COMPLETED: "Encuesta completada", SKIPPED: "Encuesta omitida", CANCELLED: "Encuesta cancelada" };
const referralLabels: Record<string, string> = { NONE: "Sin derivación", PENDING: "Derivación pendiente", RESOLVED: "Derivación resuelta", DISABLED: "Derivación inhabilitada", CANCELLED: "Derivación cancelada" };

const Attentions = () => {
  const { isAdmin } = useAuth();
  const areas = useQuery({ queryKey: ["areas", "attention-filter"], queryFn: areasApi.list, enabled: isAdmin });
  const {
    attentions,
    pagination,
    search,
    isLoading,
    isFetching,
    isError,
    error,
    setPage,
    setLimit,
    setSearch,
    surveyStatus,
    referralStatus,
    areaId,
    setSurveyStatus,
    setReferralStatus,
    setAreaId,
  } = useAttentions();
  const [searchInput, setSearchInput] = useState(search);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchInput);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearch("");
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Atenciones</h1>
          <p className="mt-1 text-sm text-gray-500">
            Consulta el historial por código RAC o DNI del cliente.
          </p>
        </div>
        <Link to="/attentions/new" className="btn btn-primary inline-flex items-center justify-center">
          <Plus size={18} className="mr-2" />
          Nueva atención
        </Link>
      </div>

      <form onSubmit={handleSearch} className="mb-5 rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
        <label htmlFor="attentionSearch" className="block text-sm font-medium text-gray-700">
          Buscar atención
        </label>
        <div className="mt-1 grid gap-2 md:grid-cols-2 lg:grid-cols-[1fr_190px_190px_190px_auto]">
          <div className="relative flex-1">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="attentionSearch"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Ej. RAC-001-2026 o 12345678"
              maxLength={40}
              className="block w-full rounded-md border-gray-300 pl-9 pr-9 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {searchInput && (
              <button type="button" onClick={clearSearch} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100">
                <X size={16} />
              </button>
            )}
          </div>
          <select value={surveyStatus} onChange={(event) => setSurveyStatus(event.target.value)} className="rounded-md border-gray-300 text-sm"><option value="">Todas las encuestas</option>{Object.entries(surveyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={referralStatus} onChange={(event) => setReferralStatus(event.target.value)} className="rounded-md border-gray-300 text-sm"><option value="">Todas las derivaciones</option>{Object.entries(referralLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          {isAdmin ? <select value={areaId} onChange={(event) => setAreaId(event.target.value)} className="rounded-md border-gray-300 text-sm"><option value="">Todas las áreas</option>{(areas.data || []).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select> : <div className="hidden lg:block" />}
          <button type="submit" className="btn btn-secondary inline-flex items-center justify-center">
            <Search size={17} className="mr-2" />
            Buscar
          </button>
        </div>
      </form>

      {!isLoading && !isError && (
        <Pagination pagination={pagination} onPageChange={setPage} onLimitChange={setLimit} bottom={false} />
      )}

      <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-gray-500">
            <Loader2 size={20} className="animate-spin" /> Cargando atenciones...
          </div>
        ) : isError ? (
          <div className="bg-red-50 p-6 text-red-700">
            {error instanceof Error ? error.message : "No se pudieron cargar las atenciones."}
          </div>
        ) : attentions.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            {search ? "No se encontraron atenciones con ese criterio." : "Todavía no hay atenciones registradas."}
          </div>
        ) : (
          <div className={`divide-y divide-gray-100 ${isFetching ? "opacity-60" : ""}`}>
            <div className="hidden lg:grid lg:grid-cols-12 gap-3 bg-gray-50 px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">
              <div className="col-span-2">Código</div>
              <div className="col-span-3">Cliente</div>
              <div className="col-span-2">Medio</div>
              <div className="col-span-2">Registro</div>
              <div className="col-span-2">Estados</div>
              <div className="col-span-1 text-right">Acción</div>
            </div>
            {attentions.map((attention) => (
              <div key={attention.id} className="p-4 transition-colors hover:bg-gray-50 lg:grid lg:grid-cols-12 lg:items-center lg:gap-3 lg:px-5">
                <div className="lg:col-span-2">
                  <Link to={`/attentions/${attention.id}`} className="font-semibold text-[#1A2855] hover:underline">
                    {attention.racCode}
                  </Link>
                </div>
                <div className="mt-2 lg:col-span-3 lg:mt-0">
                  <p className="text-sm font-medium text-gray-900">{attention.clientName}</p>
                  <p className="text-xs text-gray-500">DNI {attention.clientDni}</p>
                </div>
                <div className="mt-2 text-sm text-gray-600 lg:col-span-2 lg:mt-0">{attention.serviceChannelName}</div>
                <div className="mt-2 lg:col-span-2 lg:mt-0">
                  <p className="text-sm text-gray-600">{formatLocalDate(attention.createdAt)}</p>
                  <p className="text-xs text-gray-400">{attention.createdByName}</p>
                </div>
                <div className="mt-3 lg:col-span-2 lg:mt-0">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${attention.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {attention.status === "ACTIVE" ? "Activa" : "Inhabilitada"}
                  </span>
                  <p className="mt-1 text-xs font-medium text-blue-700">{surveyLabels[attention.surveyStatus]}</p>
                  <p className={`mt-0.5 text-xs font-medium ${attention.referralStatus === "PENDING" ? "text-amber-700" : "text-gray-500"}`}>{referralLabels[attention.referralStatus]}{attention.referralAreaName ? ` · ${attention.referralAreaName}` : ""}</p>
                </div>
                <div className="mt-3 flex justify-end lg:col-span-1 lg:mt-0">
                  <Link to={`/attentions/${attention.id}`} title="Ver detalle" className="rounded-md p-2 text-blue-600 hover:bg-blue-50">
                    <Eye size={18} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isLoading && !isError && (
        <Pagination pagination={pagination} onPageChange={setPage} onLimitChange={setLimit} />
      )}
    </div>
  );
};

export default Attentions;
