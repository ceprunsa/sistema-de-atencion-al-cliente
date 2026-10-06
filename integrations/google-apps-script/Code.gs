var CONFIG = Object.freeze({
  SECRET_PROPERTY: "APPS_SCRIPT_HMAC_SECRET",
  DELIVERY_PREFIX: "mail_delivery:",
  SIGNATURE_TOLERANCE_SECONDS: 300,
  PROCESSING_LEASE_SECONDS: 600,
  SENT_RETENTION_DAYS: 2,
  MAX_CC_RECIPIENTS: 10,
  MAX_SUBJECT_LENGTH: 200,
  MAX_TEXT_LENGTH: 100000,
  MAX_HTML_LENGTH: 350000,
});

function authorizeMailService() {
  return MailApp.getRemainingDailyQuota();
}

function doPost(e) {
  try {
    if (!e || !e.postData || typeof e.postData.contents !== "string") {
      return jsonOutput_({ ok: false, code: "INVALID_REQUEST", message: "Solicitud inválida.", retryable: false });
    }

    var envelope;
    try {
      envelope = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return jsonOutput_({ ok: false, code: "INVALID_JSON", message: "El cuerpo no contiene JSON válido.", retryable: false });
    }

    var validation = validateEnvelope_(envelope);
    if (!validation.ok) return jsonOutput_(validation);

    var secret = PropertiesService.getScriptProperties().getProperty(CONFIG.SECRET_PROPERTY);
    if (!secret) {
      return jsonOutput_({ ok: false, code: "SERVICE_NOT_CONFIGURED", message: "El servicio de correo no está configurado.", retryable: true, retryAfterSeconds: 300 });
    }

    var canonical = [envelope.version, envelope.timestamp, envelope.nonce, envelope.messageId, envelope.payload].join(".");
    var expectedSignature = hmacHex_(canonical, secret);
    if (!constantTimeEquals_(String(envelope.signature).toLowerCase(), expectedSignature)) {
      return jsonOutput_({ ok: false, code: "INVALID_SIGNATURE", message: "La firma de la solicitud no es válida.", retryable: false });
    }

    var payload;
    try {
      payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(envelope.payload)).getDataAsString("UTF-8"));
    } catch (payloadError) {
      return jsonOutput_({ ok: false, code: "INVALID_PAYLOAD", message: "El contenido firmado no es válido.", retryable: false });
    }

    var messageValidation = validateMessage_(payload);
    if (!messageValidation.ok) return jsonOutput_(messageValidation);

    return jsonOutput_(sendIdempotent_(envelope.messageId, payload));
  } catch (error) {
    console.error("mail-service:unexpected-error");
    return jsonOutput_({ ok: false, code: "INTERNAL_ERROR", message: "El servicio de correo no pudo completar la solicitud.", retryable: true, retryAfterSeconds: 300 });
  }
}

function validateEnvelope_(envelope) {
  if (!envelope || envelope.version !== 1) {
    return { ok: false, code: "UNSUPPORTED_VERSION", message: "Versión de contrato no admitida.", retryable: false };
  }
  if (typeof envelope.timestamp !== "number" || Math.abs(Math.floor(Date.now() / 1000) - envelope.timestamp) > CONFIG.SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, code: "EXPIRED_SIGNATURE", message: "La firma de la solicitud venció.", retryable: false };
  }
  if (typeof envelope.nonce !== "string" || !/^[0-9a-f-]{36}$/i.test(envelope.nonce)) {
    return { ok: false, code: "INVALID_NONCE", message: "Nonce inválido.", retryable: false };
  }
  if (typeof envelope.messageId !== "string" || !/^[0-9a-f-]{36}$/i.test(envelope.messageId)) {
    return { ok: false, code: "INVALID_MESSAGE_ID", message: "Identificador de mensaje inválido.", retryable: false };
  }
  if (typeof envelope.payload !== "string" || envelope.payload.length === 0 || envelope.payload.length > 700000) {
    return { ok: false, code: "INVALID_PAYLOAD", message: "Payload inválido.", retryable: false };
  }
  if (typeof envelope.signature !== "string" || !/^[0-9a-f]{64}$/i.test(envelope.signature)) {
    return { ok: false, code: "INVALID_SIGNATURE", message: "Firma inválida.", retryable: false };
  }
  return { ok: true };
}

