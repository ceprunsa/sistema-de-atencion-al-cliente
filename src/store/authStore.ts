import { create } from "zustand";
import {
  supabase,
  supabaseConfigurationError,
  verifySupabaseConnection,
} from "../supabase/config";
import {
  clearSupabaseCache,
  isConnectionError,
  isInvalidSessionError,
  withTimeout,
} from "../supabase/utils";
import { usersApi } from "../api/users";
import type { User, UserProfile } from "../types";
import type { Session } from "@supabase/supabase-js";
import toast from "react-hot-toast";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  isAdmin: boolean;
  authError: string | null;

  loginWithGoogle: () => Promise<boolean | undefined>;
  logout: () => Promise<void>;
  recoverSession: () => Promise<void>;
  createUser: (userData: Partial<User>) => Promise<boolean | undefined>;

  startAuthListener: () => () => void;
  _setUser: (user: User | null) => void;
  _setSession: (session: Session | null) => void;
  _setLoading: (loading: boolean) => void;
  _setInitialized: (initialized: boolean) => void;
}

const mapSupabaseUser = (profile: UserProfile, email?: string): User => {
  const mainRole = profile.roles?.[0]?.key || "USER";
  const displayName = [profile.firstName, profile.middleName, profile.paternalSurname, profile.maternalSurname]
    .filter(Boolean)
    .join(" ");

  return {
    id: profile.id,
    email: email || profile.email || "",
    displayName,
    accountName: profile.accountName,
    photoURL: profile.photoURL,
    role: mainRole.toLowerCase() as "admin" | "user",
    firstName: profile.firstName,
    middleName: profile.middleName,
    paternalSurname: profile.paternalSurname,
    maternalSurname: profile.maternalSurname,
    phone: profile.phone,
    additionalEmail: profile.additionalEmail,
    areaId: profile.areaId,
    area: profile.area,
    status: profile.status,
    roles: profile.roles,
    createdAt: profile.createdAt,
    createdBy: profile.createdBy,
  };
};

const getAuthUserMetadata = (session: Session) => ({
  id: session.user.id,
  email: session.user.email || "",
  accountName:
    (session.user.user_metadata?.full_name as string | undefined) ||
    (session.user.user_metadata?.name as string | undefined) ||
    null,
  photoURL: (session.user.user_metadata?.avatar_url as string | undefined) || null,
});

