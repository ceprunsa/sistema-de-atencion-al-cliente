import type { EmailAttachmentMetadata } from "./index";

export interface GmailReceivedMessageImport {
  senderEmail: string;
  senderName: string;
  receivedAtIso: string;
  receivedAtSource: string;
  subject: string;
  body: string;
  attachments: EmailAttachmentMetadata[];
  messageKeyHash: string;
  fingerprint: string;
}

export interface GmailResponseMessageImport {
  respondedAtIso: string;
  respondedAtSource: string;
  body: string;
  mailboxEmail: string;
  mailboxName: string;
  isDelegated: boolean;
  delegateEmail: string | null;
  messageKeyHash: string;
}

export interface GmailAttentionImport {
  version: 2;
  received: GmailReceivedMessageImport;
  response: GmailResponseMessageImport;
  conversationUrl: string;
  exchangeFingerprint: string;
  warnings: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isString = (value: unknown, maximum: number, required = false): value is string =>
  typeof value === "string"
  && value.length <= maximum
  && (!required || value.trim().length > 0);

const isNullableString = (value: unknown, maximum: number) =>
  value === null || isString(value, maximum);

const isHash = (value: unknown) =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

const isEmail = (value: unknown) =>
  typeof value === "string"
  && isString(value, 254, true)
  && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);

const isIsoDate = (value: unknown): value is string =>
  typeof value === "string"
  && value.length <= 40
  && !Number.isNaN(Date.parse(value));

const isGmailUrl = (value: unknown) => {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    return new URL(value).origin === "https://mail.google.com";
  } catch {
    return false;
  }
};
export const isGmailAttentionImport = (value: unknown): value is GmailAttentionImport => {
  if (!isObject(value) || value.version !== 2) return false;
  if (!isObject(value.received) || !isObject(value.response)) return false;

  const received = value.received;
  const response = value.response;

  if (!isEmail(received.senderEmail)) return false;
  if (!isString(received.senderName, 250)) return false;
  if (!isIsoDate(received.receivedAtIso) || !isString(received.receivedAtSource, 500, true)) return false;
  if (!isString(received.subject, 1000) || !isString(received.body, 498000)) return false;
  if (!received.subject.trim() && !received.body.trim()) return false;
  if (!Array.isArray(received.attachments) || received.attachments.length > 50) return false;
  if (!received.attachments.every((item) => isObject(item)
    && isString(item.name, 255, true)
    && isNullableString(item.sizeLabel ?? null, 100)
    && isNullableString(item.typeLabel ?? null, 100))) return false;
  if (!isHash(received.messageKeyHash) || !isHash(received.fingerprint)) return false;

  if (!isIsoDate(response.respondedAtIso) || !isString(response.respondedAtSource, 500, true)) return false;
  if (Date.parse(response.respondedAtIso) <= Date.parse(received.receivedAtIso)) return false;
  if (!isString(response.body, 500000, true)) return false;
  if (!isEmail(response.mailboxEmail) || !isString(response.mailboxName, 250)) return false;
  if (typeof response.isDelegated !== "boolean") return false;
  if (!isNullableString(response.delegateEmail, 254)) return false;
  if (response.isDelegated && !isEmail(response.delegateEmail)) return false;
  if (!response.isDelegated && response.delegateEmail !== null) return false;
  if (!isHash(response.messageKeyHash)) return false;

  if (!isGmailUrl(value.conversationUrl) || !isHash(value.exchangeFingerprint)) return false;
  if (!Array.isArray(value.warnings) || value.warnings.length > 10
    || !value.warnings.every((item) => isString(item, 300))) return false;
  return true;
};
