import { useState, type FormEvent } from "react";
import { ClipboardCheck, LoaderCircle, Send } from "lucide-react";
import toast from "react-hot-toast";
import { useComplaintClosureReview } from "../hooks/useComplaints";
import type { ComplaintStatus } from "../types";

interface ComplaintClosureReviewPanelProps {
  complaintId: string;
  status: ComplaintStatus;
}

const ComplaintClosureReviewPanel = ({
  complaintId,
  status,
}: ComplaintClosureReviewPanelProps) => {
  const review = useComplaintClosureReview(complaintId);
  const [isAdequate, setIsAdequate] = useState<"YES" | "NO">("YES");
  const [observations, setObservations] = useState("");
  const automaticClosure = status === "CLOSED_NO_RESPONSE";

  if (status !== "PENDING_CLOSURE_REVIEW" && !automaticClosure) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!observations.trim()) {
      toast.error("Registra las observaciones del seguimiento.");
      return;
    }
    try {
      const result = await review.mutateAsync({
        isAdequate: isAdequate === "YES",
        observations,
      });
      setObservations("");
      if (result.followUpOnly) {
        toast.success(`Seguimiento ${result.reviewNumber} registrado sin cambiar el cierre por vencimiento.`);
      } else if (isAdequate === "YES") {
        toast.success("Revisión aprobada. La queja pasó a evaluación de apertura de SAC.");
      } else {
        toast.success("La queja fue devuelta al área responsable con las observaciones registradas.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar la revisión.");
    }
  };

  return (
    <section className="rounded-lg border border-purple-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold text-gray-900">
        <ClipboardCheck size={19} className="text-purple-700" />
        {automaticClosure ? "Seguimiento del cierre automático" : "Revisión del área de cierre"}
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        {automaticClosure
          ? "Registra el seguimiento correspondiente. El expediente conservará el cierre por falta de respuesta del cliente."
          : "Evalúa si la gestión y el cierre son adecuados. Si marcas No, la queja volverá al área responsable."}
      </p>

      <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">
            ¿La gestión y el cierre fueron adecuados?
          </legend>
          <div className="mt-2 flex gap-5">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="closure-adequate"
                checked={isAdequate === "YES"}
                onChange={() => setIsAdequate("YES")}
              />
              Sí
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="closure-adequate"
                checked={isAdequate === "NO"}
                onChange={() => setIsAdequate("NO")}
              />
              No
            </label>
          </div>
        </fieldset>

        <label className="block text-sm font-medium text-gray-700">
          Observaciones <span className="text-red-600">*</span>
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border-gray-300"
            maxLength={10_000}
            required
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
          />
        </label>

        {!automaticClosure && isAdequate === "NO" && (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            Estas observaciones serán enviadas al correo grupal del área responsable.
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary inline-flex items-center"
          disabled={review.isPending}
        >
          {review.isPending
            ? <LoaderCircle size={17} className="mr-2 animate-spin" />
            : <Send size={17} className="mr-2" />}
          {automaticClosure ? "Registrar seguimiento" : "Registrar revisión"}
        </button>
      </form>
    </section>
  );
};

export default ComplaintClosureReviewPanel;
