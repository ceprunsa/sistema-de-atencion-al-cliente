import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Link2,
  Loader2,
  MessageSquareWarning,
  Search,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import ClientIdentityCard from "../components/ClientIdentityCard";
import { useNewComplaint } from "../hooks/useNewComplaint";
import type {
  Client,
  ComplaintAttentionMatch,
  CreatedComplaint,
} from "../types";

type ClientForm = {
  firstName: string;
  middleName: string;
  paternalSurname: string;
  maternalSurname: string;
  email: string;
  phone: string;
};

const EMPTY_CLIENT: ClientForm = {
  firstName: "",
  middleName: "",
  paternalSurname: "",
  maternalSurname: "",
  email: "",
  phone: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";

const NewComplaint = () => {
  const {
    catalogs,
    isLoadingCatalogs,
    isErrorCatalogs,
    catalogsError,
    refetchCatalogs,
    findClient,
    isSearchingClient,
    findAttention,
    isSearchingAttention,
    createComplaint,
    isCreating,
  } = useNewComplaint();

  const [linkMode, setLinkMode] = useState<"INDEPENDENT" | "RAC">("INDEPENDENT");
  const [racCode, setRacCode] = useState("");
  const [linkedAttention, setLinkedAttention] =
    useState<ComplaintAttentionMatch | null>(null);
  const [dni, setDni] = useState("");
  const [lookupCompleted, setLookupCompleted] = useState(false);
  const [lookupSource, setLookupSource] =
    useState<"LOCAL" | "EXTERNAL" | "MANUAL" | "RAC" | null>(null);
  const [existingClient, setExistingClient] = useState<Client | null>(null);
  const [client, setClient] = useState<ClientForm>(EMPTY_CLIENT);
  const [serviceChannelId, setServiceChannelId] = useState("");
  const [responsibleAreaId, setResponsibleAreaId] = useState("");
  const [description, setDescription] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [createdComplaint, setCreatedComplaint] =
    useState<CreatedComplaint | null>(null);

  const resetIdentity = () => {
    setRacCode("");
    setLinkedAttention(null);
    setDni("");
    setLookupCompleted(false);
    setLookupSource(null);
    setExistingClient(null);
    setClient(EMPTY_CLIENT);
  };

  const applyClient = (selected: Client, source: "LOCAL" | "RAC") => {
    setDni(selected.dni || "");
    setExistingClient(selected);
    setClient({
      firstName: selected.firstName || "",
      middleName: selected.middleName || "",
      paternalSurname: selected.paternalSurname || "",
      maternalSurname: selected.maternalSurname || "",
      email: selected.email || "",
      phone: selected.phone || "",
    });
    setLookupSource(source);
    setLookupCompleted(true);
  };

  const handleSearchDni = async () => {
    const normalizedDni = dni.replace(/\D/g, "");
    if (!/^\d{8}$/.test(normalizedDni)) {
      toast.error("Ingresa un DNI válido de 8 dígitos.");
      return;
    }
    try {
      const result = await findClient(normalizedDni);
      setDni(normalizedDni);
      if (result.source === "LOCAL") {
        applyClient(result.client, "LOCAL");
        toast.success("Cliente encontrado.");
        return;
      }
      setExistingClient(null);
      setLookupSource(result.source);
      setLookupCompleted(true);
      setClient(
        result.source === "EXTERNAL"
          ? {
              ...EMPTY_CLIENT,
              firstName: result.person.firstName,
              middleName: result.person.middleName || "",
              paternalSurname: result.person.paternalSurname,
              maternalSurname: result.person.maternalSurname,
            }
          : EMPTY_CLIENT,
      );
      toast(
        result.source === "EXTERNAL"
          ? "DNI encontrado. Completa el correo de contacto."
          : result.message,
        { icon: "ℹ️" },
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleSearchRac = async () => {
    const normalizedCode = racCode.trim().toUpperCase();
    if (!/^RAC-\d+-\d{4}$/.test(normalizedCode)) {
      toast.error("Ingresa un código RAC válido, por ejemplo RAC-001-2026.");
      return;
    }
    try {
      const result = await findAttention(normalizedCode);
      if (!result) {
        toast.error("No existe un RAC activo con ese código.");
        return;
      }
      setRacCode(result.racCode);
      setLinkedAttention(result);
      applyClient(result.client, "RAC");
      toast.success("RAC y cliente vinculados.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const updateClient = (field: keyof ClientForm, value: string) => {
    setClient((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = client.email.trim().toLowerCase();
    if (!lookupCompleted || !/^\d{8}$/.test(dni)) {
      toast.error("Primero identifica al cliente mediante su DNI.");
      return;
    }
    if (linkMode === "RAC" && !linkedAttention) {
      toast.error("Busca y selecciona el RAC que se vinculará.");
      return;
    }
    if (
      !client.firstName.trim()
      || !client.paternalSurname.trim()
      || !client.maternalSurname.trim()
    ) {
      toast.error("Completa el primer nombre y ambos apellidos.");
      return;
    }
    if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254) {
      toast.error("Registra un correo electrónico válido.");
      return;
    }
    if (!serviceChannelId || !responsibleAreaId) {
      toast.error("Selecciona el medio y el área responsable.");
      return;
    }
    if (!description.trim() || description.trim().length > 10_000) {
      toast.error("La descripción es obligatoria y admite hasta 10 000 caracteres.");
      return;
    }

    try {
      const result = await createComplaint({
        requestId,
        client: {
          id: existingClient?.id || null,
          dni,
          firstName: client.firstName.trim(),
          middleName: client.middleName.trim() || null,
          paternalSurname: client.paternalSurname.trim(),
          maternalSurname: client.maternalSurname.trim(),
          email: normalizedEmail,
          phone: client.phone.trim() || null,
        },
        attentionId: linkedAttention?.attentionId || null,
        serviceChannelId,
        responsibleAreaId,
        description: description.trim(),
      });
      setCreatedComplaint(result);
      toast.success(
        result.reusedRequest
          ? "La queja " + result.complaintCode + " ya había sido registrada."
          : "Queja " + result.complaintCode + " registrada correctamente.",
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const startAnother = () => {
    resetIdentity();
    setServiceChannelId("");
    setResponsibleAreaId("");
    setDescription("");
    setRequestId(crypto.randomUUID());
    setCreatedComplaint(null);
  };

  if (isLoadingCatalogs) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
        <Loader2 size={20} className="animate-spin" />
        Preparando el registro de quejas...
      </div>
    );
  }

  if (isErrorCatalogs || !catalogs) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0" size={22} />
          <div>
            <h1 className="font-semibold">No se pudo preparar el formulario</h1>
            <p className="mt-1 text-sm">{getErrorMessage(catalogsError)}</p>
            <button type="button" onClick={() => void refetchCatalogs()} className="btn btn-secondary mt-4">
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!catalogs.canCreate || !catalogs.closureArea) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0" size={22} />
          <div>
            <h1 className="font-semibold">Registro de quejas no disponible</h1>
            <p className="mt-1 text-sm">
              Un administrador debe configurar primero un área activa para el
              seguimiento y cierre de quejas.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (createdComplaint) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-green-200 bg-green-50 p-7 text-green-900">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 shrink-0" size={26} />
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Queja registrada</h1>
            <p className="mt-2">
              Código público:{" "}
              <strong className="text-lg">{createdComplaint.complaintCode}</strong>
            </p>
            <p className="mt-2 text-sm">
              El aviso al correo grupal del área responsable quedó en la cola
              de envío. No se envió ningún correo al cliente.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={startAnother} className="btn btn-primary">
                Registrar otra queja
              </button>
              <Link to="/dashboard" className="btn btn-secondary">
                Volver al dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const clientFields = [
    ["firstName", "Primer nombre *"],
    ["middleName", "Segundo nombre"],
    ["paternalSurname", "Apellido paterno *"],
    ["maternalSurname", "Apellido materno *"],
  ] as const;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <MessageSquareWarning className="text-[#1A2855]" />
          Registrar queja
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Área de cierre configurada:{" "}
          <strong>{catalogs.closureArea.name}</strong>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Link2 size={20} className="text-[#1A2855]" />
            <h2 className="font-semibold text-gray-900">1. Origen de la queja</h2>
          </div>
          <div className="flex flex-wrap gap-5">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" checked={linkMode === "INDEPENDENT"} onChange={() => { setLinkMode("INDEPENDENT"); resetIdentity(); }} />
              Queja independiente
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" checked={linkMode === "RAC"} onChange={() => { setLinkMode("RAC"); resetIdentity(); }} />
              Vincular a un RAC
            </label>
          </div>

          {linkMode === "RAC" && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Código RAC</label>
                <input
                  value={racCode}
                  onChange={(event) => {
                    setRacCode(event.target.value.toUpperCase());
                    setLinkedAttention(null);
                    setLookupCompleted(false);
                    setExistingClient(null);
                  }}
                  placeholder="RAC-001-2026"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                />
              </div>
              <button type="button" onClick={() => void handleSearchRac()} disabled={isSearchingAttention} className="btn btn-secondary inline-flex items-center disabled:opacity-60">
                <FileSearch size={17} className="mr-2" />
                {isSearchingAttention ? "Buscando..." : "Buscar RAC"}
              </button>
            </div>
          )}

          {linkedAttention && (
            <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              RAC <strong>{linkedAttention.racCode}</strong> vinculado. El cliente se obtuvo directamente de esa atención.
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Search size={20} className="text-[#1A2855]" />
            <h2 className="font-semibold text-gray-900">2. Identificación del cliente</h2>
          </div>

          {linkMode === "INDEPENDENT" && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">DNI *</label>
                <input
                  value={dni}
                  onChange={(event) => {
                    setDni(event.target.value.replace(/\D/g, "").slice(0, 8));
                    setLookupCompleted(false);
                    setExistingClient(null);
                    setLookupSource(null);
                  }}
                  inputMode="numeric"
                  maxLength={8}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                />
              </div>
              <button type="button" onClick={() => void handleSearchDni()} disabled={isSearchingClient} className="btn btn-primary inline-flex items-center disabled:opacity-60">
                <Search size={17} className="mr-2" />
                {isSearchingClient ? "Consultando..." : "Consultar DNI"}
              </button>
            </div>
          )}

          {lookupCompleted && (
            <>
              <div className="mt-4 flex items-center gap-2 rounded-md bg-blue-50 p-3 text-sm text-blue-800">
                {existingClient ? <UserCheck size={18} /> : <UserPlus size={18} />}
                {lookupSource === "RAC"
                  ? "Cliente obtenido del RAC."
                  : existingClient
                    ? "Cliente existente. Sus nombres registrados se conservarán."
                    : "Se creará un cliente con los datos mostrados."}
              </div>
              {existingClient && <div className="mt-4"><ClientIdentityCard client={existingClient} /></div>}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">DNI *</label>
                  <input value={dni} readOnly className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm" />
                </div>
                {clientFields.map(([field, label]) => (
                  <div key={field}>
                    <label className="block text-sm font-medium text-gray-700">{label}</label>
                    <input
                      value={client[field]}
                      onChange={(event) => updateClient(field, event.target.value)}
                      readOnly={Boolean(existingClient?.[field]?.trim())}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm read-only:bg-gray-100"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Correo electrónico de contacto *</label>
                  <input type="email" value={client.email} onChange={(event) => updateClient("email", event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                  {existingClient && <p className="mt-1 text-xs text-gray-500">Si lo cambias, se actualizará el correo de contacto del cliente existente.</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                  <input value={client.phone} onChange={(event) => updateClient("phone", event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>
              </div>
            </>
          )}
        </section>

        <fieldset disabled={!lookupCompleted || isCreating} className="space-y-6 disabled:opacity-60">
          <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-gray-900">3. Datos de la queja</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Medio de recepción *</label>
                <select value={serviceChannelId} onChange={(event) => setServiceChannelId(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                  <option value="">Selecciona un medio</option>
                  {catalogs.serviceChannels.map((channel) => (
                    <option key={channel.id} value={channel.id}>{channel.name} — {channel.detail}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Área responsable *</label>
                <select value={responsibleAreaId} onChange={(event) => setResponsibleAreaId(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
                  <option value="">Selecciona un área</option>
                  {catalogs.responsibleAreas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Descripción de la queja *</label>
              <textarea rows={8} maxLength={10_000} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 block w-full resize-y rounded-md border-gray-300 shadow-sm" />
              <p className="mt-1 text-right text-xs text-gray-500">{description.length.toLocaleString()} / 10 000</p>
            </div>
          </section>

          <div className="flex justify-end">
            <button type="submit" disabled={isCreating} className="btn btn-primary inline-flex items-center disabled:opacity-60">
              {isCreating ? <Loader2 size={17} className="mr-2 animate-spin" /> : <MessageSquareWarning size={17} className="mr-2" />}
              {isCreating ? "Registrando..." : "Registrar queja"}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
};

export default NewComplaint;
