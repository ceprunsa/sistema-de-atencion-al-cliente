import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPlus,
  Mail,
  Search,
  Send,
  SkipForward,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import SpeechConclusionField from "../components/SpeechConclusionField";
import { surveysApi } from "../api/surveys";
import { useAuth } from "../hooks/useAuth";
import { useNewAttention } from "../hooks/useNewAttention";
import { useGmailAttentionImport } from "../hooks/useGmailAttentionImport";
import { supabase } from "../supabase/config";
import { formatAdmissionProcess } from "../utils/admissionProcesses";
import {
  buildEmailOriginalText,
  currentDateTimeLocalInput,
  toDateTimeLocalInput,
  toOptionalIsoDateTime,
} from "../utils/emailAttention";
import type {
  AttentionRequesterType,
  Client,
  CreateCustomerAttentionInput,
  CreatedCustomerAttention,
  EmailAttentionDuplicate,
  SurveyChannel,
  SurveyStatus,
} from "../types";

type ClientForm = {
  displayName: string;
  firstName: string;
  middleName: string;
  paternalSurname: string;
  maternalSurname: string;
  email: string;
  phone: string;
};

const EMPTY_CLIENT: ClientForm = {
  displayName: "",
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
  const { user } = useAuth();
  const {
    catalogs,
    isLoadingCatalogs,
    isErrorCatalogs,
    findClient,
    isSearchingClient,
    findClientsByEmail,
    isSearchingClientsByEmail,
    createAttention,
    isCreating,
    findEmailDuplicates,
    isCheckingEmailDuplicates,
  } = useNewAttention();
  const { gmailImport, importError, consumeImport, cancelImport } = useGmailAttentionImport();

  const [dni, setDni] = useState("");
  const [lookupCompleted, setLookupCompleted] = useState(false);
  const [lookupSource, setLookupSource] = useState<"LOCAL" | "EXTERNAL" | "MANUAL" | null>(null);
  const [existingClient, setExistingClient] = useState<Client | null>(null);
  const [emailCandidates, setEmailCandidates] = useState<Client[]>([]);
  const [emailChoiceMade, setEmailChoiceMade] = useState(false);
  const [client, setClient] = useState<ClientForm>(EMPTY_CLIENT);
  const [serviceChannelId, setServiceChannelId] = useState("");
  const [requesterType, setRequesterType] =
    useState<AttentionRequesterType>("APPLICANT");
  const [kinshipTypeId, setKinshipTypeId] = useState("");
  const [requesterDetail, setRequesterDetail] = useState("");
  const [kinshipDetail, setKinshipDetail] = useState("");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedAdmissionProcessIds, setSelectedAdmissionProcessIds] = useState<string[]>([]);
  const [conclusion, setConclusion] = useState("");
  const [destinationAreaId, setDestinationAreaId] = useState("");
  const [emailReceivedAt, setEmailReceivedAt] = useState("");
  const [emailRespondedAt, setEmailRespondedAt] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [creationOrigin, setCreationOrigin] = useState<"WEB" | "GMAIL_CHROME_EXTENSION">("WEB");
  const [emailAttachments, setEmailAttachments] = useState<Array<{ name: string; sizeLabel?: string | null; typeLabel?: string | null }>>([]);
  const [sourceMessageKeyHash, setSourceMessageKeyHash] = useState<string | null>(null);
  const [sourceFingerprint, setSourceFingerprint] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<EmailAttentionDuplicate[]>([]);
  const [duplicateCheckError, setDuplicateCheckError] = useState<string | null>(null);
  const [pendingAttention, setPendingAttention] = useState<CreateCustomerAttentionInput | null>(null);
  const autoEmailConclusionRef = useRef("");
  const appliedImportRef = useRef<string | null>(null);
  const [createdAttention, setCreatedAttention] =
    useState<CreatedCustomerAttention | null>(null);
  const [surveyStatus, setSurveyStatus] = useState<SurveyStatus>("NONE");
  const [surveyChannel, setSurveyChannel] = useState<SurveyChannel>("UNDECIDED");
  const [surveyEmail, setSurveyEmail] = useState("");
  const [isUpdatingSurvey, setIsUpdatingSurvey] = useState(false);
  const [isCheckingPendingSurvey, setIsCheckingPendingSurvey] = useState(true);

  useEffect(() => {
    if (!createdAttention || !user) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const refreshStatus = () => {
      void surveysApi.getState(createdAttention.id).then((state) => {
        if (!cancelled && state) {
          setSurveyStatus(state.status);
          setSurveyChannel(state.channel);
          if (state.recipientEmail) setSurveyEmail(state.recipientEmail);
        }
      }).catch(() => undefined);
    };
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel = supabase.channel(`operator:${user.id}`, { config: { private: true } })
        .on("broadcast", { event: "survey_changed" }, (message) => {
          const payload = message.payload as { status?: SurveyStatus; channel?: SurveyChannel };
          if (payload.status) setSurveyStatus(payload.status);
          if (payload.channel) setSurveyChannel(payload.channel);
        })
        .subscribe((status) => { if (status === "SUBSCRIBED") refreshStatus(); });
    });
    window.addEventListener("online", refreshStatus);
    refreshStatus();
    return () => { cancelled = true; window.removeEventListener("online", refreshStatus); if (channel) void supabase.removeChannel(channel); };
  }, [createdAttention, user]);

  useEffect(() => {
    if (!user || createdAttention) {
      setIsCheckingPendingSurvey(false);
      return;
    }
    let active = true;
    setIsCheckingPendingSurvey(true);
    void surveysApi.getOperatorPending().then((pending) => {
      if (!active || !pending) return;
      setCreatedAttention({ id: pending.attentionId, racCode: pending.racCode });
      setSurveyStatus(pending.status);
      setSurveyChannel(pending.channel);
    }).catch(() => undefined).finally(() => {
      if (active) setIsCheckingPendingSurvey(false);
    });
    return () => { active = false; };
  }, [user, createdAttention]);

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
  const selectedServiceChannel = catalogs?.serviceChannels.find(
    (channel) => channel.id === serviceChannelId,
  );
  const isEmailChannel = selectedServiceChannel?.category === "EMAIL";
  const emailOriginalText = buildEmailOriginalText(emailSubject, emailBody);

  useEffect(() => {
    if (!isEmailChannel) return;
    setConclusion((current) => {
      if (!current.trim() || current === autoEmailConclusionRef.current) {
        autoEmailConclusionRef.current = emailOriginalText;
        return emailOriginalText;
      }
      return current;
    });
  }, [emailOriginalText, isEmailChannel]);

  useEffect(() => {
    if (!gmailImport || !catalogs || createdAttention || appliedImportRef.current === gmailImport.fingerprint) return;
    appliedImportRef.current = gmailImport.fingerprint;
    const emailChannels = catalogs.serviceChannels.filter((channel) => channel.category === "EMAIL");
    setServiceChannelId(emailChannels.length === 1 ? emailChannels[0].id : "");
    setLookupCompleted(false);
    setLookupSource(null);
    setExistingClient(null);
    setDni("");
    setClient({
      ...EMPTY_CLIENT,
      displayName: gmailImport.senderName,
      email: gmailImport.senderEmail.trim().toLowerCase(),
    });
    setEmailReceivedAt(toDateTimeLocalInput(gmailImport.receivedAtIso));
    setEmailRespondedAt("");
    setEmailSubject(gmailImport.subject);
    setEmailBody(gmailImport.body);
    setEmailAttachments(gmailImport.attachments);
    setCreationOrigin("GMAIL_CHROME_EXTENSION");
    setSourceMessageKeyHash(gmailImport.messageKeyHash);
    setSourceFingerprint(gmailImport.fingerprint);
    setEmailCandidates([]);
    setEmailChoiceMade(false);

    const normalizedEmail = gmailImport.senderEmail.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalizedEmail)) {
      void findClientsByEmail(normalizedEmail).then((matches) => {
        setEmailCandidates(matches);
        setEmailChoiceMade(matches.length === 0);
        if (matches.length === 0) toast.success("Correo importado. No existen clientes coincidentes; se creará uno nuevo.");
      }).catch((error) => toast.error(getErrorMessage(error)));
    }
  }, [catalogs, createdAttention, findClientsByEmail, gmailImport]);

  const resetClientLookup = (nextDni = "") => {
    setDni(nextDni);
    setLookupCompleted(false);
    setLookupSource(null);
    setExistingClient(null);
    setEmailCandidates([]);
    setEmailChoiceMade(false);
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
    setSelectedAdmissionProcessIds([]);
    setConclusion("");
    setDestinationAreaId("");
    setEmailReceivedAt("");
    setEmailRespondedAt("");
    setEmailSubject("");
    setEmailBody("");
    setEmailAttachments([]);
    setCreationOrigin("WEB");
    setSourceMessageKeyHash(null);
    setSourceFingerprint(null);
    setDuplicateMatches([]);
    setDuplicateCheckError(null);
    setPendingAttention(null);
    autoEmailConclusionRef.current = "";
    setCreatedAttention(null);
    setSurveyStatus("NONE");
    setSurveyChannel("UNDECIDED");
    setSurveyEmail("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDniChange = (value: string) => {
    setDni(value.replace(/\D/g, "").slice(0, 8));
    setLookupCompleted(false);
    setLookupSource(null);
    setExistingClient(null);
    if (isEmailChannel) {
      setEmailCandidates([]);
      setEmailChoiceMade(false);
    }
    setCreatedAttention(null);
  };

  const handleSearchClient = async () => {
    if (!/^\d{8}$/.test(dni)) {
      toast.error("Ingresa un DNI válido de 8 dígitos.");
      return;
    }

    try {
      const result = await findClient(dni);
      setLookupCompleted(true);
      setLookupSource(result.source);
      if (result.source === "LOCAL") {
        const found = result.client;
        setExistingClient(found);
        if (isEmailChannel) setEmailChoiceMade(true);
        setClient({
          displayName: isEmailChannel ? client.displayName : found.displayName,
          firstName: found.firstName || "",
          middleName: found.middleName || "",
          paternalSurname: found.paternalSurname || "",
          maternalSurname: found.maternalSurname || "",
          email: isEmailChannel ? client.email : found.email || "",
          phone: isEmailChannel ? client.phone : found.phone || "",
        });
        toast.success(isEmailChannel
          ? "DNI encontrado. Se completaron los nombres; confirma aparte qué cliente corresponde al correo."
          : "Cliente encontrado en el sistema. Sus datos fueron cargados.");
      } else if (result.source === "EXTERNAL") {
        setExistingClient(null);
        setClient({
          displayName: isEmailChannel ? client.displayName : [result.person.firstName, result.person.middleName, result.person.paternalSurname, result.person.maternalSurname].filter(Boolean).join(" "),
          firstName: result.person.firstName,
          middleName: result.person.middleName || "",
          paternalSurname: result.person.paternalSurname,
          maternalSurname: result.person.maternalSurname,
          email: isEmailChannel ? client.email : "",
          phone: isEmailChannel ? client.phone : "",
        });
        toast.success("DNI encontrado. Revisa los datos antes de registrar la atención.");
      } else {
        setExistingClient(null);
        if (!isEmailChannel) setClient(EMPTY_CLIENT);
        toast(result.message, { icon: "ℹ️" });
      }
    } catch (error) {
      setExistingClient(null);
      if (!isEmailChannel) setClient(EMPTY_CLIENT);
      setLookupCompleted(true);
      setLookupSource("MANUAL");
      toast.error(`${getErrorMessage(error)} Ingresa los datos manualmente.`);
    }
  };

  const updateClient = (field: keyof ClientForm, value: string) => {
    setClient((current) => ({ ...current, [field]: value }));
    if (field === "email") {
      setEmailCandidates([]);
      setEmailChoiceMade(false);
      setExistingClient(null);
    }
  };

  const handleSearchClientsByEmail = async () => {
    const email = client.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
      toast.error("Ingresa un correo electrónico válido.");
      return;
    }
    try {
      const matches = await findClientsByEmail(email);
      setEmailCandidates(matches);
      setEmailChoiceMade(matches.length === 0);
      setExistingClient(null);
      if (matches.length === 0) toast.success("No hay coincidencias. Se creará un cliente nuevo.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const selectEmailClient = (found: Client) => {
    setExistingClient(found);
    setEmailChoiceMade(true);
    setDni(found.dni || dni);
    setClient({
      displayName: found.displayName,
      firstName: found.firstName || "",
      middleName: found.middleName || "",
      paternalSurname: found.paternalSurname || "",
      maternalSurname: found.maternalSurname || "",
      email: found.email || client.email,
      phone: found.phone || "",
    });
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

  const closeDuplicateModal = () => {
    if (isCreating) return;
    setPendingAttention(null);
    setDuplicateMatches([]);
    setDuplicateCheckError(null);
  };

  useEffect(() => {
    if (!pendingAttention) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isCreating) return;
      setPendingAttention(null);
      setDuplicateMatches([]);
      setDuplicateCheckError(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCreating, pendingAttention]);

  const persistAttention = async (values: CreateCustomerAttentionInput) => {
    try {
      const result = await createAttention(values);
      setPendingAttention(null);
      setDuplicateMatches([]);
      setDuplicateCheckError(null);
      setCreatedAttention(result);
      setSurveyStatus("PENDING_DECISION");
      setSurveyChannel("UNDECIDED");
      setSurveyEmail(values.client.email?.trim() || "");
      if (values.creationOrigin === "GMAIL_CHROME_EXTENSION") consumeImport();
      toast.success(`Atención ${result.racCode} registrada correctamente.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!serviceChannelId || !selectedServiceChannel?.category) {
      toast.error("Selecciona un medio de atención configurado.");
      return;
    }
    if (isEmailChannel) {
      if (!client.displayName.trim()) {
        toast.error("Ingresa el nombre o denominación indicada en el correo.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(client.email.trim())) {
        toast.error("Ingresa un correo electrónico válido.");
        return;
      }
      if (!emailChoiceMade) {
        toast.error("Busca el correo y elige un cliente existente o confirma que crearás uno nuevo.");
        return;
      }
      if (dni && !/^\d{8}$/.test(dni)) {
        toast.error("El DNI opcional debe contener exactamente 8 dígitos.");
        return;
      }
      if (dni && !lookupCompleted && !existingClient) {
        toast.error("Consulta el DNI ingresado antes de continuar.");
        return;
      }
      const receivedAt = toOptionalIsoDateTime(emailReceivedAt);
      const respondedAt = toOptionalIsoDateTime(emailRespondedAt);
      if (!receivedAt) {
        toast.error("Ingresa una fecha y hora de recepción válida.");
        return;
      }
      if (new Date(receivedAt).getTime() > Date.now() + 5 * 60_000) {
        toast.error("La fecha de recepción no puede estar en el futuro.");
        return;
      }
      if (!emailOriginalText) {
        toast.error("Ingresa el asunto o el cuerpo original del correo.");
        return;
      }
      if (emailOriginalText.length > 500000) {
        toast.error("El asunto y cuerpo del correo exceden el límite permitido.");
        return;
      }
      if (emailRespondedAt && (!respondedAt || new Date(respondedAt) < new Date(receivedAt))) {
        toast.error("La fecha de respuesta debe ser igual o posterior a la recepción.");
        return;
      }
      if (respondedAt && new Date(respondedAt).getTime() > Date.now() + 5 * 60_000) {
        toast.error("La fecha de respuesta no puede estar en el futuro.");
        return;
      }
    } else if (!lookupCompleted) {
      toast.error("Primero busca el DNI del cliente.");
      return;
    } else if (!existingClient && (!client.firstName.trim() || !client.paternalSurname.trim() || !client.maternalSurname.trim())) {
      toast.error("El primer nombre y ambos apellidos son obligatorios.");
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
    if (destinationAreaId && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(client.email.trim())) {
      toast.error("Registra un correo electrónico válido antes de crear la derivación.");
      return;
    }

    const selectedTopics = (catalogs?.consultationTopics || []).filter((topic) =>
      selectedTopicIds.includes(topic.id),
    );
    if (!conclusion.trim()) {
      toast.error("La conclusión de la atención es obligatoria.");
      return;
    }

    const values: CreateCustomerAttentionInput = {
        client: {
          id: isEmailChannel ? existingClient?.id || null : null,
          createNew: isEmailChannel && !existingClient,
          dni: dni || null,
          displayName: isEmailChannel
            ? client.displayName.trim()
            : [client.firstName, client.middleName, client.paternalSurname, client.maternalSurname].filter(Boolean).join(" "),
          firstName: client.firstName.trim() || null,
          middleName: client.middleName.trim() || null,
          paternalSurname: client.paternalSurname.trim() || null,
          maternalSurname: client.maternalSurname.trim() || null,
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
        creationOrigin,
        emailReceivedAt: isEmailChannel ? toOptionalIsoDateTime(emailReceivedAt) : null,
        emailRespondedAt: isEmailChannel ? toOptionalIsoDateTime(emailRespondedAt) : null,
        emailOriginalText: isEmailChannel ? emailOriginalText : null,
        emailAttachments,
        sourceMessageKeyHash,
        sourceFingerprint,
        topics: selectedTopics.map((topic) => ({ topicId: topic.id })),
        destinationAreaId: destinationAreaId || null,
        admissionProcessIds: selectedAdmissionProcessIds,
    };

    if (creationOrigin === "GMAIL_CHROME_EXTENSION" && sourceFingerprint) {
      try {
        const matches = await findEmailDuplicates({
          messageKeyHash: sourceMessageKeyHash,
          fingerprint: sourceFingerprint,
        });
        if (matches.length > 0) {
          setDuplicateMatches(matches);
          setDuplicateCheckError(null);
          setPendingAttention(values);
          return;
        }
      } catch (error) {
        setDuplicateMatches([]);
        setDuplicateCheckError(getErrorMessage(error));
        setPendingAttention(values);
        return;
      }
    }

    await persistAttention(values);
  };

  if (isLoadingCatalogs || isCheckingPendingSurvey) {
    return <div className="py-16 text-center text-gray-500">Cargando formulario de atención...</div>;
  }

  if (isErrorCatalogs || !catalogs) {
    return (
      <div className="max-w-4xl mx-auto rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        No se pudieron cargar los catálogos de atención. Verifica que los SQL 03, 04, 12 y 13 estén instalados en Supabase.
      </div>
    );
  }

  if (createdAttention) {
    const handleSurvey = async (action: "tablet" | "email" | "skip") => {
      setIsUpdatingSurvey(true);
      try {
        if (action === "tablet") {
          await surveysApi.send(createdAttention.id);
          setSurveyStatus("SENT");
          setSurveyChannel("TABLET");
          toast.success("Encuesta enviada a la tablet.");
        } else if (action === "email") {
          const normalizedEmail = surveyEmail.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalizedEmail)) {
            toast.error("Ingresa un correo electrónico válido.");
            return;
          }
          const state = await surveysApi.sendByEmail(createdAttention.id, normalizedEmail);
          setSurveyStatus(state.status);
          setSurveyChannel(state.channel);
          setSurveyEmail(state.recipientEmail || normalizedEmail);
          toast.success("La encuesta fue agregada a la cola de correo.");
        } else {
          await surveysApi.skipByOperator(createdAttention.id);
          setSurveyStatus("SKIPPED");
          toast.success("Encuesta omitida. Ya puedes registrar otra atención.");
        }
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setIsUpdatingSurvey(false);
      }
    };
    const canRegisterAnother = ["QUEUED", "COMPLETED", "SKIPPED", "CANCELLED"].includes(surveyStatus)
      || (surveyStatus === "SENT" && surveyChannel === "EMAIL");
    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 size={56} className="mx-auto text-green-600" />
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Atención registrada</h1>
          <p className="mt-2 text-gray-500">El código asignado es:</p>
          <p className="mt-2 text-3xl font-bold tracking-wide text-[#1A2855]">
            {createdAttention.racCode}
          </p>
          {surveyStatus === "PENDING_DECISION" && (
            <div className="mx-auto mt-7 max-w-xl rounded-lg border border-gray-200 p-4 text-left">
              <label htmlFor="survey-email" className="block text-sm font-medium text-gray-700">Correo para la encuesta</label>
              <input id="survey-email" type="email" value={surveyEmail} onChange={(event) => setSurveyEmail(event.target.value)} placeholder="cliente@correo.com" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
              <p className="mt-1 text-xs text-gray-500">Puedes corregirlo antes de enviar. También se actualizará el correo del cliente.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <button type="button" disabled={isUpdatingSurvey} onClick={() => void handleSurvey("tablet")} className="btn btn-primary inline-flex items-center justify-center"><Send size={18} className="mr-2" />Tablet</button>
                <button type="button" disabled={isUpdatingSurvey} onClick={() => void handleSurvey("email")} className="btn btn-primary inline-flex items-center justify-center"><Mail size={18} className="mr-2" />Correo</button>
                <button type="button" disabled={isUpdatingSurvey} onClick={() => void handleSurvey("skip")} className="btn btn-secondary inline-flex items-center justify-center"><SkipForward size={18} className="mr-2" />Omitir</button>
              </div>
            </div>
          )}
          {surveyStatus === "QUEUED" && <div className="mt-7 rounded-lg bg-blue-50 p-4 text-blue-800"><p className="font-medium">Encuesta en cola de correo</p><p className="mt-1 text-sm">Se enviará a {surveyEmail}. Ya puedes registrar otra atención.</p></div>}
          {surveyStatus === "SENT" && surveyChannel === "TABLET" && <div className="mt-7 rounded-lg bg-amber-50 p-4 text-amber-800"><p className="font-medium">Encuesta enviada</p><p className="mt-1 text-sm">Esperando la respuesta en la tablet. No se puede registrar otra atención todavía.</p></div>}
          {surveyStatus === "SENT" && surveyChannel === "EMAIL" && <div className="mt-7 rounded-lg bg-blue-50 p-4 text-blue-800"><p className="font-medium">Encuesta enviada por correo</p><p className="mt-1 text-sm">El cliente puede responder desde su enlace. Ya puedes registrar otra atención.</p></div>}
          {surveyStatus === "COMPLETED" && <div className="mt-7 rounded-lg bg-green-50 p-4 text-green-700">Encuesta completada correctamente.</div>}
          {surveyStatus === "SKIPPED" && <div className="mt-7 rounded-lg bg-gray-50 p-4 text-gray-700">Encuesta omitida.</div>}
          {surveyStatus === "CANCELLED" && <div className="mt-7 rounded-lg bg-red-50 p-4 text-red-700">Encuesta cancelada.</div>}
          {canRegisterAnother && <button type="button" onClick={resetForm} className="btn btn-primary mt-7 inline-flex items-center"><ClipboardPlus size={18} className="mr-2" />Registrar otra atención</button>}
        </div>
      </div>
    );
  }

  const clientInputsDisabled = !lookupCompleted || !!existingClient;
  const clientReady = isEmailChannel ? emailChoiceMade : lookupCompleted;

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Nueva atención</h1>
        <p className="mt-1 text-sm text-gray-500">
          Selecciona el medio y registra los datos requeridos para ese canal.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {gmailImport && (
          <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="font-semibold">Correo recibido desde la extensión de Gmail</p><p className="mt-1 text-sm">Revisa todos los datos antes de guardar. La extensión no ha creado todavía ningún RAC.</p></div>
              <button type="button" onClick={() => { cancelImport(); resetForm(); }} className="text-sm font-medium text-red-700 hover:underline">Descartar importación</button>
            </div>
            {catalogs.serviceChannels.filter((channel) => channel.category === "EMAIL").length > 1 && <p className="mt-3 rounded-md bg-white/70 p-2 text-sm">Hay varios medios de correo activos. Selecciona manualmente cuál corresponde.</p>}
            {gmailImport.receivedAtDisplay && !gmailImport.receivedAtIso && <p className="mt-2 text-sm">Fecha mostrada por Gmail: <strong>{gmailImport.receivedAtDisplay}</strong>. Debes completar manualmente la fecha exacta.</p>}
            {gmailImport.warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{gmailImport.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          </section>
        )}
        {importError && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{importError} La escritura manual permanece disponible.</div>}
        <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">1. Medio de atención</h2>
          {catalogs.serviceChannels.length === 0 ? (
            <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              No hay medios activos con una categoría configurada. Un administrador debe crear o actualizar uno.
            </div>
          ) : (
            <div className="mt-4">
              <label htmlFor="serviceChannel" className="block text-sm font-medium text-gray-700">Medio de atención *</label>
              <select
                id="serviceChannel"
                value={serviceChannelId}
                onChange={(event) => {
                  setServiceChannelId(event.target.value);
                  setLookupCompleted(false);
                  setLookupSource(null);
                  setExistingClient(null);
                  setEmailCandidates([]);
                  setEmailChoiceMade(false);
                  toast("Los datos escritos se conservaron; verifica los campos obligatorios del nuevo medio.", { icon: "ℹ️" });
                }}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">Selecciona un medio</option>
                {catalogs.serviceChannels.map((channel) => (
                  <option key={channel.id} value={channel.id} disabled={!!gmailImport && channel.category !== "EMAIL"}>{channel.name} — {channel.detail}{gmailImport && channel.category !== "EMAIL" ? " (no corresponde a la importación)" : ""}</option>
                ))}
              </select>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Search size={20} className="text-[#1A2855]" />
            <h2 className="font-semibold text-gray-900">2. Identificación del cliente</h2>
          </div>
          {!serviceChannelId ? (
            <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">Selecciona primero el medio de atención.</p>
          ) : isEmailChannel ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">Nombre o denominación del correo *</label>
                  <input id="displayName" value={client.displayName} onChange={(event) => updateClient("displayName", event.target.value)} maxLength={250} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">Correo electrónico *</label>
                  <div className="mt-1 flex gap-2">
                    <input id="email" type="email" value={client.email} onChange={(event) => updateClient("email", event.target.value)} className="block min-w-0 flex-1 rounded-md border-gray-300 shadow-sm" />
                    <button type="button" onClick={() => void handleSearchClientsByEmail()} disabled={isSearchingClientsByEmail} className="btn btn-secondary whitespace-nowrap">{isSearchingClientsByEmail ? "Buscando..." : "Buscar correo"}</button>
                  </div>
                </div>
              </div>
              {emailCandidates.length > 0 && !emailChoiceMade && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-900">Este correo coincide con uno o más clientes. Elige uno o crea un registro independiente.</p>
                  <div className="mt-3 space-y-2">
                    {emailCandidates.map((candidate) => (
                      <button key={candidate.id} type="button" onClick={() => selectEmailClient(candidate)} className="block w-full rounded-md border border-amber-200 bg-white p-3 text-left text-sm hover:border-amber-400">
                        <span className="font-medium">{candidate.displayName}</span>
                        <span className="ml-2 text-gray-500">{candidate.dni ? `DNI ${candidate.dni}` : "Sin DNI"}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => { setExistingClient(null); setEmailChoiceMade(true); }} className="mt-3 text-sm font-medium text-blue-700 hover:underline">Crear otro cliente con este mismo correo</button>
                </div>
              )}
              {emailChoiceMade && (
                <div className="mt-4 flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
                  {existingClient ? <UserCheck size={18} /> : <UserPlus size={18} />}
                  <span className="flex-1">{existingClient ? `Se reutilizará a ${existingClient.displayName}.` : "Se creará un cliente independiente."}</span>
                  <button type="button" onClick={() => { setEmailChoiceMade(false); setExistingClient(null); void handleSearchClientsByEmail(); }} className="font-medium text-blue-700 hover:underline">Cambiar</button>
                </div>
              )}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label htmlFor="dni" className="block text-sm font-medium text-gray-700">DNI (opcional)</label>
                  <input id="dni" value={dni} onChange={(event) => handleDniChange(event.target.value)} inputMode="numeric" maxLength={8} placeholder="8 dígitos" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                </div>
                <button type="button" onClick={handleSearchClient} disabled={isSearchingClient || !dni} className="btn btn-secondary disabled:opacity-60">Consultar DNI</button>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div><label htmlFor="phone" className="block text-sm font-medium text-gray-700">Teléfono</label><input id="phone" value={client.phone} onChange={(event) => updateClient("phone", event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" /></div>
              </div>
              <div className="mt-6 border-t border-gray-200 pt-5">
                <h3 className="font-medium text-gray-900">Datos del correo recibido</h3>
                <p className="mt-1 text-sm text-gray-500">Se almacenarán como texto plano, sin estilos ni contenido ejecutable.</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor="emailReceivedAt" className="block text-sm font-medium text-gray-700">Fecha y hora de recepción *</label>
                    <input id="emailReceivedAt" type="datetime-local" required max={currentDateTimeLocalInput()} value={emailReceivedAt} onChange={(event) => setEmailReceivedAt(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                  </div>
                  <div>
                    <label htmlFor="emailRespondedAt" className="block text-sm font-medium text-gray-700">Fecha y hora de respuesta</label>
                    <input id="emailRespondedAt" type="datetime-local" max={currentDateTimeLocalInput()} value={emailRespondedAt} onChange={(event) => setEmailRespondedAt(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
                    <p className="mt-1 text-xs text-gray-500">Déjala vacía si la consulta aún no fue respondida.</p>
                  </div>
                </div>
                <div className="mt-4">
                  <label htmlFor="emailSubject" className="block text-sm font-medium text-gray-700">Asunto</label>
                  <textarea id="emailSubject" rows={2} maxLength={1000} value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} className="mt-1 block w-full resize-y rounded-md border-gray-300 shadow-sm" placeholder="El asunto puede contener toda la consulta" />
                </div>
                <div className="mt-4">
                  <label htmlFor="emailBody" className="block text-sm font-medium text-gray-700">Cuerpo del mensaje</label>
                  <textarea id="emailBody" rows={7} maxLength={498000} value={emailBody} onChange={(event) => setEmailBody(event.target.value)} className="mt-1 block w-full resize-y rounded-md border-gray-300 shadow-sm" placeholder="Texto visible del mensaje, sin estilos" />
                  <p className="mt-1 text-xs text-gray-500">Debe existir al menos un asunto o un cuerpo. Ambos se guardarán concatenados.</p>
                </div>
                {emailAttachments.length > 0 && <div className="mt-4"><h4 className="text-sm font-medium text-gray-700">Adjuntos visibles informados por Gmail</h4><ul className="mt-2 grid gap-2 md:grid-cols-2">{emailAttachments.map((attachment, index) => <li key={`${attachment.name}-${index}`} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">{attachment.name}{attachment.sizeLabel ? ` · ${attachment.sizeLabel}` : ""}{attachment.typeLabel ? ` · ${attachment.typeLabel}` : ""}</li>)}</ul><p className="mt-2 text-xs text-gray-500">No se descargó ni almacenó el contenido de estos archivos.</p></div>}
              </div>
            </>
          ) : (
          <>
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
              {lookupSource === "LOCAL"
                ? "Cliente existente: los datos se muestran solo para consulta."
                : lookupSource === "EXTERNAL"
                  ? "Datos obtenidos del servicio DNI: revísalos y completa los datos opcionales."
                  : "No se obtuvieron datos automáticamente: completa los datos personales."}
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
                  disabled={clientInputsDisabled && field !== "email"}
                  required={!existingClient && ["firstName", "paternalSurname", "maternalSurname"].includes(field)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm disabled:bg-gray-100 disabled:text-gray-500 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
          </>
          )}
        </section>

        <fieldset disabled={!clientReady || isCreating || isCheckingEmailDuplicates} className="space-y-6 disabled:opacity-60">
          <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">3. Datos de la atención</h2>
            <div>
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
            <h2 className="font-semibold text-gray-900">4. Temas consultados *</h2>
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
            <h2 className="font-semibold text-gray-900">5. Procesos de admisión</h2>
            <p className="mt-1 text-sm text-gray-500">Opcional. Puedes seleccionar más de uno.</p>
            {catalogs.admissionProcesses.length === 0 ? <p className="mt-4 text-sm text-gray-400">No hay procesos activos.</p> : <div className="mt-4 grid gap-3 md:grid-cols-2">{catalogs.admissionProcesses.map((process) => <label key={process.id} className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={selectedAdmissionProcessIds.includes(process.id)} onChange={() => setSelectedAdmissionProcessIds((current) => current.includes(process.id) ? current.filter((id) => id !== process.id) : [...current, process.id])} className="rounded border-gray-300" />{formatAdmissionProcess(process)}</label>)}</div>}
          </section>

          <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">6. Resultado y derivación</h2>
            <div>
              <label htmlFor="destinationArea" className="block text-sm font-medium text-gray-700">Derivar a un área (opcional)</label>
              <select id="destinationArea" value={destinationAreaId} onChange={(event) => setDestinationAreaId(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                <option value="">Sin derivación</option>
                {catalogs.areas.filter((area) => area.id !== user?.areaId).map((area) => (
                  <option key={area.id} value={area.id} disabled={!area.groupEmail}>
                    {area.name}{!area.groupEmail ? " (sin correo de grupo)" : ""}
                  </option>
                ))}
              </select>
              {destinationAreaId && <p className="mt-2 text-xs text-amber-700">Se enviará un único aviso al correo grupal del área. La derivación también requiere un correo válido del cliente para comunicar su resultado.</p>}
            </div>
            <div className="mt-4">
              <SpeechConclusionField id="conclusion" value={conclusion} onChange={setConclusion} maxLength={isEmailChannel ? 500000 : 3000} />
              {isEmailChannel && <p className="mt-2 text-xs text-amber-700">La conclusión se precarga con el correo recibido. Revísala y reemplázala o complétala con la orientación brindada.</p>}
            </div>
          </section>
        </fieldset>

        <div className="flex justify-end">
          <button type="submit" disabled={!clientReady || isCreating || isCheckingEmailDuplicates || catalogs.serviceChannels.length === 0} className="btn btn-primary inline-flex items-center disabled:opacity-60">
            <ClipboardPlus size={18} className="mr-2" />
            {isCreating ? "Registrando..." : isCheckingEmailDuplicates ? "Verificando correo..." : "Registrar atención"}
          </button>
        </div>
      </form>

      {pendingAttention && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDuplicateModal(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="duplicate-email-title" className="w-full max-w-xl rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-amber-100 p-2 text-amber-700"><AlertTriangle size={22} /></span>
                <div>
                  <h2 id="duplicate-email-title" className="text-lg font-bold text-gray-900">
                    {duplicateCheckError ? "No se pudo verificar si el correo está duplicado" : "Este correo podría estar registrado"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {duplicateCheckError
                      ? "La verificación falló. Puedes cancelar para intentarlo nuevamente o registrar la atención de todas formas."
                      : "La coincidencia es una advertencia y no impide registrar una atención independiente."}
                  </p>
                </div>
              </div>
              <button type="button" onClick={closeDuplicateModal} disabled={isCreating} aria-label="Cerrar advertencia" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"><X size={20} /></button>
            </div>

            {duplicateCheckError ? (
              <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{duplicateCheckError}</p>
            ) : (
              <ul className="mt-5 max-h-64 space-y-2 overflow-y-auto">
                {duplicateMatches.map((match) => (
                  <li key={match.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <a href={`/attentions/${match.id}`} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">{match.racCode}</a>
                      <span className="text-xs text-gray-500">{new Date(match.createdAt).toLocaleString("es-PE")}</span>
                    </div>
                    <p className="mt-1 text-gray-700">
                      {match.matchType === "MESSAGE_KEY"
                        ? "Coincidencia con el identificador visible del mensaje de Gmail."
                        : "Coincidencia probable por remitente, fecha y contenido del mensaje."}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 text-xs text-gray-500">La extensión no usa Gmail API; por ello esta verificación ayuda a detectar coincidencias, pero no garantiza identificar todos los duplicados.</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeDuplicateModal} disabled={isCreating} className="btn btn-secondary disabled:opacity-50">Cancelar y revisar</button>
              <button type="button" onClick={() => void persistAttention(pendingAttention)} disabled={isCreating} className="btn btn-primary disabled:opacity-50">{isCreating ? "Registrando..." : "Registrar de todas formas"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewAttention;
