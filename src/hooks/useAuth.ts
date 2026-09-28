import { useAuthStore } from "../store/authStore";

/**
 * Hook de compatibilidad — delega al store de Zustand.
 * Todo el código existente que use useAuth() sigue funcionando sin cambios.
 */
export const useAuth = () => useAuthStore();
