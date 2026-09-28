import {
  supabase,
  supabaseAuthStorage,
  SUPABASE_STORAGE_KEY,
} from "./config";

const SESSION_SUFFIXES = ["", "-code-verifier", "-user"];

export const withTimeout = async <T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

/** Elimina únicamente datos locales de autenticación de Supabase. */
export const clearSupabaseStorage = () => {
  const exactKeys = new Set(
    SESSION_SUFFIXES.map((suffix) => `${SUPABASE_STORAGE_KEY}${suffix}`),
  );

  exactKeys.forEach((key) => supabaseAuthStorage.removeItem(key));

  if (typeof window === "undefined") return;

  try {
    Object.keys(window.localStorage).forEach((key) => {
      const isCurrentSession = exactKeys.has(key);
      const isLegacySession = key.startsWith("sb-") && key.includes("auth-token");

      if (isCurrentSession || isLegacySession) {
        window.localStorage.removeItem(key);
      }
    });
  } catch {
    // El adaptador en memoria ya se limpió; no hay nada más que recuperar.
  }
};

export const isInvalidSessionError = (error: unknown) => {
  const candidate = error as { name?: string; message?: string; status?: number };
  const name = candidate?.name?.toLowerCase() || "";
  const message = candidate?.message?.toLowerCase() || "";

  return (
    name.includes("invalidtoken") ||
    name.includes("sessionmissing") ||
    candidate?.status === 401 ||
    message.includes("invalid jwt") ||
    message.includes("jwt expired") ||
    message.includes("refresh token") ||
    message.includes("token is expired")
  );
};

export const isConnectionError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("tiempo de espera") ||
    message.includes("api key") ||
    message.includes("fetch")
  );
};

/** Recuperación local: no depende de que Supabase esté disponible. */
export const clearSupabaseCache = async () => {
  clearSupabaseStorage();

  try {
    await withTimeout(
      supabase.auth.signOut({ scope: "local" }),
      2_000,
      "Tiempo de espera agotado al cerrar la sesión local.",
    );
  } catch (error) {
    console.warn("No se pudo notificar el cierre local a Supabase:", error);
  } finally {
    clearSupabaseStorage();
  }

  return true;
};

export const refreshSession = async () => {
  try {
    const { data, error } = await withTimeout(
      supabase.auth.getSession(),
      8_000,
      "Tiempo de espera agotado al verificar la sesión.",
    );

    if (error || !data.session) return null;

    const expiresAt = data.session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt && expiresAt - now < 60 * 60) {
      const refreshed = await withTimeout(
        supabase.auth.refreshSession(),
        8_000,
        "Tiempo de espera agotado al renovar la sesión.",
      );
      return refreshed.error ? null : refreshed.data.session;
    }

    return data.session;
  } catch (error) {
    console.error("No se pudo refrescar la sesión:", error);
    return null;
  }
};
