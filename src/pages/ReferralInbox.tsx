import { useState, type FormEvent } from "react";
import { Eye, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useReferralInbox } from "../hooks/useReferrals";
import { useQuery } from "@tanstack/react-query";
import { areasApi } from "../api/areas";
import Pagination from "../components/Pagination";
import { formatLocalDate } from "../utils/dateUtils";

const ReferralInbox = () => {
  const { isAdmin } = useAuth();
  const inbox = useReferralInbox();
  const areas = useQuery({ queryKey: ["areas", "referral-filter"], queryFn: areasApi.list, enabled: isAdmin });
  const [draft, setDraft] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); inbox.setSearch(draft); };
  return <div className="mx-auto max-w-6xl">
    <div className="mb-7"><h1 className="text-2xl font-bold text-gray-900">Buzón de derivaciones</h1><p className="mt-1 text-sm text-gray-500">Derivaciones activas pendientes de conclusión.</p></div>
    <form onSubmit={submit} className="mb-5 grid gap-3 rounded-lg border bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_auto]">
      <input value={draft} onChange={(e) => setDraft(e.target.value)} className="rounded-md border-gray-300" placeholder="Buscar por RAC o DNI" />
      {isAdmin ? <select value={inbox.areaId} onChange={(e) => inbox.setAreaId(e.target.value)} className="rounded-md border-gray-300"><option value="">Todas las áreas</option>{(areas.data || []).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select> : <div />}
      <button className="btn btn-primary inline-flex items-center justify-center"><Search size={17} className="mr-2" />Buscar</button>
    </form>
    {!inbox.isLoading && !inbox.isError && <Pagination pagination={inbox.pagination} onPageChange={inbox.setPage} onLimitChange={inbox.setLimit} bottom={false} />}
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">{inbox.isLoading ? <p className="p-10 text-center text-gray-500">Cargando derivaciones...</p> : inbox.isError ? <p className="bg-red-50 p-5 text-red-700">{inbox.error instanceof Error ? inbox.error.message : "No se pudo cargar el buzón."}</p> : inbox.referrals.length === 0 ? <p className="p-10 text-center text-gray-400">No hay derivaciones pendientes.</p> : <div className={inbox.isFetching ? "opacity-60" : ""}>{inbox.referrals.map((item) => <div key={item.id} className="grid gap-3 border-b p-4 last:border-0 md:grid-cols-[130px_1fr_1fr_180px_44px] md:items-center"><Link to={`/attentions/${item.attentionId}`} className="font-semibold text-[#1A2855] hover:underline">{item.racCode}</Link><div><p className="text-sm font-medium">{item.clientName}</p><p className="text-xs text-gray-500">DNI {item.clientDni}</p></div><div><p className="text-sm">{item.destinationAreaName}</p><p className="text-xs text-gray-500">Por {item.referredByName}</p></div><p className="text-sm text-gray-500">{formatLocalDate(item.referredAt)}</p><Link to={`/attentions/${item.attentionId}`} className="rounded-md p-2 text-blue-600 hover:bg-blue-50" title="Abrir"><Eye size={18} /></Link></div>)}</div>}</div>
    {!inbox.isLoading && !inbox.isError && <Pagination pagination={inbox.pagination} onPageChange={inbox.setPage} onLimitChange={inbox.setLimit} />}
  </div>;
};
export default ReferralInbox;
