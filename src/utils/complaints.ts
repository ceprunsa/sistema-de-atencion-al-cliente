import type { ComplaintStatus } from "../types";

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  PENDING_MANAGEMENT: "Pendiente de gestión",
  IN_MANAGEMENT: "En gestión",
  WAITING_CLIENT_RESPONSE: "Esperando respuesta del cliente",
  RETURNED_BY_CLIENT: "Devuelta por desacuerdo del cliente",
  PENDING_CLOSURE_REVIEW: "Pendiente de revisión de cierre",
  RETURNED_BY_CLOSURE: "Devuelta por observaciones de cierre",
  PENDING_SAC_EVALUATION: "Pendiente de evaluación SAC",
  CLOSED_AGREED: "Cerrada con conformidad",
  CLOSED_NO_RESPONSE: "Cerrada sin respuesta",
};

export const COMPLAINT_STATUS_OPTIONS = Object.entries(
  COMPLAINT_STATUS_LABELS,
) as Array<[ComplaintStatus, string]>;

export const complaintStatusClass = (status: ComplaintStatus) => {
  if (status === "CLOSED_AGREED") {
    return "bg-green-100 text-green-800";
  }
  if (status === "CLOSED_NO_RESPONSE") {
    return "bg-gray-200 text-gray-700";
  }
  if (
    status === "RETURNED_BY_CLIENT"
    || status === "RETURNED_BY_CLOSURE"
  ) {
    return "bg-red-100 text-red-800";
  }
  if (
    status === "PENDING_CLOSURE_REVIEW"
    || status === "PENDING_SAC_EVALUATION"
  ) {
    return "bg-purple-100 text-purple-800";
  }
  if (status === "WAITING_CLIENT_RESPONSE") {
    return "bg-cyan-100 text-cyan-800";
  }
  return "bg-amber-100 text-amber-900";
};

const humanizeComplaintCode = (value: string) => {
  const normalized = value.trim().replace(/_/g, " ").toLocaleLowerCase("es-PE");
  return normalized ? normalized.charAt(0).toLocaleUpperCase("es-PE") + normalized.slice(1) : "Sin estado";
};

const RESPONSE_STATUS_LABELS: Record<string, string> = {
  QUEUED: "Correo en cola",
  SENT: "Esperando respuesta del cliente",
  AGREED: "Cliente conforme",
  DISAGREED: "Cliente en desacuerdo",
  EXPIRED: "Plazo vencido sin respuesta",
  INVALIDATED: "Enlace reemplazado",
  DELIVERY_FAILED: "No se pudo entregar el correo",
};

const COMMUNICATION_TYPE_LABELS: Record<string, string> = {
  COMPLAINT_CREATED: "Aviso de nueva queja al área responsable",
  CLIENT_RESPONSE_REQUESTED: "Respuesta de la gestión enviada al cliente",
  CLIENT_AGREED: "Conformidad del cliente",
  CLIENT_DISAGREED: "Desacuerdo del cliente",
  CLIENT_RESPONSE_EXPIRED: "Aviso de vencimiento al área de cierre",
  CLOSURE_RETURNED: "Devolución del área de cierre",
};

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente de envío",
  PROCESSING: "Procesando envío",
  RETRY: "Pendiente de reintento",
  SENT: "Correo entregado al proveedor",
  FAILED_PERMANENT: "Envío fallido",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  CREATED: "Queja registrada",
  MANAGEMENT_STARTED: "Gestión iniciada por el área responsable",
  ACTION_VERSION_RECORDED: "Nueva versión de gestión registrada",
  CLIENT_NOTIFICATION_QUEUED: "Respuesta al cliente puesta en cola",
  CLIENT_NOTIFICATION_SENT: "Respuesta enviada al cliente",
  CLIENT_NOTIFICATION_FAILED: "Falló el envío de la respuesta al cliente",
  CLIENT_AGREED: "El cliente expresó su conformidad",
  CLIENT_DISAGREED: "El cliente expresó su desacuerdo",
  CLIENT_RESPONSE_EXPIRED: "Venció el plazo de respuesta del cliente",
  CLOSURE_REVIEWED: "Revisión del área de cierre registrada",
  CLOSURE_RETURNED: "Queja devuelta por el área de cierre",
  SAC_DECIDED: "Decisión sobre apertura de SAC registrada",
  SAC_CREATED: "Solicitud de Acción Correctiva generada",
  STATUS_CHANGED: "Estado de la queja actualizado",
};

export const complaintResponseStatusLabel = (value: string) =>
  RESPONSE_STATUS_LABELS[value] || humanizeComplaintCode(value);

export const complaintCommunicationTypeLabel = (value: string) =>
  COMMUNICATION_TYPE_LABELS[value] || humanizeComplaintCode(value);

export const complaintDeliveryStatusLabel = (value?: string | null) =>
  value ? DELIVERY_STATUS_LABELS[value] || humanizeComplaintCode(value) : "Sin información de envío";

export const complaintEventTypeLabel = (value: string) =>
  EVENT_TYPE_LABELS[value] || humanizeComplaintCode(value);
