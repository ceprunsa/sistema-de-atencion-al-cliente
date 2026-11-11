import { useState, type FormEvent } from "react";
import { ContactRound, Eye, Loader2, Mail, Pencil, Phone, Plus, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import Pagination from "../components/Pagination";
import { useClients } from "../hooks/useClients";
import { formatLocalDate } from "../utils/dateUtils";

const Clients = () => {
  const {
    clients,
    pagination,
    search,
    isLoading,
    isFetching,
    isError,
    error,
    setPage,
    setLimit,
    setSearch,
  } = useClients();
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
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Consulta los clientes registrados por DNI, nombres o apellidos.
          </p>
        </div>
        <Link to="/clients/new" className="btn btn-primary inline-flex items-center justify-center">
          <Plus size={18} className="mr-2" /> Nuevo cliente
        </Link>
      </div>

      <form
        onSubmit={handleSearch}
        className="mb-5 rounded-lg border border-gray-100 bg-white p-4 shadow-sm"
      >
        <label
          htmlFor="clientSearch"
          className="block text-sm font-medium text-gray-700"
        >
          Buscar cliente
        </label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              id="clientSearch"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Ej. 12345678, Quispe o María"
              maxLength={120}
              className="block w-full rounded-md border-gray-300 pl-9 pr-9 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-secondary inline-flex items-center justify-center"
          >
            <Search size={17} className="mr-2" />
            Buscar
          </button>
        </div>
      </form>

      {!isLoading && !isError && (
        <Pagination
          pagination={pagination}
          onPageChange={setPage}
          onLimitChange={setLimit}
          bottom={false}
        />
      )}

      <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-gray-500">
            <Loader2 size={20} className="animate-spin" />
            Cargando clientes...
          </div>
        ) : isError ? (
          <div className="bg-red-50 p-6 text-red-700">
            {error instanceof Error
              ? error.message
              : "No se pudieron cargar los clientes."}
          </div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            {search
              ? "No se encontraron clientes con ese criterio."
              : "Todavía no hay clientes registrados."}
          </div>
        ) : (
          <div
            className={`divide-y divide-gray-100 ${isFetching ? "opacity-60" : ""}`}
          >
            <div className="hidden grid-cols-12 gap-3 bg-gray-50 px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 lg:grid">
              <div className="col-span-3">Cliente</div>
              <div className="col-span-3">Contacto</div>
              <div className="col-span-2">Atenciones</div>
              <div className="col-span-3">Última actualización</div>
              <div className="col-span-1 text-right">Acción</div>
            </div>
            {clients.map((client) => (
              <div
                key={client.id}
                className="p-4 transition-colors hover:bg-gray-50 lg:grid lg:grid-cols-12 lg:items-center lg:gap-3 lg:px-5"
              >
                <div className="lg:col-span-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-full bg-blue-50 p-2 text-[#1A2855]">
                      <ContactRound size={18} />
                    </span>
                    <div className="min-w-0">
                      <Link to={`/clients/${client.id}`} className="font-semibold text-gray-900 hover:text-[#1A2855] hover:underline">{client.displayName}</Link>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {client.dni ? `DNI ${client.dni}` : "Cliente sin DNI"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-600 lg:col-span-3 lg:mt-0">
                  <p className="flex items-center gap-1.5">
                    <Mail size={14} className="shrink-0 text-gray-400" />
                    <span className="truncate">{client.email || "Sin correo"}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Phone size={14} className="shrink-0 text-gray-400" />
                    <span>{client.phone || "Sin teléfono"}</span>
                  </p>
                </div>
                <div className="mt-3 lg:col-span-2 lg:mt-0">
                  <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                    {client.attentionCount} RAC
                  </span>
                </div>
                <div className="mt-3 text-sm text-gray-600 lg:col-span-3 lg:mt-0">
                  {formatLocalDate(client.updatedAt)}
                </div>
                <div className="mt-3 flex justify-end lg:col-span-1 lg:mt-0">
                  <Link to={`/clients/${client.id}`} title="Ver cliente" className="rounded-md p-2 text-blue-600 hover:bg-blue-50">
                    <Eye size={18} />
                  </Link>
                  <Link to={`/clients/${client.id}/edit`} title="Editar cliente" className="rounded-md p-2 text-blue-600 hover:bg-blue-50">
                    <Pencil size={18} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isLoading && !isError && (
        <Pagination
          pagination={pagination}
          onPageChange={setPage}
          onLimitChange={setLimit}
        />
      )}
    </div>
  );
};

export default Clients;
