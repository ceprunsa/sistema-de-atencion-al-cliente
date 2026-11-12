import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareWarning,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useComplaintDetail } from "../hooks/useComplaints";
import {
  COMPLAINT_STATUS_LABELS,
  complaintCommunicationTypeLabel,
  complaintDeliveryStatusLabel,
  complaintEventTypeLabel,
  complaintResponseStatusLabel,
  complaintStatusClass,
} from "../utils/complaints";
import { formatLocalDate } from "../utils/dateUtils";
import ComplaintManagementPanel from "../components/ComplaintManagementPanel";
import ComplaintClosureReviewPanel from "../components/ComplaintClosureReviewPanel";
import ComplaintSacDecisionPanel from "../components/ComplaintSacDecisionPanel";

const valueOrEmpty = (value?: string | null) => value?.trim() || "No registrado";

const ComplaintDetail = () => {
  const { id } = useParams<{ id: string }>();
  const detail = useComplaintDetail(id);

  if (detail.isLoading) {
    return <p className="py-16 text-center text-gray-500">Cargando queja...</p>;
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
        <h1 className="font-semibold">No se pudo abrir la queja</h1>
        <p className="mt-1 text-sm">
          {detail.error instanceof Error
            ? detail.error.message
            : "El expediente no existe o no tienes permiso para consultarlo."}
        </p>
        <Link to="/complaints" className="btn btn-secondary mt-4 inline-flex">
          Volver al listado
        </Link>
      </div>
    );
  }

  const complaint = detail.data;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Link
            to="/complaints"
            className="mb-3 inline-flex items-center text-sm text-blue-700 hover:underline"
          >
            <ArrowLeft size={16} className="mr-1" />
            Volver a quejas
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <MessageSquareWarning className="text-[#1A2855]" />
            {complaint.complaintCode}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Registrada el {formatLocalDate(complaint.createdAt)} por{" "}
            {complaint.createdByName}
          </p>
        </div>
        <span className={"inline-flex self-start rounded-full px-3 py-1.5 text-sm font-medium " + complaintStatusClass(complaint.status)}>
          {COMPLAINT_STATUS_LABELS[complaint.status]}
        </span>
      </div>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900">Descripción de la queja</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
          {complaint.description}
        </p>
      </section>

      {complaint.permissions.canManageResponsible && (
        <ComplaintManagementPanel
          complaintId={complaint.id}
          status={complaint.status}
        />
      )}

      {complaint.permissions.canManageClosure && (
        <ComplaintClosureReviewPanel
          complaintId={complaint.id}
          status={complaint.status}
        />
      )}

      {complaint.permissions.canManageClosure && (
        <ComplaintSacDecisionPanel
          complaintId={complaint.id}
          status={complaint.status}
          hasClosureReview={complaint.closureReviews.length > 0}
          hasDecision={Boolean(complaint.sacDecision)}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900">
            <UserRound size={19} className="text-[#1A2855]" />
            Cliente
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-gray-500">Nombre</dt><dd className="font-medium">{complaint.client.displayName}</dd></div>
            <div><dt className="text-gray-500">DNI</dt><dd>{complaint.client.dni}</dd></div>
            <div><dt className="text-gray-500">Primer nombre</dt><dd>{complaint.client.firstName}</dd></div>
            <div><dt className="text-gray-500">Segundo nombre</dt><dd>{valueOrEmpty(complaint.client.middleName)}</dd></div>
            <div><dt className="text-gray-500">Apellido paterno</dt><dd>{complaint.client.paternalSurname}</dd></div>
            <div><dt className="text-gray-500">Apellido materno</dt><dd>{complaint.client.maternalSurname}</dd></div>
            <div><dt className="text-gray-500">Correo</dt><dd className="break-all">{complaint.client.email}</dd></div>
            <div><dt className="text-gray-500">Teléfono</dt><dd>{valueOrEmpty(complaint.client.phone)}</dd></div>
          </dl>
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900">
            <ShieldCheck size={19} className="text-[#1A2855]" />
            Asignación y acceso
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-gray-500">Medio</dt><dd>{complaint.serviceChannel.name}</dd></div>
            <div><dt className="text-gray-500">Área responsable</dt><dd>{complaint.responsibleArea.name}</dd></div>
            <div><dt className="text-gray-500">Área de cierre</dt><dd>{complaint.closureArea.name}</dd></div>
            <div>
              <dt className="text-gray-500">RAC vinculado</dt>
              <dd>
                {complaint.linkedAttention ? (
                  <Link
                    to={"/attentions/" + complaint.linkedAttention.id}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {complaint.linkedAttention.racCode}
                  </Link>
                ) : "Queja independiente"}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4 text-xs">
            {complaint.permissions.isCreator && (
              <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-800">
                Creador
              </span>
            )}
            {complaint.permissions.canManageResponsible && (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">
                Gestión del área responsable
              </span>
            )}
            {complaint.permissions.canManageClosure && (
              <span className="rounded-full bg-purple-100 px-2 py-1 text-purple-800">
                Gestión del área de cierre
              </span>
            )}
            {complaint.permissions.isAdmin && (
              <span className="rounded-full bg-green-100 px-2 py-1 text-green-800">
                Visión administrativa
              </span>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900">Versiones de la gestión</h2>
        {complaint.actionVersions.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            El área responsable todavía no registró una respuesta.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {complaint.actionVersions.map((version) => {
              const response = complaint.clientResponses.find(
                (item) => item.actionVersionId === version.id,
              );
              return (
                <article key={version.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">
                      Versión {version.versionNumber} ·{" "}
                      {version.proceeds ? "Procede" : "No procede"}
                    </h3>
                    <span className="text-xs text-gray-500">
                      {formatLocalDate(version.recordedAt)} · {version.recordedByName}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
                    <div><p className="font-medium text-gray-600">Análisis</p><p className="mt-1 whitespace-pre-wrap">{version.analysis}</p></div>
                    <div><p className="font-medium text-gray-600">Acciones</p><p className="mt-1 whitespace-pre-wrap">{version.actions}</p></div>
                  </div>
                  {version.clientExplanation && (
                    <div className="mt-3 rounded-md bg-gray-50 p-3 text-sm">
                      <p className="font-medium text-gray-600">Explicación al cliente</p>
                      <p className="mt-1 whitespace-pre-wrap">{version.clientExplanation}</p>
                    </div>
                  )}
                  {response && (
                    <div className="mt-3 text-xs text-gray-600">
                      Respuesta: <strong>{complaintResponseStatusLabel(response.status)}</strong>
                      {response.sentAt && " · Enviada " + formatLocalDate(response.sentAt)}
                      {response.respondedAt && " · Respondida " + formatLocalDate(response.respondedAt)}
                      {response.disagreementReason && (
                        <p className="mt-2 whitespace-pre-wrap text-red-700">
                          Motivo: {response.disagreementReason}
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900">
            <Mail size={19} className="text-[#1A2855]" />
            Comunicaciones
          </h2>
          {complaint.communications.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Sin comunicaciones.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {complaint.communications.map((communication) => (
                <div key={communication.id} className="rounded-md border p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <p className="font-medium">
                      {complaintCommunicationTypeLabel(communication.type)}
                    </p>
                    <span className="text-xs text-gray-500">
                      {complaintDeliveryStatusLabel(communication.deliveryStatus)}
                    </span>
                  </div>
                  <p className="mt-1 break-all text-gray-600">{communication.recipientEmail}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatLocalDate(communication.createdAt)}</p>
                  {communication.lastErrorMessage && (
                    <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
                      {communication.lastErrorCode}: {communication.lastErrorMessage}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 font-semibold text-gray-900">
            <CheckCircle2 size={19} className="text-[#1A2855]" />
            Cierre y SAC
          </h2>
          {complaint.closureReviews.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Sin revisiones de cierre.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {complaint.closureReviews.map((review) => (
                <div key={review.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">
                    Revisión {review.reviewNumber}: {review.isAdequate ? "Adecuada" : "Observada"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{review.observations}</p>
                  <p className="mt-2 text-xs text-gray-500">
                    {review.reviewedByName} · {formatLocalDate(review.reviewedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
          {complaint.sacDecision && (
            <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-medium">
                Apertura SAC: {complaint.sacDecision.shouldCreateSac ? "Sí" : "No"}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{complaint.sacDecision.comments}</p>
              {complaint.sac && <p className="mt-2 font-semibold">{complaint.sac.sacCode}</p>}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-gray-900">
          <Clock3 size={19} className="text-[#1A2855]" />
          Historial
        </h2>
        <ol className="mt-4 space-y-3">
          {complaint.events.map((event) => (
            <li key={event.id} className="border-l-2 border-blue-200 pl-4 text-sm">
              <p className="font-medium text-gray-800">
                {complaintEventTypeLabel(event.type)}
              </p>
              <p className="text-xs text-gray-500">
                {formatLocalDate(event.occurredAt)}
                {event.actorName ? " · " + event.actorName : " · Sistema"}
              </p>
              {event.notes && <p className="mt-1 whitespace-pre-wrap">{event.notes}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
};

export default ComplaintDetail;
