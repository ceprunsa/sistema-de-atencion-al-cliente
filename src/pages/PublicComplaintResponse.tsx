import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  MessageSquareWarning,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useParams } from "react-router-dom";
import { publicComplaintResponseApi } from "../api/complaints";
import type {
  PublicComplaintResponseResult,
  PublicComplaintResponseState,
} from "../types";

const PublicComplaintResponse = () => {
  const { token = "" } = useParams();
  const [response, setResponse] = useState<PublicComplaintResponseState | null>(null);
  const [choice, setChoice] = useState<"AGREE" | "DISAGREE" | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<PublicComplaintResponseResult["result"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    publicComplaintResponseApi.get(token)
      .then((data) => {
        if (active) setResponse(data);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "No se pudo consultar la queja.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!choice) {
      setError("Selecciona si estás de acuerdo o no con la atención brindada.");
      return;
    }
    if (choice === "DISAGREE" && !reason.trim()) {
      setError("Escribe el motivo de tu desacuerdo.");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const saved = await publicComplaintResponseApi.respond(
        token,
        choice === "AGREE",
        reason,
      );
      setResult(saved.result);
      if (!["AGREED", "DISAGREED"].includes(saved.result)) {
        setResponse({
          state: saved.result === "EXPIRED"
            ? "EXPIRED"
            : saved.result === "CLOSED"
              ? "CLOSED"
              : "INVALID",
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la respuesta.");
    } finally {
      setIsSaving(false);
    }
  };

  const closedMessage = response?.state === "EXPIRED"
    ? "Este enlace venció. El plazo de siete días concluyó sin respuesta."
    : response?.state === "PENDING_DELIVERY"
      ? "El correo todavía está siendo procesado. Intenta nuevamente en unos minutos."
      : response?.state === "CLOSED"
        ? "Este enlace ya fue utilizado o reemplazado por una respuesta más reciente."
        : "El enlace no es válido.";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 sm:py-16">
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <div className="mb-6 flex items-center justify-center gap-3 text-[#1A2855]">
          <MessageSquareWarning size={30} aria-hidden="true" />
          <h1 className="text-2xl font-bold">Respuesta a una queja</h1>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-600">
            <LoaderCircle className="animate-spin" />
            Cargando información...
          </div>
        )}

        {!isLoading && ["AGREED", "DISAGREED"].includes(result || "") && (
          <div className="py-8 text-center">
            <CheckCircle2 size={58} className="mx-auto text-green-600" />
            <h2 className="mt-4 text-xl font-semibold text-slate-900">
              Respuesta registrada
            </h2>
            <p className="mt-2 text-slate-600">
              {result === "AGREED"
                ? "Registramos tu conformidad. La queja continuará con la revisión de cierre."
                : "Registramos tu desacuerdo. La queja fue devuelta al área responsable para una nueva revisión."}
            </p>
          </div>
        )}

        {!isLoading && !result && response?.state === "OPEN" && (
          <form onSubmit={(event) => void submit(event)}>
            <p className="text-center text-sm text-slate-500">
              Queja <strong>{response.complaintCode}</strong> · Versión {response.versionNumber}
            </p>

            <div className="mt-6 space-y-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-700">
              <div>
                <h2 className="font-semibold text-slate-900">Detalle de la queja</h2>
                <p className="mt-1 whitespace-pre-wrap">{response.description}</p>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Decisión</h2>
                <p className="mt-1">{response.proceeds ? "La queja procede." : "La queja no procede."}</p>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Análisis</h2>
                <p className="mt-1 whitespace-pre-wrap">{response.analysis}</p>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Acciones tomadas o propuestas</h2>
                <p className="mt-1 whitespace-pre-wrap">{response.actions}</p>
              </div>
              {response.clientExplanation && (
                <div>
                  <h2 className="font-semibold text-slate-900">Explicación</h2>
                  <p className="mt-1 whitespace-pre-wrap">{response.clientExplanation}</p>
                </div>
              )}
            </div>

            <fieldset className="mt-7">
              <legend className="text-center font-semibold text-slate-900">
                ¿Estás de acuerdo con la atención y las acciones comunicadas?
              </legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className={`rounded-xl border p-4 text-left transition ${choice === "AGREE" ? "border-green-500 bg-green-50 text-green-900" : "border-slate-200 hover:border-green-400"}`}
                  onClick={() => setChoice("AGREE")}
                >
                  <ThumbsUp className="mb-2" />
                  <span className="font-semibold">Estoy de acuerdo</span>
                </button>
                <button
                  type="button"
                  className={`rounded-xl border p-4 text-left transition ${choice === "DISAGREE" ? "border-red-500 bg-red-50 text-red-900" : "border-slate-200 hover:border-red-400"}`}
                  onClick={() => setChoice("DISAGREE")}
                >
                  <ThumbsDown className="mb-2" />
                  <span className="font-semibold">No estoy de acuerdo</span>
                </button>
              </div>
            </fieldset>

            {choice === "DISAGREE" && (
              <label className="mt-5 block text-sm font-medium text-slate-700">
                Motivo del desacuerdo <span className="text-red-600">*</span>
                <textarea
                  className="mt-1 min-h-28 w-full rounded-md border-slate-300"
                  maxLength={5_000}
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            )}

            <button
              type="submit"
              className="btn btn-primary mt-6 w-full justify-center"
              disabled={isSaving || !choice}
            >
              {isSaving ? "Guardando respuesta..." : "Confirmar respuesta"}
            </button>
            {response.expiresAt && (
              <p className="mt-4 text-center text-xs text-slate-400">
                Enlace disponible hasta {new Date(response.expiresAt).toLocaleString("es-PE")}
              </p>
            )}
          </form>
        )}

        {!isLoading && !result && response && response.state !== "OPEN" && (
          <p className="rounded-lg bg-slate-50 p-5 text-center text-slate-700">
            {closedMessage}
          </p>
        )}
        {!isLoading && error && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-center text-sm text-red-700">
            {error}
          </p>
        )}
      </section>
    </main>
  );
};

export default PublicComplaintResponse;
