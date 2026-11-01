export const buildEmailOriginalText = (subject: string, body: string) => {
  const normalizedSubject = subject.trim();
  const normalizedBody = body.trim();
  return [
    normalizedSubject ? `Asunto:\n${normalizedSubject}` : "",
    normalizedBody ? `Mensaje:\n${normalizedBody}` : "",
  ].filter(Boolean).join("\n\n");
};

export const toOptionalIsoDateTime = (value: string) => {
  if (!value) return null;
  const date = new Date(`${value}:00-05:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const toDateTimeLocalInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
};

export const currentDateTimeLocalInput = () => toDateTimeLocalInput(new Date().toISOString());

export const formatLimaDateTime = (value?: string | null) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};
