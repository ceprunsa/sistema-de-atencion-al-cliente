import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import toast from "react-hot-toast";

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

interface SpeechConclusionFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}

const joinTranscript = (...parts: string[]) =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

const SpeechConclusionField = ({
  id,
  value,
  onChange,
  label = "Conclusión de la atención *",
  placeholder = "Describe la orientación o solución brindada...",
  maxLength = 3000,
  disabled = false,
}: SpeechConclusionFieldProps) => {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const finalTextRef = useRef("");
  const onChangeRef = useRef(onChange);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const Recognition = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const speechWindow = window as SpeechWindow;
    return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  }, []);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  const stopListening = () => {
    recognitionRef.current?.stop();
  };

  const startListening = () => {
    if (recognitionRef.current) return;

    if (!Recognition) {
      toast.error("El dictado por voz no está disponible en este navegador. Puedes escribir la conclusión manualmente.");
      return;
    }

    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "es-PE";
      baseTextRef.current = value.trim();
      finalTextRef.current = "";

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };
      recognition.onerror = (event) => {
        setIsListening(false);
        recognitionRef.current = null;
        const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
        toast.error(
          denied
            ? "No se concedió permiso para usar el micrófono. Puedes escribir la conclusión manualmente."
            : "El dictado se interrumpió. Puedes continuar escribiendo manualmente.",
        );
      };
      recognition.onresult = (event) => {
        let interimText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0]?.transcript?.trim() || "";
          if (!transcript) continue;
          if (result.isFinal) {
            finalTextRef.current = joinTranscript(finalTextRef.current, transcript);
          } else {
            interimText = joinTranscript(interimText, transcript);
          }
        }

        onChangeRef.current(
          joinTranscript(baseTextRef.current, finalTextRef.current, interimText).slice(0, maxLength),
        );
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      toast.error("No se pudo iniciar el dictado. Puedes escribir la conclusión manualmente.");
    }
  };

  const handleManualChange = (nextValue: string) => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
      setIsListening(false);
    }
    onChange(nextValue);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        <button
          type="button"
          onClick={isListening ? stopListening : startListening}
          disabled={disabled}
          aria-pressed={isListening}
          className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            isListening
              ? "bg-red-100 text-red-700 hover:bg-red-200"
              : "bg-blue-50 text-blue-700 hover:bg-blue-100"
          }`}
        >
          {isListening ? <MicOff size={15} className="mr-1.5" /> : <Mic size={15} className="mr-1.5" />}
          {isListening ? "Detener dictado" : "Iniciar dictado"}
        </button>
      </div>
      {isListening && (
        <div className="mt-2 flex items-center gap-2 text-xs font-medium text-red-600" role="status">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          Micrófono escuchando…
        </div>
      )}
      {!Recognition && (
        <p className="mt-2 text-xs text-gray-500">
          El dictado no está disponible en este navegador; la escritura manual permanece habilitada.
        </p>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(event) => handleManualChange(event.target.value)}
        required
        rows={5}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        className="mt-2 block w-full rounded-md border-gray-300 shadow-sm disabled:bg-gray-100 focus:border-blue-500 focus:ring-blue-500"
      />
    </div>
  );
};

export default SpeechConclusionField;
