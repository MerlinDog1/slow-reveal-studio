import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  signedUploadUrl,
  readStagedObject,
  removeAsset,
  decodeSource,
} from "./assets";
import { putRecord, getRecord, deleteRecord } from "./store";
import { ApiError, digest, newToken, tokenMatches } from "./security";
export type UploadTicket = {
  id: string;
  tokenHash: string;
  key: string;
  mime: string;
  bytes: number;
  expiresAt: string;
};
const ticketSchema = z
  .object({
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    bytes: z
      .number()
      .int()
      .min(12)
      .max(8 * 1024 * 1024),
  })
  .strict();
export async function createUpload(input: unknown) {
  const { mime, bytes } = ticketSchema.parse(input);
  const id = randomUUID();
  const token = newToken();
  const ticket: UploadTicket = {
    id,
    tokenHash: digest(token),
    key: `staging/${id}/original`,
    mime,
    bytes,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  const url = await signedUploadUrl(ticket.key, mime, bytes);
  await putRecord("uploads", id, ticket, true);
  return {
    uploadId: id,
    token,
    url,
    headers: { "Content-Type": mime, "If-None-Match": "*" },
    expiresAt: ticket.expiresAt,
  };
}
export async function uploadedSource(id: string, token: string) {
  const ticket = await getRecord<UploadTicket>("uploads", id);
  if (
    !ticket ||
    !tokenMatches(token, ticket.tokenHash) ||
    Date.parse(ticket.expiresAt) < Date.now()
  )
    throw new ApiError(404, "The private upload ticket is invalid or expired.");
  const bytes = await readStagedObject(ticket.key, ticket.bytes);
  return decodeSource(`data:${ticket.mime};base64,${bytes.toString("base64")}`);
}
export async function deleteUpload(id: string) {
  const ticket = await getRecord<UploadTicket>("uploads", id);
  if (!ticket) return;
  await removeAsset({
    key: ticket.key,
    mime: ticket.mime,
    bytes: ticket.bytes,
    sha256: "",
  });
  await deleteRecord("uploads", id);
}
