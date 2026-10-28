import { useCallback, useEffect, useState } from "react";
import { isGmailAttentionImport, type GmailAttentionImport } from "../types/gmailImport";

const APP_SOURCE = "CEPRUNSA_RAC_APP";
const EXTENSION_SOURCE = "CEPRUNSA_RAC_EXTENSION";

const postToExtension = (type: "RAC_IMPORT_REQUEST" | "RAC_IMPORT_CONSUME" | "RAC_IMPORT_CANCEL") => {
  window.postMessage({ source: APP_SOURCE, type }, window.location.origin);
};

export const useGmailAttentionImport = () => {
  const [gmailImport, setGmailImport] = useState<GmailAttentionImport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const receiveMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as { source?: unknown; type?: unknown; payload?: unknown; message?: unknown };
      if (message.source !== EXTENSION_SOURCE || typeof message.type !== "string") return;
      if (message.type === "RAC_IMPORT_AVAILABLE") {
        if (!isGmailAttentionImport(message.payload)) {
          setImportError("La extensión entregó una precarga inválida. Puedes continuar manualmente.");
          return;
        }
        setGmailImport(message.payload);
        setImportError(null);
      } else if (message.type === "RAC_IMPORT_ERROR" && typeof message.message === "string") {
        setImportError(message.message);
      }
    };

    window.addEventListener("message", receiveMessage);
    postToExtension("RAC_IMPORT_REQUEST");
    return () => window.removeEventListener("message", receiveMessage);
  }, []);

  const consumeImport = useCallback(() => {
    postToExtension("RAC_IMPORT_CONSUME");
    setGmailImport(null);
    setImportError(null);
  }, []);

  const cancelImport = useCallback(() => {
    postToExtension("RAC_IMPORT_CANCEL");
    setGmailImport(null);
    setImportError(null);
  }, []);

  return { gmailImport, importError, consumeImport, cancelImport };
};
