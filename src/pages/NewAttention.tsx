import { useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ClipboardPlus,
  Search,
  UserCheck,
  UserPlus,
} from "lucide-react";
import toast from "react-hot-toast";
import SpeechConclusionField from "../components/SpeechConclusionField";
import { useNewAttention } from "../hooks/useNewAttention";
import type {
  AttentionRequesterType,
  Client,
  CreatedCustomerAttention,
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

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";

const NewAttention = () => {
  const {
    catalogs,
    isLoadingCatalogs,
    isErrorCatalogs,
    findClient,
    isSearchingClient,
    createAttention,
    isCreating,
  } = useNewAttention();

  const [dni, setDni] = useState("");
  const [lookupCompleted, setLookupCompleted] = useState(false);
  const [existingClient, setExistingClient] = useState<Client | null>(null);
  const [client, setClient] = useState<ClientForm>(EMPTY_CLIENT);
  const [serviceChannelId, setServiceChannelId] = useState("");
  const [requesterType, setRequesterType] =
    useState<AttentionRequesterType>("APPLICANT");
  const [kinshipTypeId, setKinshipTypeId] = useState("");
  const [requesterDetail, setRequesterDetail] = useState("");
  const [kinshipDetail, setKinshipDetail] = useState("");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [conclusion, setConclusion] = useState("");
  const [destinationAreaId, setDestinationAreaId] = useState("");
  const [createdAttention, setCreatedAttention] =
    useState<CreatedCustomerAttention | null>(null);

  const topicsByType = useMemo(
    () =>
      (catalogs?.consultationTypes || []).map((type) => ({
        ...type,
        topics: (catalogs?.consultationTopics || []).filter(
          (topic) => topic.consultationTypeId === type.id,
        ),
      })),
    [catalogs],
  );

  const resetClientLookup = (nextDni = "") => {
    setDni(nextDni);
    setLookupCompleted(false);
    setExistingClient(null);
    setClient(EMPTY_CLIENT);
  };

  const resetForm = () => {
    resetClientLookup();
    setServiceChannelId("");
    setRequesterType("APPLICANT");
    setKinshipTypeId("");
    setRequesterDetail("");
    setKinshipDetail("");
    setSelectedTopicIds([]);
    setConclusion("");
    setDestinationAreaId("");
    setCreatedAttention(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDniChange = (value: string) => {
    resetClientLookup(value.replace(/\D/g, "").slice(0, 8));
    setCreatedAttention(null);
  };

  const handleSearchClient = async () => {
    if (!/^\d{8}$/.test(dni)) {
      toast.error("Ingresa un DNI válido de 8 dígitos.");
      return;
    }

    try {
      const found = await findClient(dni);
      setExistingClient(found);
      setLookupCompleted(true);
      setClient(
        found
          ? {
              firstName: found.firstName,
              middleName: found.middleName || "",
              paternalSurname: found.paternalSurname,
              maternalSurname: found.maternalSurname,
              email: found.email || "",
              phone: found.phone || "",
            }
          : EMPTY_CLIENT,
      );
      toast.success(
        found
          ? "Cliente encontrado. Sus datos fueron cargados."
          : "DNI no registrado. Completa los datos del nuevo cliente.",
      );
    } catch (error) {
      setLookupCompleted(false);
      toast.error(getErrorMessage(error));
    }
  };

  const updateClient = (field: keyof ClientForm, value: string) => {
    setClient((current) => ({ ...current, [field]: value }));
  };

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((current) =>
      current.includes(topicId)
        ? current.filter((id) => id !== topicId)
        : [...current, topicId],
    );
  };

  const handleRequesterChange = (value: AttentionRequesterType) => {
    setRequesterType(value);
    setKinshipTypeId("");
    setKinshipDetail("");
    setRequesterDetail("");
  };

  const selectedKinship = catalogs?.kinshipTypes.find(
    (kinship) => kinship.id === kinshipTypeId,
  );
  const isOtherKinship = selectedKinship?.name.trim().toLowerCase() === "otro";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!lookupCompleted) {
      toast.error("Primero busca el DNI del cliente.");
      return;
    }
    if (!existingClient && (!client.firstName.trim() || !client.paternalSurname.trim() || !client.maternalSurname.trim())) {
      toast.error("El primer nombre y ambos apellidos son obligatorios.");
      return;
    }
    if (!serviceChannelId) {
      toast.error("Selecciona un medio de atención.");
      return;
    }
    if (requesterType === "RELATIVE" && !kinshipTypeId) {
      toast.error("Selecciona el parentesco del familiar.");
      return;
    }
    if (requesterType === "RELATIVE" && isOtherKinship && !kinshipDetail.trim()) {
      toast.error("Especifica el parentesco del familiar.");
      return;
    }
    if (requesterType === "OTHER" && !requesterDetail.trim()) {
      toast.error("Especifica quién realiza la consulta.");
      return;
    }
    if (selectedTopicIds.length === 0) {
      toast.error("Selecciona al menos un tema de consulta.");
      return;
    }

    const selectedTopics = (catalogs?.consultationTopics || []).filter((topic) =>
      selectedTopicIds.includes(topic.id),
    );
    if (!conclusion.trim()) {
      toast.error("La conclusión de la atención es obligatoria.");
      return;
    }

    try {
      const result = await createAttention({
        client: {
          dni,
          firstName: client.firstName.trim(),
          middleName: client.middleName.trim() || null,
          paternalSurname: client.paternalSurname.trim(),
          maternalSurname: client.maternalSurname.trim(),
          email: client.email.trim() || null,
          phone: client.phone.trim() || null,
        },
        serviceChannelId,
        requesterType,
        kinshipTypeId: requesterType === "RELATIVE" ? kinshipTypeId : null,
        requesterDetail: requesterType === "OTHER" ? requesterDetail.trim() : null,
        kinshipDetail:
          requesterType === "RELATIVE" && isOtherKinship
            ? kinshipDetail.trim()
            : null,
        conclusion: conclusion.trim(),
        topics: selectedTopics.map((topic) => ({ topicId: topic.id })),
        destinationAreaId: destinationAreaId || null,
      });
      setCreatedAttention(result);
      toast.success(`Atención ${result.racCode} registrada correctamente.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  if (isLoadingCatalogs) {
    return <div className="py-16 text-center text-gray-500">Cargando formulario de atención...</div>;
  }

  if (isErrorCatalogs || !catalogs) {
    return (
      <div className="max-w-4xl mx-auto rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        No se pudieron cargar los catálogos de atención. Verifica que el SQL 03_customer_service.sql esté instalado en Supabase.
      </div>
    );
  }

  if (createdAttention) {
    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 size={56} className="mx-auto text-green-600" />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Atención registrada</h1>
          <p className="mt-2 text-gray-500">El código asignado es:</p>
          <p className="mt-2 text-3xl font-bold tracking-wide text-[#1A2855]">
            {createdAttention.racCode}
          </p>
          <button type="button" onClick={resetForm} className="btn btn-primary mt-7 inline-flex items-center">
            <ClipboardPlus size={18} className="mr-2" />
            Registrar otra atención
          </button>
        </div>
      </div>
    );
  }

  const clientInputsDisabled = !lookupCompleted || !!existingClient;

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Nueva atención</h1>
        <p className="mt-1 text-sm text-gray-500">
          Busca al cliente por DNI y registra los detalles de la atención.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Search size={20} className="text-[#1A2855]" />
            <h2 className="font-semibold text-gray-900">1. Identificación del cliente</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label htmlFor="dni" className="block text-sm font-medium text-gray-700">DNI</label>
              <input
                id="dni"
                value={dni}
                onChange={(event) => handleDniChange(event.target.value)}
                inputMode="numeric"
                maxLength={8}
                placeholder="8 dígitos"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={handleSearchClient}
              disabled={isSearchingClient}
              className="btn btn-primary inline-flex items-center justify-center disabled:opacity-60"
            >
              <Search size={17} className="mr-2" />
              {isSearchingClient ? "Buscando..." : "Buscar cliente"}
            </button>
          </div>

          {lookupCompleted && (
            <div className={`mt-4 flex items-center gap-2 rounded-md p-3 text-sm ${existingClient ? "bg-green-50 text-green-800" : "bg-blue-50 text-blue-800"}`}>
              {existingClient ? <UserCheck size={18} /> : <UserPlus size={18} />}
              {existingClient
                ? "Cliente existente: los datos se muestran solo para consulta."
                : "Cliente nuevo: completa sus datos personales."}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              ["firstName", "Primer nombre *"],
              ["middleName", "Segundo nombre"],
              ["paternalSurname", "Apellido paterno *"],
              ["maternalSurname", "Apellido materno *"],
              ["email", "Correo electrónico"],
              ["phone", "Teléfono"],
            ] as const).map(([field, label]) => (
              <div key={field}>
                <label htmlFor={field} className="block text-sm font-medium text-gray-700">{label}</label>
                <input
                  id={field}
                  type={field === "email" ? "email" : "text"}
                  value={client[field]}
                  onChange={(event) => updateClient(field, event.target.value)}
                  disabled={clientInputsDisabled}
                  required={!existingClient && ["firstName", "paternalSurname", "maternalSurname"].includes(field)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm disabled:bg-gray-100 disabled:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </section>

        <fieldset disabled={!lookupCompleted || isCreating} className="space-y-6 disabled:opacity-60">
          <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">2. Datos de la atención</h2>
            {catalogs.serviceChannels.length === 0 ? (
              <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                No hay medios de atención activos. Un administrador debe crear o reactivar uno antes de registrar atenciones.
              </div>
            ) : (
              <div>
                <label htmlFor="serviceChannel" className="block text-sm font-medium text-gray-700">Medio de atención *</label>
                <select
                  id="serviceChannel"
                  value={serviceChannelId}
                  onChange={(event) => setServiceChannelId(event.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Selecciona un medio</option>
                  {catalogs.serviceChannels.map((channel) => (
                    <option key={channel.id} value={channel.id}>{channel.name} — {channel.detail}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-5">
              <span className="block text-sm font-medium text-gray-700">¿Quién solicita la atención? *</span>
              <div className="mt-2 flex flex-wrap gap-5">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="requester" checked={requesterType === "APPLICANT"} onChange={() => handleRequesterChange("APPLICANT")} />
                  Postulante
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="requester" checked={requesterType === "RELATIVE"} onChange={() => handleRequesterChange("RELATIVE")} />
                  Familiar
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="requester" checked={requesterType === "OTHER"} onChange={() => handleRequesterChange("OTHER")} />
                  Otro
                </label>
              </div>
            </div>

            {requesterType === "RELATIVE" && (
              <div className="mt-4">
                <label htmlFor="kinship" className="block text-sm font-medium text-gray-700">Parentesco *</label>
                <select id="kinship" value={kinshipTypeId} onChange={(event) => { setKinshipTypeId(event.target.value); setKinshipDetail(""); }} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                  <option value="">Selecciona el parentesco</option>
                  {catalogs.kinshipTypes.map((kinship) => <option key={kinship.id} value={kinship.id}>{kinship.name}</option>)}
                </select>
                {isOtherKinship && (
                  <div className="mt-3">
                    <label htmlFor="kinshipDetail" className="block text-sm font-medium text-gray-700">Especifica el parentesco *</label>
                    <input id="kinshipDetail" value={kinshipDetail} onChange={(event) => setKinshipDetail(event.target.value)} required maxLength={150} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
                  </div>
                )}
              </div>
            )}
            {requesterType === "OTHER" && (
              <div className="mt-4">
                <label htmlFor="requesterDetail" className="block text-sm font-medium text-gray-700">Especifica quién realiza la consulta *</label>
                <input id="requesterDetail" value={requesterDetail} onChange={(event) => setRequesterDetail(event.target.value)} required maxLength={150} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900">3. Temas consultados *</h2>
            <p className="mt-1 text-sm text-gray-500">Puedes seleccionar uno o varios temas.</p>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {topicsByType.map((type) => (
                <div key={type.id} className="rounded-md border border-gray-200 p-4">
                  <h3 className="font-medium text-gray-800">{type.name}</h3>
                  <div className="mt-3 space-y-3">
                    {type.topics.map((topic) => {
                      const selected = selectedTopicIds.includes(topic.id);
                      return (
                        <div key={topic.id}>
                          <label className="flex items-start gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={selected} onChange={() => toggleTopic(topic.id)} className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                            <span>{topic.name}</span>
                          </label>
                        </div>
                      );
                    })}
                    {type.topics.length === 0 && <p className="text-sm text-gray-400">Sin temas disponibles.</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">4. Resultado y derivación</h2>
            <div>
              <label htmlFor="destinationArea" className="block text-sm font-medium text-gray-700">Derivar a un área (opcional)</label>
              <select id="destinationArea" value={destinationAreaId} onChange={(event) => setDestinationAreaId(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <option value="">Sin derivación</option>
                {catalogs.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
              </select>
            </div>
            <div className="mt-4">
              <SpeechConclusionField id="conclusion" value={conclusion} onChange={setConclusion} />
            </div>
          </section>
        </fieldset>

        <div className="flex justify-end">
          <button type="submit" disabled={!lookupCompleted || isCreating || catalogs.serviceChannels.length === 0} className="btn btn-primary inline-flex items-center disabled:opacity-60">
            <ClipboardPlus size={18} className="mr-2" />
            {isCreating ? "Registrando..." : "Registrar atención"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewAttention;
