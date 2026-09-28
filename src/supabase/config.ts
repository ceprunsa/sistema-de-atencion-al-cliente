import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const SUPABASE_STORAGE_KEY = "sb-auth-token";

const memoryStorage = new Map<string, string>();
const memoryStorageAdapter = {
  getItem: (key: string) => memoryStorage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memoryStorage.set(key, value);
  },
  removeItem: (key: string) => {
    memoryStorage.delete(key);
  },
};

const getAuthStorage = () => {
  try {
    const storage = window.localStorage;
    const probeKey = `${SUPABASE_STORAGE_KEY}-storage-probe`;
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    console.warn(
      "localStorage no está disponible; la sesión solo persistirá en memoria.",
    );
    return memoryStorageAdapter;
  }
};

export const supabaseAuthStorage = getAuthStorage();

const getConfigurationError = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return "Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.";
  }

  if (supabaseAnonKey.trim().length < 20 || /\s/.test(supabaseAnonKey)) {
    return "VITE_SUPABASE_ANON_KEY parece incompleta o inválida.";
  }

  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return "VITE_SUPABASE_URL debe usar HTTPS.";
    }
  } catch {
    return "VITE_SUPABASE_URL no es una URL válida.";
  }

  return null;
};

export const supabaseConfigurationError = getConfigurationError();

export const verifySupabaseConnection = async () => {
  if (supabaseConfigurationError) {
    throw new Error(supabaseConfigurationError);
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`,
    {
      headers: {
        apikey: supabaseAnonKey,
      },
    },
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("La clave pública de Supabase es incorrecta.");
    }
    throw new Error(`Supabase respondió con el estado ${response.status}.`);
  }
};

// El cliente necesita valores válidos para construirse. Los valores locales
// solo evitan que una configuración rota deje la aplicación en blanco; ninguna
// petición se realiza cuando supabaseConfigurationError está definido.
const clientUrl = supabaseConfigurationError
  ? "http://127.0.0.1:54321"
  : supabaseUrl;
const clientKey = supabaseConfigurationError
  ? "invalid-configuration"
  : supabaseAnonKey;

// Configuración explícita para persistencia de sesión
export const supabase = createClient<Database>(clientUrl, clientKey, {
  auth: {
    persistSession: true, // Asegurar que la sesión persista
    storageKey: SUPABASE_STORAGE_KEY, // Clave para almacenar el token
    autoRefreshToken: true, // Refrescar automáticamente el token
    detectSessionInUrl: true, // Detectar sesión en URL (para OAuth)
    storage: supabaseAuthStorage,
  },
});
