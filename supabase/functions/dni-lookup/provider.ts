export type DniProviderResult =
  | {
      status: "FOUND";
      person: {
        firstName: string;
        middleName: string | null;
        paternalSurname: string;
        maternalSurname: string;
      };
      providerStatus: number;
    }
  | { status: "NOT_FOUND"; providerStatus: number };

export class DniProviderError extends Error {
  constructor(
    message: string,
    readonly code: "PROVIDER_ERROR" | "INVALID_RESPONSE",
    readonly providerStatus: number | null,
  ) {
    super(message);
  }
}

const cleanName = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 150);
};

const fetchWithTimeout = async (url: string, token: string | undefined, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const lookupDniAtProvider = async (options: {
  baseUrl: string;
  bearerToken?: string;
  dni: string;
  timeoutMs?: number;
}): Promise<DniProviderResult> => {
  const url = `${options.baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(options.dni)}`;
  let response: Response | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      response = await fetchWithTimeout(url, options.bearerToken, options.timeoutMs ?? 15000);
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      throw new DniProviderError(
        timedOut ? "La consulta externa excedió el tiempo máximo." : "No se pudo contactar al proveedor de DNI.",
        "PROVIDER_ERROR",
        null,
      );
    }
    if (![502, 503, 504].includes(response.status) || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!response) throw new DniProviderError("No se recibió respuesta del proveedor de DNI.", "PROVIDER_ERROR", null);

  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw new DniProviderError("El proveedor devolvió una respuesta no válida.", "INVALID_RESPONSE", response.status);
  }

  const providerMessage = typeof payload.message === "string" ? payload.message.toLowerCase() : "";
  if (response.status === 404 || providerMessage.includes("no se encontr")) {
    return { status: "NOT_FOUND", providerStatus: response.status };
  }
  if (payload.success === false) {
    throw new DniProviderError("El proveedor no pudo completar la consulta.", "PROVIDER_ERROR", response.status);
  }
  if (!response.ok) {
    throw new DniProviderError("El proveedor de DNI no pudo completar la consulta.", "PROVIDER_ERROR", response.status);
  }

  if ("success" in payload && payload.success !== true) {
    throw new DniProviderError("El proveedor devolvió un estado de respuesta no válido.", "INVALID_RESPONSE", response.status);
  }

  const returnedDni = String(payload.dni ?? payload.numero ?? "").replace(/\D/g, "");
  const givenNames = cleanName(payload.nombres);
  const paternalSurname = cleanName(payload.apellidoPaterno ?? payload.apellido_paterno);
  const maternalSurname = cleanName(payload.apellidoMaterno ?? payload.apellido_materno);
  if (returnedDni !== options.dni || !givenNames || !paternalSurname || !maternalSurname) {
    throw new DniProviderError("El proveedor devolvió datos incompletos o de otro documento.", "INVALID_RESPONSE", response.status);
  }

  const [firstName, ...remainingNames] = givenNames.split(" ");
  return {
    status: "FOUND",
    providerStatus: response.status,
    person: {
      firstName,
      middleName: remainingNames.join(" ") || null,
      paternalSurname,
      maternalSurname,
    },
  };
};