const handleSupabaseError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Error de conexion. Verifica tu red e intenta nuevamente.";

  toast.error(message, { id: "auth-error" });
  toast.dismiss("login");
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,
  isAdmin: false,
  authError: null,

  _setUser: (user) => set({ user, isAdmin: user?.role === "admin" }),
  _setSession: (session) => set({ session }),
  _setLoading: (loading) => set({ loading }),
  _setInitialized: (initialized) => set({ initialized }),

  startAuthListener: () => {
    if (supabaseConfigurationError) {
      set({
        user: null,
        session: null,
        isAdmin: false,
        loading: false,
        initialized: true,
        authError: `Configuración de Supabase inválida: ${supabaseConfigurationError}`,
      });
      return () => undefined;
    }

    const lastLoadedUser = { current: null as string | null };
    const profileLoad = {
      userId: null as string | null,
      promise: null as Promise<void> | null,
    };

    let automaticRecoveryUsed = false;

    const clearAuthState = (authError: string | null = null) => {
      lastLoadedUser.current = null;
      profileLoad.userId = null;
      profileLoad.promise = null;
      set({
        user: null,
        session: null,
        isAdmin: false,
        loading: false,
        initialized: true,
        authError,
      });
    };

    const recoverInvalidSession = async () => {
      if (!automaticRecoveryUsed) {
        automaticRecoveryUsed = true;
        await clearSupabaseCache();
      }
      clearAuthState(
        "La sesión almacenada era inválida y se limpió automáticamente. Inicia sesión nuevamente.",
      );
    };

    const loadProfileFromSession = async (newSession: Session) => {
      set({ session: newSession, loading: true, authError: null });

      if (lastLoadedUser.current === newSession.user.id && get().user) {
        set({ loading: false, initialized: true });
        return;
      }

      if (
        profileLoad.userId === newSession.user.id &&
        profileLoad.promise
      ) {
        await profileLoad.promise;
        return;
      }

      lastLoadedUser.current = newSession.user.id;

      const loadPromise = (async () => {
        const profile = await withTimeout(
          usersApi.getProfile(getAuthUserMetadata(newSession)),
          12_000,
          "Tiempo de espera agotado al conectar con Supabase.",
        );
        const user = mapSupabaseUser(profile, newSession.user.email);

        set({
          user,
          isAdmin: user.role === "admin",
          loading: false,
          initialized: true,
          authError: null,
        });
      })();

      profileLoad.userId = newSession.user.id;
      profileLoad.promise = loadPromise;

      try {
        await loadPromise;
      } catch (error) {
        console.error("[Auth] Error al cargar perfil desde Supabase:", error);
        lastLoadedUser.current = null;
        if (isInvalidSessionError(error)) {
          await recoverInvalidSession();
        } else if (isConnectionError(error)) {
          const message =
            "No se pudo conectar con Supabase. Verifica la URL, la clave pública y la conexión.";
          handleSupabaseError(new Error(message));
          clearAuthState(message);
        } else {
          handleSupabaseError(error);
          await clearSupabaseCache();
          clearAuthState(
            error instanceof Error ? error.message : "No se pudo cargar el perfil.",
          );
        }
      } finally {
        if (profileLoad.promise === loadPromise) {
          profileLoad.userId = null;
          profileLoad.promise = null;
        }
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (
          (event === "SIGNED_IN" ||
            event === "INITIAL_SESSION" ||
            event === "TOKEN_REFRESHED") &&
          newSession
        ) {
          setTimeout(() => {
            void loadProfileFromSession(newSession);
          }, 0);
          return;
        }

        if (event === "SIGNED_OUT" || !newSession) {
          clearAuthState();
        }
      },
    );

    const initializationTimer = window.setTimeout(() => {
      if (get().user) return;

      void withTimeout(
        verifySupabaseConnection(),
        8_000,
        "Tiempo de espera agotado al conectar con Supabase.",
      )
        .then(() => {
          if (get().initialized) return null;
          return withTimeout(
            supabase.auth.getSession(),
            8_000,
            "Tiempo de espera agotado al verificar la sesión.",
          );
        })
        .then((result) => {
          if (!result) return undefined;
          const { data, error } = result;
          if (error) throw error;
          if (data.session) return loadProfileFromSession(data.session);
          clearAuthState();
          return undefined;
        })
        .catch((error) => {
          console.error("[Auth] Error al restaurar sesion:", error);
          if (isInvalidSessionError(error)) {
            void recoverInvalidSession();
            return;
          }

          const message = isConnectionError(error)
            ? "No se pudo conectar con Supabase. Verifica la configuración o la conexión."
            : error instanceof Error
              ? error.message
              : "No se pudo restaurar la sesión.";
          handleSupabaseError(new Error(message));
          clearAuthState(message);
        });
    }, 500);

    const safetyTimer = window.setTimeout(() => {
      if (!get().initialized) {
        clearAuthState(
          "Supabase no respondió a tiempo. Puedes limpiar la sesión o reintentar.",
        );
      }
    }, 15_000);

    return () => {
      window.clearTimeout(initializationTimer);
      window.clearTimeout(safetyTimer);
      authListener.subscription.unsubscribe();
    };
  },

  loginWithGoogle: async () => {
    try {
      if (supabaseConfigurationError) {
        throw new Error(
          `Configuración de Supabase inválida: ${supabaseConfigurationError}`,
        );
      }

      const { error } = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/dashboard`,
          },
        }),
        8_000,
        "Supabase no respondió al iniciar sesión.",
      );

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("[Auth] Error al iniciar sesion con Google:", error);
      const message = isConnectionError(error)
        ? "No se pudo conectar con Supabase. Verifica la URL, la clave pública y la conexión."
        : error instanceof Error
          ? error.message
          : "No se pudo iniciar sesión.";
      set({ authError: message, loading: false, initialized: true });
      throw error;
    }
  },

  logout: async () => {
    try {
      set({ loading: true });
      await withTimeout(
        supabase.auth.signOut(),
        5_000,
        "Supabase no respondió al cerrar sesión.",
      );

      set({
        user: null,
        session: null,
        isAdmin: false,
        authError: null,
      });
    } catch (error) {
      console.error("[Auth] Error inesperado al cerrar sesion:", error);
      // La limpieza local del bloque finally evita que la UI quede atrapada.
    } finally {
      // La salida local siempre debe funcionar aunque el servidor no responda.
      await clearSupabaseCache();
      set({ loading: false, initialized: true });
    }
  },

  recoverSession: async () => {
    set({ loading: true });
    await clearSupabaseCache();
    set({
      user: null,
      session: null,
      isAdmin: false,
      loading: false,
      initialized: true,
      authError: supabaseConfigurationError
        ? `Configuración de Supabase inválida: ${supabaseConfigurationError}`
        : null,
    });
  },

  createUser: async (userData: Partial<User>) => {
    try {
      if (!userData.email) {
        throw new Error("El correo electronico es requerido");
      }

      const roleKey = userData.role === "admin" ? "ADMIN" : "USER";
      if (!userData.firstName || !userData.paternalSurname || !userData.maternalSurname) {
        throw new Error("Completa el primer nombre y ambos apellidos");
      }
      await usersApi.inviteUser({
        email: userData.email,
        firstName: userData.firstName,
        middleName: userData.middleName || null,
        paternalSurname: userData.paternalSurname,
        maternalSurname: userData.maternalSurname,
        phone: userData.phone || null,
        additionalEmail: userData.additionalEmail || null,
        areaId: userData.areaId || null,
      }, roleKey);
      return true;
    } catch (error) {
      console.error("[Auth] Error al crear usuario:", error);
      throw error;
    }
  },
}));
