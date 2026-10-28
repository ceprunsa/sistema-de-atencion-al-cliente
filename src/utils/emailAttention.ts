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
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const toDateTimeLocalInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export const currentDateTimeLocalInput = () => toDateTimeLocalInput(new Date().toISOString());
