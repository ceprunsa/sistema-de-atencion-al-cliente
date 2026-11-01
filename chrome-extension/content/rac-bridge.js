const EXTENSION_SOURCE = "CEPRUNSA_RAC_EXTENSION";
const APP_SOURCE = "CEPRUNSA_RAC_APP";

const postToPage = (type, detail = {}) => {
  window.postMessage({ source: EXTENSION_SOURCE, type, ...detail }, window.location.origin);
};
const requestPendingImport = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "RAC_IMPORT_GET" });
    if (response?.ok && response.payload) postToPage("RAC_IMPORT_AVAILABLE", { payload: response.payload });
    else if (response?.error) postToPage("RAC_IMPORT_ERROR", { message: response.error });
  } catch {
    // La aplicación continúa disponible para el registro manual.
  }
};

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.source !== APP_SOURCE || typeof message.type !== "string") return;
  if (message.type === "RAC_IDENTITY_SYNC") {
    void chrome.runtime.sendMessage({ type: message.type, identity: message.identity ?? null }).catch(() => {});
    return;
  }
  if (message.type === "RAC_IMPORT_REQUEST") {
    void requestPendingImport();
    return;
  }
  if (message.type === "RAC_IMPORT_CONSUME" || message.type === "RAC_IMPORT_CANCEL") {
    void chrome.runtime.sendMessage({ type: message.type }).then((response) => {
      postToPage("RAC_IMPORT_CLEARED", { ok: response?.ok === true });
    }).catch(() => postToPage("RAC_IMPORT_CLEARED", { ok: false }));
  }
});

void requestPendingImport();
