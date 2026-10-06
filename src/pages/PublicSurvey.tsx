import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Star } from "lucide-react";
import { useParams } from "react-router-dom";
import { surveysApi, type PublicSurveyState } from "../api/surveys";
import type { SurveyResponse } from "../types";

const choices: Array<{ value: SurveyResponse; label: string; icon: string }> = [
  { value: "VERY_SATISFIED", label: "Muy satisfecho", icon: "😄" },
  { value: "SATISFIED", label: "Satisfecho", icon: "🙂" },
  { value: "DISSATISFIED", label: "Insatisfecho", icon: "🙁" },
  { value: "VERY_DISSATISFIED", label: "Muy insatisfecho", icon: "😞" },
];

const PublicSurvey = () => {
  const { token = "" } = useParams();
  const [survey, setSurvey] = useState<PublicSurveyState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<"COMPLETED" | "SKIPPED" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    surveysApi.getPublic(token)
      .then((data) => { if (active) setSurvey(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "No se pudo consultar la encuesta."); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [token]);

  const submit = async (response: SurveyResponse | null, skip = false) => {
    setIsSaving(true);
    setError("");
    try {
      const saved = await surveysApi.respondPublic(token, response, skip);
      if (saved.result === "COMPLETED" || saved.result === "SKIPPED") {
        setResult(saved.result);
      } else {
        setSurvey({ state: saved.result === "EXPIRED" ? "EXPIRED" : "CLOSED" });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la respuesta.");
    } finally {
      setIsSaving(false);
    }
  };

  const message = survey?.state === "EXPIRED"
    ? "Este enlace de encuesta venció."
    : survey?.state === "PENDING_DELIVERY"
      ? "La invitación todavía está siendo procesada. Intenta nuevamente en unos minutos."
      : survey?.state === "CLOSED"
        ? "Esta encuesta ya fue respondida o cerrada."
        : "El enlace de encuesta no es válido.";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 sm:py-16">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <div className="mb-6 flex items-center justify-center gap-3 text-[#1A2855]">
          <Star size={30} aria-hidden="true" />
          <h1 className="text-2xl font-bold">Encuesta de satisfacción</h1>
        </div>

        {isLoading && <div className="flex items-center justify-center gap-2 py-12 text-slate-600"><LoaderCircle className="animate-spin" />Cargando encuesta...</div>}

        {!isLoading && result && (
          <div className="py-8 text-center">
            <CheckCircle2 size={58} className="mx-auto text-green-600" />
            <h2 className="mt-4 text-xl font-semibold text-slate-900">Gracias por tu respuesta</h2>
            <p className="mt-2 text-slate-600">{result === "COMPLETED" ? "Tu opinión fue registrada correctamente." : "La encuesta fue omitida correctamente."}</p>
          </div>
        )}

        {!isLoading && !result && survey?.state === "OPEN" && (
          <div>
            <p className="text-center text-slate-600">{survey.surveyKind === "REFERRAL" ? "¿Qué tan satisfecho estás con la atención brindada por el área derivada?" : "¿Qué tan satisfecho estás con la atención recibida?"}</p>
            {survey.racCode && <p className="mt-2 text-center text-sm text-slate-500">Atención {survey.racCode}</p>}
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {choices.map((choice) => (
                <button key={choice.value} type="button" disabled={isSaving} onClick={() => void submit(choice.value)} className="rounded-xl border border-slate-200 px-4 py-5 text-left transition hover:border-blue-400 hover:bg-blue-50 disabled:opacity-60">
                  <span className="mr-3 text-2xl" aria-hidden="true">{choice.icon}</span>
                  <span className="font-semibold text-slate-800">{choice.label}</span>
                </button>
              ))}
            </div>
            <button type="button" disabled={isSaving} onClick={() => void submit(null, true)} className="mt-6 w-full text-sm font-medium text-slate-500 underline hover:text-slate-800 disabled:opacity-60">Prefiero omitir la encuesta</button>
            {survey.expiresAt && <p className="mt-5 text-center text-xs text-slate-400">Disponible hasta {new Date(survey.expiresAt).toLocaleString("es-PE")}</p>}
          </div>
        )}

        {!isLoading && !result && survey && survey.state !== "OPEN" && <p className="rounded-lg bg-slate-50 p-5 text-center text-slate-700">{message}</p>}
        {!isLoading && error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-center text-sm text-red-700">{error}</p>}
      </section>
    </main>
  );
};

export default PublicSurvey;
