import type { EmailAttachmentMetadata } from "./index";

export interface GmailAttentionImport {
  version: 1;
  senderEmail: string;
  senderName: string;
  receivedAtIso: string | null;
  receivedAtDisplay: string | null;
  subject: string;
  body: string;
  attachments: EmailAttachmentMetadata[];
  messageKeyHash: string | null;
  fingerprint: string;
  warnings: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isOptionalString = (value: unknown, maximum: number) =>
  value === null || (typeof value === "string" && value.length <= maximum);

export const isGmailAttentionImport = (value: unknown): value is GmailAttentionImport => {
  if (!isObject(value) || value.version !== 1) return false;
  if (typeof value.senderEmail !== "string" || value.senderEmail.length > 254) return false;
  if (typeof value.senderName !== "string" || value.senderName.length > 250) return false;
  if (!isOptionalString(value.receivedAtIso, 40) || !isOptionalString(value.receivedAtDisplay, 200)) return false;
  if (typeof value.subject !== "string" || value.subject.length > 1000) return false;
  if (typeof value.body !== "string" || value.body.length > 498000) return false;
  if (!Array.isArray(value.attachments) || value.attachments.length > 50) return false;
  if (!value.attachments.every((item) => isObject(item)
    && typeof item.name === "string"
    && item.name.trim().length > 0
    && isOptionalString(item.sizeLabel ?? null, 100)
    && isOptionalString(item.typeLabel ?? null, 100))) return false;
  if (value.messageKeyHash !== null && (typeof value.messageKeyHash !== "string" || !/^[0-9a-f]{64}$/.test(value.messageKeyHash))) return false;
  if (typeof value.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(value.fingerprint)) return false;
  if (!Array.isArray(value.warnings) || !value.warnings.every((item) => typeof item === "string" && item.length <= 300)) return false;
  return !!(value.subject.trim() || value.body.trim());
};
