import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, Loader2, Save, Search } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import ConfirmModal from "../components/ConfirmModal";
import ClientIdentityCard from "../components/ClientIdentityCard";
import { useClientIdentification } from "../hooks/useClientIdentification";
import { useClient, useClientActions } from "../hooks/useClients";
import type { Client, ClientInput, ClientLookupResult } from "../types";

const EMPTY_CLIENT: ClientInput = {
  dni: "",
  displayName: "",
  firstName: "",
  middleName: "",
  paternalSurname: "",
  maternalSurname: "",
  email: "",
  phone: "",
};

const ClientForm = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clientQuery = useClient(id);
  const { createClient, updateClient, isSaving } = useClientActions();
  const { findClient, isSearchingClient } = useClientIdentification();
  const [form, setForm] = useState<ClientInput>(EMPTY_CLIENT);
  const [loadedClientId, setLoadedClientId] = useState<string | null>(null);
  const [pendingDniChange, setPendingDniChange] = useState<ClientInput | null>(null);
  const [lookupCompleted, setLookupCompleted] = useState(false);
  const [lookupDni, setLookupDni] = useState("");
  const [lookupSource, setLookupSource] = useState<ClientLookupResult["source"] | null>(null);
  const [existingClient, setExistingClient] = useState<Client | null>(null);

  useEffect(() => {
    const client = clientQuery.data;
    if (!client || loadedClientId === client.id) return;
    setForm({
      dni: client.dni || "",
      displayName: client.displayName,
      firstName: client.firstName || "",
      middleName: client.middleName || "",
      paternalSurname: client.paternalSurname || "",
      maternalSurname: client.maternalSurname || "",
      email: client.email || "",
      phone: client.phone || "",
    });
    setLoadedClientId(client.id);
  }, [clientQuery.data, loadedClientId]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    const nextValue = name === "dni" ? value.replace(/\D/g, "").slice(0, 8) : value;
    if (!id && name === "dni" && nextValue !== lookupDni) {
      setLookupCompleted(false);
      setLookupSource(null);
      setExistingClient(null);
    }
    setForm((current) => ({
      ...current,
      [name]: nextValue,
    }));
  };

  const handleDniLookup = async () => {
    const dni = form.dni.trim();
    if (!/^\d{8}$/.test(dni)) {
      toast.error("Ingresa un DNI válido de 8 dígitos.");
      return;
    }

    try {
      const result = await findClient(dni);
      setLookupCompleted(true);
      setLookupDni(dni);
      setLookupSource(result.source);

      if (result.source === "LOCAL") {
        setExistingClient(result.client);
        toast("El DNI ya pertenece a un cliente registrado.", { icon: "ℹ️" });
        return;
      }

      setExistingClient(null);
      if (result.source === "EXTERNAL") {
        const displayName = [
          result.person.firstName,
          result.person.middleName,
          result.person.paternalSurname,
          result.person.maternalSurname,
        ]
          .filter(Boolean)
          .join(" ");
        setForm((current) => ({
          ...current,
          dni,
          displayName,
          firstName: result.person.firstName,
          middleName: result.person.middleName || "",
          paternalSurname: result.person.paternalSurname,
          maternalSurname: result.person.maternalSurname,
        }));
        toast.success("DNI encontrado. Revisa los datos antes de crear el cliente.");
        return;
      }

      toast(result.message, { icon: "ℹ️" });
    } catch (error) {
      setLookupCompleted(true);
      setLookupDni(dni);
      setLookupSource("MANUAL");
      setExistingClient(null);
      toast.error(`${error instanceof Error ? error.message : "No se pudo consultar el DNI."} Ingresa los datos manualmente.`);
    }
  };

  const normalizeAndValidate = (): ClientInput | null => {
    const values: ClientInput = {
      dni: form.dni.trim(),
      displayName: form.displayName.trim(),
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim(),
      paternalSurname: form.paternalSurname.trim(),
      maternalSurname: form.maternalSurname.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
    };
    if (!values.displayName) {
      toast.error("El nombre o denominación del cliente es obligatorio.");
      return null;
    }
    if (values.dni && !/^\d{8}$/.test(values.dni)) {
      toast.error("El DNI debe contener exactamente 8 dígitos.");
      return null;
    }
    if (
      values.dni &&
      (!values.firstName || !values.paternalSurname || !values.maternalSurname)
    ) {
      toast.error("Un cliente con DNI debe tener primer nombre y ambos apellidos.");
      return null;
    }
    if (!values.dni && !values.email) {
      toast.error("Un cliente sin DNI debe tener un correo electrónico válido.");
      return null;
    }
    return values;
  };

  const save = async (values: ClientInput, confirmDniChange: boolean) => {
    try {
      if (id) {
        const saved = await updateClient({ id, values, confirmDniChange });
        toast.success("Cliente actualizado correctamente.");
        navigate(`/clients/${saved.id}`);
      } else {
        const saved = await createClient(values);
        toast.success("Cliente creado correctamente.");
        navigate(`/clients/${saved.id}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el cliente.");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = normalizeAndValidate();
    if (!values) return;

    if (!id && values.dni && (!lookupCompleted || lookupDni !== values.dni)) {
      toast.error("Busca el DNI antes de crear el cliente.");
      return;
    }
    if (!id && existingClient) {
      toast.error("El DNI ya pertenece a un cliente. Puedes consultarlo o editarlo.");
      return;
    }

    const originalDni = clientQuery.data?.dni;
    if (id && originalDni && !values.dni) {
      toast.error("No se puede eliminar un DNI ya registrado.");
      return;
    }
    if (id && originalDni && values.dni !== originalDni) {
      setPendingDniChange(values);
      return;
    }
    void save(values, false);
  };

  const confirmDniChange = () => {
    if (!pendingDniChange) return;
    void save(pendingDniChange, true).finally(() => setPendingDniChange(null));
  };

  if (id && clientQuery.isLoading) {
    return <div className="flex justify-center p-16 text-gray-500"><Loader2 className="animate-spin" /></div>;
  }
  if (id && clientQuery.isError) {
    return <div className="mx-auto max-w-3xl rounded-lg bg-red-50 p-6 text-red-700">{clientQuery.error instanceof Error ? clientQuery.error.message : "No se pudo cargar el cliente."}</div>;
  }
  if (id && !clientQuery.data) {
    return <div className="mx-auto max-w-3xl rounded-lg border bg-white p-8 text-center text-gray-600">El cliente no existe.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link to="/clients" className="mb-5 inline-flex items-center text-sm font-medium text-[#1A2855] hover:underline">
        <ArrowLeft size={16} className="mr-1" /> Volver a clientes
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{id ? "Editar cliente" : "Nuevo cliente"}</h1>
        <p className="mt-1 text-sm text-gray-500">{id ? "Actualiza los datos sin alterar sus RAC relacionados." : "Registra un cliente con DNI o mediante su identidad de correo."}</p>
      </div>

      <form onSubmit={handleSubmit} className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
        <div className="p-6">
          <div className="mb-5 rounded-md bg-blue-50 p-4 text-sm text-blue-800">
            Con DNI se requieren primer nombre y ambos apellidos. Sin DNI se requieren correo y denominación.
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="dni" className="block text-sm font-medium text-gray-700">DNI <span className="text-gray-400">(opcional para correo)</span></label>
              <div className="mt-1 flex gap-2">
                <input id="dni" name="dni" inputMode="numeric" value={form.dni} onChange={handleChange} maxLength={8} className="block min-w-0 flex-1 rounded-md border-gray-300 shadow-sm" />
                {!id && (
                  <button type="button" onClick={() => void handleDniLookup()} disabled={isSearchingClient} className="btn btn-secondary inline-flex items-center whitespace-nowrap disabled:opacity-60">
                    {isSearchingClient ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Search size={16} className="mr-2" />}
                    {isSearchingClient ? "Buscando..." : "Buscar DNI"}
                  </button>
                )}
              </div>
              {!id && lookupSource === "EXTERNAL" && <p className="mt-1 text-xs font-medium text-green-700">Datos encontrados en el servicio DNI. Puedes revisarlos y corregirlos.</p>}
              {!id && lookupSource === "MANUAL" && <p className="mt-1 text-xs font-medium text-amber-700">Consulta no disponible o sin resultados. Completa los datos manualmente.</p>}
            </div>
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">Nombre o denominación *</label>
              <input id="displayName" name="displayName" value={form.displayName} onChange={handleChange} maxLength={250} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
            </div>
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">Primer nombre</label>
              <input id="firstName" name="firstName" value={form.firstName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
            </div>
            <div>
              <label htmlFor="middleName" className="block text-sm font-medium text-gray-700">Segundo nombre <span className="text-gray-400">(opcional)</span></label>
              <input id="middleName" name="middleName" value={form.middleName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
            </div>
            <div>
              <label htmlFor="paternalSurname" className="block text-sm font-medium text-gray-700">Apellido paterno</label>
              <input id="paternalSurname" name="paternalSurname" value={form.paternalSurname} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
            </div>
            <div>
              <label htmlFor="maternalSurname" className="block text-sm font-medium text-gray-700">Apellido materno</label>
              <input id="maternalSurname" name="maternalSurname" value={form.maternalSurname} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Correo electrónico</label>
              <input id="email" name="email" type="email" value={form.email} onChange={handleChange} maxLength={254} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Teléfono <span className="text-gray-400">(opcional)</span></label>
              <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
            </div>
          </div>
          {!id && existingClient && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="mb-3 text-sm font-semibold text-amber-900">Este DNI ya pertenece a un cliente. No se creará un duplicado.</p>
              <ClientIdentityCard client={existingClient} />
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Link to={`/clients/${existingClient.id}`} className="btn btn-secondary">Ver cliente</Link>
                <Link to={`/clients/${existingClient.id}/edit`} className="btn btn-primary">Editar cliente</Link>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 bg-gray-50 px-6 py-4">
          <button type="button" onClick={() => navigate("/clients")} className="btn btn-secondary">Cancelar</button>
          <button type="submit" disabled={isSaving || isSearchingClient || !!existingClient} className="btn btn-primary inline-flex items-center disabled:opacity-60">
            {isSaving ? <Loader2 size={17} className="mr-2 animate-spin" /> : <Save size={17} className="mr-2" />}
            {isSaving ? "Guardando..." : "Guardar cliente"}
          </button>
        </div>
      </form>

      <ConfirmModal
        isOpen={!!pendingDniChange}
        onClose={() => setPendingDniChange(null)}
        onConfirm={confirmDniChange}
        title="Confirmar corrección de DNI"
        message={`El DNI cambiará de ${clientQuery.data?.dni || "sin DNI"} a ${pendingDniChange?.dni || "sin DNI"}. Los RAC existentes permanecerán relacionados con este cliente.`}
        confirmLabel="Corregir DNI"
        isDanger
        isLoading={isSaving}
      />
    </div>
  );
};

export default ClientForm;
