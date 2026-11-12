import { useState, type FormEvent } from "react";
import { FileWarning, LoaderCircle, Save } from "lucide-react";
import toast from "react-hot-toast";
import { useComplaintSacDecision } from "../hooks/useComplaints";
import type { ComplaintStatus } from "../types";

interface ComplaintSacDecisionPanelProps {
  complaintId: string;
  status: ComplaintStatus;
  hasClosureReview: boolean;
  hasDecision: boolean;
}

const ComplaintSacDecisionPanel = ({
  complaintId,
  status,
  hasClosureReview,
  hasDecision,
}: ComplaintSacDecisionPanelProps) => {
  const decision = useComplaintSacDecision(complaintId);
  const [shouldCreateSac, setShouldCreateSac] = useState<"YES" | "NO">("NO");
  const [comments, setComments] = useState("");
  const automaticClosure = status === "CLOSED_NO_RESPONSE";
  const canDecide = status === "PENDING_SAC_EVALUATION"
    || (automaticClosure && hasClosureReview);

  if (!canDecide || hasDecision) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!comments.trim()) {
      toast.error("Registra los comentarios de la decisión SAC.");
      return;
    }
    try {
      const result = await decision.mutateAsync({
        shouldCreateSac: shouldCreateSac === "YES",
        comments,
      });
      setComments("");
      if (result.sacCode) {
        toast.success(`Se generó correctamente la ${result.sacCode}.`);
      } else if (result.followUpOnly) {
        toast.success("La decisión SAC fue registrada sin modificar el cierre por falta de respuesta.");
      } else {
        toast.success("La decisión fue registrada y la queja quedó cerrada.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar la decisión SAC.");
    }
  };

  return (
    <section className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold text-gray-900">
        <FileWarning size={19} className="text-blue-700" />
        Evaluación de apertura de SAC
      </h2>
      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        Se generará una SAC si la queja es recurrente o incumple algún requisito con el cliente. Esta evaluación corresponde al área encargada del cierre.
      </div>
      {automaticClosure && (
        <p className="mt-3 text-sm text-gray-600">
          La decisión quedará asociada al seguimiento, pero el expediente conservará el cierre por falta de respuesta.
        </p>
      )}

      <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">
            ¿Corresponde generar una Solicitud de Acción Correctiva?
          </legend>
          <div className="mt-2 flex gap-5">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="create-sac"
                checked={shouldCreateSac === "YES"}
                onChange={() => setShouldCreateSac("YES")}
              />
              Sí, generar SAC
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="create-sac"
                checked={shouldCreateSac === "NO"}
                onChange={() => setShouldCreateSac("NO")}
              />
              No corresponde
            </label>
          </div>
        </fieldset>

        <label className="block text-sm font-medium text-gray-700">
          Comentarios de la evaluación <span className="text-red-600">*</span>
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border-gray-300"
            maxLength={10_000}
            required
            value={comments}
            onChange={(event) => setComments(event.target.value)}
          />
        </label>

        <button
          type="submit"
          className="btn btn-primary inline-flex items-center"
          disabled={decision.isPending}
        >
          {decision.isPending
            ? <LoaderCircle size={17} className="mr-2 animate-spin" />
            : <Save size={17} className="mr-2" />}
          Registrar decisión SAC
        </button>
      </form>
    </section>
  );
};

export default ComplaintSacDecisionPanel;
