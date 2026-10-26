import { useQuery } from "@tanstack/react-query";
import { attentionsApi } from "../api/attentions";
import { useAuth } from "./useAuth";
import type { AttentionRegistrationBlockReason } from "../types";

const messages: Record<AttentionRegistrationBlockReason, string> = {
  NO_SESSION: "Debes iniciar sesión para registrar una atención.",
  INACTIVE_PROFILE: "Tu usuario no está activo. Solicita la revisión de un administrador.",
  TABLET_SESSION: "La sesión de la tablet solo puede utilizarse para responder encuestas.",
  NO_ACTIVE_WORKSTATION: "Necesitas una mesa de trabajo activa asignada para registrar atenciones.",
  PENDING_SURVEY: "Debes completar u omitir la encuesta pendiente antes de registrar otra atención.",
};

export const getAttentionRegistrationMessage = (
  reason: AttentionRegistrationBlockReason | null | undefined,
) => reason ? messages[reason] : "No puedes registrar una atención en este momento.";

export const useAttentionRegistrationAccess = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["attentions", "registration-access", user?.id],
    queryFn: attentionsApi.getRegistrationState,
    enabled: !!user,
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
};
