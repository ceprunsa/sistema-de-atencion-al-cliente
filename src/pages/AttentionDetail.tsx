import { useState, type FormEvent } from "react";
import { ArrowLeft, Ban, CalendarClock, Headphones, MapPin, Pencil, Send, ShieldX, Star, UserRound, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import { useAttention, useAttentionActions } from "../hooks/useAttentions";
import { formatLocalDate } from "../utils/dateUtils";

const AttentionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { data: attention, isLoading, isError, error } = useAttention(id);
  const { user, isAdmin } = useAuth();
  const { disableAttention, concludeReferral, disableReferral, isDisabling, isConcluding, isDisablingReferral } = useAttentionActions();
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disableReason, setDisableReason] = useState("");
  const [referralConclusion, setReferralConclusion] = useState("");
  const [showReferralDisableModal, setShowReferralDisableModal] = useState(false);
  const [referralDisableReason, setReferralDisableReason] = useState("");

  if (isLoading) return <div className="py-16 text-center text-gray-500">Cargando detalle de la atención...</div>;

  if (isError) {
    return <div className="mx-auto max-w-4xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">{error instanceof Error ? error.message : "No se pudo cargar la atención."}</div>;
  }

  if (!attention) {
    return (
      <div className="mx-auto max-w-4xl rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-gray-600">La atención no existe o no tienes permiso para verla.</p>
        <Link to="/attentions" className="btn btn-secondary mt-5 inline-flex">Volver al listado</Link>
      </div>
    );
  }

  const clientName = [attention.client.firstName, attention.client.middleName, attention.client.paternalSurname, attention.client.maternalSurname].filter(Boolean).join(" ");
  const requesterLabel =
    attention.requesterType === "APPLICANT"
      ? "Postulante"
      : attention.requesterType === "RELATIVE"
        ? `Familiar — ${attention.kinshipName || "Parentesco no disponible"}${attention.kinshipDetail ? `: ${attention.kinshipDetail}` : ""}`
        : `Otro — ${attention.requesterDetail || "Sin especificar"}`;
  const canConcludeReferral =
    attention.status === "ACTIVE" &&
    !!attention.referral &&
    attention.referral.status === "PENDING" &&
    !!attention.referral.destinationAreaId &&
    user?.areaId === attention.referral.destinationAreaId;

  const handleDisable = async () => {
    if (!disableReason.trim()) {
      toast.error("La causa de inhabilitación es obligatoria.");
      return;
    }
    try {
      await disableAttention({ id: attention.id, reason: disableReason });
      toast.success("Atención inhabilitada correctamente.");
      setShowDisableModal(false);
      setDisableReason("");
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : "No se pudo inhabilitar la atención.");
    }
  };

  const handleConcludeReferral = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!attention.referral || !referralConclusion.trim()) {
      toast.error("La conclusión de la derivación es obligatoria.");
      return;
    }
    try {
      const result = await concludeReferral({ id: attention.referral.id, conclusion: referralConclusion });
      if (result.emailQueued) toast.success("Conclusión registrada y correo agregado a la cola.");
      else toast(result.message, { icon: "ℹ️" });
      setReferralConclusion("");
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : "No se pudo concluir la derivación.");
    }
  };

  const handleDisableReferral = async () => {
    if (!attention.referral || !referralDisableReason.trim()) return toast.error("El motivo es obligatorio.");
    try {
      await disableReferral({ id: attention.referral.id, reason: referralDisableReason });
      toast.success("Derivación inhabilitada.");
      setShowReferralDisableModal(false);
      setReferralDisableReason("");
    } catch (mutationError) { toast.error(mutationError instanceof Error ? mutationError.message : "No se pudo inhabilitar la derivación."); }
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      <Link to="/attentions" className="mb-5 inline-flex items-center text-sm font-medium text-gray-600 hover:text-[#1A2855]">
        <ArrowLeft size={17} className="mr-1" /> Volver a atenciones
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{attention.racCode}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${attention.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {attention.status === "ACTIVE" ? "Activa" : "Inhabilitada"}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Registrada el {formatLocalDate(attention.createdAt)} por {attention.createdByName}</p>
        </div>
        {isAdmin && attention.status === "ACTIVE" && (
          <div className="flex flex-wrap gap-2">
            <Link to={`/attentions/${attention.id}/edit`} className="btn btn-secondary inline-flex items-center"><Pencil size={17} className="mr-2" />Editar</Link>
            <button type="button" onClick={() => setShowDisableModal(true)} className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"><Ban size={17} className="mr-2" />Inhabilitar</button>
          </div>
        )}
      </div>

      {attention.status === "DISABLED" && (
        <section className="mb-6 rounded-lg border border-red-200 bg-red-50 p-5">
          <h2 className="font-semibold text-red-800">Atención inhabilitada</h2>
          <p className="mt-2 text-sm text-red-700">{attention.disabledReason}</p>
          <p className="mt-2 text-xs text-red-600">Por {attention.disabledByName} · {formatLocalDate(attention.disabledAt)}</p>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><UserRound size={20} className="text-[#1A2855]" /><h2 className="font-semibold text-gray-900">Cliente</h2></div>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-gray-500">Nombre completo</dt><dd className="font-medium text-gray-900">{clientName}</dd></div>
            <div><dt className="text-gray-500">DNI</dt><dd className="text-gray-800">{attention.client.dni}</dd></div>
            <div><dt className="text-gray-500">Correo</dt><dd className="text-gray-800">{attention.client.email || "No registrado"}</dd></div>
            <div><dt className="text-gray-500">Teléfono</dt><dd className="text-gray-800">{attention.client.phone || "No registrado"}</dd></div>
            <div><dt className="text-gray-500">Persona que consulta</dt><dd className="text-gray-800">{requesterLabel}</dd></div>
          </dl>
        </section>

        <section className="rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><Headphones size={20} className="text-[#1A2855]" /><h2 className="font-semibold text-gray-900">Atención</h2></div>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-gray-500">Medio</dt><dd className="font-medium text-gray-900">{attention.serviceChannel.name}</dd><dd className="text-gray-500">{attention.serviceChannel.detail}</dd></div>
            <div><dt className="text-gray-500">Responsable</dt><dd className="text-gray-800">{attention.createdByName}</dd><dd className="text-gray-500">{attention.createdByEmail}</dd></div>
            <div><dt className="text-gray-500">Última actualización</dt><dd className="text-gray-800">{formatLocalDate(attention.updatedAt)}{attention.updatedByName ? ` por ${attention.updatedByName}` : ""}</dd></div>
          </dl>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900">Temas consultados</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {attention.topics.map((topic) => (
            <div key={topic.id} className="rounded-md border border-gray-200 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{topic.consultationTypeName}</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{topic.name}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900">Conclusión original</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{attention.conclusion}</p>
      </section>

      <section className="mt-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><Star size={20} className="text-[#1A2855]" /><h2 className="font-semibold text-gray-900">Encuesta de satisfacción</h2></div>
        {!attention.survey ? <p className="text-sm text-gray-500">{isAdmin || attention.createdById === user?.id ? "Sin encuesta (registro anterior a esta funcionalidad)." : "El estado de la encuesta no está disponible para este usuario."}</p> : <div className="text-sm"><span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">{{ PENDING_DECISION: "Pendiente de decidir", QUEUED: "En cola de correo", SENT: "Enviada: esperando respuesta", COMPLETED: "Completada", SKIPPED: "Omitida", CANCELLED: "Cancelada", NONE: "Sin encuesta" }[attention.survey.status]}</span><p className="mt-3 text-gray-600">Canal: {{ UNDECIDED: "Sin decidir", TABLET: "Tablet", EMAIL: "Correo electrónico" }[attention.survey.channel]}</p>{attention.survey.recipientEmail && <p className="mt-1 text-gray-600">Destinatario: {attention.survey.recipientEmail}</p>}{attention.survey.expiresAt && <p className="mt-1 text-xs text-gray-500">El enlace vence el {formatLocalDate(attention.survey.expiresAt)}</p>}{attention.survey.response && <p className="mt-3 text-gray-700">Respuesta: {{ VERY_SATISFIED: "Muy satisfecho", SATISFIED: "Satisfecho", DISSATISFIED: "Insatisfecho", VERY_DISSATISFIED: "Muy insatisfecho" }[attention.survey.response]}</p>}{attention.survey.completedAt && <p className="mt-1 text-xs text-gray-500">Realizada el {formatLocalDate(attention.survey.completedAt)}</p>}{attention.survey.closedReason && <p className="mt-3 text-gray-600">{attention.survey.closedReason}</p>}</div>}
      </section>

      <section className="mt-6 rounded-lg border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><MapPin size={20} className="text-[#1A2855]" /><h2 className="font-semibold text-gray-900">Derivación</h2></div>
        {!attention.referral ? (
          <p className="text-sm text-gray-500">Esta atención no fue derivada a otra área.</p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="rounded-md bg-blue-50 p-4 text-blue-900">
              <p className="font-medium">Área de destino: {attention.referral.destinationAreaName}</p>
              <p className="mt-1 text-xs text-blue-700">Derivada por {attention.referral.referredByName} el {formatLocalDate(attention.referral.referredAt)}</p>
            </div>
            {attention.referral.status === "RESOLVED" ? (
              <div>
                <h3 className="font-medium text-gray-800">Conclusión de la derivación</h3>
                <p className="mt-2 whitespace-pre-wrap leading-6 text-gray-700">{attention.referral.conclusion}</p>
                <p className="mt-2 text-xs text-gray-500">Registrada por {attention.referral.concludedByName} el {formatLocalDate(attention.referral.concludedAt)}</p>
                <div className="mt-4 rounded-md border border-gray-200 p-4">
                  <h4 className="font-medium text-gray-800">Encuesta de la derivación</h4>
                  {!attention.referral.survey ? (
                    <p className="mt-2 text-gray-500">Sin encuesta asociada; la derivación fue resuelta antes de esta funcionalidad.</p>
                  ) : (
                    <div className="mt-2 space-y-1 text-gray-600">
                      <p>Estado: {{ QUEUED: "En cola de correo", SENT: "Enviada: esperando respuesta", COMPLETED: "Completada", SKIPPED: "Omitida", CANCELLED: "Cancelada" }[attention.referral.survey.status]}</p>
                      {attention.referral.survey.recipientEmail && <p>Destinatario: {attention.referral.survey.recipientEmail}</p>}
                      {attention.referral.survey.expiresAt && <p className="text-xs">El enlace vence el {formatLocalDate(attention.referral.survey.expiresAt)}</p>}
                      {attention.referral.survey.response && <p>Respuesta: {{ VERY_SATISFIED: "Muy satisfecho", SATISFIED: "Satisfecho", DISSATISFIED: "Insatisfecho", VERY_DISSATISFIED: "Muy insatisfecho" }[attention.referral.survey.response]}</p>}
                      {attention.referral.survey.completedAt && <p className="text-xs">Respondida el {formatLocalDate(attention.referral.survey.completedAt)}</p>}
                      {attention.referral.survey.closedReason && <p className="text-sm text-amber-700">{attention.referral.survey.closedReason}</p>}
                    </div>
                  )}
                </div>
              </div>
            ) : attention.referral.status === "PENDING" ? (
              <div>
                <div className="flex items-center gap-2 rounded-md bg-amber-50 p-3 text-amber-800"><CalendarClock size={18} /> Derivación pendiente de conclusión.</div>
                {canConcludeReferral && (
                  <form onSubmit={handleConcludeReferral} className="mt-4 rounded-md border border-blue-200 bg-blue-50/50 p-4">
                    <label htmlFor="referralConclusion" className="block font-medium text-gray-800">Conclusión del área *</label>
                    <p className="mt-1 text-xs text-gray-500">Esta conclusión es independiente de la conclusión original.</p>
                    <textarea id="referralConclusion" rows={4} maxLength={3000} value={referralConclusion} onChange={(event) => setReferralConclusion(event.target.value)} className="mt-3 block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500" placeholder="Describe la atención brindada por el área..." />
                    <div className="mt-3 flex justify-end"><button type="submit" disabled={isConcluding} className="btn btn-primary inline-flex items-center disabled:opacity-60"><Send size={17} className="mr-2" />{isConcluding ? "Registrando..." : "Registrar conclusión"}</button></div>
                  </form>
                )}
                {isAdmin && <button type="button" onClick={() => setShowReferralDisableModal(true)} className="mt-3 inline-flex items-center text-sm font-medium text-red-600 hover:underline"><ShieldX size={16} className="mr-1" />Inhabilitar derivación</button>}
              </div>
            ) : attention.referral.status === "DISABLED" ? <div className="rounded-md bg-red-50 p-4 text-red-700"><p className="font-medium">Derivación inhabilitada</p><p className="mt-2">{attention.referral.disabledReason}</p><p className="mt-1 text-xs">Por {attention.referral.disabledByName} el {formatLocalDate(attention.referral.disabledAt)}</p></div> : <div className="rounded-md bg-gray-100 p-4 text-gray-700"><p className="font-medium">Derivación cancelada</p><p className="mt-2">{attention.referral.cancelledReason}</p><p className="mt-1 text-xs">Por {attention.referral.cancelledByName} el {formatLocalDate(attention.referral.cancelledAt)}</p></div>}
          </div>
        )}
      </section>

      {showDisableModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="disable-title" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 id="disable-title" className="text-xl font-bold text-gray-900">Inhabilitar atención</h2><p className="mt-1 text-sm text-gray-500">El registro se conservará en el historial y solo será visible para administradores.</p></div><button type="button" onClick={() => setShowDisableModal(false)} disabled={isDisabling} aria-label="Cerrar" className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={20} /></button></div>
            <div className="mt-5"><label htmlFor="disableReason" className="block text-sm font-medium text-gray-700">Causa de inhabilitación *</label><textarea id="disableReason" rows={4} maxLength={1000} value={disableReason} onChange={(event) => setDisableReason(event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500" placeholder="Indica el motivo..." /></div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowDisableModal(false)} disabled={isDisabling} className="btn btn-secondary">Cancelar</button><button type="button" onClick={handleDisable} disabled={isDisabling} className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">{isDisabling ? "Inhabilitando..." : "Confirmar inhabilitación"}</button></div>
          </div>
        </div>
      )}
      {showReferralDisableModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 px-4"><div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Inhabilitar derivación</h2><p className="mt-1 text-sm text-gray-500">La atención seguirá activa, pero la derivación quedará cerrada.</p></div><button onClick={() => setShowReferralDisableModal(false)}><X size={20} /></button></div><label className="mt-5 block text-sm font-medium">Motivo *</label><textarea rows={4} maxLength={1000} value={referralDisableReason} onChange={(e) => setReferralDisableReason(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300" /><div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowReferralDisableModal(false)} className="btn btn-secondary">Cancelar</button><button disabled={isDisablingReferral} onClick={handleDisableReferral} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{isDisablingReferral ? "Inhabilitando..." : "Confirmar"}</button></div></div></div>
      )}
    </div>
  );
};

export default AttentionDetail;