function validateMessage_(message) {
  if (!message || !isValidEmail_(message.to)) {
    return { ok: false, code: "INVALID_RECIPIENT", message: "El destinatario no es válido.", retryable: false };
  }
  if (!Array.isArray(message.cc) || message.cc.length > CONFIG.MAX_CC_RECIPIENTS || message.cc.some(function (email) { return !isValidEmail_(email); })) {
    return { ok: false, code: "INVALID_RECIPIENT", message: "Uno de los destinatarios CC no es válido.", retryable: false };
  }
  if (typeof message.subject !== "string" || !message.subject.trim() || message.subject.length > CONFIG.MAX_SUBJECT_LENGTH) {
    return { ok: false, code: "INVALID_MESSAGE", message: "El asunto no es válido.", retryable: false };
  }
  if (typeof message.textBody !== "string" || !message.textBody.trim() || message.textBody.length > CONFIG.MAX_TEXT_LENGTH) {
    return { ok: false, code: "INVALID_MESSAGE", message: "El texto del mensaje no es válido.", retryable: false };
  }
  if (typeof message.htmlBody !== "string" || !message.htmlBody.trim() || message.htmlBody.length > CONFIG.MAX_HTML_LENGTH) {
    return { ok: false, code: "INVALID_MESSAGE", message: "El HTML del mensaje no es válido.", retryable: false };
  }
  if (typeof message.fromName !== "string" || !message.fromName.trim() || message.fromName.length > 100) {
    return { ok: false, code: "INVALID_MESSAGE", message: "El nombre del remitente no es válido.", retryable: false };
  }
  return { ok: true };
}

function sendIdempotent_(messageId, message) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, code: "SERVICE_BUSY", message: "El servicio está procesando otro mensaje.", retryable: true, retryAfterSeconds: 30 };
  }

  var properties = PropertiesService.getScriptProperties();
  var key = CONFIG.DELIVERY_PREFIX + messageId;
  try {
    cleanupDeliveries_(properties);
    var existing = parseProperty_(properties.getProperty(key));
    if (existing && existing.status === "SENT") {
      return { ok: true, messageId: messageId, acceptedAt: existing.acceptedAt, duplicate: true, remainingQuota: MailApp.getRemainingDailyQuota() };
    }
    if (existing && existing.status === "PROCESSING") {
      var ageSeconds = (Date.now() - Number(existing.startedAt || 0)) / 1000;
      if (ageSeconds <= CONFIG.PROCESSING_LEASE_SECONDS) {
        return { ok: false, code: "IN_PROGRESS", message: "El mensaje ya se está procesando.", retryable: true, retryAfterSeconds: 60 };
      }
      return { ok: false, code: "AMBIGUOUS_DELIVERY", message: "No se puede confirmar el resultado del intento anterior; no se reenviará para evitar duplicados.", retryable: false };
    }

    var recipientCount = 1 + message.cc.length;
    var remainingQuota = MailApp.getRemainingDailyQuota();
    if (remainingQuota < recipientCount) {
      return { ok: false, code: "QUOTA_EXCEEDED", message: "La cuota diaria de destinatarios fue alcanzada.", retryable: true, retryAfterSeconds: 43200, remainingQuota: remainingQuota };
    }

    properties.setProperty(key, JSON.stringify({ status: "PROCESSING", startedAt: Date.now() }));
    try {
      var options = {
        to: String(message.to).trim().toLowerCase(),
        subject: message.subject.trim(),
        body: message.textBody,
        htmlBody: message.htmlBody,
        name: message.fromName.trim(),
      };
      if (message.cc.length > 0) options.cc = message.cc.join(",");
      MailApp.sendEmail(options);
    } catch (sendError) {
      console.error("mail-service:send-ambiguous", messageId);
      return { ok: false, code: "AMBIGUOUS_DELIVERY", message: "El proveedor no confirmó el envío; no se reenviará automáticamente para evitar duplicados.", retryable: false };
    }

    var acceptedAt = new Date().toISOString();
    properties.setProperty(key, JSON.stringify({ status: "SENT", acceptedAt: acceptedAt, savedAt: Date.now() }));
    return { ok: true, messageId: messageId, acceptedAt: acceptedAt, duplicate: false, remainingQuota: MailApp.getRemainingDailyQuota() };
  } finally {
    lock.releaseLock();
  }
}

function cleanupDeliveries_(properties) {
  var now = Date.now();
  var sentRetention = CONFIG.SENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  var processingRetention = 30 * 24 * 60 * 60 * 1000;
  var all = properties.getProperties();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf(CONFIG.DELIVERY_PREFIX) !== 0) return;
    var value = parseProperty_(all[key]);
    if (!value) return properties.deleteProperty(key);
    if (value.status === "SENT" && now - Number(value.savedAt || 0) > sentRetention) properties.deleteProperty(key);
    if (value.status === "PROCESSING" && now - Number(value.startedAt || 0) > processingRetention) properties.deleteProperty(key);
  });
}

function parseProperty_(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch (error) { return null; }
}

function isValidEmail_(value) {
  if (typeof value !== "string") return false;
  var normalized = value.trim().toLowerCase();
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalized);
}

function hmacHex_(value, secret) {
  return Utilities.computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8)
    .map(function (byte) { return (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0"); })
    .join("");
}

function constantTimeEquals_(left, right) {
  var difference = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function jsonOutput_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
