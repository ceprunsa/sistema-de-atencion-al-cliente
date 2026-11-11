import {
  ArrowLeft,
  ContactRound,
  Eye,
  Loader2,
  Mail,
  Pencil,
  Phone,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import Pagination from "../components/Pagination";
import { useClient, useClientAttentions } from "../hooks/useClients";
import { formatLocalDate } from "../utils/dateUtils";

const requesterLabels = {
  APPLICANT: "Postulante",
  RELATIVE: "Familiar",
  OTHER: "Otro",
} as const;

const referralLabels: Record<string, string> = {
  NONE: "Sin derivación",
  PENDING: "Derivación pendiente",
  RESOLVED: "Derivación resuelta",
  DISABLED: "Derivación inhabilitada",
  CANCELLED: "Derivación cancelada",
};

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const clientQuery = useClient(id);
  const history = useClientAttentions(id);

  if (clientQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-gray-500">
        <Loader2 size={20} className="animate-spin" /> Cargando cliente...
      </div>
    );
  }
  if (clientQuery.isError) {
    return (
      <div className="mx-auto max-w-5xl rounded-lg bg-red-50 p-6 text-red-700">
        {clientQuery.error instanceof Error
          ? clientQuery.error.message
          : "No se pudo cargar el cliente."}
      </div>
    );
  }
  const client = clientQuery.data;
  if (!client) {
    return (
      <div className="mx-auto max-w-5xl rounded-lg border bg-white p-8 text-center text-gray-600">
        El cliente no existe.
      </div>
    );
  }

  const structuredName = [
    client.firstName,
    client.middleName,
    client.paternalSurname,
    client.maternalSurname,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/clients"
          className="inline-flex items-center text-sm font-medium text-[#1A2855] hover:underline"
        >
          <ArrowLeft size={16} className="mr-1" /> Volver a clientes
        </Link>
        <Link
          to={`/clients/${client.id}/edit`}
          className="btn btn-secondary inline-flex items-center"
        >
          <Pencil size={17} className="mr-2" /> Editar cliente
        </Link>
      </div>

      <section className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span className="w-fit rounded-full bg-blue-50 p-3 text-[#1A2855]">
            <ContactRound size={26} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900">
              {client.displayName}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {client.dni ? `DNI ${client.dni}` : "Cliente registrado sin DNI"}
            </p>
            {structuredName && structuredName !== client.displayName && (
              <p className="mt-2 text-sm text-gray-600">{structuredName}</p>
            )}
          </div>
          <span className="w-fit rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
            {client.attentionCount} RAC
          </span>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Correo</dt>
            <dd className="mt-1 flex items-center gap-1.5 text-sm text-gray-800">
              <Mail size={15} className="text-gray-400" /> {client.email || "Sin correo"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Teléfono</dt>
            <dd className="mt-1 flex items-center gap-1.5 text-sm text-gray-800">
              <Phone size={15} className="text-gray-400" /> {client.phone || "Sin teléfono"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Registrado</dt>
            <dd className="mt-1 text-sm text-gray-800">{formatLocalDate(client.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Actualizado</dt>
            <dd className="mt-1 text-sm text-gray-800">{formatLocalDate(client.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Historial de atenciones</h2>
          <p className="mt-1 text-sm text-gray-500">Incluye RAC activos e inhabilitados relacionados con este cliente.</p>
        </div>

        {!history.isLoading && !history.isError && (
          <Pagination pagination={history.pagination} onPageChange={history.setPage} onLimitChange={history.setLimit} bottom={false} />
        )}

        <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
          {history.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-gray-500"><Loader2 size={19} className="animate-spin" /> Cargando historial...</div>
          ) : history.isError ? (
            <div className="bg-red-50 p-6 text-red-700">{history.error instanceof Error ? history.error.message : "No se pudo cargar el historial."}</div>
          ) : history.attentions.length === 0 ? (
            <div className="p-10 text-center text-gray-400">El cliente todavía no tiene atenciones relacionadas.</div>
          ) : (
            <div className={`divide-y divide-gray-100 ${history.isFetching ? "opacity-60" : ""}`}>
              <div className="hidden grid-cols-12 gap-3 bg-gray-50 px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 lg:grid">
                <div className="col-span-2">Código</div><div className="col-span-2">Medio</div><div className="col-span-2">Solicitante</div><div className="col-span-2">Registro</div><div className="col-span-3">Estado</div><div className="col-span-1 text-right">Acción</div>
              </div>
              {history.attentions.map((attention) => (
                <div key={attention.id} className="p-4 lg:grid lg:grid-cols-12 lg:items-center lg:gap-3 lg:px-5">
                  <div className="font-semibold text-[#1A2855] lg:col-span-2">{attention.racCode}</div>
                  <div className="mt-2 text-sm text-gray-600 lg:col-span-2 lg:mt-0">{attention.serviceChannelName}</div>
                  <div className="mt-2 text-sm text-gray-600 lg:col-span-2 lg:mt-0">{requesterLabels[attention.requesterType]}</div>
                  <div className="mt-2 lg:col-span-2 lg:mt-0"><p className="text-sm text-gray-600">{formatLocalDate(attention.createdAt)}</p><p className="text-xs text-gray-400">{attention.createdByName}</p></div>
                  <div className="mt-3 lg:col-span-3 lg:mt-0"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${attention.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{attention.status === "ACTIVE" ? "Activa" : "Inhabilitada"}</span><p className="mt-1 text-xs text-gray-500">{referralLabels[attention.referralStatus]}{attention.referralAreaName ? ` · ${attention.referralAreaName}` : ""}</p></div>
                  <div className="mt-3 flex justify-end lg:col-span-1 lg:mt-0"><Link to={`/attentions/${attention.id}`} title="Ver RAC" className="rounded-md p-2 text-blue-600 hover:bg-blue-50"><Eye size={18} /></Link></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!history.isLoading && !history.isError && (
          <Pagination pagination={history.pagination} onPageChange={history.setPage} onLimitChange={history.setLimit} />
        )}
      </section>
    </div>
  );
};

export default ClientDetail;
