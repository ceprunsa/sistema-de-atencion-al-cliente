importScripts("environment-config.js");

const extensionConfig = globalThis.RAC_EXTENSION_CONFIG;
if (!extensionConfig || !Array.isArray(extensionConfig.allowedAppOrigins)) {
  throw new Error("La configuración de entorno de la extensión no es válida.");
}
const IMPORT_PREFIX = "rac-email-import:";
const EXPIRY_ALARM_PREFIX = "rac-email-import-expiry:";
const IMPORT_TTL_MS = 30 * 60 * 1000;
const IDENTITY_KEY = "rac-authenticated-identity";
const IDENTITY_TTL_MS = 30 * 60 * 1000;
const allowedAppOrigins = extensionConfig.allowedAppOrigins;
const targetAppUrl = `${extensionConfig.targetAppOrigin}/attentions/new`;

const storageKey = (tabId) => `${IMPORT_PREFIX}${tabId}`;
const expiryAlarmName = (tabId) => `${EXPIRY_ALARM_PREFIX}${tabId}`;
const originFromUrl = (value) => {
  try { return new URL(value).origin; } catch { return ""; }
};
const isPlainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const isOptionalString = (value, maximum) => value == null || (typeof value === "string" && value.length <= maximum);
const isRequiredSha256 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const isRequiredString = (value, maximum) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
const isEmail = (value) => isRequiredString(value, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
const isIsoDate = (value) => typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
const isGmailUrl = (value) => {
  try { return typeof value === "string" && value.length <= 2048 && new URL(value).origin === "https://mail.google.com"; }
  catch { return false; }
};
const validateAttachments = (value) => Array.isArray(value)
  && value.length <= 50
  && value.every((item) => isPlainObject(item)
    && typeof item.name === "string"
    && item.name.trim().length > 0
    && item.name.length <= 255
    && isOptionalString(item.sizeLabel, 100)
    && isOptionalString(item.typeLabel, 100)
    && Object.keys(item).every((key) => ["name", "sizeLabel", "typeLabel"].includes(key)));

const validateImport = (value) => {
  if (!isPlainObject(value) || value.version !== 2) return false;
  if (!isPlainObject(value.received) || !isPlainObject(value.response)) return false;
  const received = value.received;
  const response = value.response;
  if (!isEmail(received.senderEmail) || !isOptionalString(received.senderName, 250)) return false;
  if (!isIsoDate(received.receivedAtIso) || !isRequiredString(received.receivedAtSource, 500)) return false;
  if (!isOptionalString(received.subject, 1000) || !isOptionalString(received.body, 498000)) return false;
  if (!received.subject.trim() && !received.body.trim()) return false;
  if (!validateAttachments(received.attachments)) return false;
  if (!isRequiredSha256(received.messageKeyHash) || !isRequiredSha256(received.fingerprint)) return false;
  if (!isIsoDate(response.respondedAtIso) || !isRequiredString(response.respondedAtSource, 500)) return false;
  if (Date.parse(response.respondedAtIso) <= Date.parse(received.receivedAtIso)) return false;
  if (!isRequiredString(response.body, 500000)) return false;
  if (!isEmail(response.mailboxEmail) || !isOptionalString(response.mailboxName, 250)) return false;
  if (typeof response.isDelegated !== "boolean") return false;
  if (!isOptionalString(response.delegateEmail, 254)) return false;
  if (response.isDelegated && !isEmail(response.delegateEmail)) return false;
  if (!response.isDelegated && response.delegateEmail != null) return false;
  if (!isRequiredSha256(response.messageKeyHash)) return false;
  if (!isGmailUrl(value.conversationUrl) || !isRequiredSha256(value.exchangeFingerprint)) return false;
  if (!Array.isArray(value.warnings) || value.warnings.length > 10 || !value.warnings.every((item) => typeof item === "string" && item.length <= 300)) return false;
  return true;
};

const validateIdentity = (value) => isPlainObject(value)
  && isEmail(value.email)
  && Object.keys(value).every((key) => key === "email");

const readIdentity = async () => {
  const stored = (await chrome.storage.session.get(IDENTITY_KEY))[IDENTITY_KEY];
  if (!stored || !validateIdentity(stored.identity) || typeof stored.syncedAt !== "number"
    || Date.now() - stored.syncedAt > IDENTITY_TTL_MS) {
    await chrome.storage.session.remove(IDENTITY_KEY);
    return null;
  }
  return stored.identity;
};

const removeImport = async (tabId) => {
  if (typeof tabId !== "number") return;
  await Promise.all([
    chrome.storage.session.remove(storageKey(tabId)),
    chrome.alarms.clear(expiryAlarmName(tabId)),
  ]);
};
const readImport = async (tabId) => {
  if (typeof tabId !== "number") return null;
  const key = storageKey(tabId);
  const stored = (await chrome.storage.session.get(key))[key];
  if (!stored) return null;
  if (typeof stored.createdAt !== "number" || Date.now() - stored.createdAt > IMPORT_TTL_MS) {
    await removeImport(tabId);
    return null;
  }
  return stored.payload;
};
const openImportTab = async (payload) => {
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  if (typeof tab.id !== "number") throw new Error("No se pudo crear la pestaña RAC.");
  await chrome.storage.session.set({ [storageKey(tab.id)]: { createdAt: Date.now(), payload } });
  await chrome.alarms.create(expiryAlarmName(tab.id), { when: Date.now() + IMPORT_TTL_MS });
  await chrome.tabs.update(tab.id, { url: targetAppUrl, active: true });
  return tab.id;
};
const openManualTab = async () => {
  const tab = await chrome.tabs.create({ url: targetAppUrl, active: true });
  return tab.id;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    try {
      if (!isPlainObject(message) || typeof message.type !== "string") {
        sendResponse({ ok: false, error: "Mensaje no reconocido." });
        return;
      }
      if (message.type === "RAC_IMPORT_OPEN") {
        if (originFromUrl(sender.url) !== "https://mail.google.com" || !validateImport(message.payload)) {
          sendResponse({ ok: false, error: "La información del correo no es válida." });
          return;
        }
        sendResponse({ ok: true, tabId: await openImportTab(message.payload) });
        return;
      }
      if (message.type === "RAC_OPEN_MANUAL") {
        if (originFromUrl(sender.url) !== "https://mail.google.com") {
          sendResponse({ ok: false, error: "Origen no autorizado." });
          return;
        }
        sendResponse({ ok: true, tabId: await openManualTab() });
        return;
      }
      if (message.type === "RAC_IDENTITY_GET") {
        if (originFromUrl(sender.url) !== "https://mail.google.com") {
          sendResponse({ ok: false, error: "Origen no autorizado." });
          return;
        }
        sendResponse({ ok: true, identity: await readIdentity() });
        return;
      }
      if (!allowedAppOrigins.includes(originFromUrl(sender.url))) {
        sendResponse({ ok: false, error: "Origen no autorizado." });
        return;
      }
      const tabId = sender.tab?.id;
      if (message.type === "RAC_IDENTITY_SYNC") {
        if (message.identity == null) {
          await chrome.storage.session.remove(IDENTITY_KEY);
          sendResponse({ ok: true });
          return;
        }
        if (!validateIdentity(message.identity)) {
          sendResponse({ ok: false, error: "La identidad RAC no es válida." });
          return;
        }
        await chrome.storage.session.set({
          [IDENTITY_KEY]: {
            syncedAt: Date.now(),
            identity: {
              email: message.identity.email.trim().toLowerCase(),
            },
          },
        });
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "RAC_IMPORT_GET") {
        sendResponse({ ok: true, payload: await readImport(tabId) });
        return;
      }
      if (message.type === "RAC_IMPORT_CONSUME" || message.type === "RAC_IMPORT_CANCEL") {
        await removeImport(tabId);
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false, error: "Operación no reconocida." });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "No se pudo procesar la importación." });
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => { void removeImport(tabId); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(EXPIRY_ALARM_PREFIX)) return;
  const tabId = Number(alarm.name.slice(EXPIRY_ALARM_PREFIX.length));
  if (Number.isInteger(tabId)) void removeImport(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  void chrome.action.setBadgeText({ text: extensionConfig.badgeText || "" });
  if (extensionConfig.badgeText) {
    void chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  }
});
