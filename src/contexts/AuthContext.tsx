import { createContext, type ReactNode } from "react";
import { useAuthStore } from "../store/authStore";

export type AuthContextType = ReturnType<typeof useAuthStore>;

export const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Provider de compatibilidad. La fuente real de autenticacion es Zustand
 * y se conecta directamente con Supabase.
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const auth = useAuthStore();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};
