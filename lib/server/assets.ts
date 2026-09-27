import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { hasStorage, localPersistenceAllowed } from "./config";
import { dataRoot } from "./store";
import { ApiError, digest } from "./security";

export type PrivateAsset = {
  key: string;
  mime: string;
  bytes: number;
  sha256: string;
};
function storage() {
  return hasStorage()
    ? new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      })
    : null;
}
function localPath(key: string) {
  if (
    !/^[a-zA-Z0-9_./-]+$/.test(key) ||
    key.includes("..") ||
    key.startsWith("/")
  )
    throw new ApiError(400, "Invalid asset key.");
  if (!localPersistenceAllowed())
    throw new ApiError(
      503,
      "Configure private R2 storage before saving on a production server.",
    );
  return path.join(dataRoot(), "assets", key);
}
export async function putAsset(
  key: string,
  body: Buffer,
  mime: string,
): Promise<PrivateAsset> {
  const client = storage();
  if (client)
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: mime,
        CacheControl: "private, no-store",
        IfNoneMatch: "*",
      }),
    );
  else {
    const file = localPath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, { flag: "wx", mode: 0o600 });
  }
  return { key, mime, bytes: body.byteLength, sha256: digest(body) };
}
export async function getAsset(asset: PrivateAsset): Promise<Buffer> {
  const client = storage();
  const bytes = client
    ? Buffer.from(
        await (
          await client.send(
            new GetObjectCommand({
              Bucket: process.env.R2_BUCKET,
              Key: asset.key,
            }),
          )
        ).Body!.transformToByteArray(),
      )
    : await readFile(localPath(asset.key));
  if (digest(bytes) !== asset.sha256)
    throw new ApiError(409, "Stored artwork integrity check failed.");
  return bytes;
}
export async function removeAsset(asset: PrivateAsset) {
  const client = storage();
  if (client)
    await client.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: asset.key,
      }),
    );
  else
    await unlink(localPath(asset.key)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
}
export async function signedAssetUrl(
  asset: PrivateAsset,
  downloadName?: string,
): Promise<string | null> {
  const client = storage();
  if (!client) return null;
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: asset.key,
      ResponseContentType: asset.mime,
      ResponseCacheControl: "private, no-store",
      ...(downloadName
        ? {
            ResponseContentDisposition: `attachment; filename="${downloadName.replace(/[^a-zA-Z0-9_.-]/g, "_")}"`,
          }
        : {}),
    }),
    { expiresIn: 60 },
  );
}
export async function signedUploadUrl(
  key: string,
  mime: string,
  bytes: number,
): Promise<string> {
  const client = storage();
  if (!client)
    throw new ApiError(503, "Direct uploads need private R2 storage.");
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: mime,
      ContentLength: bytes,
      IfNoneMatch: "*",
    }),
    { expiresIn: 120 },
  );
}
export async function readStagedObject(
  key: string,
  expectedBytes: number,
): Promise<Buffer> {
  const client = storage();
  if (!client)
    throw new ApiError(503, "Direct uploads need private R2 storage.");
  const head = await client.send(
    new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
  );
  if (
    !head.ContentLength ||
    head.ContentLength > 8 * 1024 * 1024 ||
    head.ContentLength !== expectedBytes
  )
    throw new ApiError(
      413,
      "The uploaded image size does not match its upload ticket.",
    );
  const response = await client.send(
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
  );
  if (response.ContentLength !== expectedBytes)
    throw new ApiError(409, "The staged image changed while saving.");
  return Buffer.from(await response.Body!.transformToByteArray());
}
export function decodeSource(dataUrl: string): { bytes: Buffer; mime: string } {
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      dataUrl,
    );
  if (!match)
    throw new ApiError(
      415,
      "Upload a JPG, PNG or WEBP image. Convert HEIC to JPEG first.",
    );
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 8 * 1024 * 1024 || bytes.length < 12)
    throw new ApiError(413, "Choose an image smaller than 8 MB.");
  const mime =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "image/jpeg"
      : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP"
          ? "image/webp"
          : "unknown";
  if (mime !== match[1])
    throw new ApiError(415, "The image contents do not match its format.");
  return { bytes, mime };
}
