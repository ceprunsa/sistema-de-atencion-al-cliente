import { useState, type FormEvent } from "react";
import { LoaderCircle, Send, Wrench } from "lucide-react";
import toast from "react-hot-toast";
import { useComplaintManagement } from "../hooks/useComplaints";
import type { ComplaintStatus } from "../types";

interface ComplaintManagementPanelProps {
  complaintId: string;
  status: ComplaintStatus;
}

const startableStatuses: ComplaintStatus[] = [
  "PENDING_MANAGEMENT",
  "RETURNED_BY_CLIENT",
  "RETURNED_BY_CLOSURE",
];

const ComplaintManagementPanel = ({
  complaintId,
  status,
}: ComplaintManagementPanelProps) => {
  const management = useComplaintManagement(complaintId);
  const [proceeds, setProceeds] = useState<"YES" | "NO">("YES");
  const [analysis, setAnalysis] = useState("");
  const [actions, setActions] = useState("");
  const [clientExplanation, setClientExplanation] = useState("");

  const start = async () => {
    try {
      await management.start.mutateAsync();
      toast.success("La gestión de la queja fue iniciada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo iniciar la gestión.");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!analysis.trim() || !actions.trim()) {
      toast.error("Completa el análisis y las acciones de la gestión.");
      return;
    }
    if (proceeds === "NO" && !clientExplanation.trim()) {
      toast.error("La explicación dirigida al cliente es obligatoria cuando la queja no procede.");
      return;
    }
    try {
      const result = await management.submit.mutateAsync({
        proceeds: proceeds === "YES",
        analysis,
        actions,
        clientExplanation: clientExplanation.trim() || null,
      });
      setAnalysis("");
      setActions("");
      setClientExplanation("");
      toast.success(
        `Versión ${result.versionNumber} registrada. El correo quedó en cola de envío.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar la gestión.");
    }
  };

  if (startableStatuses.includes(status)) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-amber-950">
          <Wrench size={19} />
          Gestión del área responsable
        </h2>
        <p className="mt-2 text-sm text-amber-900">
          Inicia la gestión para registrar el análisis, la decisión y las acciones que se comunicarán al cliente.
        </p>
        <button
          type="button"
          className="btn btn-primary mt-4 inline-flex items-center"
          disabled={management.start.isPending}
          onClick={() => void start()}
        >
          {management.start.isPending && <LoaderCircle size={17} className="mr-2 animate-spin" />}
          Iniciar gestión
        </button>
      </section>
    );
  }

  if (status !== "IN_MANAGEMENT") return null;

  return (
    <section className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold text-gray-900">
        <Wrench size={19} className="text-[#1A2855]" />
        Respuesta del área responsable
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        Al finalizar se guardará una nueva versión y se enviará al cliente un enlace personal válido durante siete días.
      </p>
      <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">¿La queja procede?</legend>
          <div className="mt-2 flex gap-5">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="complaint-proceeds"
                checked={proceeds === "YES"}
                onChange={() => setProceeds("YES")}
              />
              Sí procede
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="complaint-proceeds"
                checked={proceeds === "NO"}
                onChange={() => setProceeds("NO")}
              />
              No procede
            </label>
          </div>
        </fieldset>

        <label className="block text-sm font-medium text-gray-700">
          Análisis de la queja <span className="text-red-600">*</span>
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border-gray-300"
            maxLength={10_000}
            required
            value={analysis}
            onChange={(event) => setAnalysis(event.target.value)}
          />
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Acciones tomadas o propuestas <span className="text-red-600">*</span>
          <textarea
            className="mt-1 min-h-28 w-full rounded-md border-gray-300"
            maxLength={10_000}
            required
            value={actions}
            onChange={(event) => setActions(event.target.value)}
          />
        </label>

        {proceeds === "NO" && (
          <label className="block text-sm font-medium text-gray-700">
            Explicación dirigida al cliente <span className="text-red-600">*</span>
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border-gray-300"
              maxLength={10_000}
              required
              value={clientExplanation}
              onChange={(event) => setClientExplanation(event.target.value)}
            />
          </label>
        )}

        <button
          type="submit"
          className="btn btn-primary inline-flex items-center"
          disabled={management.submit.isPending}
        >
          {management.submit.isPending
            ? <LoaderCircle size={17} className="mr-2 animate-spin" />
            : <Send size={17} className="mr-2" />}
          Registrar y enviar al cliente
        </button>
      </form>
    </section>
  );
};

export default ComplaintManagementPanel;
