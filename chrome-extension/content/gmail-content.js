(() => {
  "use strict";

  const adapter = globalThis.RacGmailAdapter;
  if (!adapter) return;

  const BUTTON_CLASS = "rac-gmail-register-button";
  const BUTTON_MARKER = "racRegisterAttentionMounted";
  const MODAL_CLASS = "rac-gmail-exchange-modal";
  const MAX_RECEIVED_BODY = 498000;
  const MAX_RESPONSE_BODY = 500000;
  let scanTimer = 0;

  const sendMessage = (message) => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });

  const sha256 = async (value) => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const isEmail = (value) => typeof value === "string"
    && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());

  const formatLima = (value) => {
    if (!value) return "Fecha exacta no disponible";
    return new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  };

  const showToast = (message, options = {}) => {
    document.querySelector(".rac-gmail-toast")?.remove();
    const toast = element("div", `rac-gmail-toast rac-gmail-toast--${options.kind || "info"}`);
    toast.setAttribute("role", "status");
    const text = element("span", "", message);
    toast.appendChild(text);

    if (options.manual) {
      const manualButton = element("button", "", "Abrir formulario manual");
      manualButton.type = "button";
      manualButton.addEventListener("click", async () => {
        try {
          await sendMessage({ type: "RAC_OPEN_MANUAL" });
          toast.remove();
        } catch {
          text.textContent = "No se pudo abrir el formulario RAC.";
        }
      });
      toast.appendChild(manualButton);
    }

    document.body.appendChild(toast);
    if (!options.manual) window.setTimeout(() => toast.remove(), options.duration || 5000);
  };

  const buildPayload = async ({
    received,
    response,
    isDelegated,
    mailboxEmail,
    mailboxName,
    delegateEmail,
    delegationSource
  }) => {
    if (!received || !response || received.id === response.id) {
      throw new Error("Selecciona un mensaje recibido y una respuesta final diferentes.");
    }
    if (received.draft || response.draft) {
      throw new Error("Un borrador no puede formar parte del intercambio.");
    }
    if (!received.dateIso) {
      throw new Error("Falta la fecha y hora exacta de recepción en el encabezado Gmail.");
    }
    if (!response.dateIso) {
      throw new Error("Falta la fecha y hora exacta de envío de la respuesta.");
    }
    if (Date.parse(response.dateIso) <= Date.parse(received.dateIso)) {
      throw new Error("La respuesta seleccionada debe ser posterior al mensaje recibido.");
    }
    if (!isEmail(received.senderEmail)) {
      throw new Error("No se pudo determinar el correo del cliente.");
    }
    if (!received.messageKey || !response.messageKey) {
      throw new Error("Gmail no expuso un identificador fiable para ambos mensajes.");
    }
    if (!received.subject && !received.body) {
      throw new Error("El mensaje recibido no contiene asunto ni cuerpo legible.");
    }
    if (!response.body) {
      throw new Error("La respuesta final no contiene texto legible.");
    }
    if (!isEmail(response.senderEmail)) {
      throw new Error("No se pudo determinar el remitente visible de la respuesta.");
    }
    if (received.body.length > MAX_RECEIVED_BODY || response.body.length > MAX_RESPONSE_BODY) {
      throw new Error("Uno de los mensajes excede el tamaño permitido y no se importará incompleto.");
    }
    if (!isEmail(mailboxEmail)) {
      throw new Error("Confirma el correo del buzón que respondió.");
    }
    if (isDelegated && !isEmail(delegateEmail)) {
      throw new Error("La identidad del personal delegado es obligatoria.");
    }
    const visibleResponseSender = response.senderEmail.toLowerCase();
    const normalizedMailbox = mailboxEmail.trim().toLowerCase();
    const normalizedDelegate = delegateEmail.trim().toLowerCase();
    if ((!isDelegated && visibleResponseSender !== normalizedMailbox)
      || (isDelegated && visibleResponseSender !== normalizedMailbox && visibleResponseSender !== normalizedDelegate)) {
      throw new Error("La identidad indicada no coincide con el remitente visible de la respuesta.");
    }

    const conversationUrl = adapter.getConversationUrl();
    if (!conversationUrl) throw new Error("No se pudo capturar la URL real de la conversación.");

    const receivedMessageKeyHash = await sha256(received.messageKey);
    const responseMessageKeyHash = await sha256(response.messageKey);
    const receivedFingerprint = await sha256([
      received.senderEmail.toLowerCase(),
      received.dateIso,
      received.subject,
      received.body
    ].join("\n"));
    const exchangeFingerprint = await sha256([
      receivedMessageKeyHash,
      responseMessageKeyHash,
      received.dateIso,
      response.dateIso,
      received.senderEmail.toLowerCase(),
      normalizedMailbox,
      received.body,
      response.body
    ].join("\n"));

    return {
      version: 2,
      received: {
        senderEmail: received.senderEmail.slice(0, 254),
        senderName: received.senderName.slice(0, 250),
        receivedAtIso: received.dateIso,
        receivedAtSource: received.dateSource.slice(0, 500),
        subject: received.subject.slice(0, 1000),
        body: received.body,
        attachments: received.attachments,
        messageKeyHash: receivedMessageKeyHash,
        fingerprint: receivedFingerprint
      },
      response: {
        respondedAtIso: response.dateIso,
        respondedAtSource: response.dateSource.slice(0, 500),
        body: response.body,
        mailboxEmail: normalizedMailbox.slice(0, 254),
        mailboxName: mailboxName.trim().slice(0, 250),
        isDelegated,
        delegateEmail: isDelegated ? normalizedDelegate.slice(0, 254) : null,
        messageKeyHash: responseMessageKeyHash
      },
      conversationUrl,
      exchangeFingerprint,
      warnings: [
        "El vínculo de Gmail requiere acceso al buzón y puede cambiar en cuentas delegadas.",
        "La relación del intercambio fue confirmada mediante la selección explícita del operador.",
        ...(isDelegated && delegationSource === "gmail"
          ? ["La delegación y ambas identidades fueron detectadas en el encabezado visible de Gmail."]
          : []),
        ...(isDelegated && delegationSource === "rac"
          ? ["La delegación fue inferida al comparar el buzón remitente con el usuario autenticado en RAC y fue confirmada por el operador."]
          : [])
      ]
    };
  };

  const openExchangeSelector = async (clickedRoot) => {
    document.querySelector(`.${MODAL_CLASS}`)?.remove();
    let racIdentity = null;
    try {
      const identityResponse = await sendMessage({ type: "RAC_IDENTITY_GET" });
      if (identityResponse?.ok && identityResponse.identity && isEmail(identityResponse.identity.email || "")) {
        racIdentity = {
          email: identityResponse.identity.email.trim().toLowerCase()
        };
      }
    } catch {
      // La detección por encabezado Gmail sigue disponible sin una sesión RAC sincronizada.
    }
    const messages = adapter.getExpandedMessages().map((root, index) => adapter.extractMessage(root, index));
    if (messages.length < 2) {
      showToast("Expande el mensaje recibido y la respuesta final antes de seleccionar el intercambio.", {
        kind: "error"
      });
      return;
    }

    let receivedId = messages.find((message) => message.root === clickedRoot && !message.draft)?.id || "";
    let responseId = "";
    let working = false;
    let delegationSource = "none";

    const overlay = element("div", MODAL_CLASS);
    overlay.setAttribute("role", "presentation");
    const dialog = element("div", "rac-gmail-exchange-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "rac-gmail-exchange-title");

    const header = element("div", "rac-gmail-exchange-header");
    const heading = element("div");
    const title = element("h2", "", "Seleccionar intercambio respondido");
    title.id = "rac-gmail-exchange-title";
    heading.append(title, element("p", "", "Selecciona la consulta recibida y el mensaje final enviado. Solo se aceptan fechas exactas del encabezado Gmail."));
    const closeButton = element("button", "rac-gmail-icon-button", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Cerrar");
    header.append(heading, closeButton);

    const messageList = element("div", "rac-gmail-message-list");
    const identitySection = element("section", "rac-gmail-identity-section");
    identitySection.appendChild(element("h3", "", "Identidad de la respuesta"));

    const delegatedLabel = element("label", "rac-gmail-check-label");
    const delegatedInput = document.createElement("input");
    delegatedInput.type = "checkbox";
    delegatedLabel.append(delegatedInput, document.createTextNode(" La respuesta fue enviada desde un buzón delegado"));
    const detectionStatus = element("p", "rac-gmail-detection-status", "Selecciona la respuesta final para detectar las identidades.");

    const identityGrid = element("div", "rac-gmail-identity-grid");
    const makeField = (labelText) => {
      const wrapper = element("label");
      wrapper.appendChild(element("span", "", labelText));
      const input = document.createElement("input");
      input.type = "text";
      wrapper.appendChild(input);
      identityGrid.appendChild(wrapper);
      return input;
    };
    const mailboxNameInput = makeField("Nombre del buzón");
    const mailboxEmailInput = makeField("Correo del buzón *");
    const delegateEmailInput = makeField("Correo del personal delegado *");
    mailboxEmailInput.type = "email";
    mailboxEmailInput.required = true;
    delegateEmailInput.type = "email";

    identitySection.append(delegatedLabel, detectionStatus, identityGrid);
    const errorBox = element("p", "rac-gmail-exchange-error");
    errorBox.hidden = true;

    const footer = element("div", "rac-gmail-exchange-footer");
    const cancelButton = element("button", "rac-gmail-secondary-button", "Cancelar");
    cancelButton.type = "button";
    const importButton = element("button", BUTTON_CLASS, "Importar intercambio");
    importButton.type = "button";
    footer.append(cancelButton, importButton);
    dialog.append(header, messageList, identitySection, errorBox, footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const updateDelegateFields = () => {
      const visible = delegatedInput.checked;
      delegateEmailInput.parentElement.hidden = !visible;
    };

    const populateResponseIdentity = () => {
      const response = messages.find((message) => message.id === responseId);
      if (!response) return;
      mailboxNameInput.value = response.senderName;
      mailboxEmailInput.value = response.senderEmail;
      const gmailDetected = isEmail(response.delegatedEmail || "")
        && response.delegatedEmail.toLowerCase() !== response.senderEmail.toLowerCase();
      const racDetected = !gmailDetected
        && racIdentity
        && isEmail(response.senderEmail)
        && racIdentity.email !== response.senderEmail.toLowerCase();

      delegatedInput.checked = gmailDetected || !!racDetected;
      delegateEmailInput.value = gmailDetected ? response.delegatedEmail : (racDetected ? racIdentity.email : "");

      if (gmailDetected) {
        delegationSource = "gmail";
        const racMismatch = racIdentity && racIdentity.email !== response.delegatedEmail.toLowerCase();
        detectionStatus.className = `rac-gmail-detection-status${racMismatch ? " rac-gmail-detection-status--warning" : " rac-gmail-detection-status--success"}`;
        detectionStatus.textContent = racMismatch
          ? `Gmail identifica el buzón delegado ${response.senderEmail} y al personal ${response.delegatedEmail}, pero este último no coincide con el usuario RAC ${racIdentity.email}. Confirma los datos.`
          : `Delegación detectada por Gmail. Buzón: ${response.senderName || response.senderEmail} (${response.senderEmail}). Personal: ${response.delegatedEmail}.`;
      } else if (racDetected) {
        delegationSource = "rac";
        detectionStatus.className = "rac-gmail-detection-status rac-gmail-detection-status--warning";
        detectionStatus.textContent = `Posible cuenta delegada detectada: el buzón remitente es ${response.senderEmail} y el usuario activo en RAC es ${racIdentity.email}. Revisa y confirma ambas identidades.`;
      } else {
        delegationSource = "none";
        detectionStatus.className = "rac-gmail-detection-status";
        detectionStatus.textContent = racIdentity
          ? `No se detectó delegación: el buzón remitente coincide con el usuario RAC ${racIdentity.email}.`
          : "Gmail no expuso «Enviado por» y no hay una identidad RAC reciente para comparar. Confirma los datos manualmente.";
      }
      updateDelegateFields();
    };

    const renderMessages = () => {
      messageList.replaceChildren();
      messages.forEach((message, index) => {
        const card = element("article", `rac-gmail-message-card${message.draft ? " rac-gmail-message-card--draft" : ""}`);
        const meta = element("div", "rac-gmail-message-meta");
        meta.append(
          element("strong", "", message.senderName || message.senderEmail || "Remitente no identificado"),
          element("span", "", message.senderEmail || "Sin correo"),
          element("span", message.dateIso ? "" : "rac-gmail-missing", message.dateIso ? formatLima(message.dateIso) : "Sin fecha exacta"),
          message.draft ? element("span", "rac-gmail-draft", "Borrador") : document.createTextNode("")
        );
        const preview = element("p", "rac-gmail-message-preview", (message.body || message.subject || "Sin contenido").slice(0, 240));
        const choices = element("div", "rac-gmail-message-choices");

        const receivedLabel = element("label");
        const receivedRadio = document.createElement("input");
        receivedRadio.type = "radio";
        receivedRadio.name = "rac-received-message";
        receivedRadio.checked = receivedId === message.id;
        receivedRadio.disabled = message.draft;
        receivedRadio.addEventListener("change", () => { receivedId = message.id; });
        receivedLabel.append(receivedRadio, document.createTextNode(" Consulta recibida"));

        const responseLabel = element("label");
        const responseRadio = document.createElement("input");
        responseRadio.type = "radio";
        responseRadio.name = "rac-response-message";
        responseRadio.checked = responseId === message.id;
        responseRadio.disabled = message.draft;
        responseRadio.addEventListener("change", () => {
          responseId = message.id;
          populateResponseIdentity();
        });
        responseLabel.append(responseRadio, document.createTextNode(" Respuesta final"));

        choices.append(receivedLabel, responseLabel);
        card.append(element("span", "rac-gmail-message-number", `Mensaje ${index + 1}`), meta, preview, choices);
        messageList.appendChild(card);
      });
    };

    const close = () => {
      if (working) return;
      document.body.style.overflow = "";
      overlay.remove();
      window.removeEventListener("keydown", onKeyDown);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };

    delegatedInput.addEventListener("change", updateDelegateFields);
    closeButton.addEventListener("click", close);
    cancelButton.addEventListener("click", close);
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
    window.addEventListener("keydown", onKeyDown);
    importButton.addEventListener("click", async () => {
      errorBox.hidden = true;
      working = true;
      importButton.disabled = true;
      importButton.textContent = "Abriendo RAC…";
      try {
        const payload = await buildPayload({
          received: messages.find((message) => message.id === receivedId),
          response: messages.find((message) => message.id === responseId),
          isDelegated: delegatedInput.checked,
          mailboxEmail: mailboxEmailInput.value,
          mailboxName: mailboxNameInput.value,
          delegateEmail: delegateEmailInput.value,
          delegationSource
        });
        const response = await sendMessage({ type: "RAC_IMPORT_OPEN", payload });
        if (!response?.ok) throw new Error(response?.error || "No se pudo transferir el intercambio.");
        working = false;
        close();
        showToast("El intercambio se transfirió al formulario RAC.", { kind: "success" });
      } catch (error) {
        errorBox.textContent = error instanceof Error ? error.message : "No se pudo validar el intercambio.";
        errorBox.hidden = false;
      } finally {
        working = false;
        importButton.disabled = false;
        importButton.textContent = "Importar intercambio";
      }
    });

    document.body.style.overflow = "hidden";
    renderMessages();
    updateDelegateFields();
  };

  const mountButton = (root) => {
    if (!(root instanceof HTMLElement)) return;
    if (root.dataset[BUTTON_MARKER] === "true" && root.querySelector(`.${BUTTON_CLASS}`)) return;

    const button = element("button", BUTTON_CLASS, "Seleccionar intercambio");
    button.type = "button";
    button.title = "Seleccionar la consulta recibida y su respuesta final";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openExchangeSelector(root);
    });

    adapter.getActionHost(root).appendChild(button);
    root.dataset[BUTTON_MARKER] = "true";
  };

  const scan = () => adapter.getExpandedMessages().forEach(mountButton);
  const scheduleScan = () => {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 250);
  };

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();

