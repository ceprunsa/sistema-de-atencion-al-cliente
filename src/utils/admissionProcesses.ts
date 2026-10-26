import type { AdmissionProcess, AdmissionProcessPhase } from "../types";

export const ADMISSION_PHASE_LABELS: Record<AdmissionProcessPhase, string> = {
  CEPRUNSA_I: "Ceprunsa I fase",
  CEPRUNSA_QUINTOS: "Ceprunsa Ciclo Quintos",
  CEPRUNSA_II: "Ceprunsa II fase",
  EXTRAORDINARIO: "Extraordinario",
  CUSTOM: "Personalizado",
};

export const formatAdmissionProcess = (process: AdmissionProcess) =>
  `${process.phase === "CUSTOM" ? process.customLabel : ADMISSION_PHASE_LABELS[process.phase]} ${process.year}`;
