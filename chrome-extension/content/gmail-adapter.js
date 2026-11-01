(() => {
  "use strict";

  const SELECTORS = Object.freeze({
    messageRoots: ["div.adn.ads", "div.adn[role='listitem']"],
    body: ["div.a3s.aiL", "div.a3s"],
    sender: [
      ".gD[email]",
      "[email][data-hovercard-id]",
      "[data-hovercard-id*='@']",
    ],
    exactDate: [".g3[data-time]", ".g3 [data-time]", "[data-time]"],
    dateLabel: [
      ".g3[title]",
      ".g3[data-tooltip]",
      ".g3[aria-label]",
      ".g3",
      "time[datetime]",
    ],
    actionHost: [".gE.iv.gt", ".gH.acX", ".aju", ".gs"],
    subject: ["h2.hP", "[role='main'] h2"],
    attachment: [".aV3", ".aQH .aV3", "[download_url] [data-tooltip]"],
    delegatedIdentity: [
      "[data-tooltip*='sent by:' i]",
      "[data-tooltip*='enviado por:' i]",
      "[aria-label*='sent by:' i]",
      "[aria-label*='enviado por:' i]",
      "[title*='sent by:' i]",
      "[title*='enviado por:' i]",
      ".go",
    ],
    draftIndicator: [
      "[data-tooltip*='draft' i]",
      "[data-tooltip*='borrador' i]",
      "[aria-label*='draft' i]",
      "[aria-label*='borrador' i]",
    ],
  });

  const first = (scope, selectors) => {
    for (const selector of selectors) {
      const node = scope.querySelector(selector);
      if (node) return node;
    }
    return null;
  };

  const all = (scope, selectors) => {
    const result = new Set();
    selectors.forEach((selector) =>
      scope.querySelectorAll(selector).forEach((node) => result.add(node)),
    );
    return [...result];
  };

  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  };

  const cleanText = (value) =>
    (value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const extractEmail = (value) => {
    const match = cleanText(value).match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    );
    return match ? match[0].toLowerCase() : "";
  };

  const getExpandedMessages = () =>
    all(document, SELECTORS.messageRoots).filter((root) => {
      const body = first(root, SELECTORS.body);
      return isVisible(root) && !!body && isVisible(body);
    });

  const getActionHost = (root) => first(root, SELECTORS.actionHost) || root;

  const readIdentity = (root) => {
    const node = first(root, SELECTORS.sender);
    if (!node) return { email: "", name: "" };
    const email = extractEmail(
      node.getAttribute("email") ||
        node.getAttribute("data-hovercard-id") ||
        node.textContent,
    );
    const visibleName = cleanText(
      node.getAttribute("name") || node.textContent,
    );
    return { email, name: visibleName === email ? "" : visibleName };
  };

  const readDelegatedIdentity = (root, mailboxEmail) => {
    const candidates = new Set(all(root, SELECTORS.delegatedIdentity));
    root
      .querySelectorAll("[email], [data-hovercard-id*='@']")
      .forEach((identityNode) => {
        let contextNode = identityNode;
        for (
          let depth = 0;
          contextNode && contextNode !== root && depth < 4;
          depth += 1
        ) {
          const context = cleanText(
            [
              contextNode.getAttribute?.("data-tooltip"),
              contextNode.getAttribute?.("aria-label"),
              contextNode.getAttribute?.("title"),
              contextNode.textContent,
            ]
              .filter(Boolean)
              .join(" "),
          );
          if (/(?:sent by|enviad[oa] por)/i.test(context))
            candidates.add(contextNode);
          contextNode = contextNode.parentElement;
        }
      });

    for (const node of candidates) {
      const value = [
        node.getAttribute("email"),
        node.getAttribute("data-hovercard-id"),
        node.getAttribute("data-tooltip"),
        node.getAttribute("aria-label"),
        node.getAttribute("title"),
        node.textContent,
      ]
        .filter(Boolean)
        .join(" ");
      const labelMatch = value.match(/(?:sent by|enviad[oa] por)\s*:?/i);
      if (!labelMatch) continue;

      const delegatedText = value.slice(
        (labelMatch.index || 0) + labelMatch[0].length,
      );
      const email = extractEmail(delegatedText) || extractEmail(value);
      if (email && email !== mailboxEmail) {
        return { email };
      }
    }
    return { email: "" };
  };

  const MONTHS = Object.freeze({
    ene: 1,
    enero: 1,
    jan: 1,
    january: 1,
    feb: 2,
    febrero: 2,
    february: 2,
    mar: 3,
    marzo: 3,
    march: 3,
    abr: 4,
    abril: 4,
    apr: 4,
    april: 4,
    may: 5,
    mayo: 5,
    jun: 6,
    junio: 6,
    june: 6,
    jul: 7,
    julio: 7,
    july: 7,
    ago: 8,
    agosto: 8,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    setiembre: 9,
    septiembre: 9,
    september: 9,
    oct: 10,
    octubre: 10,
    october: 10,
    nov: 11,
    noviembre: 11,
    november: 11,
    dic: 12,
    diciembre: 12,
    dec: 12,
    december: 12,
  });

  const parseVisibleGmailDate = (rawLabel) => {
    const label = cleanText(rawLabel);
    if (!label) return "";

    const normalized = label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (
      /\b(hoy|ayer|today|yesterday|hace)\b/.test(normalized) ||
      /\b\d+\s+(?:minute|minutes|hour|hours|day|days)\s+ago\b/.test(normalized)
    )
      return "";

    const explicitDate = label.match(
      /\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:z|[+-]\d{2}:?\d{2})/i,
    )?.[0];
    if (explicitDate) {
      const parsed = new Date(explicitDate);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }

    const yearMatch = normalized.match(/\b((?:19|20)\d{2})\b/);
    const timeMatch = normalized.match(
      /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?(?=$|[\s,;)])/i,
    );
    const monthPattern = Object.keys(MONTHS)
      .sort((a, b) => b.length - a.length)
      .join("|");
    const monthMatch = normalized.match(
      new RegExp(`\\b(${monthPattern})\\b`, "i"),
    );
    if (!yearMatch || !timeMatch || !monthMatch) return "";

    const beforeMonth = normalized.slice(0, monthMatch.index);
    const afterMonth = normalized.slice(
      (monthMatch.index || 0) + monthMatch[0].length,
    );
    const dayMatch =
      beforeMonth.match(/(\d{1,2})(?:\s+de)?\s*$/) ||
      afterMonth.match(/^\s+(\d{1,2})\b/);
    if (!dayMatch) return "";

    const year = Number(yearMatch[1]);
    const month = MONTHS[monthMatch[1].toLowerCase()];
    const day = Number(dayMatch[1]);
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const second = Number(timeMatch[3] || 0);
    const meridiem = (timeMatch[4] || "").replace(/[.\s]/g, "").toLowerCase();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > lastDay || hour > 23 || minute > 59 || second > 59)
      return "";
    const pad = (value) => String(value).padStart(2, "0");
    const parsed = new Date(
      `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}-05:00`,
    );
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  };

  const readExactDate = (root) => {
    const labelNodes = all(root, SELECTORS.dateLabel);
    const label = cleanText(
      labelNodes
        .flatMap((node) => [
          node.getAttribute("title"),
          node.getAttribute("data-tooltip"),
          node.getAttribute("aria-label"),
          node.getAttribute("datetime"),
          node.textContent,
        ])
        .find((value) => parseVisibleGmailDate(value)) || "",
    );

    for (const node of all(root, SELECTORS.exactDate)) {
      const rawEpoch = node.getAttribute("data-time") || "";
      let epoch = Number(rawEpoch);
      if (Number.isFinite(epoch) && epoch > 0) {
        if (epoch < 10_000_000_000) epoch *= 1000;
        const date = new Date(epoch);
        if (!Number.isNaN(date.getTime())) {
          return {
            iso: date.toISOString(),
            source:
              `Encabezado Gmail data-time=${rawEpoch}${label ? `; visible: ${label}` : ""}`.slice(
                0,
                500,
              ),
          };
        }
      }
    }

    for (const node of labelNodes) {
      for (const candidate of [
        node.getAttribute("datetime"),
        node.getAttribute("title"),
        node.getAttribute("data-tooltip"),
        node.getAttribute("aria-label"),
        node.textContent,
      ]) {
        const iso = parseVisibleGmailDate(candidate);
        if (iso) {
          return {
            iso,
            source:
              `Fecha completa visible en Gmail; zona America/Lima: ${cleanText(candidate)}`.slice(
                0,
                500,
              ),
          };
        }
      }
    }
    return { iso: "", source: "" };
  };

  const readAttachments = (root) =>
    all(root, SELECTORS.attachment)
      .map((node) =>
        cleanText(
          node.getAttribute("data-tooltip") ||
            node.getAttribute("aria-label") ||
            node.textContent,
        ),
      )
      .filter(Boolean)
      .filter((name, index, values) => values.indexOf(name) === index)
      .slice(0, 50)
      .map((name) => ({ name: name.slice(0, 255) }));

  const readMessageKey = (root) =>
    cleanText(
      root.getAttribute("data-legacy-message-id") ||
        root.getAttribute("data-message-id") ||
        root
          .querySelector("[data-legacy-message-id]")
          ?.getAttribute("data-legacy-message-id") ||
        root
          .querySelector("[data-message-id]")
          ?.getAttribute("data-message-id"),
    );

  const isDraft = (root) => {
    if (first(root, SELECTORS.draftIndicator)) return true;
    const headerText = cleanText(
      first(root, SELECTORS.actionHost)?.textContent,
    ).toLowerCase();
    return /(^|\s)(draft|borrador)(\s|$)/i.test(headerText);
  };

  const extractMessage = (root, index) => {
    const bodyNode = first(root, SELECTORS.body);
    const subjectNode = first(document, SELECTORS.subject);
    const sender = readIdentity(root);
    const delegated = readDelegatedIdentity(root, sender.email);
    const exactDate = readExactDate(root);
    return {
      id: `gmail-message-${index}`,
      root,
      senderEmail: sender.email,
      senderName: sender.name,
      delegatedEmail: delegated.email,
      dateIso: exactDate.iso,
      dateSource: exactDate.source,
      subject: cleanText(subjectNode?.innerText || subjectNode?.textContent),
      body: cleanText(bodyNode?.innerText || bodyNode?.textContent),
      attachments: readAttachments(root),
      messageKey: readMessageKey(root),
      draft: isDraft(root),
    };
  };

  const getConversationUrl = () => {
    try {
      const url = new URL(window.location.href);
      return url.origin === "https://mail.google.com" ? url.href : "";
    } catch {
      return "";
    }
  };

  globalThis.RacGmailAdapter = Object.freeze({
    selectors: SELECTORS,
    getExpandedMessages,
    getActionHost,
    extractMessage,
    getConversationUrl,
  });
})();
