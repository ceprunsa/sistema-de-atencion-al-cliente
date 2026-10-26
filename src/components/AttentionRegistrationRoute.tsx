import type { ReactNode } from "react";
import { AlertTriangle, Loader2, Monitor } from "lucide-react";
import { Link } from "react-router-dom";
import {
  getAttentionRegistrationMessage,
  useAttentionRegistrationAccess,
} from "../hooks/useAttentionRegistrationAccess";

interface AttentionRegistrationRouteProps {
  children: ReactNode;
}

const AttentionRegistrationRoute = ({ children }: AttentionRegistrationRouteProps) => {
  const access = useAttentionRegistrationAccess();

  if (access.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
        <Loader2 size={20} className="animate-spin" /> Verificando mesa de trabajo...
      </div>
    );
  }

  if (access.isError) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0" size={22} />
          <div>
            <h1 className="font-semibold">No se pudo verificar tu mesa de trabajo</h1>
            <p className="mt-1 text-sm">
              {access.error instanceof Error ? access.error.message : "Intenta nuevamente."}
            </p>
            <button type="button" onClick={() => void access.refetch()} className="btn btn-secondary mt-4">
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const state = access.data;
  if (state?.allowed || state?.reason === "PENDING_SURVEY") {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
      <div className="flex items-start gap-3">
        <Monitor className="mt-0.5 shrink-0" size={22} />
        <div>
          <h1 className="font-semibold">Registro de atención no disponible</h1>
          <p className="mt-1 text-sm">{getAttentionRegistrationMessage(state?.reason)}</p>
          <Link to="/attentions" className="btn btn-secondary mt-4 inline-flex">
            Volver a atenciones
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AttentionRegistrationRoute;
