import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import SpeechConclusionField from "../components/SpeechConclusionField";
import { attentionsApi } from "../api/attentions";
import { useAttention, useAttentionActions } from "../hooks/useAttentions";
import { useAuth } from "../hooks/useAuth";
import type { AttentionRequesterType } from "../types";

type ClientFields = {
  firstName: string;
  middleName: string;
  paternalSurname: string;
  maternalSurname: string;
  email: string;
  phone: string;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo actualizar la atención.";

const EditAttention = () => {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const attentionQuery = useAttention(id);
  const catalogsQuery = useQuery({
    queryKey: ["attentions", "edit", "catalogs"],
    queryFn: attentionsApi.getEditAttentionCatalogs,
  });
  const { updateAttention, isUpdating } = useAttentionActions();

  const [initialized, setInitialized] = useState(false);
  const [client, setClient] = useState<ClientFields>({ firstName: "", middleName: "", paternalSurname: "", maternalSurname: "", email: "", phone: "" });
  const [serviceChannelId, setServiceChannelId] = useState("");
  const [requesterType, setRequesterType] = useState<AttentionRequesterType>("APPLICANT");
  const [kinshipTypeId, setKinshipTypeId] = useState("");
  const [requesterDetail, setRequesterDetail] = useState("");
  const [kinshipDetail, setKinshipDetail] = useState("");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [conclusion, setConclusion] = useState("");
  const [destinationAreaId, setDestinationAreaId] = useState("");

  const attention = attentionQuery.data;
  const catalogs = catalogsQuery.data;

  useEffect(() => {
    if (!attention || initialized) return;
    setClient({
      firstName: attention.client.firstName,
      middleName: attention.client.middleName || "",
      paternalSurname: attention.client.paternalSurname,
      maternalSurname: attention.client.maternalSurname,
      email: attention.client.email || "",
      phone: attention.client.phone || "",
    });
    setServiceChannelId(attention.serviceChannelId);
    setRequesterType(attention.requesterType);
    setKinshipTypeId(attention.kinshipTypeId || "");
    setRequesterDetail(attention.requesterDetail || "");
    setKinshipDetail(attention.kinshipDetail || "");
    setSelectedTopicIds(attention.topics.map((topic) => topic.id));
    setConclusion(attention.conclusion);
    setDestinationAreaId(attention.referral?.destinationAreaId || "");
    setInitialized(true);
  }, [attention, initialized]);

  const topicGroups = useMemo(() => {
    if (!catalogs) return [];
    return catalogs.consultationTypes
      .map((type) => ({
        ...type,
        topics: catalogs.consultationTopics.filter((topic) => topic.consultationTypeId === type.id && (topic.isActive || selectedTopicIds.includes(topic.id))),
      }))
      .filter((type) => type.topics.length > 0);
  }, [catalogs, selectedTopicIds]);

  const updateClient = (field: keyof ClientFields, value: string) =>
    setClient((current) => ({ ...current, [field]: value }));

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((current) =>
      current.includes(topicId) ? current.filter((value) => value !== topicId) : [...current, topicId],
    );
  };

  const handleRequesterChange = (value: AttentionRequesterType) => {
    setRequesterType(value);
    setKinshipTypeId("");
    setKinshipDetail("");
    setRequesterDetail("");
  };

  const selectedKinship = catalogs?.kinshipTypes.find((kinship) => kinship.id === kinshipTypeId);
  const isOtherKinship = selectedKinship?.name.trim().toLowerCase() === "otro";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !attention || !catalogs) return;
    if (!client.firstName.trim() || !client.paternalSurname.trim() || !client.maternalSurname.trim()) {
      toast.error("El primer nombre y ambos apellidos son obligatorios.");
      return;
    }
    if (!serviceChannelId || !conclusion.trim() || selectedTopicIds.length === 0) {
      toast.error("Completa el medio, al menos un tema y la conclusión.");
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

    const selectedTopics = catalogs.consultationTopics.filter((topic) => selectedTopicIds.includes(topic.id));

    try {
      await updateAttention({
        id,
        client: {
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
        kinshipDetail: requesterType === "RELATIVE" && isOtherKinship ? kinshipDetail.trim() : null,
        conclusion: conclusion.trim(),
        topics: selectedTopics.map((topic) => ({ topicId: topic.id })),
        destinationAreaId: destinationAreaId || null,
      });
      toast.success("Atención actualizada correctamente.");
      navigate(`/attentions/${id}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  if (attentionQuery.isLoading || catalogsQuery.isLoading) return <div className="py-16 text-center text-gray-500">Cargando atención...</div>;
  if (attentionQuery.isError || catalogsQuery.isError) return <div className="mx-auto max-w-4xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">No se pudo cargar la información necesaria para editar.</div>;
  if (!attention || !catalogs) return <div className="py-16 text-center text-gray-500">La atención no existe.</div>;
  if (attention.status !== "ACTIVE") return <div className="mx-auto max-w-4xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">Una atención inhabilitada no puede editarse.</div>;

  const referralLocked = !!attention.referral && attention.referral.status !== "PENDING";

  return (
    <div className="w-full max-w-5xl mx-auto">
      <Link to={`/attentions/${attention.id}`} className="mb-5 inline-flex items-center text-sm font-medium text-gray-600 hover:text-[#1A2855]"><ArrowLeft size={17} className="mr-1" /> Volver al detalle</Link>
      <div className="mb-7"><h1 className="text-2xl font-bold text-gray-900">Editar {attention.racCode}</h1><p className="mt-1 text-sm text-gray-500">Solo los administradores pueden modificar una atención activa.</p></div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Cliente</h2>
          <p className="mt-1 text-sm text-gray-500">DNI {attention.client.dni}. El DNI se conserva como identificador único.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {([[
              "firstName", "Primer nombre *", "text"], ["middleName", "Segundo nombre", "text"], ["paternalSurname", "Apellido paterno *", "text"], ["maternalSurname", "Apellido materno *", "text"], ["email", "Correo", "email"], ["phone", "Teléfono", "text"]] as const).map(([field, label, type]) => (
              <div key={field}><label htmlFor={field} className="block text-sm font-medium text-gray-700">{label}</label><input id={field} type={type} value={client[field]} onChange={(event) => updateClient(field, event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" /></div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Datos de la atención</h2>
          <div className="mt-4"><label htmlFor="serviceChannel" className="block text-sm font-medium text-gray-700">Medio *</label><select id="serviceChannel" value={serviceChannelId} onChange={(event) => setServiceChannelId(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"><option value="">Selecciona un medio</option>{catalogs.serviceChannels.map((channel) => <option key={channel.id} value={channel.id} disabled={!channel.isActive && channel.id !== attention.serviceChannelId}>{channel.name} — {channel.detail}{!channel.isActive ? " (inhabilitado)" : ""}</option>)}</select></div>
          <div className="mt-5"><span className="block text-sm font-medium text-gray-700">¿Quién solicita la atención? *</span><div className="mt-2 flex flex-wrap gap-5"><label className="inline-flex items-center gap-2 text-sm"><input type="radio" checked={requesterType === "APPLICANT"} onChange={() => handleRequesterChange("APPLICANT")} /> Postulante</label><label className="inline-flex items-center gap-2 text-sm"><input type="radio" checked={requesterType === "RELATIVE"} onChange={() => handleRequesterChange("RELATIVE")} /> Familiar</label><label className="inline-flex items-center gap-2 text-sm"><input type="radio" checked={requesterType === "OTHER"} onChange={() => handleRequesterChange("OTHER")} /> Otro</label></div></div>
          {requesterType === "RELATIVE" && <div className="mt-4"><label htmlFor="kinship" className="block text-sm font-medium text-gray-700">Parentesco *</label><select id="kinship" value={kinshipTypeId} onChange={(event) => { setKinshipTypeId(event.target.value); setKinshipDetail(""); }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"><option value="">Selecciona el parentesco</option>{catalogs.kinshipTypes.map((kinship) => <option key={kinship.id} value={kinship.id} disabled={!kinship.isActive && kinship.id !== attention.kinshipTypeId}>{kinship.name}{!kinship.isActive ? " (inhabilitado)" : ""}</option>)}</select>{isOtherKinship && <div className="mt-3"><label htmlFor="kinshipDetail" className="block text-sm font-medium text-gray-700">Especifica el parentesco *</label><input id="kinshipDetail" value={kinshipDetail} onChange={(event) => setKinshipDetail(event.target.value)} required maxLength={150} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></div>}</div>}
          {requesterType === "OTHER" && <div className="mt-4"><label htmlFor="requesterDetail" className="block text-sm font-medium text-gray-700">Especifica quién realiza la consulta *</label><input id="requesterDetail" value={requesterDetail} onChange={(event) => setRequesterDetail(event.target.value)} required maxLength={150} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></div>}
        </section>

        <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Temas consultados *</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {topicGroups.map((group) => <div key={group.id} className="rounded-md border border-gray-200 p-4"><h3 className="font-medium text-gray-800">{group.name}</h3><div className="mt-3 space-y-3">{group.topics.map((topic) => { const selected = selectedTopicIds.includes(topic.id); return <div key={topic.id}><label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={selected} disabled={!topic.isActive && !selected} onChange={() => toggleTopic(topic.id)} className="mt-0.5 rounded" /><span>{topic.name}{!topic.isActive ? " (inhabilitado)" : ""}</span></label></div>; })}</div></div>)}
          </div>
        </section>

        <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Resultado y derivación</h2>
          <div className="mt-4"><label htmlFor="destinationArea" className="block text-sm font-medium text-gray-700">Área de destino</label><select id="destinationArea" value={destinationAreaId} disabled={referralLocked} onChange={(event) => setDestinationAreaId(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm disabled:bg-gray-100"><option value="">Sin derivación</option>{catalogs.areas.filter((area) => area.id !== user?.areaId || area.id === destinationAreaId).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>{referralLocked && <p className="mt-2 text-xs text-amber-700">El área no puede modificarse porque la derivación ya fue cerrada.</p>}</div>
          <div className="mt-4"><SpeechConclusionField id="conclusion" value={conclusion} onChange={setConclusion} label="Conclusión de la atención *" /></div>
        </section>

        <div className="flex justify-end gap-2"><Link to={`/attentions/${attention.id}`} className="btn btn-secondary">Cancelar</Link><button type="submit" disabled={isUpdating} className="btn btn-primary inline-flex items-center disabled:opacity-60"><Save size={18} className="mr-2" />{isUpdating ? "Guardando..." : "Guardar cambios"}</button></div>
      </form>
    </div>
  );
};

export default EditAttention;
