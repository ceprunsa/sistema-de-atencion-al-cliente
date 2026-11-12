import { useState, type FormEvent } from "react";
import { Eye, MessageSquareWarning, Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { areasApi } from "../api/areas";
import Pagination from "../components/Pagination";
import { useAuth } from "../hooks/useAuth";
import { useComplaintList } from "../hooks/useComplaints";
import type { ComplaintListScope, ComplaintStatus } from "../types";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_OPTIONS,
  complaintStatusClass,
} from "../utils/complaints";
import { formatLocalDate } from "../utils/dateUtils";

const Complaints = () => {
  const { isAdmin } = useAuth();
  const list = useComplaintList();
  const [draftSearch, setDraftSearch] = useState("");
  const areas = useQuery({
    queryKey: ["areas", "complaint-filter"],
    queryFn: areasApi.list,
  });

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    list.setSearch(draftSearch);
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <MessageSquareWarning className="text-[#1A2855]" />
            Quejas
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isAdmin
              ? "Visión global y buzones operativos según tu área."
              : "Quejas creadas por ti o relacionadas con tu área."}
          </p>
        </div>
        <Link to="/complaints/new" className="btn btn-primary inline-flex items-center justify-center">
          <Plus size={17} className="mr-2" />
          Nueva queja
        </Link>
      </div>

      <form
        onSubmit={submitSearch}
        className="mb-5 grid gap-3 rounded-lg border bg-white p-4 shadow-sm lg:grid-cols-[minmax(240px,1fr)_210px_230px_220px_auto]"
      >
        <input
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          className="rounded-md border-gray-300"
          placeholder="Buscar por RQ, DNI, cliente o RAC"
        />
        <select
          value={list.scope}
          onChange={(event) =>
            list.setScope(event.target.value as ComplaintListScope)
          }
          className="rounded-md border-gray-300"
        >
          <option value="ALL">
            {isAdmin ? "Todas las visibles" : "Todas mis visibles"}
          </option>
          <option value="RESPONSIBLE_AREA">Buzón de mi área</option>
          <option value="CREATED_BY_ME">Creadas por mí</option>
          <option value="CLOSURE_AREA">Buzón de cierre</option>
        </select>
        <select
          value={list.status}
          onChange={(event) =>
            list.setStatus(event.target.value as ComplaintStatus | "")
          }
          className="rounded-md border-gray-300"
        >
          <option value="">Todos los estados</option>
          {COMPLAINT_STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={list.areaId}
          onChange={(event) => list.setAreaId(event.target.value)}
          className="rounded-md border-gray-300"
        >
          <option value="">Todas las áreas responsables</option>
          {(areas.data || []).map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}{area.isActive ? "" : " (inhabilitada)"}
            </option>
          ))}
        </select>
        <button className="btn btn-primary inline-flex items-center justify-center">
          <Search size={17} className="mr-2" />
          Buscar
        </button>
      </form>

      {!list.isLoading && !list.isError && (
        <Pagination
          pagination={list.pagination}
          onPageChange={list.setPage}
          onLimitChange={list.setLimit}
          bottom={false}
        />
      )}

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        {list.isLoading ? (
          <p className="p-10 text-center text-gray-500">Cargando quejas...</p>
        ) : list.isError ? (
          <p className="bg-red-50 p-5 text-red-700">
            {list.error instanceof Error
              ? list.error.message
              : "No se pudo cargar el listado."}
          </p>
        ) : list.complaints.length === 0 ? (
          <p className="p-10 text-center text-gray-400">
            No hay quejas que coincidan con los filtros.
          </p>
        ) : (
          <div className={list.isFetching ? "opacity-60" : ""}>
            {list.complaints.map((item) => (
              <article
                key={item.id}
                className="grid gap-3 border-b p-4 last:border-0 xl:grid-cols-[125px_minmax(180px,1fr)_minmax(220px,1.4fr)_180px_170px_44px] xl:items-center"
              >
                <div>
                  <Link
                    to={"/complaints/" + item.id}
                    className="font-semibold text-[#1A2855] hover:underline"
                  >
                    {item.complaintCode}
                  </Link>
                  {item.racCode && (
                    <p className="mt-1 text-xs text-gray-500">
                      RAC {item.racCode}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {item.clientName}
                  </p>
                  <p className="text-xs text-gray-500">
                    DNI {item.clientDni} · {item.clientEmail}
                  </p>
                </div>
                <div>
                  <p className="line-clamp-2 text-sm text-gray-700">
                    {item.descriptionPreview}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {item.serviceChannelName}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {item.responsibleAreaName}
                  </p>
                  <p className="text-xs text-gray-500">
                    Por {item.createdByName}
                  </p>
                </div>
                <div>
                  <span className={"inline-flex rounded-full px-2 py-1 text-xs font-medium " + complaintStatusClass(item.status)}>
                    {COMPLAINT_STATUS_LABELS[item.status]}
                  </span>
                  <p className="mt-2 text-xs text-gray-500">
                    {formatLocalDate(item.createdAt)}
                  </p>
                </div>
                <Link
                  to={"/complaints/" + item.id}
                  className="rounded-md p-2 text-blue-600 hover:bg-blue-50"
                  title="Ver detalle"
                >
                  <Eye size={18} />
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>

      {!list.isLoading && !list.isError && (
        <Pagination
          pagination={list.pagination}
          onPageChange={list.setPage}
          onLimitChange={list.setLimit}
        />
      )}
    </div>
  );
};

export default Complaints;
